/**
 * 「一键随机」：抽一个情绪，再把风格、强度、部件白名单、字体、配色与种子一次性重掷，
 * 保证随机出来的东西内部自洽（而不是各滑块各自乱来）。
 *
 * 歌词、时间轴、输出参数与"已锁定"的行走自己的路，随机不碰。
 */
import type { FxSettings, GroupKey, Project } from './types'
import { MOOD_ORDER, MOODS, MOOD_TAGS, type MoodKey, type NumericFxKey } from './moods'
import { STYLES } from './styles'
import { FONTS } from './fonts'
import { GROUP_KEYS, isSpecial, orderOf, randomOk, styleRandomOk, taggedWith } from './registry'
import { randomPalette } from './util'

/** 每个分组至少留几个可用部件，否则 planner 没有变化空间 */
const MIN_ON: Partial<Record<GroupKey, number>> = {
  layout: 6,
  enter: 5,
  exit: 5,
  hold: 3,
  decor: 6,
  treat: 4,
  bg: 3,
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

const pickFrom = <T>(arr: readonly T[], rnd: () => number): T =>
  arr[Math.floor(rnd() * arr.length) % arr.length]

/** 重掷一份自洽的项目设置，返回新的 project */
export function omakase(project: Project, rnd: () => number = Math.random): Project {
  const moodCandidates = MOOD_ORDER.filter((k) => k !== project.mood)
  const mood = pickFrom(moodCandidates, rnd)
  const M = MOODS[mood]

  const okStyle = (k: string) => !!STYLES[k] && styleRandomOk(project, STYLES[k])
  const moodStyles = [
    ...new Set([
      ...(M.styles ?? []),
      ...Object.keys(STYLES).filter((k) => (STYLES[k].moods ?? []).includes(mood)),
    ]),
  ].filter(okStyle)
  let pool = (
    moodStyles.length && rnd() < 0.72 ? moodStyles : Object.keys(STYLES).filter(okStyle)
  ).filter((k) => k !== project.style)
  if (!pool.length) pool = Object.keys(STYLES).filter((k) => k !== project.style && okStyle(k))
  if (!pool.length) pool = Object.keys(STYLES).filter((k) => k !== project.style)
  const style = pickFrom(pool, rnd)

  const fx: FxSettings = { ...project.fx }
  for (const [k, range] of Object.entries(M.fx) as [NumericFxKey, readonly [number, number]][]) {
    const [lo, hi] = range
    fx[k] = Number((lo + (hi - lo) * rnd()).toFixed(2))
  }
  fx.koma = pickFrom(M.koma, rnd)
  fx.onTwos = fx.koma > 0
  fx.flash = rnd() < (M.flashChance ?? 0.65)
  fx.hud = (M.hudPick ? pickFrom(M.hudPick, rnd) : 'auto') as FxSettings['hud']

  const enabled: Project['enabled'] = {}
  for (const g of GROUP_KEYS) {
    const order = orderOf(g).filter((k) => !isSpecial(g, k) && randomOk(project, g, k))
    const hand =
      (g === 'layout' ? M.layout : g === 'enter' ? M.enter : g === 'exit' ? M.exit : null) ?? []
    const prefer =
      mood === 'chaos' ? null : new Set([...hand, ...order.filter((k) => suits(g, k, mood))])
    const map: Record<string, boolean> = {}
    for (const k of order) map[k] = prefer ? prefer.has(k) || rnd() < 0.22 : rnd() < 0.8
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
