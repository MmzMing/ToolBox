/**
 * 逐件比对部件的标量字段：权重、情绪标签、层级、时长与各种调参开关，
 * 必须和 JIZURA 运行期注册表里的定义一模一样。
 *
 * key 对得上不代表部件对得上：`w` 被改掉会让抽样偏向另一件，
 * `layer` 反了会让装饰跑到字前面，`pieces` 丢了碎片动效就不触发。
 * 夹具 __fixtures__/jizura-defs.json 由脚本在 node 里跑旧源码导出（见 D:/tmp/dump-defs.mjs）。
 *
 * 故意不比的字段：
 *   name        → 界面文案走 i18n（另有测试保证 707 件都有双语名）
 *   ae          → 只被 AE 导出使用，放在 engine/ae-export.ts 的映射表里，另有测试
 *   extra/traditional → 本仓库的集合门控标记，由 sets.ts 推导
 *   函数类字段（fits/plan/render/apply/draw/get…）→ 无法序列化，由渲染冒烟测试覆盖
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BG,
  CAMERA,
  DECOR,
  ENTER,
  EXIT,
  FXE,
  HOLD,
  LAYOUTS,
  TRANS,
  TREAT,
} from '@/tools/video/music-to-video/engine/registry'

const SKIP = new Set(['name', 'ae', 'extra', 'traditional', 'wa'])

const reference = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-defs.json'), 'utf8'),
) as Record<string, Record<string, Record<string, unknown>>>

const TABLES: Record<string, Record<string, object>> = {
  layout: LAYOUTS,
  enter: ENTER,
  hold: HOLD,
  exit: EXIT,
  decor: DECOR,
  treat: TREAT,
  bg: BG,
  cam: CAMERA,
  fx: FXE,
  trans: TRANS,
}

const comparable = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k) || typeof v === 'function') continue
    out[k] = v
  }
  return out
}

describe('部件字段与 JIZURA 逐件对账', () => {
  for (const [group, table] of Object.entries(TABLES)) {
    const ref = reference[group] ?? {}

    it(`${group}：${Object.keys(ref).length} 件的标量字段全部一致`, () => {
      const diffs: string[] = []
      for (const [key, theirs] of Object.entries(ref)) {
        const ours = table[key]
        if (!ours) {
          diffs.push(`${group}.${key} 未移植`)
          continue
        }
        const a = comparable(ours as Record<string, unknown>)
        const b = comparable(theirs)
        for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const av = a[field]
          const bv = b[field]
          if (av === bv) continue
          if (JSON.stringify(av) === JSON.stringify(bv)) continue
          diffs.push(
            `${group}.${key}.${field}  ours=${JSON.stringify(av)} jizura=${JSON.stringify(bv)}`,
          )
        }
      }
      fs.writeFileSync(`D:/tmp/fields-diff-${group}.txt`, diffs.join('\n'))
      expect(
        diffs,
        `共 ${diffs.length} 处不一致（清单见 D:/tmp/fields-diff-${group}.txt）`,
      ).toEqual([])
    })
  }

  it('传统纹样标记与旧项目的 wa 字段一一对应', () => {
    const diffs: string[] = []
    for (const [group, table] of Object.entries(TABLES)) {
      for (const [key, theirs] of Object.entries(reference[group] ?? {})) {
        const ours = table[key] as { traditional?: boolean } | undefined
        if (!ours) continue
        if (Boolean(ours.traditional) !== Boolean(theirs.wa)) diffs.push(`${group}.${key}`)
      }
    }
    expect(diffs).toEqual([])
  })
})
