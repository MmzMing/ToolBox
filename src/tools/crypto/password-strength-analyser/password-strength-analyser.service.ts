export const CHECK_IDS = [
  'minLength12',
  'lowercase',
  'uppercase',
  'digit',
  'symbol',
  'noRepeatedChars',
] as const

export type PasswordCheckId = (typeof CHECK_IDS)[number]

export interface PasswordCheck {
  id: PasswordCheckId
  passed: boolean
}

export interface PasswordAnalysis {
  length: number
  /** 熵 = length * log2(charsetSize) */
  entropyBits: number
  charsetSize: number
  checks: PasswordCheck[]
  /** 按 1e10 次/秒暴力破解估算的人性化时长（英文） */
  crackTimeText: string
  /** 0-4 强度分 */
  score: 0 | 1 | 2 | 3 | 4
}

/** 字符集池大小：小写 26 / 大写 26 / 数字 10 / 符号 33 / 其他 Unicode 追加 67 */
const CHARSET_LOWER = 26
const CHARSET_UPPER = 26
const CHARSET_DIGIT = 10
const CHARSET_SYMBOL = 33
const CHARSET_UNICODE_EXTRA = 67

const GUESSES_PER_SECOND = 1e10
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86400
const SECONDS_PER_MONTH = 2629800
const SECONDS_PER_YEAR = 31557600
const CENTURY_THRESHOLD_SECONDS = 100 * SECONDS_PER_YEAR

function computeCharsetSize(password: string): number {
  let size = 0
  if (/[a-z]/.test(password)) size += CHARSET_LOWER
  if (/[A-Z]/.test(password)) size += CHARSET_UPPER
  if (/\d/.test(password)) size += CHARSET_DIGIT
  if (/[^a-zA-Z0-9]/.test(password)) size += CHARSET_SYMBOL
  if (/[^\u0020-\u007e]/.test(password)) size += CHARSET_UNICODE_EXTRA
  return size
}

function buildChecks(password: string): PasswordCheck[] {
  if (password === '') {
    return CHECK_IDS.map((id) => ({ id, passed: false }))
  }
  return [
    { id: 'minLength12', passed: password.length >= 12 },
    { id: 'lowercase', passed: /[a-z]/.test(password) },
    { id: 'uppercase', passed: /[A-Z]/.test(password) },
    { id: 'digit', passed: /\d/.test(password) },
    { id: 'symbol', passed: /[^a-zA-Z0-9]/.test(password) },
    { id: 'noRepeatedChars', passed: !/(.)\1/.test(password) },
  ]
}

/** 按 1e10 次/秒把暴力破解所需秒数转成可读时长 */
function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds >= CENTURY_THRESHOLD_SECONDS) {
    return 'centuries'
  }
  if (seconds < 1) {
    return 'less than a second'
  }
  const pluralize = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`
  if (seconds < SECONDS_PER_MINUTE) return pluralize(Math.max(1, Math.round(seconds)), 'second')
  if (seconds < SECONDS_PER_HOUR)
    return pluralize(Math.max(1, Math.round(seconds / SECONDS_PER_MINUTE)), 'minute')
  if (seconds < SECONDS_PER_DAY)
    return pluralize(Math.max(1, Math.round(seconds / SECONDS_PER_HOUR)), 'hour')
  if (seconds < SECONDS_PER_MONTH)
    return pluralize(Math.max(1, Math.round(seconds / SECONDS_PER_DAY)), 'day')
  if (seconds < SECONDS_PER_YEAR)
    return pluralize(Math.max(1, Math.round(seconds / SECONDS_PER_MONTH)), 'month')
  return pluralize(Math.max(1, Math.round(seconds / SECONDS_PER_YEAR)), 'year')
}

function computeScore(entropyBits: number): 0 | 1 | 2 | 3 | 4 {
  if (entropyBits < 28) return 0
  if (entropyBits < 40) return 1
  if (entropyBits < 60) return 2
  if (entropyBits < 80) return 3
  return 4
}

/** 分析密码强度：熵值、检查项、破解时间估算与 0-4 强度分 */
export function analysePassword(password: string): PasswordAnalysis {
  const charsetSize = computeCharsetSize(password)
  const entropyBits = charsetSize > 0 ? password.length * Math.log2(charsetSize) : 0
  const seconds = 2 ** entropyBits / GUESSES_PER_SECOND

  return {
    length: password.length,
    entropyBits: Math.round(entropyBits * 100) / 100,
    charsetSize,
    checks: buildChecks(password),
    crackTimeText: formatCrackTime(seconds),
    score: computeScore(entropyBits),
  }
}
