import hljs from 'highlight.js/lib/common'
import { Check, Copy } from 'lucide-react'
import { useMemo } from 'react'

import { LineGutter } from '@/components/line-gutter'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'
import { useLineGutter } from '@/composable/use-line-gutter'
import { cn } from '@/lib/utils'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

interface TextareaCopyableProps {
  value: string
  /** 只读代码输出的行数提示（影响最小高度） */
  rows?: number
  /** 是否用 highlight.js 高亮（需传 language） */
  highlight?: boolean
  /** highlight.js 语言标识，如 'json'、'xml' */
  language?: string
  className?: string
  placeholder?: string
  /** 复制按钮交给外层卡片头部承载时关掉内置按钮 */
  hideCopyButton?: boolean
  /** 左侧行号槽；开启后长行不再软换行，保证行号逐行对齐 */
  showLineNumbers?: boolean
}

/** 只读输出区 + 右上角复制按钮（it-tools TextareaCopyable 的 shadcn 版） */
export function TextareaCopyable({
  value,
  rows = 6,
  highlight = false,
  language,
  className,
  placeholder,
  hideCopyButton = false,
  showLineNumbers = false,
}: TextareaCopyableProps) {
  const { copy, isCopied } = useCopy()
  const { innerRef, syncScroll } = useLineGutter()

  const html = useMemo(() => {
    if (!highlight || !language) {
      return undefined
    }
    try {
      return hljs.highlight(value, { language }).value
    } catch {
      return escapeHtml(value)
    }
  }, [highlight, language, value])

  return (
    <div
      className={cn('bg-muted/40 relative flex overflow-hidden rounded-lg border', className)}
      style={{ minHeight: `calc(${rows} * 1.6rem + 1.5rem)` }}
    >
      {showLineNumbers && <LineGutter count={value.split('\n').length} innerRef={innerRef} />}
      <pre
        onScroll={
          showLineNumbers ? (event) => syncScroll(event.currentTarget.scrollTop) : undefined
        }
        className={cn(
          'h-full min-w-0 flex-1 overflow-auto p-3 text-sm leading-relaxed',
          html === undefined &&
            (showLineNumbers ? 'whitespace-pre' : 'break-all whitespace-pre-wrap'),
        )}
      >
        {html !== undefined ? (
          <code className="hljs bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          value || <span className="text-muted-foreground">{placeholder}</span>
        )}
      </pre>
      {!hideCopyButton && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="bg-background/80 absolute top-1.5 right-1.5 backdrop-blur"
          aria-label="copy"
          onClick={() => void copy(value)}
        >
          {isCopied(value) ? <Check className="text-primary" /> : <Copy />}
        </Button>
      )}
    </div>
  )
}
