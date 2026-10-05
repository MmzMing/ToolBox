import { useCallback, useRef, useState } from 'react'

import type { GifWriterOptions } from '@/modules/gif/encode'
import type { ColorSeed, MatteOutput } from '@/modules/gif/matte'
import type { MatteParams, MatteStroke } from '@/modules/gif/matte-pipeline'
import type { GifProgress } from '@/modules/gif/protocol'
import type { RgbaFrame } from '@/modules/gif/types'
import { useGifWorker } from '@/modules/gif/worker/use-gif-worker'

export type MatteJob = {
  seeds: ColorSeed[]
  params: MatteParams
  strokes: MatteStroke[]
  output: MatteOutput
}

/**
 * worker 侧抠图会话的编排：一次 load 常驻源帧，之后每次交互只发参数、只收结果帧。
 *
 * 两个刻意的约束：
 * 1. openSource 会把帧的像素缓冲区 transfer 走，主线程之后不能再碰那批 frames；
 *    取色器要的原始颜色因此走 pick 反查 worker。
 * 2. 预览是「后发先至」的：滑块连续拖动时按序号丢弃迟到的结果，不然画面会闪回旧参数。
 */
export function useMattePreview() {
  // 解码也必须走这一个 worker：useGifWorker 每个实例起一个独立线程，两处调用会把源帧存两份
  const { load, preview, render, exportGif, sample, decode } = useGifWorker()
  const tokenRef = useRef(0)
  const seqRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [hasTemporalModel, setHasTemporalModel] = useState(false)

  const openSource = useCallback(
    async (frames: RgbaFrame[]): Promise<boolean> => {
      const token = ++tokenRef.current
      seqRef.current += 1
      setReady(false)
      const model = await load(token, frames)
      setHasTemporalModel(model)
      setReady(true)
      return model
    },
    [load],
  )

  const closeSource = useCallback(() => {
    tokenRef.current = 0
    seqRef.current += 1
    setReady(false)
    setHasTemporalModel(false)
  }, [])

  const refresh = useCallback(
    async (frameIndex: number, job: MatteJob): Promise<RgbaFrame | null> => {
      if (!tokenRef.current) return null
      const seq = ++seqRef.current
      const frame = await preview({ token: tokenRef.current, frameIndex, ...job })
      return seq === seqRef.current ? frame : null
    },
    [preview],
  )

  const pick = useCallback(
    (frameIndex: number, x: number, y: number): Promise<[number, number, number]> =>
      sample(tokenRef.current, frameIndex, x, y),
    [sample],
  )

  const renderAll = useCallback(
    (job: MatteJob, onProgress?: (progress: GifProgress) => void): Promise<RgbaFrame[]> =>
      render({ token: tokenRef.current, ...job }, onProgress),
    [render],
  )

  const exportResult = useCallback(
    (
      job: MatteJob,
      encode: GifWriterOptions,
      onProgress?: (progress: GifProgress) => void,
    ): Promise<Blob> => exportGif({ token: tokenRef.current, ...job, encode }, onProgress),
    [exportGif],
  )

  /** 迟到的响应作废通道：换文件或卸载时把序号推一格 */
  const invalidate = useCallback(() => {
    seqRef.current += 1
  }, [])

  return {
    ready,
    hasTemporalModel,
    decode,
    openSource,
    closeSource,
    refresh,
    pick,
    renderAll,
    exportResult,
    invalidate,
  }
}
