import { describe, expect, it } from 'vitest'

import {
  buildTree,
  CELLS,
  clamp01,
  coverRect,
  easeOut,
  HOLD,
  LAST_SPLIT,
  measureTree,
  mix,
  MORPH,
  OPENING_CELLS,
  orderByDetail,
  selfPaced,
  smoothstep,
  type Cell,
} from '@/components/grid-reveal/grid'

/** 手工拼一个叶子，绕开 buildTree 的劈分逻辑，只喂给取色函数 */
function leaf(x: number, y: number, w: number, h: number, parent: Cell | null = null): Cell {
  return {
    x,
    y,
    w,
    h,
    r: 0,
    g: 0,
    b: 0,
    tone: 0,
    detail: 0,
    splitAt: 0,
    parent,
    kids: null,
  }
}

function branch(kids: [Cell, Cell], parent: Cell | null = null): Cell {
  const cell = leaf(0, 0, 1, 1, parent)
  cell.x = Math.min(kids[0].x, kids[1].x)
  cell.y = Math.min(kids[0].y, kids[1].y)
  cell.w = Math.max(kids[0].x + kids[0].w, kids[1].x + kids[1].w) - cell.x
  cell.h = Math.max(kids[0].y + kids[0].h, kids[1].y + kids[1].h) - cell.y
  cell.kids = kids
  for (const kid of kids) {
    kid.parent = cell
  }
  return cell
}

function leavesOf(cell: Cell, into: Cell[] = []): Cell[] {
  if (cell.kids) {
    leavesOf(cell.kids[0], into)
    leavesOf(cell.kids[1], into)
  } else {
    into.push(cell)
  }
  return into
}

/** 树里除根之外必有子，测试里不想为这个必然性再写一遍判空 */
function kidsOf(cell: Cell): [Cell, Cell] {
  if (!cell.kids) {
    throw new Error('expected a branch cell')
  }
  return cell.kids
}

describe('clamp01', () => {
  it('folds the ends and drops NaN to zero', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.25)).toBe(0.25)
    expect(clamp01(4)).toBe(1)
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

describe('mix / easeOut / smoothstep', () => {
  it('interpolates linearly and can overshoot the ends', () => {
    expect(mix(10, 20, 0)).toBe(10)
    expect(mix(10, 20, 0.5)).toBe(15)
    expect(mix(0, 100, 2)).toBe(200)
  })

  it('eases out but only touches 1 at t=1', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })

  it('ramps between two edges and clamps outside them', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(2, 4, 3)).toBeCloseTo(0.5)
  })
})

describe('selfPaced', () => {
  it('starts at zero and never reaches the ceiling', () => {
    expect(selfPaced(0, 1000)).toBe(0)
    expect(selfPaced(10_000, 1000)).toBeLessThan(HOLD)
    expect(selfPaced(10_000, 1000)).toBeGreaterThan(selfPaced(5_000, 1000))
  })

  it('keeps creeping so an overrunning job is not stuck at a dead number', () => {
    expect(selfPaced(30_000, 6_000)).toBeGreaterThan(selfPaced(12_000, 6_000))
  })

  it('survives a zero or negative estimate', () => {
    expect(selfPaced(1_000, 0)).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(selfPaced(1_000, -5))).toBe(true)
  })
})

describe('buildTree', () => {
  it('splits until it holds exactly CELLS leaves', () => {
    const { root, branches } = buildTree(1)

    expect(leavesOf(root)).toHaveLength(CELLS)
    // 每次劈分只多出一个叶子，所以分叉数恒为叶子数减一
    expect(branches).toHaveLength(CELLS - 1)
  })

  it('tiles the unit square without gaps or overlap', () => {
    const { root } = buildTree(1)
    const leaves = leavesOf(root)

    const area = leaves.reduce((sum, cell) => sum + cell.w * cell.h, 0)
    // 面积和恰好铺满单位正方形：既不重叠也不留缝
    expect(area).toBeCloseTo(1, 10)

    for (const cell of leaves) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.x + cell.w).toBeLessThanOrEqual(1)
      expect(cell.y + cell.h).toBeLessThanOrEqual(1)
    }
  })

  it('splits the long axis first so a wide frame stays near-square cells', () => {
    const wide = kidsOf(buildTree(2).root)
    const tall = kidsOf(buildTree(0.5).root)

    // 宽画幅竖着劈（x 不同），窄画幅横着劈（y 不同）
    expect(wide[0].x).not.toBe(wide[1].x)
    expect(tall[0].y).not.toBe(tall[1].y)
  })

  it('is deterministic: same aspect gives the same tree', () => {
    const a = buildTree(1.5)
    const b = buildTree(1.5)

    expect(leavesOf(a.root).map((cell) => [cell.x, cell.y, cell.w, cell.h, cell.tone])).toEqual(
      leavesOf(b.root).map((cell) => [cell.x, cell.y, cell.w, cell.h, cell.tone]),
    )
  })

  it('opens the first frames before zero so they are already apart on mount', () => {
    const { branches } = buildTree(1)
    const rest = branches.length - (OPENING_CELLS - 1)

    for (const cell of branches.slice(0, OPENING_CELLS - 1)) {
      expect(cell.splitAt).toBe(-MORPH)
    }
    expect(branches[OPENING_CELLS - 1].splitAt).toBeCloseTo(LAST_SPLIT / rest)
    expect(branches[branches.length - 1].splitAt).toBeCloseTo(LAST_SPLIT)
  })

  it('never splits a child before its parent', () => {
    const { branches } = buildTree(1)

    // 只有分叉格有时刻可言：叶子从不分裂，splitAt 停在初值 0
    for (const cell of branches) {
      if (cell.parent?.kids) {
        expect(cell.splitAt).toBeGreaterThanOrEqual(cell.parent.splitAt)
      }
    }
  })
})

describe('measureTree', () => {
  it('averages colour per cell and propagates it upward', () => {
    const left = leaf(0, 0, 0.5, 1)
    const right = leaf(0.5, 0, 0.5, 1)
    const root = branch([left, right])

    // 2×2 像素：左半纯红，右半纯蓝
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255,
    ])
    measureTree(root, pixels, 2)

    expect([left.r, left.g, left.b]).toEqual([255, 0, 0])
    expect([right.r, right.g, right.b]).toEqual([0, 0, 255])
    expect(root.r).toBeCloseTo(127.5)
    expect(root.g).toBe(0)
    expect(root.b).toBeCloseTo(127.5)
  })

  it('scores a flat cell as zero detail and a busy one above it', () => {
    const flat = leaf(0, 0, 0.5, 1)
    const busy = leaf(0.5, 0, 0.5, 1)
    const root = branch([flat, busy])

    // 2×2 像素（每格两像素）：左格两格同色，右格一白一黑
    const pixels = new Uint8ClampedArray([
      10, 10, 10, 255, 255, 255, 255, 255, 10, 10, 10, 255, 0, 0, 0, 255,
    ])
    measureTree(root, pixels, 2)

    expect(flat.detail).toBe(0)
    expect(busy.detail).toBeCloseTo(255 ** 2 / 4)
    expect(root.detail).toBeGreaterThan(flat.detail)
  })

  it('measures a sample that is only one pixel across', () => {
    const only = leaf(0, 0, 1, 1)
    measureTree(only, new Uint8ClampedArray([7, 7, 7, 255]), 1)

    expect([only.r, only.g, only.b]).toEqual([7, 7, 7])
    expect(only.detail).toBe(0)
  })
})

describe('orderByDetail', () => {
  it('needs at least two pending splits to do anything', () => {
    const a = leaf(0, 0, 0.5, 1)
    a.splitAt = 0.4
    a.detail = 9

    orderByDetail([a], 0)

    expect(a.splitAt).toBe(0.4)
  })

  it('reuses the same time slots so the pacing does not shift', () => {
    const { branches } = buildTree(1)
    const before = branches
      .filter((cell) => cell.splitAt > 0)
      .map((cell) => cell.splitAt)
      .sort((x, y) => x - y)

    for (const [i, cell] of branches.entries()) {
      cell.detail = (i * 37) % 100
    }
    orderByDetail(branches, 0)

    const after = branches
      .filter((cell) => cell.splitAt > 0)
      .map((cell) => cell.splitAt)
      .sort((x, y) => x - y)
    expect(after).toHaveLength(before.length)
    for (const [i, value] of after.entries()) {
      expect(value).toBeCloseTo(before[i], 10)
    }
  })

  it('splits the busiest eligible cell first', () => {
    const left = leaf(0, 0, 0.5, 1)
    const right = leaf(0.5, 0, 0.5, 1)
    const root = branch([left, right])
    root.splitAt = -MORPH
    left.splitAt = 0.2
    right.splitAt = 0.8
    left.detail = 1
    right.detail = 100

    orderByDetail([root, left, right], 0)

    // 时刻槽 {0.2, 0.8} 不变，但 detail 高的右格拿走早槽
    expect(right.splitAt).toBe(0.2)
    expect(left.splitAt).toBe(0.8)
  })

  it('keeps a child behind its parent after reordering', () => {
    const { branches } = buildTree(1)
    for (const [i, cell] of branches.entries()) {
      cell.detail = (i * 53) % 100
    }

    orderByDetail(branches, 0)

    for (const cell of branches) {
      if (cell.parent && cell.parent.splitAt > 0 && cell.splitAt > 0) {
        expect(cell.splitAt).toBeGreaterThanOrEqual(cell.parent.splitAt)
      }
    }
  })

  it('leaves slots that already played untouched', () => {
    const a = leaf(0, 0, 0.5, 1)
    const b = leaf(0.5, 0, 0.5, 1)
    a.splitAt = 0.1
    b.splitAt = 0.9
    a.detail = 1
    b.detail = 100

    orderByDetail([a, b], 0.5)

    expect(a.splitAt).toBe(0.1)
    expect(b.splitAt).toBe(0.9)
  })
})

describe('coverRect', () => {
  it('fills the frame and crops the long axis', () => {
    const fit = coverRect(100, 100, 200, 100)

    expect(fit.dw).toBeCloseTo(200)
    expect(fit.dh).toBeCloseTo(200)
    expect(fit.dx).toBeCloseTo(0)
    expect(fit.dy).toBeCloseTo(-50)
  })

  it('is a no-op when the aspects already match', () => {
    expect(coverRect(3, 4, 30, 40)).toEqual({ dx: 0, dy: 0, dw: 30, dh: 40 })
  })
})
