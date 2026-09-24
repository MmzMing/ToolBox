import { describe, expect, it } from 'vitest'

import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  fitContrast,
  fmtTime,
  hash,
  hexToRgb,
  hsl,
  lerp,
  mix,
  noise1,
  pick,
  randomPalette,
  rgba,
  rng,
  r,
  rr,
  rs,
  smooth,
  toHex,
  toHsl,
} from '@/tools/video/music-to-video/engine/util'

describe('数值工具', () => {
  it('clamp 默认夹到 0..1，可自定义区间', () => {
    expect(clamp(-2)).toBe(0)
    expect(clamp(3)).toBe(1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(20, 0, 255)).toBe(20)
  })

  it('lerp / smooth 在端点上取到端点值', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 0.5)).toBe(15)
    expect(smooth(0, 1, 0)).toBe(0)
    expect(smooth(0, 1, 1)).toBe(1)
    expect(smooth(0, 1, 0.5)).toBeCloseTo(0.5, 5)
  })

  it('所有缓动端点归一', () => {
    for (const [name, fn] of Object.entries(E)) {
      const at0 = fn(0)
      const at1 = fn(1)
      expect(at0, name).toBeCloseTo(0, 5)
      expect(at1, name).toBeCloseTo(1, 5)
    }
  })

  it('角度常数正确', () => {
    expect(TAU / DEG).toBeCloseTo(360, 5)
  })
})

describe('确定性随机', () => {
  it('同样的 key 永远得到同一个哈希', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3))
    expect(hash(1, 2, 3)).not.toBe(hash(1, 2, 4))
    expect(hash(1)).not.toBe(hash(2))
  })

  it('r / rs / rr 落在约定区间', () => {
    for (let i = 0; i < 200; i++) {
      expect(r(i, 7)).toBeGreaterThanOrEqual(0)
      expect(r(i, 7)).toBeLessThan(1)
      expect(Math.abs(rs(i, 7))).toBeLessThanOrEqual(1)
      const v = rr(2, 5, i, 7)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThan(5)
    }
  })

  it('pick 只会取数组内的元素', () => {
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(arr, i, 1))
  })

  it('mulberry32 流可复现，且派生方法齐全', () => {
    const a = rng(42)
    const b = rng(42)
    const seqA = [a(), a.range(0, 10), a.int(1, 6), a.pick(['x', 'y']), a.chance(0.5)]
    const seqB = [b(), b.range(0, 10), b.int(1, 6), b.pick(['x', 'y']), b.chance(0.5)]
    expect(seqA).toEqual(seqB)
    expect(rng(1)()).not.toBe(rng(2)())
    expect(rng(7).int(1, 3)).toBeGreaterThanOrEqual(1)
    expect(rng(7).int(1, 3)).toBeLessThanOrEqual(3)
  })

  it('加权取样只会输出候选值，权重越大越常中', () => {
    const list: [string, number][] = [
      ['rare', 1],
      ['common', 9],
    ]
    expect(['rare', 'common']).toContain(rng(3).wpick(list))
    let common = 0
    for (let i = 0; i < 300; i++) if (rng(i).wpick(list) === 'common') common += 1
    expect(common).toBeGreaterThan(150)
  })

  it('值噪声落在 -1..1 且连续', () => {
    for (let x = 0; x < 20; x += 0.1) {
      const v = noise1(x, 5)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(Math.abs(noise1(3.0, 5) - noise1(3.0001, 5))).toBeLessThan(0.01)
  })
})

describe('颜色工具', () => {
  it('解析 3 位与 6 位十六进制', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#0a141e')).toEqual([10, 20, 30])
    expect(rgba('#000000', 0.5)).toBe('rgba(0,0,0,0.5)')
  })

  it('toHex 会把越界分量夹住', () => {
    expect(toHex(300, -20, 127.6)).toBe('#FF0080')
  })

  it('mix 在两端取回原色', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#FFFFFF')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('hsl ↔ toHsl 基本可逆', () => {
    for (const [h, s, l] of [
      [0, 1, 0.5],
      [120, 0.6, 0.4],
      [300, 0.9, 0.7],
    ] as const) {
      const [h2, s2, l2] = toHsl(hsl(h, s, l))
      expect(h2).toBeCloseTo(h, 0)
      expect(s2).toBeCloseTo(s, 1)
      expect(l2).toBeCloseTo(l, 1)
    }
  })

  it('亮度与对比度符合 WCAG 直觉', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 2)
    // 中灰在白底上不够对比度，会被推深
    const fixed = fitContrast('#888888', '#ffffff', 4.5)
    expect(fixed).not.toBe('#888888')
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // 已经够对比的不会被改动
    expect(fitContrast('#FFFFFF', '#000000', 4.5)).toBe('#FFFFFF')
  })

  it('随机配色在给定的背景上可读', () => {
    let seed = 1
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 20; i++) {
      const dark = i % 2 === 0
      const { accent, ghostA, ghostB } = randomPalette(dark ? '#0A0A0A' : '#F2F2F2', rnd)
      expect(accent).toMatch(/^#[0-9A-F]{6}$/i)
      expect(contrast(accent, dark ? '#0A0A0A' : '#F2F2F2')).toBeGreaterThanOrEqual(3)
      expect(ghostA).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(ghostB).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('时间显示', () => {
  it('带帧号与不带帧号两种格式', () => {
    expect(fmtTime(0)).toBe('00:00.00')
    expect(fmtTime(75.25)).toBe('01:15.25')
    expect(fmtTime(-3)).toBe('00:00.00')
    expect(fmtTime(75.5, 24)).toBe('01:15:12')
  })
})
