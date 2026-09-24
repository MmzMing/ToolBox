/**
 * 「一键随机」情绪表：一次随机先抽 mood，再由 mood 决定强度区间、可用的部件白名单与风格包候选。
 *
 * 只搬数据，不搬抽样逻辑（随机的执行在 planner）。fx 里列出的才是会被重掷的滑块，
 * koma / flashChance / hudPick 是 JIZURA 写死在 omakase() 里的按 mood 候选，挪到这里当数据。
 * layout / enter / exit 为 null 表示该 mood 不设限（chaos）。
 *
 * 部件的 mood 标签：layout/enter/exit 直接由本表的白名单派生；hold/decor 见 MOOD_TAGS；
 * treat/bg/cam/fx/trans 的标签写在各部件定义里（parts.ts）。
 */
import type { FxSettings, GroupKey } from './types'

export type MoodKey = 'glitch' | 'calm' | 'pop' | 'graphic' | 'editorial' | 'emotional' | 'chaos'

/** FxSettings 中取值为 number 的强度项（koma 虽在列，但按 mood 单独抽候选） */
export type NumericFxKey = {
  [K in keyof FxSettings]: FxSettings[K] extends number ? K : never
}[keyof FxSettings]

/** 强度滑块的抽样区间 [下限, 上限] */
export type MoodFx = Partial<Record<NumericFxKey, readonly [number, number]>>

export type Mood = {
  fx: MoodFx
  layout: string[] | null
  enter: string[] | null
  exit: string[] | null
  /** 适配的风格包 key；null = 任意 */
  styles: string[] | null
  /** 该 mood 要关掉的 hold 部件 */
  noHold?: string[]
  /** 每秒绘制的帧格数候选（12 ≈ 拍二，0 = 逐输出帧） */
  koma: number[]
  /** 抽中闪白的概率 */
  flashChance?: number
  /** HUD 开关候选（重复项即权重） */
  hudPick?: string[]
}

/** JIZURA 在 omakase 里对所有 mood 一视同仁的两项抽样 */
const COMMON: Pick<Mood, 'flashChance' | 'hudPick'> = {
  flashChance: 0.65,
  hudPick: ['auto', 'auto', 'on', 'off'],
}

export const MOODS: Record<MoodKey, Mood> = {
  // 故障：满格色散与扫描线，几乎每拍都在跳
  glitch: {
    ...COMMON,
    fx: {
      motion: [0.6, 0.9],
      glitch: [0.75, 1],
      chroma: [0.75, 1],
      decor: [0.3, 0.6],
      density: [0.6, 0.9],
      texture: [0.5, 0.9],
      bgSwitch: [0.3, 0.6],
    },
    layout: ['center', 'condensed', 'huge', 'tile', 'marquee', 'vcols', 'scatter', 'stack'],
    enter: ['slice', 'scramble', 'assemble', 'flicker', 'zoom', 'stretch'],
    exit: ['glitch', 'slice', 'explode', 'fall'],
    styles: ['noir', 'crimson', 'mint', 'mono', 'hud'],
    koma: [12, 12, 8],
  },
  // 抒情：低冲击、慢出场，不许抖动与故障定格
  calm: {
    ...COMMON,
    fx: {
      motion: [0.3, 0.55],
      glitch: [0.05, 0.25],
      chroma: [0.2, 0.5],
      decor: [0.2, 0.5],
      density: [0.25, 0.45],
      texture: [0.5, 0.85],
      bgSwitch: [0.1, 0.3],
    },
    layout: ['center', 'vcols', 'gloss', 'stack', 'circle', 'type', 'mixed'],
    enter: ['blur', 'type', 'wipe', 'assemble'],
    exit: ['blur', 'drift', 'wipe', 'shrink'],
    styles: ['specimen', 'paper', 'hud', 'noir'],
    noHold: ['glitchtick', 'jitter'],
    koma: [0, 0, 12],
  },
  // 流行：高装饰、跳脱出场
  pop: {
    ...COMMON,
    fx: {
      motion: [0.7, 1],
      glitch: [0.1, 0.35],
      chroma: [0.3, 0.6],
      decor: [0.6, 1],
      density: [0.5, 0.8],
      texture: [0.2, 0.5],
      bgSwitch: [0.4, 0.8],
    },
    layout: ['mixed', 'scatter', 'wave', 'labels', 'pill', 'ring', 'huge', 'diag', 'center'],
    enter: ['pop', 'drop', 'spin', 'stretch', 'zoom'],
    exit: ['scatter', 'shrink', 'stretch', 'blur'],
    styles: ['magenta', 'caution', 'transit', 'blueprint', 'rouge'],
    koma: [12, 12, 8, 0],
  },
  // 平面构成：斜带与标签，进出场干脆利落
  graphic: {
    ...COMMON,
    fx: {
      motion: [0.5, 0.8],
      glitch: [0.2, 0.5],
      chroma: [0.4, 0.7],
      decor: [0.7, 1],
      density: [0.5, 0.8],
      texture: [0.4, 0.7],
      bgSwitch: [0.3, 0.7],
    },
    layout: ['diag', 'labels', 'marquee', 'tile', 'condensed', 'huge', 'circle', 'pill'],
    enter: ['wipe', 'slice', 'stretch', 'zoom'],
    exit: ['wipe', 'slice', 'stretch'],
    styles: ['blueprint', 'caution', 'rouge', 'mint', 'transit'],
    koma: [12, 12, 0],
  },
  // 编辑排版：明朝体与注释感，密度偏低
  editorial: {
    ...COMMON,
    fx: {
      motion: [0.4, 0.65],
      glitch: [0.1, 0.3],
      chroma: [0.2, 0.45],
      decor: [0.4, 0.7],
      density: [0.35, 0.6],
      texture: [0.6, 0.9],
      bgSwitch: [0.2, 0.4],
    },
    layout: ['gloss', 'vcols', 'mixed', 'stack', 'type', 'center', 'circle'],
    enter: ['type', 'blur', 'wipe', 'assemble'],
    exit: ['blur', 'drift', 'wipe'],
    styles: ['specimen', 'paper', 'noir', 'mono', 'hud'],
    koma: [0, 12],
  },
  // 情绪向：大幅文字 + 中高强度色散
  emotional: {
    ...COMMON,
    fx: {
      motion: [0.55, 0.85],
      glitch: [0.3, 0.6],
      chroma: [0.5, 0.85],
      decor: [0.3, 0.6],
      density: [0.4, 0.7],
      texture: [0.6, 1],
      bgSwitch: [0.2, 0.5],
    },
    layout: ['huge', 'center', 'vcols', 'stack', 'condensed', 'mixed', 'circle'],
    enter: ['assemble', 'blur', 'zoom', 'wipe', 'slice'],
    exit: ['drift', 'explode', 'fall', 'blur'],
    styles: ['noir', 'paper', 'hud', 'mono', 'crimson'],
    koma: [12, 0],
  },
  // 全家桶：不限制任何部件，强度拉满
  chaos: {
    ...COMMON,
    fx: {
      motion: [0.5, 1],
      glitch: [0.3, 1],
      chroma: [0.4, 1],
      decor: [0.4, 1],
      density: [0.45, 0.9],
      texture: [0.3, 1],
      bgSwitch: [0.3, 0.9],
    },
    layout: null,
    enter: null,
    exit: null,
    styles: null,
    // JIZURA 未列出的 mood 走默认候选
    koma: [12, 8, 0],
  },
}

export const MOOD_ORDER: MoodKey[] = [
  'glitch',
  'calm',
  'pop',
  'graphic',
  'editorial',
  'emotional',
  'chaos',
]

/**
 * hold / decor 部件的情绪标签（JIZURA 的 tags 赋值块）。
 * anim.ts / decor.ts 注册部件时按此表把 tags 写进定义，planner 再用 taggedWith 反查。
 */
export const MOOD_TAGS: Record<Extract<GroupKey, 'hold' | 'decor'>, Record<string, MoodKey[]>> = {
  hold: {
    still: ['calm', 'editorial', 'emotional', 'graphic'],
    drift: ['calm', 'emotional', 'editorial'],
    breathe: ['calm', 'emotional'],
    wave: ['pop'],
    jitter: ['glitch', 'pop'],
    glitchtick: ['glitch'],
  },
  decor: {
    brackets: ['graphic', 'editorial'],
    rings: ['graphic', 'emotional'],
    dots: ['pop', 'graphic'],
    arrows: ['pop', 'graphic'],
    slash: ['glitch', 'graphic'],
    sparks: ['pop'],
    leaders: ['editorial', 'calm'],
    waveform: ['emotional', 'calm'],
    barcode: ['glitch', 'graphic'],
    grid: ['graphic', 'editorial'],
    stripes: ['graphic', 'pop'],
    blobs: ['pop', 'emotional'],
    bars: ['graphic', 'glitch'],
    shapes: ['pop', 'graphic'],
    counter: ['graphic', 'editorial'],
  },
}

/** 可以按白名单合成情绪标签的分组 */
type TaggableGroup = 'layout' | 'enter' | 'exit' | 'hold' | 'decor'

/**
 * 把情绪标签写进核心部件的定义。
 *
 * JIZURA 的核心部件（05_anim / 06_layouts / 07_decor）不写 tags，
 * 而是在 08b_omakase.js 载入时用 MOODS 白名单补上，hold / decor 另给一张补充表
 * （就是下面的 MOOD_TAGS）。标签会被 registry.taggedWith 反查，也参与 planner 对
 * 故障系保持动效的权重修正，所以必须在注册表合并后就位，抽样结果才对得上旧项目。
 */
export function applyMoodTags(
  tables: Partial<Record<TaggableGroup, Record<string, { tags?: string[] }>>>,
): void {
  const add = (group: TaggableGroup, key: string, mood: MoodKey): void => {
    const def = tables[group]?.[key]
    if (!def) return
    def.tags ??= []
    if (!def.tags.includes(mood)) def.tags.push(mood)
  }
  for (const mood of MOOD_ORDER) {
    const M = MOODS[mood]
    for (const group of ['layout', 'enter', 'exit'] as const) {
      for (const key of M[group] ?? []) add(group, key, mood)
    }
  }
  for (const [group, map] of Object.entries(MOOD_TAGS)) {
    for (const [key, moods] of Object.entries(map)) {
      for (const mood of moods) add(group as TaggableGroup, key, mood)
    }
  }
}
