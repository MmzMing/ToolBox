import { describe, expect, it } from 'vitest'

import { hslToRgb, parseColor, rgbToHsl, rgbToHex } from './service'

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    const color = parseColor('#ff0000')
    expect(color.hex).toBe('#ff0000')
    expect(color.rgb).toEqual({ r: 255, g: 0, b: 0 })
    expect(color.hsl).toEqual({ h: 0, s: 100, l: 50 })
  })

  it('parses shorthand 3-digit hex', () => {
    expect(parseColor('#f00').hex).toBe('#ff0000')
    expect(parseColor('0f0').hex).toBe('#00ff00')
  })

  it('parses rgb() with commas, spaces and alpha', () => {
    expect(parseColor('rgb(255, 0, 0)').hex).toBe('#ff0000')
    expect(parseColor('rgb(255 0 0)').hex).toBe('#ff0000')
    expect(parseColor('rgba(255, 0, 0, 0.5)').hex).toBe('#ff0000')
    expect(parseColor('rgb(100%, 0%, 0%)').hex).toBe('#ff0000')
  })

  it('parses hsl() and hsla()', () => {
    expect(parseColor('hsl(0, 100%, 50%)').hex).toBe('#ff0000')
    expect(parseColor('hsl(120 100% 25%)').hex).toBe('#008000')
    expect(parseColor('hsla(240, 100%, 50%, 1)').hex).toBe('#0000ff')
  })

  it('parses the supported color name subset', () => {
    expect(parseColor('white').hex).toBe('#ffffff')
    expect(parseColor('RED').hex).toBe('#ff0000')
    expect(parseColor('Gray').hex).toBe('#808080')
    expect(parseColor('grey').hex).toBe('#808080')
  })

  it('throws on empty input', () => {
    expect(() => parseColor('')).toThrow()
    expect(() => parseColor('   ')).toThrow()
  })

  it('throws on unknown formats and names', () => {
    expect(() => parseColor('not-a-color')).toThrow()
    expect(() => parseColor('#12345')).toThrow()
    expect(() => parseColor('#1234567')).toThrow()
  })

  it('throws on out-of-range channels', () => {
    expect(() => parseColor('rgb(300, 0, 0)')).toThrow()
    expect(() => parseColor('hsl(0, 101%, 0%)')).toThrow()
    expect(() => parseColor('hsl(361, 0%, 0%)')).toThrow()
  })
})

describe('rgbToHsl / hslToRgb', () => {
  it('converts primary colors correctly', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 })
    expect(rgbToHsl({ r: 0, g: 128, b: 0 })).toEqual({ h: 120, s: 100, l: 25 })
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 })
  })

  it('maps grayscale to zero hue and saturation', () => {
    expect(rgbToHsl({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, l: 0 })
    expect(rgbToHsl({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, l: 100 })
  })

  it('converts hsl back to rgb', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hslToRgb({ h: 120, s: 100, l: 25 })).toEqual({ r: 0, g: 128, b: 0 })
    expect(hslToRgb({ h: 210, s: 50, l: 40 })).toEqual({ r: 51, g: 102, b: 153 })
    expect(hslToRgb({ h: 0, s: 0, l: 50 })).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('wraps negative hue like positive equivalent', () => {
    expect(hslToRgb({ h: -120, s: 100, l: 50 })).toEqual(hslToRgb({ h: 240, s: 100, l: 50 }))
  })
})

describe('rgbToHex', () => {
  it('clamps and pads channels', () => {
    expect(rgbToHex({ r: 0, g: 128, b: 255 })).toBe('#0080ff')
    expect(rgbToHex({ r: 300, g: -1, b: 16 })).toBe('#ff0010')
  })
})
