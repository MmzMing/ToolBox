/**
 * 部件注册表：核心部件 + 表达式包合并成全量部件库。
 *
 * 合并顺序 = JIZURA 的文件名加载顺序（build.py 按名字排序拼接）。顺序不能改：
 * planner 的加权抽样与时间轴的构图配色都依赖 order 数组的下标，换序等于换种子。
 */
import type {
  AnimDef,
  BgDef,
  CamDef,
  DecorDef,
  FxDef,
  GroupKey,
  LayoutDef,
  PackParts,
  PartFlags,
  Project,
  StylePack,
  TreatDef,
  TransDef,
} from './types'
import { ENTER as ENTER_CORE, EXIT as EXIT_CORE, HOLD as HOLD_CORE } from './anim'
import { DECOR as DECOR_CORE, DECOR_ORDER as DECOR_CORE_ORDER } from './decor'
import { LAYOUTS as LAYOUTS_CORE } from './layouts'
import { applyMoodTags } from './moods'
import {
  BG as BG_CORE,
  CAMERA as CAMERA_CORE,
  FXE as FXE_CORE,
  TREAT as TREAT_CORE,
  TRANS as TRANS_CORE,
} from './parts'
import { pack as packBgcamB } from './packs/bgcam-b'
import { pack as packDecor } from './packs/decor'
import { pack as packDecorB } from './packs/decor-b'
import { pack as packEnter } from './packs/enter'
import { pack as packEnterB } from './packs/enter-b'
import { pack as packExit } from './packs/exit'
import { pack as packExitB } from './packs/exit-b'
import { pack as packFxB } from './packs/fx-b'
import { pack as packHorrorA } from './packs/horror-a'
import { pack as packHorrorB } from './packs/horror-b'
import { pack as packHorrorC } from './packs/horror-c'
import { pack as packKineticA } from './packs/kinetic-a'
import { pack as packKineticB } from './packs/kinetic-b'
import { pack as packKineticC } from './packs/kinetic-c'
import { pack as packLayoutsA } from './packs/layouts-a'
import { pack as packLayoutsB } from './packs/layouts-b'
import { pack as packLayoutsC } from './packs/layouts-c'
import { pack as packLayoutsD } from './packs/layouts-d'
import { pack as packLooks } from './packs/looks'
import { pack as packTreattrans } from './packs/treattrans'
import { pack as packTypoA } from './packs/typo-a'
import { pack as packTypoB } from './packs/typo-b'
import { pack as packTypoC } from './packs/typo-c'
import { applySets, randomOk as okBySet } from './sets'

/** 包名与合并顺序（与 JIZURA 的 11p_*.js 文件名排序一致） */
const PACKS: readonly (readonly [string, PackParts])[] = [
  ['bgcamB', packBgcamB],
  ['decor', packDecor],
  ['decorB', packDecorB],
  ['enter', packEnter],
  ['enterB', packEnterB],
  ['exitHold', packExit],
  ['exitB', packExitB],
  ['fxB', packFxB],
  // 三套带开关的集合：包名即集合名，sets.ts 据此写入 def.set；位置必须与JIZURA文件名序一致
  ['horror', packHorrorA],
  ['horror', packHorrorB],
  ['horror', packHorrorC],
  ['kinetic', packKineticA],
  ['kinetic', packKineticB],
  ['kinetic', packKineticC],
  ['layoutsA', packLayoutsA],
  ['layoutsB', packLayoutsB],
  ['layoutsC', packLayoutsC],
  ['layoutsD', packLayoutsD],
  ['looks', packLooks],
  ['treattrans', packTreattrans],
  ['typo', packTypoA],
  ['typo', packTypoB],
  ['typo', packTypoC],
]

function mergeGroup<T extends PartFlags>(
  core: Record<string, T>,
  pick: (pack: PackParts) => Record<string, T> | undefined,
): Record<string, T> {
  const out: Record<string, T> = { ...core }
  for (const [name, pack] of PACKS) {
    const defs = pick(pack)
    if (!defs) continue
    for (const [key, def] of Object.entries(defs)) {
      if (out[key]) console.warn(`部件 ${key} 在包 ${name} 中被重复注册，后定义的生效`)
      def.pack = name
      out[key] = def
    }
  }
  return out
}

export const LAYOUTS: Record<string, LayoutDef> = mergeGroup(LAYOUTS_CORE, (p) => p.layout)
export const ENTER: Record<string, AnimDef> = mergeGroup(ENTER_CORE, (p) => p.enter)
export const HOLD: Record<string, AnimDef> = mergeGroup(HOLD_CORE, (p) => p.hold)
export const EXIT: Record<string, AnimDef> = mergeGroup(EXIT_CORE, (p) => p.exit)
/**
 * 核心装饰必须按 decor.ts 声明的 DECOR_ORDER 排，不能按对象字面量的书写顺序：
 * planner 的加权抽样是顺序相关的（wpick 逐项累减权重），书写顺序不同就会抽出别的件。
 */
const DECOR_CORE_ORDERED: Record<string, DecorDef> = Object.fromEntries(
  [
    ...DECOR_CORE_ORDER,
    ...Object.keys(DECOR_CORE).filter((k) => !DECOR_CORE_ORDER.includes(k)),
  ].map((k) => [k, DECOR_CORE[k]]),
)
export const DECOR: Record<string, DecorDef> = mergeGroup(DECOR_CORE_ORDERED, (p) => p.decor)
export const TREAT: Record<string, TreatDef> = mergeGroup(TREAT_CORE, (p) => p.treat)
export const BG: Record<string, BgDef> = mergeGroup(BG_CORE, (p) => p.bg)
export const CAMERA: Record<string, CamDef> = mergeGroup(CAMERA_CORE, (p) => p.cam)
export const FXE: Record<string, FxDef> = mergeGroup(FXE_CORE, (p) => p.fx)
export const TRANS: Record<string, TransDef> = mergeGroup(TRANS_CORE, (p) => p.trans)

/** 顺序数组不含 special（title / interlude 由 planner 显式使用，不参与随机） */
const orderOfKeys = <T extends PartFlags & { special?: boolean }>(
  defs: Record<string, T>,
): string[] => Object.keys(defs).filter((k) => !defs[k].special)

export const LAYOUT_ORDER = orderOfKeys(LAYOUTS)
export const ENTER_ORDER = orderOfKeys(ENTER)
export const HOLD_ORDER = orderOfKeys(HOLD)
export const EXIT_ORDER = orderOfKeys(EXIT)
export const DECOR_ORDER = orderOfKeys(DECOR)
export const TREAT_ORDER = orderOfKeys(TREAT)
export const BG_ORDER = orderOfKeys(BG)
export const CAMERA_ORDER = orderOfKeys(CAMERA)
export const FXE_ORDER = orderOfKeys(FXE)
export const TRANS_ORDER = orderOfKeys(TRANS)

applyMoodTags({
  layout: LAYOUTS,
  enter: ENTER,
  exit: EXIT,
  hold: HOLD,
  decor: DECOR,
})

applySets({
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
})

export const GROUP_KEYS: readonly GroupKey[] = [
  'layout',
  'enter',
  'hold',
  'exit',
  'decor',
  'treat',
  'bg',
  'cam',
  'fx',
  'trans',
]

/** 跨组都可读的几个字段，供枚举与抽样使用 */
export type PartDef = PartFlags & { tags?: string[]; w?: number; special?: boolean }

const DEFS: Record<GroupKey, Record<string, PartDef>> = {
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

const ORDERS: Record<GroupKey, readonly string[]> = {
  layout: LAYOUT_ORDER,
  enter: ENTER_ORDER,
  hold: HOLD_ORDER,
  exit: EXIT_ORDER,
  decor: DECOR_ORDER,
  treat: TREAT_ORDER,
  bg: BG_ORDER,
  cam: CAMERA_ORDER,
  fx: FXE_ORDER,
  trans: TRANS_ORDER,
}

export function orderOf(group: GroupKey): readonly string[] {
  return ORDERS[group]
}

export function defOf(group: GroupKey, key: string): PartDef | undefined {
  return DEFS[group][key]
}

/** 某个情绪标签下可用的部件 key（omakase 抽样用） */
export function taggedWith(group: GroupKey, mood: string): string[] {
  return orderOf(group).filter((k) => defOf(group, k)?.tags?.includes(mood))
}

/** 特殊部件（title / interlude）不参与随机挑选 */
export function isSpecial(group: GroupKey, key: string): boolean {
  return defOf(group, key)?.special === true
}

/** 随机挑选是否可以使用该部件（受"追加部件""传统纹样"两个开关约束） */
export function randomOk(project: Project, group: GroupKey, key: string): boolean {
  return okBySet(project, DEFS[group][key])
}

/** 风格包是否可用于随机 */
export function styleRandomOk(project: Project, style: StylePack | undefined): boolean {
  return okBySet(project, style)
}

/** 全开的 enabled 表 */
export function allEnabled(): Partial<Record<GroupKey, Record<string, boolean>>> {
  const out: Partial<Record<GroupKey, Record<string, boolean>>> = {}
  for (const g of GROUP_KEYS) {
    const map: Record<string, boolean> = {}
    for (const k of orderOf(g)) map[k] = true
    out[g] = map
  }
  return out
}

/** 样式是否声明了自己的情绪归属（omakase 会优先取同情绪的样式） */
export function stylesForMood(style: StylePack, mood: string): boolean {
  return (style.moods ?? []).includes(mood)
}
