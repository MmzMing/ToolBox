/**
 * 眼球情绪状态表。
 *
 * 每个状态不直接对应一张脸，而是对应一段**眼形播放列表**（索引进 `orb-eye-shapes.ts` 的 10 组笔画），
 * 外加"这个状态会不会偶发单眼眨"。也就是说"情绪"是这两张表共同定义的，不是一帧静态图。
 * 换笔画与眨眼的间隔是全局一档，在 `orb-defaults.ts` / `config/ai-orb.ts`，不跟着状态走。
 *
 * 10 组笔画：0 竖杠 · 1 小圆 · 2 大圆 · 3 生气 \\ / · 4 委屈 / \\ · 5 眯笑 > < ·
 * 6 笑脸 ^ ^ · 7 横条 - - · 8 眨眼 | < · 9 疑惑（一大一小，底边对齐）。
 *
 * 分组：Lifecycle 4 + Reactions 16 = 20。保留 listening / thinking / working 是给接 AI 留的空位，
 * 目前没有任何业务事件驱动它们。裁剪与自绘记录：
 * docs/plans/2026-10-12-orb-eye-mood-pruning-design.md
 */

export const ORB_EYE_MOODS = [
  // Lifecycle
  'idle',
  'listening',
  'thinking',
  'working',
  // Reactions
  'excited',
  'surprised',
  'suspicious',
  'angry',
  'drowsy',
  'happy',
  'curious',
  'confused',
  'bored',
  'proud',
  'shy',
  'sad',
  'laughing',
  'scared',
  'playful',
  'celebrate',
] as const

export type OrbEyeMood = (typeof ORB_EYE_MOODS)[number]

/** 每个状态依次播放哪几组笔画（索引 = `orb-eye-shapes.ts` 里 ORB_EYE_BARS 的下标） */
export const EYE_PLAYLIST: Record<OrbEyeMood, readonly number[]> = {
  idle: [0, 1],
  listening: [1, 0],
  thinking: [9, 1, 0],
  working: [0, 3, 1],
  excited: [5, 2, 6, 1],
  surprised: [2, 1],
  suspicious: [8, 5, 7],
  angry: [3, 7],
  drowsy: [7, 4, 1],
  happy: [6, 5, 2],
  curious: [1, 9, 0],
  confused: [9, 4, 1],
  bored: [7, 0],
  proud: [2, 6, 0],
  shy: [9, 1, 7],
  sad: [4, 7, 1],
  laughing: [5, 6, 2],
  scared: [2, 1, 7],
  playful: [8, 5, 6],
  celebrate: [6, 5, 2],
}

/**
 * 不自主眨眼的状态。眼皮本来就压着，再眨一次读起来是抽了一下。
 *
 * 换笔画与眨眼的**间隔**不在这里——那是 `orb-defaults.ts` 的 `eyeHoldMs` / `eyeBlinkMs`
 * 全局一档，`config/ai-orb.ts` 里可直接调。以前是每个状态一对区间（两张 20 行的表），
 * 换来的只是"激动时快一点"，而表情本身已经由播放列表区分了，节奏没必要各留一套。
 */
export const NO_BLINK_MOODS: ReadonlySet<OrbEyeMood> = new Set(['drowsy'])

/** 这些状态里会偶发单眼眨眼（wink） */
export const WINK_MOODS: ReadonlySet<OrbEyeMood> = new Set([
  'idle',
  'happy',
  'excited',
  'curious',
  'playful',
])

/** 弹簧参数 [频率, 阻尼比]。阻尼比 1 = 临界阻尼，跟手但不过冲 */
export const EYE_SPRINGS = {
  x: [4.2, 1],
  y: [4.6, 1],
  blink: [24, 1],
  eyeScale: [8, 0.8],
} as const

/**
 * 换眼形的两种节奏。
 *
 * 同一状态内播放列表往前走（`EYE_MORPH_MS`）是明着荡过去，缓动 + 双眼错开；
 * 换 mood 则是**先眨眼、趁眼睛闭着把脸换掉、再睁开**（`EYE_SWAP_DELAY` 等眼皮压到位，
 * `EYE_SWAP_MS` 在闭着的这段时间里换完）。大表情之间跨度太大，直接 lerp 读起来是
 * "纸片被换了一张"，藏在一次眨眼后面才像它自己想换个脸色。
 */
export const EYE_MORPH_MS = 480
export const EYE_SWAP_DELAY = 110
export const EYE_SWAP_MS = 260
/** 右眼比左眼晚这么多毫秒开始。两只眼严格同步切换看着像机械，错开一点才像一张脸 */
export const EYE_STAGGER_MS = 55

/**
 * 一次眨眼的关键帧：[相对毫秒, 眼睑开合度]，1 是全开、接近 0 是闭拢。
 * 先落在闭拢并停一会儿（眼睛是真闭上了，不是抖一下），再睁回来并过冲一点——
 * 睁过头再落回 1，眼睛才有"啪"地睁开而不是缓缓张开。
 */
export const BLINK_KEYS: readonly [number, number][] = [
  [0, 0.06],
  [90, 0.06],
  [190, 1.05],
  [340, 1],
]

/** 12% 概率追加的"二次眨"，用来打破节律 */
export const DOUBLE_BLINK_CHANCE = 0.12
export const DOUBLE_BLINK_KEYS: readonly [number, number][] = [
  [420, 0.06],
  [560, 1],
]

export const isOrbEyeMood = (value: string): value is OrbEyeMood =>
  (ORB_EYE_MOODS as readonly string[]).includes(value)
