import { describe, expect, it } from 'vitest'

import {
  applyPercentage,
  percentOf,
  percentageChange,
  whatPercentIs,
} from './percentage-calculator.service'

describe('percentOf', () => {
  it('computes Y percent of X', () => {
    expect(percentOf(200, 15)).toBe(30)
    expect(percentOf(50, 100)).toBe(50)
    expect(percentOf(80, 25)).toBe(20)
  })

  it('rounds floating point tails to 6 decimals', () => {
    expect(percentOf(0.1, 3)).toBe(0.003)
    expect(percentOf(19.99, 5)).toBe(0.9995)
  })

  it('handles zero', () => {
    expect(percentOf(0, 50)).toBe(0)
    expect(percentOf(100, 0)).toBe(0)
  })
})

describe('whatPercentIs', () => {
  it('computes X as a percentage of Y', () => {
    expect(whatPercentIs(30, 200)).toBe(15)
    expect(whatPercentIs(50, 50)).toBe(100)
    expect(whatPercentIs(1, 3)).toBe(33.333333)
  })

  it('supports values beyond 100%', () => {
    expect(whatPercentIs(300, 200)).toBe(150)
  })

  it('throws when Y is zero', () => {
    expect(() => whatPercentIs(30, 0)).toThrow(/divide by zero/)
  })
})

describe('percentageChange', () => {
  it('computes positive and negative changes', () => {
    expect(percentageChange(100, 150)).toBe(50)
    expect(percentageChange(150, 100)).toBeCloseTo(-33.333333, 6)
    expect(percentageChange(200, 200)).toBe(0)
  })

  it('supports changes beyond 100%', () => {
    expect(percentageChange(100, 350)).toBe(250)
  })

  it('throws when the starting value is zero', () => {
    expect(() => percentageChange(0, 5)).toThrow(/divide by zero/)
  })
})

describe('applyPercentage', () => {
  it('applies positive and negative percentages', () => {
    expect(applyPercentage(200, 10)).toBe(220)
    expect(applyPercentage(200, -10)).toBe(180)
    expect(applyPercentage(50, 100)).toBe(100)
  })

  it('supports fractional percentages without float tails', () => {
    expect(applyPercentage(0.3, 100)).toBe(0.6)
    expect(applyPercentage(10, 12.5)).toBe(11.25)
  })

  it('handles zero percentage and zero base', () => {
    expect(applyPercentage(200, 0)).toBe(200)
    expect(applyPercentage(0, 50)).toBe(0)
  })
})
