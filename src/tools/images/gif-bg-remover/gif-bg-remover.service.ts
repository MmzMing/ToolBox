import { checkBudget, estimateGifBytes, limitsFor, type BudgetVerdict } from '@/modules/gif/budget'
import type { Bounds } from '@/modules/gif/crop'
import type { GifWriterOptions } from '@/modules/gif/encode'
import {
  DEFAULT_MATTE_PARAMS,
  type MatteParams,
  type MatteStroke,
} from '@/modules/gif/matte-pipeline'
import type { ColorSeed, DitherMethod, MatteOutput } from '@/modules/gif/matte'
import type { GifDescriptor } from '@/modules/gif/types'

/**
 * matte = 合成到纯色底（默认，最稳）；transparent = 1-bit 硬边；
 * dither = 1-bit + alpha 抖动模拟软边；png = 只导出逐帧 PNG 序列（真 alpha，不进 GIF 编码器）。
 */
export type OutputModeId = 'matte' | 'transparent' | 'dither' | 'png'
export const OUTPUT_MODES: readonly OutputModeId[] = ['matte', 'transparent', 'dither', 'png']
export const DITHER_METHODS: readonly DitherMethod[] = ['bayer8', 'floyd-steinberg']
export const COLOR_OPTIONS = [256, 128, 64] as const
export const DEFAULT_MATTE_COLOR = '#ffffff'

export type RemoverSettings = {
  /** auto = 只信时域差值，key = 只信取色，both = 两者组合 */
  engine: 'auto' | 'key' | 'both'
  /** 差值 matting 的噪声地板（α 单位） */
  threshold: number
  /** 差值 matting 的软边斜坡宽度（α 单位） */
  ramp: number
  /** 色键容差（Lab ΔE） */
  tolerance: number
  keyRamp: number
  connected: boolean
  combine: 'min' | 'max'
  /** 形态学开/闭的半径，0 = 关闭 */
  morph: number
  guided: boolean
  /** 边缘收缩（正）/ 扩张（负），单位 px */
  edge: number
  feather: number
  /** 跨帧中值的单边半径，0 = 关闭 */
  temporal: number
  /** 绿幕去溢色强度，0..100 */
  despill: number
  decontaminate: boolean
  matteColor: string
  binaryThreshold: number
  dither: DitherMethod
  colors: number
  output: OutputModeId
}

export const DEFAULT_SETTINGS: RemoverSettings = {
  /** 默认取色：一帧 GIF 的「背景是什么」由用户点一下最可靠，自动档留给愿意试的人切 */
  engine: 'key',
  threshold: 24,
  ramp: 96,
  tolerance: 14,
  keyRamp: 24,
  connected: true,
  combine: 'min',
  morph: 1,
  guided: true,
  edge: 0,
  feather: 1,
  temporal: 1,
  despill: 0,
  decontaminate: false,
  matteColor: DEFAULT_MATTE_COLOR,
  binaryThreshold: 127,
  dither: 'bayer8',
  colors: 256,
  output: 'matte',
}

export function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const packed = Number.parseInt(match[1], 16)
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}

export function toHexColor(color: readonly [number, number, number]): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function matteParams(settings: RemoverSettings): MatteParams {
  return {
    ...DEFAULT_MATTE_PARAMS,
    mode: settings.engine,
    difference: { threshold: settings.threshold, softness: settings.ramp },
    key: {
      tolerance: settings.tolerance,
      softness: settings.keyRamp,
      connected: settings.connected,
    },
    combine: settings.combine,
    open: settings.morph,
    close: settings.morph,
    guided: settings.guided,
    edge: settings.edge,
    feather: settings.feather,
    temporal: settings.temporal,
    despillStrength: settings.despill / 100,
    decontaminateEdges: settings.decontaminate,
  }
}

export function matteOutput(settings: RemoverSettings): MatteOutput {
  switch (settings.output) {
    case 'matte':
      return { mode: 'matte', color: parseHexColor(settings.matteColor) ?? [255, 255, 255] }
    case 'transparent':
      return { mode: 'binary', threshold: settings.binaryThreshold }
    case 'dither':
      return { mode: 'dither', method: settings.dither }
    case 'png':
      return { mode: 'alpha' }
  }
}

/**
 * 只有真透明的两档需要向编码器要 1-bit 透明槽。
 * alpha 已经在上游二值化过，这里的阈值只是「非 0 即留」的形式确认。
 */
export function encodeOptions(
  settings: RemoverSettings,
  descriptor: GifDescriptor | null,
): GifWriterOptions {
  const transparent = settings.output === 'transparent' || settings.output === 'dither'
  return {
    maxColors: settings.colors,
    loopCount: descriptor?.loopCount ?? 0,
    delayCs: descriptor?.delaysCs[0] ?? 10,
    transparency: transparent ? { threshold: 127, dispose: 2 } : undefined,
  }
}

export function removerBudget(
  descriptor: Pick<GifDescriptor, 'width' | 'height' | 'frameCount' | 'delaysCs'>,
  isMobile: boolean,
): BudgetVerdict {
  const seconds = descriptor.delaysCs.reduce((total, cs) => total + cs, 0) / 100
  return checkBudget(
    { width: descriptor.width, height: descriptor.height, frames: descriptor.frameCount, seconds },
    limitsFor(isMobile),
  )
}

export function estimateOutputBytes(descriptor: GifDescriptor): number {
  return estimateGifBytes({
    width: descriptor.width,
    height: descriptor.height,
    frames: descriptor.frameCount,
  })
}

/** 帧太少时自动模式没有中值可用，只能退回取色 */
export function canUseAutoEngine(frameCount: number): boolean {
  return frameCount >= 3
}

export function stageScale(box: Bounds, source: Bounds, isMobile: boolean): number {
  // 手机上不许放大：预览放大到手指能点准，但边缘判错也跟着放大
  const cap = isMobile ? 1 : 4
  const scale = Math.min(box.width / source.width, box.height / source.height)
  return Math.max(0.05, Math.min(scale, cap))
}

export function exportName(fileName: string, settings: RemoverSettings): string {
  const stem = fileName.replace(/\.[^.]*$/, '') || 'animation'
  return settings.output === 'png' ? `${stem}-frames.zip` : `${stem}-nobg.gif`
}

/** 画笔状态：pendingStroke 是手指还在动的那一笔，只喂给预览，不落到历史里 */
export type StrokeDraft = { points: { x: number; y: number }[]; mode: 'keep' | 'erase' }

/**
 * 指针工具三合一：取色、擦除、保留。
 * 原来要先选「画笔」再选「保留/擦除」两下才能开始画，这里压成一步。
 */
export type CanvasTool = 'pick' | 'erase' | 'restore'

export const CANVAS_TOOLS: readonly CanvasTool[] = ['pick', 'erase', 'restore']

export function toolStrokeMode(tool: CanvasTool): 'keep' | 'erase' {
  return tool === 'restore' ? 'keep' : 'erase'
}

/** 常用底色：白与黑是表情/贴纸的两档，另两档给浅色与深色页面 */
export const MATTE_SWATCHES: readonly string[] = ['#ffffff', '#000000', '#f5f5f4', '#292524']

export function draftStroke(
  draft: StrokeDraft,
  radius: number,
  applyToAll: boolean,
  frameIndex: number,
): MatteStroke {
  return {
    frameIndex: applyToAll ? null : frameIndex,
    stroke: {
      mode: draft.mode,
      radius,
      feather: Math.max(1, Math.round(radius / 2)),
      points: draft.points,
    },
  }
}

export function pngFrameName(index: number): string {
  return `frame-${String(index).padStart(3, '0')}.png`
}

/** 种子加到这么多就够用了：再多的取色点只会让容差解释不清 */
export const MAX_SEEDS = 8

export function pushSeed(seeds: readonly ColorSeed[], seed: ColorSeed): ColorSeed[] {
  const next = [...seeds, seed]
  return next.length > MAX_SEEDS ? next.slice(next.length - MAX_SEEDS) : next
}
