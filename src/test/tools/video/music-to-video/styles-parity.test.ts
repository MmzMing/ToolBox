import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FONTS } from '@/tools/video/music-to-video/engine/fonts'
import { BASE_STYLES } from '@/tools/video/music-to-video/engine/sets'
import { STYLES, STYLE_ORDER } from '@/tools/video/music-to-video/engine/styles'

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
    // 旧项目 7 套风格的 decor 里写着 hud 权重，但装饰表里从来没有 hud 这件，
    // 属于死键（已用脚本对旧项目注册表核对过），移植时剔除，不影响任何抽样结果。
    const decor = { ...(theirs.decor as Record<string, number> | undefined) }
    delete decor.hud
    theirs.decor = decor
    for (const field of FIELDS) {
      if (!(field in theirs)) continue
      expect(ours[field], `${key}.${field}`).toEqual(theirs[field])
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
      for (const [group, map] of Object.entries(st.bias)) {
        for (const part of Object.keys(map))
          expect(orders[group], `${key}.bias.${group}.${part}`).toContain(part)
      }
      for (const part of Object.keys(st.decor ?? {}))
        expect(orders.decor, `${key}.decor.${part}`).toContain(part)
    }
  })

  it('集合归属标记：首版 12 套可随机，追加 12 套要打标记，和風两套另算', () => {
    for (const key of reference.order) {
      expect(Boolean(STYLES[key].extra), `${key}.extra`).toBe(!BASE_STYLES.includes(key))
      expect(Boolean(STYLES[key].traditional), `${key}.traditional`).toBe(
        key === 'sakura' || key === 'sumi',
      )
    }
  })
})
