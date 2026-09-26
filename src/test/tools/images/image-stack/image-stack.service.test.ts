import { describe, expect, it } from 'vitest'

import {
  autoAssign,
  assertCanvasSize,
  buildSliceName,
  buildSliceZipName,
  CANVAS_RATIOS,
  CANVAS_SIZE_PRESETS,
  clampCustomSize,
  clampStyleBounds,
  countOf,
  cropRectForFocus,
  CUSTOM_SIZE_KEY,
  DEFAULT_EXPORT,
  DEFAULT_RATIO,
  DEFAULT_STYLE,
  directionOf,
  emptyLayer,
  equalGrid,
  extensionOf,
  fitTracks,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  MAX_CELLS,
  MAX_GAP,
  MAX_PADDING,
  MAX_RADIUS,
  MAX_TRACKS,
  MAX_ZOOM,
  MIN_CANVAS_SIDE,
  MIN_ZOOM,
  mimeTypeOf,
  normalizeCustomSize,
  normalizeExport,
  normalizeFocus,
  normalizePresetKey,
  normalizeRatioKey,
  normalizeStyle,
  normalizeWeights,
  panFocus,
  ratioValue,
  resizeLayers,
  resolveCanvasSize,
  resolveCells,
  resolvePlacement,
  scaleScene,
  supportsAlpha,
  trackMax,
  type Focus,
  zoomFocus,
  type Rect,
} from '@/tools/images/image-stack/image-stack.service'
import {
  DEFAULT_SPLIT_TEMPLATE,
  findTemplate,
  SPLIT_CUSTOM_TEMPLATE,
  SPLIT_TEMPLATES,
  STITCH_CUSTOM_TEMPLATE,
} from '@/tools/images/image-stack/templates'

const FULL: Rect = { x: 0, y: 0, width: 100, height: 100 }
const NO_SPACING = { padding: 0, gap: 0 }

describe('normalizeWeights', () => {
  it('normalizes to a sum of one', () => {
    expect(normalizeWeights([1, 2, 1])).toEqual([0.25, 0.5, 0.25])
  })

  it('keeps already normalized values', () => {
    expect(normalizeWeights([0.5, 0.5])).toEqual([0.5, 0.5])
  })

  it('treats non-positive and non-finite values as zero', () => {
    expect(normalizeWeights([1, -3, Number.NaN, 1])).toEqual([0.5, 0, 0, 0.5])
  })

  it('falls back to equal shares when every weight is zero', () => {
    expect(normalizeWeights([0, 0, 0])).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('returns an empty list for empty input', () => {
    expect(normalizeWeights([])).toEqual([])
  })
})

describe('equalGrid', () => {
  it('builds a column-major cell list', () => {
    const grid = equalGrid('g', 2, 3)
    expect(grid.cols).toHaveLength(2)
    expect(grid.rows).toHaveLength(3)
    expect(grid.cells).toHaveLength(6)
    expect(grid.cells[0]).toEqual({ col: 0, row: 0 })
    expect(grid.cells[1]).toEqual({ col: 1, row: 0 })
    expect(grid.cells[2]).toEqual({ col: 0, row: 1 })
  })

  it('clamps track counts into range', () => {
    expect(equalGrid('g', 0, 99).cols).toHaveLength(1)
    expect(equalGrid('g', 99, 0).rows).toHaveLength(1)
    expect(equalGrid('g', MAX_TRACKS + 5, 1).cols).toHaveLength(MAX_TRACKS)
  })

  it('rounds fractional track counts', () => {
    expect(equalGrid('g', 2.4, 2.6).cells).toHaveLength(6)
  })
})

describe('resolveCells', () => {
  it('tiles a 2x2 grid exactly', () => {
    const cells = resolveCells(equalGrid('g', 2, 2), FULL, NO_SPACING)
    expect(cells).toEqual([
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ])
  })

  it('honours unequal column weights', () => {
    const template = {
      id: 'g',
      cols: [0.25, 0.5, 0.25],
      rows: [1],
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
      ],
    }
    const cells = resolveCells(template, FULL, NO_SPACING)
    expect(cells.map((cell) => cell.width)).toEqual([25, 50, 25])
    expect(cells.map((cell) => cell.x)).toEqual([0, 25, 75])
  })

  it('shrinks the content box by padding', () => {
    const cells = resolveCells(equalGrid('g', 1, 1), FULL, { padding: 10, gap: 0 })
    expect(cells).toEqual([{ x: 10, y: 10, width: 80, height: 80 }])
  })

  it('keeps equal tracks when a gap is applied', () => {
    const cells = resolveCells(equalGrid('g', 2, 1), FULL, { padding: 10, gap: 4 })
    expect(cells).toHaveLength(2)
    expect(cells[0]).toEqual({ x: 10, y: 10, width: 38, height: 80 })
    expect(cells[1]).toEqual({ x: 52, y: 10, width: 38, height: 80 })
    // 末轨右沿正好贴住内容区
    expect(cells[1].x + cells[1].width).toBe(90)
  })

  it('offsets into a box that is not at the origin', () => {
    const box: Rect = { x: 30, y: 40, width: 200, height: 100 }
    const cells = resolveCells(equalGrid('g', 2, 1), box, NO_SPACING)
    expect(cells.map((cell) => cell.x)).toEqual([30, 130])
    expect(cells.map((cell) => cell.y)).toEqual([40, 40])
  })

  it('lets a spanning cell swallow the gaps it crosses', () => {
    const template = {
      id: 'hero',
      cols: [0.5, 0.5],
      rows: [0.64, 0.36],
      cells: [
        { col: 0, row: 0, colSpan: 2 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    }
    const cells = resolveCells(template, FULL, { padding: 0, gap: 10 })
    // 可用宽 90（100 减一道间距），两轨各 45，跨两列的主图吃掉中间那道间距回到 100
    expect(cells[0].x).toBe(0)
    expect(cells[0].width).toBeCloseTo(100)
    expect(cells[0].height).toBeCloseTo(57.6)
    expect(cells[1]).toEqual({ x: 0, y: cells[1].y, width: 45, height: cells[1].height })
    expect(cells[1].y).toBeCloseTo(67.6)
    expect(cells[1].height).toBeCloseTo(32.4)
    expect(cells[2].x).toBeCloseTo(55)
    expect(cells[2].y).toBeCloseTo(67.6)
  })

  it('tiles a snapped grid with no seams and no overlap', () => {
    const cells = resolveCells(equalGrid('g', 3, 3), FULL, NO_SPACING, true)
    for (const cell of cells) {
      expect(Number.isInteger(cell.x)).toBe(true)
      expect(Number.isInteger(cell.y)).toBe(true)
      expect(Number.isInteger(cell.width)).toBe(true)
      expect(Number.isInteger(cell.height)).toBe(true)
    }
    const firstRow = cells.slice(0, 3)
    expect(firstRow.reduce((sum, cell) => sum + cell.width, 0)).toBe(100)
    // 相邻格首尾相接，既不留缝也不互相压盖
    expect(firstRow[1].x).toBe(firstRow[0].x + firstRow[0].width)
    expect(firstRow[2].x).toBe(firstRow[1].x + firstRow[1].width)
  })

  it('absorbs rounding error in the last slice', () => {
    const width = 1000
    const cells = resolveCells(
      equalGrid('g', 3, 1),
      { x: 0, y: 0, width, height: 333 },
      NO_SPACING,
      true,
    )
    const totalWidth = cells.reduce((sum, cell) => sum + cell.width, 0)
    expect(totalWidth).toBe(width)
    expect(cells[1].x).toBe(cells[0].x + cells[0].width)
    expect(cells[2].x).toBe(cells[1].x + cells[1].width)
  })

  it('clamps padding that exceeds half the box', () => {
    const cells = resolveCells(equalGrid('g', 1, 1), FULL, { padding: 500, gap: 0 })
    expect(cells).toEqual([{ x: 50, y: 50, width: 0, height: 0 }])
  })

  it('caps the gap so tracks never invert or overflow', () => {
    const cells = resolveCells(equalGrid('g', 4, 1), FULL, { padding: 0, gap: 1000 })
    expect(cells).toHaveLength(4)
    const widths = new Set(cells.map((cell) => cell.width))
    expect(widths.size).toBe(1)
    expect(cells[0].width).toBeGreaterThan(0)
    const last = cells[3]
    expect(last.x + last.width).toBeCloseTo(100)
  })

  it('returns nothing for a template without tracks', () => {
    expect(resolveCells({ id: 'x', cols: [], rows: [1], cells: [] }, FULL, NO_SPACING)).toEqual([])
  })

  it('drops cells that point outside the track range', () => {
    const cells = resolveCells(
      { id: 'x', cols: [1], rows: [1], cells: [{ col: 5, row: 0 }] },
      FULL,
      NO_SPACING,
    )
    expect(cells).toEqual([])
  })
})

describe('resolvePlacement', () => {
  const squareImage = { width: 200, height: 200 }
  const cell: Rect = { x: 10, y: 20, width: 100, height: 50 }

  it('covers the cell and crops the overflow', () => {
    const placement = resolvePlacement(cell, squareImage, {
      fit: 'cover',
      focus: { x: 0, y: 0, zoom: 1 },
    })
    expect({ dx: placement.dx, dy: placement.dy, dw: placement.dw, dh: placement.dh }).toEqual({
      dx: 10,
      dy: 20,
      dw: 100,
      dh: 50,
    })
    // 按短边铺满：缩放 0.5，可见源区 200×100，垂直方向居中裁切
    expect(placement.sw).toBeCloseTo(200)
    expect(placement.sh).toBeCloseTo(100)
    expect(placement.sx).toBeCloseTo(0)
    expect(placement.sy).toBeCloseTo(50)
  })

  it('moves the crop window with focus', () => {
    const tall = { width: 100, height: 400 }
    const atTop = resolvePlacement(cell, tall, { fit: 'cover', focus: { x: 0, y: -1, zoom: 1 } })
    const atBottom = resolvePlacement(cell, tall, {
      fit: 'cover',
      focus: { x: 0, y: 1, zoom: 1 },
    })
    expect(atTop.sy).toBeCloseTo(0)
    expect(atBottom.sy).toBeCloseTo(tall.height - atBottom.sh)
    expect(atTop.sx).toBeCloseTo(0)
  })

  it('clamps focus and zoom outside their range', () => {
    const wild = resolvePlacement(cell, squareImage, {
      fit: 'cover',
      focus: { x: -99, y: 99, zoom: 99 },
    })
    expect(wild.sx).toBeCloseTo(0)
    expect(wild.sy).toBeCloseTo(squareImage.height - wild.sh)
    // zoom 被夹到上限，可见源区随之缩小
    expect(wild.sw).toBeCloseTo(100 / (Math.max(100 / 200, 50 / 200) * MAX_ZOOM))
  })

  it('never crops below the minimum zoom', () => {
    const placement = resolvePlacement(cell, squareImage, {
      fit: 'cover',
      focus: { x: 0, y: 0, zoom: 0.1 },
    })
    expect(placement.sw).toBeCloseTo(200)
    expect(placement.sh).toBeCloseTo(100)
    expect(MIN_ZOOM).toBe(1)
  })

  it('letterboxes and centres on contain', () => {
    const placement = resolvePlacement(cell, squareImage, {
      fit: 'contain',
      focus: { x: 0, y: 0, zoom: 1 },
    })
    expect(placement.dw).toBeCloseTo(50)
    expect(placement.dh).toBeCloseTo(50)
    expect(placement.dx).toBeCloseTo(10 + 25)
    expect(placement.dy).toBeCloseTo(20)
    expect(placement.sw).toBe(200)
    expect(placement.sh).toBe(200)
    expect(placement.sx).toBe(0)
  })

  it('degrades to the cell rect for empty inputs', () => {
    const placement = resolvePlacement(
      cell,
      { width: 0, height: 100 },
      {
        fit: 'cover',
        focus: { x: 0, y: 0, zoom: 1 },
      },
    )
    expect(placement).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
      dx: 10,
      dy: 20,
      dw: 100,
      dh: 50,
    })
  })
})

describe('panFocus', () => {
  it('moves the focus against the drag direction', () => {
    const focus = panFocus({ x: 0, y: 0, zoom: 1 }, 0.25, -0.25)
    expect(focus.x).toBeCloseTo(-0.5)
    expect(focus.y).toBeCloseTo(0.5)
  })

  it('clamps at the ends of the travel', () => {
    expect(panFocus({ x: 0.9, y: 0, zoom: 1 }, -5, 0).x).toBe(1)
    expect(panFocus({ x: 0, y: -0.9, zoom: 1 }, 0, 5).y).toBe(-1)
  })

  it('preserves zoom', () => {
    expect(panFocus({ x: 0, y: 0, zoom: 2.5 }, 0.1, 0.1).zoom).toBe(2.5)
  })
})

describe('canvas size', () => {
  it('lists every ratio with the same preset tiers', () => {
    for (const ratio of CANVAS_RATIOS) {
      const presets = CANVAS_SIZE_PRESETS[ratio.key]
      expect(presets).toHaveLength(3)
      for (const preset of presets) {
        expect(preset.width / preset.height).toBeCloseTo(ratio.width / ratio.height, 2)
      }
    }
  })

  it('resolves a preset tier', () => {
    expect(resolveCanvasSize('9:16', 'web', { width: 1, height: 1 })).toEqual({
      width: 1080,
      height: 1920,
    })
  })

  it('falls back to the first tier for an unknown preset key', () => {
    expect(resolveCanvasSize('1:1', 'nope', { width: 1, height: 1 })).toEqual({
      width: 1080,
      height: 1080,
    })
  })

  it('validates a custom size', () => {
    expect(resolveCanvasSize('1:1', CUSTOM_SIZE_KEY, { width: 640, height: 640 })).toEqual({
      width: 640,
      height: 640,
    })
    expect(resolveCanvasSize('1:1', CUSTOM_SIZE_KEY, { width: 640.4, height: 480.6 })).toEqual({
      width: 640,
      height: 481,
    })
  })

  it('rejects non-finite and non-positive sizes', () => {
    expect(() => assertCanvasSize({ width: 0, height: 100 })).toThrow(/Invalid canvas size/)
    expect(() => assertCanvasSize({ width: -10, height: 100 })).toThrow(/Invalid canvas size/)
    expect(() => assertCanvasSize({ width: Number.NaN, height: 100 })).toThrow(
      /Invalid canvas size/,
    )
    expect(() => assertCanvasSize({ width: Number.POSITIVE_INFINITY, height: 1 })).toThrow(
      /Invalid canvas size/,
    )
  })

  it('rejects oversized canvases', () => {
    expect(() => assertCanvasSize({ width: MAX_CANVAS_SIDE + 1, height: 100 })).toThrow(
      /Canvas side exceeds/,
    )
    expect(() => assertCanvasSize({ width: MAX_CANVAS_SIDE, height: MAX_CANVAS_SIDE })).toThrow(
      /Canvas area exceeds/,
    )
    expect(MAX_CANVAS_AREA).toBeLessThan(MAX_CANVAS_SIDE * MAX_CANVAS_SIDE)
  })

  it('maps ratio keys to numeric ratios', () => {
    expect(ratioValue('1:1')).toBe(1)
    expect(ratioValue('16:9')).toBeCloseTo(16 / 9)
    expect(ratioValue('9:16')).toBeCloseTo(9 / 16)
  })

  it('clamps a custom size into the legal range', () => {
    expect(clampCustomSize(640, 480)).toEqual({ width: 640, height: 480 })
    expect(clampCustomSize(0, -20)).toEqual({ width: MIN_CANVAS_SIDE, height: MIN_CANVAS_SIDE })
    expect(clampCustomSize(Number.NaN, 500).width).toBe(MIN_CANVAS_SIDE)
    expect(clampCustomSize(MAX_CANVAS_SIDE + 1, 100).width).toBe(MAX_CANVAS_SIDE)
  })

  it('scales an oversized custom size down to the area cap', () => {
    const size = clampCustomSize(MAX_CANVAS_SIDE, MAX_CANVAS_SIDE)
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_AREA)
    expect(size.width).toBe(size.height)
    // 收敛后的尺寸必然能过校验
    expect(assertCanvasSize(size)).toEqual(size)
  })

  it('normalizes a persisted custom size', () => {
    expect(normalizeCustomSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 })
    expect(normalizeCustomSize(undefined)).toEqual({ width: 1080, height: 1080 })
    expect(normalizeCustomSize({ width: '800', height: 600 })).toEqual({
      width: 1080,
      height: 1080,
    })
    expect(normalizeCustomSize({ width: -5, height: 1e9 })).toEqual({
      width: MIN_CANVAS_SIDE,
      height: MAX_CANVAS_SIDE,
    })
  })
})

describe('zoomFocus', () => {
  const cell = { width: 200, height: 100 }
  const image = { width: 800, height: 600 }
  const center: Focus = { x: 0, y: 0, zoom: 1 }
  const CELL_RECT: Rect = { x: 0, y: 0, width: 200, height: 100 }

  /** 光标处对应的源图像素坐标：缩放前后必须落在同一个点上 */
  function anchorAt(focus: Focus, u: number, v: number) {
    const placement = resolvePlacement(CELL_RECT, image, { fit: 'cover', focus })
    return { x: placement.sx + u * placement.sw, y: placement.sy + v * placement.sh }
  }

  it('keeps the image point under the cursor while zooming', () => {
    for (const [u, v] of [
      [0, 0],
      [1, 1],
      [0.3, 0.7],
      [0.5, 0.5],
    ]) {
      const before = anchorAt(center, u, v)
      const after = anchorAt(zoomFocus(center, cell, image, 2.5, u, v), u, v)
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    }
  })

  it('shrinks the visible source window as zoom grows', () => {
    const wide = resolvePlacement(CELL_RECT, image, { fit: 'cover', focus: center })
    const tight = resolvePlacement(CELL_RECT, image, {
      fit: 'cover',
      focus: zoomFocus(center, cell, image, 2, 0.5, 0.5),
    })
    expect(tight.sw).toBeCloseTo(wide.sw / 2)
    expect(tight.sh).toBeCloseTo(wide.sh / 2)
  })

  it('clamps zoom and keeps focus inside its range', () => {
    expect(zoomFocus(center, cell, image, 99, 0.5, 0.5).zoom).toBe(MAX_ZOOM)
    expect(zoomFocus(center, cell, image, 0.1, 0.5, 0.5).zoom).toBe(MIN_ZOOM)
    const edge = zoomFocus({ x: 1, y: -1, zoom: 1 }, cell, image, 3, 1, 0)
    expect(edge.x).toBeLessThanOrEqual(1)
    expect(edge.x).toBeGreaterThanOrEqual(-1)
    expect(edge.y).toBeGreaterThanOrEqual(-1)
    expect(edge.y).toBeLessThanOrEqual(1)
  })

  it('is a no-op when the zoom does not change', () => {
    const focus: Focus = { x: 0.4, y: -0.2, zoom: 2 }
    expect(zoomFocus(focus, cell, image, 2, 0.5, 0.5)).toEqual(focus)
  })

  it('survives a degenerate cell', () => {
    expect(zoomFocus(center, { width: 0, height: 100 }, image, 2, 0, 0)).toEqual({
      ...center,
      zoom: 2,
    })
  })
})

describe('cropRectForFocus', () => {
  const focus = (x = 0, y = 0, zoom = 1) => ({ x, y, zoom })

  it('keeps an image that already matches', () => {
    expect(cropRectForFocus({ width: 100, height: 100 }, 1, focus())).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('centres the largest box of the target ratio', () => {
    expect(cropRectForFocus({ width: 200, height: 100 }, 1, focus())).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('slides the crop along the axis that has slack', () => {
    const source = { width: 100, height: 400 }
    expect(cropRectForFocus(source, 1, focus(0, -1))).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(cropRectForFocus(source, 1, focus(0, 1))).toEqual({
      x: 0,
      y: 300,
      width: 100,
      height: 100,
    })
    // 横图裁 1:1 时纵向没有可移范围，focus.y 不该凭空产生位移
    expect(cropRectForFocus({ width: 400, height: 100 }, 1, focus(0, 1))).toEqual({
      x: 150,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('shrinks the crop when zooming in', () => {
    expect(cropRectForFocus({ width: 100, height: 400 }, 1, focus(0, 0, 2))).toEqual({
      x: 25,
      y: 175,
      width: 50,
      height: 50,
    })
  })

  it('clamps focus and zoom back into range', () => {
    const source = { width: 100, height: 400 }
    expect(cropRectForFocus(source, 1, focus(5, -5, 100))).toEqual(
      cropRectForFocus(source, 1, focus(1, -1, MAX_ZOOM)),
    )
  })

  it('returns the whole image for degenerate input', () => {
    expect(cropRectForFocus({ width: 0, height: 100 }, 1, focus())).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 100,
    })
    expect(cropRectForFocus({ width: 100, height: 100 }, 0, focus())).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(cropRectForFocus({ width: 100, height: 100 }, Number.NaN, focus())).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })
})

describe('layer helpers', () => {
  it('creates an empty cover layer', () => {
    expect(emptyLayer()).toEqual({
      imageId: null,
      fit: 'cover',
      focus: { x: 0, y: 0, zoom: 1 },
    })
  })

  it('grows and shrinks the layer list to the cell count', () => {
    const layers = [{ ...emptyLayer(), imageId: 'a' }]
    expect(resizeLayers(layers, 3)).toHaveLength(3)
    expect(resizeLayers(layers, 3)[0].imageId).toBe('a')
    expect(resizeLayers(layers, 3)[2].imageId).toBeNull()
    expect(resizeLayers(layers, 0)).toEqual([])
  })

  it('cycles the images so one asset can fill every cell', () => {
    const layers = autoAssign(['a', 'b'], 4)
    expect(layers.map((layer) => layer.imageId)).toEqual(['a', 'b', 'a', 'b'])
    expect(autoAssign(['a'], 3).map((layer) => layer.imageId)).toEqual(['a', 'a', 'a'])
  })

  it('assigns nothing without images', () => {
    expect(autoAssign([], 2).every((layer) => layer.imageId === null)).toBe(true)
  })
})

describe('scaleScene', () => {
  const scene = {
    canvas: { width: 1000, height: 500 },
    style: {
      ...DEFAULT_STYLE,
      padding: 40,
      gap: 20,
      cellRadius: 16,
      canvasRadius: 8,
    },
    template: equalGrid('g', 2, 1),
    layers: autoAssign(['a', 'b'], 2),
  }

  it('scales the canvas and every pixel-valued style field', () => {
    const scaled = scaleScene(scene, 0.5)
    expect(scaled.canvas).toEqual({ width: 500, height: 250 })
    expect(scaled.style.padding).toBe(20)
    expect(scaled.style.gap).toBe(10)
    expect(scaled.style.cellRadius).toBe(8)
    expect(scaled.style.canvasRadius).toBe(4)
  })

  it('leaves the normalized template and layers alone', () => {
    const scaled = scaleScene(scene, 0.5)
    expect(scaled.template).toBe(scene.template)
    expect(scaled.layers).toBe(scene.layers)
    expect(scaled.style.background).toBe(scene.style.background)
  })

  it('keeps cell geometry proportional', () => {
    const box = { x: 0, y: 0, width: 1000, height: 500 }
    const full = resolveCells(scene.template, box, scene.style)
    const half = resolveCells(
      scene.template,
      { x: 0, y: 0, width: 500, height: 250 },
      scaleScene(scene, 0.5).style,
    )
    expect(half[0].x).toBeCloseTo(full[0].x * 0.5)
    expect(half[0].width).toBeCloseTo(full[0].width * 0.5)
    expect(half[1].height).toBeCloseTo(full[1].height * 0.5)
  })

  it('ignores a non-positive scale', () => {
    expect(scaleScene(scene, 0).canvas).toEqual(scene.canvas)
    expect(scaleScene(scene, Number.NaN).style.gap).toBe(20)
  })
})

describe('export naming', () => {
  it('builds a slice name with 1-based row and column', () => {
    expect(buildSliceName('photo.png', 0, 0, 'png')).toBe('photo_1-1.png')
    expect(buildSliceName('photo.png', 2, 1, 'jpeg')).toBe('photo_3-2.jpg')
    expect(buildSliceName('photo.png', 0, 9, 'webp')).toBe('photo_1-10.webp')
  })

  it('sanitizes the source name and falls back when empty', () => {
    expect(buildSliceName('a/b:c.png', 0, 0, 'png')).toBe('a b c_1-1.png')
    expect(buildSliceName('.png', 0, 0, 'png')).toBe('image_1-1.png')
  })

  it('names the slice archive after the source', () => {
    expect(buildSliceZipName('holiday.jpg')).toBe('holiday-slices.zip')
  })

  it('maps formats to mime types, extensions and alpha support', () => {
    expect(mimeTypeOf('png')).toBe('image/png')
    expect(mimeTypeOf('jpeg')).toBe('image/jpeg')
    expect(mimeTypeOf('webp')).toBe('image/webp')
    expect(extensionOf('jpeg')).toBe('jpg')
    expect(extensionOf('png')).toBe('png')
    expect(supportsAlpha('png')).toBe(true)
    expect(supportsAlpha('webp')).toBe(true)
    expect(supportsAlpha('jpeg')).toBe(false)
  })
})

describe('split templates', () => {
  it('resolves the default template', () => {
    expect(findTemplate(SPLIT_TEMPLATES, DEFAULT_SPLIT_TEMPLATE, DEFAULT_SPLIT_TEMPLATE).id).toBe(
      DEFAULT_SPLIT_TEMPLATE,
    )
  })

  it('falls back for an unknown id', () => {
    expect(findTemplate(SPLIT_TEMPLATES, 'nope', DEFAULT_SPLIT_TEMPLATE).id).toBe(
      DEFAULT_SPLIT_TEMPLATE,
    )
  })

  it('declares unique ids with normalized weights', () => {
    const ids = SPLIT_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of SPLIT_TEMPLATES) {
      expect(template.cols.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
      expect(template.rows.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
      expect(template.cells.length).toBeGreaterThan(0)
    }
  })

  it('keeps every cell inside its tracks and inside the cell budget', () => {
    for (const template of SPLIT_TEMPLATES) {
      expect(template.cells.length).toBeLessThanOrEqual(MAX_CELLS)
      for (const cell of template.cells) {
        expect(cell.col + (cell.colSpan ?? 1)).toBeLessThanOrEqual(template.cols.length)
        expect(cell.row + (cell.rowSpan ?? 1)).toBeLessThanOrEqual(template.rows.length)
      }
    }
  })

  it('leaves the one-dimensional layouts to the direction control', () => {
    const ids = SPLIT_TEMPLATES.map((template) => template.id)
    expect(ids).not.toContain('split-3x1')
    expect(ids).not.toContain('split-1x2')
    for (const template of SPLIT_TEMPLATES) {
      expect(template.cols.length).toBeGreaterThan(1)
      expect(template.rows.length).toBeGreaterThan(1)
    }
  })

  it('gives each mode its own custom id', () => {
    expect(STITCH_CUSTOM_TEMPLATE).not.toBe(SPLIT_CUSTOM_TEMPLATE)
  })
})

describe('fitTracks', () => {
  it('caps each axis on its own', () => {
    expect(fitTracks(0, 1)).toEqual([1, 1])
    expect(fitTracks(MAX_TRACKS + 9, 1)).toEqual([MAX_TRACKS, 1])
    expect(fitTracks(2.4, 2.6)).toEqual([2, 3])
  })

  it('leaves a grid inside the budget untouched', () => {
    expect(fitTracks(3, 9)).toEqual([3, 9])
    expect(fitTracks(6, 6)).toEqual([6, 6])
    expect(fitTracks(12, 3)).toEqual([12, 3])
  })

  it('shrinks an over-budget grid proportionally, keeping the shape', () => {
    expect(fitTracks(10, 10)).toEqual([6, 6])
    expect(fitTracks(12, 12)).toEqual([6, 6])
    const [cols, rows] = fitTracks(12, 6)
    expect(cols * rows).toBeLessThanOrEqual(MAX_CELLS)
    expect(cols / rows).toBeCloseTo(2, 0)
  })

  it('never returns a product above the cap', () => {
    for (let cols = 1; cols <= 14; cols += 1) {
      for (let rows = 1; rows <= 14; rows += 1) {
        const [columns, rowCount] = fitTracks(cols, rows)
        expect(columns * rowCount).toBeLessThanOrEqual(MAX_CELLS)
        expect(columns).toBeGreaterThanOrEqual(1)
        expect(rowCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('feeds the equal grid it builds', () => {
    expect(equalGrid('g', 10, 10).cells).toHaveLength(MAX_CELLS)
  })
})

describe('direction helpers', () => {
  it('derives the direction from the two axes', () => {
    expect(directionOf(5, 1)).toBe('row')
    expect(directionOf(1, 5)).toBe('col')
    expect(directionOf(3, 2)).toBe('grid')
    expect(directionOf(1, 1)).toBe('grid')
  })

  it('reads the count off the longer axis', () => {
    expect(countOf(7, 1)).toBe(7)
    expect(countOf(1, 7)).toBe(7)
    expect(countOf(3, 2)).toBe(3)
  })

  it('derives a per-axis cap from the cell budget', () => {
    expect(trackMax(1)).toBe(MAX_TRACKS)
    expect(trackMax(2)).toBe(MAX_TRACKS)
    expect(trackMax(6)).toBe(6)
    expect(trackMax(9)).toBe(4)
    expect(trackMax(12)).toBe(3)
    expect(trackMax(0)).toBe(MAX_TRACKS)
  })
})

describe('normalizeStyle', () => {
  it('returns defaults for junk input', () => {
    expect(normalizeStyle(undefined)).toEqual(DEFAULT_STYLE)
    expect(normalizeStyle(null)).toEqual(DEFAULT_STYLE)
    expect(normalizeStyle(42)).toEqual(DEFAULT_STYLE)
    expect(normalizeStyle('nope')).toEqual(DEFAULT_STYLE)
  })

  it('rounds and clamps each numeric field', () => {
    const style = normalizeStyle({
      padding: -20,
      gap: 4.6,
      cellRadius: MAX_RADIUS + 900,
      canvasRadius: Number.NaN,
    })
    expect(style.padding).toBe(0)
    expect(style.gap).toBe(5)
    expect(style.cellRadius).toBe(MAX_RADIUS)
    expect(style.canvasRadius).toBe(0)
    expect(MAX_PADDING).toBeGreaterThan(0)
    expect(MAX_GAP).toBeGreaterThan(0)
  })

  it('accepts a valid hex background', () => {
    expect(normalizeStyle({ background: { type: 'color', value: '#1a2b3c' } }).background).toEqual({
      type: 'color',
      value: '#1a2b3c',
    })
  })

  it('accepts the transparent background', () => {
    expect(normalizeStyle({ background: { type: 'transparent' } }).background).toEqual({
      type: 'transparent',
    })
  })

  it('rejects malformed colours', () => {
    expect(normalizeStyle({ background: { type: 'color', value: 'red' } }).background).toEqual({
      type: 'color',
      value: '#ffffff',
    })
    expect(normalizeStyle({ background: { type: 'color', value: '#12345' } }).background).toEqual({
      type: 'color',
      value: '#ffffff',
    })
    expect(normalizeStyle({ background: null }).background).toEqual({
      type: 'color',
      value: '#ffffff',
    })
  })
})

describe('clampStyleBounds', () => {
  it('keeps in-range values untouched', () => {
    expect(clampStyleBounds(DEFAULT_STYLE)).toEqual(DEFAULT_STYLE)
  })

  it('clamps out-of-range values', () => {
    const clamped = clampStyleBounds({
      ...DEFAULT_STYLE,
      padding: MAX_PADDING + 1,
      gap: -5,
      cellRadius: 1e9,
      canvasRadius: Number.NaN,
    })
    expect(clamped.padding).toBe(MAX_PADDING)
    expect(clamped.gap).toBe(0)
    expect(clamped.cellRadius).toBe(MAX_RADIUS)
    expect(clamped.canvasRadius).toBe(0)
  })
})

describe('normalizeFocus', () => {
  it('keeps values inside the draggable range', () => {
    expect(normalizeFocus({ x: 0.5, y: -0.5, zoom: 2 })).toEqual({ x: 0.5, y: -0.5, zoom: 2 })
    expect(normalizeFocus({ x: 9, y: -9, zoom: 99 })).toEqual({ x: 1, y: -1, zoom: MAX_ZOOM })
  })

  it('falls back to centred at 1x for junk', () => {
    const neutral = { x: 0, y: 0, zoom: 1 }
    expect(normalizeFocus(undefined)).toEqual(neutral)
    expect(normalizeFocus('nope')).toEqual(neutral)
    expect(normalizeFocus({ x: Number.NaN, y: null, zoom: '2' })).toEqual(neutral)
    expect(normalizeFocus({ zoom: 0 })).toEqual(neutral)
  })
})

describe('normalizeRatioKey', () => {
  it('accepts a known key', () => {
    expect(normalizeRatioKey('16:9')).toBe('16:9')
  })

  it('falls back to the default for junk', () => {
    expect(normalizeRatioKey('21:9')).toBe(DEFAULT_RATIO)
    expect(normalizeRatioKey(undefined)).toBe(DEFAULT_RATIO)
    expect(normalizeRatioKey(1)).toBe(DEFAULT_RATIO)
  })
})

describe('normalizePresetKey', () => {
  it('accepts a tier that exists for the ratio', () => {
    expect(normalizePresetKey('1:1', 'hd')).toBe('hd')
    expect(normalizePresetKey('1:1', CUSTOM_SIZE_KEY)).toBe(CUSTOM_SIZE_KEY)
  })

  it('falls back to the first tier for junk', () => {
    expect(normalizePresetKey('1:1', 'nope')).toBe('web')
    expect(normalizePresetKey('1:1', null)).toBe('web')
  })
})

describe('normalizeExport', () => {
  it('returns defaults for junk input', () => {
    expect(normalizeExport(undefined)).toEqual(DEFAULT_EXPORT)
    expect(normalizeExport('png')).toEqual(DEFAULT_EXPORT)
  })

  it('reads a valid option', () => {
    expect(normalizeExport({ format: 'webp', quality: 0.6 })).toEqual({
      format: 'webp',
      quality: 0.6,
    })
  })

  it('survives a persist round trip without drifting', () => {
    // 存进去是小数，读回来必须还是小数：曾经按百分数换算把 0.92 读成 0.1
    expect(normalizeExport(DEFAULT_EXPORT)).toEqual(DEFAULT_EXPORT)
    expect(normalizeExport(normalizeExport(DEFAULT_EXPORT))).toEqual(DEFAULT_EXPORT)
  })

  it('rejects an unknown format and clamps quality', () => {
    expect(normalizeExport({ format: 'gif', quality: 0.8 }).format).toBe(DEFAULT_EXPORT.format)
    expect(normalizeExport({ format: 'png', quality: 5000 }).quality).toBe(1)
    expect(normalizeExport({ format: 'png', quality: -5 }).quality).toBe(0.1)
  })
})
