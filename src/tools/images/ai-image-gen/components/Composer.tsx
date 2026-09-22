import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp,
  ImagePlus,
  Images,
  ScanSearch,
  Settings2,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AI_PROVIDER_DEFINITIONS, DEFAULT_IMAGE_MODEL } from '@/modules/ai/providers'
import { useAIConfigStore } from '@/modules/ai/store'
import { bytesToDataUrl } from '@/utils/base64'

import {
  apiReady,
  MAX_REFERENCE_BYTES,
  REFERENCE_MIMES,
  type GenParams,
} from '../ai-image-gen.service'
import { useAiImageGenStore } from '../store'
import type { Skill } from '../skills'
import { LibraryPopover } from './LibraryPopover'
import { ParamBar } from './ParamBar'
import { SkillPicker } from './SkillPicker'

export type ReferenceImage = { id: string; dataUrl: string; name: string }
export type ReverseImage = { dataUrl: string; name: string }

type ComposerProps = {
  mode: 'gen' | 'reverse'
  onModeChange: (mode: 'gen' | 'reverse') => void
  prompt: string
  onPromptChange: (prompt: string) => void
  params: GenParams
  onParamsChange: (patch: Partial<GenParams>) => void
  references: ReferenceImage[]
  onReferencesChange: (references: ReferenceImage[]) => void
  reverseImage: ReverseImage | null
  onReverseImageChange: (image: ReverseImage | null) => void
  skills: Skill[]
  skillId: string
  onSkillIdChange: (id: string) => void
  onSubmit: () => void
  onOpenSettings: () => void
  onInsertPrompt: (text: string) => void
}

export function Composer(props: ComposerProps) {
  const {
    mode,
    onModeChange,
    prompt,
    onPromptChange,
    params,
    onParamsChange,
    references,
    onReferencesChange,
    reverseImage,
    onReverseImageChange,
    skills,
    skillId,
    onSkillIdChange,
    onSubmit,
    onOpenSettings,
    onInsertPrompt,
  } = props
  const { t } = useTranslation('tools-images')
  const refFileRef = useRef<HTMLInputElement>(null)
  const reverseFileRef = useRef<HTMLInputElement>(null)

  const genApi = useAiImageGenStore((state) => state.genApi)
  const visionApi = useAiImageGenStore((state) => state.visionApi)
  const tested = useAiImageGenStore((state) => state.tested)
  const enabled = useAIConfigStore((state) => state.enabled)

  const enabledSkills = skills.filter((skill) => skill.enabled)
  const activeSkillId = skillId || enabledSkills[0]?.id || ''
  const genProvider = genApi.provider === 'gemini' ? 'gemini' : 'openai'
  const model = genApi.model || DEFAULT_IMAGE_MODEL[genProvider]
  const ready =
    mode === 'gen'
      ? apiReady(genApi, enabled, tested.gen)
      : apiReady(visionApi, enabled, tested.vision)

  const readFiles = async (files: FileList | null, limit: number) => {
    if (!files?.length) {
      return []
    }
    const next: ReferenceImage[] = []
    for (const file of Array.from(files)) {
      if (!REFERENCE_MIMES.includes(file.type) || file.size > MAX_REFERENCE_BYTES) {
        continue
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        dataUrl: bytesToDataUrl(bytes, file.type),
        name: file.name,
      })
    }
    return next.slice(0, limit)
  }

  const canSend = mode === 'gen' ? !!prompt.trim() : !!reverseImage

  const handlePaste = (event: React.ClipboardEvent) => {
    const hasImage = Array.from(event.clipboardData.items).some((item) =>
      item.type.startsWith('image/'),
    )
    if (!hasImage) {
      return
    }
    event.preventDefault()
    void readFiles(event.clipboardData.files, mode === 'gen' ? 4 : 1).then((items) => {
      if (mode === 'gen') {
        onReferencesChange([...references, ...items].slice(0, 4))
      } else if (items[0]) {
        onReverseImageChange({ dataUrl: items[0].dataUrl, name: items[0].name })
      }
    })
  }

  return (
    <div
      className="bg-card/70 shrink-0 rounded-2xl p-3 shadow-lg backdrop-blur-xl"
      onPaste={handlePaste}
    >
      {mode === 'gen' ? (
        <>
          {references.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {references.map((reference) => (
                <div key={reference.id} className="relative">
                  <img
                    src={reference.dataUrl}
                    alt={reference.name}
                    className="size-10 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t('ai-image-gen.composer.removeReference')}
                    className="bg-background text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
                    onClick={() =>
                      onReferencesChange(references.filter((item) => item.id !== reference.id))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={t('ai-image-gen.composer.placeholder')}
            className="max-h-40 min-h-14 resize-none overflow-y-auto border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
        </>
      ) : (
        <>
          <input
            ref={reverseFileRef}
            type="file"
            accept={REFERENCE_MIMES.join(',')}
            className="hidden"
            onChange={(event) => {
              void readFiles(event.target.files, 1).then((items) => {
                if (items[0]) {
                  onReverseImageChange({ dataUrl: items[0].dataUrl, name: items[0].name })
                }
                if (reverseFileRef.current) {
                  reverseFileRef.current.value = ''
                }
              })
            }}
          />
          {reverseImage ? (
            <div className="flex min-h-24 items-center gap-3">
              <div className="relative">
                <img
                  src={reverseImage.dataUrl}
                  alt={reverseImage.name}
                  className="size-20 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  aria-label={t('ai-image-gen.composer.removeReference')}
                  className="bg-background text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
                  onClick={() => onReverseImageChange(null)}
                >
                  <X className="size-3" />
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground gap-1 text-xs"
                onClick={() => reverseFileRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {t('ai-image-gen.reverse.replace')}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => reverseFileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void readFiles(event.dataTransfer.files, 1).then((items) => {
                  if (items[0]) {
                    onReverseImageChange({ dataUrl: items[0].dataUrl, name: items[0].name })
                  }
                })
              }}
              className="border-input text-muted-foreground hover:border-primary/60 hover:text-foreground flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed transition-colors"
            >
              <Upload className="size-5" />
              <span className="text-xs">{t('ai-image-gen.reverse.dropzone')}</span>
              <span className="text-[10px]">{t('ai-image-gen.reverse.dropHint')}</span>
            </button>
          )}
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border p-0.5">
          <ModeButton
            active={mode === 'gen'}
            label={t('ai-image-gen.mode.gen')}
            onClick={() => onModeChange('gen')}
          >
            <Images className="size-3.5" />
          </ModeButton>
          <ModeButton
            active={mode === 'reverse'}
            label={t('ai-image-gen.mode.reverse')}
            onClick={() => onModeChange('reverse')}
          >
            <ScanSearch className="size-3.5" />
          </ModeButton>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 max-w-56 gap-1.5 rounded-full px-3 text-xs"
              title={t('ai-image-gen.params.advanced')}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  ready ? 'bg-primary' : 'bg-destructive',
                )}
              />
              <SlidersHorizontal className="size-3.5 shrink-0" />
              <span className="truncate">
                {mode === 'gen'
                  ? `${AI_PROVIDER_DEFINITIONS[genProvider].name} · ${model} · ${
                      params.aspect === 'auto' ? t('ai-image-gen.params.aspectAuto') : params.aspect
                    } · ×${params.count}`
                  : `${AI_PROVIDER_DEFINITIONS[visionApi.provider].name} · ${
                      visionApi.model || t('ai-image-gen.reverse.visionModel')
                    }`}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start" side="top">
            <ParamBar mode={mode} params={params} onParamsChange={onParamsChange} />
          </PopoverContent>
        </Popover>

        <LibraryPopover onInsert={onInsertPrompt} />

        {mode === 'reverse' && (
          <SkillPicker skillId={activeSkillId} onSkillIdChange={onSkillIdChange} />
        )}

        {mode === 'gen' && (
          <>
            <input
              ref={refFileRef}
              type="file"
              accept={REFERENCE_MIMES.join(',')}
              multiple
              className="hidden"
              onChange={(event) => {
                void readFiles(event.target.files, 4).then((items) => {
                  onReferencesChange([...references, ...items].slice(0, 4))
                  if (refFileRef.current) {
                    refFileRef.current.value = ''
                  }
                })
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
              title={t('ai-image-gen.composer.addReference')}
              onClick={() => refFileRef.current?.click()}
            >
              <ImagePlus className="size-3.5" />
              <span className="hidden sm:inline">{t('ai-image-gen.composer.addReference')}</span>
            </Button>
          </>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8"
          title={t('ai-image-gen.toolbar.settings')}
          aria-label={t('ai-image-gen.toolbar.settings')}
          onClick={onOpenSettings}
        >
          <Settings2 className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-9 shrink-0 rounded-full"
          disabled={!canSend}
          onClick={onSubmit}
          aria-label={
            mode === 'gen' ? t('ai-image-gen.composer.send') : t('ai-image-gen.reverse.start')
          }
        >
          {mode === 'gen' ? <ArrowUp className="size-4" /> : <ScanSearch className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
