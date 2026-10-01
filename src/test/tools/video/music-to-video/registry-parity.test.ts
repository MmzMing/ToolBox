/**
 * 与旧项目的 1:1 对账：每个分组的部件 key 集合必须与 JIZURA 的注册表完全一致。
 * 这份期望清单由脚本从 JIZURA 源码运行期导出（window.J 的注册结果），不是手写的。
 * 少一件 = 移植漏了；多一件 = key 改名了。两种都会让风格偏置/情绪白名单失效。
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ENTER,
  EXIT,
  HOLD,
  LAYOUTS,
  DECOR,
  TREAT,
  BG,
  CAMERA,
  FXE,
  TRANS,
  LAYOUT_ORDER,
  ENTER_ORDER,
  HOLD_ORDER,
  EXIT_ORDER,
  DECOR_ORDER,
  TREAT_ORDER,
  BG_ORDER,
  CAMERA_ORDER,
  FXE_ORDER,
  TRANS_ORDER,
} from '@/tools/video/music-to-video/engine/registry'

/** JIZURA 各分组在运行期注册表里的全部 key（不含 special 的 title / interlude 会单列） */
/**
 * 期望清单直接读夹具（由 scripts/gen-jizura-fixtures.mjs 从旧项目运行期注册表导出）。
 * 以前这里是手抄的一份数组，漏移植 153 件也照样全绿 —— 夹具驱动后这种盲区不会再出现。
 */
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-parts.json'), 'utf8'),
) as Record<string, { key: string }[]>

const EXPECTED: Record<string, string[]> = Object.fromEntries(
  Object.entries(FIXTURE).map(([group, list]) => [group, list.map((x) => x.key)]),
)

const ACTUAL: Record<string, string[]> = {
  layout: [...LAYOUT_ORDER],
  enter: [...ENTER_ORDER],
  hold: [...HOLD_ORDER],
  exit: [...EXIT_ORDER],
  decor: [...DECOR_ORDER],
  treat: [...TREAT_ORDER],
  bg: [...BG_ORDER],
  cam: [...CAMERA_ORDER],
  fx: [...FXE_ORDER],
  trans: [...TRANS_ORDER],
}

const SPECIAL = ['title', 'interlude']

describe('部件库与 JIZURA 对账', () => {
  it.each(Object.keys(EXPECTED))('%s 分组的 key 集合完全一致', (group) => {
    // 夹具来自 J.order(g)：里面本来就没有 title / interlude 这类 special 件
    expect(ACTUAL[group].filter((k) => !EXPECTED[group].includes(k))).toEqual([])
    expect(EXPECTED[group].filter((k) => !ACTUAL[group].includes(k))).toEqual([])
  })

  it.each(Object.keys(EXPECTED))('%s 分组的顺序逐位一致', (group) => {
    // 光比对 key 集合不够：planner 的加权抽样是顺序相关的（wpick 逐项累减权重），
    // 同一批件换个顺序就会抽出别的部件，画面整体跑偏。
    expect(ACTUAL[group]).toEqual(EXPECTED[group])
  })

  it('总件数与旧项目一致（860 件可随机挑选）', () => {
    expect(Object.values(ACTUAL).reduce((a, v) => a + v.length, 0)).toBe(860)
    expect(Object.values(EXPECTED).reduce((a, v) => a + v.length, 0)).toBe(860)
    for (const [group, keys] of Object.entries(ACTUAL)) {
      for (const s of SPECIAL) expect(keys, `${group} 的随机序列里不该出现 ${s}`).not.toContain(s)
    }
    expect(LAYOUTS.title.special).toBe(true)
    expect(LAYOUTS.interlude.special).toBe(true)
  })

  it('每个部件定义都真的存在（没有只进 order 的空壳）', () => {
    const defs = {
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
    for (const [group, table] of Object.entries(defs)) {
      for (const key of ACTUAL[group]) {
        expect(table[key], group + '.' + key).toBeTruthy()
      }
    }
  })
})
