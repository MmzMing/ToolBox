import { describe, expect, it } from 'vitest'

import {
  CROP_EXPORT_LONG_EDGE,
  CROP_HANDLES,
  CROP_INITIAL_FRAME_SCALE,
  CROP_MAX_ZOOM,
  CROP_MIN_FRAME_PX,
  CROP_MIN_ZOOM,
  canvasFitScale,
  clampCropFrame,
  cropBounds,
  cropExportSize,
  cropFrameRatio,
  imageRectFor,
  initialCropFrame,
  resizeCropFrame,
  rotateCropView,
  zoomCropView,
} from '@/tools/resume/resume/photo-crop.service'

describe('cropFrameRatio', () => {
  it('maps named ratios to height/width multipliers', () => {
    expect(cropFrameRatio('1:1')).toBe(1)
    expect(cropFrameRatio('4:3')).toBeCloseTo(0.75)
    expect(cropFrameRatio('3:4')).toBeCloseTo(4 / 3)
    expect(cropFrameRatio('16:9')).toBeCloseTo(9 / 16)
  })

  it('returns null for the custom ratio, meaning the frame is free', () => {
    expect(cropFrameRatio('custom')).toBeNull()
  })
})

describe('canvasFitScale', () => {
  it('fits the whole image inside the canvas', () => {
    expect(canvasFitScale({ width: 300, height: 200 }, { width: 600, height: 600 })).toBeCloseTo(
      1 / 3,
    )
    expect(canvasFitScale({ width: 400, height: 300 }, { width: 200, height: 600 })).toBeCloseTo(
      0.5,
    )
  })

  it('returns 1 for missing sizes', () => {
    expect(canvasFitScale({ width: 0, height: 0 }, { width: 200, height: 200 })).toBe(1)
    expect(canvasFitScale({ width: 200, height: 200 }, { width: 0, height: 200 })).toBe(1)
  })
})

describe('imageRectFor', () => {
  const canvas = { width: 400, height: 300 }

  it('centres the image and fills the canvas when aspects match', () => {
    const rect = imageRectFor(canvas, { width: 400, height: 300 }, { zoom: 1, rotation: 0 })
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('letterboxes a portrait image', () => {
    const rect = imageRectFor(canvas, { width: 200, height: 400 }, { zoom: 1, rotation: 0 })
    expect(rect.width).toBeCloseTo(150)
    expect(rect.height).toBeCloseTo(300)
    expect(rect.x).toBeCloseTo(125)
    expect(rect.y).toBeCloseTo(0)
  })

  it('swaps the rect on quarter turns', () => {
    const rect = imageRectFor(canvas, { width: 200, height: 400 }, { zoom: 1, rotation: 90 })
    expect(rect.width).toBeCloseTo(300)
    expect(rect.height).toBeCloseTo(150)
    expect(rect.x).toBeCloseTo(50)
    expect(rect.y).toBeCloseTo(75)
  })

  it('grows past the canvas when zoomed in', () => {
    const rect = imageRectFor(canvas, { width: 200, height: 400 }, { zoom: 2, rotation: 0 })
    expect(rect.width).toBeCloseTo(300)
    expect(rect.height).toBeCloseTo(600)
    expect(rect.x).toBeCloseTo(50)
    expect(rect.y).toBeCloseTo(-150)
  })
})

describe('cropBounds', () => {
  it('intersects the image rect with the canvas', () => {
    const bounds = cropBounds(
      { width: 400, height: 300 },
      { x: 50, y: -150, width: 300, height: 600 },
    )
    expect(bounds).toEqual({ x: 50, y: 0, width: 300, height: 300 })
  })

  it('never returns a non-positive size', () => {
    const bounds = cropBounds({ width: 0, height: 0 }, { x: 100, y: 100, width: 50, height: 50 })
    expect(bounds.width).toBe(1)
    expect(bounds.height).toBe(1)
  })
})

describe('initialCropFrame', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 }

  it('inscribes the ratio rect and centres it', () => {
    const frame = initialCropFrame(bounds, 1)
    const edge = 300 * CROP_INITIAL_FRAME_SCALE
    expect(frame.width).toBeCloseTo(edge)
    expect(frame.height).toBeCloseTo(edge)
    expect(frame.x).toBeCloseTo((400 - edge) / 2)
    expect(frame.y).toBeCloseTo((300 - edge) / 2)
  })

  it('honours a tall ratio', () => {
    const frame = initialCropFrame(bounds, 2)
    expect(frame.width).toBeCloseTo((300 / 2) * CROP_INITIAL_FRAME_SCALE)
    expect(frame.height).toBeCloseTo(frame.width * 2)
  })

  it('copies the bounds proportionally when the ratio is free', () => {
    const frame = initialCropFrame(bounds, null)
    expect(frame.width).toBeCloseTo(400 * CROP_INITIAL_FRAME_SCALE)
    expect(frame.height).toBeCloseTo(300 * CROP_INITIAL_FRAME_SCALE)
    expect(frame.x).toBeCloseTo((400 - frame.width) / 2)
  })
})

describe('clampCropFrame', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 }

  it('keeps the frame inside the bounds', () => {
    const frame = clampCropFrame({ x: 500, y: -50, width: 200, height: 200 }, 1, bounds)
    expect(frame).toEqual({ x: 200, y: 0, width: 200, height: 200 })
  })

  it('shrinks an oversized frame while keeping the ratio', () => {
    const frame = clampCropFrame({ x: 0, y: 0, width: 500, height: 500 }, 1, {
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    })
    expect(frame).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  it('clamps both axes independently when the ratio is free', () => {
    const frame = clampCropFrame({ x: 500, y: -50, width: 200, height: 500 }, null, bounds)
    expect(frame).toEqual({ x: 200, y: 0, width: 200, height: 300 })
  })
})

describe('resizeCropFrame', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 }
  const frame = { x: 100, y: 50, width: 200, height: 200 }

  it('anchors the opposite corner and follows the pointer', () => {
    const next = resizeCropFrame(frame, 'se', 50, 0, 1, bounds)
    expect(next).toEqual({ x: 100, y: 50, width: 250, height: 250 })
  })

  it('grows towards the top-left when dragging the nw handle', () => {
    const next = resizeCropFrame(frame, 'nw', -30, -30, 1, bounds)
    expect(next.x).toBeCloseTo(70)
    expect(next.y).toBeCloseTo(20)
    expect(next.width).toBeCloseTo(230)
  })

  it('keeps the perpendicular centre for edge handles', () => {
    const next = resizeCropFrame(frame, 'e', 500, 0, 1, bounds)
    expect(next).toEqual({ x: 100, y: 0, width: 300, height: 300 })
  })

  it('never shrinks below the minimum edge', () => {
    const next = resizeCropFrame(frame, 'e', -500, 0, 1, bounds)
    expect(next.width).toBe(CROP_MIN_FRAME_PX)
    expect(next.height).toBe(CROP_MIN_FRAME_PX)
  })

  it('drives vertical handles by the height and keeps the ratio', () => {
    const next = resizeCropFrame({ x: 100, y: 50, width: 100, height: 200 }, 's', 0, 100, 2, bounds)
    expect(next.width).toBeCloseTo(125)
    expect(next.height).toBeCloseTo(250)
    expect(next.y).toBeCloseTo(50)
    expect(next.x).toBeCloseTo(87.5)
  })

  it('resizes both axes freely from a corner when the ratio is free', () => {
    const next = resizeCropFrame(frame, 'se', 30, 20, null, bounds)
    expect(next).toEqual({ x: 100, y: 50, width: 230, height: 220 })
  })

  it('keeps the other axis untouched for edge handles when the ratio is free', () => {
    const next = resizeCropFrame(frame, 's', 0, 40, null, bounds)
    expect(next).toEqual({ x: 100, y: 50, width: 200, height: 240 })
  })
})

describe('crop view', () => {
  it('accumulates rotation and normalizes to 0-359', () => {
    expect(rotateCropView({ zoom: 1, rotation: 0 }, 90).rotation).toBe(90)
    expect(rotateCropView({ zoom: 1, rotation: 0 }, -90).rotation).toBe(270)
    expect(rotateCropView({ zoom: 1, rotation: 270 }, 90).rotation).toBe(0)
  })

  it('steps zoom and clamps to the supported range', () => {
    expect(zoomCropView({ zoom: 1, rotation: 0 }, 0.2).zoom).toBe(1.2)
    expect(zoomCropView({ zoom: 1.2, rotation: 0 }, 0.2).zoom).toBe(1.4)
    expect(zoomCropView({ zoom: CROP_MAX_ZOOM, rotation: 0 }, 1).zoom).toBe(CROP_MAX_ZOOM)
    expect(zoomCropView({ zoom: CROP_MIN_ZOOM, rotation: 0 }, -1).zoom).toBe(CROP_MIN_ZOOM)
  })
})

describe('cropExportSize', () => {
  it('keeps the long edge at the export limit', () => {
    expect(cropExportSize({ width: 190, height: 190 })).toEqual({
      width: CROP_EXPORT_LONG_EDGE,
      height: CROP_EXPORT_LONG_EDGE,
    })
    expect(cropExportSize({ width: 200, height: 100 })).toEqual({ width: 512, height: 256 })
  })

  it('never returns a non-positive size', () => {
    expect(cropExportSize({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 })
  })
})

describe('CROP_HANDLES', () => {
  it('lists the eight handles once each', () => {
    expect(CROP_HANDLES).toHaveLength(8)
    expect(new Set(CROP_HANDLES).size).toBe(8)
  })
})
