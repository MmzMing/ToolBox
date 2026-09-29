import { useTranslation } from 'react-i18next'

import { defaultRatesOfCity } from '../salary-calculator.service'
import type { ContributionRates } from '../salary-calculator.service'
import { cityPresetOf } from '../salary-data'
import type { PanelProps } from '../salary-form'
import { PanelNumberField, PanelSection, PanelSubHeader } from '@/components/panel-fields'

type RateField = { key: keyof ContributionRates; itemKey: string }

const EMPLOYEE_FIELDS: readonly RateField[] = [
  { key: 'pension', itemKey: 'fields.ratePension' },
  { key: 'medical', itemKey: 'fields.rateMedical' },
  { key: 'unemployment', itemKey: 'fields.rateUnemployment' },
]

const EMPLOYER_FIELDS: readonly RateField[] = [
  { key: 'employerPension', itemKey: 'fields.rateEmployerPension' },
  { key: 'employerMedical', itemKey: 'fields.rateEmployerMedical' },
  { key: 'employerUnemployment', itemKey: 'fields.rateEmployerUnemployment' },
  { key: 'employerInjury', itemKey: 'fields.rateEmployerInjury' },
  { key: 'employerMaternity', itemKey: 'fields.rateEmployerMaternity' },
]

/** 多地失业与工伤属阶段性降费文件，2026 年续期尚未公布，费率必须可覆盖而非写死 */
export function RateSection({ form, patch }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const defaults = defaultRatesOfCity(cityPresetOf(form.cityId))

  const renderField = ({ key, itemKey }: RateField) => (
    <PanelNumberField
      key={key}
      label={t(itemKey)}
      placeholder={String(Math.round(defaults[key] * 10000) / 100)}
      value={form.rates[key]}
      onChange={(value) => patch({ rates: { ...form.rates, [key]: value } })}
      min={0}
      max={100}
      step={0.05}
    />
  )

  return (
    <PanelSection title={t('groups.rates')}>
      <PanelSubHeader>{t('groups.ratesEmployee')}</PanelSubHeader>
      {EMPLOYEE_FIELDS.map(renderField)}
      <PanelNumberField
        label={t('fields.fixedMedical')}
        placeholder={String(defaults.extraMedicalMonthly)}
        value={form.rates.extraMedicalMonthly}
        onChange={(value) => patch({ rates: { ...form.rates, extraMedicalMonthly: value } })}
        min={0}
      />
      <PanelSubHeader>{t('groups.ratesEmployer')}</PanelSubHeader>
      {EMPLOYER_FIELDS.map(renderField)}
      <p className="text-muted-foreground col-span-2 text-xs leading-tight">
        {t('hints.ratesEditable')}
      </p>
    </PanelSection>
  )
}
