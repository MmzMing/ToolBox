import { describe, expect, it } from 'vitest'

import { BEAD_BRANDS, loadBrandColors } from '@/tools/images/image-to-beads/palettes'
import {
  beadsForRect,
  boardsForGrid,
  buildBeadCsv,
  countBeads,
  createRng,
  deltaE76,
  EMPTY_CELL,
  GRID_MAX,
  mapToBeads,
  MAX_BOARD_SPAN,
  nearestColorIndex,
  normalizeRect,
  PEGS_PER_BOARD,
  restrictPalette,
  rgbToHex,
  rgbToLab,
  sampleCells,
  type BeadColor,
  type Lab,
  type Rgb,
} from '@/tools/images/image-to-beads/image-to-beads.service'

const color = (ref: string, rgb: Rgb): BeadColor => ({
  ref,
  name: `Color ${ref}`,
  rgb,
  lab: rgbToLab(rgb),
})

const PALETTE: readonly BeadColor[] = [
  color('W', [255, 255, 255]),
  color('K', [0, 0, 0]),
  color('R', [255, 0, 0]),
  color('G', [0, 255, 0]),
  color('B', [0, 0, 255]),
]

/** 生成纯色位图 */
function solid(width: number, height: number, [r, g, b, a = 255]: readonly number[]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = a
  }
  return pixels
}

/** 左右两色的位图，用于验证分块均值 */
function splitVertical(width: number, height: number, left: number[], right: number[]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = x < width / 2 ? left : right
      const at = (y * width + x) * 4
      pixels[at] = source[0]
      pixels[at + 1] = source[1]
      pixels[at + 2] = source[2]
      pixels[at + 3] = source[3] ?? 255
    }
  }
  return pixels
}

const baseOptions = { cols: 4, rows: 4, alphaThreshold: 128 }

describe('rgbToLab', () => {
  it('maps black to L 0 and white to L 100', () => {
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 1)
    expect(rgbToLab([255, 255, 255])[0]).toBeCloseTo(100, 1)
  })

  it('matches published sRGB → CIELAB(D65) reference values', () => {
    const white = rgbToLab([255, 255, 255])
    expect(white[0]).toBeCloseTo(100, 1)
    // 上游沿用的是四位小数的 XYZ 矩阵，中性色会有千分位的残差
    expect(Math.abs(white[1])).toBeLessThan(0.05)
    expect(Math.abs(white[2])).toBeLessThan(0.05)
    const red = rgbToLab([255, 0, 0])
    expect(red[0]).toBeCloseTo(53.24, 1)
    expect(red[1]).toBeCloseTo(80.09, 1)
    expect(red[2]).toBeCloseTo(67.2, 1)
    const blue = rgbToLab([0, 0, 255])
    expect(blue[0]).toBeCloseTo(32.3, 1)
    expect(blue[2]).toBeCloseTo(-107.86, 1)
  })
})

describe('deltaE76', () => {
  it('is zero only for the same color', () => {
    expect(deltaE76([50, 10, -5], [50, 10, -5])).toBe(0)
    expect(deltaE76([50, 10, -5], [50, 10, -4])).toBeGreaterThan(0)
  })

  it('equals the plain euclidean distance and is symmetric', () => {
    const a: Lab = [0, 0, 0]
    const b: Lab = [0, 3, 4]
    expect(deltaE76(a, b)).toBeCloseTo(5)
    expect(deltaE76(a, b)).toBe(deltaE76(b, a))
  })
})

describe('normalizeRect', () => {
  it('rounds and keeps an in-bounds rect untouched', () => {
    expect(normalizeRect({ x: 4.4, y: 6.6, width: 10, height: 20 }, 100, 100)).toEqual({
      x: 4,
      y: 7,
      width: 10,
      height: 20,
    })
  })

  it('clamps a rect that overflows the image', () => {
    expect(normalizeRect({ x: 90, y: 90, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 90,
      y: 90,
      width: 10,
      height: 10,
    })
  })

  it('keeps at least one pixel of size', () => {
    expect(normalizeRect({ x: 0, y: 0, width: 0, height: 0 }, 10, 10)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it('rejects non-finite input', () => {
    expect(() => normalizeRect({ x: Number.NaN, y: 0, width: 5, height: 5 }, 10, 10)).toThrow(
      /finite/,
    )
  })
})

describe('beadsForRect', () => {
  it('divides the selection by the grain and rounds', () => {
    expect(beadsForRect({ x: 0, y: 0, width: 100, height: 60 }, 5)).toEqual({ cols: 20, rows: 12 })
  })

  it('caps both sides at the board limit and never drops below one', () => {
    expect(beadsForRect({ x: 0, y: 0, width: 9000, height: 10 }, 2).cols).toBe(GRID_MAX)
    expect(beadsForRect({ x: 0, y: 0, width: 1, height: 1 }, 40)).toEqual({ cols: 1, rows: 1 })
  })

  it('treats a non-positive grain as one pixel per bead', () => {
    expect(beadsForRect({ x: 0, y: 0, width: 30, height: 30 }, 0)).toEqual({ cols: 30, rows: 30 })
  })
})

describe('boardsForGrid', () => {
  it('rounds each axis up to whole pegboards', () => {
    expect(boardsForGrid(58, 66)).toEqual({ cols: 2, rows: 3, total: 6 })
    expect(boardsForGrid(29, 29)).toEqual({ cols: 1, rows: 1, total: 1 })
  })

  it('always needs at least one board', () => {
    expect(boardsForGrid(1, 1)).toEqual({ cols: 1, rows: 1, total: 1 })
  })

  it('spans 1x1 up to the 6x6 grid cap', () => {
    expect(boardsForGrid(PEGS_PER_BOARD, PEGS_PER_BOARD)).toEqual({ cols: 1, rows: 1, total: 1 })
    expect(boardsForGrid(GRID_MAX, GRID_MAX)).toEqual({
      cols: MAX_BOARD_SPAN,
      rows: MAX_BOARD_SPAN,
      total: MAX_BOARD_SPAN * MAX_BOARD_SPAN,
    })
  })
})

describe('sampleCells', () => {
  it('rejects buffers that do not match the dimensions', () => {
    expect(() => sampleCells(new Uint8ClampedArray(4), 2, 2, baseOptions)).toThrow(/does not match/)
  })

  it('rejects empty images and out-of-range grids', () => {
    expect(() => sampleCells(new Uint8ClampedArray(0), 0, 0, baseOptions)).toThrow(/empty image/)
    expect(() => sampleCells(solid(8, 8, [0, 0, 0]), 8, 8, { ...baseOptions, cols: 200 })).toThrow(
      /between/,
    )
    expect(() => sampleCells(solid(8, 8, [0, 0, 0]), 8, 8, { ...baseOptions, cols: 3.5 })).toThrow(
      /integer/,
    )
  })

  it('averages every block into one Lab per cell', () => {
    const cells = sampleCells(splitVertical(8, 8, [255, 0, 0], [0, 0, 255]), 8, 8, {
      ...baseOptions,
      cols: 2,
      rows: 1,
    })
    expect(cells).toHaveLength(2)
    expect(cells[0]).toEqual(rgbToLab([255, 0, 0]))
    expect(cells[1]).toEqual(rgbToLab([0, 0, 255]))
  })

  it('fills every cell of a uniform image', () => {
    const cells = sampleCells(solid(16, 16, [10, 20, 30]), 16, 16, baseOptions)
    expect(cells.every((cell) => cell !== null)).toBe(true)
    expect(cells[0]).toEqual(rgbToLab([10, 20, 30]))
  })

  it('treats pixels below the alpha threshold as absent', () => {
    const cells = sampleCells(solid(8, 8, [10, 20, 30, 100]), 8, 8, {
      ...baseOptions,
      cols: 2,
      rows: 2,
    })
    expect(cells.every((cell) => cell === null)).toBe(true)

    const kept = sampleCells(solid(8, 8, [10, 20, 30, 200]), 8, 8, {
      ...baseOptions,
      cols: 2,
      rows: 2,
      alphaThreshold: 128,
    })
    expect(kept.every((cell) => cell !== null)).toBe(true)
  })

  it('samples only inside the given selection rect', () => {
    const cells = sampleCells(splitVertical(16, 16, [255, 0, 0], [0, 0, 255]), 16, 16, {
      ...baseOptions,
      cols: 2,
      rows: 2,
      rect: { x: 8, y: 0, width: 8, height: 16 },
    })
    expect(cells.every((cell) => cell !== null)).toBe(true)
    expect(cells[0]).toEqual(rgbToLab([0, 0, 255]))
  })

  it('clamps a selection rect that runs off the image', () => {
    const cells = sampleCells(solid(16, 16, [9, 9, 9]), 16, 16, {
      ...baseOptions,
      cols: 2,
      rows: 2,
      rect: { x: 12, y: 12, width: 40, height: 40 },
    })
    expect(cells.every((cell) => cell !== null)).toBe(true)
  })
})

describe('nearestColorIndex', () => {
  it('returns an exact hit when the palette contains the color', () => {
    expect(nearestColorIndex(rgbToLab([255, 0, 0]), PALETTE)).toBe(2)
  })

  it('prefers the perceptually closest swatch over the numerically closest RGB', () => {
    const index = nearestColorIndex(rgbToLab([250, 245, 240]), PALETTE)
    expect(PALETTE[index].ref).toBe('W')
  })

  it('rejects an empty palette', () => {
    expect(() => nearestColorIndex([50, 0, 0], [])).toThrow(/empty palette/)
  })
})

describe('createRng', () => {
  it('is reproducible and stays in [0, 1)', () => {
    const first = Array.from({ length: 8 }, createRng(1234))
    const second = Array.from({ length: 8 }, createRng(1234))
    expect(first).toEqual(second)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
  })
})

describe('restrictPalette', () => {
  const cells = sampleCells(splitVertical(16, 16, [255, 0, 0], [0, 0, 255]), 16, 16, {
    ...baseOptions,
    cols: 8,
    rows: 8,
  })

  it('returns the whole palette when the limit is zero or larger than it', () => {
    expect(restrictPalette(cells, PALETTE, 0)).toHaveLength(PALETTE.length)
    expect(restrictPalette(cells, PALETTE, 99)).toHaveLength(PALETTE.length)
  })

  it('never returns more distinct colors than requested', () => {
    for (const limit of [1, 2, 3, 4]) {
      const chosen = restrictPalette(cells, PALETTE, limit)
      expect(new Set(chosen).size).toBe(chosen.length)
      expect(chosen.length).toBeLessThanOrEqual(limit)
    }
  })

  it('keeps the two dominant colors of a two-tone image', () => {
    const chosen = restrictPalette(cells, PALETTE, 2).map((index) => PALETTE[index].ref)
    expect(chosen).toContain('R')
    expect(chosen).toContain('B')
  })

  it('is deterministic for the same input', () => {
    expect(restrictPalette(cells, PALETTE, 3)).toEqual(restrictPalette(cells, PALETTE, 3))
  })

  it('returns nothing when every cell is empty', () => {
    expect(restrictPalette([null, null], PALETTE, 2)).toEqual([])
  })

  it('rejects an empty palette', () => {
    expect(() => restrictPalette(cells, [], 2)).toThrow(/empty palette/)
  })
})

describe('mapToBeads', () => {
  const flat = [rgbToLab([255, 0, 0]), rgbToLab([255, 0, 0]), rgbToLab([0, 0, 255])]

  it('maps each cell to the requested swatches', () => {
    const grid = mapToBeads(flat, 3, 1, PALETTE, null, { dither: false })
    expect([...grid.cells]).toEqual([2, 2, 4])
  })

  it('keeps empty cells empty', () => {
    const grid = mapToBeads([null, rgbToLab([0, 0, 0])], 2, 1, PALETTE, null, { dither: false })
    expect([...grid.cells]).toEqual([EMPTY_CELL, 1])
  })

  it('restricts the output to the allowed indices', () => {
    const grid = mapToBeads(flat, 3, 1, PALETTE, [0, 1], { dither: false })
    expect(new Set([...grid.cells])).toEqual(new Set([0, 1]))
  })

  it('does not change a flat color when dithering', () => {
    const plain = mapToBeads(flat, 3, 1, PALETTE, null, { dither: false })
    const diffused = mapToBeads(flat, 3, 1, PALETTE, null, { dither: true })
    expect([...diffused.cells]).toEqual([...plain.cells])
  })

  it('spreads quantisation error across neighbours when dithering', () => {
    // 中灰离白更近：不抖动整行全白，误差扩散后会把一部分格子推回黑
    const grays = Array.from({ length: 8 }, () => rgbToLab([120, 120, 120]))
    const blackWhite = [PALETTE[1], PALETTE[0]]
    const plain = mapToBeads(grays, 8, 1, blackWhite, null, { dither: false })
    const diffused = mapToBeads(grays, 8, 1, blackWhite, null, { dither: true })
    expect(new Set([...plain.cells]).size).toBe(1)
    expect(new Set([...diffused.cells]).size).toBe(2)
  })

  it('does not mutate the caller cells when dithering', () => {
    const cells = [rgbToLab([12, 34, 56]), rgbToLab([78, 90, 100])]
    const snapshot = structuredClone(cells)
    mapToBeads(cells, 2, 1, PALETTE, null, { dither: true })
    expect(cells).toEqual(snapshot)
  })

  it('rejects an empty palette', () => {
    expect(() => mapToBeads(flat, 3, 1, [], null, { dither: false })).toThrow(/empty palette/)
  })
})

describe('countBeads', () => {
  it('sums to the filled cells and reports shares that add up to one', () => {
    const grid = mapToBeads(
      [rgbToLab([255, 0, 0]), rgbToLab([255, 0, 0]), rgbToLab([0, 0, 255]), null],
      4,
      1,
      PALETTE,
      null,
      { dither: false },
    )
    const usage = countBeads(grid, PALETTE)
    expect(usage.reduce((sum, item) => sum + item.count, 0)).toBe(3)
    expect(usage.reduce((sum, item) => sum + item.ratio, 0)).toBeCloseTo(1)
    expect(usage[0].count).toBe(2)
    expect(usage[0].color.ref).toBe('R')
  })

  it('returns nothing for an all-empty board', () => {
    const grid = mapToBeads([null, null], 2, 1, PALETTE, null, { dither: false })
    expect(countBeads(grid, PALETTE)).toEqual([])
  })
})

describe('buildBeadCsv', () => {
  const labels = { ref: '色号', name: '色名', rgb: 'RGB', count: '颗数', ratio: '占比' }

  it('writes a header row and one row per color', () => {
    const grid = mapToBeads([rgbToLab([255, 0, 0])], 1, 1, PALETTE, null, { dither: false })
    const csv = buildBeadCsv(countBeads(grid, PALETTE), labels)
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('色号,色名,RGB,颗数,占比')
    expect(row).toBe('R,Color R,#ff0000,1,100.0%')
  })

  it('quotes fields containing commas and doubles inner quotes', () => {
    const usage = [
      {
        index: 0,
        color: { ...PALETTE[0], name: 'Red, "bright"' },
        count: 2,
        ratio: 1,
      },
    ]
    expect(buildBeadCsv(usage, labels).split('\r\n')[1]).toBe(
      'W,"Red, ""bright""",#ffffff,2,100.0%',
    )
  })

  it('produces only a header for an empty list', () => {
    expect(buildBeadCsv([], labels)).toBe('色号,色名,RGB,颗数,占比')
  })
})

describe('rgbToHex', () => {
  it('pads single-digit channels', () => {
    expect(rgbToHex([1, 2, 3])).toBe('#010203')
    expect(rgbToHex([255, 255, 255])).toBe('#ffffff')
  })
})

describe('bead palettes', () => {
  it('exposes the seven brands declared in the registry', () => {
    expect(BEAD_BRANDS.map((entry) => entry.key)).toEqual([
      'hama',
      'perler',
      'artkal-a',
      'artkal-c',
      'artkal-s',
      'mard',
      'yant',
    ])
  })

  it('loads a brand palette whose size matches the registry', async () => {
    for (const entry of BEAD_BRANDS) {
      const colors = await loadBrandColors(entry.key)
      expect(colors).toHaveLength(entry.colorCount)
    }
  })

  it('keeps unique codes and in-range channels inside every palette', async () => {
    for (const entry of BEAD_BRANDS) {
      const colors = await loadBrandColors(entry.key)
      expect(new Set(colors.map((bead) => bead.ref)).size).toBe(colors.length)
      for (const bead of colors) {
        expect(
          bead.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255),
        ).toBe(true)
        expect(bead.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('rejects an unknown brand', async () => {
    await expect(loadBrandColors('nope')).rejects.toThrow(/Unknown bead brand/)
  })
})
