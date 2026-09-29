import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Square } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import {
  htmlToMarkdown,
  markdownToEditorHtml,
  markdownToPreviewHtml,
  runPolishStream,
} from '@/tools/resume/ai/polish'
import { toAIConnection } from '@/modules/ai/providers'
import type { AIModelProfile } from '@/modules/ai/providers'
import { aiErrorKey } from '@/components/ai/error-copy'

type AIPolishDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 字段的当前 HTML 值 */
  content: string
  model: AIModelProfile
  onApply: (html: string) => void
}

/**
 * AI 润色弹窗。
 *
 * 送出去的是 Markdown 而不是 HTML：模型对 Markdown 列表与粗体的遵循度远高于对
 * contenteditable 产出的嵌套 span，回写时再转回来。左右两栏都走转义后的预览渲染，
 * 「应用」回写的 HTML 再过一遍白名单消毒，模型吐出的原始 HTML 不会被执行。
 */
export function AIPolishDialog({
  open,
  onOpenChange,
  content,
  model,
  onApply,
}: AIPolishDialogProps) {
  const { t } = useTranslation('tools-resume')
  const [instructions, setInstructions] = useState('')
  const [result, setResult] = useState('')
  const [polishing, setPolishing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  const source = markdownToPreviewHtml(htmlToMarkdown(content))
  const preview = markdownToPreviewHtml(result)
  const hasResult = result.trim().length > 0

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setPolishing(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setResult('')
    setInstructions('')
  }, [stop])

  const handleOpenChange = (next: boolean) => {
    // 关窗即复位：留着半截流继续写 state 会打到已卸载的组件上
    if (!next) {
      reset()
    }
    onOpenChange(next)
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (polishing) {
      streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
    }
  }, [result, polishing])

  const start = async () => {
    const markdown = htmlToMarkdown(content)
    if (!markdown) {
      toast.error(t('resume.ai.polish.empty'))
      return
    }
    stop()
    const controller = new AbortController()
    abortRef.current = controller
    setResult('')
    setPolishing(true)
    let acc = ''
    try {
      for await (const delta of runPolishStream({
        connection: toAIConnection(model),
        markdown,
        customInstructions: instructions,
        signal: controller.signal,
      })) {
        acc += delta
        setResult(acc)
      }
      if (!acc.trim()) {
        toast.error(t('resume.ai.errors.emptyOutput'))
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(t(aiErrorKey(error)))
      }
    } finally {
      setPolishing(false)
      abortRef.current = null
    }
  }

  const apply = () => {
    onApply(markdownToEditorHtml(result))
    handleOpenChange(false)
    toast.success(t('resume.ai.polish.applied'))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[86svh] gap-4 overflow-y-auto sm:max-w-4xl"
        onEscapeKeyDown={(event) => polishing && event.preventDefault()}
        onInteractOutside={(event) => polishing && event.preventDefault()}
        onPointerDownOutside={(event) => polishing && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('resume.ai.polish.title')}</DialogTitle>
          <DialogDescription>
            {polishing
              ? t('resume.ai.polish.status.polishing')
              : hasResult
                ? t('resume.ai.polish.status.finished')
                : t('resume.ai.polish.status.ready')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-muted-foreground text-xs">{t('resume.ai.polish.original')}</span>
            <div
              className="border-border bg-muted/30 prose-resume max-h-72 overflow-y-auto rounded-lg border p-3 text-sm"
              // html-sanitized: source 由 markdownToPreviewHtml 生成，原始 HTML 全量转义、链接协议收紧到白名单
              dangerouslySetInnerHTML={{ __html: source }}
            />
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-muted-foreground text-xs">{t('resume.ai.polish.result')}</span>
            <div
              ref={streamRef}
              className="border-border bg-muted/30 prose-resume max-h-72 overflow-y-auto rounded-lg border p-3 text-sm"
              // html-sanitized: preview 与 source 同一条 markdownToPreviewHtml 通道
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-muted-foreground text-xs" htmlFor="polish-instructions">
            {t('resume.ai.polish.instructions')}
          </label>
          <Textarea
            id="polish-instructions"
            rows={2}
            value={instructions}
            disabled={polishing}
            placeholder={t('resume.ai.polish.instructionsPlaceholder')}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {polishing ? (
            <Button variant="outline" onClick={stop}>
              <Square className="size-4" />
              {t('resume.ai.polish.stop')}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void start()}>
              {hasResult ? t('resume.ai.polish.regenerate') : t('resume.ai.polish.start')}
            </Button>
          )}
          <Button onClick={apply} disabled={!hasResult || polishing}>
            {polishing && <Loader2 className="size-4 animate-spin" />}
            {t('resume.ai.polish.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
