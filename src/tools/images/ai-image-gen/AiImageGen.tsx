import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useAIConfigStore } from '@/modules/ai/store'
import { bytesToDataUrl } from '@/utils/base64'

import { normalizeGenParams, type GenParams } from './ai-image-gen.service'
import { AiImageSettingsDialog } from './components/AiImageSettingsDialog'
import { Composer, type ReferenceImage, type ReverseImage } from './components/Composer'
import { ImageCard } from './components/ImageCard'
import { ImageLightbox } from './components/ImageLightbox'
import { ResultMasonry, type MasonryItem } from './components/ResultMasonry'
import { ReversePromptPanel } from './components/ReversePromptPanel'
import { SessionDock } from './components/SessionDock'
import { WorkspaceView, type SessionCardInfo } from './components/WorkspaceView'
import { buildExportZip, downloadZip } from './export-zip'
import { clearImages, deleteImage, isIdbAvailable, type ImageRecord } from './idb'
import {
  cancelJob,
  deleteJobImages,
  loadHistory,
  refreshPrompts,
  resolveImageConnection,
  retryJob,
  submitGeneration,
  submitReverse,
} from './orchestrator'
import { useAiImageGenStore } from './store'

const ratioOf = (aspect: string): number => {
  const [w, h] = aspect.split(':').map(Number)
  return w && h ? w / h : 1
}

export default function AiImageGen() {
  const { t } = useTranslation('tools-images')
  const enabled = useAIConfigStore((state) => state.enabled)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<'workspace' | 'chat'>('workspace')

  const jobs = useAiImageGenStore((state) => state.jobs)
  const history = useAiImageGenStore((state) => state.history)
  const hasMoreHistory = useAiImageGenStore((state) => state.hasMoreHistory)
  const selectionMode = useAiImageGenStore((state) => state.selectionMode)
  const toggleSelectionMode = useAiImageGenStore((state) => state.toggleSelectionMode)
  const selectedImageIds = useAiImageGenStore((state) => state.selectedImageIds)
  const toggleSelected = useAiImageGenStore((state) => state.toggleSelected)
  const clearSelection = useAiImageGenStore((state) => state.clearSelection)
  const removeFromHistory = useAiImageGenStore((state) => state.removeFromHistory)
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
    void loadHistory(true)
    void refreshPrompts()
  }, [])

  const connection = useMemo(() => resolveImageConnection(genApi), [genApi])

  const items: MasonryItem[] = useMemo(() => {
    const slotCards: MasonryItem[] = jobs.flatMap((job) =>
      job.kind === 'reverse'
        ? []
        : job.slots.map((slot) => ({
            key: slot.id,
            ratio: ratioOf(job.params.aspect),
            node: (
              <ImageCard
                item={{ kind: 'slot', job, slot }}
                selectionMode={selectionMode}
                selected={false}
                onToggleSelect={() => {}}
                onOpen={setLightbox}
                onRetry={retryJob}
                onCancel={cancelJob}
                onReference={(record) => void addReference(record, setReferences, references)}
                onRemix={(record) => {
                  setPrompt(record.meta.prompt)
                  setParams(normalizeGenParams(record.meta.params))
                }}
                onDelete={() => void deleteJobImages(job.id)}
              />
            ),
          })),
    )
    const historyCards: MasonryItem[] = history.map((record) => ({
      key: record.id,
      ratio: ratioOf(record.meta.params.aspect),
      node: (
        <ImageCard
          item={{ kind: 'image', record }}
          selectionMode={selectionMode}
          selected={selectedImageIds.includes(record.id)}
          onToggleSelect={() => toggleSelected(record.id)}
          onOpen={setLightbox}
          onRetry={retryJob}
          onCancel={cancelJob}
          onReference={(item) => void addReference(item, setReferences, references)}
          onRemix={(item) => {
            setPrompt(item.meta.prompt)
            setParams(normalizeGenParams(item.meta.params))
          }}
          onDelete={() => void deleteImage(record.id).then(() => removeFromHistory(record.id))}
        />
      ),
    }))
    return [...slotCards, ...historyCards]
  }, [
    jobs,
    history,
    selectionMode,
    selectedImageIds,
    references,
    removeFromHistory,
    toggleSelected,
  ])

  const cards: SessionCardInfo[] = useMemo(() => {
    const byJob = new Map<string, SessionCardInfo>()
    for (const record of history) {
      const existing = byJob.get(record.meta.jobId)
      if (existing) {
        existing.count += 1
        existing.done += 1
      } else {
        byJob.set(record.meta.jobId, {
          jobId: record.meta.jobId,
          prompt: record.meta.prompt,
          createdAt: record.meta.createdAt,
          count: 1,
          done: 1,
          thumb: record,
        })
      }
    }
    for (const job of jobs) {
      if (job.kind !== 'gen') {
        continue
      }
      const done = job.slots.filter((slot) => slot.status === 'done').length
      const existing = byJob.get(job.id)
      if (existing) {
        existing.count = job.slots.length
        existing.done = done
      } else {
        byJob.set(job.id, {
          jobId: job.id,
          prompt: job.prompt,
          createdAt: job.createdAt,
          count: job.slots.length,
          done,
        })
      }
    }
    return [...byJob.values()].sort((a, b) => b.createdAt - a.createdAt)
  }, [jobs, history])

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
    await clearImages()
    await loadHistory(true)
  }, [])

  if (view === 'workspace') {
    return (
      <>
        <WorkspaceView cards={cards} onOpen={() => setView('chat')} />
        <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SessionDock
        selectionMode={selectionMode}
        hasSelection={selectedImageIds.length > 0}
        onBack={() => {
          clearSelection()
          setView('workspace')
        }}
        onToggleSelect={toggleSelectionMode}
        onExport={() => void handleExport()}
        onClearAll={() => void handleClearAll()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-12">
        {!enabled ? (
          <button
            type="button"
            className="border-destructive/40 bg-destructive/10 text-destructive mb-3 w-full rounded-md border p-2 text-left text-xs"
            onClick={() => setSettingsOpen(true)}
          >
            {t('ai-image-gen.composer.enableHint')}
          </button>
        ) : (
          !connection && (
            <p className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-md border p-2 text-xs">
              {t('ai-image-gen.composer.configHint')}
            </p>
          )
        )}
        <ResultMasonry
          items={items}
          hasMore={hasMoreHistory}
          onLoadMore={() => void loadHistory()}
        />
      </div>

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
        onParamsChange={(patch) =>
          setParams((current) => normalizeGenParams({ ...current, ...patch }))
        }
        references={references}
        onReferencesChange={setReferences}
        reverseImage={reverseImage}
        onReverseImageChange={setReverseImage}
        skills={skills}
        skillId={skillId}
        onSkillIdChange={setSkillId}
        onSubmit={handleSubmit}
        onOpenSettings={() => setSettingsOpen(true)}
        onInsertPrompt={(text) => {
          setPrompt(text)
          setMode('gen')
        }}
      />
      <ImageLightbox record={lightbox} onClose={() => setLightbox(null)} />
      <AiImageSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

async function addReference(
  record: ImageRecord,
  setReferences: (next: ReferenceImage[]) => void,
  current: ReferenceImage[],
) {
  const bytes = new Uint8Array(await record.blob.arrayBuffer())
  setReferences(
    [
      ...current,
      {
        id: record.id,
        dataUrl: bytesToDataUrl(bytes, record.mimeType),
        name: record.meta.prompt.slice(0, 20),
      },
    ].slice(0, 4),
  )
}
