import CryptoJS from 'crypto-js'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const totpDigitOptions = [6, 8] as const
export const totpPeriodOptions = [30, 60] as const

export type TotpDigits = (typeof totpDigitOptions)[number]
export type TotpPeriod = (typeof totpPeriodOptions)[number]

export interface TotpOptions {
  digits?: TotpDigits
  period?: TotpPeriod
}

/** RFC 4648 Base32 编码（大写字母 + 2-7，无填充） */
export function base32Encode(bytes: Uint8Array): string {
  let output = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/** RFC 4648 Base32 解码：忽略大小写、空白、连字符与 '=' 填充，非法字符抛 Error */
export function base32Decode(encoded: string): Uint8Array {
  const clean = encoded.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`)
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

function wordArrayToBytes(wordArray: { words: number[]; sigBytes: number }): Uint8Array {
  const bytes = new Uint8Array(wordArray.sigBytes)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  }
  return bytes
}

function counterToBytes(counter: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  let value = counter
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn)
    value >>= 8n
  }
  return bytes
}

/** HOTP（RFC 4226，HMAC-SHA1 + 动态截断） */
function hotp(secretBytes: Uint8Array, counter: bigint, digits: number): string {
  const digest = wordArrayToBytes(
    CryptoJS.HmacSHA1(
      CryptoJS.lib.WordArray.create(counterToBytes(counter)),
      CryptoJS.lib.WordArray.create(secretBytes),
    ),
  )
  const offset = digest[19] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

function resolveSecret(secretBase32: string): Uint8Array {
  const secretBytes = base32Decode(secretBase32)
  if (secretBytes.length === 0) {
    throw new Error('TOTP secret must not be empty')
  }
  return secretBytes
}

/** 生成 TOTP 验证码（RFC 6238，HMAC-SHA1）。atMs 用于测试注入时间。 */
export async function generateTotp(
  secretBase32: string,
  options: TotpOptions = {},
  atMs: number = Date.now(),
): Promise<string> {
  const digits = options.digits ?? 6
  const period = options.period ?? 30
  const secretBytes = resolveSecret(secretBase32)
  const counter = BigInt(Math.floor(atMs / 1000)) / BigInt(period)
  return hotp(secretBytes, counter, digits)
}

/** 校验 TOTP 验证码，允许 ±1 个周期的时钟偏移 */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  options: TotpOptions = {},
  atMs: number = Date.now(),
): Promise<boolean> {
  const digits = options.digits ?? 6
  const period = options.period ?? 30
  const candidate = code.trim()
  if (!/^\d+$/.test(candidate) || candidate.length !== digits) {
    return false
  }
  const secretBytes = resolveSecret(secretBase32)
  const currentCounter = BigInt(Math.floor(atMs / 1000)) / BigInt(period)
  for (const drift of [-1n, 0n, 1n]) {
    if (hotp(secretBytes, currentCounter + drift, digits) === candidate) {
      return true
    }
  }
  return false
}
