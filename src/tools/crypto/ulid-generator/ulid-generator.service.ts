/** Crockford Base32 字母表（ULID 标准，不含 I、L、O、U） */
export const ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** 26 位大写 ULID 的完整正则（10 位时间戳 + 16 位随机数） */
export const ULID_REGEX = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

export const ULID_COUNT_RANGE = { min: 1, max: 50 } as const

const TIME_LENGTH = 10
const RANDOM_LENGTH = 16
const MAX_TIMESTAMP = 2 ** 48 - 1

/** 48bit 毫秒时间戳 → 10 位 Crockford Base32 */
function encodeTime(timestamp: number): string {
  let remaining = BigInt(Math.floor(timestamp))
  let encoded = ''
  for (let index = 0; index < TIME_LENGTH; index++) {
    encoded = ULID_ENCODING[Number(remaining % 32n)] + encoded
    remaining /= 32n
  }
  return encoded
}

/** crypto.getRandomValues 的 80bit 随机数 → 16 位 Crockford Base32 */
function encodeRandom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let value = 0n
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte)
  }
  let encoded = ''
  for (let index = 0; index < RANDOM_LENGTH; index++) {
    encoded = ULID_ENCODING[Number(value % 32n)] + encoded
    value /= 32n
  }
  return encoded
}

/** 生成单个大写 ULID（48bit 时间戳 + 80bit 随机数，共 128bit） */
export function generateUlid(timestamp: number = Date.now()): string {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
    throw new Error('Timestamp must be an integer within the 48-bit range')
  }
  return encodeTime(timestamp) + encodeRandom()
}

/** 批量生成 ULID，数量越界时抛出 Error */
export function generateUlids(count: number): string[] {
  const { min, max } = ULID_COUNT_RANGE
  if (!Number.isInteger(count) || count < min || count > max) {
    throw new Error(`Count must be an integer between ${min} and ${max}`)
  }
  return Array.from({ length: count }, () => generateUlid())
}
