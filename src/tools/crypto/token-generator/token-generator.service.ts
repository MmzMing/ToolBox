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

/** 基于 crypto.getRandomValues 的无模偏差均匀随机整数，范围 [0, max) */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

function buildCharset(options: TokenOptions): string {
  return [
    options.uppercase ? UPPERCASE_CHARS : '',
    options.lowercase ? LOWERCASE_CHARS : '',
    options.numbers ? DIGIT_CHARS : '',
    options.symbols ? SYMBOL_CHARS : '',
  ].join('')
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
