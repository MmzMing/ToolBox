import { applyPalette, GIFEncoder, quantize } from 'gifenc/dist/gifenc.esm.js'
import { rgbaLength, toOwnBuffer, type RgbaFrame, type RgbaImage } from './types'

export type GifTransparency = {
  /** alpha <= threshold 的像素写成完全透明（GIF 只有 1-bit 透明，没有软边缘可言） */
  threshold: number
  /** GIF disposal method。全屏合成 + 逐帧透明必须 2（还原背景），否则上一帧会在透明区留下残影 */
  dispose?: 0 | 1 | 2 | 3
  /** 透明像素的 RGB 清理色（0..255 灰阶）；留着源像素的随机 RGB 会被忽略透明的查看器显示成彩噪 */
  clearColor?: number
}

export type GifWriterOptions = {
  /** 逐帧独立调色板的颜色上限 */
  maxColors: number
  /** null 表示不写 NETSCAPE 扩展，即不循环 */
  loopCount: number | null
  /** 帧未显式指定延时时的缺省值（centisecond） */
  delayCs: number
  /** 省略时输出不透明 GIF：alpha 通道被直接丢弃，与既有工具的行为完全一致 */
  transparency?: GifTransparency
}

export type GifWriter = {
  addFrame(image: RgbaImage, frameDelayCs?: number): void
  finish(): Uint8Array<ArrayBuffer>
  readonly frameCount: number
}

/**
 * 逐帧 writeFrame 流式写入：只有压缩后的字节常驻，RGBA 可以一帧一帧地喂进来。
 * 480x270x300 帧若整帧常驻是 148MB，流式则不到 1MB（实测见设计文档 §12）。
 */
export function createGifWriter(options: GifWriterOptions): GifWriter {
  const { maxColors, loopCount, delayCs, transparency } = options

  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256) {
    throw new Error(`maxColors must be an integer in 2..256, got ${maxColors}`)
  }
  if (!Number.isInteger(delayCs) || delayCs < 1) {
    throw new Error(`delayCs must be a positive integer, got ${delayCs}`)
  }
  if (loopCount !== null && (!Number.isInteger(loopCount) || loopCount < 0)) {
    throw new Error(`loopCount must be a non-negative integer or null, got ${loopCount}`)
  }

  let alpha: { threshold: number; dispose: number; clearColor: number } | null = null
  if (transparency) {
    // 透明槽要占掉一个色位，maxColors=2 时只剩 1 个不透明色，量化器没有意义
    if (maxColors < 3) {
      throw new Error(`transparency needs maxColors >= 3, got ${maxColors}`)
    }
    const { threshold, dispose = 2, clearColor = 0 } = transparency
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
      throw new Error(`transparency.threshold must be an integer in 0..255, got ${threshold}`)
    }
    if (!Number.isInteger(clearColor) || clearColor < 0 || clearColor > 255) {
      throw new Error(`transparency.clearColor must be an integer in 0..255, got ${clearColor}`)
    }
    alpha = { threshold, dispose, clearColor }
  }

  const gif = GIFEncoder()
  let frameCount = 0
  let finished = false

  return {
    addFrame(image, frameDelayCs = delayCs) {
      if (finished) {
        throw new Error('gif writer already finished')
      }
      if (!Number.isInteger(frameDelayCs) || frameDelayCs < 1) {
        throw new Error(`delayCs must be a positive integer, got ${frameDelayCs}`)
      }
      if (image.rgba.length !== rgbaLength(image.width, image.height)) {
        throw new Error(
          `rgba length ${image.rgba.length} does not match ${image.width}x${image.height}`,
        )
      }
      const rgba = toOwnBuffer(image.rgba)
      // gifenc 的 delay 以毫秒入参，内部再 Math.round(delay / 10) 落到 centisecond
      const delay = frameDelayCs * 10
      const repeat = frameCount === 0 ? (loopCount ?? -1) : 0

      if (!alpha) {
        const palette = quantize(rgba, maxColors)
        const index = applyPalette(rgba, palette)
        gif.writeFrame(index, image.width, image.height, { palette, delay, repeat })
        frameCount += 1
        return
      }

      const { flattened, transparentPixels } = flattenAlpha(rgba, alpha)
      // 透明槽由我们自己追加：gifenc 的 rgba4444 路径在 PNN 合并阶段不计 alpha 距离，
      // 透明 bin 有概率被并进不透明 bin，整帧就会悄悄丢掉透明槽。
      const palette = quantize(flattened, maxColors - 1)
      const index = applyPalette(flattened, palette)

      if (transparentPixels === 0) {
        gif.writeFrame(index, image.width, image.height, {
          palette,
          delay,
          repeat,
          dispose: alpha.dispose,
        })
        frameCount += 1
        return
      }

      palette.push([alpha.clearColor, alpha.clearColor, alpha.clearColor, 0])
      const transparentIndex = palette.length - 1
      // applyPalette 只看 RGB，透明像素的槽位必须由阈值说了算
      for (let pixel = 0, a = 3; a < flattened.length; pixel++, a += 4) {
        if (flattened[a] === 0) index[pixel] = transparentIndex
      }
      gif.writeFrame(index, image.width, image.height, {
        palette,
        delay,
        repeat,
        transparent: true,
        transparentIndex,
        dispose: alpha.dispose,
      })
      frameCount += 1
    },
    finish() {
      if (finished) {
        throw new Error('gif writer already finished')
      }
      if (frameCount === 0) {
        throw new Error('cannot finish a gif without frames')
      }
      gif.finish()
      finished = true
      return gif.bytes()
    },
    get frameCount() {
      return frameCount
    },
  }
}

/**
 * GIF 只有 1-bit 透明，所以先把 alpha 压成 0/255 两档，并把透明像素的 RGB 洗成清理色。
 * 写入副本而不改调用方的帧数据：同一批帧会被反复重算与重导出。
 */
function flattenAlpha(
  rgba: Uint8ClampedArray,
  alpha: { threshold: number; clearColor: number },
): { flattened: Uint8ClampedArray; transparentPixels: number } {
  const { threshold, clearColor } = alpha
  const flattened = new Uint8ClampedArray(rgba.length)
  let transparentPixels = 0

  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] <= threshold) {
      transparentPixels += 1
      flattened[i] = clearColor
      flattened[i + 1] = clearColor
      flattened[i + 2] = clearColor
      flattened[i + 3] = 0
    } else {
      flattened[i] = rgba[i]
      flattened[i + 1] = rgba[i + 1]
      flattened[i + 2] = rgba[i + 2]
      flattened[i + 3] = 255
    }
  }

  return { flattened, transparentPixels }
}

/** 一次性把整段帧序列编成 GIF（帧数受 budget 上限约束，不是无界流） */
export function encodeFrames(
  frames: readonly RgbaFrame[],
  options: GifWriterOptions,
): Uint8Array<ArrayBuffer> {
  const writer = createGifWriter(options)
  for (const frame of frames) {
    writer.addFrame(frame, frame.delayCs)
  }
  return writer.finish()
}
