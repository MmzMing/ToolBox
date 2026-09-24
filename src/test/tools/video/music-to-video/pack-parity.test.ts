/**
 * 逐个表达式包对账：每个 pack 模块单独和旧项目的注册清单比 key。
 *
 * registry-parity.test.ts 看的是合并后的总量，任何一件缺失都会让整个套件崩掉；
 * 这里绕过 registry 直接 import 单个包，于是一处没写完只会红一条，
 * 便于并行移植时定位到底缺哪几件。
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/** pack 文件名 → 旧项目里的包名（registry.ts 的合并顺序也用它标识来源） */
const PACK_FILES: Record<string, string> = {
  'bgcam-b': 'bgcamB',
  decor: 'decor',
  'decor-b': 'decorB',
  enter: 'enter',
  'enter-b': 'enterB',
  exit: 'exitHold',
  'exit-b': 'exitB',
  'fx-b': 'fxB',
  'layouts-a': 'layoutsA',
  'layouts-b': 'layoutsB',
  'layouts-c': 'layoutsC',
  'layouts-d': 'layoutsD',
  looks: 'looks',
  treattrans: 'treattrans',
}

const reference = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '__fixtures__/jizura-parts.json'), 'utf8'),
) as Record<string, { key: string; pack: string | null }[]>

const PACK_DIR = '@/tools/video/music-to-video/engine/packs/'

describe('表达式包逐个与 JIZURA 对账', () => {
  for (const [file, packName] of Object.entries(PACK_FILES)) {
    const expected: Record<string, string[]> = {}
    for (const [group, list] of Object.entries(reference)) {
      const keys = list.filter((x) => x.pack === packName).map((x) => x.key)
      if (keys.length) expected[group] = keys
    }

    it(`${packName}：${Object.values(expected).reduce((a, v) => a + v.length, 0)} 件齐全`, async () => {
      const module = (await import(/* @vite-ignore */ PACK_DIR + file)) as {
        pack?: Record<string, Record<string, unknown>>
      }
      expect(module.pack, `${file}.ts 没有导出 pack`).toBeTruthy()
      for (const [group, keys] of Object.entries(expected)) {
        const got = Object.keys(module.pack?.[group] ?? {})
        expect(got, `${packName}.${group} 的 key 集合或顺序不对`).toEqual(keys)
      }
    })
  }
})
