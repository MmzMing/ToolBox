import { randomInt } from '@/utils/random'

const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const DIGIT_CHARS = '0123456789'
const SYMBOL_CHARS = '!@#$%^&*()-_=+[]{}:;,.<>?/'

export const TOKEN_LENGTH_RANGE = { min: 1, max: 128 } as const
export const TOKEN_COUNT_RANGE = { min: 1, max: 50 } as const

export interface TokenOptions {
  /** 令牌长度（1-128） */
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  /** 生成数量（1-50） */
  count: number
}

function buildCharset(options: TokenOptions): string {
  return [
    options.uppercase ? UPPERCASE_CHARS : '',
    options.lowercase ? LOWERCASE_CHARS : '',
    options.numbers ? DIGIT_CHARS : '',
    options.symbols ? SYMBOL_CHARS : '',
  ].join('')
}

/** 已选字符集的去重字符数，UI 用它显示字符池大小并推算熵 */
export function tokenCharsetSize(options: TokenOptions): number {
  return new Set(buildCharset(options)).size
}

/** 令牌的理论熵（比特）：长度 × log2(字符集大小)，一个字符集都没选时为 0 */
export function tokenEntropyBits(options: TokenOptions): number {
  const size = tokenCharsetSize(options)
  if (size === 0) {
    return 0
  }
  return options.length * Math.log2(size)
}

/** 按字符集与长度批量生成随机令牌，未选择任何字符集或参数越界时抛出 Error */
export function generateTokens(options: TokenOptions): string[] {
  const charset = buildCharset(options)
  if (charset === '') {
    throw new Error('At least one character set must be selected')
  }
  const { length, count } = options
  if (
    !Number.isInteger(length) ||
    length < TOKEN_LENGTH_RANGE.min ||
    length > TOKEN_LENGTH_RANGE.max
  ) {
    throw new Error(
      `Length must be an integer between ${TOKEN_LENGTH_RANGE.min} and ${TOKEN_LENGTH_RANGE.max}`,
    )
  }
  if (!Number.isInteger(count) || count < TOKEN_COUNT_RANGE.min || count > TOKEN_COUNT_RANGE.max) {
    throw new Error(
      `Count must be an integer between ${TOKEN_COUNT_RANGE.min} and ${TOKEN_COUNT_RANGE.max}`,
    )
  }

  const tokens: string[] = []
  for (let index = 0; index < count; index++) {
    let token = ''
    for (let position = 0; position < length; position++) {
      token += charset[randomInt(charset.length)]
    }
    tokens.push(token)
  }
  return tokens
}
