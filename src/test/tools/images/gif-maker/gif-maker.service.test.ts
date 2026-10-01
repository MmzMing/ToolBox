import { describe, expect, it } from 'vitest'

import {
  canvasOf,
  DEFAULT_SETTINGS,
  delaysFor,
  fpsToDelayCs,
  imageFilesOnly,
  makerBudget,
  rejectedFileCount,
  type MakerSettings,
} from '@/tools/images/gif-maker/gif-maker.service'
import { moveItem, reverseItems } from '@/utils/array-ops'

import { DESKTOP_LIMITS, MOBILE_LIMITS } from '@/modules/gif/budget'

function settings(overrides: Partial<MakerSettings> = {}): MakerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

function imageFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe('fpsToDelayCs', () => {
  it('converts whole and fractional frame rates to centiseconds', () => {
    expect(fpsToDelayCs(5)).toBe(20)
    expect(fpsToDelayCs(12)).toBe(8)
    expect(fpsToDelayCs(3)).toBe(33)
  })

  it('never returns a zero delay', () => {
    expect(fpsToDelayCs(1000)).toBe(1)
  })

  it('rejects a non-positive frame rate', () => {
    expect(() => fpsToDelayCs(0)).toThrowError(/positive number/)
    expect(() => fpsToDelayCs(-4)).toThrowError(/positive number/)
  })
})

describe('imageFilesOnly', () => {
  it('keeps still images and drops non-images', () => {
    const files = [
      imageFile('a.png', 'image/png'),
      imageFile('b.txt', 'text/plain'),
      imageFile('c.jpeg', 'image/jpeg'),
    ]

    expect(imageFilesOnly(files).map((file) => file.name)).toEqual(['a.png', 'c.jpeg'])
    expect(rejectedFileCount(files, imageFilesOnly(files))).toBe(1)
  })

  it('drops animated gifs instead of silently using their first frame', () => {
    const files = [imageFile('loop.gif', 'image/gif')]

    expect(imageFilesOnly(files)).toHaveLength(0)
  })

  it('returns nothing for an empty drop', () => {
    expect(imageFilesOnly([])).toEqual([])
  })
})

describe('ordering', () => {
  it('moves a frame forward and backward without losing the rest', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('leaves the source array untouched', () => {
    const source = ['a', 'b']
    moveItem(source, 0, 1)

    expect(source).toEqual(['a', 'b'])
  })

  it('rejects an out-of-range move', () => {
    expect(() => moveItem(['a'], 0, 1)).toThrowError(/out of range/)
    expect(() => moveItem(['a'], -1, 0)).toThrowError(/out of range/)
  })

  it('reverses for the ping-pong preview', () => {
    expect(reverseItems(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })
})

describe('delaysFor', () => {
  it('falls back to the uniform delay for empty or invalid overrides', () => {
    expect(delaysFor(4, 20, [null, 5, Number.NaN, undefined])).toEqual([20, 5, 20, 20])
  })

  it('pads missing overrides', () => {
    expect(delaysFor(3, 10)).toEqual([10, 10, 10])
  })

  it('rejects a non-positive uniform delay', () => {
    expect(() => delaysFor(2, 0)).toThrowError(/positive integer/)
  })
})

describe('canvasOf', () => {
  it('follows the first image when the aspect is free', () => {
    expect(canvasOf({ width: 1200, height: 800 }, settings())).toEqual({ width: 320, height: 213 })
    expect(canvasOf({ width: 200, height: 100 }, settings({ width: 480 }))).toEqual({
      width: 200,
      height: 100,
    })
  })

  it('locks the canvas to the chosen ratio on its long edge', () => {
    expect(canvasOf({ width: 1200, height: 800 }, settings({ aspect: 'square' }))).toEqual({
      width: 320,
      height: 320,
    })
    expect(canvasOf({ width: 1200, height: 800 }, settings({ aspect: 'nineSixteen' }))).toEqual({
      width: 180,
      height: 320,
    })
  })
})

describe('makerBudget', () => {
  const size = { width: 320, height: 240 }

  it('accepts a short sequence on either breakpoint', () => {
    expect(makerBudget(10, size, 20, false)).toEqual({ ok: true })
    expect(makerBudget(10, size, 20, true)).toEqual({ ok: true })
  })

  it('rejects too many frames on mobile only', () => {
    // 200 帧 × 10cs = 20 秒，正好卡在桌面时长上限内，只暴露帧数差异
    expect(makerBudget(200, size, 10, false)).toEqual({ ok: true })
    expect(makerBudget(200, size, 10, true)).toMatchObject({ ok: false, reason: 'frames' })
  })

  it('rejects a sequence longer than the duration cap', () => {
    const verdict = makerBudget(300, size, 20, false)

    expect(verdict).toMatchObject({ ok: false, reason: 'seconds' })
  })

  it('keeps the mobile caps stricter', () => {
    expect(MOBILE_LIMITS.maxFrames).toBeLessThan(DESKTOP_LIMITS.maxFrames)
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('starts on a conservative desktop width with optimisation on', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ width: 320, fps: 5, loopCount: 0, optimize: true })
  })
})
