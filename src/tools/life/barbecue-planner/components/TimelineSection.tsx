import { Flame } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { TIMELINE_PHASES } from '../data/timeline'
import { formatMinutes, isNum } from '../measure'
import type { TimelineEntry, TimelinePhase } from '../types'

const PHASE_ORDER: TimelinePhase[] = ['lead', 'ready', 'grill', 'close']

/** 阶段色带：只用现有语义令牌加透明度，不引入新的硬编码色值 */
const PHASE_RAIL: Record<TimelinePhase, string> = {
  lead: 'bg-muted-foreground/35',
  ready: 'bg-primary/40',
  grill: 'bg-primary',
  close: 'bg-muted-foreground/25',
}

function durationText(entry: TimelineEntry): string | null {
  if (!isNum(entry.durationMin)) {
    return null
  }
  const { min, max } = entry.durationMin
  // 提前量超过一小时时按小时说人话，"720 min" 没人能一眼读出来
  if (min >= 60 || max >= 60) {
    const show = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`)
    return min === max ? show(min) : `${show(min)}–${show(max)}`
  }
  return formatMinutes({ min, max })
}

/**
 * 烤制时间线。按阶段分组，左侧固定栏给真实钟点（由开烤时间推导），
 * 开烤那一刻单独高亮 —— 用户要的是一眼看出"几点该动手"，不是读一串 T-偏移。
 */
export function TimelineSection({
  entries,
  lang,
  grillStart,
}: {
  entries: TimelineEntry[]
  lang: 'zh' | 'en'
  grillStart: string
}) {
  const { t } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('emptyResult')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {PHASE_ORDER.map((phase) => {
        const rows = entries.filter((entry) => entry.phase === phase)
        if (rows.length === 0) {
          return null
        }
        return (
          <section key={phase} className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <span
                className={['h-2.5 w-2.5 rounded-full', PHASE_RAIL[phase]].join(' ')}
                aria-hidden
              />
              {TIMELINE_PHASES[phase][lang]}
            </h3>

            <Card className="divide-border flex flex-col divide-y rounded-xl p-0">
              {rows.map((entry) => {
                const isStart = entry.offsetMin === 0
                const duration = durationText(entry)
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="w-14 shrink-0 pt-0.5">
                      {isStart ? (
                        <span className="text-primary flex items-center gap-1 font-mono text-sm font-semibold tabular-nums">
                          <Flame className="size-3.5" />
                          {entry.clock}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-sm tabular-nums">
                          {entry.clock}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className={['text-sm', isStart ? 'font-semibold' : ''].join(' ')}>
                          {entry.title[lang]}
                        </span>
                        {duration ? (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {duration}
                          </Badge>
                        ) : null}
                      </div>
                      {entry.body[lang] ? (
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {entry.body[lang]}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </Card>
          </section>
        )
      })}

      <p className="text-muted-foreground text-xs">
        {t('timeline.startHint', { time: grillStart })}
      </p>
    </div>
  )
}
