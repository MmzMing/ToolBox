import { formatDistanceToNow, type Locale } from 'date-fns'

export type DateOutputKey = 'iso' | 'local' | 'unixSeconds' | 'unixMs' | 'utc' | 'relative'

export interface DateOutput {
  /** i18n 键：UI 层按 `labels.<label>` 取展示文案 */
  label: DateOutputKey
  value: string
}

/** 解析用户输入的日期（纯数字按毫秒时间戳，其余按 ISO/日期字符串）；非法输入抛 Error */
export function parseDateInput(input: string): Date {
  const trimmed = input.trim()
  if (trimmed === '') {
    throw new Error('Date input is empty')
  }
  const isTimestamp = /^\d+$/.test(trimmed)
  const date = isTimestamp ? new Date(Number(trimmed)) : new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date input: "${input}"`)
  }
  return date
}

/** 展开为一个日期的全部常用格式（label 为 i18n 键，value 为格式化结果） */
export function formatDateAll(date: Date, options?: { relativeLocale?: Locale }): DateOutput[] {
  return [
    { label: 'iso', value: date.toISOString() },
    { label: 'local', value: date.toLocaleString() },
    { label: 'unixSeconds', value: String(Math.floor(date.getTime() / 1000)) },
    { label: 'unixMs', value: String(date.getTime()) },
    { label: 'utc', value: date.toUTCString() },
    {
      label: 'relative',
      value: formatDistanceToNow(date, { addSuffix: true, locale: options?.relativeLocale }),
    },
  ]
}
