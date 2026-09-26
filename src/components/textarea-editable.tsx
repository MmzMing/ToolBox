import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react'

import { LineGutter } from '@/components/line-gutter'
import { Textarea } from '@/components/ui/textarea'
import { useLineGutter } from '@/composable/use-line-gutter'
import { cn } from '@/lib/utils'
import { caretFromOffset, countLines, type CaretPosition } from '@/utils/text-caret'

interface TextareaEditableProps {
  /** 外部权威值（清空 / 粘贴 / 覆盖源文本 / 撤销等程序化改写） */
  value: string
  onValueChange?: (value: string) => void
  placeholder?: string
  /** 附加到 textarea 本身的类名 */
  className?: string
  /** 外层 flex 容器类名（需要撑满高度时传 `min-h-0 flex-1` 之类） */
  containerClassName?: string
  /** 行号槽类名 */
  gutterClassName?: string
  /**
   * 停笔多少毫秒后才把值上报给父级。>0 时编辑态只存在组件内部：
   * 连续输入期间父级完全不重渲染，停笔（或失焦）才同步一次。
   * 0 表示每次输入立即上报，行为与普通受控 textarea 一致。
   */
  deferMs?: number
  /** 光标行列变化回调；不传则不跟踪，省掉每次输入一次状态更新 */
  onCaretChange?: (caret: CaretPosition) => void
  /** 无障碍名称；标题写在卡片头、不在同一节点上时用它把标签挂到输入框 */
  ariaLabel?: string
  /** 透传 textarea 节点，便于外部读取「尚未上报的最新文本」 */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  autoFocus?: boolean
}

/**
 * 可编辑文本域：自带行号槽与光标行列跟踪。
 *
 * 与普通受控 textarea 的关键差别是「谁持有编辑态」——输入期间值只落在组件内部，
 * 停笔才上报父级。这样连续输入不会触发父级整棵子树重渲染，也就不会连带重新排版
 * 右侧输出区的整段文本（文本类工具最主要的卡顿来源）。
 *
 * 中文输入法合成期间不做任何状态更新：一旦重渲染，React 会把受控 value 写回 textarea，
 * Chrome 会当场丢掉未上屏的合成串（表现为候选框弹着、字却打不进去）。
 */
export const TextareaEditable = memo(function TextareaEditable({
  value,
  onValueChange,
  placeholder,
  className,
  containerClassName,
  gutterClassName,
  deferMs = 0,
  onCaretChange,
  ariaLabel,
  textareaRef,
  autoFocus,
}: TextareaEditableProps) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const { innerRef: gutterRef, syncScroll } = useLineGutter()
  const [local, setLocal] = useState(value)
  const composingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<string | null>(null)
  const notifyRef = useRef(onValueChange)
  const caretRef = useRef(onCaretChange)
  const lastCaretRef = useRef<CaretPosition>({ line: 1, column: 1 })

  useEffect(() => {
    notifyRef.current = onValueChange
    caretRef.current = onCaretChange
  }, [onValueChange, onCaretChange])

  // 外部值变化时回灌本地。只在 props 真的变了才动，所以延迟上报期间依然滞后的
  // props 不会覆盖用户正在敲的内容；值相同时 setLocal 会被 React 直接跳过（不多一次渲染）。
  useLayoutEffect(() => {
    setLocal((current) => (current === value ? current : value))
  }, [value])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** 上报待发送的值；期间若被外部改写（清空 / 粘贴 / 覆盖源文本）则丢弃，避免把旧内容写回去 */
  const flush = useCallback(() => {
    clearTimer()
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending === null || innerRef.current?.value !== pending) {
      return
    }
    notifyRef.current?.(pending)
  }, [clearTimer])

  // 卸载前把还没上报的编辑送出去，别让最后几个字丢掉
  useEffect(() => flush, [flush])

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value
      setLocal(next)
      if (deferMs <= 0) {
        notifyRef.current?.(next)
        return
      }
      pendingRef.current = next
      clearTimer()
      timerRef.current = window.setTimeout(flush, deferMs)
    },
    [clearTimer, deferMs, flush],
  )

  /** 只读光标的活：位置没变就什么都不做，避免纯无效重渲染 */
  const syncCaret = useCallback(() => {
    const notify = caretRef.current
    if (composingRef.current || notify === undefined) {
      return
    }
    const element = innerRef.current
    if (element === null) {
      return
    }
    const next = caretFromOffset(element.value, element.selectionStart)
    const last = lastCaretRef.current
    if (next.line === last.line && next.column === last.column) {
      return
    }
    lastCaretRef.current = next
    notify(next)
  }, [])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    syncCaret()
  }, [syncCaret])

  const attachRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (textareaRef) {
        textareaRef.current = node
      }
    },
    [textareaRef],
  )

  return (
    <div className={cn('flex h-full min-h-0', containerClassName)}>
      <LineGutter count={countLines(local)} innerRef={gutterRef} className={gutterClassName} />
      <Textarea
        ref={attachRef}
        value={local}
        wrap="off"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={flush}
        onScroll={(event) => syncScroll(event.currentTarget.scrollTop)}
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onFocus={syncCaret}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        className={cn(
          'field-sizing-fixed h-full min-h-0 w-full flex-1 resize-none rounded-none border-0 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0',
          className,
        )}
      />
    </div>
  )
})
