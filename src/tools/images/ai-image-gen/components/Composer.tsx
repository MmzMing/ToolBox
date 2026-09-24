import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArrowUp,
  Eraser,
  ImagePlus,
  Images,
  Plus,
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

/** 一次生成最多带的参考图张数，识图一次最多提交的张数与它对齐 */
const MAX_REFERENCES = 4

type ComposerProps = {
  mode: 'gen' | 'reverse'
  onModeChange: (mode: 'gen' | 'reverse') => void
  prompt: string
  onPromptChange: (prompt: string) => void
  params: GenParams
  onParamsChange: (patch: Partial<GenParams>) => void
  references: ReferenceImage[]
  onReferencesChange: (references: ReferenceImage[]) => void
  /** 待识图的图片：提交后每张各自落成一对画布节点 */
  reverseImages: ReferenceImage[]
  onReverseImagesChange: (images: ReferenceImage[]) => void
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
    reverseImages,
    onReverseImagesChange,
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
  const [dropping, setDropping] = useState(false)

  const genApi = useAiImageGenStore((state) => state.genApi)
  const visionApi = useAiImageGenStore((state) => state.visionApi)

  const enabledSkills = skills.filter((skill) => skill.enabled)
  const activeSkillId = skillId || enabledSkills[0]?.id || ''
  const genProvider = genApi.provider === 'gemini' ? 'gemini' : 'openai'
  const model = genApi.model || DEFAULT_IMAGE_MODEL[genProvider]

  const readFiles = async (files: FileList | null, limit: number) => {
    if (!files?.length || limit <= 0) {
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

  /** 粘贴与拖拽共用：按当前模式落到参考图列表或待识图列表 */
  const takeFiles = (files: FileList | null) => {
    const current = mode === 'gen' ? references : reverseImages
    void readFiles(files, MAX_REFERENCES - current.length).then((items) => {
      if (!items.length) {
        if (files?.length) {
          toast.error(t('ai-image-gen.canvas.importRejected', { count: files.length }))
        }
        return
      }
      const next = [...current, ...items].slice(0, MAX_REFERENCES)
      if (mode === 'gen') {
        onReferencesChange(next)
      } else {
        onReverseImagesChange(next)
      }
    })
  }

  const canSend = mode === 'gen' ? !!prompt.trim() : reverseImages.length > 0

  const handlePaste = (event: React.ClipboardEvent) => {
    const hasImage = Array.from(event.clipboardData.items).some((item) =>
      item.type.startsWith('image/'),
    )
    if (!hasImage) {
      return
    }
    event.preventDefault()
    takeFiles(event.clipboardData.files)
  }

  const draggingFiles = (event: React.DragEvent) =>
    event.dataTransfer?.types.includes('Files') ?? false

  /** 一键清空：文字与两种模式下的图片一起归零 */
  const hasContent =
    !!prompt.trim() || references.length > 0 || (mode === 'reverse' && reverseImages.length > 0)

  const clearAll = () => {
    onPromptChange('')
    onReferencesChange([])
    onReverseImagesChange([])
  }

  return (
    <div
      className="border-border bg-card/70 relative shrink-0 rounded-2xl border p-3 shadow-lg backdrop-blur-xl"
      onPaste={handlePaste}
      onDragOver={(event) => {
        if (!draggingFiles(event)) {
          return
        }
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Element | null)) {
          return
        }
        setDropping(false)
      }}
      onDrop={(event) => {
        if (!draggingFiles(event)) {
          return
        }
        event.preventDefault()
        setDropping(false)
        takeFiles(event.dataTransfer.files)
      }}
    >
      {dropping ? (
        <div className="border-primary/70 bg-primary/5 pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-xl border-2 border-dashed">
          <p className="text-primary text-xs font-medium">
            {t(`ai-image-gen.composer.drop${mode === 'gen' ? 'Reference' : 'Image'}`)}
          </p>
        </div>
      ) : null}
      {mode === 'gen' ? (
        <>
          <ImageThumbs
            items={references}
            onRemove={(id) => onReferencesChange(references.filter((item) => item.id !== id))}
          />
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
            multiple
            className="hidden"
            onChange={(event) => {
              takeFiles(event.target.files)
              if (reverseFileRef.current) {
                reverseFileRef.current.value = ''
              }
            }}
          />
          {reverseImages.length ? (
            <ImageThumbs
              items={reverseImages}
              onRemove={(id) =>
                onReverseImagesChange(reverseImages.filter((item) => item.id !== id))
              }
              onAdd={() => reverseFileRef.current?.click()}
            />
          ) : (
            <button
              type="button"
              onClick={() => reverseFileRef.current?.click()}
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
                void readFiles(event.target.files, MAX_REFERENCES).then((items) => {
                  onReferencesChange([...references, ...items].slice(0, MAX_REFERENCES))
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

        {hasContent ? (
          <BarTooltip label={t('ai-image-gen.composer.clearAll')}>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-8"
              aria-label={t('ai-image-gen.composer.clearAll')}
              onClick={clearAll}
            >
              <Eraser className="size-4" />
            </Button>
          </BarTooltip>
        ) : null}

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

/** 输入框上方的缩略图行：参考图与待识图共用，叉号回写各自的列表，末尾可挂一个「再加一张」 */
function ImageThumbs({
  items,
  onRemove,
  onAdd,
}: {
  items: ReferenceImage[]
  onRemove: (id: string) => void
  onAdd?: () => void
}) {
  const { t } = useTranslation('tools-images')
  if (!items.length) {
    return null
  }
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.id} className="relative">
          <img
            src={item.dataUrl}
            alt={item.name}
            className="size-10 rounded-md border object-cover"
          />
          <button
            type="button"
            aria-label={t('ai-image-gen.composer.removeImage')}
            className="bg-background text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 rounded-full border p-0.5"
            onClick={() => onRemove(item.id)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {onAdd ? (
        <button
          type="button"
          aria-label={t('ai-image-gen.reverse.add')}
          onClick={onAdd}
          className="border-input text-muted-foreground hover:border-primary/60 hover:text-foreground flex size-10 items-center justify-center rounded-md border border-dashed transition-colors"
        >
          <Plus className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
