/**
 * 「一键随机」：抽一个情绪，再把风格、强度、部件白名单、字体、配色与种子一次性重掷，
 * 保证随机出来的东西内部自洽（而不是各滑块各自乱来）。
 *
 * 歌词、时间轴、输出参数与"已锁定"的行走自己的路，随机不碰。
 *
 * 与 JIZURA 的 08b_omakase.js 逐条对齐：随机数的消耗次数与顺序都不能变，
 * 否则同一个 seed 会抽出完全不同的结果。这里的分支写法刻意与JIZURA一一对应。
 */
import type { FxSettings, GroupKey, PartFlags, PartSet, Project } from './types'
import { MOOD_ORDER, MOODS, MOOD_TAGS, type MoodKey, type NumericFxKey } from './moods'
import { STYLES, STYLE_ORDER } from './styles'
import { FONTS } from './fonts'
import {
  GROUP_KEYS,
  defOf,
  isSpecial,
  orderOf,
  randomOk,
  styleRandomOk,
  taggedWith,
} from './registry'
import { setOn } from './sets'
import { randomPalette } from './util'

/** 取某分组下某部件的定义（集合 / 追加分标记都挂在上面） */
const partOf = (group: GroupKey, key: string): PartFlags | undefined => defOf(group, key)

/** 每个分组至少留几个可用部件，否则 planner 没有变化空间 */
const MIN_ON: Partial<Record<GroupKey, number>> = {
  layout: 6,
  enter: 5,
  exit: 5,
  hold: 3,
  decor: 6,
  treat: 4,
  bg: 4,
  cam: 3,
  fx: 4,
  trans: 3,
}

/** 部件是否命中该情绪：优先看定义里的 tags，再看 hold/decor 的集中标签表 */
function suits(group: GroupKey, key: string, mood: MoodKey): boolean {
  if (taggedWith(group, mood).includes(key)) return true
  const table = MOOD_TAGS as Record<string, Record<string, MoodKey[]>>
  return (table[group]?.[key] ?? []).includes(mood)
}

/** 抽到的情绪是否允许用这一件：绑定了集合的部件只在对应情绪里出现（恐怖） */
function moodSetOk(def: PartFlags | undefined, M: { set?: PartSet }): boolean {
  if (!def?.set) return true
  const tied = Object.values(MOODS).some((m) => m.set === def.set)
  return !tied || M.set === def.set
}

const pickFrom = <T>(arr: readonly T[], rnd: () => number): T =>
  arr[Math.floor(rnd() * arr.length) % arr.length]

/**
 * 主题：把一键随机限定在一个方向里。
 * 主题会打开它需要的部件集合开关（随结果一起返回），并让该集合的部件保持可选。
 */
export type ThemeId = 'lyricpv' | 'kinetic' | 'wa' | 'horror' | 'pop' | 'ballad'

export const THEMES: Record<
  ThemeId,
  { moods: MoodKey[]; set?: PartSet; wa?: boolean; koma?: number[] }
> = {
  lyricpv: { moods: ['editorial', 'graphic', 'emotional'], set: 'typo' },
  kinetic: { moods: ['pop', 'graphic', 'glitch'], set: 'kinetic' },
  wa: { moods: ['calm', 'emotional', 'editorial'], wa: true },
  horror: { moods: ['horror'], set: 'horror' },
  pop: { moods: ['pop'] },
  ballad: { moods: ['calm', 'emotional'], koma: [0, 0, 12] },
}

export const THEME_ORDER: ThemeId[] = ['lyricpv', 'kinetic', 'wa', 'horror', 'pop', 'ballad']

/** 重掷一份自洽的项目设置，返回新的 project */
export function omakase(
  project: Project,
  rnd: () => number = Math.random,
  themeId: ThemeId | null = null,
): Project {
  const T = themeId && THEMES[themeId] ? THEMES[themeId] : null
  const switches: Partial<Record<PartSet | 'traditional' | 'extra', boolean>> = {}
  if (T?.set) switches[T.set] = true
  // 和風部件大多属于追加分，主题要一起打开
  if (T?.wa) {
    switches.traditional = true
    switches.extra = true
  }
  const base = T ? { ...project, ...switches } : project

  const themePart = (def: PartFlags | undefined): boolean =>
    Boolean(T && def && ((T.set && def.set === T.set) || (T.wa && def.traditional)))

  /** 该情绪所属集合的开关是否允许它出现 */
  const moodOk = (k: MoodKey): boolean => {
    const set = MOODS[k].set
    return !set || setOn(base, set)
  }

  let moods = MOOD_ORDER.filter((k) => k !== project.mood && moodOk(k))
  if (T) {
    const tm = T.moods.filter((k) => moodOk(k))
    moods = tm.filter((k) => k !== project.mood)
    if (!moods.length) moods = tm.length ? tm : MOOD_ORDER.filter(moodOk)
  }
  // 打开恐怖开关时，一键随机有一半多的概率落到恐怖情绪（可以连着抽到同一套）
  const mood =
    !T && moodOk('horror') && rnd() < 0.55
      ? 'horror'
      : pickFrom(moods.length ? moods : MOOD_ORDER.filter(moodOk), rnd)
  const M = MOODS[mood]

  // 风格：多数取适配情绪的，偶尔任意；不允许与上一套重复
  const okStyle = (k: string) =>
    Boolean(STYLES[k]) && styleRandomOk(base, STYLES[k]) && moodSetOk(STYLES[k], M)
  const moodStyles = [
    ...new Set([
      ...(M.styles ?? []),
      ...STYLE_ORDER.filter((k) => (STYLES[k]?.moods ?? []).includes(mood)),
    ]),
  ].filter(okStyle)
  let pool = (moodStyles.length && rnd() < 0.72 ? moodStyles : STYLE_ORDER.filter(okStyle)).filter(
    (k) => k !== project.style,
  )
  if (T) {
    const ts = STYLE_ORDER.filter((k) => okStyle(k) && themePart(STYLES[k]) && k !== project.style)
    if (ts.length && rnd() < 0.8) pool = ts
  }
  if (!pool.length) pool = STYLE_ORDER.filter((k) => k !== project.style && okStyle(k))
  if (!pool.length) pool = STYLE_ORDER.filter((k) => k !== project.style)
  const style = pickFrom(pool, rnd)

  const fx: FxSettings = { ...project.fx }
  for (const [k, range] of Object.entries(M.fx) as [NumericFxKey, readonly [number, number]][]) {
    const [lo, hi] = range
    fx[k] = Number((lo + (hi - lo) * rnd()).toFixed(2))
  }
  fx.koma = pickFrom(T?.koma ?? M.koma, rnd)
  fx.onTwos = fx.koma > 0
  fx.flash = rnd() < (M.flashChance ?? 0.65)
  fx.hud = (M.hudPick ? pickFrom(M.hudPick, rnd) : 'auto') as FxSettings['hud']

  const enabled: Project['enabled'] = {}
  const sprinkle = M.sprinkle ?? 0.22
  for (const g of GROUP_KEYS) {
    const order = orderOf(g).filter(
      (k) => !isSpecial(g, k) && randomOk(base, g, k) && moodSetOk(partOf(g, k), M),
    )
    const hand =
      (g === 'layout' ? M.layout : g === 'enter' ? M.enter : g === 'exit' ? M.exit : null) ?? []
    const prefer =
      mood === 'chaos' ? null : new Set([...hand, ...order.filter((k) => suits(g, k, mood))])
    // 主题自己的部件保持可选
    if (prefer && T) for (const k of order) if (themePart(partOf(g, k))) prefer.add(k)
    const map: Record<string, boolean> = {}
    // 属于别的情绪的集合部件显式关掉（缺 key 会被当成"开"）
    for (const k of orderOf(g)) if (!moodSetOk(partOf(g, k), M)) map[k] = false
    for (const k of order) map[k] = prefer ? prefer.has(k) || rnd() < sprinkle : rnd() < 0.8
    const offs = order.filter((k) => !map[k])
    let n = order.length - offs.length
    const min = Math.min(MIN_ON[g] ?? 3, order.length)
    while (n < min && offs.length) {
      const k = offs.splice(Math.floor(rnd() * offs.length), 1)[0]
      map[k] = true
      n += 1
    }
    enabled[g] = map
  }
  if (enabled.enter) enabled.enter.cut = true
  if (enabled.exit) enabled.exit.cut = true
  if (enabled.treat) enabled.treat.none = true
  if (enabled.bg) enabled.bg.none = true
  if (enabled.cam) enabled.cam.push = true
  for (const k of M.noHold ?? []) if (enabled.hold && k in enabled.hold) enabled.hold[k] = false
  if (enabled.hold) enabled.hold.still = true

  const fonts: Project['fonts'] = {}
  const faces = Object.entries(FONTS).filter(([, f]) => !['mono', 'pixel'].includes(f.kind))
  if (rnd() < 0.4) {
    const heavy = faces.filter(
      ([, f]) => f.weight >= 700 || f.kind === 'display' || f.kind === 'round',
    )
    if (heavy.length) fonts.display = pickFrom(heavy, rnd)[0]
  }
  if (rnd() < 0.3) {
    const serifs = faces.filter(([, f]) => f.kind === 'serif' || f.kind === 'brush')
    if (serifs.length) fonts.serif = pickFrom(serifs, rnd)[0]
  }
  if (mood === 'chaos' && rnd() < 0.2) fonts.display = 'pixel'

  const colors = { ...project.colors, enabled: false, accentOn: false }
  if (rnd() < 0.38) {
    const bg = STYLES[style].schemes[0].bg
    Object.assign(colors, randomPalette(bg, rnd), { accentOn: true })
  }

  const overrides: Project['overrides'] = {}
  for (const [i, o] of Object.entries(project.overrides)) if (o.lock) overrides[Number(i)] = o

  return {
    ...project,
    ...switches,
    mood,
    style,
    fx,
    enabled,
    fonts,
    colors,
    overrides,
    seed: Math.floor(rnd() * 1e9),
  }
}
