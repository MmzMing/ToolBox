import { describe, expect, it } from 'vitest'

import {
  compileBenchmarkFn,
  runBenchmark,
} from '@/tools/math/benchmark-builder/benchmark-builder.service'

describe('compileBenchmarkFn', () => {
  it('compiles an arrow function source', () => {
    const fn = compileBenchmarkFn('() => 1 + 1')
    expect(typeof fn).toBe('function')
    expect(fn()).toBe(2)
  })

  it('compiles a function body with statements', () => {
    const fn = compileBenchmarkFn(
      '() => { let sum = 0; for (let i = 0; i < 3; i++) sum += i; return sum }',
    )
    expect(fn()).toBe(3)
  })

  it('throws on syntax errors', () => {
    expect(() => compileBenchmarkFn('() => {')).toThrow(Error)
    expect(() => compileBenchmarkFn('not a function (')).toThrow(/failed to compile/)
  })

  it('throws when the code does not evaluate to a function', () => {
    expect(() => compileBenchmarkFn('1 + 1')).toThrow(/must evaluate to a function/)
  })
})

describe('runBenchmark', () => {
  it('returns a result per scenario in input order', () => {
    const results = runBenchmark(
      [
        { name: 'add', code: '() => 1 + 1' },
        { name: 'string', code: '() => "a".repeat(10)' },
      ],
      1000,
    )
    expect(results).toHaveLength(2)
    expect(results.map((result) => result.name)).toEqual(['add', 'string'])
    for (const result of results) {
      expect(result).toHaveProperty('totalMs')
      expect(result).toHaveProperty('avgMs')
      expect(result).toHaveProperty('ratio')
      expect(result.totalMs).toBeGreaterThanOrEqual(0)
      expect(result.avgMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('gives the fastest scenario a ratio of 1 and positive ratios elsewhere', () => {
    const results = runBenchmark(
      [
        { name: 'light', code: '() => 1 + 1' },
        { name: 'heavy', code: '() => { JSON.parse(JSON.stringify({ a: [1, 2, 3] })) }' },
      ],
      2000,
    )
    const ratios = results.map((result) => result.ratio)
    expect(ratios).toContain(1)
    expect(Math.min(...ratios)).toBe(1)
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0)
    }
    expect(Math.max(...ratios)).toBeGreaterThanOrEqual(1)
  })

  it('returns an empty array for no scenarios', () => {
    expect(runBenchmark([], 100)).toEqual([])
  })

  it('throws when iterations is not positive', () => {
    expect(() => runBenchmark([{ name: 'a', code: '() => 1' }], 0)).toThrow(Error)
    expect(() => runBenchmark([{ name: 'a', code: '() => 1' }], -1)).toThrow(Error)
  })

  it('throws when a scenario fails to compile', () => {
    expect(() => runBenchmark([{ name: 'bad', code: '() => {' }], 10)).toThrow(/failed to compile/)
  })
})
