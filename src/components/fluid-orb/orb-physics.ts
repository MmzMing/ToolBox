import type { OrbState } from './types'

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

/** 只认有限数：NaN / Infinity 一律当"没给"，避免坏值一路传到着色器把球算成黑块 */
export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1
  }
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** 与着色器里同一个式子：指数趋近，帧率无关，rate 越大跟得越紧 */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/* ------------------------------------------------------------------ 挤压弹簧 */

/**
 * 点击后的形变状态。三个量分开衰减是"水球感"的来源：
 * amount 沿点击轴把圆压成椭圆（一次过冲就够），mode2/mode3 是欠阻尼的高阶模态，
 * 让轮廓在回弹途中继续荡几下。只保留 amount 的话看起来像缩放，不像液态。
 */
export type SquishState = {
  amount: number
  amountVel: number
  mode2: number
  mode2Vel: number
  mode3: number
  mode3Vel: number
  /** 形变主轴，弧度 */
  angle: number
}

/** 欠阻尼比：临界阻尼的 c 会一次过冲都没有，手感就没了 */
const AMOUNT_STIFFNESS = 190
const AMOUNT_DAMPING = 8.8
const MODE2_STIFFNESS = 620
const MODE2_DAMPING = 3.7
const MODE3_STIFFNESS = 1450
const MODE3_DAMPING = 4.6

/** 单次点击注入的速度冲量 */
const TAP_AMOUNT = 3.1
const TAP_MODE2 = 2.4
const TAP_MODE3 = 1.1

/** 亚步长上限：ω 最高那支模态在 dt=1/120 下仍远离半隐式欧拉的失稳边界 */
const MAX_SUBSTEP = 1 / 120

/** 形变幅度上限：再大 SDF 会算出负半径，轮廓会翻面 */
export const MAX_SQUISH = 0.42

export function createSquishState(): SquishState {
  return {
    amount: 0,
    amountVel: 0,
    mode2: 0,
    mode2Vel: 0,
    mode3: 0,
    mode3Vel: 0,
    angle: 0,
  }
}

function stepSpring(
  x: number,
  v: number,
  stiffness: number,
  damping: number,
  dt: number,
): [number, number] {
  const nextV = v + (-stiffness * x - damping * v) * dt
  return [x + nextV * dt, nextV]
}

/**
 * 注入一次冲量。strength 越大弹得越狠，angle 决定压扁方向（0=向右，顺时针为正，与屏幕一致）。
 * 已经荡到峰值时再点，冲量直接叠加在残存速度上，所以连点会越点越疯——这是要的手感。
 */
export function applyTap(state: SquishState, angleDeg: number, strength = 0.6): SquishState {
  const power = clamp01(finiteOr(strength, 0.6))
  const rad = (Number.isFinite(angleDeg) ? angleDeg : 0) * (Math.PI / 180)
  return {
    ...state,
    angle: rad,
    amountVel: state.amountVel + power * TAP_AMOUNT,
    mode2Vel: state.mode2Vel + power * TAP_MODE2,
    mode3Vel: state.mode3Vel - power * TAP_MODE3,
  }
}

/** 推进物理，dt 单位秒。标签页被节流回来的那一帧会被切成小步长补上，不会炸。 */
export function stepSquish(state: SquishState, dt: number): SquishState {
  const total = clamp(dt, 0, 0.1)
  const steps = Math.max(1, Math.ceil(total / MAX_SUBSTEP))
  const h = total / steps
  let { amount, amountVel, mode2, mode2Vel, mode3, mode3Vel } = state
  for (let i = 0; i < steps; i += 1) {
    ;[amount, amountVel] = stepSpring(amount, amountVel, AMOUNT_STIFFNESS, AMOUNT_DAMPING, h)
    ;[mode2, mode2Vel] = stepSpring(mode2, mode2Vel, MODE2_STIFFNESS, MODE2_DAMPING, h)
    ;[mode3, mode3Vel] = stepSpring(mode3, mode3Vel, MODE3_STIFFNESS, MODE3_DAMPING, h)
  }
  return {
    angle: state.angle,
    amount: clamp(amount, -MAX_SQUISH, MAX_SQUISH),
    amountVel,
    mode2: clamp(mode2, -MAX_SQUISH, MAX_SQUISH),
    mode2Vel,
    mode3: clamp(mode3, -MAX_SQUISH / 2, MAX_SQUISH / 2),
    mode3Vel,
  }
}

/* ------------------------------------------------------------------ 音量驱动 */

export type OrbStateTargets = {
  /** rim 与 glints 的亮度倍率 */
  rim: number
  /** halo 亮度倍率 */
  halo: number
  /** 色轮巡游速度倍率 */
  colorSpeed: number
  /** core 自发光脉冲强度 */
  corePulse: number
  /** 音量对半径的放大权重 */
  swell: number
}

const STATE_TARGETS: Record<OrbState, OrbStateTargets> = {
  idle: { rim: 1, halo: 1, colorSpeed: 1, corePulse: 0, swell: 0 },
  listening: { rim: 1.45, halo: 1.32, colorSpeed: 1.15, corePulse: 0, swell: 0.35 },
  thinking: { rim: 1.15, halo: 1.08, colorSpeed: 3.4, corePulse: 1, swell: 0.2 },
  speaking: { rim: 1.3, halo: 1.25, colorSpeed: 1.3, corePulse: 0.25, swell: 1 },
}

export function orbStateTargets(state: OrbState): OrbStateTargets {
  return STATE_TARGETS[state] ?? STATE_TARGETS.idle
}

/**
 * 没接音频时伪造一条语音包络：音节用两个不同频率正弦相乘（避免规则的哒-哒-哒），
 * 语句包络约 3.4s 说、1.6s 停，幂函数把弱拍压下去让停顿更像真的换气。
 * 纯时间的函数，所以可测、可复现，不依赖随机数。
 */
export function autoVolumeAt(timeSec: number, seed = 0): number {
  const t = Math.max(0, finiteOr(timeSec, 0)) + seed
  const syllable = 0.5 + 0.5 * Math.sin(t * 6.9) * Math.sin(t * 2.31 + 1.7)
  const phrase = smoothstep(0.06, 0.42, 0.5 + 0.5 * Math.sin(t * 0.57 - 0.9))
  return clamp01((syllable * phrase) ** 0.85)
}

export type LevelSource = {
  volume?: number
  /** 本帧从 getVolume() 读到的值，undefined 表示没接线 */
  sampled?: number
  autoVolume: boolean
  state: OrbState
  time: number
}

/** 显式 volume > 每帧 getVolume() > 伪语音（仅 listening/speaking）> 0 */
export function resolveLevel(source: LevelSource): number {
  const explicit = source.volume
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return clamp01(explicit)
  }
  if (typeof source.sampled === 'number' && Number.isFinite(source.sampled)) {
    return clamp01(source.sampled)
  }
  if (source.autoVolume && (source.state === 'listening' || source.state === 'speaking')) {
    return autoVolumeAt(source.time, source.state === 'listening' ? 1.9 : 0)
  }
  return 0
}
