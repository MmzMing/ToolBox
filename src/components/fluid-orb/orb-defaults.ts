import type { OrbEyeMood } from './orb-eye-states'
import type { OrbBlend, OrbState } from './types'

/**
 * 参数表默认值的唯一来源。组件解构时直接引用这里，
 * `ai-orbConfig.orb` 只覆盖它要改的那几项，不重复抄一份全量默认值。
 */
type OrbDefaults = {
  size: number
  state: OrbState
  autoVolume: boolean
  reactivity: number
  animationSpeed: number
  colorSpeed: number
  glowIntensity: number
  noiseScale: number
  refraction: number
  shellWidth: number
  innerScale: number
  coreIntensity: number
  rimWidth: number
  rimIntensity: number
  glints: number
  halo: number
  wobble: number
  hoverTilt: number
  interactive: boolean
  blend: OrbBlend
  intro: boolean
  paused: boolean
  resolution: number
  eyes: boolean
  mood: OrbEyeMood
  /** 播放列表换下一组笔画的间隔区间（ms，区间内随机） */
  eyeHoldMs: readonly [number, number]
  /** 自主眨眼的间隔区间（ms）；drowsy 由 NO_BLINK_MOODS 排除 */
  eyeBlinkMs: readonly [number, number]
}

export const orbDefaults = {
  size: 400,
  state: 'idle',
  autoVolume: true,
  reactivity: 1,
  animationSpeed: 1,
  colorSpeed: 1,
  glowIntensity: 0.8,
  noiseScale: 3,
  refraction: 1,
  shellWidth: 1,
  innerScale: 1,
  coreIntensity: 1,
  rimWidth: 1,
  rimIntensity: 1,
  glints: 1,
  halo: 1,
  /** 默认不摆：轮廓固定成一颗干净的球，要软气泡手感时再调上去 */
  wobble: 0,
  hoverTilt: 1,
  interactive: true,
  blend: 'auto',
  intro: true,
  paused: false,
  resolution: 1,
  eyes: false,
  mood: 'idle',
  /** 一分钟换一张脸：这颗球是常驻装饰，换太快会从"有生命"变成"在闪" */
  eyeHoldMs: [45000, 75000],
  /** 眨眼比换脸勤得多——十几秒不眨就已经看着像死物了 */
  eyeBlinkMs: [4000, 9000],
} satisfies OrbDefaults
