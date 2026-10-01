import { describe, expect, it } from 'vitest'

import {
  budgetForDescriptor,
  customTargetBytes,
  manualToPlan,
  summarizeResult,
  targetBytesOf,
} from '@/tools/images/gif-compressor/gif-compressor.service'
import { DESKTOP_LIMITS, MOBILE_LIMITS } from '@/modules/gif/budget'
import type { GifDescriptor } from '@/modules/gif/types'

const HD: GifDescriptor = {
  width: 480,
  height: 270,
  frameCount: 60,
  loopCount: 0,
  delaysCs: Array.from({ length: 60 }, () => 10),
}

describe('manualToPlan', () => {
  it('carries the dither choice alongside the search parameters', () => {
    expect(manualToPlan({ width: 320, maxColors: 128, lossy: 80, dither: true })).toEqual({
      params: { width: 320, fps: 5, maxColors: 128, lossy: 80 },
      dither: true,
    })
  })
})

describe('target budgets', () => {
  it('reads the byte budget from the platform preset', () => {
    expect(targetBytesOf('slack')).toBe(128 * 1024)
  })

  it('converts a custom KB value and rejects a non-positive one', () => {
    expect(customTargetBytes(200)).toBe(204_800)
    expect(() => customTargetBytes(0)).toThrowError(/positive number of KB/)
    expect(() => customTargetBytes(Number.NaN)).toThrowError(/positive number of KB/)
  })
})

describe('budgetForDescriptor', () => {
  it('accepts a 60-frame clip on desktop', () => {
    expect(budgetForDescriptor(HD, false)).toEqual({ ok: true })
  })

  it('rejects the same clip on mobile because the width exceeds the mobile cap', () => {
    expect(budgetForDescriptor(HD, true)).toMatchObject({ ok: false, reason: 'width' })
  })

  it('rejects a gif with more frames than the cap before encoding', () => {
    const huge: GifDescriptor = {
      ...HD,
      frameCount: 3000,
      delaysCs: Array.from({ length: 3000 }, () => 10),
    }

    expect(budgetForDescriptor(huge, false)).toMatchObject({ ok: false, reason: 'frames' })
  })

  it('sums per-frame delays into the duration', () => {
    const slow: GifDescriptor = { ...HD, delaysCs: Array.from({ length: 60 }, () => 100) }

    expect(budgetForDescriptor(slow, false)).toMatchObject({ ok: false, reason: 'seconds' })
  })

  it('uses the stricter limits on mobile', () => {
    expect(MOBILE_LIMITS.maxWidth).toBeLessThan(DESKTOP_LIMITS.maxWidth)
  })
})

describe('summarizeResult', () => {
  it('reports the saved ratio of a successful pass', () => {
    expect(summarizeResult(1000, 400)).toEqual({ savedBytes: 600, savedRatio: 0.6, grew: false })
  })

  it('flags a pass that grew the file so the UI can keep the original', () => {
    expect(summarizeResult(1000, 1200)).toMatchObject({ savedBytes: -200, grew: true })
  })

  it('does not divide by zero on an empty original', () => {
    expect(summarizeResult(0, 0).savedRatio).toBe(0)
  })
})
