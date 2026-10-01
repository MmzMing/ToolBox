import { checkBudget, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'
import type { GifDescriptor } from '@/modules/gif/types'
import { targetOf, type EncodeParams, type PlatformTargetId } from '@/modules/gif/targets'

export type CompressMode = 'manual' | 'target'

export type ManualOptions = {
  width: number
  maxColors: number
  lossy: number
  dither: boolean
}

export const MANUAL_WIDTHS = [160, 240, 320, 400, 480] as const
export const MANUAL_COLORS = [32, 64, 128, 256] as const
export const MANUAL_LOSSY = [0, 40, 80, 120, 160, 200] as const

/** 手动档一次给出参数与抖动开关，避免调用方漏传 dither 而静默降级 */
export function manualToPlan(manual: ManualOptions): { params: EncodeParams; dither: boolean } {
  return {
    params: {
      width: manual.width,
      // 压缩器没有 fps 杠杆（gifsicle 不改帧率），让它停在阶梯地板值
      fps: 5,
      maxColors: manual.maxColors,
      lossy: manual.lossy,
    },
    dither: manual.dither,
  }
}

export function targetBytesOf(preset: PlatformTargetId): number {
  return targetOf(preset).maxBytes
}

export function customTargetBytes(kb: number): number {
  if (!Number.isFinite(kb) || kb <= 0) {
    throw new Error(`custom target must be a positive number of KB, got ${kb}`)
  }
  return Math.round(kb * 1024)
}

export function budgetForDescriptor(descriptor: GifDescriptor, isMobile: boolean): BudgetVerdict {
  return checkBudget(
    {
      width: descriptor.width,
      height: descriptor.height,
      frames: descriptor.frameCount,
      seconds: descriptor.delaysCs.reduce((total, cs) => total + cs, 0) / 100,
    },
    limitsFor(isMobile),
  )
}

export type ResultSummary = {
  savedBytes: number
  /** 0..1，负数表示变大 */
  savedRatio: number
  grew: boolean
}

export function summarizeResult(originalBytes: number, resultBytes: number): ResultSummary {
  return {
    savedBytes: originalBytes - resultBytes,
    savedRatio: originalBytes === 0 ? 0 : (originalBytes - resultBytes) / originalBytes,
    grew: resultBytes > originalBytes,
  }
}
