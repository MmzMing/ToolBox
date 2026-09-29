import { clamp01 } from './image-stack.service'

/**
 * 相邻截图重叠区匹配。零 DOM、零 canvas —— 输入已经是行指纹，
 * 所以在 `environment: 'node'` 下可测；取像素那份在 overlap-sample.ts。
 *
 * 不变量：同一对指纹必须来自同一次采样配置（`width` 与 `rowStride` 相同），
 * 否则第 i 行不对应同一个源图像素跨度。采样侧按「两图中较大的自然跨度」
 * 统一 rowStride，所以这里不必再兜不一致的情况。
 */

/** 一张图某条边带的逐行指纹 */
export type RowSignature = {
  /** 采样宽度（横向缩到这么窄再算指纹） */
  width: number
  /** 一个签名行代表源图的多少行 */
  rowStride: number
  /** 每行平均亮度 0..1，相邻行的均值差就是重叠比对的主要证据 */
  means: Float32Array
  /** 每行左右半区的亮度差绝对值 0..1，用来识破「整屏平移」的假匹配 */
  gradients: Float32Array
  /** 每行亮度的极差 0..1；接近 0 说明这一行是纯色/渐变，没有信息 */
  details: Float32Array
  /** 每行 16 桶亮度直方图，按行主序铺平；每行和为 width，比对时归一化 */
  histograms: Uint16Array
}

export type OverlapReason = 'ok' | 'none' | 'flat' | 'ambiguous' | 'weak'

export type OverlapMatch = {
  /** 建议从后一张顶部裁掉的源图像素高度 */
  overlapPx: number
  /** overlapPx / 后一张的窗口跨度，仅用于展示 */
  ratio: number
  score: number
  /** 只有 'ok' 才为 true：调用方可以自动落值，其余都要用户确认 */
  confident: boolean
  reason: OverlapReason
}

export type OverlapOptions = {
  /** 最多认到多长的重叠，超出就不找了 */
  maxOverlapPx: number
  minOverlapPx: number
  /** 单行至少要有这么多细节才认为「有证据」 */
  flatDetail: number
  /**
   * 一个候选至少要有多少行带证据才参与竞争，上限是它自己比到的行数。
   * 用行数而不是占比：截图里大段留白是常态，按占比会把「空白多但文字行全部对上」
   * 这种最可靠的情况误杀成平场。
   */
  minInformativeRows: number
  /** 最优候选代价低于它才算可信 */
  confidentScore: number
  /** 介于可信与不可信之间：给数值但要求确认 */
  weakScore: number
  /** 次优与最优差距小于它且跨度不同 → 判歧义 */
  ambiguityMargin: number
  /** 候选分开的行数间隔，小于它不算「另一个候选」 */
  ambiguityGap: number
  /** 单个候选最多比对多少行 */
  maxCompareRows: number
}

export const DEFAULT_OVERLAP_OPTIONS: OverlapOptions = {
  maxOverlapPx: 1440,
  minOverlapPx: 4,
  flatDetail: 0.004,
  minInformativeRows: 3,
  confidentScore: 0.12,
  weakScore: 0.2,
  ambiguityMargin: 0.06,
  ambiguityGap: 2,
  maxCompareRows: 128,
}

export const OVERLAP_SAMPLE_WIDTH = 144
/** 一条边带最多取这么多签名行，行向按 rowStride 抽样 */
export const MAX_WINDOW_ROWS = 1600
export const HISTOGRAM_BINS = 16

/** 接缝的一对边带：前一张的下沿窗口 + 后一张的上沿窗口 */
export type OverlapPair = { prev: RowSignature; next: RowSignature }

function nmad(a: Float32Array, b: Float32Array, ai: number, bi: number): number {
  const left = a[ai] ?? 0
  const right = b[bi] ?? 0
  const denominator = Math.max(left, right, 1e-6)
  return Math.abs(left - right) / denominator
}

/** 两行直方图的 Hellinger 距离²，归一到 0..1 */
function histogramDistance(a: Uint16Array, b: Uint16Array, ai: number, bi: number): number {
  let sum = 0
  for (let bin = 0; bin < HISTOGRAM_BINS; bin += 1) {
    const p = Math.sqrt((a[ai * HISTOGRAM_BINS + bin] ?? 0) + 1e-6)
    const q = Math.sqrt((b[bi * HISTOGRAM_BINS + bin] ?? 0) + 1e-6)
    sum += (p - q) * (p - q)
  }
  // 每行直方图的总量都是采样宽度，归一化后 Hellinger² ∈ [0, 2]
  return clamp01(sum / 2)
}

function rowCost(prev: RowSignature, next: RowSignature, prevRow: number, nextRow: number): number {
  return (
    0.55 * nmad(prev.means, next.means, prevRow, nextRow) +
    0.25 * nmad(prev.gradients, next.gradients, prevRow, nextRow) +
    0.2 * histogramDistance(prev.histograms, next.histograms, prevRow, nextRow)
  )
}

function rowCount(signature: RowSignature): number {
  return signature.means.length
}

function isInformative(
  prev: RowSignature,
  next: RowSignature,
  prevRow: number,
  nextRow: number,
  flatDetail: number,
): boolean {
  const detail = Math.min(prev.details[prevRow] ?? 0, next.details[nextRow] ?? 0)
  return detail > flatDetail
}

/**
 * 一个候选重叠量的代价，只在「有证据的行」上求平均。
 *
 * 留白的行既不支持也不反对这个候选 —— 它们两处都一样，把它们的 0 代价平均进来
 * 只会稀释真实证据。所以只统计有细节的行，行数不够才判 ∞（等于「这段没证据」）。
 * 早期版本改成「有效行占比 ≥ 60%」，结果把大量留白 + 少数文字行的截图
 * ——恰恰是最可靠的那种重叠——整个误判成平场而拒绝识别。
 */
function candidateCost(
  prev: RowSignature,
  next: RowSignature,
  overlap: number,
  config: OverlapOptions,
): number {
  const step = Math.max(1, Math.ceil(overlap / config.maxCompareRows))
  const prevRows = rowCount(prev)
  const sampled = Math.ceil(overlap / step)
  let sum = 0
  let informative = 0
  for (let offset = 0; offset < overlap; offset += step) {
    const prevRow = prevRows - overlap + offset
    if (!isInformative(prev, next, prevRow, offset, config.flatDetail)) {
      continue
    }
    informative += 1
    sum += rowCost(prev, next, prevRow, offset)
  }
  // demanded 不能超过候选本身比到的行数，否则 1~2 行的短重叠永远凑不齐证据，
  // 等于把所有细缝都判成平场 —— 而那正是滚动截图最常见的一种。
  if (informative < Math.min(config.minInformativeRows, sampled)) {
    return Number.POSITIVE_INFINITY
  }
  return sum / informative
}

function result(
  overlapPx: number,
  windowPx: number,
  score: number,
  reason: OverlapReason,
): OverlapMatch {
  return {
    overlapPx,
    ratio: windowPx > 0 ? overlapPx / windowPx : 0,
    score: Number.isFinite(score) ? score : 0,
    confident: reason === 'ok',
    reason,
  }
}

/** 一条接缝的判读；找不到可信重叠一律返回 overlapPx 0，绝不猜 */
export function matchOverlap(
  prev: RowSignature,
  next: RowSignature,
  options: Partial<OverlapOptions> = DEFAULT_OVERLAP_OPTIONS,
): OverlapMatch {
  const config = { ...DEFAULT_OVERLAP_OPTIONS, ...options }
  const stride = Math.max(1, Math.round(prev.rowStride))
  const prevRows = rowCount(prev)
  const nextRows = rowCount(next)
  const windowPx = nextRows * stride

  const maxRows = Math.min(prevRows, nextRows, Math.floor(config.maxOverlapPx / stride))
  const minRows = Math.max(1, Math.ceil(config.minOverlapPx / stride))
  if (maxRows < minRows) {
    return result(0, windowPx, 0, 'none')
  }

  let best = { overlap: 0, cost: Number.POSITIVE_INFINITY }
  let flatSeen = false
  // 从大到小枚举：代价相同时先遇到的更大重叠量胜出（多裁只会留一条细线，
  // 少裁会留下整条重复带，前者的观感损失小得多）
  for (let overlap = maxRows; overlap >= minRows; overlap -= 1) {
    const cost = candidateCost(prev, next, overlap, config)
    if (cost === Number.POSITIVE_INFINITY) {
      flatSeen = true
      continue
    }
    if (cost < best.cost) {
      best = { overlap, cost }
    }
  }

  if (best.cost === Number.POSITIVE_INFINITY) {
    return result(0, windowPx, 0, flatSeen ? 'flat' : 'none')
  }

  // 次优候选必须离最优足够远才算歧义：相邻重叠量的代价本来就近似连续下降
  let ambiguous = false
  for (let overlap = maxRows; overlap >= minRows; overlap -= 1) {
    if (Math.abs(overlap - best.overlap) <= config.ambiguityGap) {
      continue
    }
    const cost = candidateCost(prev, next, overlap, config)
    if (cost - best.cost < config.ambiguityMargin) {
      ambiguous = true
      break
    }
  }

  const overlapPx = best.overlap * stride
  if (ambiguous) {
    return result(0, windowPx, best.cost, 'ambiguous')
  }
  if (best.cost <= config.confidentScore) {
    return result(overlapPx, windowPx, best.cost, 'ok')
  }
  if (best.cost <= config.weakScore) {
    return result(overlapPx, windowPx, best.cost, 'weak')
  }
  return result(0, windowPx, best.cost, 'none')
}

/** n 张图给出 n−1 条接缝的结果，下标 i 对应「第 i 张与第 i+1 张之间」 */
export function matchAllSeams(
  pairs: readonly OverlapPair[],
  options: Partial<OverlapOptions> = DEFAULT_OVERLAP_OPTIONS,
): OverlapMatch[] {
  return pairs.map((pair) => matchOverlap(pair.prev, pair.next, options))
}
