import { randomInt, shuffle } from '@/utils/random'

export const CLASS_IDS = ['uppercase', 'lowercase', 'digits', 'symbols'] as const

export type PasswordClassId = (typeof CLASS_IDS)[number]

export type PasswordClassRule = { enabled: boolean; min: number }

export type PasswordGeneratorOptions = {
  /** 随机部分长度，前缀后缀额外附加不计入 */
  length: number
  prefix: string
  suffix: string
  classes: Record<PasswordClassId, PasswordClassRule>
  excludeAmbiguous: boolean
  excludedChars: string
  /** 批量生成条数 */
  count: number
}

export type GeneratedPassword = {
  /** prefix + 随机体 + suffix */
  value: string
  /** 仅随机部分，用于核算有效熵 */
  randomBody: string
  /** 应用排除规则后的实际字符池大小 */
  poolSize: number
  /** length * log2(poolSize)，固定前后缀不贡献熵 */
  effectiveEntropyBits: number
}

export type ConstraintViolation =
  'emptyPool' | 'lengthOutOfRange' | 'countOutOfRange' | 'minExceedsLength'

export const PASSWORD_LENGTH_RANGE = { min: 1, max: 128 } as const
export const PASSWORD_COUNT_RANGE = { min: 1, max: 20 } as const
export const AMBIGUOUS_CHARS = 'il1Lo0O'

const CLASS_CHARS: Record<PasswordClassId, string> = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}:;,.<>?/',
}

export const DEFAULT_GENERATOR_OPTIONS: PasswordGeneratorOptions = {
  length: 16,
  prefix: '',
  suffix: '',
  classes: {
    uppercase: { enabled: true, min: 1 },
    lowercase: { enabled: true, min: 1 },
    digits: { enabled: true, min: 1 },
    symbols: { enabled: false, min: 0 },
  },
  excludeAmbiguous: false,
  excludedChars: '',
  count: 3,
}

function buildExcludedSet(options: PasswordGeneratorOptions): Set<string> {
  const excluded = new Set<string>()
  if (options.excludeAmbiguous) {
    for (const char of AMBIGUOUS_CHARS) excluded.add(char)
  }
  for (const char of options.excludedChars) excluded.add(char)
  return excluded
}

/** 按启用类型与排除规则算出各类可用字符池，未启用的类为空串 */
function buildClassPools(options: PasswordGeneratorOptions): Record<PasswordClassId, string> {
  const excluded = buildExcludedSet(options)
  const pools = {} as Record<PasswordClassId, string>
  for (const id of CLASS_IDS) {
    pools[id] = options.classes[id].enabled
      ? [...CLASS_CHARS[id]].filter((char) => !excluded.has(char)).join('')
      : ''
  }
  return pools
}

/** 实际参与随机的字符池（排除后），UI 用它预估有效熵 */
export function buildCharacterPool(options: PasswordGeneratorOptions): string {
  const pools = buildClassPools(options)
  return CLASS_IDS.map((id) => pools[id]).join('')
}

/** 返回当前选项违反的约束名，空数组代表合法 */
export function validateGeneratorOptions(options: PasswordGeneratorOptions): ConstraintViolation[] {
  const violations: ConstraintViolation[] = []
  const pools = buildClassPools(options)
  const pool = CLASS_IDS.map((id) => pools[id]).join('')

  if (pool === '') violations.push('emptyPool')

  const { length, count } = options
  if (
    !Number.isInteger(length) ||
    length < PASSWORD_LENGTH_RANGE.min ||
    length > PASSWORD_LENGTH_RANGE.max
  ) {
    violations.push('lengthOutOfRange')
  }
  if (
    !Number.isInteger(count) ||
    count < PASSWORD_COUNT_RANGE.min ||
    count > PASSWORD_COUNT_RANGE.max
  ) {
    violations.push('countOutOfRange')
  }

  const required = CLASS_IDS.reduce((sum, id) => sum + (pools[id] ? options.classes[id].min : 0), 0)
  if (required > length) violations.push('minExceedsLength')

  return violations
}

/** 批量生成随机密码，参数非法时抛出 Error（UI 负责翻译展示） */
export function generatePasswords(options: PasswordGeneratorOptions): GeneratedPassword[] {
  const violations = validateGeneratorOptions(options)
  if (violations.includes('emptyPool')) {
    throw new Error('At least one character class with usable characters must be enabled')
  }
  if (violations.includes('lengthOutOfRange')) {
    throw new Error(
      `Length must be an integer between ${PASSWORD_LENGTH_RANGE.min} and ${PASSWORD_LENGTH_RANGE.max}`,
    )
  }
  if (violations.includes('countOutOfRange')) {
    throw new Error(
      `Count must be an integer between ${PASSWORD_COUNT_RANGE.min} and ${PASSWORD_COUNT_RANGE.max}`,
    )
  }
  const pools = buildClassPools(options)
  const pool = CLASS_IDS.map((id) => pools[id]).join('')
  const required = CLASS_IDS.reduce((sum, id) => sum + (pools[id] ? options.classes[id].min : 0), 0)
  if (violations.includes('minExceedsLength')) {
    throw new Error(
      `Sum of minimum character counts (${required}) exceeds password length (${options.length})`,
    )
  }

  const { prefix, suffix, length } = options
  const poolSize = pool.length
  const entropyBits = Math.round(length * Math.log2(poolSize) * 100) / 100

  const results: GeneratedPassword[] = []
  for (let index = 0; index < options.count; index++) {
    const body: string[] = []
    for (const id of CLASS_IDS) {
      const chars = pools[id]
      if (!chars) continue
      const min = options.classes[id].min
      for (let taken = 0; taken < min; taken++) {
        body.push(chars[randomInt(chars.length)])
      }
    }
    while (body.length < length) {
      body.push(pool[randomInt(poolSize)])
    }
    const randomBody = shuffle(body).join('')
    results.push({
      value: `${prefix}${randomBody}${suffix}`,
      randomBody,
      poolSize,
      effectiveEntropyBits: entropyBits,
    })
  }
  return results
}
