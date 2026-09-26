import { describe, expect, it } from 'vitest'

import { resolveCells } from '@/tools/images/image-stack/image-stack.service'
import {
  layoutById,
  layoutsForCount,
  MAX_LAYOUT_COUNT,
  MAX_LAYOUTS_PER_COUNT,
  MIN_LAYOUT_COUNT,
} from '@/tools/images/image-stack/layouts'

const COUNTS = Array.from(
  { length: MAX_LAYOUT_COUNT - MIN_LAYOUT_COUNT + 1 },
  (_, index) => MIN_LAYOUT_COUNT + index,
)

const snap = (value: number) => Math.round(value * 1e6) / 1e6

function unitRects(count: number) {
  return layoutsForCount(count).map((layout) =>
    resolveCells(layout, { x: 0, y: 0, width: 1, height: 1 }, { padding: 0, gap: 0 }),
  )
}

function signature(rects: { x: number; y: number; width: number; height: number }[]): string {
  return rects
    .map((r) => `${snap(r.x)} ${snap(r.y)} ${snap(r.width)} ${snap(r.height)}`)
    .sort()
    .join('|')
}

describe('layoutsForCount', () => {
  it('gives every layout exactly as many cells as the count', () => {
    for (const count of COUNTS) {
      const layouts = layoutsForCount(count)
      expect(layouts.length).toBeGreaterThan(0)
      expect(layouts.length).toBeLessThanOrEqual(MAX_LAYOUTS_PER_COUNT)
      for (const layout of layouts) {
        expect(layout.cells).toHaveLength(count)
      }
    }
  })

  it('numbers ids contiguously so the selection is stable per count', () => {
    for (const count of COUNTS) {
      layoutsForCount(count).forEach((layout, index) => {
        expect(layout.id).toBe(`gen-${index}`)
      })
    }
  })

  it('normalizes every axis to a total weight of one', () => {
    for (const count of COUNTS) {
      for (const layout of layoutsForCount(count)) {
        expect(layout.cols.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
        expect(layout.rows.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
      }
    }
  })

  it('tiles the canvas exactly with no gaps and no overlap', () => {
    for (const count of COUNTS) {
      for (const rects of unitRects(count)) {
        const area = rects.reduce((sum, r) => sum + r.width * r.height, 0)
        expect(area).toBeCloseTo(1, 4)
        for (let a = 0; a < rects.length; a += 1) {
          for (let b = a + 1; b < rects.length; b += 1) {
            const first = rects[a]
            const second = rects[b]
            const overlap =
              Math.max(
                0,
                Math.min(first.x + first.width, second.x + second.width) -
                  Math.max(first.x, second.x),
              ) *
              Math.max(
                0,
                Math.min(first.y + first.height, second.y + second.height) -
                  Math.max(first.y, second.y),
              )
            expect(overlap).toBeLessThan(1e-9)
          }
        }
      }
    }
  })

  it('never emits the same shape twice', () => {
    for (const count of COUNTS) {
      const keys = unitRects(count).map(signature)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('keeps every cell inside its tracks', () => {
    for (const count of COUNTS) {
      for (const layout of layoutsForCount(count)) {
        for (const cell of layout.cells) {
          expect(cell.col + (cell.colSpan ?? 1)).toBeLessThanOrEqual(layout.cols.length)
          expect(cell.row + (cell.rowSpan ?? 1)).toBeLessThanOrEqual(layout.rows.length)
        }
      }
    }
  })

  it('offers far more than the eight classic families once the count grows', () => {
    // 参考目录每档 12~24 个，等分网格加主图族只有 8 个，缺口靠切矩形枚举补
    expect(layoutsForCount(6).length).toBeGreaterThan(12)
    expect(layoutsForCount(9).length).toBeGreaterThan(15)
  })

  it('always leads with the even bands and the square-ish grid', () => {
    const [stack, row] = layoutsForCount(4)
    expect(stack?.cols).toHaveLength(1)
    expect(stack?.rows).toHaveLength(4)
    expect(row?.cols).toHaveLength(4)
    expect(row?.rows).toHaveLength(1)
  })

  it('includes a full-width top image over an evenly divided row', () => {
    // 边界量化到 6 位小数会让等宽格子差出 1e-6（0.333333 / 0.333334），判定放到 4 位
    const q = (value: number) => Math.round(value * 1e4) / 1e4
    for (const count of [2, 3, 4, 5, 6]) {
      const rects = unitRects(count)
      const heroTop = rects.find((list) => {
        const [hero, ...rest] = [...list].sort((a, b) => a.y - b.y)
        if (!hero || q(hero.y) !== 0 || q(hero.width) !== 1 || q(hero.height) <= 0.5) {
          return false
        }
        if (rest.length !== count - 1) {
          return false
        }
        // 下方必须是同一行里的等宽切分
        const widths = new Set(rest.map((rect) => q(rect.width)))
        return widths.size === 1 && rest.every((rect) => q(rect.y) === q(hero.height))
      })
      expect(heroTop, `count ${count}`).toBeDefined()
    }
  })

  it('includes a bento layout: corner hero ringed by a column and a row', () => {
    // 海报排布的主力形状。递归切分采样不保证它一定在目录里，所以由经典族钉住
    for (const count of [6, 7, 8, 12, 16]) {
      const found = unitRects(count).some((rects) => {
        const hero = rects.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b))
        if (hero.width * hero.height < 0.4) {
          return false
        }
        const right = rects.some(
          (rect) => rect.x >= hero.x + hero.width - 1e-9 && rect.y < hero.y + hero.height - 1e-9,
        )
        const below = rects.some(
          (rect) => rect.y >= hero.y + hero.height - 1e-9 && rect.x < hero.x + hero.width - 1e-9,
        )
        return right && below
      })
      expect(found, `count ${count}`).toBe(true)
    }
  })

  it('includes strongly unequal layouts, not just even grids', () => {
    // 回归护栏：目录曾经只有两层切分且每段内部均分，结果全是等比拼接
    for (const count of [3, 4, 5, 6, 8, 12, 16]) {
      const ratios = unitRects(count).map((rects) => {
        const areas = rects.map((rect) => rect.width * rect.height)
        return Math.max(...areas) / Math.min(...areas)
      })
      expect(Math.max(...ratios), `count ${count}`).toBeGreaterThan(6)
      // 反差档位轮转，所以均匀的那几档也不会消失
      expect(Math.min(...ratios), `count ${count}`).toBeLessThan(1.6)
    }
  })

  it('collapses a single image to one full-bleed cell', () => {
    const layouts = layoutsForCount(1)
    expect(layouts).toHaveLength(1)
    expect(layouts[0]?.cells).toHaveLength(1)
  })

  it('returns nothing outside the supported range', () => {
    expect(layoutsForCount(MAX_LAYOUT_COUNT + 1)).toEqual([])
    expect(layoutsForCount(Number.NaN)).toEqual([])
    expect(layoutsForCount(-3)).toEqual([])
  })
})

describe('layoutById', () => {
  it('resolves a position in the count catalog', () => {
    expect(layoutById(4, 'gen-0')?.cells).toHaveLength(4)
  })

  it('falls back to the first layout for an id from another count', () => {
    expect(layoutById(5, 'gen-99')?.id).toBe('gen-0')
  })

  it('returns null outside the supported range', () => {
    expect(layoutById(20, 'gen-0')).toBeNull()
  })
})
