import { applyPalette, GIFEncoder, quantize } from 'gifenc/dist/gifenc.esm.js'
import { rgbaLength, toOwnBuffer, type RgbaFrame, type RgbaImage } from './types'

export type GifWriterOptions = {
  /** 逐帧独立调色板的颜色上限 */
  maxColors: number
  /** null 表示不写 NETSCAPE 扩展，即不循环 */
  loopCount: number | null
  /** 帧未显式指定延时时的缺省值（centisecond） */
  delayCs: number
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
  const { maxColors, loopCount, delayCs } = options

  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256) {
    throw new Error(`maxColors must be an integer in 2..256, got ${maxColors}`)
  }
  if (!Number.isInteger(delayCs) || delayCs < 1) {
    throw new Error(`delayCs must be a positive integer, got ${delayCs}`)
  }
  if (loopCount !== null && (!Number.isInteger(loopCount) || loopCount < 0)) {
    throw new Error(`loopCount must be a non-negative integer or null, got ${loopCount}`)
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
      const palette = quantize(rgba, maxColors)
      const index = applyPalette(rgba, palette)
      gif.writeFrame(index, image.width, image.height, {
        palette,
        // gifenc 的 delay 以毫秒入参，内部再 Math.round(delay / 10) 落到 centisecond
        delay: frameDelayCs * 10,
        repeat: frameCount === 0 ? (loopCount ?? -1) : 0,
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
