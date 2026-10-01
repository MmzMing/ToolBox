import { describe, expect, it } from 'vitest'

import {
  MIN_CROP_EDGE,
  centerCrop,
  clampRect,
  fullRect,
  isFullRect,
  mapRect,
  sizeForRatio,
} from '@/modules/gif/crop'

describe('centerCrop', () => {
  it('returns the whole frame when no ratio is given', () => {
    expect(centerCrop({ width: 640, height: 360 }, null)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    })
  })

  it('trims the sides of a wide frame for a square', () => {
    expect(centerCrop({ width: 640, height: 360 }, 1)).toEqual({
      x: 140,
      y: 0,
      width: 360,
      height: 360,
    })
  })

  it('trims top and bottom of a portrait frame for a square', () => {
    expect(centerCrop({ width: 480, height: 640 }, 1)).toEqual({
      x: 0,
      y: 80,
      width: 480,
      height: 480,
    })
  })

  it('leaves an already matching frame untouched', () => {
    expect(centerCrop({ width: 640, height: 360 }, 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    })
  })
})

describe('clampRect', () => {
  it('keeps a rect fully inside the frame', () => {
    expect(
      clampRect({ x: -20, y: 500, width: 300, height: 300 }, { width: 200, height: 200 }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    })
  })

  it('rounds fractional drag values to integers', () => {
    expect(
      clampRect({ x: 10.4, y: 20.6, width: 50.5, height: 40.5 }, { width: 100, height: 100 }),
    ).toEqual({
      x: 10,
      y: 21,
      width: 51,
      height: 41,
    })
  })

  it('never collapses below the minimum edge', () => {
    const rect = clampRect({ x: 5, y: 5, width: 1, height: 2 }, { width: 100, height: 100 })

    expect(rect.width).toBe(MIN_CROP_EDGE)
    expect(rect.height).toBe(MIN_CROP_EDGE)
  })

  it('recognises a full-frame rect', () => {
    const bounds = { width: 120, height: 80 }

    expect(isFullRect(fullRect(bounds), bounds)).toBe(true)
    expect(isFullRect({ x: 4, y: 0, width: 120, height: 80 }, bounds)).toBe(false)
  })
})

describe('sizeForRatio', () => {
  it('derives the height from the width', () => {
    expect(sizeForRatio(200, 10, 1, { width: 640, height: 360 })).toEqual({
      width: 200,
      height: 200,
    })
  })

  it('falls back to the requested height when the width would overflow the frame', () => {
    const size = sizeForRatio(600, 300, 1, { width: 640, height: 360 })

    expect(size.height).toBeLessThanOrEqual(360)
    expect(size.width).toBeLessThanOrEqual(640)
  })

  it('stays inside the bounds for a tall ratio', () => {
    const size = sizeForRatio(500, 900, 9 / 16, { width: 320, height: 480 })

    expect(size.width).toBeLessThanOrEqual(320)
    expect(size.height).toBeLessThanOrEqual(480)
  })
})

describe('mapRect', () => {
  it('converts a display-space drag into frame pixels', () => {
    const rect = mapRect(
      { x: 10, y: 10, width: 20, height: 20 },
      { width: 100, height: 100 },
      { width: 400, height: 400 },
    )

    expect(rect).toEqual({ x: 40, y: 40, width: 80, height: 80 })
  })

  it('round-trips back to display space', () => {
    const natural = { width: 400, height: 300 }
    const display = { width: 80, height: 60 }
    const inDisplay = { x: 8, y: 6, width: 16, height: 12 }
    const inNatural = mapRect(inDisplay, display, natural)

    expect(inNatural).toEqual({ x: 40, y: 30, width: 80, height: 60 })
    expect(mapRect(inNatural, natural, display)).toEqual(inDisplay)
  })

  it('rejects a zero-sized source box instead of dividing by zero', () => {
    expect(() =>
      mapRect(
        { x: 0, y: 0, width: 1, height: 1 },
        { width: 0, height: 10 },
        { width: 10, height: 10 },
      ),
    ).toThrowError(/invalid source bounds/)
  })
})
