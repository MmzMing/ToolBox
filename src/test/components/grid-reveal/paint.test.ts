import { describe, expect, it } from 'vitest'

import {
  buildTree,
  coverRect,
  MORPH,
  PHOTO_FROM,
  smoothstep,
  type Cell,
} from '@/components/grid-reveal/grid'
import { drawScene, type Scene } from '@/components/grid-reveal/paint'

type Fill = { x: number; y: number; w: number; h: number; style: string }

/**
 * 只记录几何与颜色的假 ctx：node 环境没有 canvas 后端，而这里要验的正是
 * "画了哪些矩形、什么颜色、什么时候才把真图叠上去"。
 * 故意不实现 roundRect，让绝大多数用例走 fillRect 分支，矩形可直接断言。
 */
function fakeCtx() {
  const fills: Fill[] = []
  const draws: number[][] = []
  const rounds: number[][] = []
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ x, y, w, h, style: String(ctx.fillStyle) })
    },
    drawImage(_image: unknown, ...args: number[]) {
      draws.push([Number(ctx.globalAlpha), ...args])
    },
  }

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fills,
    draws,
    rounds,
    /** 挂上圆角路径，用来验证圆角分支只在缝还开着的时候走 */
    withRounded() {
      ctx.beginPath = () => {
        rounds.push([])
      }
      ctx.roundRect = (...args: number[]) => {
        rounds[rounds.length - 1].push(...args)
      }
      ctx.fill = () => {
        fills.push({ x: NaN, y: NaN, w: NaN, h: NaN, style: String(ctx.fillStyle) })
      }
      return rounds
    },
  }
}

function sceneOf(overrides: Partial<Scene> = {}) {
  const fake = fakeCtx()
  const { root } = buildTree(1)
  const scene: Scene = {
    ctx: fake.ctx,
    root,
    width: 640,
    height: 640,
    scale: 1,
    dark: false,
    clock: 0,
    split: 0,
    fade: 0,
    hasColors: false,
    image: null,
    ...overrides,
  }
  return { scene, ...fake }
}

/** 左右两格的树：断言缝宽与外轮廓时不想再绕 180 个格子 */
function twoCells(left: Cell, right: Cell) {
  const root: Cell = {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    g: 0,
    b: 0,
    tone: 0,
    detail: 0,
    splitAt: -MORPH,
    parent: null,
    kids: [left, right],
  }
  left.parent = root
  right.parent = root
  return root
}

function leaf(x: number, y: number, w: number, h: number): Cell {
  return { x, y, w, h, r: 0, g: 0, b: 0, tone: 0, detail: 0, splitAt: 0, parent: null, kids: null }
}

const channels = (style: string) => (style.match(/\d+/g) ?? []).map(Number)

const image = { naturalWidth: 300, naturalHeight: 200 } as HTMLImageElement

describe('drawScene', () => {
  it('lays a full-frame backdrop before any cell', () => {
    const { scene, fills } = sceneOf({ split: 0.5 })
    drawScene(scene)

    expect(fills[0]).toMatchObject({ x: 0, y: 0, w: 640, h: 640 })
    expect(fills.length).toBeGreaterThan(1)
  })

  it('stays grey until the pixels can be read', () => {
    const root = twoCells(leaf(0, 0, 0.5, 1), leaf(0.5, 0, 0.5, 1))
    root.r = 200
    root.g = 40
    root.b = 90

    const grey = sceneOf({ split: 1, fade: 1, hasColors: false, root })
    drawScene(grey.scene)
    expect(channels(grey.fills[0].style)).toEqual([210, 210, 210])

    const tinted = sceneOf({ split: 1, fade: 1, hasColors: true, root })
    drawScene(tinted.scene)
    expect(channels(tinted.fills[0].style)).toEqual([184, 37, 83])
  })

  it('follows the theme for the placeholder grey', () => {
    const root = twoCells(leaf(0, 0, 0.5, 1), leaf(0.5, 0, 0.5, 1))
    // tone 为 0、clock 为 0 时灰阶只剩底色本身，再被背景压暗一档
    const light = sceneOf({ split: 1, root, dark: false })
    const dark = sceneOf({ split: 1, root, dark: true })
    drawScene(light.scene)
    drawScene(dark.scene)

    expect(channels(light.fills[0].style)).toEqual([210, 210, 210])
    expect(channels(dark.fills[0].style)).toEqual([28, 28, 28])
  })

  it('gives interior edges a gutter but keeps the outer silhouette flush', () => {
    const gutter = 10 // scale=10、split=0.5 时 soft 约 0.684，缝宽即 scale×soft
    const { scene, fills } = sceneOf({
      split: 0.5,
      scale: gutter,
      root: twoCells(leaf(0, 0, 0.5, 1), leaf(0.5, 0, 0.5, 1)),
    })
    drawScene(scene)

    const soft = 1 - smoothstep(0.35, 0.75, 0.5)
    const left = fills[1]
    const right = fills[2]
    // 左边贴外框：不留缝，只让出内侧那条
    expect(left.x).toBe(0)
    expect(left.w).toBeCloseTo(320 - gutter * soft, 3)
    // 右边是内部边：向右凹进一格
    expect(right.x).toBeCloseTo(320 + gutter * soft, 3)
    expect(right.w).toBeCloseTo(320 - gutter * soft, 3)
    // 上下都贴外框，所以高度不被缝吃掉
    expect(left.y).toBe(0)
    expect(left.h).toBe(640)
  })

  it('snaps settled cells to whole pixels that tile the frame exactly', () => {
    const { scene, fills } = sceneOf({ split: 1 })
    drawScene(scene)

    const cells = fills.slice(1)
    for (const fill of cells) {
      expect(Number.isInteger(fill.x)).toBe(true)
      expect(Number.isInteger(fill.y)).toBe(true)
      expect(Number.isInteger(fill.w)).toBe(true)
      expect(Number.isInteger(fill.h)).toBe(true)
    }
    // 缝收完之后不留缝隙也不重叠：面积和正好等于整幅
    expect(cells.reduce((sum, fill) => sum + fill.w * fill.h, 0)).toBeCloseTo(640 * 640)
  })

  it('skips a cell the gutter would invert instead of drawing it negative', () => {
    const { scene, fills } = sceneOf({ split: 0.4, width: 2, height: 2, scale: 2 })
    drawScene(scene)

    for (const fill of fills) {
      expect(fill.w).toBeGreaterThan(0)
      expect(fill.h).toBeGreaterThan(0)
    }
    // 一像素的格子被两像素的缝整个吃掉，只剩背景
    expect(fills).toHaveLength(1)
  })

  it('rounds cell corners only while the gutters are still open', () => {
    const open = sceneOf({ split: 0.2 })
    open.withRounded()
    drawScene(open.scene)
    expect(open.rounds.length).toBeGreaterThan(1)

    const closed = sceneOf({ split: 0.9 })
    closed.withRounded()
    drawScene(closed.scene)
    expect(closed.rounds).toHaveLength(0)
  })

  it('holds the photo back until the grid has fully arrived', () => {
    const { scene, draws } = sceneOf({
      split: PHOTO_FROM - 0.1,
      fade: 1,
      hasColors: true,
      image,
    })
    drawScene(scene)

    expect(draws).toHaveLength(0)
  })

  it('fades the photo in over the last stretch and restores globalAlpha', () => {
    const mid = PHOTO_FROM + (1 - PHOTO_FROM) / 2
    const { scene, draws } = sceneOf({ split: mid, fade: 0.5, hasColors: true, image })
    drawScene(scene)

    expect(draws).toHaveLength(1)
    expect(draws[0][0]).toBeCloseTo(0.5 * smoothstep(PHOTO_FROM, 1, mid), 5)
    expect(draws[0][0]).toBeCloseTo(0.25, 5)
    expect(scene.ctx.globalAlpha).toBe(1)
  })

  it('cover-fits the photo into the frame', () => {
    const { scene, draws } = sceneOf({ split: 1, fade: 1, hasColors: true, image })
    drawScene(scene)

    // 300×200 铺满 640 方框：按短边取比例，横向溢出居中裁掉
    expect(draws[0].slice(1)).toEqual(Object.values(coverRect(300, 200, 640, 640)))
  })

  it('draws the photo at full alpha without pixel access', () => {
    const { scene, draws } = sceneOf({ split: 0.5, fade: 1, hasColors: false, image })
    drawScene(scene)

    // 读不到像素时格子保持灰色，但真图照样在下面淡入
    expect(draws[0][0]).toBe(1)
  })
})
