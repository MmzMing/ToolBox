import { Fragment, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buildDiffRows, summarizeDiff, type DiffCell, type DiffRowType } from './text-diff.service'

/** 删除行铺斜纹、新增行铺实色，两栏一眼分得开（斜纹见 index.css 的 diff-hatch） */
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
 * 高亮层与盖在上面的透明 textarea 必须逐像素对齐，否则字会飘：两层共用同一套字体、
 * 行高与左右内边距。正文起点 = pl-3(0.75) + 行号 w-8(2) + gap-2(0.5)
 * + 符号 w-3(0.75) + gap-2(0.5) = 4.5rem。
 */
const ROW_METRICS = 'font-mono text-sm leading-6'
const ROW_PADDING = 'pl-3 pr-3'
const TEXT_INSET = 'pl-[4.5rem] pr-3'

/** 一格及其所属差异块 */
type CellEntry = { cell: DiffCell; changeIndex: number | null }

/**
 * 高亮层的行数必须等于 textarea 的行数，否则末尾多出的空行会被 overflow-hidden 裁掉，
 * 而 diffLines 不产出结尾换行符产生的空行，这里按 textarea 的口径补齐。
 */
function toPaneCells(cells: CellEntry[], value: string): CellEntry[] {
  const lineCount = value.split('\n').length
  const padded = [...cells]
  while (padded.length < lineCount) {
    const lineNumber = padded.length + 1
    padded.push({
      cell: { lineNumber, type: 'unchanged', segments: [{ text: '', changed: false }] },
      changeIndex: null,
    })
  }
  return padded
}

export default function TextDiff() {
  const { t } = useTranslation('tools-text')

  const [original, setOriginal] = useState('')
  const [modified, setModified] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeChange, setActiveChange] = useState<number | null>(null)

  const rows = useMemo(() => buildDiffRows(original, modified), [original, modified])
  const summary = useMemo(() => summarizeDiff(rows), [rows])
  // 文本一改行数就变，越界的跳转位置直接视作未选中，省掉一次 setState 同步
  const active = activeChange !== null && activeChange < summary.changes ? activeChange : null

  const leftCells = toPaneCells(
    rows.flatMap((row) => (row.left ? [{ cell: row.left, changeIndex: row.changeIndex }] : [])),
    original,
  )
  const rightCells = toPaneCells(
    rows.flatMap((row) => (row.right ? [{ cell: row.right, changeIndex: row.changeIndex }] : [])),
    modified,
  )

  const goToChange = (index: number) => {
    const container = scrollRef.current
    const target = container?.querySelector<HTMLElement>(`[data-change="${index}"]`)
    if (!container || !target) {
      return
    }
    const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top
    container.scrollTo({
      top: Math.max(top + container.scrollTop - container.clientHeight / 2, 0),
      behavior: 'smooth',
    })
    setActiveChange(index)
  }

  const stepChange = (delta: number) => {
    if (summary.changes === 0) {
      return
    }
    const from = active ?? (delta > 0 ? -1 : 0)
    goToChange((from + delta + summary.changes) % summary.changes)
  }

  return (
    <Card size="sm" className="gap-0 p-0">
      <CardHeader className="items-center border-b pt-(--card-spacing)">
        <CardTitle className="row-span-2 flex items-center gap-2">
          {t('text-diff.resultLabel')}
          <Badge variant="secondary">
            {t('text-diff.changesCount', { count: summary.changes })}
          </Badge>
        </CardTitle>
        <CardAction className="flex items-center gap-1 self-center text-xs">
          <span
            role="group"
            aria-label={t('text-diff.statsSummary', {
              added: summary.added,
              removed: summary.removed,
            })}
            className="mr-1 flex items-center gap-2 font-medium tabular-nums"
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
            <span className="text-muted-foreground min-w-8 text-center tabular-nums">
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
        </CardAction>
      </CardHeader>

      <CardContent className="min-h-0 p-0">
        {summary.changes === 0 && (original !== '' || modified !== '') && (
          <p className="text-muted-foreground border-border border-b px-3 py-1.5 text-xs">
            {t('text-diff.noDiff')}
          </p>
        )}
        <div
          ref={scrollRef}
          role="region"
          aria-label={t('text-diff.resultLabel')}
          className="relative h-96 overflow-auto xl:h-[28rem]"
        >
          <div className="grid min-h-full grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <DiffPane
              label={t('text-diff.originalLabel')}
              value={original}
              onValueChange={setOriginal}
              cells={leftCells}
              active={active}
              divider
            />
            <DiffPane
              label={t('text-diff.modifiedLabel')}
              value={modified}
              onValueChange={setModified}
              cells={rightCells}
              active={active}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * 一栏 = 高亮层（撑高度、画底色与词级高亮）+ 盖在其上的透明 textarea。
 * 两栏各自成列、行不跨栏对齐，所以每栏的行数始终等于它自己 textarea 的行数。
 */
function DiffPane({
  label,
  value,
  onValueChange,
  cells,
  active,
  divider = false,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  cells: CellEntry[]
  active: number | null
  divider?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col', divider && 'border-border md:border-r')}>
      <div className="bg-muted/40 border-border text-muted-foreground sticky top-0 z-20 border-b px-3 py-1.5 text-xs font-medium">
        {label}
      </div>
      <div className={cn('relative flex-1', ROW_METRICS)}>
        <div aria-hidden="true" className="pointer-events-none">
          {cells.map(({ cell, changeIndex }) => (
            <CellRow
              key={cell.lineNumber}
              cell={cell}
              changeIndex={changeIndex}
              active={active !== null && active === changeIndex}
            />
          ))}
        </div>
        <textarea
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          spellCheck={false}
          aria-label={label}
          className={cn(
            'caret-foreground focus-visible:ring-ring/50 absolute inset-0 resize-none overflow-hidden border-0 bg-transparent break-all whitespace-pre-wrap text-transparent outline-none focus-visible:ring-1 focus-visible:ring-inset',
            ROW_METRICS,
            TEXT_INSET,
          )}
        />
      </div>
    </div>
  )
}

/** 一行：行号 + 加减号 + 正文，正文里 changed 的片段再叠一层更深的底色 */
function CellRow({
  cell,
  changeIndex,
  active,
}: {
  cell: DiffCell
  changeIndex: number | null
  active: boolean
}) {
  const tone = CELL_TONE[cell.type]
  const isEmpty = cell.segments.every((segment) => segment.text === '')

  return (
    <div
      data-change={changeIndex ?? undefined}
      className={cn(
        'flex items-start gap-2',
        ROW_PADDING,
        ROW_METRICS,
        tone.row,
        active && 'ring-primary/70 ring-1 ring-inset',
      )}
    >
      <span
        aria-hidden="true"
        className="text-muted-foreground/60 w-8 shrink-0 text-right tabular-nums select-none"
      >
        {cell.lineNumber}
      </span>
      <span aria-hidden="true" className={cn('w-3 shrink-0', tone.sign)}>
        {CELL_SIGN[cell.type]}
      </span>
      <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">
        {/* 空行补一个不换行空格，保证行高与 textarea 一致 */}
        {isEmpty ? ' ' : null}
        {cell.segments.map((segment, index) =>
          segment.changed ? (
            <span key={index} className={tone.inline}>
              {segment.text}
            </span>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          ),
        )}
      </span>
    </div>
  )
}
