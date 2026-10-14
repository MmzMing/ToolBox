import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import type { Variants } from 'motion/react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'
import { motionTokens, springOf } from '@/lib/motion-tokens'
import { useToday } from '@/composable/use-today'

/** 闭区间，两端都是本地零点的整天（月粒度下分别是月初与月末）。 */
export type DateRange = { start: Date; end: Date }

/** 可选中的最小粒度：`day` 是日历，`month` 是一年 12 格的宫格。 */
export type DateGranularity = 'day' | 'month'

/** 时刻精度。原本只选日期的调用点保持 `'none'`，就不会凭空多出时分秒。 */
export type TimePrecision = 'none' | 'minute' | 'second'

/** 快捷区间。`key` 对应 `common:datePicker.presets.<key>`，文案一律走 i18n。 */
export type DateRangePreset = { key: string; range: (today: Date) => DateRange }

/** `'default'` 用内置预设，`'none'` 整条预设栏不渲染。 */
export type DatePresetConfig = 'default' | 'none' | DateRangePreset[]

type Size = { w: number; h: number }
type Box = { x: number; y: number; w: number; h: number }
type Phase = 'closed' | 'open' | 'closing'
type Bezier = [number, number, number, number]
type Mode = 'range' | 'single'

const DAY_MS = 864e5
/** 收拢动画走完才卸载门户外壳，取值 SHRINK 的视觉时长。 */
const CLOSE_MS = 400

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)
const yearStart = (date: Date) => new Date(date.getFullYear(), 0, 1)
const addDays = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
const addMonths = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1)
const shiftMonths = (date: Date, amount: number) => {
  const target = addMonths(date, amount)
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), monthEnd(target).getDate()),
  )
}
const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS)
const monthDiff = (a: Date, b: Date) =>
  (a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth()
const sameDay = (a?: Date | null, b?: Date | null) => Boolean(a && b && dayDiff(a, b) === 0)
const keyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}
const ordered = (a: Date, b: Date): DateRange =>
  dayDiff(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a }
const sameRange = (a?: DateRange | null, b?: DateRange | null) =>
  Boolean(a && b && sameDay(a.start, b.start) && sameDay(a.end, b.end))
const clampDate = (date: Date, min?: Date, max?: Date) =>
  min && dayDiff(date, min) < 0
    ? startOfDay(min)
    : max && dayDiff(date, max) > 0
      ? startOfDay(max)
      : date
const cellIn = (date: Date, first: Date) => {
  const index = dayDiff(date, first)
  return { row: Math.floor(index / 7), col: index % 7 }
}
const pad2 = (value: number) => String(value).padStart(2, '0')
const timeOf = (date: Date, precision: Exclude<TimePrecision, 'none'>) =>
  precision === 'second'
    ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
const parseTime = (value: string) => {
  const [hour = '0', minute = '0', second = '0'] = value.split(':')
  return { hour: Number(hour) || 0, minute: Number(minute) || 0, second: Number(second) || 0 }
}
const withTime = (date: Date, parts: { hour: number; minute: number; second: number }) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    parts.hour,
    parts.minute,
    parts.second,
  )

/** 月粒度下区间摊到整月：起点落月初、终点落月末。 */
const align = (range: DateRange, granularity: DateGranularity): DateRange =>
  granularity === 'day' ? range : { start: monthStart(range.start), end: monthEnd(range.end) }

/** 一个「面」跨几个月：日历面 1 个月，年月宫格面 12 个月。 */
const faceMonths = (granularity: DateGranularity) => (granularity === 'day' ? 1 : 12)
const faceStart = (date: Date, granularity: DateGranularity) =>
  granularity === 'day' ? monthStart(date) : yearStart(date)

type PresetKey =
  'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd'

const PRESET_RANGE: Record<PresetKey, (today: Date) => DateRange> = {
  today: (today) => ({ start: today, end: today }),
  yesterday: (today) => ({ start: addDays(today, -1), end: addDays(today, -1) }),
  last7: (today) => ({ start: addDays(today, -6), end: today }),
  last30: (today) => ({ start: addDays(today, -29), end: today }),
  thisMonth: (today) => ({ start: monthStart(today), end: today }),
  lastMonth: (today) => {
    const prev = addMonths(today, -1)
    return { start: monthStart(prev), end: monthEnd(prev) }
  },
  thisQuarter: (today) => ({
    start: new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1),
    end: today,
  }),
  ytd: (today) => ({ start: new Date(today.getFullYear(), 0, 1), end: today }),
}

const DAY_PRESETS: PresetKey[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'ytd',
]

/** 月粒度只保留本来就落在整月上的项，避免出现「今天＝单日」这种语义错位。 */
const MONTH_PRESETS: PresetKey[] = ['thisMonth', 'lastMonth', 'thisQuarter', 'ytd']

/** 时长用刚度/阻尼表达，retarget 时接住当前速度，不会停顿后重新起步。 */
const GROW = springOf(0.48, 0.12)
const SHRINK = springOf(0.38, 0)
const STRETCH = springOf(0.3, 0.04)
const GLIDE = springOf(0.3, 0.1)
const SLIDE = springOf(0.4, 0.06)

const CLOSED_RADIUS = 'var(--radius-lg)'
const OPEN_RADIUS = 'var(--radius-2xl)'
/** 半径交给 CSS 过渡：和尺寸弹簧抢同一条边会让圆角在中途扭一下。 */
const RADIUS_TRANSITION = 'border-radius 320ms cubic-bezier(0.16, 1, 0.3, 1)'
const EDGE = 8
const GAP_TRIGGER = 6
const PANEL_PAD = 16
const PANEL_GAP = 12
const RAIL_W = 132
const GRID = { day: { cols: 7, cell: 36, gap: 0 }, month: { cols: 3, cell: 72, gap: 4 } } as const

const { blur } = motionTokens
const enterEase = [...motionTokens.ease.enter] as Bezier
const standardEase = [...motionTokens.ease.standard] as Bezier

const roll: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: `${direction * 0.45}em`,
    filter: `blur(${blur.subtle}px)`,
  }),
  center: {
    opacity: 1,
    y: '0em',
    filter: 'blur(0px)',
    transition: { duration: 0.26, ease: enterEase },
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: `${direction * -0.45}em`,
    filter: `blur(${blur.subtle}px)`,
    transition: { duration: 0.14, ease: standardEase },
  }),
}
const fade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, y: '0em', filter: 'blur(0px)', transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
}
/** 面板内容比生长的表面稍晚到达、比退场稍早离开。 */
const faceIn: Variants = {
  hidden: { opacity: 0, y: -4, filter: `blur(${blur.soft}px)` },
  shown: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.26, ease: enterEase, delay: 0.07 },
  },
  gone: {
    opacity: 0,
    y: -2,
    filter: `blur(${blur.soft}px)`,
    transition: { duration: 0.12, ease: standardEase },
  },
}
const faceFade: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.12 } },
  gone: { opacity: 0, transition: { duration: 0.08 } },
}
const slide: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48, filter: `blur(${blur.soft}px)` }),
  center: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      x: SLIDE,
      opacity: { duration: 0.22, ease: enterEase },
      filter: { duration: 0.24, ease: enterEase },
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -36,
    filter: `blur(${blur.soft}px)`,
    transition: {
      x: SLIDE,
      opacity: { duration: 0.14, ease: standardEase },
      filter: { duration: 0.14, ease: standardEase },
    },
  }),
}

/** 逐词滚动：往后的日期从下方升起，往前的从上方落下，没变的词原地不动。 */
function Rolling({
  text,
  direction,
  reduced,
}: {
  text: string
  direction: number
  reduced: boolean
}) {
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <span
      className="pointer-events-none inline-flex flex-wrap items-baseline gap-x-1"
      aria-hidden="true"
    >
      {words.map((word, index) => (
        <span key={index} className="inline-flex overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.span
              key={word}
              className="inline-block"
              custom={direction}
              variants={reduced ? fade : roll}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {word}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

/** 记住区间移动的方向，让标签沿着时间方向滚动。 */
function useDirection(range: DateRange | null) {
  const time = range ? range.start.getTime() * 2 + range.end.getTime() : null
  const [previous, setPrevious] = useState(time)
  const [direction, setDirection] = useState(1)
  if (time !== previous) {
    setPrevious(time)
    setDirection(time === null || previous === null || time >= previous ? 1 : -1)
  }
  return direction
}

type Segment = { left: number; width: number } | null

/** 区间高亮按周切一段：它从区间到达的那一侧长出来，悬停时读起来是「被拉开」。 */
function Bar({ row, segment, reduced }: { row: number; segment: Segment; reduced: boolean }) {
  const left = useMotionValue(segment?.left ?? 0)
  const width = useMotionValue(segment?.width ?? 0)
  const opacity = useMotionValue(segment ? 1 : 0)
  const leftPct = useTransform(left, (value) => `${value}%`)
  const widthPct = useTransform(width, (value) => `${value}%`)
  const wasEmpty = useRef(!segment)

  useLayoutEffect(() => {
    if (!segment) {
      wasEmpty.current = true
      animate(opacity, 0, { duration: reduced ? 0 : 0.14 })
      return
    }
    if (wasEmpty.current || reduced) {
      left.jump(segment.left)
      width.jump(segment.width)
    } else {
      animate(left, segment.left, STRETCH)
      animate(width, segment.width, STRETCH)
    }
    wasEmpty.current = false
    animate(opacity, 1, { duration: reduced ? 0 : 0.16 })
  }, [left, opacity, reduced, segment, width])

  return (
    <motion.span
      className="bg-primary/15 absolute rounded-sm"
      style={{
        left: leftPct,
        width: widthPct,
        opacity,
        top: `calc(${row} * var(--cell) + 3px)`,
        height: 'calc(var(--cell) - 6px)',
      }}
    />
  )
}

/** 区间的实心端点：在日之间滑行，只有离开这个面时才淡出。 */
function Thumb({ cell, reduced }: { cell: { row: number; col: number } | null; reduced: boolean }) {
  const x = useMotionValue(cell?.col ?? 0)
  const y = useMotionValue(cell?.row ?? 0)
  const opacity = useMotionValue(cell ? 1 : 0)
  const scale = useMotionValue(cell ? 1 : 0.8)
  const transform = useTransform(
    () => `translate(${x.get() * 100}%, ${y.get() * 100}%) scale(${scale.get()})`,
  )
  const hidden = useRef(!cell)

  useLayoutEffect(() => {
    if (!cell) {
      hidden.current = true
      animate(opacity, 0, { duration: reduced ? 0 : 0.12 })
      animate(scale, 0.8, { duration: reduced ? 0 : 0.12 })
      return
    }
    if (hidden.current || reduced) {
      x.jump(cell.col)
      y.jump(cell.row)
    } else {
      animate(x, cell.col, GLIDE)
      animate(y, cell.row, GLIDE)
    }
    hidden.current = false
    animate(opacity, 1, { duration: reduced ? 0 : 0.16 })
    animate(scale, 1, reduced ? { duration: 0 } : GLIDE)
  }, [cell, opacity, reduced, scale, x, y])

  return (
    <motion.span
      className="bg-primary absolute top-0 left-0 rounded-full"
      style={{ transform, opacity, width: 'var(--cell)', height: 'var(--cell)' }}
    />
  )
}

type Formatters = {
  label: Intl.DateTimeFormat
  withTime: Intl.DateTimeFormat
  title: Intl.DateTimeFormat
  day: Intl.DateTimeFormat
  monthLong: Intl.DateTimeFormat
  monthCell: Intl.DateTimeFormat
  weekday: Intl.DateTimeFormat
  weekdayLong: Intl.DateTimeFormat
}

type FaceHandlers = {
  onPick: (date: Date) => void
  onKey: (event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) => void
  onFocusDay: (date: Date) => void
}

type FaceProps = {
  face: Date
  range: DateRange | null
  tabbable: string
  today: Date
  minDate?: Date
  maxDate?: Date
  weekStartsOn: 0 | 1
  reduced: boolean
  formatters: Formatters
  idBase: string
  onHover: (date: Date) => void
} & FaceHandlers

function DayFace({
  face,
  range,
  tabbable,
  today,
  minDate,
  maxDate,
  weekStartsOn,
  reduced,
  formatters,
  idBase,
  onPick,
  onHover,
  onKey,
  onFocusDay,
}: FaceProps) {
  const first = useMemo(
    () => addDays(face, -((face.getDay() - weekStartsOn + 7) % 7)),
    [face, weekStartsOn],
  )
  const rows = useMemo(
    () =>
      Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 7 }, (_, col) => addDays(first, row * 7 + col)),
      ),
    [first],
  )
  const titleId = `${idBase}-${keyOf(face)}`
  const lo = range?.start
  const hi = range?.end
  const loKey = lo ? keyOf(lo) : ''
  const hiKey = hi ? keyOf(hi) : ''

  /** 每个周格子的区间片段，换算成整行的百分比；只在区间的日子变化时重算。 */
  const segments = useMemo<Segment[]>(() => {
    if (!loKey || !hiKey) return rows.map(() => null)
    const start = fromKey(loKey)
    const end = fromKey(hiKey)
    const unit = 100 / 7
    const colOf = (date: Date) => dayDiff(date, first) % 7
    return rows.map((row) => {
      const days = row.filter((date) => monthDiff(date, face) === 0)
      if (!days.length) return null
      const rowFirst = days[0]!
      const rowLast = days[days.length - 1]!
      const from = dayDiff(start, rowFirst) > 0 ? start : rowFirst
      const to = dayDiff(end, rowLast) < 0 ? end : rowLast
      if (dayDiff(from, to) <= 0) {
        return { left: colOf(from) * unit, width: (colOf(to) - colOf(from) + 1) * unit }
      }
      // 整周都在区间外：把这一段收到区间会长出来的那一侧边缘。
      if (dayDiff(rowLast, start) < 0) return { left: (colOf(rowLast) + 1) * unit, width: 0 }
      return { left: colOf(rowFirst) * unit, width: 0 }
    })
  }, [face, first, hiKey, loKey, rows])

  const startCell = useMemo(
    () => (loKey && monthDiff(fromKey(loKey), face) === 0 ? cellIn(fromKey(loKey), first) : null),
    [face, first, loKey],
  )
  const endCell = useMemo(
    () =>
      hiKey && hiKey !== loKey && monthDiff(fromKey(hiKey), face) === 0
        ? cellIn(fromKey(hiKey), first)
        : null,
    [face, first, hiKey, loKey],
  )

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <p id={titleId} className="text-muted-foreground px-9 text-center text-sm font-medium">
        {formatters.title.format(face)}
      </p>
      <div role="grid" aria-labelledby={titleId}>
        <div role="row" className="flex">
          {rows[0]!.map((date) => (
            <span
              key={date.getDay()}
              role="columnheader"
              aria-label={formatters.weekdayLong.format(date)}
              className="text-muted-foreground flex items-center justify-center pb-1 text-xs font-normal"
              style={{ width: 'var(--cell)' }}
            >
              {formatters.weekday.format(date).slice(0, 2)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ width: `calc(var(--cell) * 7)` }}>
          <span className="pointer-events-none absolute inset-0" aria-hidden="true">
            {segments.map((segment, row) => (
              <Bar key={row} row={row} segment={segment} reduced={reduced} />
            ))}
            <Thumb cell={startCell} reduced={reduced} />
            <Thumb cell={endCell} reduced={reduced} />
          </span>
          {rows.map((row, index) => (
            <div key={index} role="row" className="flex">
              {row.map((date) => {
                if (monthDiff(date, face) !== 0) {
                  return (
                    <span
                      key={keyOf(date)}
                      role="gridcell"
                      style={{ width: 'var(--cell)', height: 'var(--cell)' }}
                    />
                  )
                }
                const key = keyOf(date)
                const disabled = Boolean(
                  (minDate && dayDiff(date, minDate) < 0) ||
                  (maxDate && dayDiff(date, maxDate) > 0),
                )
                const inRange = Boolean(
                  lo && hi && dayDiff(date, lo) >= 0 && dayDiff(date, hi) <= 0,
                )
                const edge = sameDay(date, lo) || sameDay(date, hi)
                const isToday = sameDay(date, today)
                return (
                  <span
                    key={key}
                    role="gridcell"
                    aria-selected={inRange}
                    style={{ width: 'var(--cell)', height: 'var(--cell)' }}
                  >
                    <button
                      type="button"
                      className={cn(
                        'relative flex size-full items-center justify-center rounded-md text-sm tabular-nums outline-none',
                        'hover:bg-accent focus-visible:ring-ring/60 transition-colors focus-visible:ring-2',
                        'disabled:pointer-events-none disabled:opacity-40',
                        edge && 'bg-primary text-primary-foreground hover:bg-primary font-medium',
                        !edge && isToday && 'text-primary font-semibold',
                      )}
                      data-date={key}
                      tabIndex={key === tabbable ? 0 : -1}
                      disabled={disabled}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={formatters.day.format(date)}
                      onClick={() => onPick(date)}
                      onPointerEnter={() => {
                        if (!disabled) onHover(date)
                      }}
                      onFocus={() => onFocusDay(date)}
                      onKeyDown={(event) => onKey(event, date)}
                    >
                      {date.getDate()}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 月粒度面：一年 12 格。降级路径不做逐周拉伸的高亮层，选中即整格填色。 */
function MonthFace({
  face,
  range,
  tabbable,
  today,
  minDate,
  maxDate,
  formatters,
  idBase,
  onPick,
  onKey,
  onFocusDay,
}: Omit<FaceProps, 'reduced' | 'weekStartsOn' | 'onHover'>) {
  const titleId = `${idBase}-${keyOf(face)}`
  const cells = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(face.getFullYear(), index, 1)),
    [face],
  )

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <p id={titleId} className="text-muted-foreground px-9 text-center text-sm font-medium">
        {face.getFullYear()}
      </p>
      <div
        role="grid"
        aria-labelledby={titleId}
        className="grid w-[calc(var(--cell)*3+8px)] grid-cols-3 gap-1"
      >
        {cells.map((date) => {
          const key = keyOf(date)
          const disabled = Boolean(
            (minDate && dayDiff(monthEnd(date), minDate) < 0) ||
            (maxDate && dayDiff(monthStart(date), maxDate) > 0),
          )
          const inRange = Boolean(
            range && dayDiff(date, range.start) >= 0 && dayDiff(date, range.end) <= 0,
          )
          const edge = sameDay(date, range?.start) || sameDay(date, range?.end)
          const isToday =
            date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()
          return (
            <span key={key} role="gridcell" aria-selected={inRange} className="flex">
              <button
                type="button"
                className={cn(
                  'hover:bg-accent relative h-9 w-[var(--cell)] rounded-md text-sm outline-none',
                  'focus-visible:ring-ring/60 transition-colors focus-visible:ring-2',
                  'disabled:pointer-events-none disabled:opacity-40',
                  inRange && !edge && 'bg-primary/15',
                  edge && 'bg-primary text-primary-foreground hover:bg-primary font-medium',
                  !edge && isToday && 'text-primary font-semibold',
                )}
                data-date={key}
                tabIndex={key === tabbable ? 0 : -1}
                disabled={disabled}
                aria-label={formatters.monthLong.format(date)}
                onClick={() => onPick(date)}
                onFocus={() => onFocusDay(date)}
                onKeyDown={(event) => onKey(event, date)}
              >
                {formatters.monthCell.format(date)}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

type PickerProps = {
  mode: Mode
  granularity: DateGranularity
  committed: DateRange | null
  onApply: (range: DateRange) => void
  onClear?: () => void
  showTime: TimePrecision
  presetConfig: DatePresetConfig
  label: string
  placeholder: string
  minDate?: Date
  maxDate?: Date
  weekStartsOn: 0 | 1
  locale: string
  months: 'auto' | 1 | 2
  boundary?: () => HTMLElement | null
  className?: string
  disabled?: boolean
}

function Picker({
  mode,
  granularity,
  committed,
  onApply,
  onClear,
  showTime,
  presetConfig,
  label,
  placeholder,
  minDate,
  maxDate,
  weekStartsOn,
  locale,
  months,
  boundary,
  className,
  disabled,
}: PickerProps) {
  const { t } = useTranslation('common')
  const reduced = usePrefersReducedMotion()
  const today = useToday()
  const uid = useId()

  const [phase, setPhase] = useState<Phase>('closed')
  const [compact, setCompact] = useState(false)
  const [panelWidth, setPanelWidth] = useState(0)
  const [cell, setCell] = useState<number>(GRID[granularity].cell)
  const [view, setView] = useState<Date>(() => faceStart(committed?.end ?? today, granularity))
  const [direction, setDirection] = useState(0)
  const [draft, setDraft] = useState<DateRange | null>(committed)
  const [anchor, setAnchor] = useState<Date | null>(null)
  const [hover, setHover] = useState<Date | null>(null)
  const [focusKey, setFocusKey] = useState('')
  const [time, setTime] = useState('')

  const open = phase === 'open'

  const formatters = useMemo<Formatters>(
    () => ({
      label: new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: granularity === 'day' ? 'numeric' : undefined,
        year: 'numeric',
      }),
      withTime: new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: showTime === 'second' ? '2-digit' : undefined,
      }),
      title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      day: new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }),
      monthLong: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      monthCell: new Intl.DateTimeFormat(locale, { month: 'short' }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
      weekdayLong: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    }),
    [granularity, locale, showTime],
  )

  const format = useCallback(
    (range: DateRange | null) => {
      if (!range) return placeholder
      if (granularity === 'day' && showTime !== 'none')
        return formatters.withTime.format(range.start)
      if (sameDay(range.start, range.end)) return formatters.label.format(range.start)
      return formatters.label.formatRange(range.start, range.end)
    },
    [formatters, granularity, placeholder, showTime],
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    if (presetConfig === 'none') return []
    if (Array.isArray(presetConfig)) return presetConfig
    return (granularity === 'day' ? DAY_PRESETS : MONTH_PRESETS).map((key) => ({
      key,
      range: (day: Date) => align(PRESET_RANGE[key](day), granularity),
    }))
  }, [granularity, presetConfig])

  const railVisible = presets.length > 0
  const count = compact ? 1 : 2
  const visible = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => addMonths(view, index * faceMonths(granularity))),
    [count, granularity, view],
  )
  const shown = anchor ? align(ordered(anchor, hover ?? anchor), granularity) : draft
  const activePreset =
    anchor || mode === 'single'
      ? -1
      : presets.findIndex((preset) => sameRange(preset.range(today), draft))
  const dayCount = shown ? dayDiff(shown.end, shown.start) + 1 : 0
  const committedDirection = useDirection(committed)
  const shownDirection = useDirection(shown)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<'trigger' | 'day' | null>(null)
  const boxes = useRef<{ trigger: Box; panel: Size | null }>({
    trigger: { x: 0, y: 0, w: 0, h: 0 },
    panel: null,
  })
  const queued = useRef(false)

  /* ---------- 一个表面：触发器的方框弹到面板方框，再弹回来 ---------- */
  // 面板必须 portal 到 body：调用点的外层（Card、ItemPanel）都是 overflow-hidden，
  // 而且祖先用 motion 做 height 动画会形成 fixed 的包含块，inline 的浮层会被裁掉。
  const mvX = useMotionValue(0)
  const mvY = useMotionValue(0)
  const mvW = useMotionValue(0)
  const mvH = useMotionValue(0)
  const mvFade = useMotionValue(1)

  const bounds = useCallback(() => {
    const viewport = {
      left: 0,
      right: document.documentElement.clientWidth,
      top: 0,
      bottom: window.innerHeight,
    }
    const element = boundary?.()
    if (!element) return viewport
    const rect = element.getBoundingClientRect()
    return {
      left: Math.max(viewport.left, rect.left),
      right: Math.min(viewport.right, rect.right),
      top: Math.max(viewport.top, rect.top),
      bottom: Math.min(viewport.bottom, rect.bottom),
    }
  }, [boundary])

  const readTrigger = useCallback(() => {
    const node = triggerRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    boxes.current.trigger = { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  }, [])

  /** 默认落在触发器下方；下方放不下且上方更宽敞时翻到上方，左右按可视区夹住。 */
  const placeFor = useCallback(
    (size: Size): Box => {
      const trigger = boxes.current.trigger
      const box = bounds()
      const above =
        trigger.y + trigger.h + GAP_TRIGGER + size.h > box.bottom &&
        trigger.y - GAP_TRIGGER - size.h >= box.top
      const y = above ? trigger.y - GAP_TRIGGER - size.h : trigger.y + trigger.h + GAP_TRIGGER
      const x = Math.max(box.left + EDGE, Math.min(trigger.x, box.right - EDGE - size.w))
      return { x, y, w: size.w, h: size.h }
    },
    [bounds],
  )

  const update = useCallback(() => {
    queued.current = false
    readTrigger()
    const trigger = boxes.current.trigger
    const grown = phase === 'open' && boxes.current.panel ? placeFor(boxes.current.panel) : null
    const target = grown ?? trigger
    const options = reduced ? { duration: 0 } : grown ? GROW : SHRINK
    animate(mvX, target.x, options)
    animate(mvY, target.y, options)
    animate(mvW, target.w, options)
    animate(mvH, target.h, options)
    // 收拢末尾把外壳淡掉，与底下的触发器交叉淡入，避免文字凭空消失的那一段空白。
    animate(
      mvFade,
      grown ? 1 : 0,
      reduced ? { duration: 0 } : { duration: 0.14, delay: 0.24, ease: standardEase },
    )
  }, [mvFade, mvH, mvW, mvX, mvY, phase, placeFor, readTrigger, reduced])

  const schedule = useCallback(() => {
    if (queued.current) return
    queued.current = true
    queueMicrotask(update)
  }, [update])

  /* ---------- 布局：够宽就双页，否则收成单页 + 横向预设行 ---------- */
  const measureLayout = useCallback(() => {
    const box = bounds()
    const available = Math.max(0, box.right - box.left - EDGE * 2)
    const { cols, cell: base, gap } = GRID[granularity]
    const content = cols * base + (cols - 1) * gap
    // 单页时预设行横铺在日历上方，不额外占宽。
    const single = PANEL_PAD * 2 + content
    const double = PANEL_PAD * 2 + content * 2 + PANEL_GAP + (railVisible ? PANEL_GAP + RAIL_W : 0)
    const two = months !== 1 && (months === 2 || available >= double)
    const width = Math.max(280, Math.min(two ? double : single, available))
    const perFace = (width - PANEL_PAD * 2 - (two ? PANEL_GAP : 0)) / (two ? 2 : 1)
    const fitted = Math.floor((perFace - (cols - 1) * gap) / cols)
    return { two, width, cell: Math.max(28, Math.min(base, fitted)) }
  }, [bounds, granularity, months, railVisible])

  const viewFor = useCallback(
    (range: DateRange | null, two: boolean, fallback: Date) => {
      const end = faceStart(range?.end ?? fallback, granularity)
      return two ? addMonths(end, -faceMonths(granularity)) : end
    },
    [granularity],
  )

  const openPanel = () => {
    const next = measureLayout()
    setCompact(!next.two)
    setPanelWidth(next.width)
    setCell(next.cell)
    setDraft(committed)
    setAnchor(null)
    setHover(null)
    setView(viewFor(committed, next.two, today))
    setDirection(0)
    setFocusKey(keyOf(committed?.start ?? today))
    setTime(committed ? timeOf(committed.start, showTime === 'none' ? 'minute' : showTime) : '')
    pendingFocus.current = 'day'
    boxes.current.panel = null
    readTrigger()
    const trigger = boxes.current.trigger
    mvX.jump(trigger.x)
    mvY.jump(trigger.y)
    mvW.jump(trigger.w)
    mvH.jump(trigger.h)
    mvFade.jump(1)
    setPhase('open')
  }

  const close = useCallback(
    (focus: boolean) => {
      if (phase === 'closed') return
      if (focus) pendingFocus.current = 'trigger'
      setDirection(0)
      setPhase('closing')
    },
    [phase],
  )

  const apply = () => {
    const pending =
      mode === 'range' && anchor ? align({ start: anchor, end: anchor }, granularity) : draft
    if (!pending) return
    const parts = showTime === 'none' ? null : time ? parseTime(time) : null
    onApply(
      parts
        ? { start: withTime(pending.start, parts), end: withTime(pending.end, parts) }
        : pending,
    )
    close(true)
  }

  /* ---------- 收拢走完才卸载门户外壳 ---------- */
  useLayoutEffect(() => {
    if (phase !== 'closing') return
    const timer = window.setTimeout(
      () => {
        setPhase('closed')
        boxes.current.panel = null
        if (pendingFocus.current === 'trigger') {
          pendingFocus.current = null
          triggerRef.current?.focus({ preventScroll: true })
        }
      },
      reduced ? 0 : CLOSE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase, reduced])

  useLayoutEffect(() => {
    if (phase === 'closed') return
    if (phase === 'open') {
      readTrigger()
      const trigger = boxes.current.trigger
      mvX.jump(trigger.x)
      mvY.jump(trigger.y)
      mvW.jump(trigger.w)
      mvH.jump(trigger.h)
      mvFade.jump(1)
      schedule()
    } else {
      update()
    }
  }, [mvFade, mvH, mvW, mvX, mvY, phase, readTrigger, schedule, update])

  /* ---------- 焦点管理 ---------- */
  useLayoutEffect(() => {
    if (phase !== 'open' || pendingFocus.current !== 'day') return
    const node = panelRef.current?.querySelector<HTMLButtonElement>(
      `[data-face="${keyOf(view)}"] [data-date="${focusKey}"]`,
    )
    if (!node) return
    pendingFocus.current = null
    node.focus({ preventScroll: true })
  }, [focusKey, phase, view, compact, count])

  useEffect(() => {
    if (phase === 'closed') return
    const node = triggerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => schedule())
    observer.observe(node)
    return () => observer.disconnect()
  }, [phase, schedule])

  useEffect(() => {
    if (phase === 'closed') return
    const node = panelRef.current
    if (!node) return
    const read = () => {
      boxes.current.panel = { w: node.offsetWidth, h: node.offsetHeight }
      schedule()
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  }, [phase, schedule])

  // 外壳是 fixed 的：滚动或缩放时重算触发器方框并瞬间对齐，否则面板会和触发器脱开。
  useEffect(() => {
    if (phase === 'closed') return
    const onMove = () => {
      readTrigger()
      schedule()
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, { capture: true })
    }
  }, [phase, readTrigger, schedule])

  useEffect(() => {
    if (phase === 'closed') return
    const down = (event: PointerEvent) => {
      const node = event.target as Node | null
      if (!node) return
      if (rootRef.current?.contains(node) || panelRef.current?.contains(node)) return
      close(false)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [close, phase])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && phase !== 'closed') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
  }

  const onBlur = (event: ReactFocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null
    if (phase === 'closed' || !next) return
    if (rootRef.current?.contains(next) || panelRef.current?.contains(next)) return
    close(false)
  }

  /* ---------- 翻页与选点 ---------- */
  const goTo = (next: Date) => {
    const delta = monthDiff(next, view) / faceMonths(granularity)
    if (!delta) return
    setDirection(Math.sign(delta))
    setView(next)
  }

  /** 让区间落在屏幕上：已经放得下就不动，否则把它最后那一页对齐到右侧。 */
  const reveal = (range: DateRange) => {
    const span = faceMonths(granularity)
    const last = addMonths(view, (count - 1) * span)
    if (monthDiff(range.start, view) >= 0 && monthDiff(range.end, last) <= 0) return
    goTo(addMonths(faceStart(range.end, granularity), -(count - 1) * span))
  }

  const pick = (date: Date) => {
    const target = granularity === 'day' ? date : monthStart(date)
    setFocusKey(keyOf(target))
    if (mode === 'single') {
      setDraft(align({ start: target, end: target }, granularity))
      setAnchor(null)
      setHover(null)
      return
    }
    if (!anchor) {
      setAnchor(target)
      setHover(target)
      return
    }
    setDraft(align(ordered(anchor, target), granularity))
    setAnchor(null)
    setHover(null)
  }

  const choosePreset = (preset: DateRangePreset) => {
    const range = preset.range(today)
    setDraft(range)
    setAnchor(null)
    setHover(null)
    setFocusKey(keyOf(range.start))
    setTime(timeOf(range.start, showTime === 'none' ? 'minute' : showTime))
    reveal(range)
  }

  const onKey = (event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) => {
    const weekIndex = (date.getDay() - weekStartsOn + 7) % 7
    const moves: Record<string, () => Date> =
      granularity === 'day'
        ? {
            ArrowLeft: () => addDays(date, -1),
            ArrowRight: () => addDays(date, 1),
            ArrowUp: () => addDays(date, -7),
            ArrowDown: () => addDays(date, 7),
            Home: () => addDays(date, -weekIndex),
            End: () => addDays(date, 6 - weekIndex),
            PageUp: () => shiftMonths(date, event.shiftKey ? -12 : -1),
            PageDown: () => shiftMonths(date, event.shiftKey ? 12 : 1),
          }
        : {
            ArrowLeft: () => addMonths(date, -1),
            ArrowRight: () => addMonths(date, 1),
            ArrowUp: () => addMonths(date, -3),
            ArrowDown: () => addMonths(date, 3),
            Home: () => yearStart(date),
            End: () => new Date(date.getFullYear(), 11, 1),
            PageUp: () => addMonths(date, -12),
            PageDown: () => addMonths(date, 12),
          }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const next = clampDate(move(), minDate, maxDate)
    setFocusKey(keyOf(next))
    if (anchor) setHover(next)
    pendingFocus.current = 'day'
    const span = faceMonths(granularity)
    const last = addMonths(view, (count - 1) * span)
    if (monthDiff(next, view) < 0) goTo(faceStart(next, granularity))
    else if (monthDiff(next, last) > 0)
      goTo(addMonths(faceStart(next, granularity), -(count - 1) * span))
  }

  const onRailKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = compact ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
    if (!keys.includes(event.key)) return
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-preset]'),
    )
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    event.preventDefault()
    buttons[(at + (event.key === keys[1] ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }

  /** 谁持有 tab 停靠位：焦点日在屏内就用它，否则用可见区间的第一天，再否则用第一格。 */
  const tabbable = useMemo(() => {
    const onScreen = (date: Date) =>
      visible.some((face) => keyOf(face) === keyOf(faceStart(date, granularity)))
    if (focusKey && onScreen(fromKey(focusKey))) return focusKey
    if (shown && onScreen(shown.start)) return keyOf(shown.start)
    return keyOf(visible[0]!)
  }, [focusKey, granularity, shown, visible])

  /* ---------- 预设高亮在预设之间滑行 ---------- */
  const gx = useMotionValue(0)
  const gy = useMotionValue(0)
  const gw = useMotionValue(0)
  const gh = useMotionValue(0)
  const go = useMotionValue(0)
  useLayoutEffect(() => {
    const rail = railRef.current
    const node =
      activePreset < 0 ? null : rail?.querySelector<HTMLElement>(`[data-preset="${activePreset}"]`)
    if (!rail || !node) {
      animate(go, 0, { duration: reduced ? 0 : 0.14 })
      return
    }
    const place = [node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight] as const
    if (go.get() < 0.05 || reduced) {
      gx.jump(place[0])
      gy.jump(place[1])
      gw.jump(place[2])
      gh.jump(place[3])
    } else {
      animate(gx, place[0], GLIDE)
      animate(gy, place[1], GLIDE)
      animate(gw, place[2], GLIDE)
      animate(gh, place[3], GLIDE)
    }
    animate(go, 1, { duration: reduced ? 0 : 0.16 })
    if (compact) {
      const outside =
        node.offsetLeft < rail.scrollLeft ||
        node.offsetLeft + node.offsetWidth > rail.scrollLeft + rail.clientWidth
      if (outside)
        rail.scrollTo({ left: node.offsetLeft - 12, behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [activePreset, compact, gh, go, gw, gx, gy, phase, reduced])

  /* ---------- 文案 ---------- */
  const committedText = format(committed)
  const shownText = shown ? format(shown) : t('datePicker.noDates')
  // 月粒度下「多少天」没有意义，直接不显示。
  const countText =
    shown && granularity === 'day' ? t('datePicker.dayCount', { count: dayCount }) : ''
  const status = !open
    ? ''
    : anchor
      ? t('datePicker.pickEndStatus', { start: format({ start: anchor, end: anchor }) })
      : shown
        ? `${shownText}${countText ? `, ${countText}` : ''}`
        : ''

  const panelMarkup = (
    <div
      ref={panelRef}
      id={`${uid}-panel`}
      role="dialog"
      aria-label={label}
      className="absolute top-0 left-0 flex flex-col"
      style={{ width: panelWidth || undefined, '--cell': `${cell}px` } as CSSProperties}
      data-compact={compact || undefined}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <motion.div
        className={cn('flex gap-3 p-4', compact ? 'flex-col' : 'flex-row')}
        variants={reduced ? faceFade : faceIn}
        initial="hidden"
        animate="shown"
        exit="gone"
      >
        {railVisible && (
          <div
            ref={railRef}
            role="group"
            aria-label={t('datePicker.presetsGroup')}
            onKeyDown={onRailKey}
            className={cn(
              'relative min-w-0',
              compact
                ? 'flex gap-1 overflow-x-auto pb-1'
                : 'flex w-33 shrink-0 flex-col gap-0.5 self-start',
            )}
          >
            <motion.span
              className="bg-accent absolute top-0 left-0 rounded-md"
              style={{ x: gx, y: gy, width: gw, height: gh, opacity: go }}
              aria-hidden="true"
            />
            {presets.map((preset, index) => (
              <button
                key={preset.key}
                type="button"
                className={cn(
                  'hover:bg-accent/60 relative shrink-0 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap outline-none',
                  'focus-visible:ring-ring/60 transition-colors focus-visible:ring-2',
                  index === activePreset && 'font-medium',
                )}
                data-preset={index}
                aria-pressed={index === activePreset}
                onClick={() => choosePreset(preset)}
              >
                {t(`datePicker.presets.${preset.key}`)}
              </button>
            ))}
          </div>
        )}

        <div className="relative min-w-0 flex-1" onPointerLeave={() => setHover(null)}>
          <button
            type="button"
            aria-label={t(granularity === 'day' ? 'datePicker.prevMonth' : 'datePicker.prevYear')}
            onClick={() => goTo(addMonths(view, -faceMonths(granularity)))}
            disabled={Boolean(minDate && monthDiff(view, faceStart(minDate, granularity)) <= 0)}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'absolute top-0 left-0 z-10 size-7 shrink-0 p-0 opacity-70 hover:opacity-100',
            )}
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t(granularity === 'day' ? 'datePicker.nextMonth' : 'datePicker.nextYear')}
            onClick={() => goTo(addMonths(view, faceMonths(granularity)))}
            disabled={Boolean(
              maxDate &&
              monthDiff(
                addMonths(view, (count - 1) * faceMonths(granularity)),
                monthEnd(maxDate),
              ) >= 0,
            )}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'absolute top-0 right-0 z-10 size-7 shrink-0 p-0 opacity-70 hover:opacity-100',
            )}
          >
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="relative overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
              <motion.div
                key={`${keyOf(view)}-${count}`}
                data-face={keyOf(view)}
                className="flex gap-3"
                custom={direction}
                variants={reduced ? fade : slide}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {visible.map((face) =>
                  granularity === 'day' ? (
                    <DayFace
                      key={keyOf(face)}
                      face={face}
                      range={shown}
                      tabbable={tabbable}
                      today={today}
                      minDate={minDate}
                      maxDate={maxDate}
                      weekStartsOn={weekStartsOn}
                      reduced={reduced}
                      formatters={formatters}
                      idBase={uid}
                      onPick={pick}
                      onHover={(date) => {
                        if (anchor) setHover(date)
                      }}
                      onKey={onKey}
                      onFocusDay={(date) => setFocusKey(keyOf(date))}
                    />
                  ) : (
                    <MonthFace
                      key={keyOf(face)}
                      face={face}
                      range={shown}
                      tabbable={tabbable}
                      today={today}
                      minDate={minDate}
                      maxDate={maxDate}
                      formatters={formatters}
                      idBase={uid}
                      onPick={pick}
                      onKey={onKey}
                      onFocusDay={(date) => setFocusKey(keyOf(date))}
                    />
                  ),
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {showTime !== 'none' && (
        <div className="bg-muted/40 mx-4 mb-3 flex items-center justify-between gap-2 rounded-md px-3 py-2">
          <span className="text-muted-foreground text-sm">{t('datePicker.time')}</span>
          <Input
            type="time"
            value={time.slice(0, showTime === 'second' ? 8 : 5)}
            step={showTime === 'second' ? 1 : 60}
            onChange={(event) => {
              const value = event.target.value
              if (!value) {
                setTime('')
                return
              }
              const parts = parseTime(value)
              setTime(
                showTime === 'second'
                  ? `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
                  : `${pad2(parts.hour)}:${pad2(parts.minute)}:00`,
              )
            }}
            className="h-8 w-32 bg-transparent font-mono"
            aria-label={t('datePicker.time')}
          />
        </div>
      )}

      <div className="border-t px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="min-w-0 truncate text-sm font-medium">
              <Rolling text={shownText} direction={shownDirection} reduced={reduced} />
            </span>
            <span className="text-muted-foreground text-xs">
              {countText && (
                <Rolling
                  text={anchor && sameDay(anchor, hover) ? t('datePicker.pickEnd') : countText}
                  direction={shownDirection}
                  reduced={reduced}
                />
              )}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onClear && committed && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  onClear()
                  close(true)
                }}
              >
                {t('datePicker.clear')}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => close(true)}>
              {t('datePicker.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={apply} disabled={!shown}>
              {t('datePicker.apply')}
            </Button>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  )

  const shell = (
    <motion.div
      className={cn(
        'fixed top-0 left-0 z-50 overflow-hidden',
        !open && 'pointer-events-none',
        phase === 'closing' && 'pointer-events-none',
      )}
      style={{
        x: mvX,
        y: mvY,
        width: mvW,
        height: mvH,
        opacity: mvFade,
        borderRadius: open ? OPEN_RADIUS : CLOSED_RADIUS,
        transition: reduced ? undefined : RADIUS_TRANSITION,
      }}
      data-open={open || undefined}
      onKeyDown={onKeyDown}
    >
      <div
        className="bg-popover ring-foreground/10 absolute inset-0 rounded-[inherit] shadow-md ring-1"
        aria-hidden="true"
      />
      <div className="relative size-full">{panelMarkup}</div>
    </motion.div>
  )

  return (
    <>
      <div
        ref={rootRef}
        className={cn('relative w-full', className)}
        data-open={open || undefined}
        onKeyDown={onKeyDown}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${uid}-panel`}
          aria-label={committed ? `${label}: ${committedText}` : label}
          disabled={disabled}
          inert={open || undefined}
          onClick={openPanel}
          className={cn(
            'border-input bg-background text-foreground hover:bg-accent/50',
            'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
            'focus-visible:ring-ring/60 transition-colors outline-none focus-visible:ring-2',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <CalendarDays
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0 opacity-60"
            style={{ opacity: open ? 0 : 0.6 }}
          />
          <span className={cn('min-w-0 truncate', !committed && 'text-muted-foreground')}>
            <motion.span
              className="inline-block"
              initial={false}
              animate={{ opacity: open ? 0 : 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : open
                    ? { duration: motionTokens.duration.quick }
                    : { duration: motionTokens.duration.base, delay: 0.24 }
              }
            >
              <Rolling text={committedText} direction={committedDirection} reduced={reduced} />
            </motion.span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0"
            style={{ opacity: open ? 0 : 0.6 }}
          />
        </button>
      </div>

      {phase !== 'closed' ? createPortal(shell, document.body) : null}
    </>
  )
}

/** 双语站点：没显式指定 locale 时跟随当前语言。 */
function useLocale(explicit: string | undefined) {
  const { i18n } = useTranslation()
  return explicit ?? (i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US')
}

/** 周日还是周一起手：中文环境习惯周一起。 */
function useWeekStart(explicit: 0 | 1 | undefined, locale: string): 0 | 1 {
  const { i18n } = useTranslation()
  if (explicit !== undefined) return explicit
  return /^zh\b/i.test(locale || i18n.language || '') ? 1 : 0
}

export type DatePickerBaseProps = {
  granularity?: DateGranularity
  presets?: DatePresetConfig
  label?: string
  placeholder?: string
  minDate?: Date
  maxDate?: Date
  weekStartsOn?: 0 | 1
  locale?: string
  months?: 'auto' | 1 | 2
  boundary?: () => HTMLElement | null
  className?: string
  disabled?: boolean
}

export type DateRangePickerProps = DatePickerBaseProps & {
  value?: DateRange | null
  defaultValue?: DateRange | null
  onChange?: (range: DateRange) => void
}

/**
 * 全局日期区间选择器：触发器长成面板，双页 + 预设栏，窄屏收成单页横向预设行。
 *
 * 降级开关：`granularity="month"` 收成一年 12 格（原本只到月的调用点用它），
 * `presets="none"` 整条预设栏不渲染（原本没有快捷区间的调用点用它）。
 */
export function DateRangePicker({
  value,
  defaultValue = null,
  onChange,
  granularity = 'day',
  presets = 'default',
  label,
  placeholder,
  minDate,
  maxDate,
  weekStartsOn,
  locale,
  months = 'auto',
  boundary,
  className,
  disabled,
}: DateRangePickerProps) {
  const { t } = useTranslation('common')
  const resolvedLocale = useLocale(locale)
  const resolvedWeekStart = useWeekStart(weekStartsOn, resolvedLocale)
  const [inner, setInner] = useState<DateRange | null>(defaultValue)
  const committed = value !== undefined ? value : inner

  return (
    <Picker
      mode="range"
      granularity={granularity}
      committed={committed}
      onApply={(next) => {
        if (value === undefined) setInner(next)
        onChange?.(next)
      }}
      showTime="none"
      presetConfig={presets}
      label={label ?? t('datePicker.rangeLabel')}
      placeholder={placeholder ?? t('datePicker.placeholder')}
      minDate={minDate}
      maxDate={maxDate}
      weekStartsOn={resolvedWeekStart}
      locale={resolvedLocale}
      months={months}
      boundary={boundary}
      className={className}
      disabled={disabled}
    />
  )
}

export type DatePickerProps = DatePickerBaseProps & {
  value?: Date | null
  defaultValue?: Date | null
  onChange?: (date: Date) => void
  /** 传入才会出现面板底部的「清除」按钮。 */
  onClear?: () => void
  /** 原本就带时刻的调用点用它保留时分（可细到秒）；不传即只显示日期。 */
  showTime?: TimePrecision
}

/** 单日选择。`granularity="month"` + 不传 `showTime` 就降级成「选到月」。 */
export function DatePicker({
  value,
  defaultValue = null,
  onChange,
  onClear,
  showTime = 'none',
  granularity = 'day',
  presets = 'default',
  label,
  placeholder,
  minDate,
  maxDate,
  weekStartsOn,
  locale,
  months = 'auto',
  boundary,
  className,
  disabled,
}: DatePickerProps) {
  const { t } = useTranslation('common')
  const resolvedLocale = useLocale(locale)
  const resolvedWeekStart = useWeekStart(weekStartsOn, resolvedLocale)
  const [inner, setInner] = useState<Date | null>(defaultValue)
  const current = value !== undefined ? value : inner
  const toRange = (date: Date | null) => (date ? { start: date, end: date } : null)

  return (
    <Picker
      mode="single"
      granularity={granularity}
      committed={toRange(current)}
      onApply={(next) => {
        if (value === undefined) setInner(next.start)
        onChange?.(next.start)
      }}
      onClear={
        onClear
          ? () => {
              if (value === undefined) setInner(null)
              onClear()
            }
          : undefined
      }
      showTime={showTime}
      presetConfig={presets}
      label={label ?? t('datePicker.singleLabel')}
      placeholder={placeholder ?? t('datePicker.placeholder')}
      minDate={minDate}
      maxDate={maxDate}
      weekStartsOn={resolvedWeekStart}
      locale={resolvedLocale}
      months={months}
      boundary={boundary}
      className={className}
      disabled={disabled}
    />
  )
}
