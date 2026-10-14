import { useTranslation } from 'react-i18next'

import { MorphSelect } from '@/components/select/morph-select'
import { UNIT_LABELS } from '../data/index'
import { CUSTOM_UNIT_CHOICES } from '../engine'
import type { ServeUnit } from '../types'

/**
 * 行上的量词选择器。改的只是"这一项按什么买"（10 片 → 10 包），
 * 数字不动 —— 数据里没有单件净重，换算就等于凭空编一个克数。
 */
export function UnitSelect({
  value,
  ariaLabel,
  onChange,
}: {
  value: ServeUnit
  ariaLabel: string
  onChange: (unit: ServeUnit) => void
}) {
  const { t, i18n } = useTranslation('tools-life', { keyPrefix: 'barbecue-planner' })
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  // 池内项在菜市场可能仍以"串"记账，当前值不在可选项里时补上，免得选择器显示空白
  const choices = CUSTOM_UNIT_CHOICES.includes(value)
    ? CUSTOM_UNIT_CHOICES
    : [value, ...CUSTOM_UNIT_CHOICES]

  return (
    <MorphSelect
      label={`${ariaLabel} ${t('shop.unit')}`}
      hideLabel
      size="xs"
      panelWidth={140}
      className="w-[3.9rem] shrink-0"
      items={choices.map((unit) => ({ value: unit, label: UNIT_LABELS[unit][lang] }))}
      value={value}
      onValueChange={(next) => onChange(next as ServeUnit)}
    />
  )
}
