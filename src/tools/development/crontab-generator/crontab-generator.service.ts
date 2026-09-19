import cronstrue from 'cronstrue/i18n'

export interface CronParts {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

/** 单字段简化校验：星号、步进（如 1/5）、数值、范围（含步进）、列表（数值与范围混合） */
const CRON_FIELD_PATTERN = /^(\*|(\d+|\*)(\/\d+)?|(\d+-\d+)(\/\d+)?|(\d+(,\d+-\d+)*(,\d+)*))$/

export const cronFieldNames = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const

export type CronFieldName = (typeof cronFieldNames)[number]

/** 校验单个 cron 字段，非法抛 Error */
function validateField(name: CronFieldName, value: string): void {
  if (!CRON_FIELD_PATTERN.test(value)) {
    throw new Error(`Invalid cron ${name} field: ${value}`)
  }
}

/** 由五个字段生成 cron 表达式，任一字段非法抛 Error */
export function buildCron(parts: CronParts): string {
  for (const name of cronFieldNames) {
    validateField(name, parts[name])
  }
  return [parts.minute, parts.hour, parts.dayOfMonth, parts.month, parts.dayOfWeek].join(' ')
}

/** 人类可读描述：zh 走 cronstrue zh_CN，en 走英文；解析失败返回原表达式 */
export function describeCron(expr: string, locale: 'zh' | 'en'): string {
  try {
    return cronstrue.toString(expr, { locale: locale === 'zh' ? 'zh_CN' : 'en' })
  } catch {
    return expr
  }
}

export interface CronPreset {
  id: string
  parts: CronParts
}

export const cronPresets: readonly CronPreset[] = [
  {
    id: 'everyMinute',
    parts: { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    id: 'hourly',
    parts: { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    id: 'dailyMidnight',
    parts: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  },
  {
    id: 'weeklyMondayMidnight',
    parts: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '1' },
  },
]
