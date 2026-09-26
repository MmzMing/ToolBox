import { Check, ClipboardPaste, Copy, Eraser, Maximize2 } from 'lucide-react'
import { useCallback, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { TextareaEditable } from '@/components/textarea-editable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useCopy } from '@/composable/use-copy'
import { cn } from '@/lib/utils'
import type { CaretPosition } from '@/utils/text-caret'

interface IoCardProps {
  kind: 'input' | 'output'
  /** 标题，如「输入」；开启 floatingActions 时不显示 */
  title?: string
  /** 括号里的格式标注，如 YAML */
  tag?: string
  value: string
  placeholder: string
  /** 输入卡的内容变更（输出卡只读，不传） */
  onValueChange?: (value: string) => void
  /** 输出卡的 highlight.js 语言 */
  language?: string
  /**
   * 卡片底部的状态条插槽（如行列与字符统计），不传则内容区撑满。
   * 传函数时注入输入框的实时光标行列——光标状态留在卡片内部，
   * 父级不会因为移动光标而重渲染。
   */
  footer?: ReactNode | ((caret: CaretPosition) => ReactNode)
  /** 省掉标题栏，把操作按钮悬浮到内容区右上角 */
  floatingActions?: boolean
  /** 传入则在操作组末尾加一个「全屏」按钮（放大编辑或查看大段结果），标签由调用方给 */
  fullscreen?: { onOpen: () => void; label: string }
  /**
   * 输入卡：停笔多少毫秒后才把值上报给父级。>0 时连续输入不触发父级重渲染；
   * 默认 0（每次输入立即上报），与受控 textarea 行为一致。
   */
  inputDeferMs?: number
  /** 输入卡的 textarea 节点，便于父级读取「尚未上报的最新文本」 */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  /** 高度交给外层容器决定（配合可拖拽分栏），而不是固定 h-80 */
  fillHeight?: boolean
}

/**
 * 「输入 / 输出」文本卡：默认卡片头放标题与操作（粘贴、清空、复制），内容区撑满。
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
  footer,
  floatingActions = false,
  fullscreen,
  inputDeferMs = 0,
  textareaRef,
  fillHeight = false,
}: IoCardProps) {
  const { t } = useTranslation('common')
  const { copy, isCopied } = useCopy()
  const [caret, setCaret] = useState<CaretPosition>({ line: 1, column: 1 })
  const isInput = kind === 'input'
  // 状态条不需要光标时不跟踪光标，省掉每次输入一次卡片重渲染
  const needsCaret = typeof footer === 'function'

  const handleCaretChange = useCallback((next: CaretPosition) => {
    setCaret(next)
  }, [])

  const handlePaste = async () => {
    try {
      // 读剪贴板需要用户授权，被拒绝时退回手动粘贴
      onValueChange?.(await navigator.clipboard.readText())
    } catch {
      toast.error(t('pasteFailed'))
    }
  }

  const actions = (
    <>
      {isInput ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => void handlePaste()} className="gap-1.5">
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
      {fullscreen && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fullscreen.onOpen}
          aria-label={fullscreen.label}
        >
          <Maximize2 className="size-4" />
        </Button>
      )}
    </>
  )

  return (
    <Card className={cn('relative gap-0 p-0', fillHeight ? 'h-full' : 'h-80 xl:h-96')}>
      {!floatingActions && (
        <CardHeader className="flex items-center justify-between gap-2 border-b pt-4">
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
            {title}
            {tag && <span className="text-muted-foreground text-xs font-normal">({tag})</span>}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </CardHeader>
      )}

      <CardContent className="min-h-0 flex-1 p-0">
        {isInput ? (
          <TextareaEditable
            value={value}
            onValueChange={onValueChange}
            placeholder={placeholder}
            deferMs={inputDeferMs}
            onCaretChange={needsCaret ? handleCaretChange : undefined}
            textareaRef={textareaRef}
            gutterClassName="bg-transparent"
          />
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

      {floatingActions && (
        <div className="bg-card/85 absolute top-1.5 right-1.5 z-10 flex items-center gap-1 rounded-lg px-1 backdrop-blur-sm">
          {tag && (
            <>
              <span className="text-muted-foreground px-1 text-xs font-normal">{tag}</span>
              <span className="bg-border h-3.5 w-px" aria-hidden="true" />
            </>
          )}
          {actions}
        </div>
      )}

      {footer && (
        <CardFooter className="gap-2 px-3 py-1.5 text-xs">
          {typeof footer === 'function' ? footer(caret) : footer}
        </CardFooter>
      )}
    </Card>
  )
}
