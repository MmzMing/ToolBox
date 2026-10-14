import type { Transition } from 'motion/react'

/** 三条贝塞尔曲线：standard 用于对称进出，enter 起步快用于内容入场，exit 收尾快用于退场。 */
export type CubicBezier = readonly [number, number, number, number]

const standard: CubicBezier = [0.2, 0, 0, 1]
const enter: CubicBezier = [0.16, 1, 0.3, 1]
const exit: CubicBezier = [0.4, 0, 1, 1]

/**
 * 数值弹簧。单独成型是因为手动积分的引擎要直接取 `stiffness`/`damping`，
 * 而 motion 的 `Transition` 是联合类型，从联合类型上取这两个字段过不了类型。
 */
export type NumericSpring = {
  type: 'spring'
  stiffness: number
  damping: number
  mass: number
}

const morph: NumericSpring = { type: 'spring', stiffness: 210, damping: 26, mass: 1 }
const glide: NumericSpring = { type: 'spring', stiffness: 260, damping: 30, mass: 1 }
const snappy: NumericSpring = { type: 'spring', stiffness: 420, damping: 34, mass: 1 }

/**
 * 悬浮外壳形变（dock 进出、dock ⇄ 卡片、顶栏胶囊分离）用时长与回弹描述，
 * 因为这几处都是 motion 的 layout 弹簧：改的是尺寸，只能用 duration/bounce 表达。
 */
const shell: Transition = { type: 'spring', duration: 0.42, bounce: 0.18 }

/**
 * 时长换算成 stiffness/damping：中途改目标也接得住当前速度，比 duration 曲线稳。
 * 组件里凡是要按「多少秒走完」定弹簧的地方都用它，别各自再写一遍公式。
 */
export function springOf(visualDuration: number, bounce: number): NumericSpring {
  const root = (2 * Math.PI) / (visualDuration * 1.2)
  return { type: 'spring', stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1 }
}

/**
 * 全站动效令牌。
 *
 * 组件里禁止就地写 `duration: 0.32` 这类魔法数字：同一层级的浮层必须共用一套曲线与弹簧，
 * 改一处就能整体对齐节奏。
 */
export const motionTokens = {
  ease: { standard, enter, exit },
  /** 位移时伴随的模糊量，配合 prefers-reduced-motion 一起降级为纯透明度。 */
  blur: { subtle: 3, soft: 6 },
  spring: { morph, glide, snappy, shell },
  duration: { instant: 0, quick: 0.12, base: 0.22, slow: 0.4 },
  /** 列表逐行入场的步长；一次粘贴多张图时用来错开，避免整列同时跳变。 */
  stagger: { item: 0.05 },
} as const
