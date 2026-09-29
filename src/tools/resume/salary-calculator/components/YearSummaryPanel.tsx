import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'

import { cityPresetOf } from '../salary-data'
import type { CalcResult } from '../salary-calculator.service'
import { formatMoney, formatPercent } from '../salary-form'

type Row = { label: string; value: string; muted?: boolean }

export function YearSummaryPanel({
  result,
  cityId,
  locale,
}: {
  result: CalcResult
  cityId: string
  locale: string
}) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const { year } = result
  const city = cityPresetOf(cityId)

  const rows: Row[] = [
    { label: t('summary.annualGross'), value: formatMoney(year.annualGross, locale) },
    {
      label: t('summary.monthsWorked'),
      value: t('months.count', { n: year.monthsWorked }),
      muted: year.monthsWorked === 12,
    },
    {
      label: t('summary.annualInsurance'),
      value: formatMoney(year.annualInsuranceEmployee, locale),
    },
    {
      label: t('summary.salaryTaxPrepaid'),
      value: formatMoney(year.annualSalaryTaxPrepaid, locale),
    },
    ...(year.settlementRefund > 0
      ? [
          {
            label: t('summary.settlementRefund'),
            value: formatMoney(year.settlementRefund, locale),
          },
        ]
      : []),
    {
      label: t('summary.bonusTax'),
      value: `${formatMoney(year.bonusTax, locale)} · ${t(`options.bonus${year.bonusMode === 'separate' ? 'Separate' : 'Merged'}`)}`,
    },
    { label: t('summary.effectiveTaxRate'), value: formatPercent(year.effectiveTaxRate, locale) },
    { label: t('summary.takeHomeRate'), value: formatPercent(year.takeHomeRate, locale) },
    { label: t('summary.annualNetCash'), value: formatMoney(year.annualNetCash, locale) },
    { label: t('summary.annualSaving'), value: formatMoney(result.annualSaving, locale) },
  ]

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">{t('results.summaryTitle')}</h2>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 border-t py-1.5 first:border-t-0"
          >
            <dt className={row.muted ? 'text-muted-foreground text-xs' : 'text-xs'}>{row.label}</dt>
            <dd className="text-right font-mono text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">
        {t('notes.housingFund', {
          monthly: formatMoney(
            result.insurance.employee.housing + result.insurance.employer.housing,
            locale,
          ),
        })}
      </p>
      {result.insurance.housingExcess > 0 && (
        <p className="text-muted-foreground text-xs">
          {t('notes.housingExcess', {
            amount: formatMoney(result.insurance.housingExcess, locale),
          })}
        </p>
      )}
      {city.socialBasePeriod && (
        <p className="text-muted-foreground text-xs">
          {t('notes.basePeriod', { period: city.socialBasePeriod })}
        </p>
      )}
    </Card>
  )
}
