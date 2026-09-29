import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'

import type { CalcResult } from '../salary-calculator.service'
import { formatMoney, formatPercent } from '../salary-form'

export function MonthlyTable({ result, locale }: { result: CalcResult; locale: string }) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t('results.tableTitle')}</h2>
        <p className="text-muted-foreground text-xs">{t('results.tableSubtitle')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">{t('table.month')}</th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                {t('table.cumulative')}
              </th>
              <th className="px-3 py-2 text-right font-medium">{t('table.rate')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('table.tax')}</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                {t('table.insurance')}
              </th>
              <th className="px-3 py-2 text-right font-medium">{t('table.takeHome')}</th>
            </tr>
          </thead>
          <tbody>
            {result.months.map((row) => (
              <tr key={row.month} className="border-t">
                <td className="px-3 py-1.5">{t('months.value', { n: row.month })}</td>
                <td className="hidden px-3 py-1.5 text-right font-mono lg:table-cell">
                  {formatMoney(row.cumulativeTaxable, locale)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatPercent(row.rate, locale)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{formatMoney(row.tax, locale)}</td>
                <td className="hidden px-3 py-1.5 text-right font-mono md:table-cell">
                  {formatMoney(row.insurance, locale)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatMoney(row.takeHome, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
