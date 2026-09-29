import { useTranslation } from 'react-i18next'

import { livingCostDefaultsOf, type LivingCost } from '../salary-data'
import type { PanelProps } from '../salary-form'
import { PanelSection, PanelNumberField } from '@/components/panel-fields'

const FIELDS = ['rent', 'commute', 'food', 'misc'] as const satisfies readonly (keyof LivingCost)[]

export function LivingCostSection({ form, patch }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const defaults = livingCostDefaultsOf(form.cityId)

  return (
    <PanelSection title={t('groups.living')}>
      {FIELDS.map((field) => (
        <PanelNumberField
          key={field}
          label={t(`fields.${field}`)}
          placeholder={String(defaults[field])}
          value={form.living[field]}
          onChange={(value) => patch({ living: { ...form.living, [field]: value } })}
          min={0}
        />
      ))}
    </PanelSection>
  )
}
