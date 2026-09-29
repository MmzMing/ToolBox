import { Link2, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopy } from '@/composable/use-copy'
import { pickUrlParams, urlWithParams } from '@/utils/url-params'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PanelGroup } from '@/components/panel-fields'

import {
  computeSalary,
  solveGrossForTargetTakeHome,
  type CalcResult,
} from './salary-calculator.service'
import { buildInput, formatMoney, formatPercent, initialForm, type FormState } from './salary-form'
import { BonusSection } from './components/BonusSection'
import { CostBreakdown } from './components/CostBreakdown'
import { DeductionSection } from './components/DeductionSection'
import { EmploymentSection } from './components/EmploymentSection'
import { IncomeSection } from './components/IncomeSection'
import { InsuranceMatrix } from './components/InsuranceMatrix'
import { LivingCostSection } from './components/LivingCostSection'
import { MonthlyTable } from './components/MonthlyTable'
import { RateSection } from './components/RateSection'
import { YearSummaryPanel } from './components/YearSummaryPanel'

const SHARE_KEYS = [
  'mode',
  'g',
  't',
  'c',
  'b',
  'fb',
  'fr',
  'sm',
  'ba',
  'bm',
  'lr',
  'lc',
  'lf',
  'lm',
] as const

function formFromParams(params: Record<string, string | undefined>): FormState {
  const form = initialForm()
  if (params.mode === 'reverse') form.mode = 'reverse'
  if (params.g) form.grossMonthly = params.g
  if (params.t) form.targetNet = params.t
  if (params.c) form.cityId = params.c
  if (params.b) form.socialBase = params.b
  if (params.fb) form.fundBase = params.fb
  if (params.fr) form.fundRate = params.fr
  if (params.sm) form.startMonth = params.sm
  if (params.ba) form.bonus.amount = params.ba
  if (params.bm === 'separate' || params.bm === 'merged') form.bonus.mode = params.bm
  for (const [key, field] of [
    ['lr', 'rent'],
    ['lc', 'commute'],
    ['lf', 'food'],
    ['lm', 'misc'],
  ] as const) {
    const value = params[key]
    if (value) form.living[field] = value
  }
  return form
}

export default function SalaryCalculator() {
  const { t, i18n } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const { t: tc } = useTranslation('common')
  const { copy } = useCopy()

  const [form, setForm] = useState(() =>
    formFromParams(pickUrlParams(new URLSearchParams(window.location.search), SHARE_KEYS)),
  )
  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }))

  const input = useMemo(() => buildInput(form), [form])
  const locale = i18n.language

  const outcome = useMemo<{ result: CalcResult | null; error: 'invalid' | 'range' | null }>(() => {
    try {
      if (form.mode === 'forward') return { result: computeSalary(input), error: null }
      const { grossMonthly: _gross, ...solveBase } = input
      const solved = solveGrossForTargetTakeHome(Number(form.targetNet), solveBase)
      return {
        result: computeSalary({
          ...input,
          grossMonthly: solved.grossMonthly,
          bonusMode: solved.bonusMode,
        }),
        error: null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return { result: null, error: message.includes('searchable') ? 'range' : 'invalid' }
    }
  }, [input, form.mode, form.targetNet])

  const { result } = outcome

  const handleReset = () => setForm(initialForm(form.cityId))

  const handleShare = () => {
    void copy(
      urlWithParams(window.location.href, {
        mode: form.mode,
        g: form.grossMonthly,
        t: form.targetNet,
        c: form.cityId,
        b: form.socialBase,
        fb: form.fundBase,
        fr: form.fundRate,
        sm: form.startMonth,
        ba: form.bonus.amount,
        bm: form.bonus.mode,
        lr: form.living.rent,
        lc: form.living.commute,
        lf: form.living.food,
        lm: form.living.misc,
      }),
    )
  }

  return (
    /* PC 上结果在左、控件在右（站点惯例是设置收在右侧）；窄屏按 DOM 顺序先给控件再给结果 */
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <PanelGroup className="xl:order-2">
        <IncomeSection form={form} patch={patch} input={input} />
        <EmploymentSection form={form} patch={patch} input={input} />
        <BonusSection form={form} patch={patch} input={input} />
        <DeductionSection form={form} patch={patch} input={input} />
        <LivingCostSection form={form} patch={patch} input={input} />
        <RateSection form={form} patch={patch} input={input} />
        <div className="flex items-center justify-end gap-2 p-4">
          <Button type="button" size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw />
            {t('actions.resetAll')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleShare}>
            <Link2 />
            {tc('copy')}
          </Button>
        </div>
      </PanelGroup>

      <div className="flex flex-col gap-4 xl:order-1">
        {outcome.error && (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${outcome.error}`)}</AlertDescription>
          </Alert>
        )}

        {result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {form.mode === 'reverse' && (
                <ResultCard
                  title={t('results.solvedGross')}
                  value={formatMoney(input.grossMonthly, locale)}
                  highlight
                />
              )}
              <ResultCard
                title={t('results.takeHome')}
                value={formatMoney(result.monthlyTakeHomeAverage, locale)}
                hint={t('results.range', {
                  first: formatMoney(result.monthlyTakeHomeFirst, locale),
                  last: formatMoney(result.monthlyTakeHomeLast, locale),
                })}
                highlight={form.mode === 'forward'}
              />
              <ResultCard
                title={t('results.living')}
                value={formatMoney(result.livingTotal, locale)}
              />
              <ResultCard
                title={t('results.disposable')}
                value={formatMoney(result.monthlyDisposable, locale)}
              />
              <ResultCard
                title={t('results.savingRate')}
                value={formatPercent(result.savingRate, locale)}
                hint={t('results.annualSaving', {
                  amount: formatMoney(result.annualSaving, locale),
                })}
              />
            </div>

            {(result.insurance.socialClamped || result.insurance.fundClamped) && (
              <div className="flex flex-col gap-1">
                {result.insurance.socialClamped && (
                  <p className="text-muted-foreground text-xs">
                    {t('notes.clamped', {
                      label: t('fields.socialBase'),
                      bound: formatMoney(result.insurance.socialBase, locale),
                    })}
                  </p>
                )}
                {result.insurance.fundClamped && (
                  <p className="text-muted-foreground text-xs">
                    {t('notes.clamped', {
                      label: t('fields.fundBase'),
                      bound: formatMoney(result.insurance.fundBase, locale),
                    })}
                  </p>
                )}
              </div>
            )}

            <CostBreakdown result={result} living={input.living} locale={locale} />
            <MonthlyTable result={result} locale={locale} />
            <YearSummaryPanel result={result} cityId={form.cityId} locale={locale} />
            <InsuranceMatrix result={result} grossMonthly={input.grossMonthly} locale={locale} />
            {input.bonusAmount > 0 && result.year.bonusTaxOther !== result.year.bonusTax && (
              <p className="text-muted-foreground text-xs">
                {t('notes.bonusAlternative', {
                  mode: t(
                    result.year.bonusMode === 'separate'
                      ? 'options.bonusMerged'
                      : 'options.bonusSeparate',
                  ),
                  amount: formatMoney(
                    Math.abs(result.year.bonusTaxOther - result.year.bonusTax),
                    locale,
                  ),
                })}
              </p>
            )}
            <p className="text-muted-foreground text-xs">{t('disclaimer')}</p>
          </>
        )}
      </div>
    </div>
  )
}

function ResultCard({
  title,
  value,
  hint,
  highlight,
}: {
  title: string
  value: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-primary/40 bg-primary/5' : ''}`}>
      <p className="text-muted-foreground text-xs">{title}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${highlight ? 'text-primary' : ''}`}>
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  )
}
