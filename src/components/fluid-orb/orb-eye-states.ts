/**
 * 眼球情绪状态表，移植自 Grok Bot 角色引擎的 39 个状态（仅供学习参考，版权归 xAI 所有）。
 *
 * 每个状态不直接对应一张脸，而是对应一段**眼形播放列表**（索引进 ORB_EYE_SHAPES 的 25 组眼形），
 * 配上停留时长与眨眼节奏。也就是说"情绪"是这三张表共同定义的，不是一帧静态图。
 *
 * 分组：Lifecycle 7 + Reactions 16 + Agent morphs 3 + Product lifecycle 13 = 39。
 */

export const ORB_EYE_MOODS = [
  // Lifecycle
  'sleeping',
  'waking',
  'idle',
  'listening',
  'thinking',
  'searching',
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
  // Agent morphs
  'orbit',
  'radar',
  'progress',
  // Product lifecycle
  'spawning',
  'humming',
  'loading',
  'dictating',
  'writing',
  'sending',
  'receiving',
  'uploading',
  'notifying',
  'alerting',
  'dragging',
  'bouncing',
  'powering-down',
] as const

export type OrbEyeMood = (typeof ORB_EYE_MOODS)[number]

/** 每个状态依次播放哪几组眼形 */
export const EYE_PLAYLIST: Record<OrbEyeMood, readonly number[]> = {
  sleeping: [13, 22, 4],
  waking: [13],
  idle: [0, 8],
  listening: [10, 1, 19],
  thinking: [8, 16, 14, 17, 5],
  searching: [15, 9, 3, 20, 12, 18],
  working: [7, 16, 11, 10],
  excited: [2, 17, 21, 3, 11],
  surprised: [3, 21],
  suspicious: [14, 5, 23],
  angry: [7, 16],
  drowsy: [4, 22, 13],
  happy: [2, 11, 17, 19],
  curious: [3, 21, 0, 15],
  confused: [14, 5, 8],
  bored: [4, 22, 0],
  proud: [15, 8, 2],
  shy: [0, 24, 13],
  sad: [4, 13, 22],
  laughing: [2, 11, 17],
  scared: [3, 21],
  playful: [2, 17, 11, 8],
  celebrate: [2, 8, 17],
  orbit: [0, 8],
  radar: [0, 8],
  progress: [0, 8],
  spawning: [3, 0],
  humming: [0, 8],
  loading: [0, 8],
  dictating: [10, 1, 19],
  sending: [0, 8],
  receiving: [19, 0, 8],
  uploading: [15, 9, 8],
  writing: [15, 9],
  notifying: [3, 21, 0],
  alerting: [3, 21],
  bouncing: [2, 17],
  dragging: [3, 15, 0],
  'powering-down': [13, 22],
}

/** 每段眼形停留多久（ms，区间内随机） */
export const EYE_HOLD_MS: Record<OrbEyeMood, readonly [number, number]> = {
  sleeping: [6000, 10000],
  waking: [800, 800],
  idle: [9000, 16000],
  listening: [2800, 5000],
  thinking: [2000, 3600],
  searching: [1000, 1800],
  working: [1800, 3200],
  excited: [1100, 2000],
  surprised: [2500, 4000],
  suspicious: [2600, 4500],
  angry: [2200, 3800],
  drowsy: [4000, 8000],
  happy: [2500, 4500],
  curious: [1800, 3200],
  confused: [2200, 3800],
  bored: [3500, 6000],
  proud: [3500, 6000],
  shy: [3000, 5500],
  sad: [4000, 7000],
  laughing: [1200, 2400],
  scared: [900, 1800],
  playful: [1500, 3000],
  celebrate: [1400, 2600],
  orbit: [4000, 8000],
  radar: [4000, 8000],
  progress: [4000, 8000],
  spawning: [1200, 1200],
  humming: [5000, 9000],
  loading: [6000, 10000],
  dictating: [4000, 8000],
  sending: [4000, 8000],
  receiving: [4000, 8000],
  uploading: [4000, 8000],
  writing: [4000, 8000],
  notifying: [1500, 2600],
  alerting: [2000, 3600],
  bouncing: [3000, 6000],
  dragging: [1600, 3000],
  'powering-down': [6000, 9000],
}

/** 眨眼间隔（ms）；null = 这个状态下不自主眨眼（sleeping / drowsy 等） */
export const BLINK_MS: Record<OrbEyeMood, readonly [number, number] | null> = {
  sleeping: null,
  waking: null,
  idle: [6000, 14000],
  listening: [3000, 7000],
  thinking: [3500, 7000],
  searching: [1600, 4000],
  working: [2800, 5500],
  excited: [2000, 4000],
  surprised: [1800, 3500],
  suspicious: [4500, 8000],
  angry: [3500, 7000],
  drowsy: null,
  happy: [2500, 5000],
  curious: [2500, 5500],
  confused: [2800, 5500],
  bored: [4000, 8000],
  proud: [3500, 7000],
  shy: [3000, 6000],
  sad: [4000, 8000],
  laughing: [2500, 5000],
  scared: [1200, 3000],
  playful: [2000, 4500],
  celebrate: [2200, 4500],
  orbit: null,
  radar: null,
  progress: null,
  spawning: null,
  humming: [4000, 8000],
  loading: null,
  dictating: null,
  sending: null,
  receiving: null,
  uploading: null,
  writing: null,
  notifying: [2000, 4000],
  alerting: null,
  bouncing: null,
  dragging: [2200, 4500],
  'powering-down': null,
}

/** 这些状态里会偶发单眼眨眼（wink） */
export const WINK_MOODS: ReadonlySet<OrbEyeMood> = new Set([
  'idle',
  'happy',
  'excited',
  'curious',
  'playful',
])

/**
 * 面部与眼形的基础缩放。源的 UNIFORM_EYES=true，即左右眼共用同一套几何，
 * 只靠 leftDX 让开一点间距——这里照抄。
 */
export const FACE_TUNE = {
  size: 0.86,
  gap: 1.18,
  height: 1,
  eyeWidth: 0.96,
  eyeHeight: 0.92,
} as const

/** 弹簧参数 [频率, 阻尼比]，与源 SPRINGS 同源 */
export const EYE_SPRINGS = {
  x: [3.5, 1],
  y: [4, 1],
  blink: [26, 1],
  eyeScale: [9, 0.85],
  shape: [10, 1],
} as const

/** 眼形在列表里切换时的过渡时长（ms） */
export const EYE_MORPH_MS = 320

/** 一次眨眼的关键帧：[相对毫秒, 眼睑开合度]，与源 queueBlink 一致 */
export const BLINK_KEYS: readonly [number, number][] = [
  [0, 0.05],
  [70, 0.05],
  [150, 1.08],
  [300, 1],
]

/** 14% 概率追加的"二次眨"，源里就有，用来打破节律 */
export const DOUBLE_BLINK_CHANCE = 0.14
export const DOUBLE_BLINK_KEYS: readonly [number, number][] = [
  [370, 0.05],
  [480, 1],
]

export const isOrbEyeMood = (value: string): value is OrbEyeMood =>
  (ORB_EYE_MOODS as readonly string[]).includes(value)
