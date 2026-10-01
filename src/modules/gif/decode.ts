import { decode, decodeFrames } from 'modern-gif'
import type { GifDescriptor, RgbaFrame } from './types'

/** 解码的两个可上报阶段：解析出帧数 → 合成完整帧 */
export type DecodePhase = 'parse' | 'frames'

export type DecodedGif = {
  descriptor: GifDescriptor
  /** 已按 disposal 合成到逻辑全屏的逐帧 RGBA（等价于 gifsicle 的 --unoptimize） */
  frames: RgbaFrame[]
}

export function decodeGif(
  source: ArrayBuffer,
  onPhase?: (phase: DecodePhase, frameCount: number) => void,
): DecodedGif {
  let gif: ReturnType<typeof decode>
  let frames: ReturnType<typeof decodeFrames>
  try {
    gif = decode(source)
    onPhase?.('parse', gif.frames.length)
    // 复用已解析的 gif：合成器不必再把整条文件头与调色板解一遍
    frames = decodeFrames(source, { gif })
  } catch (error) {
    throw new Error('failed to parse gif', { cause: error })
  }
  onPhase?.('frames', frames.length)
  if (frames.length === 0) {
    throw new Error('gif contains no frames')
  }
  return {
    descriptor: {
      width: gif.width,
      height: gif.height,
      frameCount: frames.length,
      loopCount: gif.looped ? (gif.loopCount ?? 0) : null,
      delaysCs: frames.map((frame) => Math.max(1, Math.round(frame.delay / 10))),
    },
    frames: frames.map((frame) => ({
      width: frame.width,
      height: frame.height,
      delayCs: Math.max(1, Math.round(frame.delay / 10)),
      rgba: frame.data,
    })),
  }
}
