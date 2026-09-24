/**
 * 部件集合归属：哪些部件属于"首版之后就追加的"、哪些是"传统纹样"主题的。
 *
 * 与 JIZURA 的 11q_sets.js 同一套规则：包名不在首版清单里的即追加分；
 * 围绕传统器物/纹样（灯笼、暖帘、印章、青海波…）的部件单独一组开关。
 * 两个开关只约束"随机挑选"，逐行手工指定永远可用。
 */
import type { GroupKey, PartFlags, Project, StylePack } from './types'

/** 首版就有的包；其余包里的部件一律算追加分 */
export const BASE_PACKS: readonly (string | undefined)[] = [
  'core',
  undefined,
  'layoutsA',
  'layoutsB',
  'enter',
  'exitHold',
  'decor',
  'looks',
]

/** 首版的 12 套风格，其余为追加分 */
export const BASE_STYLES: readonly string[] = [
  'noir',
  'crimson',
  'caution',
  'magenta',
  'paper',
  'hud',
  'mint',
  'specimen',
  'transit',
  'blueprint',
  'rouge',
  'mono',
]

/** 传统纹样部件（JIZURA 的 和風 集合），style 一栏指风格包 */
export const TRADITIONAL: Partial<Record<GroupKey | 'style', readonly string[]>> = {
  layout: [
    'ema',
    'chochin',
    'noren',
    'tanzaku',
    'omikuji',
    'kakejiku',
    'shoji',
    'karuta',
    'origami',
    'postcard',
    'letterPaper',
    'genkou',
    'hanko',
  ],
  enter: ['fanOpen', 'brushReveal'],
  exit: ['fanClose'],
  decor: [
    'seal',
    'kamon',
    'seigaiha',
    'asanoha',
    'chochin',
    'shimenawa',
    'sensu',
    'tsukiKumo',
    'momiji',
    'namiGashira',
    'kasumi',
    'brushStroke',
    'petals',
  ],
  bg: ['seigaiha', 'asanoha'],
  treat: ['monoGrid'],
  style: ['sakura', 'sumi'],
}

/** 给合并后的注册表打上 追加分 / 传统纹样 标记 */
export function applySets(registries: Partial<Record<GroupKey, Record<string, PartFlags>>>): void {
  for (const group of Object.keys(registries) as GroupKey[]) {
    const defs = registries[group]
    if (!defs) continue
    for (const [key, def] of Object.entries(defs)) {
      if (!BASE_PACKS.includes(def.pack)) def.extra = true
      if (TRADITIONAL[group]?.includes(key)) def.traditional = true
    }
  }
}

export function markStyle(style: StylePack, key: string): void {
  if (!BASE_STYLES.includes(key)) style.extra = true
  if (TRADITIONAL.style?.includes(key)) style.traditional = true
}

/** 随机挑选是否可以使用这个部件 */
export function randomOk(project: Project, def: PartFlags | undefined): boolean {
  if (!def) return false
  if (def.extra && project.extra !== true) return false
  if (def.traditional && project.traditional === false) return false
  return true
}
