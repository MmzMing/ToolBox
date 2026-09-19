import { describe, expect, it } from 'vitest'

import {
  formatChmod,
  parseChmod,
} from '@/tools/development/chmod-calculator/chmod-calculator.service'

describe('parseChmod', () => {
  it('parses 755 into read/write/execute triads', () => {
    expect(parseChmod('755')).toEqual([
      [true, true, true],
      [true, false, true],
      [true, false, true],
    ])
  })

  it('parses 640 and 000 and 777', () => {
    expect(parseChmod('640')).toEqual([
      [true, true, false],
      [true, false, false],
      [false, false, false],
    ])
    expect(parseChmod('000')).toEqual([
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ])
    expect(parseChmod('777')).toEqual([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ])
  })

  it('throws on invalid input', () => {
    expect(() => parseChmod('')).toThrow(/Invalid chmod/)
    expect(() => parseChmod('95')).toThrow(/Invalid chmod/)
    expect(() => parseChmod('7555')).toThrow(/Invalid chmod/)
    expect(() => parseChmod('abc')).toThrow(/Invalid chmod/)
    expect(() => parseChmod('788')).toThrow(/Invalid chmod/)
  })
})

describe('formatChmod', () => {
  it('formats triads into digits and symbolic modes', () => {
    expect(
      formatChmod([
        [true, true, true],
        [true, false, true],
        [true, false, true],
      ]),
    ).toEqual({ digits: '755', symbolic: 'rwxr-xr-x' })
  })

  it('formats 644 and 000', () => {
    expect(
      formatChmod([
        [true, true, false],
        [true, false, false],
        [true, false, false],
      ]),
    ).toEqual({ digits: '644', symbolic: 'rw-r--r--' })
    expect(
      formatChmod([
        [false, false, false],
        [false, false, false],
        [false, false, false],
      ]),
    ).toEqual({ digits: '000', symbolic: '---------' })
  })
})

describe('roundtrip', () => {
  it('format then parse restores the same triads for all 512 modes', () => {
    for (let value = 0; value < 512; value += 1) {
      const digits = value.toString(8).padStart(3, '0')
      const perms = parseChmod(digits)
      expect(formatChmod(perms).digits).toBe(digits)
      expect(parseChmod(formatChmod(perms).digits)).toEqual(perms)
    }
  })
})
