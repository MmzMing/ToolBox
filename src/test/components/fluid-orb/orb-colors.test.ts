import { describe, expect, it } from 'vitest'

import {
  FALLBACK_COLORS,
  MAX_RIM_COLORS,
  parseHexColor,
  resolveRimColors,
  srgbToLinear,
  toCssColor,
} from '@/components/fluid-orb/orb-colors'

describe('srgbToLinear', () => {
  it('keeps the endpoints fixed', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBeCloseTo(1, 5)
  })

  it('uses the linear segment below the knee', () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 8)
  })

  it('darkens midtones, which is why skipping the conversion shifts hue', () => {
    expect(srgbToLinear(0.5)).toBeLessThan(0.5)
  })
})

describe('parseHexColor', () => {
  it('reads a six digit value with or without the hash', () => {
    const withHash = parseHexColor('#ff006e')
    expect(withHash).not.toBeNull()
    expect(parseHexColor('ff006e')).toEqual(withHash)
  })

  it('expands a three digit shorthand by duplicating nibbles', () => {
    expect(parseHexColor('#f06')).toEqual(parseHexColor('#ff0066'))
  })

  it('is case insensitive', () => {
    expect(parseHexColor('#FF006E')).toEqual(parseHexColor('#ff006e'))
  })

  it('converts full saturation to linear 1 rather than 255', () => {
    const red = parseHexColor('#ff0000')
    expect(red?.[0]).toBeCloseTo(1, 5)
    expect(red?.[1]).toBe(0)
  })

  it.each(['', 'red', '#gg0000', '#12345', '#ff00ff00', '   '])(
    'rejects %j instead of guessing',
    (input) => {
      expect(parseHexColor(input)).toBeNull()
    },
  )
})

describe('resolveRimColors', () => {
  it('falls back to the default wheel when nothing usable is given', () => {
    expect(resolveRimColors(undefined).count).toBe(FALLBACK_COLORS.length)
    expect(resolveRimColors(['nope']).count).toBe(FALLBACK_COLORS.length)
    expect(resolveRimColors([]).count).toBe(FALLBACK_COLORS.length)
  })

  it('keeps going when only one of several values is malformed', () => {
    expect(resolveRimColors(['#ff006e', 'oops', '#3a86ff']).count).toBe(2)
  })

  it('caps at four slots and zeroes the unused ones', () => {
    const palette = resolveRimColors([
      '#ff006e',
      '#8338ec',
      '#3a86ff',
      '#06ffa5',
      '#ffffff',
      '#000000',
    ])
    expect(palette.count).toBe(MAX_RIM_COLORS)
    expect(palette.rgb).toHaveLength(MAX_RIM_COLORS * 3)
  })

  it('pads unused slots with black so the uniform array length stays constant', () => {
    const palette = resolveRimColors(['#ff006e', '#3a86ff'])
    expect(palette.count).toBe(2)
    expect(palette.rgb.slice(6)).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('toCssColor', () => {
  it('round trips white and black through the gamma curve', () => {
    expect(toCssColor([1, 1, 1])).toBe('rgb(255 255 255 / 1)')
    expect(toCssColor([0, 0, 0])).toBe('rgb(0 0 0 / 1)')
  })

  it('emits modern slash alpha syntax', () => {
    expect(toCssColor([0.5, 0.2, 0.9], 0.4)).toMatch(/rgb\(\d+ \d+ \d+ \/ 0\.4\)$/)
  })
})
