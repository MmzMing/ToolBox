import { estimateGifBytes, checkBudget, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'
import { canvasForRatio, type Bounds, type FillMode } from '@/modules/gif/crop'
import type { GifTransparency } from '@/modules/gif/encode'
import type { MatteColor } from '@/modules/gif/image-frames'
import { targetOf, type PlatformTargetId } from '@/modules/gif/targets'

export const WIDTH_OPTIONS = [160, 240, 320, 400, 480] as const
export const FPS_OPTIONS = [2, 4, 5, 6, 8, 10, 12] as const
export const COLOR_OPTIONS = [256, 128, 64, 32] as const
export const MATTE_OPTIONS: readonly MatteColor[] = ['transparent', 'white', 'black']
export const MIN_FRAMES = 2

export type AspectId = 'source' | 'square' | 'sixteenNine' | 'fourThree' | 'nineSixteen'
export const ASPECTS: readonly { id: AspectId; ratio: number | null }[] = [
  { id: 'source', ratio: null },
  { id: 'square', ratio: 1 },
  { id: 'sixteenNine', ratio: 16 / 9 },
  { id: 'fourThree', ratio: 4 / 3 },
  { id: 'nineSixteen', ratio: 9 / 16 },
]

export const FILL_MODES: readonly FillMode[] = ['contain', 'cover', 'stretch']

export type MakerSettings = {
  /** 画布最长边（px） */
  width: number
  aspect: AspectId
  fill: FillMode
  fps: number
  loopCount: number
  matte: MatteColor
  colors: number
  dither: boolean
  optimize: boolean
  /** 'off' | 平台预设 id | 'custom' */
  target: string
  customKb: number
}

export const DEFAULT_SETTINGS: MakerSettings = {
  width: 320,
  aspect: 'source',
  fill: 'contain',
  fps: 5,
  loopCount: 0,
  matte: 'transparent',
  colors: 256,
  dither: false,
  optimize: true,
  target: 'off',
  customKb: 200,
}

/**
 * GIF 只有 1-bit 透明：白/黑底走不透明路径，透明底要显式给编码器一个阈值，
 * 否则 framesFromFiles 留下的 alpha 会在量化时被直接丢掉（导出的其实是不透明图）。
 */
export function transparencyFor(matte: MatteColor): GifTransparency | undefined {
  return matte === 'transparent' ? { threshold: 127, dispose: 2 } : undefined
}

/** 画布尺寸：比例跟随第一张图时按等比收口，锁定时长边 = width */
export function canvasOf(firstImage: Bounds, settings: MakerSettings): Bounds {
  const ratio = ASPECTS.find((item) => item.id === settings.aspect)?.ratio ?? null
  return canvasForRatio(ratio, firstImage, settings.width)
}

export function fpsToDelayCs(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`fps must be a positive number, got ${fps}`)
  }
  return Math.max(1, Math.round(100 / fps))
}

/** 只留静帧：动图 GIF 会被 createImageBitmap 悄悄取成首帧，宁可拒收 */
export function imageFilesOnly(files: readonly File[]): File[] {
  return files.filter((file) => file.type.startsWith('image/') && !/\.gif$/i.test(file.name))
}

export function rejectedFileCount(files: readonly File[], kept: readonly File[]): number {
  return files.length - kept.length
}

/** 逐帧覆盖优先于统一延时；overrides 与帧序一一对应，null 表示跟随统一值 */
export function delaysFor(
  count: number,
  uniformCs: number,
  overrides: readonly (number | null | undefined)[] = [],
): number[] {
  if (!Number.isInteger(uniformCs) || uniformCs < 1) {
    throw new Error(`uniform delay must be a positive integer, got ${uniformCs}`)
  }
  return Array.from({ length: count }, (_, index) => {
    const override = overrides[index]
    return override === null ||
      override === undefined ||
      !Number.isInteger(override) ||
      override < 1
      ? uniformCs
      : override
  })
}

export function makerBudget(
  frames: number,
  canvas: Bounds,
  uniformDelayCs: number,
  isMobile: boolean,
): BudgetVerdict {
  return checkBudget(
    {
      width: canvas.width,
      height: canvas.height,
      frames,
      seconds: (frames * uniformDelayCs) / 100,
    },
    limitsFor(isMobile),
  )
}

export function estimateBytes(frames: number, canvas: Bounds): number {
  return estimateGifBytes({ width: canvas.width, height: canvas.height, frames })
}

export function targetBytesFor(settings: MakerSettings): number | null {
  if (settings.target === 'off') {
    return null
  }
  if (settings.target === 'custom') {
    if (!Number.isFinite(settings.customKb) || settings.customKb <= 0) {
      throw new Error(`custom target must be a positive number of KB, got ${settings.customKb}`)
    }
    return Math.round(settings.customKb * 1024)
  }
  return targetOf(settings.target as PlatformTargetId).maxBytes
}
