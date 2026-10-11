import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const src = process.argv[2]
const out = process.argv[3]

global.window = {}
require(src)
const G = global.window.GROK_GEO

const n = (v) => Number(v.toFixed(1))

const shapes = G.eyes.map((pair) =>
  pair
    .flat()
    .map(([x, y]) => [n(x), n(y)])
    .flat(),
)

const rows = shapes.map((flat, i) => {
  const body = []
  for (let j = 0; j < flat.length; j += 8) {
    body.push('  ' + flat.slice(j, j + 8).join(', '))
  }
  return `  // ${i}\n  [\n${body.join(',\n')},\n  ],`
})

const file = `/**
 * 25 组眼睛多边形，取自 Grok Bot 角色的几何数据（仅供学习参考，版权归 xAI 所有）。
 *
 * 每组是「左眼 48 点 + 右眼 48 点」摊平成一个 192 长的数组：前 96 个是左眼，后 96 个是右眼，
 * 每两点为一组 (x, y)。坐标活在 ${G.viewBox.width} 见方的 viewBox 里，球心 ${G.Re}。
 * 定点数保留 1 位小数——一个单位在这个尺度上不到 1px，0.1 的精度肉眼不可见，
 * 但能让这份数据少掉三分之一体积。
 *
 * 由 scripts/gen-orb-eyes.mjs 生成，请勿手改；要换数据就改源再重跑。
 */

/** viewBox 边长，与源数据同一尺度 */
export const ORB_EYE_VIEW = ${G.viewBox.width}
/** 球心（源 Re）：眼睛位置与注视偏移都以它为原点 */
export const ORB_EYE_CENTER = ${G.Re}
/** 眼睛基准半高（源 G9e）：算「贴边夹取」时的余量 */
export const ORB_EYE_HALF = ${G.G9e}
/** 双眼共用一套几何时，左眼额外让开的间距（源 VJt） */
export const ORB_EYE_GAP = ${G.VJt}
/** 每组左右眼各多少个点 */
export const ORB_EYE_POINTS = ${G.eyes[0][0].length}

/** 25 组眼形，索引与 ORB_EYE_STATES 的播放列表对应 */
export const ORB_EYE_SHAPES = [
${rows.join('\n')}
] as const
`

writeFileSync(out, file, 'utf8')
console.log('shapes:', shapes.length, 'floats/shape:', shapes[0].length, 'bytes:', file.length)
