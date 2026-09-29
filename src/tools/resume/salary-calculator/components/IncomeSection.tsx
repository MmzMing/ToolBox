import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { CITY_PRESETS, cityPresetOf } from '../salary-data'
import type { PanelProps } from '../salary-form'
import { PanelSection, PanelNumberField, PanelSelectField } from '@/components/panel-fields'

export function IncomeSection({ form, patch, input }: PanelProps) {
  const { t } = useTranslation('tools-resume', { keyPrefix: 'salary-calculator' })
  const forward = form.mode === 'forward'
  const city = cityPresetOf(form.cityId)

  const baseHint =
    city.socialBaseMin !== undefined && city.socialBaseMax !== undefined
      ? t('hints.baseBounds', { min: city.socialBaseMin, max: city.socialBaseMax })
      : undefined
  const fundHint =
    city.fundBaseMax !== undefined ? t('hints.baseMax', { max: city.fundBaseMax }) : undefined

  return (
    <PanelSection title={t('groups.income')}>
      <div className="col-span-2 grid grid-cols-2 gap-3">
        <Button
          type="button"
          size="sm"
          variant={forward ? 'default' : 'outline'}
          onClick={() => patch({ mode: 'forward' })}
        >
          {t('mode.forward')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={forward ? 'outline' : 'default'}
          onClick={() => patch({ mode: 'reverse' })}
        >
          {t('mode.reverse')}
        </Button>
      </div>

      {forward ? (
        <PanelNumberField
          label={t('fields.grossMonthly')}
          value={form.grossMonthly}
          onChange={(value) => patch({ grossMonthly: value })}
          min={0}
          span={2}
        />
      ) : (
        <PanelNumberField
          label={t('fields.targetNet')}
          value={form.targetNet}
          onChange={(value) => patch({ targetNet: value })}
          min={0}
          span={2}
        />
      )}

      <PanelSelectField
        label={t('fields.city')}
        value={form.cityId}
        onChange={(value) => patch({ cityId: value })}
        options={CITY_PRESETS.map((item) => ({ value: item.id, label: t(`cities.${item.id}`) }))}
      />
      <PanelNumberField
        label={t('fields.socialBase')}
        hint={baseHint}
        placeholder={t('placeholders.followSalary')}
        value={form.socialBase}
        onChange={(value) => patch({ socialBase: value })}
        min={0}
      />

      <PanelNumberField
        label={t('fields.fundRate')}
        hint={t('hints.fundRateMax', { max: Math.round((city.fundRateMax ?? 0.12) * 100) })}
        placeholder={String(Math.round(input.fundRate * 100))}
        value={form.fundRate}
        onChange={(value) => patch({ fundRate: value })}
        min={0}
        max={12}
        step={0.5}
      />
      <PanelNumberField
        label={t('fields.fundBase')}
        hint={fundHint}
        placeholder={t('placeholders.followSalary')}
        value={form.fundBase}
        onChange={(value) => patch({ fundBase: value })}
        min={0}
      />
    </PanelSection>
  )
}
