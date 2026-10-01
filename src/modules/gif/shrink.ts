import { optimizeOptionsFor, type GifsicleOptions } from './optimize'
import { searchUnderTarget, stepAt, type EncodeParams } from './targets'

export type ShrinkOutcome = {
  blob: Blob
  params: EncodeParams
  rounds: number
  ok: boolean
}

export type ShrinkInput = {
  /** 待缩小的 GIF 字节 */
  bytes: ArrayBuffer
  source: { width: number; height: number }
  targetBytes: number
  /** 起点参数；默认从源尺寸 + 256 色 + 无 lossy 开始 */
  start?: EncodeParams
  /** 注入 Worker 侧的 gifsicle 调用，便于单测与复用 */
  optimize: (bytes: ArrayBuffer, options: GifsicleOptions) => Promise<Blob>
}

/**
 * 对「已经编好的 GIF」做达标搜索：只动 gifsicle 的杠杆（尺寸/颜色/lossy），
 * 不重新取帧——重新解码取帧的成本是每帧 10ms 级，5 轮下来用户等不起。
 */
export async function shrinkToTarget(input: ShrinkInput): Promise<ShrinkOutcome> {
  const { bytes, source, targetBytes, optimize } = input
  const start: EncodeParams = input.start ?? {
    width: source.width,
    fps: 5,
    maxColors: 256,
    lossy: 0,
  }
  let lastBlob: Blob | null = null

  const search = await searchUnderTarget({
    start,
    targetBytes,
    measure: async (params) => {
      lastBlob = await optimize(bytes, optimizeOptionsFor(params, source).options)
      return lastBlob.size
    },
  })

  if (!lastBlob) {
    lastBlob = await optimize(bytes, optimizeOptionsFor(stepAt(start, 0), source).options)
  }
  return { blob: lastBlob, params: search.params, rounds: search.rounds, ok: search.ok }
}
