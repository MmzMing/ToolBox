import { placementRect, type FillMode } from './crop'
import type { Bounds } from './crop'
import type { RgbaFrame } from './types'

export type MatteColor = 'transparent' | 'white' | 'black'

/** GIF 逻辑屏要求所有帧同尺寸，所以画布由一个尺寸决定，其余图片缩放进去 */
export function canvasForSource(source: Bounds, targetWidth: number): Bounds {
  const width = Math.max(1, Math.min(source.width, targetWidth))
  return { width, height: Math.max(1, Math.round((source.height / source.width) * width)) }
}

function matteColor(css: MatteColor): string | null {
  if (css === 'white') return '#ffffff'
  if (css === 'black') return '#000000'
  return null
}

/**
 * 把一张图片文件解码成 RGBA 帧。imageOrientation: 'from-image' 是关键——
 * 手机照片带 EXIF 旋转，不读它会把竖图编成横的。
 */
export async function frameFromImageFile(
  file: Blob,
  canvas: Bounds,
  delayCs: number,
  matte: MatteColor,
  fill: FillMode = 'contain',
): Promise<RgbaFrame> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const rect = placementRect({ width: bitmap.width, height: bitmap.height }, canvas, fill)
  const element = document.createElement('canvas')
  element.width = canvas.width
  element.height = canvas.height
  const ctx = element.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    throw new Error('canvas 2d context unavailable')
  }
  const background = matteColor(matte)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  // cover 模式下矩形会超出画布，drawImage 自动裁掉溢出部分
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
  bitmap.close()
  return {
    width: canvas.width,
    height: canvas.height,
    delayCs,
    rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
  }
}

/** 逐张解码：createImageBitmap 本身是异步的，循环里天然让出主线程，不需要额外分片 */
export async function framesFromFiles(
  files: readonly File[],
  canvas: Bounds,
  delaysCs: readonly number[],
  matte: MatteColor,
  fill: FillMode = 'contain',
  onProgress?: (done: number) => void,
): Promise<RgbaFrame[]> {
  const frames: RgbaFrame[] = []
  for (let index = 0; index < files.length; index += 1) {
    frames.push(await frameFromImageFile(files[index], canvas, delaysCs[index], matte, fill))
    onProgress?.(index + 1)
  }
  return frames
}
