import type { Rect } from './crop'
import { rgbaLength, type RgbaImage } from './types'

export type RotateDegrees = 0 | 90 | 180 | 270

/**
 * ImageData 只接受独占 ArrayBuffer 的缓冲区，而解码器给出的帧类型上更宽，
 * 这里收口一次，避免每个调用点各写一遍断言。
 */
export function frameToImageData(frame: RgbaImage): ImageData {
  return new ImageData(frame.rgba as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height)
}

function copyPixel(from: Uint8ClampedArray, to: Uint8ClampedArray, src: number, dst: number) {
  to[dst] = from[src]
  to[dst + 1] = from[src + 1]
  to[dst + 2] = from[src + 2]
  to[dst + 3] = from[src + 3]
}

function rotateOnce(image: RgbaImage): RgbaImage {
  const { width, height, rgba } = image
  const out = new Uint8ClampedArray(rgba.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      copyPixel(rgba, out, (y * width + x) * 4, (x * height + (height - 1 - y)) * 4)
    }
  }
  return { width: height, height: width, rgba: out }
}

/** 顺时针旋转。GIF 没有变换矩阵，只能逐像素搬，所以做成纯函数便于单测 */
export function rotateImage(image: RgbaImage, degrees: RotateDegrees): RgbaImage {
  if (![0, 90, 180, 270].includes(degrees)) {
    throw new Error(`unsupported rotation: ${degrees}`)
  }
  let out = image
  for (let step = 0; step < degrees / 90; step += 1) {
    out = rotateOnce(out)
  }
  return out
}

/** 逐行 memcpy 的矩形裁剪；rect 必须完全落在图内，越界直接抛错而不是静默裁歪 */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const { x, y, width, height } = rect
  if (
    ![x, y, width, height].every(Number.isInteger) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > image.width ||
    y + height > image.height
  ) {
    throw new Error(
      `crop rect ${x},${y}+${width}x${height} is outside ${image.width}x${image.height}`,
    )
  }
  if (x === 0 && y === 0 && width === image.width && height === image.height) {
    return image
  }
  const out = new Uint8ClampedArray(width * height * 4)
  const stride = width * 4
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * image.width + x) * 4
    out.set(image.rgba.subarray(from, from + stride), row * stride)
  }
  return { width, height, rgba: out }
}

export function flipImage(image: RgbaImage, axis: 'horizontal' | 'vertical'): RgbaImage {
  const { width, height, rgba } = image
  const out = new Uint8ClampedArray(rgba.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4
      const targetX = axis === 'horizontal' ? width - 1 - x : x
      const targetY = axis === 'vertical' ? height - 1 - y : y
      copyPixel(rgba, out, source, (targetY * width + targetX) * 4)
    }
  }
  return { width, height, rgba: out }
}

/** 双线性由浏览器代劳：先 putImageData 再 drawImage 缩放，最后读回 RGBA */
export function resizeImage(image: RgbaImage, size: { width: number; height: number }): RgbaImage {
  if (image.width === size.width && image.height === size.height) {
    return image
  }
  if (size.width < 1 || size.height < 1) {
    throw new Error(`invalid resize target ${size.width}x${size.height}`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('canvas 2d context unavailable')
  }
  ctx.putImageData(frameToImageData(image), 0, 0)

  const scaled = document.createElement('canvas')
  scaled.width = size.width
  scaled.height = size.height
  const scaledCtx = scaled.getContext('2d')
  if (!scaledCtx) {
    throw new Error('canvas 2d context unavailable')
  }
  scaledCtx.drawImage(canvas, 0, 0, size.width, size.height)
  const data = scaledCtx.getImageData(0, 0, size.width, size.height).data
  if (data.length !== rgbaLength(size.width, size.height)) {
    throw new Error('unexpected pixel buffer length')
  }
  return { width: size.width, height: size.height, rgba: data }
}
