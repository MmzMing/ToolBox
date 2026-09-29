import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'

import { bonusTrapZoneOf } from '../salary-calculator.service'
import type { PanelProps } from '../salary-form'
import { PanelSection, PanelNumberField, PanelRadioField } from '@/components/panel-fields'

export function BonusSection({ form, patch }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const amount = Number(form.bonus.amount || '0')
  const trap = Number.isFinite(amount) && amount > 0 ? bonusTrapZoneOf(amount) : null

  return (
    <PanelSection title={t('groups.bonus')}>
      <PanelNumberField
        label={t('fields.bonusAmount')}
        value={form.bonus.amount}
        onChange={(value) => patch({ bonus: { ...form.bonus, amount: value } })}
        min={0}
      />
      <PanelRadioField
        label={t('fields.bonusMode')}
        value={form.bonus.mode}
        onChange={(value) =>
          patch({ bonus: { ...form.bonus, mode: value as typeof form.bonus.mode } })
        }
        options={[
          { value: 'auto', label: t('options.bonusAuto') },
          { value: 'separate', label: t('options.bonusSeparate') },
          { value: 'merged', label: t('options.bonusMerged') },
        ]}
      />
      {trap && (
        <Alert className="col-span-2">
          <AlertDescription>
            {t('warnings.bonusTrap', { from: trap.from, to: trap.to })}
          </AlertDescription>
        </Alert>
      )}
    </PanelSection>
  )
}
