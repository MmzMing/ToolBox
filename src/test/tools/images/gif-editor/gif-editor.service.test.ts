import { describe, expect, it } from 'vitest'

import {
  CROP_RATIOS,
  FLIPS,
  ROTATIONS,
  type EditorTransforms,
  editorBudget,
  exportSize,
  frameDelays,
  loadPercent,
  pngFrameName,
  scaleToFit,
  sizeAfterRotate,
} from '@/tools/images/gif-editor/gif-editor.service'
import { MOBILE_LIMITS } from '@/modules/gif/budget'

const SOURCE = { width: 640, height: 360 }

function transforms(overrides: Partial<EditorTransforms> = {}): EditorTransforms {
  return {
    rotate: 0,
    flip: 'none',
    crop: null,
    speed: 1,
    width: 320,
    loopCount: 0,
    optimize: true,
    ...overrides,
  }
}

describe('sizeAfterRotate', () => {
  it('swaps the axes only for quarter turns', () => {
    expect(sizeAfterRotate(SOURCE, 90)).toEqual({ width: 360, height: 640 })
    expect(sizeAfterRotate(SOURCE, 180)).toEqual(SOURCE)
  })
})

describe('scaleToFit', () => {
  it('caps the long edge and never upscales', () => {
    expect(scaleToFit(SOURCE, 320)).toEqual({ width: 320, height: 180 })
    expect(scaleToFit({ width: 200, height: 120 }, 480)).toEqual({ width: 200, height: 120 })
  })
})

describe('exportSize', () => {
  it('applies rotate then scale', () => {
    expect(exportSize(SOURCE, transforms())).toEqual({ width: 320, height: 180 })
    expect(exportSize(SOURCE, transforms({ rotate: 90 }))).toEqual({ width: 180, height: 320 })
  })

  it('measures the long edge against the crop, not the original frame', () => {
    const cropped = exportSize(
      SOURCE,
      transforms({ crop: { x: 0, y: 0, width: 200, height: 300 }, width: 480 }),
    )

    expect(cropped).toEqual({ width: 200, height: 300 })
  })

  it('never lets a rotated portrait break the height ceiling', () => {
    for (const width of [160, 240, 320, 400, 480]) {
      const size = exportSize({ width: 1080, height: 1920 }, transforms({ rotate: 90, width }))

      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(width)
    }
  })
})

describe('frameDelays', () => {
  it('scales every base delay by the speed factor', () => {
    const frames = [{ delayCs: 20 }, { delayCs: 40 }]

    expect(frameDelays(frames, 2)).toEqual({ delaysCs: [10, 20], clamped: 0 })
    expect(frameDelays(frames, 0.5).delaysCs).toEqual([40, 80])
  })

  it('reports frames that hit the reliable floor', () => {
    expect(frameDelays([{ delayCs: 4 }], 4)).toEqual({ delaysCs: [2], clamped: 1 })
  })
})

describe('editorBudget', () => {
  const size = { width: 320, height: 240 }
  // 60 帧 × 40 厘秒 = 24 秒，超桌面 20 秒上限
  const delays = Array.from({ length: 60 }, () => 40)

  it('rejects a slow sequence on duration', () => {
    expect(editorBudget(delays, size, false)).toMatchObject({ ok: false, reason: 'seconds' })
  })

  it('accepts the same frames once they are sped up', () => {
    const fast = frameDelays(
      delays.map((delayCs) => ({ delayCs })),
      4,
    ).delaysCs

    expect(editorBudget(fast, size, false)).toEqual({ ok: true })
  })

  it('rejects on frame count on mobile', () => {
    const many = Array.from({ length: MOBILE_LIMITS.maxFrames + 1 }, () => 5)

    expect(editorBudget(many, size, true)).toMatchObject({ ok: false, reason: 'frames' })
  })
})

describe('option tables', () => {
  it('offers a free crop plus locked ratios', () => {
    expect(CROP_RATIOS[0]).toEqual({ id: 'free', ratio: null })
    expect(CROP_RATIOS.map((item) => item.id)).toContain('nineSixteen')
  })

  it('offers the four GIF rotations and a no-flip default', () => {
    expect(ROTATIONS).toEqual([0, 90, 180, 270])
    expect(FLIPS[0]).toBe('none')
  })
})

describe('pngFrameName', () => {
  it('pads the index so the files sort correctly in the zip', () => {
    expect(pngFrameName('clip', 0)).toBe('clip-frame-001.png')
    expect(pngFrameName('clip', 12)).toBe('clip-frame-013.png')
  })
})

describe('loadPercent', () => {
  it('climbs monotonically through the read / parse / frames phases', () => {
    expect(loadPercent('read')).toBeLessThan(loadPercent('parse'))
    expect(loadPercent('parse')).toBeLessThan(loadPercent('frames'))
    expect(loadPercent('frames')).toBeLessThan(100)
  })

  it('returns 0 for an unknown phase instead of NaN', () => {
    expect(loadPercent('nope' as never)).toBe(0)
  })
})
