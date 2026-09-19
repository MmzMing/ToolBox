import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { calculateEta } from '@/tools/math/eta-calculator/eta-calculator.service'

const FIXED_NOW_MS = 1_700_000_000_000

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW_MS })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('calculateEta', () => {
  it('computes percent, remaining and remaining time from a steady rate', () => {
    expect(calculateEta(50, 100, 60)).toEqual({
      percent: 50,
      remaining: 50,
      remainingSeconds: 60,
      etaText: { h: 0, m: 1, s: 0 },
      etaTimestamp: FIXED_NOW_MS + 60_000,
    })
  })

  it('computes hour parts for long estimates', () => {
    const result = calculateEta(3600, 3600 * 3, 3600)
    expect(result.remainingSeconds).toBe(7200)
    expect(result.etaText).toEqual({ h: 2, m: 0, s: 0 })
    expect(result.percent).toBe(33.33)
  })

  it('rounds fractional seconds into the h/m/s parts', () => {
    const result = calculateEta(1, 4, 30)
    expect(result.remainingSeconds).toBe(90)
    expect(result.etaText).toEqual({ h: 0, m: 1, s: 30 })
    expect(result.percent).toBe(25)
    expect(result.etaTimestamp).toBe(FIXED_NOW_MS + 90_000)
  })

  it('treats done = 0 as not estimable', () => {
    const result = calculateEta(0, 10, 5)
    expect(result.percent).toBe(0)
    expect(result.remaining).toBe(10)
    expect(result.remainingSeconds).toBe(Number.POSITIVE_INFINITY)
    expect(result.etaText).toBeNull()
    expect(result.etaTimestamp).toBeNull()
  })

  it('treats elapsed = 0 as not estimable while progress is positive', () => {
    const result = calculateEta(3, 10, 0)
    expect(result.percent).toBe(30)
    expect(result.remainingSeconds).toBe(Number.POSITIVE_INFINITY)
    expect(result.etaText).toBeNull()
    expect(result.etaTimestamp).toBeNull()
  })

  it('returns zero remaining time when done equals total', () => {
    const result = calculateEta(10, 10, 5)
    expect(result.percent).toBe(100)
    expect(result.remaining).toBe(0)
    expect(result.remainingSeconds).toBe(0)
    expect(result.etaText).toEqual({ h: 0, m: 0, s: 0 })
    expect(result.etaTimestamp).toBe(FIXED_NOW_MS)
  })

  it('throws when done exceeds total', () => {
    expect(() => calculateEta(11, 10, 5)).toThrow(/cannot exceed total/)
  })

  it('throws on negative elapsed time', () => {
    expect(() => calculateEta(5, 10, -1)).toThrow(/Elapsed seconds/)
  })

  it('throws on non-positive total', () => {
    expect(() => calculateEta(5, 0, 5)).toThrow(/Total must be/)
    expect(() => calculateEta(5, -1, 5)).toThrow(/Total must be/)
  })

  it('throws on negative done and non-finite inputs', () => {
    expect(() => calculateEta(-1, 10, 5)).toThrow(/Done must be/)
    expect(() => calculateEta(Number.NaN, 10, 5)).toThrow(Error)
    expect(() => calculateEta(5, Number.POSITIVE_INFINITY, 5)).toThrow(Error)
  })
})
