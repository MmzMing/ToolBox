import { useTranslation } from 'react-i18next'

import { OTHER_DEDUCTION_LIMITS } from '../salary-data'
import { cityRentTierOf, type PanelProps, type RentTierChoice } from '../salary-form'
import {
  PanelSection,
  PanelNumberField,
  PanelSelectField,
  PanelSwitchField,
} from '@/components/panel-fields'

const RENT_CHOICES = [
  'auto',
  '0',
  '800',
  '1100',
  '1500',
] as const satisfies readonly RentTierChoice[]

export function DeductionSection({ form, patch }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const cityRentTier = cityRentTierOf(form.cityId)

  const patchDeductions = (next: Partial<typeof form.deductions>) =>
    patch({ deductions: { ...form.deductions, ...next } })
  const patchOther = (next: Partial<typeof form.other>) =>
    patch({ other: { ...form.other, ...next } })

  return (
    <>
      <PanelSection title={t('groups.deductions')}>
        <PanelNumberField
          label={t('fields.childEducation')}
          value={form.deductions.childEducationChildren}
          onChange={(value) => patchDeductions({ childEducationChildren: value })}
          min={0}
        />
        <PanelNumberField
          label={t('fields.infantCare')}
          value={form.deductions.infantCareChildren}
          onChange={(value) => patchDeductions({ infantCareChildren: value })}
          min={0}
        />
        <PanelSelectField
          label={t('fields.continuingEducation')}
          span={2}
          value={form.deductions.continuingEducation}
          onChange={(value) =>
            patchDeductions({
              continuingEducation: value as typeof form.deductions.continuingEducation,
            })
          }
          options={[
            { value: 'none', label: t('options.none') },
            { value: 'academic', label: t('options.academic') },
            { value: 'qualification', label: t('options.qualification') },
          ]}
        />
        <PanelSwitchField
          label={t('fields.mortgage')}
          checked={form.deductions.mortgageInterest}
          onChange={(checked) => patchDeductions({ mortgageInterest: checked })}
        />
        <PanelSelectField
          label={t('fields.rentTier')}
          disabled={form.deductions.mortgageInterest}
          hint={form.deductions.mortgageInterest ? t('hints.mortgageExclusive') : undefined}
          value={form.deductions.rentTier}
          onChange={(value) => patchDeductions({ rentTier: value as RentTierChoice })}
          options={RENT_CHOICES.map((choice) => ({
            value: choice,
            label:
              choice === 'auto'
                ? t('options.rentAuto', { tier: cityRentTier ?? 0 })
                : t('options.rentValue', { tier: choice }),
          }))}
        />
        <PanelNumberField
          label={t('fields.elderSupport')}
          value={form.deductions.elderSupportMonthly}
          onChange={(value) => patchDeductions({ elderSupportMonthly: value })}
          min={0}
          max={3000}
        />
        <PanelNumberField
          label={t('fields.seriousIllness')}
          hint={t('hints.annualOnly')}
          value={form.deductions.seriousIllnessSelfPaid}
          onChange={(value) => patchDeductions({ seriousIllnessSelfPaid: value })}
          min={0}
        />
      </PanelSection>

      <PanelSection title={t('groups.other')}>
        <PanelNumberField
          label={t('fields.personalPension')}
          hint={t('hints.capAnnual', { cap: OTHER_DEDUCTION_LIMITS.personalPensionAnnual })}
          value={form.other.personalPensionAnnual}
          onChange={(value) => patchOther({ personalPensionAnnual: value })}
          min={0}
        />
        <PanelNumberField
          label={t('fields.taxPreferredInsurance')}
          hint={t('hints.capAnnual', { cap: OTHER_DEDUCTION_LIMITS.taxPreferredInsuranceAnnual })}
          value={form.other.taxPreferredInsuranceAnnual}
          onChange={(value) => patchOther({ taxPreferredInsuranceAnnual: value })}
          min={0}
        />
      </PanelSection>
    </>
  )
}
