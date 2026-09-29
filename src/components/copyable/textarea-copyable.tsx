import hljs from 'highlight.js/lib/common'
import { Check, Copy } from 'lucide-react'
import { useMemo } from 'react'

import { LineGutter } from '@/components/line-gutter'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/composable/use-copy'
import { useLineGutter } from '@/composable/use-line-gutter'
import { countLines } from '@/utils/text-caret'
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

/**
 * 容器最小高度 = 行数 × 实际行高 + 上下内边距。
 * 正文是 `text-sm leading-relaxed`，行高 0.875rem × 1.625 = 1.421875rem；`p-3` 上下共 1.5rem。
 * 早先按 1.6rem/行 估算，每行多出 0.18rem，短内容时会在文字下方留出一条死白。
 */
const LINE_HEIGHT_REM = 1.421875
const PADDING_REM = 1.5

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
      style={{ minHeight: `calc(${rows} * ${LINE_HEIGHT_REM}rem + ${PADDING_REM}rem)` }}
    >
      {showLineNumbers && <LineGutter count={countLines(value)} innerRef={innerRef} />}
      <pre
        onScroll={
          showLineNumbers ? (event) => syncScroll(event.currentTarget.scrollTop) : undefined
        }
        className={cn(
          // 不能用 h-full：父级只有 max-height（auto 高度）时百分比高度解析成 auto，
          // 内容会撑破容器被 overflow-hidden 裁掉且不出滚动条；交给 flex 的 stretch 取高。
          'min-h-0 min-w-0 flex-1 overflow-auto p-3 text-sm leading-relaxed',
          // 行号槽要求一屏一行严格对齐，只能保持硬换行 + 横向滚动；其余情况一律软换行，
          // 高亮分支也不例外——否则单行长代码（如 Java 的 byte[] 字面量）会拖出一条横向滚动条
          showLineNumbers ? 'whitespace-pre' : 'break-all whitespace-pre-wrap',
        )}
      >
        {html !== undefined ? (
          // html-sanitized: html 出自 hljs.highlight，它逐字符转义输入；异常分支兜到 escapeHtml
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
