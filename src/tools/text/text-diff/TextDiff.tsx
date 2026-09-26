import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useBreakpoint } from '@/composable/use-breakpoint'
import { useCopy } from '@/composable/use-copy'
import { useFillHeight } from '@/composable/use-fill-height'
import { cn } from '@/lib/utils'
import { caretFromOffset, countChars, countLines, type CaretPosition } from '@/utils/text-caret'
import {
  buildDiffRows,
  buildPaneCells,
  summarizeDiff,
  type DiffRowType,
  type PaneCell,
  type PaneSide,
} from './text-diff.service'

/** 删除行铺斜纹、新增行铺实色，两卡一眼分得开（斜纹见 index.css 的 diff-hatch） */
const CELL_TONE: Record<DiffRowType, { row: string; sign: string; inline: string }> = {
  unchanged: { row: '', sign: 'text-muted-foreground/40', inline: '' },
  removed: {
    row: 'bg-destructive/10 diff-hatch',
    sign: 'text-destructive',
    inline: 'bg-destructive/30',
  },
  added: { row: 'bg-primary/15', sign: 'text-primary', inline: 'bg-primary/35' },
}

const CELL_SIGN: Record<DiffRowType, string> = {
  unchanged: '',
  removed: '−',
  added: '+',
}

/**
 * 高亮层与盖在其下的透明 textarea 必须逐像素对齐，否则字会飘：两层共用同一套字体、
 * 行高与左右内边距。正文起点 = pl-2(0.5) + 行号 w-7(1.75) + gap-1.5(0.375)
 * + 符号 w-3(0.75) + gap-1.5(0.375) = 3.75rem。
 */
const ROW_METRICS = 'font-mono text-sm leading-6'
/**
 * 行号是 text-xs（自带 16px 行高），按顶部对齐会比正文高 4px；整行改按基线对齐，
 * 数字才和正文坐在同一条线上。正文那一格仍是 24px 行盒，textarea 对位不受影响。
 */
const ROW_LAYOUT = 'items-baseline gap-1.5'
const ROW_PADDING = 'pl-2 pr-3'
const TEXT_INSET = 'pl-[3.75rem] pr-3'

/** 并入箭头一律指向本卡：点它就是把对方的内容整份搬到这一栏来 */
const PANE_MERGE_ICON: Record<PaneSide, LucideIcon> = { original: ArrowLeft, modified: ArrowRight }

const PANE_LABEL_KEY: Record<PaneSide, string> = {
  original: 'text-diff.originalLabel',
  modified: 'text-diff.modifiedLabel',
}

/** 并入按钮把哪一侧搬进本卡 */
const PANE_ADOPT_HINT_KEY: Record<PaneSide, string> = {
  original: 'text-diff.adoptFromModified',
  modified: 'text-diff.adoptFromOriginal',
}

/**
 * 两卡始终并排各占一半（不分行），宽度跟着视口走；正文不折行，
 * 长行在卡片内部横向滚动，所以外层绝不出现整页的横向滚动条。
 */
const PANE_ROW_CLASS = 'flex min-h-0 flex-1 gap-3'
const PANE_SIZE_CLASS = 'min-w-0 flex-1'

export default function TextDiff() {
  const { t } = useTranslation('tools-text')
  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  /** 「全部并入」覆盖掉的本栏旧文本，用于「还原」；null 表示当前没有可还原的并入 */
  const [undoText, setUndoText] = useState<Record<PaneSide, string | null>>({
    original: null,
    modified: null,
  })
  const [activeChange, setActiveChange] = useState<number | null>(null)

  const isDesktop = useBreakpoint() === 'desktop'
  const { rootRef, height } = useFillHeight(isDesktop)

  const rows = useMemo(() => buildDiffRows(original, modified), [original, modified])
  const summary = useMemo(() => summarizeDiff(rows), [rows])
  // 文本一改差异块就会重新编号，越界的位置直接视作未选中
  const active = activeChange !== null && activeChange < summary.changes ? activeChange : null

  const originalCells = useMemo(
    () => buildPaneCells(rows, 'original', countLines(original)),
    [rows, original],
  )
  const modifiedCells = useMemo(
    () => buildPaneCells(rows, 'modified', countLines(modified)),
    [rows, modified],
  )

  // 两卡是各自的滚动容器，靠这里同步，保持「一起滚」的对比手感
  const panesRef = useRef<Set<HTMLDivElement>>(new Set())
  const registerPane = useCallback((element: HTMLDivElement) => {
    panesRef.current.add(element)
    return () => {
      panesRef.current.delete(element)
    }
  }, [])

  const syncScroll = useCallback((source: HTMLDivElement) => {
    // 用 scrollTo 而不是写 scrollTop：赋值会被 react-hooks/immutability 判为改写 hook 外部值
    for (const pane of panesRef.current) {
      if (pane === source) {
        continue
      }
      const left = Math.abs(pane.scrollLeft - source.scrollLeft) > 0.5
      const top = Math.abs(pane.scrollTop - source.scrollTop) > 0.5
      if (left || top) {
        pane.scrollTo({ top: source.scrollTop, left: source.scrollLeft })
      }
    }
  }, [])

  const goToChange = useCallback((index: number) => {
    // 只滚第一张卡，另一张由滚动同步跟随，省得两卡各跑一次平滑动画
    for (const pane of panesRef.current) {
      const target = pane.querySelector<HTMLElement>(`[data-change="${index}"]`)
      if (target === null) {
        continue
      }
      const top = target.getBoundingClientRect().top - pane.getBoundingClientRect().top
      pane.scrollTo({
        top: Math.max(top + pane.scrollTop - pane.clientHeight / 2, 0),
        behavior: 'smooth',
      })
      break
    }
    setActiveChange(index)
  }, [])

  const stepChange = useCallback(
    (delta: number) => {
      if (summary.changes === 0) {
        return
      }
      const from = active ?? (delta > 0 ? -1 : 0)
      goToChange((from + delta + summary.changes) % summary.changes)
    },
    [active, goToChange, summary.changes],
  )

  /** 整份采用对方文本：旧文本留一份给「还原」，此后两卡没有差异 */
  const adoptFromOther = useCallback(
    (side: PaneSide) => {
      const own = side === 'original' ? original : modified
      const other = side === 'original' ? modified : original
      setUndoText((current) => ({ ...current, [side]: own }))
      if (side === 'original') {
        setOriginal(other)
      } else {
        setModified(other)
      }
    },
    [modified, original],
  )

  const undoAdopt = useCallback(
    (side: PaneSide) => {
      const restored = undoText[side]
      if (restored === null) {
        return
      }
      setUndoText((current) => ({ ...current, [side]: null }))
      if (side === 'original') {
        setOriginal(restored)
      } else {
        setModified(restored)
      }
    },
    [undoText],
  )

  /**
   * 手改本栏 = 以手改的为准：并入前那份旧文本随之作废（还原回去会连手改一起丢掉，
   * 而手改本身就是「我不要对方的了」）。
   */
  const editPane = useCallback((side: PaneSide, next: string) => {
    setUndoText((current) => (current[side] === null ? current : { ...current, [side]: null }))
    if (side === 'original') {
      setOriginal(next)
    } else {
      setModified(next)
    }
  }, [])

  const clearPane = useCallback(
    (side: PaneSide) => {
      editPane(side, '')
    },
    [editPane],
  )

  return (
    <div
      ref={rootRef}
      className={cn('flex min-h-0 flex-col gap-3', !isDesktop && 'h-96')}
      style={isDesktop && height !== null ? { height } : undefined}
    >
      <div className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{t('text-diff.changesCount', { count: summary.changes })}</Badge>
        <span
          role="group"
          aria-label={t('text-diff.statsSummary', {
            added: summary.added,
            removed: summary.removed,
          })}
          className="flex items-center gap-2 font-medium tabular-nums"
        >
          <span className="text-destructive">−{summary.removed}</span>
          <span className="text-primary">+{summary.added}</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={summary.changes === 0}
          onClick={() => stepChange(-1)}
          aria-label={t('text-diff.prevChange')}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {active !== null && (
          <span className="min-w-8 text-center tabular-nums">
            {active + 1}/{summary.changes}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={summary.changes === 0}
          onClick={() => stepChange(1)}
          aria-label={t('text-diff.nextChange')}
        >
          <ChevronRight className="size-4" />
        </Button>
        {summary.changes === 0 && (original !== '' || modified !== '') && (
          <span>{t('text-diff.noDiff')}</span>
        )}
      </div>

      <div className={PANE_ROW_CLASS}>
        <DiffCard
          side="original"
          text={original}
          cells={originalCells}
          changes={summary.changes}
          undoable={undoText.original !== null}
          active={active}
          onAdopt={adoptFromOther}
          onUndo={undoAdopt}
          onEdit={editPane}
          onClear={clearPane}
          onRegister={registerPane}
          onScroll={syncScroll}
        />
        <DiffCard
          side="modified"
          text={modified}
          cells={modifiedCells}
          changes={summary.changes}
          undoable={undoText.modified !== null}
          active={active}
          onAdopt={adoptFromOther}
          onUndo={undoAdopt}
          onEdit={editPane}
          onClear={clearPane}
          onRegister={registerPane}
          onScroll={syncScroll}
        />
      </div>
    </div>
  )
}

interface DiffCardProps {
  side: PaneSide
  text: string
  cells: PaneCell[]
  changes: number
  /** 本卡是否正处于「已并入对方」的状态，可一键还原 */
  undoable: boolean
  active: number | null
  onAdopt: (side: PaneSide) => void
  onUndo: (side: PaneSide) => void
  onEdit: (side: PaneSide, text: string) => void
  onClear: (side: PaneSide) => void
  onRegister: (element: HTMLDivElement) => () => void
  onScroll: (element: HTMLDivElement) => void
}

/**
 * 一张卡片 = 一栏正文 + 一条操作栏：卡名在左，并入 / 复制 / 清除在右。
 *
 * 光标行列留在卡内，移光标不会惊动父级重算差异。
 */
function DiffCard({
  side,
  text,
  cells,
  changes,
  undoable,
  active,
  onAdopt,
  onUndo,
  onEdit,
  onClear,
  onRegister,
  onScroll,
}: DiffCardProps) {
  const { t } = useTranslation('tools-text')
  const { t: tCommon } = useTranslation('common')
  const { copy, isCopied } = useCopy()
  const [caret, setCaret] = useState<CaretPosition>({ line: 1, column: 1 })

  const label = t(PANE_LABEL_KEY[side])
  const MergeIcon = PANE_MERGE_ICON[side]
  const chars = useMemo(() => countChars(text), [text])
  const lines = useMemo(() => countLines(text), [text])

  const handleCaret = useCallback((position: CaretPosition) => setCaret(position), [])
  const handleEdit = useCallback((next: string) => onEdit(side, next), [onEdit, side])
  const handleAdopt = useCallback(() => onAdopt(side), [onAdopt, side])
  const handleUndo = useCallback(() => onUndo(side), [onUndo, side])
  const handleClear = useCallback(() => onClear(side), [onClear, side])

  return (
    <Card size="sm" className={cn('flex h-full min-h-0 gap-0 p-0', PANE_SIZE_CLASS)}>
      <CardHeader className="flex shrink-0 items-center justify-between gap-2 border-b pt-(--card-spacing)">
        <CardTitle className="flex items-center gap-1.5 font-medium">{label}</CardTitle>
        <CardAction className="flex shrink-0 items-center gap-1">
          {undoable ? (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              onClick={handleUndo}
              aria-label={t('text-diff.reset')}
              title={t('text-diff.resetHint')}
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">{t('text-diff.reset')}</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              disabled={changes === 0}
              onClick={handleAdopt}
              aria-label={t('text-diff.mergeAll')}
              title={t(PANE_ADOPT_HINT_KEY[side])}
            >
              <MergeIcon className="size-3.5" />
              <span className="hidden sm:inline">{t('text-diff.mergeAll')}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            disabled={text === ''}
            onClick={() => void copy(text)}
            aria-label={tCommon('copy')}
            title={tCommon('copy')}
          >
            {isCopied(text) ? (
              <Check className="text-primary size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span className="hidden sm:inline">{tCommon('copy')}</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            disabled={text === ''}
            onClick={handleClear}
            aria-label={tCommon('clear')}
            title={tCommon('clear')}
          >
            <Eraser className="size-3.5" />
            <span className="hidden sm:inline">{tCommon('clear')}</span>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <DiffBody
          side={side}
          label={label}
          cells={cells}
          text={text}
          active={active}
          onEdit={handleEdit}
          onCaret={handleCaret}
          onRegister={onRegister}
          onScroll={onScroll}
        />
      </CardContent>

      <CardFooter className="shrink-0 gap-2 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {tCommon('caretPosition', caret)}
        </span>
        <span className="text-muted-foreground ml-auto tabular-nums">
          {tCommon('charsAndLines', { chars, lines })}
        </span>
      </CardFooter>
    </Card>
  )
}

interface DiffBodyProps {
  side: PaneSide
  label: string
  cells: PaneCell[]
  text: string
  active: number | null
  onEdit: (text: string) => void
  onCaret: (position: CaretPosition) => void
  onRegister: (element: HTMLDivElement) => () => void
  onScroll: (element: HTMLDivElement) => void
}

/**
 * 一栏正文：整卡只有一块 textarea，盖在逐行高亮层下面——所以 Ctrl+A 选中的是整张卡，
 * 而不是某个差异块。高亮层在文档流里撑出内容高度，textarea 铺满它，外层负责滚动。
 *
 * memo 是必要的：移动光标会重渲染卡片，靠它挡住整栏重排。
 */
const DiffBody = memo(function DiffBody({
  side,
  label,
  cells,
  text,
  active,
  onEdit,
  onCaret,
  onRegister,
  onScroll,
}: DiffBodyProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = scrollRef.current
    return element === null ? undefined : onRegister(element)
  }, [onRegister])

  const reportCaret = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      onCaret(caretFromOffset(event.currentTarget.value, event.currentTarget.selectionStart))
    },
    [onCaret],
  )

  return (
    <div
      ref={scrollRef}
      data-pane={side}
      onScroll={(event) => onScroll(event.currentTarget)}
      className={cn('relative flex min-h-0 flex-1 flex-col overflow-auto', ROW_METRICS)}
    >
      {/* w-max 让容器铺到最长那一行，textarea 因此永不内部滚动，横向滚动条只归外层 */}
      <div className="relative min-h-full w-max min-w-full">
        <div aria-hidden="true" className="pointer-events-none">
          {cells.map((cell) => (
            <CellRow
              key={cell.lineNumber}
              cell={cell}
              active={active !== null && active === cell.changeIndex}
            />
          ))}
        </div>
        <textarea
          value={text}
          wrap="off"
          onChange={(event) => onEdit(event.target.value)}
          onSelect={reportCaret}
          onKeyUp={reportCaret}
          onClick={reportCaret}
          onFocus={reportCaret}
          spellCheck={false}
          aria-label={label}
          className={cn(
            'caret-foreground focus-visible:ring-ring/50 absolute inset-0 resize-none overflow-hidden border-0 bg-transparent whitespace-pre text-transparent outline-none focus-visible:ring-1 focus-visible:ring-inset',
            ROW_METRICS,
            TEXT_INSET,
          )}
        />
      </div>
    </div>
  )
})

/** 一行：行号 + 加减号 + 正文，正文里 changed 的片段再叠一层更深的底色 */
const CellRow = memo(function CellRow({ cell, active }: { cell: PaneCell; active: boolean }) {
  const tone = CELL_TONE[cell.type]
  const isEmpty = cell.segments.every((segment) => segment.text === '')

  return (
    <div
      data-line={cell.lineNumber}
      data-change={cell.changeIndex ?? undefined}
      className={cn(
        'flex',
        ROW_LAYOUT,
        ROW_PADDING,
        ROW_METRICS,
        tone.row,
        active && 'ring-primary/70 ring-1 ring-inset',
      )}
    >
      <span
        aria-hidden="true"
        className="text-muted-foreground/60 w-7 shrink-0 text-right text-xs tabular-nums select-none"
      >
        {cell.lineNumber}
      </span>
      <span aria-hidden="true" className={cn('w-3 shrink-0', tone.sign)}>
        {CELL_SIGN[cell.type]}
      </span>
      <span aria-hidden="true" className="whitespace-pre">
        {/* 空行补一个不换行空格，保证行高与 textarea 一致 */}
        {isEmpty ? '\u00a0' : null}
        {cell.segments.map((segment, index) =>
          segment.changed ? (
            <span key={index} className={tone.inline}>
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </span>
    </div>
  )
})
