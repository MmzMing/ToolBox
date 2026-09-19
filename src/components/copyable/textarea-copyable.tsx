import hljs from 'highlight.js/lib/common'
import { Check, Copy } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'
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
}

/** 只读输出区 + 右上角复制按钮（it-tools TextareaCopyable 的 shadcn 版） */
export function TextareaCopyable({
  value,
  rows = 6,
  highlight = false,
  language,
  className,
  placeholder,
}: TextareaCopyableProps) {
  const { copy, isCopied } = useCopy()

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
      className={cn('bg-muted/40 relative overflow-hidden rounded-lg border', className)}
      style={{ minHeight: `calc(${rows} * 1.6rem + 1.5rem)` }}
    >
      {html !== undefined ? (
        <pre className="h-full overflow-auto p-3 text-sm leading-relaxed">
          <code className="hljs bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      ) : (
        <pre className="h-full overflow-auto p-3 text-sm leading-relaxed break-all whitespace-pre-wrap">
          {value || <span className="text-muted-foreground">{placeholder}</span>}
        </pre>
      )}
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
    </div>
  )
}
