import { useTranslation } from 'react-i18next'

import type { PanelProps } from '../salary-form'
import { PanelSection, PanelSelectField, PanelSwitchField } from '@/components/panel-fields'

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1))

export function EmploymentSection({ form, patch }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })

  return (
    <PanelSection title={t('groups.employment')}>
      <PanelSelectField
        label={t('fields.startMonth')}
        value={form.startMonth}
        onChange={(value) => patch({ startMonth: value })}
        options={MONTHS.map((value) => ({ value, label: t('months.value', { n: value }) }))}
      />
      <PanelSwitchField
        label={t('fields.firstSalaryInYear')}
        hint={t('hints.firstSalary')}
        checked={form.firstSalaryInYear}
        onChange={(checked) => patch({ firstSalaryInYear: checked })}
      />
    </PanelSection>
  )
}
