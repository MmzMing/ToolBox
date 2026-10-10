/**
 * GridReveal 的纯逻辑：一棵不断分裂的格子树，加上每格的平均色与分裂时刻。
 * 这里不碰 DOM 也不碰 canvas（绘制见 paint.ts），所以整棵树的形状、节奏与取色
 * 都能脱离浏览器单测。
 */

/** 叶子格总数：越多越细，但每帧都要遍历整棵树 */
export const CELLS = 180
/** 首帧就已经分开的格数，让开场看到的不是一整块 */
export const OPENING_CELLS = 4
/** 进度最多追到这里就收：请求跑赢了估算也不能提前"演完" */
export const HOLD = 0.9
/** 干等时只分裂到这里，给图片真正落地留出可到达的余量 */
export const WAIT_CAP = 0.72
/** 最后一次分裂的时刻 */
export const LAST_SPLIT = 0.92
/** 一次分裂从父格矩形过渡到子格矩形所需的进度跨度 */
export const MORPH = 0.055
/** 取色时把图片压成的正方形边长 */
export const SAMPLE = 128
/** 图片落地后颜色淡入的时长（毫秒） */
export const COLOR_MS = 420
/** 缝宽开始收拢的时刻 */
export const GUTTER_FROM = 0.35
/** 缝宽收拢完毕的时刻 */
export const GUTTER_TO = 0.75
/** 真图开始压过格子的时刻 */
export const PHOTO_FROM = 0.93

export type Cell = {
  x: number
  y: number
  w: number
  h: number
  r: number
  g: number
  b: number
  /** 0-1 的稳定随机值，决定灰块的明暗与呼吸相位 */
  tone: number
  /** 格内亮度方差，高的先分裂 */
  detail: number
  splitAt: number
  parent: Cell | null
  kids: [Cell, Cell] | null
}

/** 写成一串比较而不是 Math.min/max，让 NaN 直接落到 0 */
export const clamp01 = (n: number) => (n > 0 ? (n < 1 ? n : 1) : 0)

export const mix = (a: number, b: number, t: number) => a + (b - a) * t

export const easeOut = (t: number) => 1 - (1 - t) ** 3

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * 自估进度：指数趋近但永远到不了上限，所以任务一旦超过估算时长还会继续往前爬，
 * 而不是停在某处假装卡死。
 */
export function selfPaced(elapsed: number, duration: number) {
  const span = duration > 0 ? duration : 1
  return HOLD * (1 - Math.exp(-elapsed / span))
}

/** 稳定哈希：同一个坐标永远得到同一个数，用来给格子派 tone 与分裂抖动 */
export function hash(x: number, y: number, z: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return n - Math.floor(n)
}

function makeCell(x: number, y: number, w: number, h: number, parent: Cell | null): Cell {
  return {
    x,
    y,
    w,
    h,
    r: 0,
    g: 0,
    b: 0,
    tone: hash(x + 3.1, y + 1.7, w * 31.7),
    detail: 0,
    splitAt: 0,
    parent,
    kids: null,
  }
}

/**
 * 每次只劈开最大的那格：格子因此接近正方形，且格子数一次只加一个。
 * `aspect` 只参与面积比较，用来把劈的方向扳向长边。
 */
export function buildTree(aspect: number): { root: Cell; branches: Cell[] } {
  const root = makeCell(0, 0, 1, 1, null)
  const leaves: Cell[] = [root]
  const branches: Cell[] = []

  while (leaves.length < CELLS) {
    let pick = 0
    let widest = -1
    for (const [i, c] of leaves.entries()) {
      // 抖动只用来在同面积格子之间定胜负，不改变大小关系
      const area = c.w * aspect * c.h * (1 + 0.12 * hash(c.x, c.y, 7.3))
      if (area > widest) {
        widest = area
        pick = i
      }
    }

    const parent = leaves.splice(pick, 1)[0]
    const wide = parent.w * aspect >= parent.h
    const half = wide ? parent.w / 2 : parent.h / 2
    const a = wide
      ? makeCell(parent.x, parent.y, half, parent.h, parent)
      : makeCell(parent.x, parent.y, parent.w, half, parent)
    const b = wide
      ? makeCell(parent.x + half, parent.y, half, parent.h, parent)
      : makeCell(parent.x, parent.y + half, parent.w, half, parent)

    parent.kids = [a, b]
    branches.push(parent)
    leaves.push(a, b)
  }

  const opening = OPENING_CELLS - 1
  const rest = Math.max(1, branches.length - opening)
  // 开场那几次的时刻放在 0 之前，第一帧它们就已经是分开的格子
  branches.forEach((cell, i) => {
    cell.splitAt = i < opening ? -MORPH : (LAST_SPLIT * (i - opening + 1)) / rest
  })

  return { root, branches }
}

type Sums = {
  n: number
  r: number
  g: number
  b: number
  l: number
  l2: number
}

/**
 * 自底向上汇总：每个格子拿到自己的平均色与亮度方差（detail）。
 * `pixels` 是 `SAMPLE × SAMPLE` 的 RGBA 数据。
 */
export function measureTree(root: Cell, pixels: Uint8ClampedArray, size: number): void {
  const gather = (cell: Cell): Sums => {
    let s: Sums

    if (cell.kids) {
      const a = gather(cell.kids[0])
      const b = gather(cell.kids[1])
      s = {
        n: a.n + b.n,
        r: a.r + b.r,
        g: a.g + b.g,
        b: a.b + b.b,
        l: a.l + b.l,
        l2: a.l2 + b.l2,
      }
    } else {
      s = { n: 0, r: 0, g: 0, b: 0, l: 0, l2: 0 }
      const x0 = Math.round(cell.x * size)
      const y0 = Math.round(cell.y * size)
      const x1 = Math.max(x0 + 1, Math.round((cell.x + cell.w) * size))
      const y1 = Math.max(y0 + 1, Math.round((cell.y + cell.h) * size))

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * size + x) * 4
          const r = pixels[i]
          const g = pixels[i + 1]
          const b = pixels[i + 2]
          const l = 0.299 * r + 0.587 * g + 0.114 * b
          s.n++
          s.r += r
          s.g += g
          s.b += b
          s.l += l
          s.l2 += l * l
        }
      }
    }

    const n = s.n || 1
    cell.r = s.r / n
    cell.g = s.g / n
    cell.b = s.b / n
    cell.detail = Math.max(0, s.l2 / n - (s.l / n) * (s.l / n))
    return s
  }

  gather(root)
}

/**
 * 按 detail 重排分裂顺序：信息量大的区域先开。
 * 只复用原有的时刻槽位，所以格子数与整体节奏完全不变。
 * `openedBefore` 之前的时刻已经演过，不参与重排。
 */
export function orderByDetail(branches: Cell[], openedBefore: number): void {
  const pending = branches.filter((c) => c.splitAt > openedBefore)
  if (pending.length < 2) {
    return
  }

  const slots = pending.map((c) => c.splitAt).sort((a, b) => a - b)
  const queue = pending.filter((c) => !c.parent || c.parent.splitAt <= openedBefore)

  let next = 0
  while (queue.length && next < slots.length) {
    let pick = 0
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].detail > queue[pick].detail) {
        pick = i
      }
    }
    const cell = queue.splice(pick, 1)[0]
    cell.splitAt = slots[next++]
    for (const kid of cell.kids ?? []) {
      if (kid.kids) {
        queue.push(kid)
      }
    }
  }
}

/** 等比铺满（cover）的落位矩形 */
export function coverRect(iw: number, ih: number, w: number, h: number) {
  const s = Math.max(w / iw, h / ih)
  return { dx: (w - iw * s) / 2, dy: (h - ih * s) / 2, dw: iw * s, dh: ih * s }
}
