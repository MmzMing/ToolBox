import { describe, expect, it } from 'vitest'

import {
  MIN_RELIABLE_DELAY_CS,
  SPEED_STEPS,
  applySpeedFactor,
  secondsOf,
} from '@/modules/gif/speed'

describe('applySpeedFactor', () => {
  it('halves the delays at 2x', () => {
    expect(applySpeedFactor([20, 40, 10], 2)).toEqual({ delaysCs: [10, 20, 5], clamped: 0 })
  })

  it('doubles the delays at 0.5x', () => {
    expect(applySpeedFactor([20], 0.5).delaysCs).toEqual([40])
  })

  it('leaves the playback untouched at 1x', () => {
    expect(applySpeedFactor([12, 34], 1).delaysCs).toEqual([12, 34])
  })

  it('floors very short delays and reports how many were clamped', () => {
    const result = applySpeedFactor([2, 4, 100], 4)

    expect(result.delaysCs).toEqual([MIN_RELIABLE_DELAY_CS, MIN_RELIABLE_DELAY_CS, 25])
    expect(result.clamped).toBe(2)
  })

  it('rounds to whole centiseconds', () => {
    expect(applySpeedFactor([10], 3).delaysCs).toEqual([3])
  })

  it('rejects a nonsense factor', () => {
    expect(() => applySpeedFactor([10], 0)).toThrowError(/positive number/)
    expect(() => applySpeedFactor([10], Number.NaN)).toThrowError(/positive number/)
    expect(() => applySpeedFactor([10], -2)).toThrowError(/positive number/)
  })

  it('offers both slower and faster steps around 1x', () => {
    expect(SPEED_STEPS).toContain(1)
    expect(Math.min(...SPEED_STEPS)).toBeLessThan(1)
    expect(Math.max(...SPEED_STEPS)).toBeGreaterThan(1)
  })
})

describe('secondsOf', () => {
  it('sums centisecond delays into seconds', () => {
    expect(secondsOf([10, 25, 5])).toBeCloseTo(0.4)
    expect(secondsOf([])).toBe(0)
  })
})
