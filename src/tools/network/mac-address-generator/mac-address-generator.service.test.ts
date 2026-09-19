import { describe, expect, it } from 'vitest'

import {
  generateMacs,
  MAC_COUNT_RANGE,
  type MacGeneratorOptions,
} from './mac-address-generator.service'

const BASE_OPTIONS: MacGeneratorOptions = { count: 5, separator: ':', uppercase: true }

function macRegex(separator: string, uppercase: boolean): RegExp {
  const hex = uppercase ? '[0-9A-F]{2}' : '[0-9a-f]{2}'
  if (separator === '') {
    return new RegExp(`^${hex}{6}$`)
  }
  const escaped = separator.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${hex}(${escaped}${hex}){5}$`)
}

describe('generateMacs', () => {
  it('generates the requested number of uppercase colon-separated macs', () => {
    const macs = generateMacs(BASE_OPTIONS)
    expect(macs).toHaveLength(5)
    const pattern = macRegex(':', true)
    for (const mac of macs) {
      expect(mac).toMatch(pattern)
    }
  })

  it('supports dash separator and lowercase output', () => {
    const macs = generateMacs({ ...BASE_OPTIONS, separator: '-', uppercase: false })
    const pattern = macRegex('-', false)
    for (const mac of macs) {
      expect(mac).toMatch(pattern)
    }
  })

  it('supports no separator', () => {
    const macs = generateMacs({ ...BASE_OPTIONS, separator: '' })
    for (const mac of macs) {
      expect(mac).toMatch(/^[0-9A-F]{12}$/)
    }
  })

  it('keeps the given prefix in every generated mac', () => {
    const macs = generateMacs({ ...BASE_OPTIONS, prefix: '00:1A:2B' })
    for (const mac of macs) {
      expect(mac.startsWith('00:1A:2B')).toBe(true)
    }
  })

  it('accepts dashed prefix notation', () => {
    const macs = generateMacs({ ...BASE_OPTIONS, prefix: 'AA-BB' })
    for (const mac of macs) {
      expect(mac.startsWith('AA:BB')).toBe(true)
    }
  })

  it('produces unicast addresses (multicast bit cleared) without a prefix', () => {
    const macs = generateMacs({ count: 50, separator: ':', uppercase: true })
    for (const mac of macs) {
      const firstByte = Number.parseInt(mac.slice(0, 2), 16)
      expect(firstByte % 2).toBe(0)
    }
  })

  it('generates distinct macs in a big batch', () => {
    const macs = generateMacs({ count: 100, separator: ':', uppercase: true })
    expect(new Set(macs).size).toBe(100)
  })

  it('rejects counts outside the range and non-integers', () => {
    expect(() => generateMacs({ ...BASE_OPTIONS, count: 0 })).toThrow(/Count must be/)
    expect(() => generateMacs({ ...BASE_OPTIONS, count: MAC_COUNT_RANGE.max + 1 })).toThrow(
      /Count must be/,
    )
    expect(() => generateMacs({ ...BASE_OPTIONS, count: 1.5 })).toThrow(Error)
    expect(() => generateMacs({ ...BASE_OPTIONS, count: Number.NaN })).toThrow(Error)
  })

  it('rejects invalid prefixes', () => {
    expect(() => generateMacs({ ...BASE_OPTIONS, prefix: 'ZZ:11:22' })).toThrow(
      /Invalid MAC prefix/,
    )
    expect(() => generateMacs({ ...BASE_OPTIONS, prefix: '00:1' })).toThrow(Error)
    expect(() => generateMacs({ ...BASE_OPTIONS, prefix: '00:1A:2B:3C:4D:5E' })).toThrow(Error)
  })
})
