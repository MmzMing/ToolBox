import { describe, expect, it } from 'vitest'

import { generateIpv6UlaPrefixes, ulaRegex, ULA_COUNT_RANGE } from './ipv6-ula-generator.service'

describe('generateIpv6UlaPrefixes', () => {
  it('generates the requested number of prefixes', () => {
    expect(generateIpv6UlaPrefixes(1)).toHaveLength(1)
    expect(generateIpv6UlaPrefixes(10)).toHaveLength(10)
    expect(generateIpv6UlaPrefixes(ULA_COUNT_RANGE.max)).toHaveLength(ULA_COUNT_RANGE.max)
  })

  it('matches the RFC 4193 /48 prefix format', () => {
    for (const prefix of generateIpv6UlaPrefixes(20)) {
      expect(prefix).toMatch(ulaRegex)
      expect(prefix.startsWith('fd')).toBe(true)
    }
  })

  it('generates distinct prefixes in a big batch', () => {
    const prefixes = generateIpv6UlaPrefixes(50)
    expect(new Set(prefixes).size).toBe(50)
  })

  it('rejects counts outside the range and non-integers', () => {
    expect(() => generateIpv6UlaPrefixes(0)).toThrow(/Count must be/)
    expect(() => generateIpv6UlaPrefixes(ULA_COUNT_RANGE.max + 1)).toThrow(/Count must be/)
    expect(() => generateIpv6UlaPrefixes(1.5)).toThrow(Error)
    expect(() => generateIpv6UlaPrefixes(Number.NaN)).toThrow(Error)
  })
})

describe('ulaRegex', () => {
  it('accepts valid /48 ULA prefixes', () => {
    expect(ulaRegex.test('fd12:3456:789a::/48')).toBe(true)
    expect(ulaRegex.test('fd00:0000:0001::/48')).toBe(true)
    expect(ulaRegex.test('fdff:ffff:ffff::/48')).toBe(true)
  })

  it('rejects non-ULA or wrong-length prefixes', () => {
    expect(ulaRegex.test('fe80::/48')).toBe(false)
    expect(ulaRegex.test('fd12:3456:789a::/64')).toBe(false)
    expect(ulaRegex.test('fd12::/48')).toBe(false)
    expect(ulaRegex.test('fd12:3456:789a::')).toBe(false)
    expect(ulaRegex.test('')).toBe(false)
  })
})
