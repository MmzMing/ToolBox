import { describe, expect, it } from 'vitest'

import {
  COLOR_FORMATS,
  composite,
  contrastRatio,
  formatColor,
  hsvToRgb,
  oklchToRgb,
  parseColor,
  readableOn,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
  toCssRgb,
  toHex,
  wcagLevel,
} from '@/utils/color'
import type { Hsva } from '@/utils/color'

const black = { r: 0, g: 0, b: 0, a: 1 }
const white = { r: 1, g: 1, b: 1, a: 1 }

/** 用例里不写到处的非空断言：读不出来就直接失败，报错还带上原串 */
const parse = (input: string, hue = 0): Hsva => {
  const result = parseColor(input, hue)
  if (!result) throw new Error(`unexpected unparseable color: ${input}`)
  return result
}

describe('parseColor', () => {
  it('reads 6-digit hex with and without the hash', () => {
    expect(toHex(parse('#2F6BFF'))).toBe('#2F6BFF')
    expect(toHex(parse('2f6bff'))).toBe('#2F6BFF')
  })

  it('expands shorthand hex and keeps the 4- and 8-digit alpha', () => {
    expect(toHex(parse('#f0a'))).toBe('#FF00AA')
    expect(toHex(parse('#0fa8'))).toBe('#00FFAA88')
    expect(toHex(parse('#2f6bff80'))).toBe('#2F6BFF80')
  })

  it('accepts legacy comma and modern space syntax for rgb and hsl', () => {
    expect(toHex(parse('rgb(47, 107, 255)'))).toBe('#2F6BFF')
    expect(toHex(parse('rgb(47 107 255 / 50%)'))).toBe('#2F6BFF80')
    expect(toHex(parse('rgb(47 107 255 / 0.5)'))).toBe('#2F6BFF80')
    expect(toHex(parse('hsl(222.7, 100%, 59.2%)'))).toBe('#2F6BFF')
    expect(toHex(parse('hsl(222.7deg 100% 59.2%)'))).toBe('#2F6BFF')
    expect(toHex(parse('hsl(222.7 100% 59.2% / 0.5)'))).toBe('#2F6BFF80')
  })

  it('reads oklch in both percent and unitless lightness', () => {
    expect(toHex(parse('oklch(58.1% 0.229 263.9)'))).toBe('#2F6BFF')
    expect(toHex(parse('oklch(0.581 0.229 263.9deg / 50%)'))).toBe('#2F6BFF80')
  })

  it('returns null instead of throwing on junk input', () => {
    const junk = ['', '   ', 'rebeccapurple', '#12345', 'rgb(1 2)', 'oklch(1 2)', '#zzzzzz']
    for (const input of junk) {
      expect(parseColor(input)).toBeNull()
    }
  })

  it('keeps the supplied hue for achromatic colors so the thumb does not jump', () => {
    expect(parse('#808080', 200).h).toBe(200)
    expect(parse('#808080', 20).h).toBe(20)
    expect(parse('#000000', 123).h).toBe(123)
  })
})

describe('hsv / rgb round trip', () => {
  it('maps #2F6BFF to the expected hue, saturation and value', () => {
    const hsv = parse('#2F6BFF')
    expect(hsv.h).toBeCloseTo(222.7, 1)
    expect(hsv.s).toBeCloseTo(0.816, 3)
    expect(hsv.v).toBe(1)
  })

  it('survives rgb → hsv → rgb for the pure hue anchors', () => {
    for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']) {
      expect(toHex(rgbToHsv(hsvToRgb(parse(hex))))).toBe(hex)
    }
  })

  it('clips out-of-gamut oklch back into sRGB', () => {
    const clipped = oklchToRgb({ l: 0.581, c: 0.4, h: 264 })
    expect(clipped.b).toBeLessThanOrEqual(1)
    expect(clipped.r).toBeGreaterThanOrEqual(0)
  })
})

describe('formatColor', () => {
  it('renders all four formats from one color', () => {
    const hsv = parse('#2F6BFF')
    expect(formatColor(hsv, 'hex')).toBe('#2F6BFF')
    expect(formatColor(hsv, 'rgb')).toBe('rgb(47 107 255)')
    expect(formatColor(hsv, 'hsl')).toBe('hsl(223 100% 59%)')
    expect(formatColor(hsv, 'oklch')).toBe('oklch(58.1% 0.229 263.9)')
  })

  it('writes alpha as a percentage only when the color is not opaque', () => {
    const translucent = parse('#2F6BFF80')
    expect(formatColor(translucent, 'hex')).toBe('#2F6BFF80')
    expect(formatColor(translucent, 'rgb')).toBe('rgb(47 107 255 / 50%)')
    expect(formatColor(translucent, 'oklch')).toBe('oklch(58.1% 0.229 263.9 / 50%)')
  })

  it('round-trips through every format within the printed precision', () => {
    const start = parse('#0A7C4F')
    const original = hsvToRgb(start)
    for (const format of COLOR_FORMATS) {
      const rgb = hsvToRgb(parse(formatColor(start, format)))
      for (const channel of ['r', 'g', 'b'] as const) {
        // hsl 的饱和度/亮度只印整数百分比，误差按 3/255 收（约一个色阶）
        expect(Math.abs(rgb[channel] - original[channel])).toBeLessThan(3 / 255)
      }
      expect(rgb.a).toBeCloseTo(original.a, 2)
    }
  })
})

describe('hsl and oklch conversion', () => {
  it('keeps hue when converting a saturated color to hsl', () => {
    const { h, s, l } = rgbToHsl(hsvToRgb(parse('#2F6BFF')), 0)
    expect(h).toBeCloseTo(222.7, 1)
    expect(s).toBeCloseTo(1, 2)
    expect(l).toBeCloseTo(0.592, 3)
  })

  it('agrees with the brand blue the design tokens were derived from', () => {
    const { l, c, h } = rgbToOklch(hsvToRgb(parse('#2F6BFF')), 0)
    expect(l).toBeCloseTo(0.581, 3)
    expect(c).toBeCloseTo(0.229, 3)
    expect(h).toBeCloseTo(263.9, 1)
  })
})

describe('contrast', () => {
  it('gives the WCAG ratios for black and white on white', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 1)
  })

  it('composites alpha over the background before measuring', () => {
    const halfAlphaBlack = { r: 0, g: 0, b: 0, a: 0.5 }
    expect(composite(halfAlphaBlack, white).r).toBeCloseTo(0.5, 2)
    expect(contrastRatio(halfAlphaBlack, white)).toBeLessThan(contrastRatio(black, white))
  })

  it('grades the ratio into the four WCAG buckets', () => {
    expect(wcagLevel(7.5)).toBe('aaa')
    expect(wcagLevel(4.6)).toBe('aa')
    expect(wcagLevel(3.2)).toBe('aaLarge')
    expect(wcagLevel(2.9)).toBe('fail')
  })

  it('picks the readable ink for a swatch', () => {
    expect(readableOn(black)).toEqual(white)
    expect(readableOn(white)).toEqual(black)
  })
})

describe('toCssRgb', () => {
  it('omits the alpha slot for opaque colors', () => {
    expect(toCssRgb(hsvToRgb(parse('#2F6BFF')))).toBe('rgb(47 107 255)')
    expect(toCssRgb(hsvToRgb(parse('#2F6BFF40')))).toBe('rgb(47 107 255 / 0.251)')
  })
})
