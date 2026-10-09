import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  LEGACY_WORKSPACE_ID,
  nextWorkspaceNumber,
  normalizeGenParams,
  summarizeWorkspaces,
  type GenParams,
} from './ai-image-gen.service'
import { AiImageSettingsDialog } from './components/AiImageSettingsDialog'
import { ImageLightbox } from './components/ImageLightbox'
import { Rulers } from './components/Rulers'
import { ZoomBar } from './components/ZoomBar'
import { SessionDock } from './components/SessionDock'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { ImageCanvas, type CanvasInteraction } from './canvas/ImageCanvas'
import { buildExportZip, downloadZip } from './export-zip'
import { isIdbAvailable, type ImageRecord } from './idb'
import { useImageNotify } from './use-image-notify'
import {
  clearCanvasLayout,
  clearWorkspace,
  createWorkspace,
  ensureActiveWorkspace,
  loadCanvas,
  loadHistory,
  importImages,
  redoCanvas,
  refreshPrompts,
  removeWorkspace,
  resolveImageConnection,
  runVisionOnImage,
  undoCanvas,
} from './orchestrator'
import { useAiImageGenStore } from './store'

export default function AiImageGen() {
  const { t, i18n } = useTranslation('tools-images')
  const settingsOpen = useAiImageGenStore((state) => state.settingsOpen)
  const setSettingsOpen = useAiImageGenStore((state) => state.setSettingsOpen)
  const [interaction, setInteraction] = useState<CanvasInteraction>('select')
  const [createPromptSignal, setCreatePromptSignal] = useState(0)

  const jobs = useAiImageGenStore((state) => state.jobs)
  const history = useAiImageGenStore((state) => state.history)
  const workspaces = useAiImageGenStore((state) => state.workspaces)
  const imageOwners = useAiImageGenStore((state) => state.imageOwners)
  const activeWorkspaceId = useAiImageGenStore((state) => state.activeWorkspaceId)
  const setActiveWorkspace = useAiImageGenStore((state) => state.setActiveWorkspace)
  const selectedImageIds = useAiImageGenStore((state) => state.selectedImageIds)
  const clearSelection = useAiImageGenStore((state) => state.clearSelection)
  const genApi = useAiImageGenStore((state) => state.genApi)
  const sound = useAiImageGenStore((state) => state.sound)

  useImageNotify(sound)

  const [params, setParams] = useState<GenParams>(() => normalizeGenParams(null))
  const [lightbox, setLightbox] = useState<ImageRecord | null>(null)
  const booted = useRef(false)

  /** 自动命名按界面语言落进记录，落定后即为固定文本，之后切语言不会跟着改 */
  const autoName = useCallback(
    (number: number) => i18n.t('ai-image-gen.workspace.autoName', { number, ns: 'tools-images' }),
    [i18n],
  )

  useEffect(() => {
    if (booted.current || !isIdbAvailable()) {
      return
    }
    booted.current = true
    void ensureActiveWorkspace(autoName(1))
    void refreshPrompts()
  }, [autoName])

  // 开关存在 store 里（节点里的润色与识图也要拉它），离开页面时归位，免得下次进来还开着
  useEffect(() => () => setSettingsOpen(false), [setSettingsOpen])

  // Ctrl/⌘+Z 撤销、Ctrl/⌘+Shift+Z 或 ⌘++Z、Ctrl/⌘+Y 重做；焦点在输入控件里时不抢键
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return
      }
      const field = event.target instanceof HTMLElement ? event.target : null
      if (field && (field.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName))) {
        return
      }
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') {
        return
      }
      event.preventDefault()
      void (key === 'y' && !event.shiftKey ? redoCanvas() : undoCanvas())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const connection = useMemo(() => resolveImageConnection(genApi), [genApi])

  const workspaceCards = useMemo(
    () =>
      summarizeWorkspaces(
        workspaces,
        imageOwners,
        jobs.map((job) => ({
          workspaceId: job.workspaceId,
          active: job.status === 'queued' || job.status === 'running',
        })),
      ),
    [workspaces, imageOwners, jobs],
  )

  const canvasJobs = useMemo(
    () => jobs.filter((job) => job.workspaceId === (activeWorkspaceId ?? LEGACY_WORKSPACE_ID)),
    [jobs, activeWorkspaceId],
  )

  const applyParams = useCallback(
    (patch: Partial<GenParams>) =>
      setParams((current) => normalizeGenParams({ ...current, ...patch })),
    [],
  )
  const openSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen])

  const handleImportFiles = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      void importImages(files, position).then((result) => {
        if (result.accepted.length) {
          toast.success(t('ai-image-gen.canvas.imported', { count: result.accepted.length }))
        }
        if (result.rejected) {
          toast.error(t('ai-image-gen.canvas.importRejected', { count: result.rejected }))
        }
      })
    },
    [t],
  )

  /** 识图失败多半是缺凭证：toast 之外直接把设置弹窗拉起来，省用户一次找入口 */
  const handleVision = useCallback(
    (imageId: string, instruction: string) => {
      void runVisionOnImage(imageId, instruction).then((error) => {
        if (error) {
          toast.error(t(`ai-image-gen.errors.${error}`))
          setSettingsOpen(true)
        }
      })
    },
    [t, setSettingsOpen],
  )

  const handleExport = useCallback(async () => {
    const targets = selectedImageIds.length
      ? history.filter((record) => selectedImageIds.includes(record.id))
      : history
    if (!targets.length) {
      toast.error(t('ai-image-gen.zip.none'))
      return
    }
    toast.info(t('ai-image-gen.zip.preparing'))
    const blob = await buildExportZip(targets)
    await downloadZip(blob)
    toast.success(t('ai-image-gen.zip.done'))
    if (selectedImageIds.length) {
      clearSelection()
    }
  }, [history, selectedImageIds, clearSelection, t])

  const handleClearAll = useCallback(async () => {
    await clearWorkspace()
  }, [])

  /** 切区：先落活动 id 再拉数据，画布按 id 重挂，视口因此重新全览一次 */
  const handleActivate = useCallback(
    (id: string) => {
      if (id === activeWorkspaceId) {
        return
      }
      setActiveWorkspace(id)
      void Promise.all([loadHistory(), loadCanvas()])
    },
    [activeWorkspaceId, setActiveWorkspace],
  )

  const handleCreateWorkspace = useCallback(() => {
    void createWorkspace(autoName(nextWorkspaceNumber(workspaces.map((item) => item.name))))
  }, [autoName, workspaces])

  /** 关掉一个区即补位：删掉最后一个时默认工作区会被重新兜出来 */
  const handleCloseWorkspace = useCallback(
    (id: string) => {
      void removeWorkspace(id).then(() => ensureActiveWorkspace(autoName(1)))
    },
    [autoName],
  )

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <ReactFlowProvider>
        <SessionDock
          hasSelection={selectedImageIds.length > 0}
          interaction={interaction}
          onToggleInteraction={() => setInteraction((m) => (m === 'select' ? 'pan' : 'select'))}
          onAddPrompt={() => setCreatePromptSignal((signal) => signal + 1)}
          onExport={() => void handleExport()}
          onRelayout={() => void clearCanvasLayout()}
          onClearAll={() => void handleClearAll()}
          onImportFiles={handleImportFiles}
        />
        <Rulers />
        <ZoomBar />
        <ImageCanvas
          key={activeWorkspaceId ?? LEGACY_WORKSPACE_ID}
          records={history}
          jobs={canvasJobs}
          params={params}
          interaction={interaction}
          createPromptSignal={createPromptSignal}
          onImportFiles={handleImportFiles}
          onVision={handleVision}
          onParamsChange={applyParams}
          onOpenLightbox={setLightbox}
          onOpenSettings={openSettings}
        />
      </ReactFlowProvider>

      <WorkspaceSwitcher
        cards={workspaceCards}
        activeId={activeWorkspaceId}
        onActivate={handleActivate}
        onCreate={handleCreateWorkspace}
        onDelete={handleCloseWorkspace}
      />

      {/* 配置提示贴在顶栏：对话框已经挂到各节点底下了，底部不再占一整格。
          窄屏靠右，左边让开工作区卡片（w-40）、右边让开 dock（56px），否则三条会叠在一起 */}
      {!connection ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-end pr-14 md:top-(--shell-inset-top) md:justify-center md:pr-0">
          <button
            type="button"
            onClick={openSettings}
            className="border-destructive/60 bg-destructive/15 text-destructive pointer-events-auto w-fit max-w-[calc(100%-11rem)] rounded-xl border px-3 py-2 text-left text-xs break-words whitespace-normal backdrop-blur md:max-w-xl"
          >
            {t('ai-image-gen.hint.config')}
          </button>
        </div>
      ) : null}

      <ImageLightbox record={lightbox} onClose={() => setLightbox(null)} />
      <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
