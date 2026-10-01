import { describe, expect, it } from 'vitest'

import {
  MAX_LEVEL,
  PLATFORM_TARGETS,
  searchUnderTarget,
  stepAt,
  targetOf,
  type EncodeParams,
} from '@/modules/gif/targets'

const START: EncodeParams = { width: 320, fps: 12, maxColors: 256, lossy: 0 }

/**
 * 假成本模型：体积只由参数决定，所以搜索跳级时结果依然确定。
 * （按「第几次调用」返回预置体积的写法，一旦跳级就会与真实级别错位。）
 */
function costOf(params: EncodeParams): number {
  return Math.round(params.width * params.fps * params.maxColors * (1 - params.lossy / 400))
}

describe('stepAt', () => {
  it('returns the untouched parameters at level 0', () => {
    expect(stepAt(START, 0)).toEqual(START)
  })

  it('never becomes less destructive as the level rises', () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const before = stepAt(START, level - 1)
      const after = stepAt(START, level)

      expect(after.width).toBeLessThanOrEqual(before.width)
      expect(after.fps).toBeLessThanOrEqual(before.fps)
      expect(after.maxColors).toBeLessThanOrEqual(before.maxColors)
      expect(after.lossy).toBeGreaterThanOrEqual(before.lossy)
    }
  })

  it('tightens relative to the caller start instead of overwriting it', () => {
    const chosen: EncodeParams = { width: 320, fps: 12, maxColors: 64, lossy: 120 }

    expect(stepAt(chosen, 0)).toEqual(chosen)
    expect(stepAt(chosen, 3).maxColors).toBeLessThanOrEqual(64)
    expect(stepAt(chosen, 3).lossy).toBeGreaterThanOrEqual(120)
  })

  it('clamps the level index and the per-parameter floors', () => {
    expect(stepAt(START, -3)).toEqual(stepAt(START, 0))
    expect(stepAt(START, 999)).toEqual(stepAt(START, MAX_LEVEL))
    expect(stepAt({ ...START, width: 100 }, MAX_LEVEL).width).toBe(96)
    expect(stepAt({ ...START, fps: 6 }, MAX_LEVEL).fps).toBe(5)
  })
})

describe('searchUnderTarget', () => {
  it('stops at the first level that fits, keeping the gentlest parameters', async () => {
    const result = await searchUnderTarget({
      start: START,
      targetBytes: 128 * 1024,
      measure: async (params) => costOf(params),
    })

    expect(result.ok).toBe(true)
    expect(result.rounds).toBe(3)
    expect(result.params).toEqual(stepAt(START, 4))
    expect(result.bytes).toBeLessThanOrEqual(128 * 1024)
  })

  it('jumps several levels when the first attempt is wildly over budget', async () => {
    const seen: number[] = []
    const result = await searchUnderTarget({
      start: START,
      targetBytes: 128 * 1024,
      measure: async (params) => {
        seen.push(params.width)
        return costOf(params)
      },
      maxRounds: 2,
    })

    expect(seen).toEqual([stepAt(START, 0).width, stepAt(START, 3).width])
    expect(result.ok).toBe(false)
  })

  it('stops early once the harshest level is reached', async () => {
    let calls = 0
    const result = await searchUnderTarget({
      start: START,
      targetBytes: 1024,
      measure: async () => {
        calls += 1
        return 900_000
      },
      maxRounds: 4,
    })

    expect(result).toMatchObject({ ok: false, rounds: 3 })
    expect(calls).toBe(3)
    expect(result.params).toEqual(stepAt(START, MAX_LEVEL))
  })

  it('returns immediately when the untouched parameters already fit', async () => {
    const result = await searchUnderTarget({
      start: START,
      targetBytes: 10 * 1024 * 1024,
      measure: async (params) => costOf(params),
    })

    expect(result).toEqual({ ok: true, params: START, bytes: costOf(START), rounds: 1 })
  })

  it('rejects a nonsensical budget', async () => {
    await expect(
      searchUnderTarget({ start: START, targetBytes: 0, measure: async () => 1 }),
    ).rejects.toThrowError(/targetBytes/)
    await expect(
      searchUnderTarget({ start: START, targetBytes: 100, measure: async () => 1, maxRounds: 0 }),
    ).rejects.toThrowError(/maxRounds/)
  })
})

describe('platform targets', () => {
  it('keeps every preset with a positive byte budget and a source', () => {
    for (const target of PLATFORM_TARGETS) {
      expect(target.maxBytes).toBeGreaterThan(0)
      expect(target.source).toMatch(/^https:\/\//)
    }
  })

  it('flags the wechat preset as reference-only because it has no official spec', () => {
    expect(targetOf('wechat').referenceOnly).toBe(true)
    expect(targetOf('slack').maxBytes).toBe(128 * 1024)
  })

  it('throws on an unknown preset id', () => {
    expect(() => targetOf('myspace' as never)).toThrowError(/unknown platform target/)
  })
})
