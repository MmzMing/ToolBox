import { describe, expect, it } from 'vitest'

import { convertBase } from './service'

describe('convertBase', () => {
  it('converts between common bases', () => {
    expect(convertBase('255', 10, 16)).toBe('ff')
    expect(convertBase('ff', 16, 10)).toBe('255')
    expect(convertBase('1010', 2, 10)).toBe('10')
    expect(convertBase('777', 8, 2)).toBe('111111111')
    expect(convertBase('z', 36, 10)).toBe('35')
  })

  it('accepts uppercase digits', () => {
    expect(convertBase('FF', 16, 10)).toBe('255')
    expect(convertBase('FF', 16, 36)).toBe('73')
  })

  it('handles zero', () => {
    expect(convertBase('0', 10, 2)).toBe('0')
    expect(convertBase('0', 2, 36)).toBe('0')
  })

  it('handles negative values', () => {
    expect(convertBase('-255', 10, 16)).toBe('-ff')
    expect(convertBase('-ff', 16, 8)).toBe('-377')
  })

  it('supports big integers beyond Number.MAX_SAFE_INTEGER', () => {
    expect(convertBase('123456789012345678901234567890', 10, 16)).toBe('18ee90ff6c373e0ee4e3f0ad2')
    expect(convertBase('18ee90ff6c373e0ee4e3f0ad2', 16, 10)).toBe('123456789012345678901234567890')
  })

  it('returns empty output for empty input by throwing', () => {
    expect(() => convertBase('', 10, 16)).toThrow()
    expect(() => convertBase('   ', 10, 16)).toThrow()
  })

  it('throws on invalid bases', () => {
    expect(() => convertBase('1', 1, 10)).toThrow()
    expect(() => convertBase('1', 37, 10)).toThrow()
    expect(() => convertBase('1', 10, 0)).toThrow()
    expect(() => convertBase('1', 10.5, 16)).toThrow()
  })

  it('throws on digits outside the source base', () => {
    expect(() => convertBase('2', 2, 10)).toThrow()
    expect(() => convertBase('xyz', 10, 16)).toThrow()
    expect(() => convertBase('-', 10, 16)).toThrow()
  })

  it('throws on non-digit characters', () => {
    expect(() => convertBase('12.5', 10, 16)).toThrow()
    expect(() => convertBase('+5', 10, 16)).toThrow()
  })
})
