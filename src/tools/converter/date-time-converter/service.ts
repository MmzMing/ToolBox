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

export type TimestampUnit = 's' | 'ms'

/** 时间戳 → Date（按单位：秒 10 位 / 毫秒 13 位） */
export function tsToDate(ts: number, unit: TimestampUnit): Date {
  if (!Number.isFinite(ts) || ts < 0) {
    throw new Error(`Invalid timestamp: ${ts}`)
  }
  return unit === 's' ? new Date(ts * 1000) : new Date(ts)
}

/** Date → 时间戳（按单位取整） */
export function dateToTs(date: Date, unit: TimestampUnit): number {
  return unit === 's' ? Math.floor(date.getTime() / 1000) : date.getTime()
}

/** 本地时间展示：yyyy/MM/dd HH:mm:ss */
export function formatLocalDateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

/** datetime-local 输入框值：yyyy-MM-ddTHH:mm:ss */
export function toDatetimeLocalValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
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
