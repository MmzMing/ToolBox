import { checkBudget, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'

export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm'
export const FPS_OPTIONS = [5, 8, 10, 12, 15, 24] as const
export const WIDTH_OPTIONS = [160, 240, 320, 400, 480] as const

export type AspectId = 'source' | 'square' | 'sixteenNine' | 'fourThree'

export const ASPECTS: readonly { id: AspectId; ratio: number | null }[] = [
  { id: 'source', ratio: null },
  { id: 'square', ratio: 1 },
  { id: 'sixteenNine', ratio: 16 / 9 },
  { id: 'fourThree', ratio: 4 / 3 },
]

const SUPPORTED_EXT = /\.(mp4|m4v|webm|mov)$/i
/** 只认这三种 MIME：`video/x-matroska` 之类同样以 video/ 开头，但浏览器解不了 */
const SUPPORTED_MIME = ['video/mp4', 'video/webm', 'video/quicktime']

export function isVideoFile(file: File): boolean {
  return SUPPORTED_MIME.includes(file.type) || SUPPORTED_EXT.test(file.name)
}

export function sizeForCrop(
  crop: { width: number; height: number },
  targetWidth: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.min(crop.width, targetWidth))
  return { width, height: Math.max(1, Math.round((crop.height / crop.width) * width)) }
}

export function rangeSeconds(startSec: number, endSec: number): number {
  if (!(endSec > startSec)) {
    throw new Error(`end ${endSec}s must be after start ${startSec}s`)
  }
  return endSec - startSec
}

export function videoBudget(input: {
  frames: number
  size: { width: number; height: number }
  delayCs: number
  isMobile: boolean
}): BudgetVerdict {
  return checkBudget(
    {
      width: input.size.width,
      height: input.size.height,
      frames: input.frames,
      seconds: (input.frames * input.delayCs) / 100,
    },
    limitsFor(input.isMobile),
  )
}

export function gifFileName(videoName: string): string {
  return `${videoName.replace(/\.[^.]+$/i, '') || 'clip'}.gif`
}
