/**
 * 图片转拼豆 —— 把位图降采样成豆板网格，并把每格颜色映射到真实拼豆色卡。
 *
 * 全部为纯函数：只吃像素数组与色卡数据，不碰 DOM / Canvas（画布与解码在组件层）。
 * 色卡数据来自 BeadColors（MIT © 2020 maxcleme），见 palettes/ 各文件头。
 *
 * 流水线：sampleCells 面积均值降采样 → restrictPalette 限色 → mapToBeads 最近色（可带
 * Floyd–Steinberg 误差扩散）→ countBeads / buildBeadCsv 出用色清单。
 */

export type Rgb = readonly [number, number, number]
export type Lab = readonly [number, number, number]

/** 色卡里的一条原始色号（只有 RGB，Lab 由 rgbToLab 现算） */
export type BeadSwatch = {
  /** 色号，如 H01 */
  readonly ref: string
  /** 色名，部分品牌与色号相同 */
  readonly name: string
  readonly rgb: Rgb
}

/** 参与匹配的色号：附带 CIELAB(D65) */
export type BeadColor = BeadSwatch & {
  /**
   * 不用上游 gen/v3 的 lab 列：其生成脚本里 `16 / 116` 是 Go 的整数常量除法（结果为 0），
   * 深色会算出 L* = -16；另有少数行与当前 RGB 对不上。自算既正确又只需几微秒。
   */
  readonly lab: Lab
}

export type BeadBrand = {
  readonly key: string
  readonly label: string
  /** 单颗豆直径（毫米），用于估算成品尺寸 */
  readonly beadSizeMm: number
  readonly colors: readonly BeadColor[]
}

/** 源图上的取色区域（整数像素） */
export type SourceRect = {
  x: number
  y: number
  width: number
  height: number
}

/** 标准方钉板每边孔数（Hama / Perler / Artkal 常见 29×29） */
export const PEGS_PER_BOARD = 29
/** 图纸最多铺 6×6 块板，边长上限即 174 颗，再大没有实际豆板可拼 */
export const MAX_BOARD_SPAN = 6
export const GRID_MAX = MAX_BOARD_SPAN * PEGS_PER_BOARD

/** 空位标记：网格单元存色卡下标，空位为 -1 */
export const EMPTY_CELL = -1

export type SampleOptions = {
  cols: number
  rows: number
  /** 像素 alpha 低于该值不参与取色（0..255） */
  alphaThreshold: number
  /** 取色区域，缺省为整张图；选区即所见，不再做等比/拉伸适配 */
  rect?: SourceRect
}

export type BeadGrid = {
  cols: number
  rows: number
  /** 行优先，长度 cols * rows；值为色卡下标或 EMPTY_CELL */
  cells: Int16Array
}

export type BeadUsage = {
  /** 色卡下标 */
  index: number
  color: BeadColor
  count: number
  /** 占非空格的比例 0..1 */
  ratio: number
}

/** 采样只要求正整数边长；上限取 GRID_MAX，选区大小由界面换算后传入 */
function clampGrid(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > GRID_MAX) {
    throw new Error(`Bead grid side must be an integer between 1 and ${GRID_MAX}`)
  }
  return value
}

/** sRGB(0..255) → CIELAB(D65)，与上游 generation/v2.go 同一套系数与分段 */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const linear = (channel: number) => {
    const value = channel / 255
    return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92
  }
  const xyz = [
    linear(r) * 100 * 0.4124 + linear(g) * 100 * 0.3576 + linear(b) * 100 * 0.1805,
    linear(r) * 100 * 0.2126 + linear(g) * 100 * 0.7152 + linear(b) * 100 * 0.0722,
    linear(r) * 100 * 0.0193 + linear(g) * 100 * 0.1192 + linear(b) * 100 * 0.9505,
  ]
  const white = [95.047, 100, 108.883]
  const f = xyz.map((value, index) => {
    const scaled = value / white[index]
    return scaled > 0.008856 ? Math.cbrt(scaled) : 7.787 * scaled + 16 / 116
  })

  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]
}

/** CIE76 色差：Lab 欧氏距离，越大越不像 */
export function deltaE76([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

/** 把选区收进图像边界并取整；空选区抛错 */
export function normalizeRect(
  rect: SourceRect,
  imageWidth: number,
  imageHeight: number,
): SourceRect {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    throw new Error('Selection rect must be finite numbers')
  }
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(rect.x)))
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(rect.y)))
  const width = Math.max(1, Math.min(imageWidth - x, Math.round(rect.width)))
  const height = Math.max(1, Math.min(imageHeight - y, Math.round(rect.height)))
  return { x, y, width, height }
}

/** 选区尺寸 ÷ 每颗豆占用的源像素 = 网格边长（收进 1..GRID_MAX） */
export function beadsForRect(
  rect: SourceRect,
  pixelsPerBead: number,
): { cols: number; rows: number } {
  const per = pixelsPerBead > 0 ? pixelsPerBead : 1
  return {
    cols: Math.max(1, Math.min(GRID_MAX, Math.round(rect.width / per))),
    rows: Math.max(1, Math.min(GRID_MAX, Math.round(rect.height / per))),
  }
}

export type BoardCount = { cols: number; rows: number; total: number }

/** 网格需要几块钉板（向上取整，横竖分别计） */
export function boardsForGrid(cols: number, rows: number): BoardCount {
  const boardCols = Math.max(1, Math.ceil(cols / PEGS_PER_BOARD))
  const boardRows = Math.max(1, Math.ceil(rows / PEGS_PER_BOARD))
  return { cols: boardCols, rows: boardRows, total: boardCols * boardRows }
}

/** 面积均值降采样：选区内每个源像素累加进所属格，返回每格平均色的 Lab（空格为 null） */
export function sampleCells(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  { cols, rows, alphaThreshold, rect }: SampleOptions,
): (Lab | null)[] {
  if (width <= 0 || height <= 0) {
    throw new Error('Cannot sample an empty image')
  }
  if (pixels.length !== width * height * 4) {
    throw new Error(`Pixel buffer length ${pixels.length} does not match ${width}x${height}`)
  }
  clampGrid(cols)
  clampGrid(rows)

  const area = normalizeRect(rect ?? { x: 0, y: 0, width, height }, width, height)
  const perCellX = area.width / cols
  const perCellY = area.height / rows
  const sums = new Float64Array(cols * rows * 4)

  // 每格采样上限约 16 个点：4K 原图从几十万次累加降到一万次量级，均值精度足够
  const stride = Math.max(1, Math.floor(Math.sqrt((perCellX * perCellY) / 16)))

  for (let sy = area.y; sy < area.y + area.height; sy += stride) {
    const cellY = Math.floor((sy - area.y) / perCellY)
    if (cellY >= rows) continue
    for (let sx = area.x; sx < area.x + area.width; sx += stride) {
      const cellX = Math.floor((sx - area.x) / perCellX)
      if (cellX >= cols) continue
      const source = (sy * width + sx) * 4
      const alpha = pixels[source + 3]
      if (alpha < alphaThreshold) continue
      const cell = (cellY * cols + cellX) * 4
      // 按 alpha 加权，等于把半透明像素的颜色向不透明端归一
      sums[cell] += pixels[source] * alpha
      sums[cell + 1] += pixels[source + 1] * alpha
      sums[cell + 2] += pixels[source + 2] * alpha
      sums[cell + 3] += alpha
    }
  }

  const result: (Lab | null)[] = []
  for (let index = 0; index < cols * rows; index += 1) {
    const cell = index * 4
    const alphaSum = sums[cell + 3]
    if (alphaSum <= 0) {
      result.push(null)
      continue
    }
    result.push(
      rgbToLab([
        Math.round(sums[cell] / alphaSum),
        Math.round(sums[cell + 1] / alphaSum),
        Math.round(sums[cell + 2] / alphaSum),
      ]),
    )
  }
  return result
}

/** 可复现的 [0,1) 随机源（mulberry32），用于 k-means++ 定种 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function visibleCells(cells: readonly (Lab | null)[]): Lab[] {
  return cells.filter((cell): cell is Lab => cell !== null)
}

/** 在色卡中找最近色下标 */
export function nearestColorIndex(lab: Lab, palette: readonly BeadColor[]): number {
  if (palette.length === 0) {
    throw new Error('Cannot match against an empty palette')
  }
  let best = 0
  let bestDistance = Infinity
  palette.forEach((color, index) => {
    const distance = deltaE76(lab, color.lab)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/** k-means++ 定种 + Lloyd 迭代，返回 k 个聚类中心（Lab）。minDist 增量维护，避免每轮重算全部中心距离 */
function clusterCentroids(labs: readonly Lab[], k: number, rng: () => number): Lab[] {
  const centroids: Lab[] = [[...labs[Math.floor(rng() * labs.length)]] as Lab]
  const minDist = new Float64Array(labs.length).fill(Infinity)

  const refresh = (center: Lab) => {
    for (let i = 0; i < labs.length; i += 1) {
      const distance = deltaE76(labs[i], center) ** 2
      if (distance < minDist[i]) minDist[i] = distance
    }
  }
  refresh(centroids[0])

  while (centroids.length < k) {
    let total = 0
    for (const value of minDist) total += value
    if (total === 0) break
    let ticket = rng() * total
    let pick = 0
    for (let i = 0; i < labs.length; i += 1) {
      ticket -= minDist[i]
      if (ticket <= 0) {
        pick = i
        break
      }
    }
    centroids.push([...labs[pick]] as Lab)
    refresh(centroids[centroids.length - 1])
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = centroids.map(() => [0, 0, 0, 0])
    for (const lab of labs) {
      const bucket = sums[nearestCentroid(lab, centroids)]
      bucket[0] += lab[0]
      bucket[1] += lab[1]
      bucket[2] += lab[2]
      bucket[3] += 1
    }
    let moved = false
    centroids.forEach((center, index) => {
      const [l, a, b, count] = sums[index]
      if (count === 0) return
      const next: Lab = [l / count, a / count, b / count]
      if (deltaE76(center, next) > 0.5) moved = true
      centroids[index] = next
    })
    if (!moved) break
  }

  return centroids
}

function nearestCentroid(lab: Lab, centroids: readonly Lab[]): number {
  let best = 0
  let bestDistance = Infinity
  centroids.forEach((center, index) => {
    const distance = deltaE76(lab, center)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/**
 * 把色卡收缩到 maxColors 种：先对格色做 k-means 得到需求中心，再按各中心覆盖的格数
 * 从多到少取"最近且未选过"的色号 —— 保证结果互不重复，且优先保住画面里的主要颜色。
 */
export function restrictPalette(
  cells: readonly (Lab | null)[],
  palette: readonly BeadColor[],
  maxColors: number,
  rng = createRng(0x5eed),
): number[] {
  const labs = visibleCells(cells)
  if (labs.length === 0) return []
  if (palette.length === 0) {
    throw new Error('Cannot restrict an empty palette')
  }
  if (maxColors <= 0 || maxColors >= palette.length) {
    return palette.map((_, index) => index)
  }

  // 聚类只为挑出"画面需要哪几种颜色"，抽 2000 格足够，避免大网格每帧全量迭代
  const step = Math.max(1, Math.floor(labs.length / 2000))
  const sample = step === 1 ? labs : labs.filter((_, index) => index % step === 0)
  const centroids = clusterCentroids(sample, maxColors, rng)
  const weights = new Array<number>(centroids.length).fill(0)
  for (const lab of sample) weights[nearestCentroid(lab, centroids)] += 1

  const chosen: number[] = []
  const taken = new Set<number>()
  const byDemand = centroids
    .map((center, index) => ({ center, weight: weights[index] }))
    .sort((left, right) => right.weight - left.weight)

  for (const { center } of byDemand) {
    const ranked = palette
      .map((color, index) => ({ index, distance: deltaE76(center, color.lab) }))
      .sort((left, right) => left.distance - right.distance)
    const pick = ranked.find((candidate) => !taken.has(candidate.index))
    if (pick) {
      taken.add(pick.index)
      chosen.push(pick.index)
    }
  }

  return chosen.sort((left, right) => left - right)
}

export type MapOptions = {
  /** Floyd–Steinberg 误差扩散，在 Lab 空间传递（与匹配同一坐标系） */
  dither: boolean
}

/** 逐格映射到色卡；allowed 为限色结果（null = 全色卡可用） */
export function mapToBeads(
  cells: readonly (Lab | null)[],
  cols: number,
  rows: number,
  palette: readonly BeadColor[],
  allowed: readonly number[] | null,
  { dither }: MapOptions,
): BeadGrid {
  const indices = allowed && allowed.length > 0 ? allowed : palette.map((_, index) => index)
  if (palette.length === 0 || indices.length === 0) {
    throw new Error('Cannot map beads against an empty palette')
  }
  const working: (Lab | null)[] = dither
    ? cells.map((cell) => (cell ? ([...cell] as Lab) : null))
    : [...cells]

  const grid: number[] = []

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const position = y * cols + x
      const cell = working[position]
      if (!cell) {
        grid.push(EMPTY_CELL)
        continue
      }
      let best = indices[0]
      let bestDistance = Infinity
      for (const index of indices) {
        const distance = deltaE76(cell, palette[index].lab)
        if (distance < bestDistance) {
          bestDistance = distance
          best = index
        }
      }
      grid.push(best)

      if (!dither) continue
      const error: Lab = [
        cell[0] - palette[best].lab[0],
        cell[1] - palette[best].lab[1],
        cell[2] - palette[best].lab[2],
      ]
      const spread: [number, number, number][] = [
        [x + 1, y, 7 / 16],
        [x - 1, y + 1, 3 / 16],
        [x, y + 1, 5 / 16],
        [x + 1, y + 1, 1 / 16],
      ]
      for (const [nx, ny, factor] of spread) {
        if (nx < 0 || nx >= cols || ny >= rows) continue
        const neighbor = working[ny * cols + nx]
        if (!neighbor) continue
        working[ny * cols + nx] = [
          neighbor[0] + error[0] * factor,
          neighbor[1] + error[1] * factor,
          neighbor[2] + error[2] * factor,
        ]
      }
    }
  }

  return { cols, rows, cells: Int16Array.from(grid) }
}

/** 用色统计，按颗数从多到少排列 */
export function countBeads(grid: BeadGrid, palette: readonly BeadColor[]): BeadUsage[] {
  const counts = new Map<number, number>()
  let filled = 0
  grid.cells.forEach((value) => {
    if (value === EMPTY_CELL) return
    filled += 1
    counts.set(value, (counts.get(value) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([index, count]) => ({
      index,
      color: palette[index],
      count,
      ratio: filled === 0 ? 0 : count / filled,
    }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export type CsvLabels = {
  ref: string
  name: string
  rgb: string
  count: string
  ratio: string
}

/** 用色清单 → CSV 文本（表头由调用方翻译，本模块不依赖 i18n） */
export function buildBeadCsv(usage: readonly BeadUsage[], labels: CsvLabels): string {
  const header = [labels.ref, labels.name, labels.rgb, labels.count, labels.ratio]
  const rows = usage.map((item) => [
    item.color.ref,
    item.color.name,
    rgbToHex(item.color.rgb),
    item.count,
    `${(item.ratio * 100).toFixed(1)}%`,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
