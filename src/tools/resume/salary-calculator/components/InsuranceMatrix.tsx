import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'

import type { CalcResult, EmployeeInsurance } from '../salary-calculator.service'
import { formatMoney } from '../salary-form'

type RowKey = 'pension' | 'medical' | 'unemployment' | 'injury' | 'maternity' | 'housing'

const ROWS: readonly { key: RowKey; itemKey: string }[] = [
  { key: 'pension', itemKey: 'items.pension' },
  { key: 'medical', itemKey: 'items.medical' },
  { key: 'unemployment', itemKey: 'items.unemployment' },
  { key: 'injury', itemKey: 'items.injury' },
  { key: 'maternity', itemKey: 'items.maternity' },
  { key: 'housing', itemKey: 'items.housing' },
]

/** 工伤与生育个人不缴，返回 null 让 UI 显示破折号而不是假的 0.00 */
function employeeValueOf(employee: EmployeeInsurance, key: RowKey): number | null {
  return key === 'injury' || key === 'maternity' ? null : employee[key]
}

export function InsuranceMatrix({
  result,
  grossMonthly,
  locale,
}: {
  result: CalcResult
  grossMonthly: number
  locale: string
}) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const { insurance } = result
  const employerCost = Math.round((grossMonthly + insurance.employer.total) * 100) / 100

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold">{t('results.matrixTitle')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">{t('matrix.item')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('matrix.employee')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('matrix.employer')}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, itemKey }) => (
              <tr key={key} className="border-t">
                <td className="px-3 py-1.5">{t(itemKey)}</td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {employeeValueOf(insurance.employee, key) === null
                    ? '—'
                    : formatMoney(employeeValueOf(insurance.employee, key) ?? 0, locale)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {formatMoney(insurance.employer[key], locale)}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 border-t font-medium">
              <td className="px-3 py-1.5">{t('matrix.total')}</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {formatMoney(insurance.employee.total, locale)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">
                {formatMoney(insurance.employer.total, locale)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {t('matrix.bases', {
          social: formatMoney(insurance.socialBase, locale),
          fund: formatMoney(insurance.fundBase, locale),
        })}
      </p>
      <p className="text-muted-foreground text-xs">
        {t('matrix.employerCost', { cost: formatMoney(employerCost, locale) })}
      </p>
    </Card>
  )
}
