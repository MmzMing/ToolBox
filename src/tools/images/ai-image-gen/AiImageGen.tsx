import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow, type ReactFlowInstance } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useAIConfigStore } from '@/modules/ai/store'
import { bytesToDataUrl } from '@/utils/base64'

import {
  CANVAS_GAP_X,
  CANVAS_IMAGE_WIDTH,
  CANVAS_PROMPT_HEIGHT,
  CANVAS_PROMPT_WIDTH,
  LEGACY_WORKSPACE_ID,
  nextWorkspaceNumber,
  normalizeGenParams,
  summarizeWorkspaces,
  type GenParams,
} from './ai-image-gen.service'
import { AiImageSettingsDialog } from './components/AiImageSettingsDialog'
import { Composer, type ReferenceImage } from './components/Composer'
import { ImageLightbox } from './components/ImageLightbox'
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
  refreshPrompts,
  removeWorkspace,
  resolveImageConnection,
  submitGeneration,
  submitReverse,
} from './orchestrator'
import { useAiImageGenStore } from './store'

export default function AiImageGen() {
  const { t, i18n } = useTranslation('tools-images')
  const enabled = useAIConfigStore((state) => state.enabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  const skills = useAiImageGenStore((state) => state.skills)
  const genApi = useAiImageGenStore((state) => state.genApi)
  const sound = useAiImageGenStore((state) => state.sound)

  useImageNotify(sound)

  const [prompt, setPrompt] = useState('')
  const [params, setParams] = useState<GenParams>(() => normalizeGenParams(null))
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [lightbox, setLightbox] = useState<ImageRecord | null>(null)
  const [mode, setMode] = useState<'gen' | 'reverse'>('gen')
  const [reverseImages, setReverseImages] = useState<ReferenceImage[]>([])
  const [skillId, setSkillId] = useState('')
  const flowRef = useRef<ReactFlowInstance | null>(null)
  const rememberFlow = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance
  }, [])
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

  const addReference = useCallback(async (record: ImageRecord) => {
    const bytes = new Uint8Array(await record.blob.arrayBuffer())
    setReferences((current) =>
      [
        ...current,
        {
          id: record.id,
          imageId: record.id,
          dataUrl: bytesToDataUrl(bytes, record.mimeType),
          name: record.meta.prompt.slice(0, 20),
        },
      ].slice(0, 4),
    )
  }, [])

  const applyParams = useCallback(
    (patch: Partial<GenParams>) =>
      setParams((current) => normalizeGenParams({ ...current, ...patch })),
    [],
  )
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const handleReference = useCallback(
    (record: ImageRecord) => void addReference(record),
    [addReference],
  )

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

  /** 视口中央的流坐标：Composer 在画布之外，落点只能借 useReactFlow 换算 */
  const canvasCenter = useCallback(() => {
    const rect = document.querySelector('.react-flow')?.getBoundingClientRect()
    const instance = flowRef.current
    if (!instance || !rect) {
      return { x: 0, y: 0 }
    }
    const point = instance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    return {
      x: point.x - (CANVAS_IMAGE_WIDTH + CANVAS_GAP_X + CANVAS_PROMPT_WIDTH) / 2,
      y: point.y - CANVAS_PROMPT_HEIGHT / 2,
    }
  }, [])

  const handleSubmit = () => {
    if (!enabled) {
      setSettingsOpen(true)
      return
    }
    if (mode === 'reverse') {
      if (!reverseImages.length) {
        return
      }
      const target = skillId || skills.find((skill) => skill.enabled)?.id || ''
      void submitReverse(reverseImages, target, canvasCenter()).then((error) => {
        if (error) {
          toast.error(t(`ai-image-gen.errors.${error}`))
          setSettingsOpen(true)
          return
        }
        setReverseImages([])
      })
      return
    }
    const trimmed = prompt.trim()
    if (!trimmed) {
      return
    }
    const error = submitGeneration(
      trimmed,
      params,
      references.map((reference) => reference.dataUrl),
      {
        refImageIds: references.flatMap((reference) => reference.imageId ?? []),
      },
    )
    if (error) {
      toast.error(t(`ai-image-gen.errors.${error}`))
      setSettingsOpen(true)
      return
    }
    setReferences([])
  }

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
        <FlowReady onReady={rememberFlow} />
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
        <ImageCanvas
          key={activeWorkspaceId ?? LEGACY_WORKSPACE_ID}
          records={history}
          jobs={canvasJobs}
          params={params}
          interaction={interaction}
          createPromptSignal={createPromptSignal}
          onImportFiles={handleImportFiles}
          onParamsChange={applyParams}
          onReference={handleReference}
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

      <div className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-3xl flex-col gap-2">
        {/* 配置提示贴在输入框上方：顶栏离手元操作太远，出图时看不见。
            底色用 destructive 淡染而非实色：项目没有 destructive-foreground 令牌，
            实色红底在亮主题下会拿近黑的继承色写字，细边框也无处可显 */}
        {!enabled ? (
          <button
            type="button"
            className="border-destructive/60 bg-destructive/15 text-destructive w-fit max-w-full self-center rounded-xl border px-3 py-2 text-left text-xs backdrop-blur"
            onClick={() => setSettingsOpen(true)}
          >
            {t('ai-image-gen.composer.enableHint')}
          </button>
        ) : !connection ? (
          <p className="border-destructive/60 bg-destructive/15 text-destructive w-fit max-w-full self-center rounded-xl border px-3 py-2 text-xs backdrop-blur">
            {t('ai-image-gen.composer.configHint')}
          </p>
        ) : null}
        <Composer
          mode={mode}
          onModeChange={setMode}
          prompt={prompt}
          onPromptChange={setPrompt}
          params={params}
          onParamsChange={applyParams}
          references={references}
          onReferencesChange={setReferences}
          reverseImages={reverseImages}
          onReverseImagesChange={setReverseImages}
          skills={skills}
          skillId={skillId}
          onSkillIdChange={setSkillId}
          onSubmit={handleSubmit}
          onOpenSettings={openSettings}
        />
      </div>

      <ImageLightbox record={lightbox} onClose={() => setLightbox(null)} />
      <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

/** 把 React Flow 实例交给外层：Composer 不在 Provider 内，落点换算要用到它 */
function FlowReady({ onReady }: { onReady: (instance: ReactFlowInstance) => void }) {
  const instance = useReactFlow()
  useEffect(() => onReady(instance), [instance, onReady])
  return null
}
