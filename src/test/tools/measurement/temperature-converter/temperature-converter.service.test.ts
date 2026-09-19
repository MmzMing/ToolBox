import { describe, expect, it } from 'vitest'

import {
  convertTemperature,
  temperatureUnits,
} from '@/tools/measurement/temperature-converter/temperature-converter.service'

describe('convertTemperature', () => {
  it('converts from Celsius', () => {
    expect(convertTemperature(0, 'C')).toEqual({ C: 0, F: 32, K: 273.15 })
    expect(convertTemperature(100, 'C')).toEqual({ C: 100, F: 212, K: 373.15 })
  })

  it('converts from Fahrenheit', () => {
    expect(convertTemperature(32, 'F')).toEqual({ C: 0, F: 32, K: 273.15 })
    expect(convertTemperature(212, 'F')).toEqual({ C: 100, F: 212, K: 373.15 })
  })

  it('converts from Kelvin', () => {
    expect(convertTemperature(273.15, 'K')).toEqual({ C: 0, F: 32, K: 273.15 })
    expect(convertTemperature(0, 'K')).toEqual({ C: -273.15, F: -459.67, K: 0 })
  })

  it('converts body temperature accurately', () => {
    const result = convertTemperature(37, 'C')
    expect(result.F).toBe(98.6)
  })

  it('rounds results to 2 decimals', () => {
    const result = convertTemperature(98.6, 'F')
    expect(result.C).toBe(37)
    expect(convertTemperature(1, 'C').F).toBe(33.8)
  })

  it('handles negative values', () => {
    expect(convertTemperature(-40, 'C')).toEqual({ C: -40, F: -40, K: 233.15 })
  })

  it('keeps the source unit value unchanged', () => {
    for (const unit of temperatureUnits) {
      expect(convertTemperature(25, unit)[unit]).toBe(25)
    }
  })

  it('throws on non-finite input', () => {
    expect(() => convertTemperature(Number.NaN, 'C')).toThrow(Error)
    expect(() => convertTemperature(Number.POSITIVE_INFINITY, 'K')).toThrow(Error)
  })
})
