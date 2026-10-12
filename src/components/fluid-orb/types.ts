import type { CSSProperties, Ref } from 'react'

import type { OrbEyeMood } from './orb-eye-states'

/** AI 助手在做什么：四态只改几组 uniform 目标值，不切着色器 */
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** glow 适合暗页（screen 叠加），ink 在亮页直出干净颜色，auto 按主题挑 */
export type OrbBlend = 'auto' | 'glow' | 'ink'

export type FluidOrbHandle = {
  /** angle 度数（0=向右，顺时针为正），strength 0..1 */
  tap: (angle?: number, strength?: number) => void
}

export type FluidOrbProps = {
  /** 球的直径（px），画布按 PAD 外扩给光晕留余量 */
  size?: number
  /** 2~4 个色沿边缘成环流动，非法项丢弃、不足两个用默认色轮兜底 */
  colors?: string[]
  state?: OrbState
  /** 显式音量 0..1；给了就不再看 getVolume */
  volume?: number
  /** 每帧读一次实时电平（如 Web Audio RMS），不走 React 渲染 */
  getVolume?: () => number
  /** listening / speaking 且没给电平时伪造一条语音包络 */
  autoVolume?: boolean
  /** 音量对半径与亮度的影响强度 */
  reactivity?: number
  animationSpeed?: number
  /** 色轮沿边缘巡游速度 */
  colorSpeed?: number
  glowIntensity?: number
  /** 边缘抖动的细节密度 */
  noiseScale?: number
  /** 玻璃罩折射强度：0 = 气图像平贴一张，1 = 标准球壳，越大边缘弯折越狠 */
  refraction?: number
  /** 玻璃壳带宽（占半径比例）：贴边那条焦散亮带与色散带的宽度 */
  shellWidth?: number
  innerScale?: number
  coreIntensity?: number
  rimWidth?: number
  rimIntensity?: number
  /** 玻璃高光强度 */
  glints?: number
  /** 外柔光的尺寸 */
  halo?: number
  /** 轮廓像软气泡一样摆动的幅度，0=轮廓固定 */
  wobble?: number
  /** 球朝指针转过去的程度 */
  hoverTilt?: number
  /** 点击挤压与光斑 */
  interactive?: boolean
  blend?: OrbBlend
  /** 挂载时软弹簧入场 */
  intro?: boolean
  paused?: boolean
  /** 渲染分辨率倍率，低端设备调低 */
  resolution?: number
  /** 画上眼睛。颜色走主题的 foreground 令牌：暗底近白、亮底近黑 */
  eyes?: boolean
  /** 眼睛情绪，20 态之一；只在 eyes 打开时生效 */
  mood?: OrbEyeMood
  /** 播放列表换下一组笔画的间隔区间（ms）。默认一分钟一张脸 */
  eyeHoldMs?: readonly [number, number]
  /** 自主眨眼的间隔区间（ms） */
  eyeBlinkMs?: readonly [number, number]
  className?: string
  style?: CSSProperties
  ref?: Ref<FluidOrbHandle>
}
