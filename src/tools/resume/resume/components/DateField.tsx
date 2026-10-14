import { DatePicker } from '@/components/date-range-picker'

import { fromPickerMonth, toPickerDate } from '../resume.service'

type DateFieldProps = {
  /** 存储用的显示串，形如 `2021/07` */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

/**
 * 月粒度日期选择。
 *
 * 简历日期本质上仍是自由显示串，所以写入时归一成 `YYYY/MM`，读取时容忍 `.` `/` `-`
 * 等历史写法，不做任何强校验。面板走全局共享选择器的 `granularity="month"` 降级：
 * 这里本来没有「日」的概念，所以不显示日历日格；也没有快捷区间（`presets="none"`）。
 * 解析不出来的串按未选择处理，与改造前一致。
 */
export function DateField({ value, onChange, placeholder, disabled, ariaLabel }: DateFieldProps) {
  return (
    <DatePicker
      months={1}
      presets="none"
      granularity="month"
      value={toPickerDate(value)}
      label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(date) => onChange(fromPickerMonth(date))}
      onClear={() => onChange('')}
    />
  )
}
