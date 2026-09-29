import { describe, expect, it } from 'vitest'

import {
  DEFAULT_OVERLAP_OPTIONS,
  HISTOGRAM_BINS,
  matchAllSeams,
  matchOverlap,
  OVERLAP_SAMPLE_WIDTH,
  type OverlapOptions,
  type RowSignature,
} from '@/tools/images/image-stack/overlap-match'

type RowSpec = {
  mean?: number
  gradient?: number
  detail?: number
  bin?: number
}

/**
 * 指纹的每一行由四个独立通道描述，测试里逐通道控制，
 * 这样才能验证「代价到底来自哪一路证据」。
 */
function signature(rows: RowSpec[], rowStride = 1): RowSignature {
  const means = new Float32Array(rows.length)
  const gradients = new Float32Array(rows.length)
  const details = new Float32Array(rows.length)
  const histograms = new Uint16Array(rows.length * HISTOGRAM_BINS)
  rows.forEach((row, index) => {
    means[index] = row.mean ?? 0.5
    gradients[index] = row.gradient ?? 0.1
    details[index] = row.detail ?? 0.2
    const bin = Math.max(0, Math.min(HISTOGRAM_BINS - 1, row.bin ?? 8))
    histograms[index * HISTOGRAM_BINS + bin] = OVERLAP_SAMPLE_WIDTH
  })
  return { width: OVERLAP_SAMPLE_WIDTH, rowStride, means, gradients, details, histograms }
}

/** 合成窗口只有几行，所以把「至少 4px」的真实下限放开，否则候选全被过滤掉 */
function options(patch: Partial<OverlapOptions> = {}): OverlapOptions {
  return { ...DEFAULT_OVERLAP_OPTIONS, minOverlapPx: 1, ...patch }
}

/** 内容互不相同的行，充当「肯定不匹配」的填充 */
const A = { mean: 0.1, bin: 1 }
const B = { mean: 0.25, bin: 3 }
const C = { mean: 0.4, bin: 5 }
const D = { mean: 0.55, bin: 7 }
const E = { mean: 0.7, bin: 9 }
const F = { mean: 0.85, bin: 11 }

describe('matchOverlap', () => {
  it('finds the rows a bottom edge shares with the next top edge', () => {
    const match = matchOverlap(signature([A, B, C, D, E, F]), signature([D, E, F, A, B]), options())
    expect(match.reason).toBe('ok')
    expect(match.confident).toBe(true)
    expect(match.overlapPx).toBe(3)
    expect(match.score).toBeCloseTo(0, 6)
  })

  it('takes the largest overlap when every size matches equally well', () => {
    const same = Array.from({ length: 4 }, () => C)
    // 纯色块重复排布时 1/2/3 行都零代价，多裁只留一条细线，少裁留整条重复带
    expect(matchOverlap(signature(same), signature(same.slice(0, 3)), options()).overlapPx).toBe(3)
  })

  it('reports no overlap instead of guessing when nothing matches', () => {
    const match = matchOverlap(signature([A, B, C]), signature([D, E, F]), options())
    expect(match.reason).toBe('none')
    expect(match.overlapPx).toBe(0)
    expect(match.confident).toBe(false)
  })

  it('refuses to trim rows that carry no detail', () => {
    const flat = (count: number) =>
      signature(Array.from({ length: count }, () => ({ mean: 0.5, detail: 0.0001 })))
    // 逐行证据完全一致，但纯色/渐变行不足以定位 —— 判平比随手裁一大段好得多
    const match = matchOverlap(flat(6), flat(6), options())
    expect(match.reason).toBe('flat')
    expect(match.overlapPx).toBe(0)
    expect(match.confident).toBe(false)
  })

  it('marks a periodic pattern as ambiguous rather than picking one peak', () => {
    const P = { mean: 0.2, bin: 2 }
    const Q = { mean: 0.6, bin: 10 }
    const period = [P, Q, P, Q, P, Q]
    const match = matchOverlap(signature(period), signature([...period, E]), options())
    expect(match.reason).toBe('ambiguous')
    expect(match.overlapPx).toBe(0)
  })

  it('still reports a value for a low-confidence match so the user can confirm it', () => {
    // 均值差 30% 而梯度与直方图一致 → 代价 0.55 × 0.3 = 0.165，落在可信与弱之间
    const weaker = { mean: 0.7, bin: 8 }
    const stronger = { mean: 1, bin: 8 }
    const match = matchOverlap(signature([A, B, weaker]), signature([stronger, D, E]), options())
    expect(match.reason).toBe('weak')
    expect(match.confident).toBe(false)
    expect(match.overlapPx).toBe(1)
    expect(match.score).toBeGreaterThan(DEFAULT_OVERLAP_OPTIONS.confidentScore)
    expect(match.score).toBeLessThan(DEFAULT_OVERLAP_OPTIONS.weakScore)
  })

  it('converts signature rows back into source pixels through the stride', () => {
    const match = matchOverlap(signature([A, B, C, D, E], 3), signature([C, D, E, F], 3), options())
    expect(match.overlapPx).toBe(9)
    expect(match.ratio).toBeCloseTo(9 / (4 * 3), 6)
  })

  it('honours a search window the caller shrank', () => {
    // 真实重叠是 3 行，只允许找 2 行时就该一无所获，而不是勉强报 2
    const match = matchOverlap(
      signature([A, B, C, D, E, F]),
      signature([D, E, F, A, B]),
      options({ maxOverlapPx: 2 }),
    )
    expect(match.overlapPx).toBe(0)
    expect(match.reason).toBe('none')
  })

  it('finds an overlap that sits mostly inside blank space', () => {
    // 大段留白 + 零星文字行是文档截图的常态。旧版按「有效行占比」判平，
    // 会把这种其实最可靠的重叠整个拒绝掉；现在只数有证据的行。
    const BLANK = { mean: 1, detail: 0.0001, bin: 15 }
    const TEXT = { mean: 0.35, detail: 0.12, bin: 5 }
    const textRows = new Set([0, 3, 7, 12, 16])
    const pattern = Array.from({ length: 20 }, (_, index) => (textRows.has(index) ? TEXT : BLANK))
    const match = matchOverlap(signature(pattern), signature([...pattern, D, E, F]), options())
    expect(match.reason).toBe('ok')
    expect(match.overlapPx).toBe(20)
    expect(match.confident).toBe(true)
    // 证据行数不够时仍然该拒绝，别把「没证据」当成「匹配上了」
    expect(
      matchOverlap(signature(pattern), signature([...pattern, D, E, F]), {
        ...options(),
        minInformativeRows: 6,
      }).reason,
    ).toBe('flat')
  })

  it('ignores sub-pixel slivers under the real minimum overlap', () => {
    // 默认下限 4px，三行的窗口根本凑不出一个候选
    const match = matchOverlap(signature([A, B, C]), signature([A, B, C]))
    expect(match.overlapPx).toBe(0)
    expect(match.reason).toBe('none')
  })

  it('keeps a large overlap but drops one under the minimum', () => {
    const same = Array.from({ length: 6 }, () => C)
    expect(
      matchOverlap(signature(same), signature(same), options({ minOverlapPx: 5 })).overlapPx,
    ).toBe(6)
    // 真实重叠只有 2 行，而下限要求 3 行 —— 这种细缝不值得裁
    expect(
      matchOverlap(signature([A, B, C, D]), signature([C, D, E, F]), options({ minOverlapPx: 3 }))
        .overlapPx,
    ).toBe(0)
  })
})

describe('matchAllSeams', () => {
  it('answers one result per seam, in order', () => {
    const one = signature([A, B, C, D])
    const two = signature([C, D, E, F])
    const three = signature([A, B, C, D])
    const matches = matchAllSeams(
      [
        { prev: one, next: two },
        { prev: two, next: three },
      ],
      options(),
    )
    expect(matches).toHaveLength(2)
    expect(matches[0]?.overlapPx).toBe(2)
    expect(matches[1]).toMatchObject({ overlapPx: 0, reason: 'none' })
  })

  it('handles a single image with no seams', () => {
    expect(matchAllSeams([], options())).toEqual([])
  })
})
