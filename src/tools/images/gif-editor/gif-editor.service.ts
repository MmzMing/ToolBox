import { checkBudget, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'
import type { Bounds, Rect } from '@/modules/gif/crop'
import { applySpeedFactor, secondsOf } from '@/modules/gif/speed'
import type { RotateDegrees } from '@/modules/gif/transform'
import type { RgbaFrame } from '@/modules/gif/types'

export const WIDTH_OPTIONS = [160, 240, 320, 400, 480] as const
/** 简易只给全局配置，详情再摊开逐帧操作 */
export const EDITOR_MODES = ['simple', 'detail'] as const
export type EditorMode = (typeof EDITOR_MODES)[number]
export const ROTATIONS: readonly RotateDegrees[] = [0, 90, 180, 270]
export const CROP_RATIOS: readonly { id: string; ratio: number | null }[] = [
  { id: 'free', ratio: null },
  { id: 'square', ratio: 1 },
  { id: 'sixteenNine', ratio: 16 / 9 },
  { id: 'fourThree', ratio: 4 / 3 },
  { id: 'nineSixteen', ratio: 9 / 16 },
]

export type EditorTransforms = {
  rotate: RotateDegrees
  /** 两个轴各自独立开关，所以左右镜像和上下颠倒可以同时开 */
  flipX: boolean
  flipY: boolean
  /** 裁剪框在「旋转后」的帧坐标系里，所见即所得；null 表示不裁 */
  crop: Rect | null
  speed: number
  /** 输出最长边 */
  width: number
  loopCount: number
  optimize: boolean
}

/** 一步可撤销的画面状态：帧序列 + 全局变换 + 当前比例档；选择集与文件名不进栈 */
export type EditSnapshot = {
  frames: readonly RgbaFrame[]
  transforms: EditorTransforms
  ratioId: string
}

/** 撤销栈深度：再往上翻基本不是「上一步」而是「昨天」，还白白留着上百帧像素 */
export const MAX_UNDO_STEPS = 20

/** 压一步快照并裁掉最老的，保证栈不会随着反复操作无限涨 */
export function pushSnapshot(
  history: readonly EditSnapshot[],
  snapshot: EditSnapshot,
): EditSnapshot[] {
  const next = [...history, snapshot]
  return next.length > MAX_UNDO_STEPS ? next.slice(next.length - MAX_UNDO_STEPS) : next
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

/**
 * 预览画布的尺寸永远按「旋转后整帧」算，不含裁剪。
 * 裁剪框活在整帧坐标系里，画布一旦跟着裁剪结果缩，框就会被二次压缩成错误的比例。
 */
export function previewSize(source: Bounds, transforms: EditorTransforms): Bounds {
  return scaleToFit(sizeAfterRotate(source, transforms.rotate), transforms.width)
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

/** 乒乓后的帧数：正放一遍再折返，去掉首尾重复帧。弹窗要先拿它报数 */
export function boomerangCount(frames: number): number {
  return frames < 2 ? frames : frames * 2 - 2
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
