import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useAIConfigStore } from '@/modules/ai/store'
import { bytesToDataUrl } from '@/utils/base64'

import {
  LEGACY_WORKSPACE_ID,
  normalizeGenParams,
  summarizeWorkspaces,
  type GenParams,
} from './ai-image-gen.service'
import { AiImageSettingsDialog } from './components/AiImageSettingsDialog'
import { Composer, type ReferenceImage, type ReverseImage } from './components/Composer'
import { ImageLightbox } from './components/ImageLightbox'
import { ReversePromptPanel } from './components/ReversePromptPanel'
import { SessionDock } from './components/SessionDock'
import { WorkspaceCreateDialog } from './components/WorkspaceCreateDialog'
import { WorkspaceView } from './components/WorkspaceView'
import { ImageCanvas, type CanvasInteraction } from './canvas/ImageCanvas'
import { buildExportZip, downloadZip } from './export-zip'
import { isIdbAvailable, type ImageRecord } from './idb'
import {
  clearCanvasLayout,
  clearWorkspace,
  createWorkspace,
  loadCanvas,
  loadHistory,
  loadWorkspaces,
  importImages,
  refreshPrompts,
  removeWorkspace,
  resolveImageConnection,
  submitGeneration,
  submitReverse,
} from './orchestrator'
import { useAiImageGenStore } from './store'

export default function AiImageGen() {
  const { t } = useTranslation('tools-images')
  const enabled = useAIConfigStore((state) => state.enabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [view, setView] = useState<'workspace' | 'canvas'>('workspace')
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

  const [prompt, setPrompt] = useState('')
  const [params, setParams] = useState<GenParams>(() => normalizeGenParams(null))
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [lightbox, setLightbox] = useState<ImageRecord | null>(null)
  const [mode, setMode] = useState<'gen' | 'reverse'>('gen')
  const [reverseImage, setReverseImage] = useState<ReverseImage | null>(null)
  const [skillId, setSkillId] = useState('')

  useEffect(() => {
    if (!isIdbAvailable()) {
      return
    }
    void Promise.all([loadWorkspaces(), loadHistory(), loadCanvas()])
    void refreshPrompts()
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

  const remix = useCallback((record: ImageRecord) => {
    setPrompt(record.meta.prompt)
    setParams(normalizeGenParams(record.meta.params))
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

  const backToWorkspace = useCallback(() => {
    clearSelection()
    setView('workspace')
  }, [clearSelection])

  const handleImportFiles = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      void importImages(files, position).then((result) => {
        if (result.accepted) {
          toast.success(t('ai-image-gen.canvas.imported', { count: result.accepted }))
        }
        if (result.rejected) {
          toast.error(t('ai-image-gen.canvas.importRejected', { count: result.rejected }))
        }
      })
    },
    [t],
  )

  const handleSubmit = () => {
    if (!enabled) {
      setSettingsOpen(true)
      return
    }
    if (mode === 'reverse') {
      if (!reverseImage) {
        return
      }
      const target = skillId || skills.find((skill) => skill.enabled)?.id || ''
      const error = submitReverse(reverseImage.dataUrl, target)
      if (error) {
        toast.error(t(`ai-image-gen.errors.${error}`))
        setSettingsOpen(true)
      }
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

  const openWorkspace = useCallback(
    async (id: string) => {
      setActiveWorkspace(id)
      await Promise.all([loadHistory(), loadCanvas()])
      setView('canvas')
    },
    [setActiveWorkspace],
  )

  const handleCreateWorkspace = useCallback((name: string, description: string) => {
    void createWorkspace(name, description).then(() => setView('canvas'))
  }, [])

  if (view === 'workspace') {
    return (
      <>
        <WorkspaceView
          cards={workspaceCards}
          onOpen={(id) => void openWorkspace(id)}
          onCreate={() => setCreateOpen(true)}
          onDelete={(id) => void removeWorkspace(id)}
        />
        <WorkspaceCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={handleCreateWorkspace}
        />
        <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    )
  }

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
        <ImageCanvas
          records={history}
          jobs={canvasJobs}
          params={params}
          interaction={interaction}
          createPromptSignal={createPromptSignal}
          onImportFiles={handleImportFiles}
          onParamsChange={applyParams}
          onReference={handleReference}
          onRemix={remix}
          onOpenLightbox={setLightbox}
          onOpenSettings={openSettings}
        />
      </ReactFlowProvider>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="bg-card/90 pointer-events-auto h-8 shrink-0 gap-1.5 rounded-full border px-3 text-xs shadow-lg backdrop-blur"
          onClick={backToWorkspace}
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">{t('ai-image-gen.dock.back')}</span>
        </Button>
        {!enabled ? (
          <button
            type="button"
            className="border-destructive/40 bg-destructive/90 text-destructive-foreground pointer-events-auto mx-auto max-w-2xl rounded-md border p-2 text-left text-xs backdrop-blur"
            onClick={() => setSettingsOpen(true)}
          >
            {t('ai-image-gen.composer.enableHint')}
          </button>
        ) : !connection ? (
          <p className="border-destructive/40 bg-destructive/90 text-destructive-foreground mx-auto max-w-2xl rounded-md border p-2 text-xs backdrop-blur">
            {t('ai-image-gen.composer.configHint')}
          </p>
        ) : null}
      </div>

      <div className="absolute right-3 bottom-3 left-3 z-10 mx-auto max-w-3xl">
        {mode === 'reverse' && (
          <ReversePromptPanel
            onInsertPrompt={(text) => {
              setPrompt(text)
              setMode('gen')
            }}
          />
        )}
        <Composer
          mode={mode}
          onModeChange={setMode}
          prompt={prompt}
          onPromptChange={setPrompt}
          params={params}
          onParamsChange={applyParams}
          references={references}
          onReferencesChange={setReferences}
          reverseImage={reverseImage}
          onReverseImageChange={setReverseImage}
          skills={skills}
          skillId={skillId}
          onSkillIdChange={setSkillId}
          onSubmit={handleSubmit}
          onOpenSettings={openSettings}
          onInsertPrompt={(text) => {
            setPrompt(text)
            setMode('gen')
          }}
        />
      </div>

      <ImageLightbox record={lightbox} onClose={() => setLightbox(null)} />
      <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
