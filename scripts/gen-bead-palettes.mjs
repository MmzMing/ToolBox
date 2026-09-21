#!/usr/bin/env node
// 从 BeadColors 上游仓库的 gen/v3 CSV 生成站内拼豆色卡模块（新增品牌或同步色号更新时重跑）。
// 用法: node scripts/gen-bead-palettes.mjs --source <BeadColors 仓库本地目录>
// 例:   node scripts/gen-bead-palettes.mjs --source ../tools-pic-bead/beadcolors
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'src/tools/images/image-to-beads/palettes')

/** 上游 v3 列序：ref,name,symbol,r,g,b,hsl_h,hsl_s,hsl_l,lab_l,lab_a,lab_b,contributor */
const V3_COLUMNS = 13

/** 只收拼豆（Melty Bead），排除钻石画 diamondDotz 与站内用不到的系列 */
const BRANDS = [
  { key: 'hama', file: 'hama', label: 'Hama Midi', beadSizeMm: 2.6 },
  { key: 'perler', file: 'perler', label: 'Perler', beadSizeMm: 2.6 },
  { key: 'artkal-a', file: 'artkal_a', label: 'Artkal A', beadSizeMm: 2.6 },
  { key: 'artkal-c', file: 'artkal_c', label: 'Artkal C', beadSizeMm: 2.6 },
  { key: 'artkal-s', file: 'artkal_s', label: 'Artkal S', beadSizeMm: 5 },
  { key: 'mard', file: 'mard', label: 'Mard', beadSizeMm: 2.6 },
  { key: 'yant', file: 'yant', label: 'Yant', beadSizeMm: 2.6 },
]

const argIndex = process.argv.indexOf('--source')
const sourceArg = process.argv[argIndex + 1]
if (argIndex < 0 || !sourceArg) {
  console.error('用法: node scripts/gen-bead-palettes.mjs --source <BeadColors 仓库本地目录>')
  process.exit(1)
}

const sourceDir = path.resolve(root, sourceArg)
const v3Dir = path.join(sourceDir, 'gen/v3')
if (!existsSync(v3Dir)) {
  console.error(`找不到上游 v3 目录: ${v3Dir}`)
  process.exit(1)
}

function upstreamCommit() {
  try {
    return execFileSync('git', ['-C', sourceDir, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

const commit = upstreamCommit()
const generatedAt = new Date().toISOString().slice(0, 10)

function parseBrand(brand) {
  const file = path.join(v3Dir, `${brand.file}.csv`)
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')

  return lines.map((line, index) => {
    const columns = line.split(',')
    if (columns.length !== V3_COLUMNS) {
      throw new Error(
        `${brand.file}.csv 第 ${index + 1} 行有 ${columns.length} 列，期望 ${V3_COLUMNS}`,
      )
    }
    const [ref, name, , r, g, b] = columns
    const rgb = [Number(r), Number(g), Number(b)]
    if (rgb.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
      throw new Error(`${brand.file} ${ref}: RGB 越界 ${rgb.join(',')}`)
    }
    return { ref, name, rgb }
  })
}

const quote = (value) => `'${value.replaceAll(`'`, `\\'`)}'`

function renderColors(brand, colors) {
  const body = colors
    .map(
      (color) =>
        `  { ref: ${quote(color.ref)}, name: ${quote(color.name)}, rgb: [${color.rgb.join(', ')}] },`,
    )
    .join('\n')

  return `/**
 * ${brand.label}（${brand.beadSizeMm} mm）拼豆色卡 —— 由 scripts/gen-bead-palettes.mjs 生成，请勿手工编辑。
 *
 * 来源: BeadColors https://github.com/maxcleme/beadcolors （MIT License, Copyright (c) 2020 maxcleme）
 * 上游文件: gen/v3/${brand.file}.csv （commit ${commit}，生成于 ${generatedAt}）
 * 只取色号 / 色名 / RGB：上游的 lab 列由 Go 脚本算出，其 \`16 / 116\` 是整数常量除法（结果为 0），
 * 深色会得到 L* = -16，故站内改用 rgbToLab 现算（见 palettes/index.ts）。
 */
import type { BeadSwatch } from '../image-to-beads.service'

export const COLORS: readonly BeadSwatch[] = [
${body}
]
`
}

function renderRegistry(entries) {
  const rows = entries
    .map(
      ({ brand, count }) =>
        `  {\n    key: ${quote(brand.key)},\n    label: ${quote(brand.label)},\n    beadSizeMm: ${brand.beadSizeMm},\n    colorCount: ${count},\n    load: () => import('./${brand.key}'),\n  },`,
    )
    .join('\n')

  return `/**
 * 拼豆色卡注册表 —— 由 scripts/gen-bead-palettes.mjs 生成，请勿手工编辑。
 * 数据许可与来源见各品牌模块文件头。
 */
import { rgbToLab, type BeadColor, type BeadSwatch } from '../image-to-beads.service'

type BrandModule = { COLORS: readonly BeadSwatch[] }

export type BeadBrandEntry = {
  key: string
  label: string
  beadSizeMm: number
  colorCount: number
  load: () => Promise<BrandModule>
}

export const BEAD_BRANDS: readonly BeadBrandEntry[] = [
${rows}
]

/** 按品牌 key 取色卡（懒加载对应模块，避免 1100+ 条数据进主 chunk），Lab 在此现算 */
export async function loadBrandColors(key: string): Promise<readonly BeadColor[]> {
  const brand = BEAD_BRANDS.find((item) => item.key === key)
  if (!brand) {
    throw new Error(\`Unknown bead brand: \${key}\`)
  }
  const { COLORS } = await brand.load()
  return COLORS.map((swatch) => ({ ...swatch, lab: rgbToLab(swatch.rgb) }))
}
`
}

mkdirSync(outDir, { recursive: true })

const entries = []
for (const brand of BRANDS) {
  const colors = parseBrand(brand)
  writeFileSync(path.join(outDir, `${brand.key}.ts`), renderColors(brand, colors), 'utf8')
  entries.push({ brand, count: colors.length })
  console.log(`✔ ${brand.key}: ${colors.length} 色`)
}

writeFileSync(path.join(outDir, 'index.ts'), renderRegistry(entries), 'utf8')
console.log(
  `✔ palettes/index.ts（${entries.length} 个品牌，共 ${entries.reduce((sum, item) => sum + item.count, 0)} 色，commit ${commit}）`,
)
