import {
  assertCanvasSize,
  LONG_CANVAS_LIMITS,
  mimeTypeOf,
  supportsAlpha,
  type ExportOption,
  type Rect,
  type Scene,
  type Size,
} from './image-stack.service'
import type { LongLayout, LongStyle } from './long-stack.service'
import type { ReadyAsset } from './assets'
import type { SliceFile } from './export-zip'
import { yieldFrame } from './yield-frame'
import {
  renderLongStackToContext,
  renderSceneToContext,
  type AssetResolver,
  type CanvasFrame,
  type FrameEdges,
} from './render'

/** 一次导出所需的输入；长图的整张与分段共用同一份 */
export type LongExportTarget = {
  geometry: LongLayout
  style: LongStyle
  resolveAsset: AssetResolver
  option: ExportOption
}

/** JPEG 存不下 alpha，透明背景会渲染成黑底，这里补白而不是让用户拿到意外结果 */
function fillOpaqueBase(
  context: OffscreenCanvasRenderingContext2D,
  size: Size,
  frame: CanvasFrame,
  option: ExportOption,
): void {
  if (!supportsAlpha(option.format) && frame.background.type === 'transparent') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
  }
}

function contextOf(size: Size): {
  canvas: OffscreenCanvas
  context: OffscreenCanvasRenderingContext2D
} {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(size.width)),
    Math.max(1, Math.round(size.height)),
  )
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context unavailable')
  }
  return { canvas, context }
}

/**
 * convertToBlob 在画布超上限时不一定报错（Safari 会给出一张空图），
 * 所以把「体积为 0」当失败信号抛出去，由 UI 翻译成文案。
 */
async function convertChecked(
  canvas: OffscreenCanvas,
  option: ExportOption,
  size: Size,
): Promise<Blob> {
  const blob = await canvas.convertToBlob({
    type: mimeTypeOf(option.format),
    quality: option.quality,
  })
  if (blob.size === 0) {
    throw new Error(`Empty export: ${Math.round(size.width)}x${Math.round(size.height)}`)
  }
  return blob
}

/** 拼接成品：scene → OffscreenCanvas → blob */
export async function renderSceneToBlob(
  scene: Scene,
  resolveAsset: AssetResolver,
  option: ExportOption,
): Promise<Blob> {
  const { canvas, context } = contextOf(scene.canvas)
  fillOpaqueBase(context, scene.canvas, scene.style, option)
  renderSceneToContext(context, scene, resolveAsset)
  return convertChecked(canvas, option, scene.canvas)
}

/** 长图成品：整张，或只画 window 那一段 */
export async function renderLongToBlob(
  target: LongExportTarget,
  window?: Rect,
  edges: FrameEdges = 'all',
): Promise<Blob> {
  const { geometry, style, resolveAsset, option } = target
  const box = window ?? { x: 0, y: 0, width: geometry.width, height: geometry.height }
  // 超上限在这里就拦住：与其让 Safari 静默给一张纯背景图，不如抛给 UI 说话
  const size = assertCanvasSize({ width: box.width, height: box.height }, LONG_CANVAS_LIMITS)
  const { canvas, context } = contextOf(size)
  fillOpaqueBase(context, size, style, option)
  renderLongStackToContext(context, geometry, style, resolveAsset, {
    window: { ...box, ...size },
    edges,
  })
  return convertChecked(canvas, option, size)
}

/**
 * 按接缝分段导出。串行跑（每段一次 convertToBlob），段与段之间让出一帧，
 * 否则十几段的主线程连打会把页面钉死 —— 与 MAX_CELLS 那个注释同一个理由。
 */
export async function renderLongSegments(
  target: LongExportTarget,
  names: readonly string[],
): Promise<SliceFile[]> {
  const { geometry } = target
  const total = geometry.segments.length
  const files: SliceFile[] = []
  for (let index = 0; index < total; index += 1) {
    const window = geometry.segments[index]
    const edges: FrameEdges =
      total === 1 ? 'all' : index === 0 ? 'top' : index === total - 1 ? 'bottom' : 'none'
    files.push({ name: names[index], blob: await renderLongToBlob(target, window, edges) })
    await yieldFrame()
  }
  return files
}

/** 拆分切片：cells 是已 snap 到整数像素的源图矩形，逐格裁出编码 */
export async function renderSlices(
  source: ReadyAsset,
  cells: readonly Rect[],
  names: readonly string[],
  option: ExportOption,
): Promise<SliceFile[]> {
  const type = mimeTypeOf(option.format)
  const slices: SliceFile[] = []
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]
    const width = Math.max(1, Math.round(cell.width))
    const height = Math.max(1, Math.round(cell.height))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) {
      continue
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source.full, cell.x, cell.y, cell.width, cell.height, 0, 0, width, height)
    slices.push({
      name: names[index],
      blob: await canvas.convertToBlob({ type, quality: option.quality }),
    })
  }
  return slices
}

/** 复制到系统剪贴板：Safari 只吃 PNG，其余格式先转一道 */
export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  const payload = blob.type === 'image/png' ? blob : await toPng(blob)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': payload })])
}

async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Canvas 2D context unavailable')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/png' })
}
