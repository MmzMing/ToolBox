import { describe, expect, it } from 'vitest'

import { generatePorts, parseExcludeList } from './random-port-generator.service'

describe('generatePorts', () => {
  it('generates the requested number of unique ports within range', () => {
    const ports = generatePorts({ count: 10, min: 1024, max: 65535, exclude: [] })
    expect(ports).toHaveLength(10)
    expect(new Set(ports).size).toBe(10)
    for (const port of ports) {
      expect(port).toBeGreaterThanOrEqual(1024)
      expect(port).toBeLessThanOrEqual(65535)
    }
  })

  it('respects excluded ports', () => {
    const ports = generatePorts({ count: 5, min: 1, max: 10, exclude: [1, 2, 3, 4, 5] })
    for (const port of ports) {
      expect(port).toBeGreaterThanOrEqual(6)
      expect(port).toBeLessThanOrEqual(10)
    }
  })

  it('can generate every port of a small range (dedupe)', () => {
    const ports = generatePorts({ count: 5, min: 1, max: 5, exclude: [] })
    expect([...ports].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('throws on invalid count', () => {
    expect(() => generatePorts({ count: 0, min: 1, max: 10, exclude: [] })).toThrow(/count/)
    expect(() => generatePorts({ count: -3, min: 1, max: 10, exclude: [] })).toThrow(/count/)
    expect(() => generatePorts({ count: 1.5, min: 1, max: 10, exclude: [] })).toThrow(/count/)
  })

  it('throws on invalid ranges', () => {
    expect(() => generatePorts({ count: 1, min: 10, max: 1, exclude: [] })).toThrow(/range/)
    expect(() => generatePorts({ count: 1, min: -1, max: 100, exclude: [] })).toThrow(/range/)
    expect(() => generatePorts({ count: 1, min: 1, max: 65536, exclude: [] })).toThrow(/range/)
    expect(() => generatePorts({ count: 1, min: 1.5, max: 10, exclude: [] })).toThrow(/range/)
  })

  it('throws when the count exceeds available ports', () => {
    expect(() => generatePorts({ count: 6, min: 1, max: 5, exclude: [] })).toThrow(
      /Not enough available ports/,
    )
    expect(() => generatePorts({ count: 4, min: 1, max: 5, exclude: [1, 2] })).toThrow(
      /only 3 available/,
    )
  })
})

describe('parseExcludeList', () => {
  it('parses comma separated numbers and dedupes', () => {
    expect(parseExcludeList('8080, 3000,5432')).toEqual([8080, 3000, 5432])
    expect(parseExcludeList('8080,8080')).toEqual([8080])
  })

  it('ignores empty parts and non-integers', () => {
    expect(parseExcludeList('')).toEqual([])
    expect(parseExcludeList(' , , ')).toEqual([])
    expect(parseExcludeList('8080,abc,80.5')).toEqual([8080])
  })
})
