import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'

import type { CalcResult } from '../salary-calculator.service'
import type { LivingCost } from '../salary-data'
import { formatMoney } from '../salary-form'

const SEGMENTS = [
  { key: 'rent', tone: 'bg-muted-foreground/70' },
  { key: 'commute', tone: 'bg-muted-foreground/50' },
  { key: 'food', tone: 'bg-muted-foreground/35' },
  { key: 'misc', tone: 'bg-muted-foreground/20' },
] as const

/** 成本占比手绘堆叠条：项目无图表库依赖，用 flex + 百分比宽度即可，颜色一律走语义令牌 */
export function CostBreakdown({
  result,
  living,
  locale,
}: {
  result: CalcResult
  living: LivingCost
  locale: string
}) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const base = Math.max(result.monthlyTakeHomeAverage, 1)
  const saving = Math.max(result.monthlyDisposable, 0)

  const parts = [
    ...SEGMENTS.map((segment) => ({
      key: segment.key,
      tone: segment.tone,
      value: living[segment.key],
    })),
    { key: 'saving', tone: 'bg-primary', value: saving },
  ]

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">{t('results.breakdownTitle')}</h2>
      <div className="bg-muted flex h-4 w-full overflow-hidden rounded-full">
        {parts.map((part) => (
          <div
            key={part.key}
            className={part.tone}
            style={{ width: `${(part.value / base) * 100}%` }}
            title={t(`results.segment.${part.key}`)}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((part) => (
          <li key={part.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className={`${part.tone} size-2.5 rounded-full`} />
            {t(`results.segment.${part.key}`)}
            <span className="font-mono">{formatMoney(part.value, locale)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
