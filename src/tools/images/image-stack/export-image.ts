import {
  mimeTypeOf,
  supportsAlpha,
  type ExportOption,
  type Rect,
  type Scene,
} from './image-stack.service'
import type { ReadyAsset } from './assets'
import type { SliceFile } from './export-zip'
import { renderSceneToContext, type AssetResolver } from './render'

/** 拼接成品：scene → OffscreenCanvas → blob */
export async function renderSceneToBlob(
  scene: Scene,
  resolveAsset: AssetResolver,
  option: ExportOption,
): Promise<Blob> {
  const { width, height } = scene.canvas
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context unavailable')
  }
  // JPEG 存不下 alpha，透明背景会渲染成黑底，这里补白而不是让用户拿到意外结果
  if (!supportsAlpha(option.format) && scene.style.background.type === 'transparent') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  renderSceneToContext(context, scene, resolveAsset)
  return canvas.convertToBlob({ type: mimeTypeOf(option.format), quality: option.quality })
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
