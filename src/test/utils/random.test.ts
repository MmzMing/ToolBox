import { describe, expect, it } from 'vitest'

import { randomBytes, randomInt, shuffle } from '@/utils/random'

describe('randomInt', () => {
  it('always returns 0 when the range holds a single value', () => {
    for (let index = 0; index < 50; index++) {
      expect(randomInt(1)).toBe(0)
    }
  })

  it('stays inside the half-open interval [0, max)', () => {
    for (let index = 0; index < 2000; index++) {
      const value = randomInt(7)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(7)
    }
  })

  it('distributes values evenly enough to prove rejection sampling works', () => {
    const buckets = new Array(6).fill(0) as number[]
    const trials = 60000
    for (let index = 0; index < trials; index++) {
      buckets[randomInt(6)] += 1
    }
    const expected = trials / 6
    for (const count of buckets) {
      expect(count).toBeGreaterThan(expected * 0.8)
      expect(count).toBeLessThan(expected * 1.2)
    }
  })
})

describe('shuffle', () => {
  it('returns a new array and leaves the input untouched', () => {
    const source = [1, 2, 3, 4, 5]
    const result = shuffle(source)
    expect(result).not.toBe(source)
    expect(source).toEqual([1, 2, 3, 4, 5])
  })

  it('preserves the multiset of items', () => {
    const source = ['a', 'b', 'c', 'a', 'b']
    expect([...shuffle(source)].sort()).toEqual([...source].sort())
  })

  it('handles empty and single-item inputs', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })

  it('reorders items instead of returning them in place', () => {
    const source = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const reordered = Array.from({ length: 100 }, () => shuffle(source).join('')).some(
      (joined) => joined !== source.join(''),
    )
    expect(reordered).toBe(true)
  })
})

describe('randomBytes', () => {
  it('returns exactly the requested length', () => {
    for (const length of [1, 16, 32, 64]) {
      expect(randomBytes(length)).toHaveLength(length)
    }
  })

  it('crosses the getRandomValues 65536-byte limit instead of throwing', () => {
    expect(randomBytes(70_000)).toHaveLength(70_000)
  })

  it('never repeats a draw', () => {
    expect(randomBytes(32)).not.toEqual(randomBytes(32))
  })

  it('rejects non-positive or fractional lengths', () => {
    expect(() => randomBytes(0)).toThrowError(/positive integer/)
    expect(() => randomBytes(-1)).toThrowError(/positive integer/)
    expect(() => randomBytes(1.5)).toThrowError(/positive integer/)
  })
})
