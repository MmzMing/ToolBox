import { Check, ClipboardPaste, Copy, Eraser } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { LineGutter } from '@/components/line-gutter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useCopy } from '@/composable/use-copy'
import { useLineGutter } from '@/composable/use-line-gutter'

interface IoCardProps {
  kind: 'input' | 'output'
  /** 标题，如「输入」 */
  title: string
  /** 括号里的格式标注，如 YAML */
  tag?: string
  value: string
  placeholder: string
  /** 输入卡的内容变更（输出卡只读，不传） */
  onValueChange?: (value: string) => void
  /** 输出卡的 highlight.js 语言 */
  language?: string
}

/**
 * 「输入 / 输出」文本卡：卡片头放标题与操作（粘贴、清空、复制），内容区撑满。
 * 成对使用即为左输入右输出的转换界面，窄屏自动堆叠。
 */
export function IoCard({
  kind,
  title,
  tag,
  value,
  placeholder,
  onValueChange,
  language,
}: IoCardProps) {
  const { t } = useTranslation('common')
  const { copy, isCopied } = useCopy()
  const { innerRef, syncScroll } = useLineGutter()
  const isInput = kind === 'input'

  const handlePaste = async () => {
    try {
      // 读剪贴板需要用户授权，被拒绝时退回手动粘贴
      onValueChange?.(await navigator.clipboard.readText())
    } catch {
      toast.error(t('pasteFailed'))
    }
  }

  return (
    <Card className="h-80 gap-0 p-0 xl:h-96">
      <CardHeader className="flex items-center justify-between gap-2 border-b pt-4">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {tag && <span className="text-muted-foreground text-xs font-normal">({tag})</span>}
        </CardTitle>
        <div className="flex shrink-0 items-center gap-1">
          {isInput ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handlePaste()}
                className="gap-1.5"
              >
                <ClipboardPaste className="size-4" />
                {t('paste')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={value === ''}
                onClick={() => onValueChange?.('')}
                className="gap-1.5"
              >
                <Eraser className="size-4" />
                {t('clear')}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={value === ''}
              onClick={() => void copy(value)}
              className="gap-1.5"
            >
              {isCopied(value) ? (
                <Check className="text-primary size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {t('copy')}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        {isInput ? (
          <div className="flex h-full min-h-0">
            <LineGutter
              count={value.split('\n').length}
              innerRef={innerRef}
              className="bg-transparent"
            />
            <Textarea
              value={value}
              wrap="off"
              onChange={(event) => onValueChange?.(event.target.value)}
              onScroll={(event) => syncScroll(event.currentTarget.scrollTop)}
              placeholder={placeholder}
              className="field-sizing-fixed h-full min-h-0 w-full flex-1 resize-none rounded-none border-0 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0"
              spellCheck={false}
            />
          </div>
        ) : (
          <TextareaCopyable
            value={value}
            rows={1}
            highlight
            language={language}
            hideCopyButton
            showLineNumbers
            placeholder={placeholder}
            className="h-full min-h-0 rounded-none border-0"
          />
        )}
      </CardContent>
    </Card>
  )
}
