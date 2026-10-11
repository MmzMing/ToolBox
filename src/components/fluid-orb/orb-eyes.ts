import {
  BLINK_KEYS,
  BLINK_MS,
  DOUBLE_BLINK_CHANCE,
  DOUBLE_BLINK_KEYS,
  EYE_HOLD_MS,
  EYE_MORPH_MS,
  EYE_PLAYLIST,
  EYE_SPRINGS,
  FACE_TUNE,
  WINK_MOODS,
  type OrbEyeMood,
} from './orb-eye-states'
import { ORB_EYE_CENTER, ORB_EYE_POINTS, ORB_EYE_SHAPES } from './orb-eye-shapes'

/** 球心，也是眼睛坐标系的中心 */
export const EYE_CENTER = ORB_EYE_CENTER
/** 眼形 SVG 的 viewBox 边长：源里 blob 直径，正好等于内切圆口径 */
export const EYE_BOX = ORB_EYE_CENTER * 2

/** 一组眼形摊平成 192 个数：前 96 个左眼、后 96 个右眼，每两点一组 (x, y)。
 * 摊平是为了让生成出来的数据文件小三分之一，这里按 offset 取用。
 */
const STRIDE = ORB_EYE_POINTS * 2

export function eyeSlice(shape: readonly number[], eye: number): readonly number[] {
  return shape.slice(eye * STRIDE, (eye + 1) * STRIDE)
}

/** 球上脸的位置：比球心略高一点，下面留给身体，正中间会显得像靶子 */
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
 * 每组眼形自带的「双眼中点」。
 *
 * 源数据把表情连位置一起烘进几何里了（原角色靠 3D pose 矩阵把脸转到球面上），
 * 25 组的双眼中点从 (71,57) 一路跑到 (190,165)。所以必须先减掉每组自带的中点，
 * 再把脸摆到我们要的位置——否则同一颗球上换个表情，脸就歪到边上去了。
 */
const PAIR_MID: [number, number][] = ORB_EYE_SHAPES.map((shape) => {
  const [lx, ly] = centroid(eyeSlice(shape, 0))
  const [rx, ry] = centroid(eyeSlice(shape, 1))
  return [(lx + rx) / 2, (ly + ry) / 2]
})

/** 眼形相对自身质心的最大横向半径，用来算「贴边夹取」的余量 */
export function eyeHalfWidth(flat: readonly number[]): number {
  const [cx] = centroid(flat)
  let half = 0
  for (let i = 0; i < flat.length; i += 2) {
    half = Math.max(half, Math.abs(flat[i] - cx))
  }
  return half
}

export function polyPath(flat: readonly number[]): string {
  let d = 'M'
  for (let i = 0; i < flat.length; i += 2) {
    d += `${flat[i].toFixed(2)} ${flat[i + 1].toFixed(2)}${i + 2 < flat.length ? 'L' : 'Z'}`
  }
  return d
}

/** 两组眼形之间插值；两组点数相同（都是 48），所以按下标直接 lerp */
export function lerpFlat(a: readonly number[], b: readonly number[], t: number): number[] {
  if (t <= 0) {
    return [...a]
  }
  if (t >= 1) {
    return [...b]
  }
  const out = new Array<number>(a.length)
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] + (b[i] - a[i]) * t
  }
  return out
}

/* ------------------------------------------------------------------ 眨眼队列 */

export type BlinkKey = { at: number; v: number }

/**
 * 排入一次眨眼。眼睑开合度 1 是全开、0.05 是闭拢，中间那一帧 1.08 是过冲——
 * 睁过头再落回 1，眼睛才有"啪"地睁开而不是缓缓张开。
 * 14% 概率追加二次眨，用来打破节律。
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

/** 源同款：v += (-2ζω·v - ω²(x - target))·dt，临界阻尼以上不会过冲 */
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
}

const holdOf = (mood: OrbEyeMood, random: () => number): number => {
  const [lo, hi] = EYE_HOLD_MS[mood]
  return lo + (hi - lo) * random()
}

export function createEyeRuntime(
  mood: OrbEyeMood,
  now: number,
  random: () => number,
): OrbEyeRuntime {
  const first = EYE_PLAYLIST[mood][0]
  return {
    mood,
    cursor: 0,
    nextAt: now + holdOf(mood, random),
    from: first,
    to: first,
    morphAt: now,
    blinkQueue: [],
    nextBlinkAt: now + (BLINK_MS[mood] ? holdOf(mood, random) * 0.6 : Number.POSITIVE_INFINITY),
    lid: makeSpring(1),
    winkAt: Number.NEGATIVE_INFINITY,
    winkEye: 0,
    gazeX: makeSpring(0),
    gazeY: makeSpring(0),
    scale: makeSpring(1),
    last: now,
  }
}

/** 换情绪：立刻把播放列表指针拨回该状态的第一组眼形，其余状态留给下一帧自然过渡 */
export function setMood(
  rt: OrbEyeRuntime,
  mood: OrbEyeMood,
  now: number,
  random: () => number,
): void {
  if (rt.mood === mood) {
    return
  }
  rt.from = rt.to
  rt.mood = mood
  rt.cursor = 0
  rt.to = EYE_PLAYLIST[mood][0]
  rt.morphAt = now
  rt.nextAt = now + holdOf(mood, random)
  const range = BLINK_MS[mood]
  rt.nextBlinkAt = range ? now + range[0] * 0.5 : Number.POSITIVE_INFINITY
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
 * 源是拿身形路径采样成扫描线（flattenPath + buildSpan）来求「这一行允许到哪儿」，
 * 因为它的身体是会变形的不规则 blob。这里球永远是正圆，同一件事有解析解：
 * 眼心到球心的距离不能超过 R 减去眼睛自身的外接半径，超了就沿径向拉回来。
 * 省掉整套路径展平与采样缓存。
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

  if (input.now >= rt.nextAt && playlist.length > 1) {
    rt.cursor = (rt.cursor + 1) % playlist.length
    rt.from = rt.to
    rt.to = playlist[rt.cursor]
    rt.morphAt = input.now
    rt.nextAt = input.now + holdOf(rt.mood, random)
  }

  const blinkRange = BLINK_MS[rt.mood]
  if (blinkRange !== null && input.now >= rt.nextBlinkAt) {
    queueBlink(rt.blinkQueue, input.now, random)
    rt.nextBlinkAt = input.now + blinkRange[0] + (blinkRange[1] - blinkRange[0]) * random()
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

  // 注视：指针给目标位置，弹簧负责跟。幅度按 viewBox 228 算，20 单位约是球直径的 9%——
  // 再小就看不出在转眼睛（悬浮球只有几十 px，第一版给 9 单位时肉眼几乎无感）。
  // 再叠两条极慢正弦当待机漂移，没有鼠标时眼睛也不会死在正中。
  const driftX = Math.sin(input.now * 0.00042) * 1.4 + Math.sin(input.now * 0.001) * 0.5
  const driftY = Math.sin(input.now * 0.00058) * 0.9
  rt.gazeX.t = (input.pointer ? input.pointer.x * 20 : 0) + driftX
  rt.gazeY.t = (input.pointer ? input.pointer.y * 14 : 0) + driftY
  drive(rt.gazeX, EYE_SPRINGS.x[0], EYE_SPRINGS.x[1], dt)
  drive(rt.gazeY, EYE_SPRINGS.y[0], EYE_SPRINGS.y[1], dt)

  rt.scale.t = input.openness ?? 1
  drive(rt.scale, EYE_SPRINGS.eyeScale[0], EYE_SPRINGS.eyeScale[1], dt)

  const morphT = Math.min(1, (input.now - rt.morphAt) / EYE_MORPH_MS)
  // 换眼形时轻微鼓一下：纯 lerp 的切换看着像"贴错了纸"，鼓一下才像眨了下眼
  const pulse = 1 + 0.07 * Math.sin(morphT * Math.PI)
  const shapeA = ORB_EYE_SHAPES[rt.from]
  const shapeB = ORB_EYE_SHAPES[rt.to]
  const openness = rt.scale.x

  const midA = PAIR_MID[rt.from]
  const midB = PAIR_MID[rt.to]
  const pairMid: [number, number] = [
    midA[0] + (midB[0] - midA[0]) * morphT,
    midA[1] + (midB[1] - midA[1]) * morphT,
  ]

  const eyes = [0, 1].map((i) => {
    const flat = lerpFlat(eyeSlice(shapeA, i), eyeSlice(shapeB, i), morphT)
    const [cx, cy] = centroid(flat)
    const halfW = eyeHalfWidth(flat)

    const lid = winkLid(rt.lid.x, input.now, rt.winkAt, rt.winkEye, i)
    const sx = Math.max(0.02, FACE_TUNE.size * FACE_TUNE.eyeWidth * pulse * openness)
    const sy = Math.max(0.02, FACE_TUNE.size * lid * FACE_TUNE.eyeHeight * pulse * openness)
    // 先减掉这组眼形自带的双眼中点，再按 FACE_TUNE.gap 撑开间距，最后落到球上的脸锚点
    const spot = clampToDisc(
      FACE_ANCHOR.x + (cx - pairMid[0]) * FACE_TUNE.gap + rt.gazeX.x,
      FACE_ANCHOR.y + (cy - pairMid[1]) * FACE_TUNE.gap + rt.gazeY.x,
      halfW * sx + 2,
    )

    return {
      d: polyPath(flat),
      transform: `translate(${spot.x.toFixed(2)} ${spot.y.toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`,
    }
  })

  return { eyes, mood: rt.mood, shape: rt.to, lid: rt.lid.x }
}
