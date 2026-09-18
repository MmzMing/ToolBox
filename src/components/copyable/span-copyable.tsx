import { Check, Copy } from 'lucide-react'

import { useCopy } from '@/composable/use-copy'
import { cn } from '@/lib/utils'

interface SpanCopyableProps {
  value: string
  className?: string
  /** 是否展示文案（默认展示，可只留图标） */
  showText?: boolean
}

/** 行内可复制片段：点击整体复制（it-tools SpanCopyable 的 shadcn 版） */
export function SpanCopyable({ value, className, showText = true }: SpanCopyableProps) {
  const { copy, isCopied } = useCopy()
  const copied = isCopied(value)

  return (
    <button
      type="button"
      title={value}
      onClick={() => void copy(value)}
      className={cn(
        'inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs transition-colors hover:bg-accent',
        className,
      )}
    >
      {showText && <span className="truncate">{value}</span>}
      {copied ? <Check className="size-3 shrink-0 text-primary" /> : <Copy className="size-3 shrink-0 text-muted-foreground" />}
    </button>
  )
}
