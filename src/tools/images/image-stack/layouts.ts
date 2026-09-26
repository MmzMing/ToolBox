import type { GridCell, GridTemplate } from './image-stack.service'

/** 生成器覆盖的张数范围；超过 16 张交给自定义档 */
export const MIN_LAYOUT_COUNT = 1
export const MAX_LAYOUT_COUNT = 16
/** 每档最多给这么多版式，再多就挑不动了 */
export const MAX_LAYOUTS_PER_COUNT = 24

/** 主图那一格占整轴的比例 */
const HERO = 0.62
/** 允许的切分比；0.5 均匀，越大主次越分明 */
const SPLIT_RATIOS = [0.5, HERO, 0.74, 0.84]
/** 递归切分预算：叶子均分网格之外还能再嵌套几层不对称切分 */
const MAX_BUDGET = 2
/** 每一层收敛到这么多铺法，否则组合数会炸；也够填满每档的版式上限 */
const SHAPE_CAP = 28
/**
 * 组合子节点时两侧各只取头部这么多个铺法。子列表已经按反差档位轮转排过序，
 * 取头部既保住了档位多样性，又把每层的候选量从 cap² 压到 branch²，
 * 否则 16 张那档要枚举上万种铺法，首次渲染会卡住。
 */
const BRANCH_LIMIT = 7

type Rect01 = { x: number; y: number; width: number; height: number }

const UNIT: Rect01 = { x: 0, y: 0, width: 1, height: 1 }

/** 浮点边界统一量化，否则相邻矩形的公共边会因为误差被当成两条网格线 */
function snap(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function factorPairs(m: number): [number, number][] {
  const out: [number, number][] = []
  for (let cols = 1; cols <= m; cols += 1) {
    if (m % cols === 0) {
      out.push([cols, m / cols])
    }
  }
  return out
}

/** 把 rect 均分成 cols × rows 个格子 */
function band(rect: Rect01, cols: number, rows: number): Rect01[] {
  const out: Rect01[] = []
  for (let index = 0; index < cols * rows; index += 1) {
    const col = index % cols
    const row = Math.floor(index / cols)
    out.push({
      x: rect.x + (rect.width * col) / cols,
      y: rect.y + (rect.height * row) / rows,
      width: rect.width / cols,
      height: rect.height / rows,
    })
  }
  return out
}

/** stacked=true 沿纵轴下刀，得到上下两块 */
function split(rect: Rect01, stacked: boolean, ratio: number): [Rect01, Rect01] {
  if (stacked) {
    const height = rect.height * ratio
    return [
      { ...rect, height },
      { ...rect, y: rect.y + height, height: rect.height - height },
    ]
  }
  const width = rect.width * ratio
  return [
    { ...rect, width },
    { ...rect, x: rect.x + width, width: rect.width - width },
  ]
}

function boundaries(rects: readonly Rect01[], axis: 'x' | 'y'): number[] {
  const set = new Set<number>([0, 1])
  for (const rect of rects) {
    const size = axis === 'x' ? rect.width : rect.height
    set.add(snap(axis === 'x' ? rect.x : rect.y))
    set.add(snap((axis === 'x' ? rect.x : rect.y) + size))
  }
  return [...set].sort((a, b) => a - b)
}

function trackWeights(edges: readonly number[]): number[] {
  return edges.slice(1).map((edge, index) => edge - edges[index])
}

/**
 * 归一化矩形集合 → GridTemplate。所有矩形的边收集成网格线，
 * 每个矩形落成一格并跨它覆盖的轨道数，所以任意 guillotine 版式都能表达。
 */
function rectsToTemplate(id: string, rects: readonly Rect01[]): GridTemplate {
  const xs = boundaries(rects, 'x')
  const ys = boundaries(rects, 'y')
  const cells: GridCell[] = rects.map((rect) => {
    const col = xs.indexOf(snap(rect.x))
    const row = ys.indexOf(snap(rect.y))
    return {
      col,
      row,
      colSpan: xs.indexOf(snap(rect.x + rect.width)) - col,
      rowSpan: ys.indexOf(snap(rect.y + rect.height)) - row,
    }
  })
  return { id, cols: trackWeights(xs), rows: trackWeights(ys), cells }
}

function signature(rects: readonly Rect01[]): string {
  return rects
    .map((rect) => `${snap(rect.x)} ${snap(rect.y)} ${snap(rect.width)} ${snap(rect.height)}`)
    .sort()
    .join('|')
}

/**
 * 版式打分，越低越靠前：网格线少 = 结构简单好读；短边过窄单独罚，因为那张图基本看不清。
 * 刻意不罚「格子大小不一」——那正是错落排布要的效果，靠下面的反差分档来保证它有份。
 */
function score(rects: readonly Rect01[]): number {
  const lines =
    new Set(rects.map((r) => snap(r.x))).size + new Set(rects.map((r) => snap(r.y))).size
  let thin = 0
  for (const rect of rects) {
    thin += Math.max(0, 0.07 - Math.min(rect.width, rect.height)) * 60
  }
  return lines + thin
}

/** 大小反差档位：0 均匀、3 极端主次分明 */
function contrastTier(rects: readonly Rect01[]): number {
  let max = 0
  let min = Number.POSITIVE_INFINITY
  for (const rect of rects) {
    const area = rect.width * rect.height
    max = Math.max(max, area)
    min = Math.min(min, area)
  }
  const ratio = min > 0 ? max / min : 1
  return ratio < 1.6 ? 0 : ratio < 3 ? 1 : ratio < 8 ? 2 : 3
}

/**
 * 按反差档位轮转取样。纯按分数排序会让均匀网格霸榜（它网格线最少），
 * 目录就又退回「等比拼接」；轮转保证四个档位都有份。
 */
function diversify(candidates: Rect01[][], limit: number): Rect01[][] {
  const seen = new Set<string>()
  const tiers: Rect01[][][] = [[], [], [], []]
  for (const rects of candidates) {
    const key = signature(rects)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    tiers[contrastTier(rects)].push(rects)
  }
  for (const tier of tiers) {
    tier.sort((a, b) => score(a) - score(b))
  }
  const out: Rect01[][] = []
  for (let round = 0; out.length < limit; round += 1) {
    let added = false
    for (const tier of tiers) {
      const next = tier[round]
      if (next) {
        out.push(next)
        added = true
        if (out.length >= limit) {
          break
        }
      }
    }
    if (!added) {
      break
    }
  }
  return out
}

/** 把单位方形里的铺法映射进任意矩形 */
function place(tiling: readonly Rect01[], rect: Rect01): Rect01[] {
  return tiling.map((cell) => ({
    x: rect.x + cell.x * rect.width,
    y: rect.y + cell.y * rect.height,
    width: cell.width * rect.width,
    height: cell.height * rect.height,
  }))
}

/** 全部因式分解出的均分网格，含 1×n 与 n×1 两条带 */
function uniformGrids(m: number): Rect01[][] {
  return factorPairs(m).map(([cols, rows]) => band(UNIT, cols, rows))
}

function heroTop(m: number): Rect01[] {
  const [hero, rest] = split(UNIT, true, HERO)
  return [hero, ...band(rest, m, 1)]
}

function heroBottom(m: number): Rect01[] {
  const [rest, hero] = split(UNIT, true, 1 - HERO)
  return [...band(rest, m, 1), hero]
}

function heroLeft(m: number): Rect01[] {
  const [hero, rest] = split(UNIT, false, HERO)
  return [hero, ...band(rest, 1, m)]
}

function heroRight(m: number): Rect01[] {
  const [rest, hero] = split(UNIT, false, 1 - HERO)
  return [...band(rest, 1, m), hero]
}

/** g × g 等分网格里主图占 2 × 2，总格数 = g² − 3 */
function mosaic(g: number): Rect01[] {
  const cells: Rect01[] = []
  const step = 1 / g
  cells.push({ x: 0, y: 0, width: step * 2, height: step * 2 })
  for (let row = 0; row < g; row += 1) {
    for (let col = 0; col < g; col += 1) {
      if (col < 2 && row < 2) {
        continue
      }
      cells.push({ x: col * step, y: row * step, width: step, height: step })
    }
  }
  return cells
}

/** 均匀抽样：从 items 里挑 limit 个，按下标等距取，避免扎堆在一侧 */
function spread<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) {
    return [...items]
  }
  const out: T[] = []
  for (let index = 0; index < limit; index += 1) {
    out.push(items[Math.round((index * (items.length - 1)) / (limit - 1))])
  }
  return out
}

/** 左右镜像，主图换到右上 */
function mirrorX(rects: readonly Rect01[]): Rect01[] {
  return rects.map((rect) => ({ ...rect, x: 1 - rect.x - rect.width }))
}

/**
 * 错落 bento：主图吃掉左上 (cols-1) × (rows-1) 的块，剩下的沿右列与底行排布。
 * 总格数 = cols + rows，所以同一张数能横向拉长也能纵向拉长。
 * 主图占 (cols-1)/cols × (rows-1)/rows，等分轨道下反差就有 6~56 倍，正是海报排布要的效果。
 */
function bento(cols: number, rows: number): Rect01[] {
  const cw = 1 / cols
  const ch = 1 / rows
  const heroWidth = cw * (cols - 1)
  const heroHeight = ch * (rows - 1)
  const out: Rect01[] = [{ x: 0, y: 0, width: heroWidth, height: heroHeight }]
  for (let row = 0; row < rows - 1; row += 1) {
    out.push({ x: heroWidth, y: row * ch, width: cw, height: ch })
  }
  for (let col = 0; col < cols; col += 1) {
    out.push({ x: col * cw, y: heroHeight, width: cw, height: ch })
  }
  return out
}

/** bento 族：同一张数下把主图块从窄长换到宽扁，再补两个镜像版 */
function bentoFamily(n: number): Rect01[][] {
  const combos: [number, number][] = []
  for (let cols = 2; cols <= n - 2; cols += 1) {
    combos.push([cols, n - cols])
  }
  const picked = spread(combos, 5)
  const out = picked.map(([cols, rows]) => bento(cols, rows))
  for (const [cols, rows] of spread(picked, 2)) {
    out.push(mirrorX(bento(cols, rows)))
  }
  return out
}

/** 三竖条、中间宽两头窄，等分与主图族都表达不了 */
function oneTwoOne(): Rect01[] {
  return [
    { x: 0, y: 0, width: 0.25, height: 1 },
    { x: 0.25, y: 0, width: 0.5, height: 1 },
    { x: 0.75, y: 0, width: 0.25, height: 1 },
  ]
}

/**
 * 经典族排在前面：它们是用户会主动找的形状（均匀网格、主图 + 一排/一列、错落 bento），
 * 也保证「顶部整图 + 下方均分」这类需求一定在列。
 */
function classicRects(n: number): Rect01[][] {
  const out: Rect01[][] = [band(UNIT, 1, n), band(UNIT, n, 1)]
  const square = factorPairs(n).find(([cols, rows]) => cols > 1 && rows > 1 && cols >= rows)
  if (square) {
    out.push(band(UNIT, square[0], square[1]))
  }
  out.push(...bentoFamily(n))
  if (n === 3) {
    out.push(oneTwoOne())
  }
  out.push(heroTop(n - 1), heroLeft(n - 1), heroBottom(n - 1), heroRight(n - 1))
  const side = Math.round(Math.sqrt(n + 3))
  if (side >= 3 && side * side - 3 === n) {
    out.push(mosaic(side))
  }
  return out
}

/**
 * 递归切矩形。叶子是均分网格（含 1×n 带），内部节点是一次不对称切分，
 * 所以能长出「左边一张大图，右边再不对称地切成一大两小」这种嵌套错落。
 * 只切一层的话每段内部只能均分，出来的就永远是等比拼接。
 * 每层用 diversify 收敛到 SHAPE_CAP，否则组合数会炸。
 */
function shapes(n: number, budget: number): Rect01[][] {
  if (n === 1) {
    return [[UNIT]]
  }
  const key = `${n}:${budget}`
  const cached = SHAPE_CACHE.get(key)
  if (cached) {
    return cached
  }
  const out: Rect01[][] = uniformGrids(n)
  if (budget > 0) {
    for (let k = 1; k < n; k += 1) {
      const left = shapes(k, budget - 1).slice(0, BRANCH_LIMIT)
      const right = shapes(n - k, budget - 1).slice(0, BRANCH_LIMIT)
      for (const stacked of [true, false]) {
        for (const ratio of SPLIT_RATIOS) {
          const [first, second] = split(UNIT, stacked, ratio)
          for (const head of left) {
            const placed = place(head, first)
            for (const tail of right) {
              out.push([...placed, ...place(tail, second)])
            }
          }
        }
      }
    }
  }
  const picked = diversify(out, SHAPE_CAP)
  SHAPE_CACHE.set(key, picked)
  return picked
}

const CACHE = new Map<number, GridTemplate[]>()
const SHAPE_CACHE = new Map<string, Rect01[][]>()

/**
 * 按张数成套产出版式：经典族打底保证常用形状一定在最前，
 * 再用递归切分目录补足到上限。id 是 `gen-<序号>`，同一张数下顺序稳定；
 * 张数变了目录就换，选中态回退到第一个。
 */
export function layoutsForCount(count: number): GridTemplate[] {
  const n = Math.round(count)
  if (!Number.isFinite(n) || n < MIN_LAYOUT_COUNT || n > MAX_LAYOUT_COUNT) {
    return []
  }
  const cached = CACHE.get(n)
  if (cached) {
    return cached
  }
  const seen = new Set<string>()
  const out: GridTemplate[] = []
  const push = (rects: readonly Rect01[]): void => {
    if (rects.length !== n) {
      return
    }
    const key = signature(rects)
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    out.push(rectsToTemplate(`gen-${out.length}`, rects))
  }

  if (n === 1) {
    push([UNIT])
  } else {
    for (const rects of classicRects(n)) {
      push(rects)
    }
    for (const rects of shapes(n, MAX_BUDGET)) {
      if (out.length >= MAX_LAYOUTS_PER_COUNT) {
        break
      }
      push(rects)
    }
  }

  CACHE.set(n, out)
  return out
}

/** 按 id 取该张数下的版式；不存在时回退到第一个 */
export function layoutById(count: number, id: string): GridTemplate | null {
  const layouts = layoutsForCount(count)
  return layouts.find((layout) => layout.id === id) ?? layouts[0] ?? null
}
