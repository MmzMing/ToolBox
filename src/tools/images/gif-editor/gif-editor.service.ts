import { checkBudget, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'
import type { Bounds, Rect } from '@/modules/gif/crop'
import { applySpeedFactor, secondsOf } from '@/modules/gif/speed'
import type { RotateDegrees } from '@/modules/gif/transform'

export const WIDTH_OPTIONS = [160, 240, 320, 400, 480] as const
export const ROTATIONS: readonly RotateDegrees[] = [0, 90, 180, 270]
export type Flip = 'none' | 'horizontal' | 'vertical'
export const FLIPS: readonly Flip[] = ['none', 'horizontal', 'vertical']
export const CROP_RATIOS: readonly { id: string; ratio: number | null }[] = [
  { id: 'free', ratio: null },
  { id: 'square', ratio: 1 },
  { id: 'sixteenNine', ratio: 16 / 9 },
  { id: 'fourThree', ratio: 4 / 3 },
  { id: 'nineSixteen', ratio: 9 / 16 },
]

export type EditorTransforms = {
  rotate: RotateDegrees
  flip: Flip
  /** 裁剪框在「旋转后」的帧坐标系里，所见即所得；null 表示不裁 */
  crop: Rect | null
  speed: number
  /** 输出最长边 */
  width: number
  loopCount: number
  optimize: boolean
}

export function sizeAfterRotate(size: Bounds, rotate: RotateDegrees): Bounds {
  return rotate === 90 || rotate === 270 ? { width: size.height, height: size.width } : size
}

/** 按最长边收口：旋转后长边可能是高，只限宽会顶破高度上限 */
export function scaleToFit(source: Bounds, maxEdge: number): Bounds {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge) {
    return { width: source.width, height: source.height }
  }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/** 变换链的最终输出尺寸：旋转 → 裁剪 → 缩放 */
export function exportSize(source: Bounds, transforms: EditorTransforms): Bounds {
  const rotated = sizeAfterRotate(source, transforms.rotate)
  const cropped = transforms.crop ?? rotated
  return scaleToFit(cropped, transforms.width)
}

/** 倍速作用在每帧的基准延时上（逐帧覆盖值已经写回 frames，这里只负责缩放） */
export function frameDelays(
  frames: readonly { delayCs: number }[],
  speed: number,
): { delaysCs: number[]; clamped: number } {
  return applySpeedFactor(
    frames.map((frame) => frame.delayCs),
    speed,
  )
}

export function editorBudget(
  delaysCs: readonly number[],
  size: Bounds,
  isMobile: boolean,
): BudgetVerdict {
  return checkBudget(
    {
      width: size.width,
      height: size.height,
      frames: delaysCs.length,
      seconds: secondsOf(delaysCs),
    },
    limitsFor(isMobile),
  )
}

export function pngFrameName(base: string, index: number): string {
  return `${base}-frame-${String(index + 1).padStart(3, '0')}.png`
}

/**
 * 载入进度只在阶段边界跳：读文件与帧合成都是一整段同步工作，
 * 中间没有可信百分比可插，做假平滑只会让「卡住了」和「在跑」看起来一样。
 */
export const LOAD_STEPS = [
  { phase: 'read', percent: 10 },
  { phase: 'parse', percent: 40 },
  { phase: 'frames', percent: 75 },
] as const

export type LoadPhase = (typeof LOAD_STEPS)[number]['phase']

export function loadPercent(phase: LoadPhase): number {
  return LOAD_STEPS.find((step) => step.phase === phase)?.percent ?? 0
}
