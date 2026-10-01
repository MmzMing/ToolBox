import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { AE_MAP, PACK_AE, planForAE } from '@/tools/video/music-to-video/engine/ae-export'
import { LAYOUT_ORDER as CORE_LAYOUTS } from '@/tools/video/music-to-video/engine/layouts'
import { allEnabled } from '@/tools/video/music-to-video/engine/registry'
import { buildPlan, defaultProject } from '@/tools/video/music-to-video/music-to-video.service'

/**
 * AE 数据导出的对账：映射表必须和旧项目 def.ae / J.AE_MAP 一字不差，
 * 换件时要保留浏览器原始 key，且产出的东西真的是可序列化的 JSON。
 */
const reference = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-defs.json'), 'utf8'),
) as { [group: string]: Record<string, { ae?: string }> } & {
  __AE_MAP: Record<string, Record<string, string>>
}

const note = (subs: number): string => `replaced ${subs}`

/** AE 面板只映射这六组；treat / bg / cam / trans 不进面板，def.ae 只作记录 */
const AE_GROUPS = ['layout', 'enter', 'hold', 'exit', 'decor', 'fx'] as const

describe('AE 映射表', () => {
  it('AE_MAP 与旧项目一致', () => {
    expect(AE_MAP).toEqual(reference.__AE_MAP)
  })

  it('每个部件自己声明的近亲（def.ae）都进了 PACK_AE', () => {
    const diffs: string[] = []
    for (const group of AE_GROUPS) {
      const table = reference[group] ?? {}
      for (const [key, def] of Object.entries(table)) {
        const theirs = typeof def.ae === 'string' ? def.ae : undefined
        const ours = PACK_AE[group]?.[key]
        if (theirs !== ours) diffs.push(`${group}.${key} ours=${ours} jizura=${theirs}`)
      }
    }
    expect(diffs).toEqual([])
  })
})

describe('planForAE', () => {
  const projectWith = (part = {}) => ({
    ...defaultProject(),
    lyrics: '风把夜色吹薄\n我在亮的地方等你',
    enabled: allEnabled(),
    extra: true,
    ...part,
  })

  it('核心部件原样导出，追加的构图换成面板里的近亲并保留原始 key', () => {
    const project = projectWith({ overrides: { 0: { layout: 'lowerThird' } } })
    const out = planForAE(buildPlan(project, null), project, note)
    const cuts = out.cuts as Record<string, unknown>[]
    const substituted = cuts.filter((c) => c.webLayout)
    expect(substituted.length).toBeGreaterThan(0)
    for (const c of substituted) {
      // 换过去的目标一定是面板实现过的核心件（AE_MAP 优先，其次部件自己声明的近亲）
      expect(CORE_LAYOUTS, String(c.layout)).toContain(c.layout as string)
      expect(c.params).toBeTruthy()
      expect(JSON.stringify(c.params)).not.toContain('undefined')
    }
    for (const c of cuts.filter((x) => !x.webLayout)) {
      expect(CORE_LAYOUTS, String(c.layout)).toContain(c.layout as string)
    }
  })

  it('非内置的画面效果换成面板支持的 8 种之一，内置的原样保留', () => {
    const project = projectWith()
    const plan = buildPlan(project, null)
    plan.events.push({ t: 0.4, type: 'crtOff', amp: 1, dur: 0.2 })
    plan.events.push({ t: 0.6, type: 'chroma', amp: 1, dur: 0.2 })
    const events = planForAE(plan, project, note).events as Record<string, unknown>[]
    const crt = events.find((e) => e.webType === 'crtOff')
    expect(crt?.type).toBe('flash')
    expect(events.some((e) => e.type === 'chroma' && !e.webType)).toBe(true)
  })

  it('导出能量曲线之外的东西：尺寸、字体标签与整张字体表', () => {
    const project = projectWith()
    const out = planForAE(buildPlan(project, null), project, note)
    expect(out.width).toBe(1920)
    expect(out.height).toBe(1080)
    expect(out.energy).toBeUndefined()
    const fonts = out.fonts as Record<string, string[]>
    expect(Object.keys(fonts).length).toBeGreaterThan(0)
    for (const list of Object.values(fonts))
      expect(list.every((l) => typeof l === 'string')).toBe(true)
    const table = out.fontTable as Record<string, { label: string; family: string }>
    expect(table.sans_black.label).toBeTruthy()
    expect(table.sans_black.family).not.toContain('"')
  })

  it('整份数据可序列化；换过件才写说明', () => {
    const project = projectWith()
    const plan = buildPlan(project, null)
    const out = planForAE(plan, project, note)
    const text = JSON.stringify(out, null, 1)
    expect(text).not.toMatch(/undefined|NaN/)
    expect((JSON.parse(text).cuts as unknown[]).length).toBe(plan.cuts.length)
    const webFields = (out.cuts as Record<string, unknown>[]).filter(
      (c) => c.webLayout || c.webEnter || c.webExit || c.webHold,
    ).length
    if (webFields > 0) expect(String(out.aeNote)).toMatch(/^replaced \d+$/)
    else expect(out.aeNote).toBeUndefined()
  })
})
