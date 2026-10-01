import { describe, expect, it } from 'vitest'

import { buildGifsicleArgs, optimizeOptionsFor, scaledSize } from '@/modules/gif/optimize'

describe('buildGifsicleArgs', () => {
  it('returns no tokens for an empty option set', () => {
    expect(buildGifsicleArgs({})).toEqual([])
  })

  it('emits tokens in a stable order', () => {
    expect(
      buildGifsicleArgs({
        optimizeLevel: 3,
        lossy: 80,
        maxColors: 128,
        dither: true,
        resize: { width: 320, height: 180 },
        crop: { x: 4, y: 8, width: 100, height: 50 },
        delayCs: 10,
        loopCount: 2,
      }),
    ).toEqual([
      '--optimize=3',
      '--lossy=80',
      '--colors=128',
      '--dither=floyd-steinberg',
      '--resize=320x180',
      '--crop=4,8+100x50',
      '--delay=10',
      '--loopcount=2',
    ])
  })

  it('leaves dithering off unless explicitly asked (it grows the file)', () => {
    expect(buildGifsicleArgs({ dither: false })).not.toContain('--dither=floyd-steinberg')
  })

  it('maps a null loop count to the removal flag', () => {
    expect(buildGifsicleArgs({ loopCount: null })).toEqual(['--no-loopcount'])
  })

  it('rejects values outside the GIF or gifsicle range', () => {
    expect(() => buildGifsicleArgs({ optimizeLevel: 0 as unknown as 1 })).toThrowError(
      /optimizeLevel/,
    )
    expect(() => buildGifsicleArgs({ lossy: 201 })).toThrowError(/lossy/)
    expect(() => buildGifsicleArgs({ maxColors: 1 })).toThrowError(/maxColors/)
    expect(() => buildGifsicleArgs({ resize: { width: 0, height: 10 } })).toThrowError(
      /resize\.width/,
    )
    expect(() => buildGifsicleArgs({ crop: { x: -1, y: 0, width: 10, height: 10 } })).toThrowError(
      /crop\.x/,
    )
    expect(() => buildGifsicleArgs({ delayCs: 0 })).toThrowError(/delayCs/)
    expect(() => buildGifsicleArgs({ loopCount: -1 })).toThrowError(/loopCount/)
  })

  it('never lets a non-numeric value reach the command string', () => {
    const hostile = '--output=/tmp/x' as unknown as number
    const fractional = 1.5

    expect(() => buildGifsicleArgs({ lossy: hostile })).toThrowError(/lossy/)
    expect(() => buildGifsicleArgs({ maxColors: hostile })).toThrowError(/maxColors/)
    expect(() => buildGifsicleArgs({ delayCs: fractional })).toThrowError(/delayCs/)
    expect(() => buildGifsicleArgs({ resize: { width: hostile, height: 1.5 } })).toThrowError(
      /resize\.width/,
    )
  })
})

describe('scaledSize', () => {
  it('keeps the aspect ratio when shrinking and never upscales', () => {
    expect(scaledSize({ width: 640, height: 360 }, 320)).toEqual({ width: 320, height: 180 })
    expect(scaledSize({ width: 200, height: 120 }, 480)).toEqual({ width: 200, height: 120 })
  })

  it('keeps at least one pixel on the short axis', () => {
    expect(scaledSize({ width: 1000, height: 3 }, 96).height).toBeGreaterThanOrEqual(1)
  })
})

describe('optimizeOptionsFor', () => {
  const source = { width: 640, height: 360 }

  it('omits --resize when the target equals the source', () => {
    const { options, size } = optimizeOptionsFor(
      { width: 640, fps: 5, maxColors: 128, lossy: 80 },
      source,
    )

    expect(size).toEqual(source)
    expect(options.resize).toBeUndefined()
    expect(options).toMatchObject({ optimizeLevel: 3, maxColors: 128, lossy: 80, dither: false })
  })

  it('passes the downscaled size and the dither choice through', () => {
    const { options } = optimizeOptionsFor(
      { width: 320, fps: 5, maxColors: 256, lossy: 0 },
      source,
      true,
    )

    expect(options.resize).toEqual({ width: 320, height: 180 })
    expect(options.dither).toBe(true)
  })
})
