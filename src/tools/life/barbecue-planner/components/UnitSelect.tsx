import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
    <Select value={value} onValueChange={(next) => onChange(next as ServeUnit)}>
      <SelectTrigger
        size="sm"
        aria-label={`${ariaLabel} ${t('shop.unit')}`}
        className="h-6 w-[3.9rem] shrink-0 gap-0.5 px-1 text-[11px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((unit) => (
          <SelectItem key={unit} value={unit} className="text-xs">
            {UNIT_LABELS[unit][lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
