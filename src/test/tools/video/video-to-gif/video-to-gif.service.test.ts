import { describe, expect, it } from 'vitest'

import {
  ASPECTS,
  VIDEO_ACCEPT,
  gifFileName,
  isVideoFile,
  rangeSeconds,
  sizeForCrop,
  videoBudget,
} from '@/tools/video/video-to-gif/video-to-gif.service'
import { centerCrop } from '@/modules/gif/crop'
import { frameCountFor } from '@/modules/gif/video-frames'
import { MOBILE_LIMITS } from '@/modules/gif/budget'

function file(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type })
}

describe('isVideoFile', () => {
  it('accepts the containers the browser can decode natively', () => {
    expect(isVideoFile(file('a.mp4', 'video/mp4'))).toBe(true)
    expect(isVideoFile(file('b.MOV', 'video/quicktime'))).toBe(true)
    expect(isVideoFile(file('c.webm', 'video/webm'))).toBe(true)
    expect(isVideoFile(file('d.m4v', ''))).toBe(true)
  })

  it('rejects containers that need a demuxer or a foreign codec', () => {
    expect(isVideoFile(file('a.mkv', 'video/x-matroska'))).toBe(false)
    expect(isVideoFile(file('a.avi', 'video/x-msvideo'))).toBe(false)
    expect(isVideoFile(file('a.png', 'image/png'))).toBe(false)
  })

  it('lists the same formats in the picker and the docs', () => {
    for (const ext of ['.mp4', '.mov', '.webm']) {
      expect(VIDEO_ACCEPT).toContain(ext)
    }
  })
})

describe('centerCrop', () => {
  it('returns the full frame when no ratio is chosen', () => {
    expect(centerCrop({ width: 640, height: 360 }, null)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    })
  })

  it('crops the sides of a wide clip to a centred square', () => {
    expect(centerCrop({ width: 640, height: 360 }, 1)).toEqual({
      x: 140,
      y: 0,
      width: 360,
      height: 360,
    })
  })

  it('crops a portrait clip from the top and bottom', () => {
    expect(centerCrop({ width: 480, height: 640 }, 1)).toEqual({
      x: 0,
      y: 80,
      width: 480,
      height: 480,
    })
  })

  it('leaves an already matching ratio untouched', () => {
    expect(centerCrop({ width: 640, height: 360 }, 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    })
  })

  it('offers a source-preserving default', () => {
    expect(ASPECTS[0]).toEqual({ id: 'source', ratio: null })
  })
})

describe('sizeForCrop', () => {
  it('scales the crop box down without upscaling', () => {
    expect(sizeForCrop({ width: 640, height: 360 }, 320)).toEqual({ width: 320, height: 180 })
    expect(sizeForCrop({ width: 200, height: 200 }, 480)).toEqual({ width: 200, height: 200 })
  })
})

describe('rangeSeconds and frameCountFor', () => {
  it('computes the duration of a range', () => {
    expect(rangeSeconds(1.5, 6)).toBeCloseTo(4.5)
  })

  it('rejects an inverted or empty range', () => {
    expect(() => rangeSeconds(5, 5)).toThrowError(/must be after/)
    expect(() => rangeSeconds(5, 1)).toThrowError(/must be after/)
  })

  it('turns a range into a frame count', () => {
    expect(frameCountFor(0, 8, 12)).toBe(96)
    expect(frameCountFor(2, 2.5, 12)).toBe(6)
  })

  it('refuses a zero-length range in the frame planner too', () => {
    expect(() => frameCountFor(3, 3, 12)).toThrowError(/invalid range/)
  })
})

describe('videoBudget', () => {
  const size = { width: 320, height: 180 }

  it('accepts a short 12fps clip on desktop', () => {
    expect(videoBudget({ frames: 96, size, delayCs: 8, isMobile: false })).toEqual({ ok: true })
  })

  it('rejects beyond the mobile frame ceiling', () => {
    const verdict = videoBudget({
      frames: MOBILE_LIMITS.maxFrames + 1,
      size,
      delayCs: 8,
      isMobile: true,
    })

    expect(verdict).toMatchObject({ ok: false, reason: 'frames' })
  })

  it('rejects a range longer than the duration ceiling', () => {
    const verdict = videoBudget({ frames: 300, size, delayCs: 20, isMobile: false })

    expect(verdict).toMatchObject({ ok: false, reason: 'seconds' })
  })
})

describe('gifFileName', () => {
  it('swaps the extension and keeps the stem', () => {
    expect(gifFileName('my clip.MP4')).toBe('my clip.gif')
  })

  it('falls back to a usable name for an extension-less file', () => {
    expect(gifFileName('')).toBe('clip.gif')
  })
})
