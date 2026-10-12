import {
  DOUBLE_BLINK_CHANCE,
  DOUBLE_BLINK_KEYS,
  BLINK_KEYS,
  EYE_MORPH_MS,
  EYE_PLAYLIST,
  EYE_SPRINGS,
  EYE_STAGGER_MS,
  EYE_SWAP_DELAY,
  EYE_SWAP_MS,
  NO_BLINK_MOODS,
  WINK_MOODS,
  type OrbEyeMood,
} from './orb-eye-states'
import { orbDefaults } from './orb-defaults'
import { ORB_EYE_CENTER, ORB_EYE_POINTS, ORB_EYE_SHAPES, morphedEye } from './orb-eye-shapes'

/**
 * 眼睛的两条节奏：多久换一组笔画、多久眨一次眼。区间内随机，单位 ms。
 *
 * 全局一档，不随情绪变——情绪已经由"播哪几组笔画"区分了，再让节奏各走各的
 * 只是多两张 20 行的表。默认值在 `orb-defaults.ts`，config 里可覆盖。
 */
export type EyeRhythm = {
  hold: readonly [number, number]
  blink: readonly [number, number]
}

export const DEFAULT_RHYTHM: EyeRhythm = {
  hold: orbDefaults.eyeHoldMs,
  blink: orbDefaults.eyeBlinkMs,
}

/** 球心，也是眼睛坐标系的中心 */
export const EYE_CENTER = ORB_EYE_CENTER
/** 眼形 SVG 的 viewBox 边长：那个方框就是球体本身，眼睛铺满它即贴到球边 */
export const EYE_BOX = ORB_EYE_CENTER * 2

/** 一组眼形摊平成 192 个数：前 96 个左眼、后 96 个右眼，每两点一组 (x, y) */
const STRIDE = ORB_EYE_POINTS * 2

export function eyeSlice(shape: readonly number[], eye: number): readonly number[] {
  return shape.slice(eye * STRIDE, (eye + 1) * STRIDE)
}

/** 球上脸的位置：比球心略高一点。落在正中间会读成一个靶子，不像一张脸 */
export const FACE_ANCHOR = { x: EYE_CENTER, y: EYE_CENTER - 12 }

export function centroid(flat: readonly number[]): [number, number] {
  let x = 0
  let y = 0
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i]
    y += flat[i + 1]
  }
  const n = flat.length / 2
  return [x / n, y / n]
}

/**
 * 每组眼形的「双眼中点」，渲染时先减掉它再把脸落到 `FACE_ANCHOR` 上。
 *
 * 自绘的竖条本来就围绕球心对称摆，所以这层归心现在是一道保险：谁改 `EYE_BARS` 时把某张脸
 * 整个挪偏了（比如给一只眼加了 spread），换到那个表情时脸也不会跟着跑到球边上。
 * 按几何现算而不是写死 (120,120)，是为了让它永远跟着数据走。
 */
const PAIR_MID: [number, number][] = ORB_EYE_SHAPES.map((shape) => {
  const [lx, ly] = centroid(eyeSlice(shape, 0))
  const [rx, ry] = centroid(eyeSlice(shape, 1))
  return [(lx + rx) / 2, (ly + ry) / 2]
})

/**
 * 眼形相对自身质心的**外接半径**，用来算贴边夹取的余量。
 *
 * 不能只看横向：现在是大眼睛，一条 h40 w15 的竖条对角半径接近 43，
 * 只按横向的 15 去夹，斜着看时眼的上下角会戳到球外。
 */
export function eyeReach(flat: readonly number[]): number {
  const [cx, cy] = centroid(flat)
  let reach = 0
  for (let i = 0; i < flat.length; i += 2) {
    reach = Math.max(reach, Math.hypot(flat[i] - cx, flat[i + 1] - cy))
  }
  return reach
}

export function polyPath(flat: readonly number[]): string {
  let d = 'M'
  for (let i = 0; i < flat.length; i += 2) {
    d += `${flat[i].toFixed(2)} ${flat[i + 1].toFixed(2)}${i + 2 < flat.length ? 'L' : 'Z'}`
  }
  return d
}

/**
 * 三次缓入缓出。线性进度在起帧和末帧速度最大，眼睛换形因此看着"啪"地弹一下；
 * 两头慢中间快才像肌肉带动的。
 */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/* ------------------------------------------------------------------ 眨眼队列 */

export type BlinkKey = { at: number; v: number }

/**
 * 排入一次眨眼：把 `BLINK_KEYS` 那几帧按当前时刻贴到队列上，
 * 再按 `DOUBLE_BLINK_CHANCE` 的概率叠一次"二次眨"打破节律。
 */
export function queueBlink(queue: BlinkKey[], now: number, random: () => number): void {
  for (const [at, v] of BLINK_KEYS) {
    queue.push({ at: now + at, v })
  }
  if (random() < DOUBLE_BLINK_CHANCE) {
    for (const [at, v] of DOUBLE_BLINK_KEYS) {
      queue.push({ at: now + at, v })
    }
  }
}

/** 吃掉所有到点的关键帧，返回最后一个生效的开合度 */
export function consumeBlink(queue: BlinkKey[], now: number): number | null {
  let key: number | null = null
  while (queue.length > 0 && now >= queue[0].at) {
    key = queue.shift()?.v ?? key
  }
  return key
}

/* ------------------------------------------------------------------ 弹簧 */

export type Spring = { x: number; v: number; t: number }

export function makeSpring(at = 0): Spring {
  return { x: at, v: 0, t: at }
}

/** 阻尼谐振子，半隐式欧拉：v += (-2ζω·v - ω²(x - target))·dt。ζ ≥ 1 不过冲 */
export function stepSpring(s: Spring, freq: number, damp: number, dt: number): void {
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt
  s.x += s.v * dt
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t
    s.v = 0
  }
}

const SUBSTEP = 1 / 120

function drive(s: Spring, freq: number, damp: number, dt: number): void {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP))
  const h = dt / steps
  for (let i = 0; i < steps; i += 1) {
    stepSpring(s, freq, damp, h)
  }
}

/* ------------------------------------------------------------------ 运行时 */

export type OrbEyeRuntime = {
  mood: OrbEyeMood
  /** 播放列表下标 */
  cursor: number
  nextAt: number
  from: number
  to: number
  morphAt: number
  /** 这一次换形花多久：同状态内推进与换 mood 走的是两条节奏 */
  morphMs: number
  blinkQueue: BlinkKey[]
  nextBlinkAt: number
  lid: Spring
  winkAt: number
  winkEye: number
  gazeX: Spring
  gazeY: Spring
  scale: Spring
  /** 上一次 step 的时刻，用于算 dt */
  last: number
  /** 换笔画与眨眼的间隔，建好就不再变（来自 props / config） */
  rhythm: EyeRhythm
}

const spanOf = (range: readonly [number, number], random: () => number): number => {
  const [lo, hi] = range
  return lo + (hi - lo) * random()
}

export function createEyeRuntime(
  mood: OrbEyeMood,
  now: number,
  random: () => number,
  rhythm: EyeRhythm = DEFAULT_RHYTHM,
): OrbEyeRuntime {
  const first = EYE_PLAYLIST[mood][0]
  return {
    mood,
    cursor: 0,
    nextAt: now + spanOf(rhythm.hold, random),
    from: first,
    to: first,
    morphAt: now,
    morphMs: EYE_MORPH_MS,
    blinkQueue: [],
    nextBlinkAt: NO_BLINK_MOODS.has(mood)
      ? Number.POSITIVE_INFINITY
      : now + spanOf(rhythm.blink, random),
    lid: makeSpring(1),
    winkAt: Number.NEGATIVE_INFINITY,
    winkEye: 0,
    gazeX: makeSpring(0),
    gazeY: makeSpring(0),
    scale: makeSpring(1),
    last: now,
    rhythm,
  }
}

/**
 * 换情绪：先眨一下，趁眼皮压到位的那段把脸换掉，再睁成新表情。
 *
 * `morphAt` 故意设在未来——stepEyes 里进度被夹到 0，那之前眼睛保持旧脸不动，
 * 正好让闭拢段先走完。大表情之间直接 lerp 会读成"换了一张纸片"，藏在眨眼后面才像它自己想变脸。
 */
export function setMood(
  rt: OrbEyeRuntime,
  mood: OrbEyeMood,
  now: number,
  random: () => number,
): void {
  if (rt.mood === mood) {
    return
  }
  const settle = now + EYE_SWAP_DELAY + EYE_SWAP_MS
  rt.from = rt.to
  rt.mood = mood
  rt.cursor = 0
  rt.to = EYE_PLAYLIST[mood][0]
  rt.morphAt = now + EYE_SWAP_DELAY
  rt.morphMs = EYE_SWAP_MS
  queueBlink(rt.blinkQueue, now, random)
  rt.nextAt = settle + spanOf(rt.rhythm.hold, random)
  rt.nextBlinkAt = NO_BLINK_MOODS.has(mood)
    ? Number.POSITIVE_INFINITY
    : settle + spanOf(rt.rhythm.blink, random)
}

export type EyeStepInput = {
  now: number
  /** 归一化指针位置，-1..1；null = 没有指针（用待机漂移） */
  pointer: { x: number; y: number } | null
  /** 额外睁眼倍率，接 volume 时用 */
  openness?: number
  random?: () => number
}

export type OrbEyeFrame = {
  /** 左右眼各一条：path 的 d 与 transform */
  eyes: { d: string; transform: string }[]
  mood: OrbEyeMood
  /** 当前眼形索引，调试与测试用 */
  shape: number
  lid: number
}

/** 单眼眨：眼睑在 320ms 内先闭再开，只作用在指定那一只 */
function winkLid(base: number, now: number, winkAt: number, winkEye: number, i: number): number {
  let lid = Math.max(base, 0.04)
  if (i === winkEye && now < winkAt + 320) {
    const t = (now - winkAt) / 320
    const ramp = t < 0.42 ? 1 - t / 0.42 : (t - 0.42) / 0.58
    lid = Math.max(lid * Math.min(1, Math.max(0, ramp)), 0.04)
  }
  return lid
}

/**
 * 把眼睛夹在球体内切圆里。
 *
 * 球永远是正圆，所以"眼睛最多能到哪儿"有解析解：眼心到球心的距离不能超过
 * R 减去眼睛自身的外接半径，超了就沿径向拉回来。注视幅度给得大（球才几十 px），
 * 没有这道夹取，斜着看时会有一只眼被切到球外。
 */
export function clampToDisc(
  x: number,
  y: number,
  eyeRadius: number,
  disc = EYE_CENTER,
): { x: number; y: number } {
  const dx = x - disc
  const dy = y - disc
  const dist = Math.hypot(dx, dy)
  const limit = Math.max(0, disc - eyeRadius)
  if (dist <= limit || dist === 0) {
    return { x, y }
  }
  const k = limit / dist
  return { x: disc + dx * k, y: disc + dy * k }
}

/** 推进一帧：播放列表、眨眼、wink、注视弹簧，最后产出两只眼的 SVG 属性 */
export function stepEyes(rt: OrbEyeRuntime, input: EyeStepInput): OrbEyeFrame {
  const random = input.random ?? Math.random
  const dt = Math.min(0.1, Math.max(0, (input.now - rt.last) / 1000))
  rt.last = input.now

  const playlist = EYE_PLAYLIST[rt.mood]

  // 每个播放列表至少两组眼形（orb-eyes.test.ts 里断言住了），所以不需要防"单组时原地抽一下"
  if (input.now >= rt.nextAt) {
    rt.cursor = (rt.cursor + 1) % playlist.length
    rt.from = rt.to
    rt.to = playlist[rt.cursor]
    rt.morphAt = input.now
    rt.morphMs = EYE_MORPH_MS
    rt.nextAt = input.now + spanOf(rt.rhythm.hold, random)
  }

  const canBlink = !NO_BLINK_MOODS.has(rt.mood)
  if (canBlink && input.now >= rt.nextBlinkAt) {
    queueBlink(rt.blinkQueue, input.now, random)
    rt.nextBlinkAt = input.now + spanOf(rt.rhythm.blink, random)
    if (WINK_MOODS.has(rt.mood) && random() < 0.22) {
      rt.winkAt = input.now + 420
      rt.winkEye = random() < 0.5 ? 0 : 1
    }
  }

  const lidKey = consumeBlink(rt.blinkQueue, input.now)
  if (lidKey !== null) {
    rt.lid.t = lidKey
  }
  drive(rt.lid, EYE_SPRINGS.blink[0], EYE_SPRINGS.blink[1], dt)

  // 注视：指针给目标位置，弹簧负责跟。幅度按 viewBox 240 算，26 单位约是球直径的 11%——
  // 大眼睛能转得更明显，但再大就会有一只眼顶到球边被夹取拽住。
  // 再叠两条极慢正弦当待机漂移，没有鼠标时眼睛也不会死在正中。
  const driftX = Math.sin(input.now * 0.00042) * 2.4 + Math.sin(input.now * 0.001) * 0.9
  const driftY = Math.sin(input.now * 0.00058) * 1.5
  rt.gazeX.t = (input.pointer ? input.pointer.x * 26 : 0) + driftX
  rt.gazeY.t = (input.pointer ? input.pointer.y * 18 : 0) + driftY
  drive(rt.gazeX, EYE_SPRINGS.x[0], EYE_SPRINGS.x[1], dt)
  drive(rt.gazeY, EYE_SPRINGS.y[0], EYE_SPRINGS.y[1], dt)

  rt.scale.t = input.openness ?? 1
  drive(rt.scale, EYE_SPRINGS.eyeScale[0], EYE_SPRINGS.eyeScale[1], dt)

  const midA = PAIR_MID[rt.from]
  const midB = PAIR_MID[rt.to]
  const openness = rt.scale.x
  // 进度可以为负：换 mood 时 morphAt 被故意设在未来，那之前旧脸不动，等眼皮压下来
  const morphRaw = (input.now - rt.morphAt) / rt.morphMs
  const stagger = EYE_STAGGER_MS / rt.morphMs

  const eyes = ([0, 1] as const).map((eye) => {
    // 右眼晚一点起步：两只眼严格同步换形看着像机械，错开几十毫秒才像一张脸
    const t = easeInOut(Math.min(1, Math.max(0, morphRaw - eye * stagger)))
    // 插的是参数不是点，所以竖条转横条（axis 0→90）会真的转过去而不是缩成一坨
    const flat = morphedEye(rt.from, rt.to, t, eye === 0 ? -1 : 1)
    const [cx, cy] = centroid(flat)
    const reach = eyeReach(flat)

    const lid = winkLid(rt.lid.x, input.now, rt.winkAt, rt.winkEye, eye)
    // 换眼形时轻微鼓一下：纯 lerp 的切换看着像"贴错了纸"，鼓一下才像眨了下眼
    const face = (1 + 0.05 * Math.sin(t * Math.PI)) * openness
    const sx = Math.max(0.02, face)
    const sy = Math.max(0.02, face * lid)
    // 先减掉这组眼形的双眼中点归心，再落到球上的脸锚点
    const spot = clampToDisc(
      FACE_ANCHOR.x + (cx - (midA[0] + (midB[0] - midA[0]) * t)) + rt.gazeX.x,
      FACE_ANCHOR.y + (cy - (midA[1] + (midB[1] - midA[1]) * t)) + rt.gazeY.x,
      reach * sx + 2,
    )

    return {
      d: polyPath(flat),
      transform: `translate(${spot.x.toFixed(2)} ${spot.y.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`,
    }
  })

  return { eyes, mood: rt.mood, shape: rt.to, lid: rt.lid.x }
}
