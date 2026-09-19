import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  computeInsurance,
  defaultEmployeeRates,
  defaultEmployerRates,
  type InsuranceRates,
} from './social-insurance.service'

const RATE_FIELDS = [
  { key: 'pension', labelKey: 'rates.pension' },
  { key: 'medical', labelKey: 'rates.medical' },
  { key: 'unemployment', labelKey: 'rates.unemployment' },
  { key: 'injury', labelKey: 'rates.injury' },
  { key: 'maternity', labelKey: 'rates.maternity' },
  { key: 'housing', labelKey: 'rates.housing' },
] as const

function round2(n: number): string {
  return n.toFixed(2)
}

/** 五险一金计算：基数 + 双方比例（默认参考常见城市区间，可调）→ 明细与合计 */
export default function SocialInsuranceCalculator() {
  const { t } = useTranslation('tools-life', { keyPrefix: 'social-insurance-calculator' })
  const [baseInput, setBaseInput] = useState('10000')
  const [employeeRates, setEmployeeRates] = useState<InsuranceRates>(defaultEmployeeRates)
  const [employerRates, setEmployerRates] = useState<InsuranceRates>(defaultEmployerRates)

  const base = Number(baseInput)
  const result = useMemo(() => {
    try {
      return computeInsurance(base, employeeRates, employerRates)
    } catch {
      return null
    }
  }, [base, employeeRates, employerRates])

  const rateRow = (
    side: 'employee' | 'employer',
    rates: InsuranceRates,
    setRates: (rates: InsuranceRates) => void,
  ) => (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold">{t(`${side}Title`)}</Label>
      {RATE_FIELDS.map(({ key, labelKey }) => (
        <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-2">
          <Label className="text-muted-foreground text-xs">{t(labelKey)}</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={1}
              step={0.005}
              value={rates[key]}
              onChange={(event) => {
                const value = Number(event.target.value)
                setRates({
                  ...rates,
                  [key]: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0,
                })
              }}
              className="h-8 w-20 font-mono text-xs"
            />
            <span className="text-muted-foreground text-xs">%</span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* 缴费基数 */}
      <div className="flex flex-col gap-2">
        <Label>{t('baseLabel')}</Label>
        <Input
          type="number"
          min={0}
          value={baseInput}
          onChange={(event) => setBaseInput(event.target.value)}
          className="font-mono md:max-w-xs"
        />
      </div>

      {/* 比例调整 */}
      <div className="grid gap-4 md:grid-cols-2">
        {rateRow('employee', employeeRates, setEmployeeRates)}
        {rateRow('employer', employerRates, setEmployerRates)}
      </div>

      {/* 结果 */}
      {result && (
        <div className="grid gap-4 md:grid-cols-3">
          <ResultCard title={t('employeeTotal')} value={round2(result.employee.total)} highlight />
          <ResultCard title={t('takeHome')} value={round2(result.takeHome)} />
          <ResultCard title={t('employerCost')} value={round2(result.employerCost)} />
          <div className="overflow-hidden rounded-lg border md:col-span-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">{t('itemHeader')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('employeeTitle')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('employerTitle')}</th>
                </tr>
              </thead>
              <tbody>
                {RATE_FIELDS.map(({ key, labelKey }) => (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-1.5">{t(labelKey)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {round2(result.employee[key])}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {round2(result.employer[key])}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/30 border-t font-medium">
                  <td className="px-3 py-1.5">{t('totalHeader')}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {round2(result.employee.total)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {round2(result.employer.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">{t('note')}</p>
        </div>
      )}
    </div>
  )
}

function ResultCard({
  title,
  value,
  highlight,
}: {
  title: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-primary/40 bg-primary/5' : ''}`}>
      <p className="text-muted-foreground text-xs">{title}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
    </div>
  )
}
