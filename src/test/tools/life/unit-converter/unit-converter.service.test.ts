import { describe, expect, it } from 'vitest'

import {
  convertUnit,
  getCategory,
  unitCategories,
} from '@/tools/life/unit-converter/unit-converter.service'

describe('convertUnit', () => {
  it('converts length', () => {
    expect(convertUnit('length', 1, 'km', 'm')).toBe(1000)
    expect(convertUnit('length', 1, 'mile', 'm')).toBeCloseTo(1609.344, 3)
  })

  it('converts weight including chinese units', () => {
    expect(convertUnit('weight', 1, '斤', 'kg')).toBe(0.5)
    expect(convertUnit('weight', 2, '斤', '两')).toBe(20)
  })

  it('converts data with binary factors', () => {
    expect(convertUnit('data', 1, 'GB', 'MB')).toBe(1024)
  })

  it('converts speed', () => {
    expect(convertUnit('speed', 3.6, 'km/h', 'm/s')).toBeCloseTo(1, 10)
  })

  it('same-unit conversion is identity', () => {
    expect(convertUnit('area', 7, 'm²', 'm²')).toBe(7)
  })

  it('throws for unknown units or values', () => {
    expect(() => convertUnit('length', 1, 'kg', 'm')).toThrowError(/Unknown unit/)
    expect(() => convertUnit('length', Number.NaN, 'm', 'km')).toThrowError(/Invalid value/)
  })
})

describe('unitCategories', () => {
  it('declares five categories with unique unit symbols', () => {
    expect(unitCategories.length).toBe(5)
    for (const category of unitCategories) {
      const symbols = category.units.map((u) => u.symbol)
      expect(new Set(symbols).size).toBe(symbols.length)
      expect(category.units.some((u) => u.factor === 1)).toBe(true)
    }
  })

  it('exposes categories via getCategory', () => {
    expect(getCategory('data').baseSymbol).toBe('B')
  })
})
