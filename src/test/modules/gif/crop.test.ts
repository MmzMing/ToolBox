import { describe, expect, it } from 'vitest'

import {
  MIN_CROP_EDGE,
  centerCrop,
  clampRect,
  fullRect,
  isFullRect,
  mapRect,
  rectFromDrag,
  resizeRect,
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

describe('resizeRect', () => {
  const frame = { width: 640, height: 360 }

  it('moves the box without touching its size', () => {
    expect(
      resizeRect({ x: 10, y: 20, width: 100, height: 80 }, 'move', 5, -8, null, frame),
    ).toEqual({ x: 15, y: 12, width: 100, height: 80 })
  })

  it('keeps the far corner fixed when dragging a corner freely', () => {
    const next = resizeRect({ x: 100, y: 100, width: 200, height: 100 }, 'se', 30, 20, null, frame)

    expect(next).toEqual({ x: 100, y: 100, width: 230, height: 120 })
  })

  it('anchors the opposite corner for a north-west drag', () => {
    const next = resizeRect(
      { x: 100, y: 100, width: 200, height: 100 },
      'nw',
      -30,
      -20,
      null,
      frame,
    )

    expect(next).toEqual({ x: 70, y: 80, width: 230, height: 120 })
  })

  it('holds the ratio and derives the height from a wider horizontal drag', () => {
    const next = resizeRect({ x: 0, y: 0, width: 200, height: 100 }, 'se', 40, 2, 2, frame)

    expect(next.width / next.height).toBeCloseTo(2, 1)
    expect(next.width).toBe(240)
  })

  it('holds the ratio and derives the width from a taller vertical drag', () => {
    const next = resizeRect({ x: 0, y: 0, width: 200, height: 100 }, 'se', 2, 50, 2, frame)

    expect(next).toEqual({ x: 0, y: 0, width: 300, height: 150 })
  })

  it('shrinks both edges instead of breaking the ratio when the frame runs out', () => {
    const next = resizeRect({ x: 0, y: 0, width: 200, height: 100 }, 'se', 900, 900, 2, frame)

    expect(next).toEqual({ x: 0, y: 0, width: 640, height: 320 })
  })

  it('never lets a north-west drag cross the frame origin', () => {
    const next = resizeRect({ x: 10, y: 10, width: 100, height: 50 }, 'nw', -999, -999, null, frame)

    expect(next).toEqual({ x: 0, y: 0, width: 110, height: 60 })
  })
})

describe('rectFromDrag', () => {
  const frame = { width: 640, height: 360 }

  it('builds a box from two corners in any direction', () => {
    expect(rectFromDrag({ x: 300, y: 200 }, { x: 100, y: 60 }, null, frame)).toEqual({
      x: 100,
      y: 60,
      width: 200,
      height: 140,
    })
    expect(rectFromDrag({ x: 100, y: 60 }, { x: 300, y: 200 }, null, frame)).toEqual({
      x: 100,
      y: 60,
      width: 200,
      height: 140,
    })
  })

  it('locks the ratio to the anchor corner while drawing', () => {
    const next = rectFromDrag({ x: 100, y: 100 }, { x: 300, y: 250 }, 2, frame)

    expect(next).toEqual({ x: 100, y: 100, width: 300, height: 150 })
  })

  it('stays inside the frame when dragged past an edge', () => {
    const next = rectFromDrag({ x: 600, y: 300 }, { x: 900, y: 900 }, null, frame)

    expect(next).toEqual({ x: 600, y: 300, width: 40, height: 60 })
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
