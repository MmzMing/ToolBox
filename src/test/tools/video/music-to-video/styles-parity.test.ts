import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FONTS } from '@/tools/video/music-to-video/engine/fonts'
import { BASE_STYLES } from '@/tools/video/music-to-video/engine/sets'
import { STYLES, STYLE_ORDER } from '@/tools/video/music-to-video/engine/styles'

/**
 * 旧项目风格表里引用了几件并不存在的部件（历史死键），移植时已剔除，
 * 对账时两边同时删掉这些键，避免它们把真正的差异盖过去。
 */
const DEAD_KEYS: Record<string, string[]> = {
  layout: ['pop'],
  decor: ['hud'],
  bg: ['candy'],
}

const stripDead = (
  bias: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> => {
  const out: Record<string, Record<string, number>> = {}
  for (const [group, map] of Object.entries(bias)) {
    const dead = DEAD_KEYS[group] ?? []
    out[group] = Object.fromEntries(Object.entries(map).filter(([k]) => !dead.includes(k)))
  }
  return out
}

/**
 * 与旧项目的风格对账：夹具 jizura-styles.json 是从 JIZURA 运行期注册表导出的，
 * 每套风格的配色方案、质感、色散倍率、部件偏置都必须逐字段相等。
 *
 * 只有 fonts 不比对：旧项目用日文字体，本工具换成中文黑体/宋体/书法体，
 * 这里只要求每个角色非空且 key 真实存在。
 */
const reference = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-styles.json'), 'utf8'),
) as { order: string[]; styles: Record<string, Record<string, unknown>> }

const FIELDS = [
  'schemes',
  'texture',
  'ghost',
  'bias',
  'decor',
  'hud',
  'glow',
  'glitchBoost',
  'useGrad',
  'moods',
] as const

describe('风格包与 JIZURA 对账', () => {
  it('24 套风格全部到位', () => {
    expect(STYLE_ORDER.slice().sort()).toEqual(reference.order.slice().sort())
  })

  it.each(reference.order)('%s 的渲染数据与旧项目一致', (key) => {
    const ours = STYLES[key]
    const theirs = { ...reference.styles[key] }
    expect(ours, `风格 ${key} 未移植`).toBeTruthy()
    // 死键两边一起删：decor.hud 是旧项目的死键，移植时已剔除，不影响任何抽样结果
    theirs.decor = stripDead({ decor: (theirs.decor ?? {}) as Record<string, number> }).decor
    theirs.bias = stripDead((theirs.bias ?? {}) as Record<string, Record<string, number>>)
    const oursBias = stripDead(ours.bias as unknown as Record<string, Record<string, number>>)
    for (const field of FIELDS) {
      if (!(field in theirs)) continue
      if (field === 'bias') expect(oursBias, `${key}.bias`).toEqual(theirs.bias)
      else expect(ours[field], `${key}.${field}`).toEqual(theirs[field])
    }
  })

  it.each(reference.order)('%s 的字体角色可用且 key 真实存在', (key) => {
    const fonts = STYLES[key].fonts
    for (const role of ['display', 'serif', 'body', 'mono'] as const) {
      expect(fonts[role].length, `${key}.${role}`).toBeGreaterThan(0)
      for (const f of fonts[role]) expect(FONTS[f], `${key}.${role}.${f}`).toBeTruthy()
    }
  })

  it('偏置引用的部件 key 都真实存在（旧项目里 decor.hud 是历史死键，已剔除）', () => {
    const orders: Record<string, string[]> = {}
    for (const [group, list] of Object.entries(
      JSON.parse(
        fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-parts.json'), 'utf8'),
      ) as Record<string, { key: string }[]>,
    )) {
      orders[group] = list.map((x) => x.key)
    }
    for (const key of reference.order) {
      const st = STYLES[key]
      for (const [group, map] of Object.entries(
        stripDead(st.bias as unknown as Record<string, Record<string, number>>),
      )) {
        for (const part of Object.keys(map))
          expect(orders[group], `${key}.bias.${group}.${part}`).toContain(part)
      }
      for (const part of Object.keys(st.decor ?? {}))
        if (!(DEAD_KEYS.decor ?? []).includes(part))
          expect(orders.decor, `${key}.decor.${part}`).toContain(part)
    }
  })

  it('集合归属标记：首版 12 套可随机，追加分要打标记，带集合开关的三套另算', () => {
    for (const key of reference.order) {
      // 带 set 的风格（恐怖三套）有自己的开关，不算"追加分"（与旧项目 11q_sets.js 一致）
      const isExtra = !BASE_STYLES.includes(key) && !STYLES[key].set
      expect(Boolean(STYLES[key].extra), `${key}.extra`).toBe(isExtra)
      expect(Boolean(STYLES[key].traditional), `${key}.traditional`).toBe(
        key === 'sakura' || key === 'sumi',
      )
    }
  })
})
