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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_IMAGE_MODEL } from '@/modules/ai/providers'
import { bytesToDataUrl } from '@/utils/base64'

import { MAX_REFERENCE_BYTES, REFERENCE_MIMES, type GenParams } from '../ai-image-gen.service'
import { useAiImageGenStore } from '../store'
import type { Skill } from '../skills'
import { LibraryPopover } from './LibraryPopover'
import { ParamBar } from './ParamBar'
import { SkillPicker } from './SkillPicker'

export type ReferenceImage = { id: string; dataUrl: string; name: string; imageId?: string }
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

  const enabledSkills = skills.filter((skill) => skill.enabled)
  const activeSkillId = skillId || enabledSkills[0]?.id || ''
  const genProvider = genApi.provider === 'gemini' ? 'gemini' : 'openai'
  const model = genApi.model || DEFAULT_IMAGE_MODEL[genProvider]

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
        <Popover>
          <BarTooltip label={t('ai-image-gen.params.advanced')}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 max-w-40 gap-1.5 rounded-full px-3 text-xs"
              >
                <SlidersHorizontal className="size-3.5 shrink-0" />
                <span className="truncate">
                  {mode === 'gen'
                    ? model
                    : visionApi.model || t('ai-image-gen.reverse.visionModel')}
                </span>
              </Button>
            </PopoverTrigger>
          </BarTooltip>
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
            <BarTooltip label={t('ai-image-gen.composer.addReference')}>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('ai-image-gen.composer.addReference')}
                onClick={() => refFileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
              </Button>
            </BarTooltip>
          </>
        )}

        <div className="flex-1" />

        <BarTooltip
          label={
            mode === 'gen'
              ? t('ai-image-gen.mode.switchToReverse')
              : t('ai-image-gen.mode.switchToGen')
          }
        >
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label={
              mode === 'gen'
                ? t('ai-image-gen.mode.switchToReverse')
                : t('ai-image-gen.mode.switchToGen')
            }
            onClick={() => onModeChange(mode === 'gen' ? 'reverse' : 'gen')}
          >
            {mode === 'gen' ? <ScanSearch className="size-4" /> : <Images className="size-4" />}
          </Button>
        </BarTooltip>
        <BarTooltip label={t('ai-image-gen.toolbar.settings')}>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8"
            aria-label={t('ai-image-gen.toolbar.settings')}
            onClick={onOpenSettings}
          >
            <Settings2 className="size-4" />
          </Button>
        </BarTooltip>
        <BarTooltip
          label={
            canSend
              ? t('ai-image-gen.composer.sendHint')
              : mode === 'gen'
                ? t('ai-image-gen.composer.needPrompt')
                : t('ai-image-gen.composer.needImage')
          }
        >
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
        </BarTooltip>
      </div>
    </div>
  )
}

/** 底栏按钮的统一悬浮提示：Radix 要求 Trigger 只包一个可聚焦子元素 */
function BarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
