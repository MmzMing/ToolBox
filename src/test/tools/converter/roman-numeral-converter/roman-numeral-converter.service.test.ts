import { describe, expect, it } from 'vitest'

import { fromRoman, toRoman } from '@/tools/converter/roman-numeral-converter/service'

describe('toRoman', () => {
  it('converts common integers', () => {
    expect(toRoman(1)).toBe('I')
    expect(toRoman(4)).toBe('IV')
    expect(toRoman(9)).toBe('IX')
    expect(toRoman(14)).toBe('XIV')
    expect(toRoman(40)).toBe('XL')
    expect(toRoman(1994)).toBe('MCMXCIV')
    expect(toRoman(2024)).toBe('MMXXIV')
    expect(toRoman(3999)).toBe('MMMCMXCIX')
  })

  it('roundtrips every value in range', () => {
    for (let value = 1; value <= 3999; value += 1) {
      expect(fromRoman(toRoman(value))).toBe(value)
    }
  })

  it('throws on zero, negative, and out-of-range values', () => {
    expect(() => toRoman(0)).toThrow()
    expect(() => toRoman(-5)).toThrow()
    expect(() => toRoman(4000)).toThrow()
  })

  it('throws on non-integers', () => {
    expect(() => toRoman(3.5)).toThrow()
    expect(() => toRoman(Number.NaN)).toThrow()
  })
})

describe('fromRoman', () => {
  it('parses canonical numerals case-insensitively', () => {
    expect(fromRoman('I')).toBe(1)
    expect(fromRoman('IX')).toBe(9)
    expect(fromRoman('mmxxiv')).toBe(2024)
    expect(fromRoman('  MCMXCIV  ')).toBe(1994)
  })

  it('returns empty input as an error', () => {
    expect(() => fromRoman('')).toThrow()
    expect(() => fromRoman('   ')).toThrow()
  })

  it('throws on non-roman characters', () => {
    expect(() => fromRoman('ABC')).toThrow()
    expect(() => fromRoman('IVI')).toThrow()
  })

  it('throws on non-canonical forms', () => {
    expect(() => fromRoman('IIII')).toThrow()
    expect(() => fromRoman('VV')).toThrow()
    expect(() => fromRoman('XXXX')).toThrow()
  })
})
