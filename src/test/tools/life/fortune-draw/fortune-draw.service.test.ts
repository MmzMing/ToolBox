import { describe, expect, it } from 'vitest'

import { FORTUNE_POOL } from '@/tools/life/fortune-draw/fortune-data'
import {
  createRng,
  drawFortune,
  getLevel,
  hashSeed,
  HOLIDAY_RATES,
  isHoliday,
  NORMAL_RATES,
} from '@/tools/life/fortune-draw/fortune-draw.service'

describe('hashSeed', () => {
  it('is deterministic for the same input', () => {
    expect(hashSeed('alice-2026-09-21')).toBe(hashSeed('alice-2026-09-21'))
  })

  it('differs for different inputs', () => {
    expect(hashSeed('alice-2026-09-21')).not.toBe(hashSeed('bob-2026-09-21'))
    expect(hashSeed('alice-2026-09-21')).not.toBe(hashSeed('alice-2026-09-22'))
  })
})

describe('createRng', () => {
  it('reproduces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('getLevel', () => {
  it('classifies boundaries the same way as the source algorithm', () => {
    expect(getLevel(98)).toBe('good')
    expect(getLevel(84)).toBe('good')
    expect(getLevel(70)).toBe('normal')
    expect(getLevel(56)).toBe('normal')
    expect(getLevel(42)).toBe('bad')
    expect(getLevel(0)).toBe('bad')
  })
})

describe('isHoliday', () => {
  it('matches configured MM-DD dates only', () => {
    expect(isHoliday('01-01')).toBe(true)
    expect(isHoliday('12-25')).toBe(true)
    expect(isHoliday('09-21')).toBe(false)
    expect(isHoliday('1-1')).toBe(false)
  })
})

describe('drawFortune', () => {
  it('always returns an entry that exists in the pool with matching level', () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = drawFortune({ name: 'tester', seed })
      const bucket = FORTUNE_POOL[String(result.luckValue)]
      expect(bucket).toBeDefined()
      expect(bucket).toContainEqual(
        expect.objectContaining({
          summary: result.summary,
          signText: result.signText,
        }),
      )
      expect(result.level).toBe(getLevel(result.luckValue))
    }
  })

  it('returns bilingual texts for every field', () => {
    const result = drawFortune({ name: 'tester', seed: 1 })
    for (const text of [result.summary, result.signText, result.signSource, result.unsignText]) {
      expect(text.zh.length).toBeGreaterThan(0)
      expect(text.en.length).toBeGreaterThan(0)
    }
  })

  it('keeps the pool at 40 lots across 8 buckets', () => {
    const keys = Object.keys(FORTUNE_POOL)
    expect(keys).toHaveLength(8)
    expect(keys.reduce((sum, k) => sum + FORTUNE_POOL[k].length, 0)).toBe(40)
  })

  it('is fixed for the same name on the same day', () => {
    const now = new Date(2026, 8, 21, 12, 0, 0)
    const a = drawFortune({ name: '小明', now })
    const b = drawFortune({ name: '小明', now })
    expect(a).toEqual(b)
  })

  it('changes with name or date in fixed mode', () => {
    const day1 = new Date(2026, 8, 21)
    const day2 = new Date(2026, 8, 22)
    const base = drawFortune({ name: '小明', now: day1 })
    const otherName = drawFortune({ name: '小红', now: day1 })
    const otherDay = drawFortune({ name: '小明', now: day2 })
    // 种子不同 → 抽签结果大概率不同；这里比较完整结果，若巧合相同则至少种子路径确实变了
    const allSame =
      JSON.stringify(base) === JSON.stringify(otherName) &&
      JSON.stringify(base) === JSON.stringify(otherDay)
    expect(allSame).toBe(false)
  })

  it('treats empty name as anonymous and stays deterministic', () => {
    const now = new Date(2026, 8, 21)
    const a = drawFortune({ name: '   ', now })
    const b = drawFortune({ name: '', now })
    expect(a).toEqual(b)
  })

  it('never draws a bad lot on holidays (bad rate is 0)', () => {
    const christmas = new Date(2026, 11, 25)
    for (let i = 0; i < 60; i++) {
      const result = drawFortune({ name: `user-${i}`, now: christmas })
      expect(result.isHolidayBoost).toBe(true)
      expect(result.level).not.toBe('bad')
    }
  })

  it('uses normal rates on regular days', () => {
    const monday = new Date(2026, 8, 21)
    const result = drawFortune({ name: 'tester', now: monday })
    expect(result.isHolidayBoost).toBe(false)
    expect(result.dateLabel).toBe('2026/09/21')
    // 日常与节假日爆率配置保持上游数值
    expect(NORMAL_RATES).toEqual({ good: 40, normal: 40, bad: 20 })
    expect(HOLIDAY_RATES).toEqual({ good: 85, normal: 15, bad: 0 })
  })

  it('draws every level somewhere across many seeds (weights are not degenerate)', () => {
    // 必须钉住一个非节假日日期：不传 now 会取今天，命中 HOLIDAYS 时 bad 率是 0，
    // 这条断言就会在 1/1、2/14、5/1、10/1、12/25 当天无故失败。
    const weekday = new Date(2026, 8, 21)
    const levels = new Set(
      Array.from(
        { length: 200 },
        (_, i) => drawFortune({ name: `n${i}`, now: weekday, seed: i * 997 }).level,
      ),
    )
    expect(levels.has('good')).toBe(true)
    expect(levels.has('bad')).toBe(true)
  })
})
