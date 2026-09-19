import { describe, expect, it } from 'vitest'

import {
  COLOR_FORMATS,
  parseColor,
  tryParseColor,
} from '@/tools/development/color-converter/service'

/** 'rgb(30, 165, 76)' → [30, 165, 76] */
function channels(rgbString: string): number[] {
  return (rgbString.match(/\d+/g) ?? []).map(Number)
}

describe('parseColor', () => {
  it('emits all seven formats for a hex color', () => {
    expect(parseColor('#1ea54c')).toEqual({
      hex: '#1ea54c',
      rgb: 'rgb(30, 165, 76)',
      hsl: 'hsl(140, 69%, 38%)',
      hwb: 'hwb(140 12% 35%)',
      lch: 'lch(59.62% 61.82 145.05)',
      cmyk: 'device-cmyk(82% 0% 54% 35%)',
      name: 'seagreen',
    })
  })

  it('returns exactly the declared formats', () => {
    expect(Object.keys(parseColor('red'))).toEqual([...COLOR_FORMATS])
  })

  it('accepts shorthand hex, missing hash and uppercase input', () => {
    expect(parseColor('#F00').hex).toBe('#ff0000')
    expect(parseColor('0f0').hex).toBe('#00ff00')
    expect(parseColor('1ea54c').hex).toBe('#1ea54c')
    expect(parseColor('  #0000FF  ').hex).toBe('#0000ff')
  })

  it('parses functional and named inputs to the same color', () => {
    for (const input of ['rgb(255, 0, 0)', 'hsl(0, 100%, 50%)', 'red', '#ff0000']) {
      expect(parseColor(input).hex).toBe('#ff0000')
    }
  })

  it('resolves the closest CSS name', () => {
    expect(parseColor('#2e8b56').name).toBe('seagreen')
  })

  it('drops the alpha channel so every format stays opaque', () => {
    expect(parseColor('rgba(30, 165, 76, 0.5)')).toEqual(parseColor('#1ea54c'))
    expect(parseColor('hsla(0, 100%, 50%, .2)')).toEqual(parseColor('#ff0000'))
  })

  it('always emits a picker-safe hex', () => {
    for (const input of [
      '#abc',
      'rgb(10%, 20%, 30%)',
      'hsla(200, 50%, 50%, .2)',
      'rebeccapurple',
    ]) {
      expect(parseColor(input).hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('re-parses every emitted format back to the same rgb channels', () => {
    const source = parseColor('#1ea54c')
    const expected = channels(source.rgb)
    for (const format of COLOR_FORMATS.filter((item) => item !== 'name')) {
      const actual = channels(parseColor(source[format]).rgb)
      expect(actual).toHaveLength(expected.length)
      actual.forEach((value, index) => {
        expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(1)
      })
    }
  })

  it('clamps out-of-range channels instead of rejecting them', () => {
    expect(parseColor('rgb(300, -20, 0)').hex).toBe('#ff0000')
  })

  it('throws on empty and unparseable input', () => {
    expect(() => parseColor('')).toThrow(/Invalid color/)
    expect(() => parseColor('   ')).toThrow(/Invalid color/)
    expect(() => parseColor('not-a-color')).toThrow(/Invalid color: "not-a-color"/)
    expect(() => parseColor('#12345')).toThrow()
  })
})

describe('tryParseColor', () => {
  it('returns null where parseColor throws', () => {
    expect(tryParseColor('')).toBeNull()
    expect(tryParseColor('   ')).toBeNull()
    expect(tryParseColor('oops')).toBeNull()
  })

  it('returns the same values as parseColor', () => {
    expect(tryParseColor('#1ea54c')).toEqual(parseColor('#1ea54c'))
  })
})
