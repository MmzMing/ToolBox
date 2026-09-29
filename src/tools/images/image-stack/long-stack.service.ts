import { sanitizeFileName } from '@/utils/file-name'

import {
  clamp,
  clamp01,
  LONG_CANVAS_LIMITS,
  MAX_CANVAS_SIDE,
  MAX_GAP,
  MAX_PADDING,
  MAX_RADIUS,
  MIN_CANVAS_SIDE,
  readBackground,
  readHexColor,
  readNumber,
  type Background,
  type CanvasLimits,
  type ExportFormat,
  type Rect,
} from './image-stack.service'

/**
 * 超长图堆叠的几何层：纵向流，不是二维网格。
 * 无缝长图与台词字幕共用这一条管线 —— 差别只是每张图保留多少底部，
 * 保留 100% 就是无缝，保留 12% 就是字幕条，所以不需要两套代码。
 */

/** 参与堆叠的张数上限：再多既是内存问题也没人真会往下滚 */
export const MAX_LONG_ITEMS = 60

/** 成品宽度可调区间 */
export const MAX_LONG_WIDTH = MAX_CANVAS_SIDE
export const MIN_LONG_WIDTH = 64

/** 保留底部比例的可调区间：低于 5% 基本只会截到半行字 */
export const MIN_KEEP_BOTTOM_PERCENT = 5
export const MAX_KEEP_BOTTOM_PERCENT = 100
export const DEFAULT_KEEP_BOTTOM_PERCENT = 100

/** 每张图裁完至少要剩几个源像素，防止两条通道叠出零高带 */
const MIN_BAND_HEIGHT = 1

/** 预览缩放档：1 = 适应视口宽度，再小只会浪费像素，放大才需要看细节 */
export const LONG_ZOOM_MIN = 1
export const LONG_ZOOM_MAX = 4

export function normalizeLongZoom(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return LONG_ZOOM_MIN
  }
  return clamp(raw, LONG_ZOOM_MIN, LONG_ZOOM_MAX)
}

export type LongWidthMode = 'narrowest' | 'widest' | 'first' | 'custom'
export const LONG_WIDTH_MODES: readonly LongWidthMode[] = ['narrowest', 'widest', 'first', 'custom']

export type LongAlign = 'left' | 'center' | 'right'
export const LONG_ALIGNMENTS: readonly LongAlign[] = ['left', 'center', 'right']

/** 窄于成品宽度的图，两侧那点空白是留背景色还是用自身模糊补白 */
export type LongNarrowFill = 'background' | 'blur'
export const LONG_NARROW_FILLS: readonly LongNarrowFill[] = ['background', 'blur']

export type LongCaptionPlace = 'tl' | 'tr' | 'bl' | 'br'
export const LONG_CAPTION_PLACES: readonly LongCaptionPlace[] = ['tl', 'tr', 'bl', 'br']

/**
 * 角标字体栈。canvas 的 `ctx.font` 与 DOM 的 `font-family` 吃同一串，
 * 否则预览里的字宽与导出差几个像素，位置就飘了。
 */
export const CAPTION_FONT = "ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif"

export const MAX_BAND_RADIUS = MAX_RADIUS
export const MAX_SHADOW_BLUR = 200
export const MAX_SHADOW_OFFSET = 200
export const MAX_SHADOW_OPACITY = 100
export const MAX_STACK_OVERLAP = 2000
export const MAX_CAPTION_SIZE = 300
export const MAX_CAPTION_INSET = 200

/** 一条带的卡片阴影；`blur` 为 0 就是不开 */
export type LongShadow = { blur: number; offsetY: number; opacity: number }

/** 每张图上的角标。`text` 支持 `{n}` `{total}` `{name}` 三个占位符 */
export type LongCaption = {
  enabled: boolean
  text: string
  size: number
  color: string
  place: LongCaptionPlace
  inset: number
}

/**
 * 一张图的两条顶部通道，刻意分开：
 * `keepBottomPercent` 是创作意图（只要底部那条字幕），`trimTopPx` 是去重叠结果。
 * 重新识别只动后者，不会把用户设好的前者冲掉。
 */
export type LongCrop = { keepBottomPercent: number; trimTopPx: number }

/** 一张图进入长图所需的全部输入；crop 为 null 表示继承全局默认 */
export type LongSource = {
  imageId: string
  width: number
  height: number
  crop: LongCrop | null
}

/** store 里按素材顺序存的逐张覆盖；长图里顺序就是自上而下的顺序 */
export type LongItem = { imageId: string; crop: LongCrop | null }

export type LongStyle = {
  widthMode: LongWidthMode
  /** 仅 widthMode 为 custom 时生效 */
  targetWidth: number
  /** 窄于成品宽度的图怎么落位（本层一律不放大图片） */
  align: LongAlign
  padding: number
  gap: number
  /** 相邻两条带上叠的 px，做卡片堆叠那种压盖感 */
  stackOverlap: number
  canvasRadius: number
  /** 每条带自己的圆角 */
  bandRadius: number
  narrowFill: LongNarrowFill
  shadow: LongShadow
  caption: LongCaption
  background: Background
}

/** 一张图在成品上占的那一条：源图裁切区间 + 整数成品矩形 */
export type LongBand = {
  imageId: string
  rect: Rect
  /** 源图坐标；换算到别的位图档位时按 sourceImageHeight 缩放 */
  sourceTop: number
  sourceHeight: number
  /** 算出上面两个数时所用的源图高度，预览的降采样图靠它换算 */
  sourceImageHeight: number
  /** 成品 px / 源图 px */
  scale: number
}

export type LongLayout = {
  width: number
  height: number
  bands: LongBand[]
  /**
   * 画布扣掉左右边距后真正放图的那一条竖向区域。
   * 模糊补白要铺满它，而不是只铺图片自身那一截。
   */
  content: { left: number; width: number }
  /**
   * 按接缝切出来的段，纵向首尾相接且 `Σ height === height`。
   * 切点一定是某张图的上沿，所以任何一段都不会切断一张图。
   */
  segments: Rect[]
  /** 单张图自己就放不进一段：只能让用户先减宽度或换图，导出前必须挡掉 */
  unsplittable: string[]
  maxSegmentHeight: number
}

export type LongPresetId = 'seamless' | 'subtitle' | 'screenshot'

/** 三种玩法只是三组默认参数；以后加玩法是加一行数据，不是加一套机制 */
export const LONG_PRESETS: readonly { id: LongPresetId; keepBottomPercent: number; gap: number }[] =
  [
    { id: 'seamless', keepBottomPercent: 100, gap: 0 },
    { id: 'subtitle', keepBottomPercent: 12, gap: 0 },
    { id: 'screenshot', keepBottomPercent: 100, gap: 0 },
  ]

export const DEFAULT_LONG_PRESET: LongPresetId = 'seamless'

/** 不开阴影、不开角标：默认值必须是无痕的，改外观要用户主动拧 */
export const DEFAULT_LONG_SHADOW: LongShadow = { blur: 0, offsetY: 12, opacity: 28 }

export const DEFAULT_LONG_CAPTION: LongCaption = {
  enabled: false,
  text: '{n}/{total}',
  size: 36,
  color: '#ffffff',
  place: 'br',
  inset: 20,
}

export const DEFAULT_LONG_STYLE: LongStyle = {
  widthMode: 'narrowest',
  targetWidth: 1080,
  align: 'center',
  padding: 0,
  gap: 0,
  stackOverlap: 0,
  canvasRadius: 0,
  bandRadius: 0,
  narrowFill: 'background',
  shadow: { ...DEFAULT_LONG_SHADOW },
  caption: { ...DEFAULT_LONG_CAPTION },
  background: { type: 'color', value: '#ffffff' },
}

export const DEFAULT_LONG_CROP: LongCrop = {
  keepBottomPercent: DEFAULT_KEEP_BOTTOM_PERCENT,
  trimTopPx: 0,
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return clamp01(value / 100) * 100
}

export function isLongPreset(raw: unknown): raw is LongPresetId {
  return LONG_PRESETS.some((item) => item.id === raw)
}

function presetOf(id: LongPresetId) {
  return LONG_PRESETS.find((item) => item.id === id) ?? LONG_PRESETS[0]
}

/** 预设只决定裁切与间距，宽度档与背景留给用户 */
export function longCropOfPreset(id: LongPresetId): LongCrop {
  return { keepBottomPercent: presetOf(id).keepBottomPercent, trimTopPx: 0 }
}

export function longGapOfPreset(id: LongPresetId): number {
  return presetOf(id).gap
}

/** 逐张覆盖与全局默认合并：缺字段保留默认那一项，非法值回落默认 */
export function resolveLongCrop(crop: LongCrop | null | undefined, defaults: LongCrop): LongCrop {
  if (!crop) {
    return { ...defaults }
  }
  return {
    keepBottomPercent: Number.isFinite(crop.keepBottomPercent)
      ? clampPercent(crop.keepBottomPercent, defaults.keepBottomPercent)
      : defaults.keepBottomPercent,
    trimTopPx:
      Number.isFinite(crop.trimTopPx) && crop.trimTopPx > 0
        ? Math.floor(crop.trimTopPx)
        : defaults.trimTopPx,
  }
}

/** 成品宽度；非自定义档由素材现场推导，一张可用宽度都没有时返回 null */
export function resolveTargetWidth(
  sources: readonly LongSource[],
  style: LongStyle,
): number | null {
  if (style.widthMode === 'custom') {
    return readNumber(
      style.targetWidth,
      DEFAULT_LONG_STYLE.targetWidth,
      MIN_LONG_WIDTH,
      MAX_LONG_WIDTH,
    )
  }
  const widths = sources.map((source) => source.width).filter((w) => Number.isFinite(w) && w > 0)
  if (widths.length === 0) {
    return null
  }
  const picked =
    style.widthMode === 'widest'
      ? Math.max(...widths)
      : style.widthMode === 'first'
        ? widths[0]
        : Math.min(...widths)
  return readNumber(picked, DEFAULT_LONG_STYLE.targetWidth, MIN_LONG_WIDTH, MAX_LONG_WIDTH)
}

/**
 * 一段最多能有多高：单边上限与面积上限取小的那个。
 * 1080 宽时面积先到顶（约 15534px），所以「放开单边」并不会让超限消失，
 * 真正的兜底是按接缝分段。
 */
export function segmentHeightOf(width: number, limits: CanvasLimits = LONG_CANVAS_LIMITS): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : MIN_CANVAS_SIDE
  return Math.max(MIN_CANVAS_SIDE, Math.min(limits.side, Math.floor(limits.area / safeWidth)))
}

/** 首张恒为完整显示，其余按保留比例与去重叠量算出源图区间 */
function sourceWindow(index: number, height: number, crop: LongCrop) {
  if (index === 0) {
    return { sourceTop: 0, sourceHeight: Math.max(MIN_BAND_HEIGHT, height) }
  }
  // 带子恒锚在源图底边：keep 决定多高，两条顶部通道只会把上沿继续往下推
  const keep = clamp(Math.round((height * crop.keepBottomPercent) / 100), 1, height)
  const creativeTop = height - keep
  const trimmedTop = creativeTop + clamp(Math.floor(crop.trimTopPx), 0, keep - MIN_BAND_HEIGHT)
  const top = clamp(Math.max(creativeTop, trimmedTop), 0, Math.max(0, height - 1))
  return { sourceTop: top, sourceHeight: Math.max(MIN_BAND_HEIGHT, height - top) }
}

/** 窄图按 align 落位；本层不放大任何图，所以 bandWidth 至多等于可用宽度 */
function bandX(width: number, bandWidth: number, align: LongAlign, padding: number): number {
  if (align === 'left') {
    return padding
  }
  if (align === 'right') {
    return width - padding - bandWidth
  }
  return Math.round((width - bandWidth) / 2)
}

export function resolveLongLayout(
  sources: readonly LongSource[],
  style: LongStyle,
  defaults: LongCrop,
  limits: CanvasLimits = LONG_CANVAS_LIMITS,
): LongLayout {
  const width = resolveTargetWidth(sources, style)
  if (width === null) {
    return {
      width: 0,
      height: 0,
      bands: [],
      content: { left: 0, width: 0 },
      segments: [],
      unsplittable: [],
      maxSegmentHeight: segmentHeightOf(MIN_CANVAS_SIDE, limits),
    }
  }
  // 边距再大也不能把画布宽吃穿，否则带子会落到画布外
  const padding = Math.min(style.padding, Math.floor(Math.max(0, width - MIN_CANVAS_SIDE) / 2))
  const available = Math.max(MIN_CANVAS_SIDE, width - padding * 2)
  const overlap = clamp(style.stackOverlap, 0, MAX_STACK_OVERLAP)
  const bands: LongBand[] = []
  // flow 用真实小数累加，矩形边界取整 —— 相邻两条共享同一个取整值，
  // 所以既不重叠也不留缝（与 resolveCells 的 snap 同一手法）
  let flow = padding
  capped(sources).forEach((source, index) => {
    if (index > 0) {
      const previous = bands[index - 1]
      // 上叠不许把一条带推回上一条上面去：矩形一反向，导出与分段就全乱了
      flow = Math.max(flow + style.gap - overlap, previous.rect.y + 1)
    }
    const crop = resolveLongCrop(source.crop, defaults)
    const { sourceTop, sourceHeight } = sourceWindow(index, source.height, crop)
    const scale = source.width > 0 ? Math.min(1, available / source.width) : 0
    const bandWidth = Math.max(1, Math.round(source.width * scale))
    const top = Math.round(flow)
    flow += sourceHeight * scale
    const bottom = Math.round(flow)
    bands.push({
      imageId: source.imageId,
      rect: {
        x: bandX(width, bandWidth, style.align, padding),
        y: top,
        width: bandWidth,
        height: Math.max(1, bottom - top),
      },
      sourceTop,
      sourceHeight,
      sourceImageHeight: source.height,
      scale,
    })
  })

  if (bands.length === 0) {
    return {
      width,
      height: 0,
      bands: [],
      content: { left: padding, width: available },
      segments: [],
      unsplittable: [],
      maxSegmentHeight: segmentHeightOf(width, limits),
    }
  }

  const height = Math.round(flow + padding)
  const maxSegmentHeight = segmentHeightOf(width, limits)
  const segments: Rect[] = []
  let cut = 0
  bands.forEach((band) => {
    const bottom = band.rect.y + band.rect.height
    // 只有切完上一段还剩东西才切，否则单张超限会切出零高段
    if (bottom - cut > maxSegmentHeight && band.rect.y > cut) {
      segments.push({ x: 0, y: cut, width, height: band.rect.y - cut })
      cut = band.rect.y
    }
  })
  segments.push({ x: 0, y: cut, width, height: height - cut })

  return {
    width,
    height,
    bands,
    content: { left: padding, width: available },
    segments,
    unsplittable: bands.filter((band) => band.rect.height > maxSegmentHeight).map((b) => b.imageId),
    maxSegmentHeight,
  }
}

/**
 * 某条带的模糊补白区：只有图比内容区窄才有必要，否则没有空白可填。
 * 铺的是整条内容区，所以两侧那两坨白由放大模糊后的自身盖住。
 */
export function longFillBox(band: LongBand, layout: LongLayout): Rect | null {
  if (band.rect.width >= layout.content.width) {
    return null
  }
  return {
    x: layout.content.left,
    y: band.rect.y,
    width: layout.content.width,
    height: band.rect.height,
  }
}

/** 模糊半径跟着画布宽走，给一个可调旋钮不值当 */
export function blurRadiusOf(width: number): number {
  return clamp(Math.round(width * 0.02), 6, 48)
}

/** 阴影不透明度 0..100 → alpha */
export function shadowAlpha(shadow: LongShadow): number {
  return clamp(shadow.opacity, 0, MAX_SHADOW_OPACITY) / 100
}

/** 角标的锚点：canvas 要 textAlign / textBaseline，CSS 那边用同一组数换算成 left/right/top/bottom */
export type CaptionAnchor = {
  x: number
  y: number
  align: 'left' | 'right'
  baseline: 'top' | 'bottom'
}

export function captionAnchor(band: LongBand, caption: LongCaption): CaptionAnchor {
  const inset = clamp(caption.inset, 0, MAX_CAPTION_INSET)
  const right = band.rect.x + band.rect.width - inset
  const bottom = band.rect.y + band.rect.height - inset
  if (caption.place === 'tl') {
    return { x: band.rect.x + inset, y: band.rect.y + inset, align: 'left', baseline: 'top' }
  }
  if (caption.place === 'tr') {
    return { x: right, y: band.rect.y + inset, align: 'right', baseline: 'top' }
  }
  if (caption.place === 'bl') {
    return { x: band.rect.x + inset, y: bottom, align: 'left', baseline: 'bottom' }
  }
  return { x: right, y: bottom, align: 'right', baseline: 'bottom' }
}

/** `{n}` `{total}` `{name}` 三个占位符；文件名去掉扩展名，角标上带 .png 很难看 */
export function captionText(template: string, index: number, total: number, name: string): string {
  return template
    .replaceAll('{n}', String(index + 1))
    .replaceAll('{total}', String(total))
    .replaceAll('{name}', name.replace(/\.[^.]+$/, ''))
}

function capped(sources: readonly LongSource[]): readonly LongSource[] {
  return sources.length > MAX_LONG_ITEMS ? sources.slice(0, MAX_LONG_ITEMS) : sources
}

function extensionOfLong(format: ExportFormat): string {
  return format === 'jpeg' ? 'jpg' : format === 'webp' ? 'webp' : 'png'
}

export function buildLongFileName(format: ExportFormat, createdAt = Date.now()): string {
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `image-stack-long-${stamp}.${extensionOfLong(format)}`
}

/** 分段名带上总段数，用户拿到一堆文件也知道先后 */
export function buildLongSegmentName(index: number, total: number, format: ExportFormat): string {
  const serial = String(index + 1).padStart(2, '0')
  const count = String(Math.max(1, total)).padStart(2, '0')
  return `long-image-${serial}-of-${count}.${extensionOfLong(format)}`
}

export function buildLongZipName(prefix = 'long-image'): string {
  return `${sanitizeFileName(prefix, 'long-image')}-segments.zip`
}

/** localStorage 可能被手工改坏，读取后逐字段兜底（AGENTS.md §8） */
export function normalizeLongStyle(raw: unknown): LongStyle {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    widthMode: LONG_WIDTH_MODES.includes(source.widthMode as LongWidthMode)
      ? (source.widthMode as LongWidthMode)
      : DEFAULT_LONG_STYLE.widthMode,
    targetWidth: readNumber(
      source.targetWidth,
      DEFAULT_LONG_STYLE.targetWidth,
      MIN_LONG_WIDTH,
      MAX_LONG_WIDTH,
    ),
    align: LONG_ALIGNMENTS.includes(source.align as LongAlign)
      ? (source.align as LongAlign)
      : DEFAULT_LONG_STYLE.align,
    padding: readNumber(source.padding, DEFAULT_LONG_STYLE.padding, 0, MAX_PADDING),
    gap: readNumber(source.gap, DEFAULT_LONG_STYLE.gap, 0, MAX_GAP),
    stackOverlap: readNumber(
      source.stackOverlap,
      DEFAULT_LONG_STYLE.stackOverlap,
      0,
      MAX_STACK_OVERLAP,
    ),
    canvasRadius: readNumber(source.canvasRadius, DEFAULT_LONG_STYLE.canvasRadius, 0, MAX_RADIUS),
    bandRadius: readNumber(source.bandRadius, DEFAULT_LONG_STYLE.bandRadius, 0, MAX_BAND_RADIUS),
    narrowFill: LONG_NARROW_FILLS.includes(source.narrowFill as LongNarrowFill)
      ? (source.narrowFill as LongNarrowFill)
      : DEFAULT_LONG_STYLE.narrowFill,
    shadow: normalizeLongShadow(source.shadow),
    caption: normalizeLongCaption(source.caption),
    background: readBackground(source.background),
  }
}

export function normalizeLongShadow(raw: unknown): LongShadow {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    blur: readNumber(source.blur, DEFAULT_LONG_SHADOW.blur, 0, MAX_SHADOW_BLUR),
    offsetY: readNumber(source.offsetY, DEFAULT_LONG_SHADOW.offsetY, 0, MAX_SHADOW_OFFSET),
    opacity: readNumber(source.opacity, DEFAULT_LONG_SHADOW.opacity, 0, MAX_SHADOW_OPACITY),
  }
}

export function normalizeLongCaption(raw: unknown): LongCaption {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    enabled: source.enabled === true,
    text: typeof source.text === 'string' ? source.text.slice(0, 60) : DEFAULT_LONG_CAPTION.text,
    size: readNumber(source.size, DEFAULT_LONG_CAPTION.size, 8, MAX_CAPTION_SIZE),
    color: readHexColor(source.color, DEFAULT_LONG_CAPTION.color),
    place: LONG_CAPTION_PLACES.includes(source.place as LongCaptionPlace)
      ? (source.place as LongCaptionPlace)
      : DEFAULT_LONG_CAPTION.place,
    inset: readNumber(source.inset, DEFAULT_LONG_CAPTION.inset, 0, MAX_CAPTION_INSET),
  }
}

/**
 * 全局保留比例走持久化，逐张覆盖（LongItem.crop）刻意不进 partialize：
 * newAssetId() 每次上传都发新 UUID，按 imageId 存下来的覆盖刷新后必然全是孤儿
 * —— 与拼接的 layers 同一个理由。
 */
export function normalizeLongCrop(raw: unknown): LongCrop {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    keepBottomPercent: readNumber(
      source.keepBottomPercent,
      DEFAULT_KEEP_BOTTOM_PERCENT,
      MIN_KEEP_BOTTOM_PERCENT,
      MAX_KEEP_BOTTOM_PERCENT,
    ),
    trimTopPx: readNumber(source.trimTopPx, 0, 0, Number.MAX_SAFE_INTEGER),
  }
}
