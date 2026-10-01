/**
 * 部件集合归属：哪些部件属于"首版之后就追加的"、哪些是"传统纹样"主题的，
 * 以及三套带独立开关的集合（文字PV系 typo、キネティック kinetic、恐怖 horror）。
 *
 * 与 JIZURA 的 11q_sets.js 同一套规则：包名不在首版清单里的即追加分；
 * 围绕传统器物/纹样（灯笼、暖帘、印章、青海波…）的部件单独一组开关；
 * 包名与集合同名的（horror / typo / kinetic）整包算该集合，且不再算追加分。
 * 这些规则只约束"随机挑选"，逐行手工指定永远可用。
 */
import type { GroupKey, PartFlags, PartSet, Project, StylePack } from './types'

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

/** 带独立开关的部件集合（包名即集合名）；`on` = JIZURA里的默认开关状态 */
export const SETS: Record<PartSet, { on: boolean }> = {
  horror: { on: false },
  typo: { on: true },
  kinetic: { on: true },
}

export const SET_ORDER: readonly PartSet[] = ['horror', 'typo', 'kinetic']

/** 只读集合开关本身（界面与引擎都只需要这几个布尔位） */
export type SetFlags = Partial<Record<PartSet, boolean>>

/** 该集合在当前工程里是否打开；老工程没有这个字段时回落到默认值 */
export function setOn(project: SetFlags | null | undefined, set: PartSet): boolean {
  const v = project ? project[set] : undefined
  return typeof v === 'boolean' ? v : SETS[set].on
}

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

/** 给合并后的注册表打上 集合 / 追加分 / 传统纹样 标记 */
export function applySets(registries: Partial<Record<GroupKey, Record<string, PartFlags>>>): void {
  for (const group of Object.keys(registries) as GroupKey[]) {
    const defs = registries[group]
    if (!defs) continue
    for (const [key, def] of Object.entries(defs)) {
      // 先认集合：包名即集合名的整包算该集合
      if (!def.set && def.pack && def.pack in SETS) def.set = def.pack as PartSet
      // 集合内的部件有自己的开关，不再受"追加部件"开关约束（与JIZURA一致）
      if (!def.set && !BASE_PACKS.includes(def.pack)) def.extra = true
      if (TRADITIONAL[group]?.includes(key)) def.traditional = true
    }
  }
}

export function markStyle(style: StylePack, key: string): void {
  if (!BASE_STYLES.includes(key) && !style.set) style.extra = true
  if (TRADITIONAL.style?.includes(key)) style.traditional = true
}

/** 随机挑选是否可以使用这个部件 */
export function randomOk(project: Project, def: PartFlags | undefined): boolean {
  if (!def) return false
  if (def.extra && project.extra !== true) return false
  if (def.traditional && project.traditional === false) return false
  if (def.set && !setOn(project, def.set)) return false
  return true
}
