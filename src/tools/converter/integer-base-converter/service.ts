const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * 任意进制（2-36）整数互转，内部用 BigInt 支持大整数。
 * 支持大写字母与负号前缀；非法进制/非法字符抛 Error。
 */
export function convertBase(value: string, fromBase: number, toBase: number): string {
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36) {
    throw new Error(`Invalid "from" base: ${fromBase} (expected 2-36)`)
  }
  if (!Number.isInteger(toBase) || toBase < 2 || toBase > 36) {
    throw new Error(`Invalid "to" base: ${toBase} (expected 2-36)`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error('Value is empty')
  }

  const isNegative = trimmed.startsWith('-')
  const digits = (isNegative ? trimmed.slice(1) : trimmed).toLowerCase()
  if (digits === '' || !/^[0-9a-z]+$/.test(digits)) {
    throw new Error(`Invalid digits for base ${fromBase}: "${value}"`)
  }

  let result = 0n
  for (const char of digits) {
    const digit = DIGITS.indexOf(char)
    if (digit < 0 || digit >= fromBase) {
      throw new Error(`Digit "${char}" is out of range for base ${fromBase}`)
    }
    result = result * BigInt(fromBase) + BigInt(digit)
  }

  const output = result.toString(toBase)
  return isNegative && result !== 0n ? `-${output}` : output
}
