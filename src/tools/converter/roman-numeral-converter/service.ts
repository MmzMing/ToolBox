const ROMAN_SYMBOLS: readonly (readonly [string, number])[] = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
]

const ROMAN_CHARACTERS: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
}

/** 规范罗马数字（1-3999，减法记法），拒绝 IIII / VVV 等非规范写法 */
const CANONICAL_PATTERN = /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/

/** 整数 → 罗马数字（仅支持 1-3999，越界/非整数抛 Error） */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) {
    throw new Error(`Roman numeral out of range (expected 1-3999): ${value}`)
  }
  let remaining = value
  let result = ''
  for (const [symbol, numberValue] of ROMAN_SYMBOLS) {
    while (remaining >= numberValue) {
      result += symbol
      remaining -= numberValue
    }
  }
  return result
}

/** 罗马数字 → 整数；非法输入抛 Error */
export function fromRoman(roman: string): number {
  const normalized = roman.trim().toUpperCase()
  if (
    normalized === '' ||
    !/^[MDCLXVI]+$/.test(normalized) ||
    !CANONICAL_PATTERN.test(normalized)
  ) {
    throw new Error(`Invalid Roman numeral: "${roman}"`)
  }
  let result = 0
  for (let index = 0; index < normalized.length; index += 1) {
    const current = ROMAN_CHARACTERS[normalized[index]]
    const next = normalized[index + 1] ? ROMAN_CHARACTERS[normalized[index + 1]] : 0
    result += current < next ? -current : current
  }
  return result
}
