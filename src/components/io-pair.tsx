import { memo, useDeferredValue, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useDefaultLayout } from 'react-resizable-panels'

import { TextareaCopyable } from '@/components/copyable/textarea-copyable'
import { IoCard } from '@/components/io-card'
import { TextareaEditable } from '@/components/textarea-editable'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useBreakpoint } from '@/composable/use-breakpoint'
import { useFillHeight } from '@/composable/use-fill-height'
import { cn } from '@/lib/utils'
import { countChars, countLines, type CaretPosition } from '@/utils/text-caret'

/** 全屏窗里编辑的是哪一侧 */
export type IoPairPane = 'input' | 'output'

/**
 * 输入上报的默认延迟（毫秒）。连续输入期间父级完全不重渲染，
 * 停笔（或失焦）才同步一次；需要「每键立刻出结果」的工具传 `deferMs: 0`。
 */
export const INPUT_SYNC_DELAY_MS = 120

/** 分栏比例存在这个 id 下，三个工具共用同一份偏好 */
const SPLIT_STORAGE_ID = 'io-pair-split'

/**
 * 窄屏（堆叠布局）下每张卡的固定高度。PC 不适用这个值——那边会按视窗剩余高度实测。
 */
const PANE_HEIGHT_CLASS = 'h-96 xl:h-[28rem]'

export interface IoPairSide {
  value: string
  placeholder: string
  /** 操作条左侧的格式标注，如 JSON / YAML */
  tag?: string
  /** 卡片上方的控件行（如格式选择），随该侧分栏宽度伸缩 */
  head?: ReactNode
  /** 底部状态条；不传则用内置的「行列 + 字符·行」轻量条 */
  footer?: ReactNode | ((caret: CaretPosition) => ReactNode)
}

export interface IoPairInput extends IoPairSide {
  onValueChange?: (value: string) => void
  /** 停笔多少毫秒后才上报父级 */
  deferMs?: number
  /** 透传 textarea，便于父级读取「尚未上报的最新文本」 */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

export interface IoPairOutput extends IoPairSide {
  /** highlight.js 语言标识，如 json / yaml */
  language?: string
}

interface IoPairProps {
  input: IoPairInput
  output: IoPairOutput
  /** 传入才在两侧出现「全屏」按钮 */
  fullscreenLabel?: string
  /** 全屏窗底部的补充信息（如统计摘要），按当前侧给 */
  fullscreenFooter?: (pane: IoPairPane) => ReactNode
  className?: string
}

/** 内置轻量状态条：左行列、右字符与行数。计数只在停笔后的渲染里跑一次 */
const PairStatus = memo(function PairStatus({
  value,
  caret,
}: {
  value: string
  caret?: CaretPosition
}) {
  const { t } = useTranslation('common')
  const deferred = useDeferredValue(value)
  const chars = useMemo(() => countChars(deferred), [deferred])
  const lines = useMemo(() => countLines(deferred), [deferred])

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span className="text-muted-foreground tabular-nums">
        {caret ? t('caretPosition', { line: caret.line, column: caret.column }) : '\u00a0'}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {t('charsAndLines', { chars, lines })}
      </span>
    </div>
  )
})

/**
 * 「输入 → 输出」双栏工作台：左可编辑、右只读，PC 可拖拽分栏、窄屏自动堆叠。
 *
 * 把两部分 UI 收在一处后，各工具只需给两段文本与业务控件：
 * 行号槽、粘贴 / 清空 / 复制 / 全屏、状态条、以及「输入停笔才上报」的
 * 性能策略都一致，不会再出现某个工具自己写一套受控 textarea 而卡顿。
 */
export function IoPair({
  input,
  output,
  fullscreenLabel,
  fullscreenFooter,
  className,
}: IoPairProps) {
  const { t } = useTranslation('common')
  const [pane, setPane] = useState<IoPairPane | null>(null)
  // PC 上左右并排且可拖拽调节，窄屏（有侧栏时两栏会挤）改成上下堆叠
  const isDesktop = useBreakpoint() === 'desktop'
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: SPLIT_STORAGE_ID,
    onlySaveAfterUserInteractions: true,
  })

  /**
   * PC 上让工作台撑满视窗剩余高度（接近全屏工作区）；实测逻辑与 text-diff 共用，
   * 见 composable/use-fill-height。
   */
  const { rootRef, height: paneHeight } = useFillHeight(isDesktop)

  const fullscreenOf = (target: IoPairPane) =>
    fullscreenLabel === undefined
      ? undefined
      : { onOpen: () => setPane(target), label: fullscreenLabel }

  const inputCard = (
    <IoCard
      kind="input"
      floatingActions
      fillHeight
      inputDeferMs={input.deferMs ?? INPUT_SYNC_DELAY_MS}
      textareaRef={input.textareaRef}
      fullscreen={fullscreenOf('input')}
      value={input.value}
      placeholder={input.placeholder}
      tag={input.tag}
      onValueChange={input.onValueChange}
      footer={input.footer ?? ((caret) => <PairStatus value={input.value} caret={caret} />)}
    />
  )

  const outputCard = (
    <IoCard
      kind="output"
      floatingActions
      fillHeight
      fullscreen={fullscreenOf('output')}
      value={output.value}
      placeholder={output.placeholder}
      tag={output.tag}
      language={output.language}
      footer={output.footer ?? <PairStatus value={output.value} />}
    />
  )

  // 带 head 时把控件行与卡片竖排，卡片吃掉剩余高度（min-h-0 防 flex 子项撑开父容器）
  const stack = (head: ReactNode, card: ReactNode) =>
    head === undefined ? (
      card
    ) : (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="shrink-0">{head}</div>
        <div className="min-h-0 flex-1">{card}</div>
      </div>
    )

  return (
    <>
      {isDesktop ? (
        <div
          ref={rootRef}
          className={cn(PANE_HEIGHT_CLASS, className)}
          style={paneHeight === null ? undefined : { height: paneHeight }}
        >
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            {/* 尺寸用「无单位字符串」：库把字符串按百分比、把数字按像素解释 */}
            <ResizablePanel defaultSize="50" minSize="25">
              {stack(input.head, inputCard)}
            </ResizablePanel>
            {/* 分隔线只留中间一截小竖线：平时不抢视线，鼠标移入/拖拽时高亮 */}
            <ResizableHandle
              withHandle
              aria-label={t('resizePanes')}
              className="[&>div]:bg-border hover:[&>div]:bg-primary focus-visible:[&>div]:bg-primary active:[&>div]:bg-primary mx-1.5 w-2 bg-transparent after:w-4 focus-visible:outline-none [&>div]:h-10 [&>div]:w-[3px] [&>div]:rounded-full [&>div]:transition-colors [&>div]:duration-150"
            />
            <ResizablePanel defaultSize="50" minSize="25">
              {stack(output.head, outputCard)}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className={cn('flex flex-col gap-4', className)}>
          <div className={PANE_HEIGHT_CLASS}>{stack(input.head, inputCard)}</div>
          <div className={PANE_HEIGHT_CLASS}>{stack(output.head, outputCard)}</div>
        </div>
      )}

      <Dialog open={pane !== null} onOpenChange={(open) => !open && setPane(null)}>
        <DialogContent className="flex h-[86svh] w-[calc(100%-2rem)] max-w-none flex-col gap-3 sm:max-w-none">
          <DialogTitle className="text-sm font-medium">
            {t(pane === 'output' ? 'output' : 'input')}
          </DialogTitle>
          {pane === 'output' ? (
            <TextareaCopyable
              value={output.value}
              rows={1}
              hideCopyButton
              showLineNumbers
              placeholder={output.placeholder}
              className="min-h-0 flex-1 rounded-none border-0"
            />
          ) : (
            <TextareaEditable
              value={input.value}
              onValueChange={input.onValueChange}
              deferMs={input.deferMs ?? INPUT_SYNC_DELAY_MS}
              autoFocus
              placeholder={input.placeholder}
              containerClassName="min-h-0 flex-1"
            />
          )}
          {fullscreenFooter !== undefined && pane !== null && (
            <p className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
              {fullscreenFooter(pane)}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
