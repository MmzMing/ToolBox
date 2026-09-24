import { describe, expect, it } from 'vitest'

import { FONTS } from '@/tools/video/music-to-video/engine/fonts'
import { MOOD_ORDER, MOODS } from '@/tools/video/music-to-video/engine/moods'
import { omakase } from '@/tools/video/music-to-video/engine/omakase'
import { resolveStyle, STYLES, STYLE_ORDER } from '@/tools/video/music-to-video/engine/styles'
import {
  GROUP_KEYS,
  allEnabled,
  defOf,
  orderOf,
} from '@/tools/video/music-to-video/engine/registry'
import {
  buildPlan,
  defaultProject,
  normalizeProject,
} from '@/tools/video/music-to-video/music-to-video.service'

/** 确定性随机源，便于复现 omakase 的结果 */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('风格包数据完整性', () => {
  it('每个风格包引用的字体 key 都真实存在', () => {
    for (const key of STYLE_ORDER) {
      const st = STYLES[key]
      for (const [role, list] of Object.entries(st.fonts)) {
        expect(list.length, `${key}.${role}`).toBeGreaterThan(0)
        for (const f of list) expect(FONTS[f], `${key}.${role}.${f}`).toBeTruthy()
      }
    }
  })

  it('mono 角色只用等宽或点阵字体（HUD 取首选，旧项目的 dot 首选换成了 pixel）', () => {
    for (const key of STYLE_ORDER) {
      const mono = STYLES[key].fonts.mono
      expect(mono.length, key).toBeGreaterThan(0)
      for (const f of mono) expect(['mono', 'pixel'], `${key}.${f}`).toContain(FONTS[f]?.kind)
    }
  })

  it('配色方案的必备色位齐全', () => {
    for (const key of STYLE_ORDER) {
      expect(STYLES[key].schemes.length).toBeGreaterThan(0)
      for (const sc of STYLES[key].schemes) {
        for (const slot of [
          'bg',
          'fg',
          'sub',
          'accent',
          'accent2',
          'ink',
          'dim',
          'ghostA',
          'ghostB',
        ] as const) {
          expect(sc[slot], `${key}.${slot}`).toMatch(/^#[0-9a-fA-F]{6}$/)
        }
      }
    }
  })

  it('偏置与装饰权重只引用真实存在的部件', () => {
    for (const key of STYLE_ORDER) {
      const st = STYLES[key]
      for (const [group, map] of Object.entries(st.bias)) {
        for (const part of Object.keys(map ?? {})) {
          expect(orderOf(group as (typeof GROUP_KEYS)[number])).toContain(part)
        }
      }
      for (const part of Object.keys(st.decor ?? {})) expect(orderOf('decor')).toContain(part)
    }
  })
})

describe('resolveStyle', () => {
  it('未知风格回落到 noir，且不改原对象', () => {
    const project = { ...defaultProject(), style: '不存在的风格' }
    const st = resolveStyle(project)
    expect(st.schemes[0]).toEqual(STYLES.noir.schemes[0])
    expect(st.schemes[0]).not.toBe(STYLES.noir.schemes[0])
  })

  it('用户主色会作用到全部配色方案，并按背景拉对比度', () => {
    const base = defaultProject()
    const project = {
      ...base,
      colors: { enabled: true, accentOn: true, accent: '#FF0000', ghostA: '#00FF00' },
    }
    const st = resolveStyle(project)
    for (const sc of st.schemes) {
      // 残影色会被 fitContrast 朝可读方向微调，允许小幅偏离
      expect(sc.ghostA).toMatch(/^#[0-9A-F]{6}$/)
      expect(Math.abs(Number.parseInt(sc.ghostA.slice(1, 3), 16) - 0)).toBeLessThan(40)
      expect(sc.accent).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('只覆盖底色时不污染其它配色方案', () => {
    const base = defaultProject()
    const project = { ...base, colors: { enabled: true, bg: '#123456' } }
    const st = resolveStyle(project)
    expect(st.schemes[0].bg).toBe('#123456')
    if (st.schemes.length > 1) expect(st.schemes[1].bg).toBe(STYLES[base.style].schemes[1].bg)
  })

  it('指定字体角色后只替换该角色', () => {
    const project = { ...defaultProject(), fonts: { display: 'kuaile' } }
    const st = resolveStyle(project)
    expect(st.fonts.display).toEqual(['kuaile'])
    expect(st.fonts.body.length).toBeGreaterThan(0)
  })
})

describe('情绪表', () => {
  it('每个情绪列出的部件都真实存在', () => {
    for (const mood of MOOD_ORDER) {
      const M = MOODS[mood]
      for (const group of ['layout', 'enter', 'exit'] as const) {
        for (const part of M[group] ?? []) expect(orderOf(group)).toContain(part)
      }
      for (const style of M.styles ?? []) expect(STYLES[style]).toBeTruthy()
      for (const range of Object.values(M.fx)) {
        expect(range[0]).toBeLessThan(range[1])
        expect(range[0]).toBeGreaterThanOrEqual(0)
        expect(range[1]).toBeLessThanOrEqual(1.5)
      }
      expect(M.koma.length).toBeGreaterThan(0)
    }
  })
})

describe('omakase', () => {
  it('同一随机源的结果可复现', () => {
    const a = omakase(defaultProject(), seeded(7))
    const b = omakase(defaultProject(), seeded(7))
    expect(a).toEqual(b)
  })

  it('随机出来的项目仍然是合法项目：强度在区间内、部件存在、能规划', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rolled = normalizeProject(omakase(defaultProject(), seeded(seed * 991)))
      for (const v of Object.values(rolled.fx)) {
        if (typeof v === 'number') expect(v).toBeGreaterThanOrEqual(0)
      }
      expect(rolled.fx.chroma).toBeLessThanOrEqual(1)
      expect(STYLES[rolled.style]).toBeTruthy()
      for (const group of GROUP_KEYS) {
        for (const key of Object.keys(rolled.enabled[group] ?? {}))
          expect(orderOf(group)).toContain(key)
      }
    }
  })

  it('每个分组至少留下可用部件，且锁定行不被丢弃', () => {
    const base = { ...defaultProject(), overrides: { 3: { lock: true, layout: 'center' } } }
    for (const mood of MOOD_ORDER) {
      const rolled = omakase(
        { ...base, mood: mood === 'chaos' ? 'glitch' : 'calm' },
        seeded(mood.length * 131),
      )
      expect(
        Object.values(rolled.enabled.layout ?? {}).filter(Boolean).length,
      ).toBeGreaterThanOrEqual(3)
      expect(rolled.overrides[3]?.lock).toBe(true)
      if (rolled.enabled.enter) expect(rolled.enabled.enter.cut).toBe(true)
      if (rolled.enabled.hold) expect(rolled.enabled.hold.still).toBe(true)
    }
  })

  it('不会连着两次给出同一个情绪或风格', () => {
    let project = defaultProject()
    for (let i = 0; i < 8; i++) {
      const next = omakase(project, seeded(i * 17 + 3))
      expect(next.mood).not.toBe(project.mood)
      expect(next.style).not.toBe(project.style)
      project = next
    }
  })

  it('歌词、时间轴与输出参数不受随机影响', () => {
    const base = {
      ...defaultProject(),
      lyrics: '只有一句',
      fps: 30 as const,
      aspect: '9:16' as const,
    }
    const rolled = omakase(base, seeded(5))
    expect(rolled.lyrics).toBe(base.lyrics)
    expect(rolled.fps).toBe(base.fps)
    expect(rolled.aspect).toBe(base.aspect)
    expect(rolled.timing).toEqual(base.timing)
  })
})

/** 镜头上写着用了哪件部件的分组（fx 是画面层后期，trans 只在切镜处出现） */
const CUT_GROUPS = ['layout', 'enter', 'hold', 'exit', 'treat', 'bg', 'cam'] as const

/** 全开 + 指定两个集合开关，规划出来的分镜用了哪些件 */
function pickedParts(part: { extra?: boolean; traditional?: boolean }): Set<string> {
  const out = new Set<string>()
  for (let seed = 1; seed <= 8; seed++) {
    const project = {
      ...defaultProject(),
      ...part,
      seed: seed * 613,
      lyrics: '风把夜色吹薄\n我在亮的地方等你\nHello 2026 世界\n一句话就够了\n灯火向后退去',
      enabled: allEnabled(),
    }
    const plan = buildPlan(project, null)
    for (const cut of plan.cuts) {
      for (const group of CUT_GROUPS) out.add(`${group}.${cut[group]}`)
      for (const d of cut.decor) out.add(`decor.${d.id}`)
    }
  }
  return out
}

describe('部件集合门控', () => {
  it('默认不开追加分时，规划不会用到追加件与追加风格', () => {
    const picked = pickedParts({ extra: false, traditional: true })
    for (const name of picked) {
      const [group, key] = name.split('.')
      const def = defOf(group as (typeof CUT_GROUPS)[number], key)
      expect(def?.extra, `${name} 不该在 extra=false 时被抽中`).not.toBe(true)
    }
    const rolled = omakase({ ...defaultProject(), extra: false }, seeded(3))
    expect(STYLES[rolled.style].extra).toBeFalsy()
  })

  it('关掉传统纹样时不会抽到纹样件', () => {
    for (const name of pickedParts({ extra: true, traditional: false })) {
      const [group, key] = name.split('.')
      const def = defOf(group as (typeof CUT_GROUPS)[number], key)
      expect(def?.traditional, `${name} 不该在 traditional=false 时被抽中`).not.toBe(true)
    }
  })

  it('开启追加分后确实抽得到追加件（否则门是空的）', () => {
    const wide = pickedParts({ extra: true, traditional: true })
    const extras = [...wide].filter(
      (name) => defOf(name.split('.')[0] as never, name.split('.')[1])?.extra,
    )
    expect(extras.length).toBeGreaterThan(0)
    // 池子变大后抽样序列也会变，所以差集不全是追加件，只能断言追加件进来了
    expect(wide.size).toBeGreaterThan(0)
  })
})
