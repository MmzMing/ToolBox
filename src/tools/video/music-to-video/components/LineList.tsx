/**
 * 行与镜头列表：逐行的起点秒、构图指定、单行重抽与锁定。
 *
 * 这是原项目最重要的交互面：planner 的随机结果不满意时，不必整片重抽，
 * 只对那一行重抽或锁住，改完仍是确定性的。
 */
import { useEffect, useMemo, useRef } from 'react'
import { Lock, RotateCcw, Dices } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LAYOUTS } from '../engine/registry'
import type { Cut, Plan } from '../engine/types'
import { LayoutPicker } from './LayoutPicker'

/** 秒数输入：居中收窄到刚好装下 6 个等宽字符，并抹掉浏览器在右侧给步进按钮留的空白 */
const TIME_INPUT =
  'h-6 w-[52px] shrink-0 px-1 text-center font-mono text-[11px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

const hueOf = new Map(
  Object.keys(LAYOUTS)
    .filter((k) => !LAYOUTS[k]?.special)
    .map((k, i) => [k, (i * 37 + 30) % 360]),
)

type LineListProps = {
  plan: Plan
  /** 手工指定的行起点（秒） */
  lineTimes: Record<number, number>
  /** 逐行覆盖（构图 / 锁定 / 重抽计数） */
  overrides: Record<number, { layout?: string; lock?: boolean; seed?: number }>
  currentLine: number
  onSeek: (t: number) => void
  onSetLineTime: (line: number, seconds: number | null) => void
  onSetLayout: (line: number, layout: string | null) => void
  onReroll: (line: number) => void
  onToggleLock: (line: number, locked: boolean) => void
  onClearTimes: () => void
}

export function LineList({
  plan,
  lineTimes,
  overrides,
  currentLine,
  onSeek,
  onSetLineTime,
  onSetLayout,
  onReroll,
  onToggleLock,
  onClearTimes,
}: LineListProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const activeRef = useRef<HTMLLIElement>(null)

  // 播放到哪一行，就让那一行留在视野里
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentLine])

  // 一次分组，代替每行各自过滤一遍全部镜头
  const cutsByLine = useMemo(() => {
    const map = new Map<number, Cut[]>()
    for (const c of plan.cuts) {
      if (c.line < 0 || LAYOUTS[c.layout]?.special) continue
      const list = map.get(c.line)
      if (list) list.push(c)
      else map.set(c.line, [c])
    }
    return map
  }, [plan.cuts])

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">
          {t('lines.info', { lines: plan.lines.length, cuts: plan.cuts.length })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-[11px]"
          onClick={onClearTimes}
        >
          <RotateCcw className="size-3" />
          {t('lines.clearTimes')}
        </Button>
      </div>
      <ul className="flex min-h-0 min-w-0 flex-col gap-1">
        {plan.lines.map((ln) => {
          const ov = overrides[ln.index] || {}
          const manual = lineTimes[ln.index] != null
          const cuts = cutsByLine.get(ln.index) ?? []
          return (
            <li
              key={ln.index}
              ref={currentLine === ln.index ? activeRef : undefined}
              className={
                currentLine === ln.index
                  ? 'bg-primary/10 border-primary/40 min-w-0 rounded-md border px-1.5 py-1.5'
                  : 'hover:bg-accent/40 min-w-0 rounded-md border border-transparent px-1.5 py-1.5'
              }
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted-foreground w-5 shrink-0 font-mono text-[11px]">
                  {String(ln.index + 1).padStart(2, '0')}
                </span>
                <Input
                  type="number"
                  step={0.01}
                  min={0}
                  defaultValue={ln.start.toFixed(2)}
                  key={`${ln.index}-${ln.start.toFixed(2)}-${manual}`}
                  aria-label={t('lines.startAria', { line: ln.index + 1 })}
                  className={manual ? `border-primary ${TIME_INPUT}` : TIME_INPUT}
                  onBlur={(e) => {
                    const v = Number.parseFloat(e.target.value)
                    onSetLineTime(ln.index, Number.isFinite(v) ? Math.max(0, v) : null)
                  }}
                />
                <button
                  type="button"
                  /* w-0 不能省：滚动区内层是 display:table，nowrap 文本会按 max-content 把整列撑破 */
                  className="w-0 min-w-0 flex-1 truncate text-left text-xs"
                  title={ln.text}
                  onClick={() => onSeek(ln.start + 0.001)}
                >
                  {ln.text}
                </button>
                <LayoutPicker
                  value={ov.layout ?? null}
                  label={t('lines.layoutAria')}
                  onChange={(layout) => onSetLayout(ln.index, layout)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0"
                  aria-label={t('lines.reroll')}
                  title={t('lines.reroll')}
                  onClick={() => onReroll(ln.index)}
                >
                  <Dices className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant={ov.lock ? 'default' : 'ghost'}
                  className="size-6 shrink-0"
                  aria-pressed={!!ov.lock}
                  aria-label={t('lines.lock')}
                  title={t('lines.lock')}
                  onClick={() => onToggleLock(ln.index, !ov.lock)}
                >
                  <Lock className="size-3.5" />
                </Button>
              </div>
              {cuts.length > 0 ? (
                <div className="mt-1 flex min-w-0 flex-wrap gap-1 pl-[84px]">
                  {cuts.map((c) => (
                    <button
                      key={`${c.index}`}
                      type="button"
                      className="rounded border px-1 text-[10px]"
                      style={{ borderColor: `hsl(${hueOf.get(c.layout) ?? 0} 70% 58% / 0.7)` }}
                      title={`${c.text}｜${t(`parts.enter.${c.enter}`)} → ${t(`parts.exit.${c.exit}`)}`}
                      onClick={() => onSeek(c.start + Math.min(c.dur * 0.5, c.inDur + 0.05))}
                    >
                      {t(`parts.layout.${c.layout}`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
