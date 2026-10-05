import { useCallback, useEffect, useRef } from 'react'

import type { GifWriterOptions } from '../encode'
import type { ColorSeed, MatteOutput } from '../matte'
import type { MatteParams, MatteStroke } from '../matte-pipeline'
import type { GifsicleOptions } from '../optimize'
import type { FramePayload, GifProgress, GifRequest, GifResponse } from '../protocol'
import type { GifDescriptor, RgbaFrame } from '../types'

type Pending = {
  resolve: (value: GifResponse) => void
  reject: (reason: Error) => void
  onProgress?: (progress: GifProgress) => void
}

/** 一次抠图计算的全部入参：源帧已经常驻在 worker 里，所以这里没有像素 */
type MatteJob = {
  token: number
  seeds: ColorSeed[]
  params: MatteParams
  strokes: MatteStroke[]
  output: MatteOutput
}

type MattePreviewJob = MatteJob & { frameIndex: number }

/**
 * 与 gif.worker 的 promise 化通道：一个工具一个实例，卸载即 terminate。
 * Worker 崩溃时把在途请求全部 reject 并丢弃实例，下次调用自动重建。
 */
export function useGifWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(1)

  const dropWorker = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    for (const entry of pendingRef.current.values()) {
      entry.reject(new Error('gif worker stopped'))
    }
    pendingRef.current.clear()
  }, [])

  useEffect(() => dropWorker, [dropWorker])

  const call = useCallback(
    <T extends GifRequest>(
      request: Omit<T, 'id'>,
      transfer?: Transferable[],
      onProgress?: (progress: GifProgress) => void,
    ): Promise<Extract<GifResponse, { type: T['type'] }>> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' })
          worker.addEventListener('message', (event: MessageEvent<GifResponse | GifProgress>) => {
            const data = event.data
            const entry = pendingRef.current.get(data.id)
            if (!entry) return
            // 进度消息没有 ok 字段：它不是终态，留在 pending 里等最终的 GifResponse
            if (!('ok' in data)) {
              entry.onProgress?.(data)
              return
            }
            pendingRef.current.delete(data.id)
            entry.resolve(data)
          })
          worker.addEventListener('error', () => dropWorker())
          workerRef.current = worker
        }

        const id = nextIdRef.current++
        pendingRef.current.set(id, {
          resolve: (response) =>
            response.ok === false
              ? reject(new Error(response.message))
              : resolve(response as Extract<GifResponse, { type: T['type'] }>),
          reject,
          onProgress,
        })
        workerRef.current.postMessage({ ...request, id } as unknown as GifRequest, transfer ?? [])
      })
    },
    [dropWorker],
  )

  const inspect = useCallback(
    async (bytes: ArrayBuffer): Promise<GifDescriptor> => {
      const response = await call<Extract<GifRequest, { type: 'inspect' }>>({
        type: 'inspect',
        bytes,
      })
      return response.descriptor
    },
    [call],
  )

  const optimize = useCallback(
    async (bytes: ArrayBuffer, options: GifsicleOptions): Promise<Blob> => {
      const response = await call<Extract<GifRequest, { type: 'optimize' }>>({
        type: 'optimize',
        bytes,
        options,
      })
      return response.blob
    },
    [call],
  )

  /** RGBA 缓冲区会被 transfer 走，调用方不要复用同一批帧再编第二次 */
  const encode = useCallback(
    async (frames: FramePayload[], options: GifWriterOptions): Promise<Blob> => {
      const response = await call<Extract<GifRequest, { type: 'encode' }>>(
        { type: 'encode', frames, options },
        frames.map((frame) => frame.rgba.buffer),
      )
      return response.blob
    },
    [call],
  )

  const decode = useCallback(
    async (
      bytes: ArrayBuffer,
      onProgress?: (progress: GifProgress) => void,
    ): Promise<{ descriptor: GifDescriptor; frames: RgbaFrame[] }> => {
      const response = await call<Extract<GifRequest, { type: 'decode' }>>(
        {
          type: 'decode',
          bytes,
        },
        undefined,
        onProgress,
      )
      return { descriptor: response.descriptor, frames: response.frames }
    },
    [call],
  )

  return { inspect, optimize, encode, decode, ...useMatteChannel(call) }
}

/**
 * 抠图通道：源帧一次 transfer 进 worker 常驻，之后每次交互只发参数、只收结果帧。
 *
 * Worker 崩溃后常驻帧就没了（缓冲区已经 transfer 走，主线程手上是空数组），
 * 所以这里不尝试重放 load：调用方收到 rejection 后应当重新解码再 load。
 */
function useMatteChannel(
  call: <T extends GifRequest>(
    request: Omit<T, 'id'>,
    transfer?: Transferable[],
    onProgress?: (progress: GifProgress) => void,
  ) => Promise<Extract<GifResponse, { type: T['type'] }>>,
) {
  const load = useCallback(
    async (token: number, frames: FramePayload[]): Promise<boolean> => {
      const response = await call<Extract<GifRequest, { type: 'matteLoad' }>>(
        { type: 'matteLoad', token, frames },
        frames.map((frame) => frame.rgba.buffer),
      )
      return response.hasTemporalModel
    },
    [call],
  )

  const preview = useCallback(
    async (input: MattePreviewJob): Promise<RgbaFrame> => {
      const response = await call<Extract<GifRequest, { type: 'mattePreview' }>>({
        type: 'mattePreview',
        frameIndex: input.frameIndex,
        token: input.token,
        seeds: input.seeds,
        params: input.params,
        strokes: input.strokes,
        output: input.output,
      })
      return response.frame
    },
    [call],
  )

  const render = useCallback(
    async (input: MatteJob, onProgress?: (progress: GifProgress) => void): Promise<RgbaFrame[]> => {
      const response = await call<Extract<GifRequest, { type: 'matteRender' }>>(
        {
          type: 'matteRender',
          token: input.token,
          seeds: input.seeds,
          params: input.params,
          strokes: input.strokes,
          output: input.output,
        },
        undefined,
        onProgress,
      )
      return response.frames
    },
    [call],
  )

  const exportGif = useCallback(
    async (
      input: MatteJob & { encode: GifWriterOptions },
      onProgress?: (progress: GifProgress) => void,
    ): Promise<Blob> => {
      const response = await call<Extract<GifRequest, { type: 'matteExport' }>>(
        {
          type: 'matteExport',
          token: input.token,
          seeds: input.seeds,
          params: input.params,
          strokes: input.strokes,
          output: input.output,
          encode: input.encode,
        },
        undefined,
        onProgress,
      )
      return response.blob
    },
    [call],
  )

  const sample = useCallback(
    async (
      token: number,
      frameIndex: number,
      x: number,
      y: number,
    ): Promise<[number, number, number]> => {
      const response = await call<Extract<GifRequest, { type: 'matteSample' }>>({
        type: 'matteSample',
        token,
        frameIndex,
        x,
        y,
      })
      return response.color
    },
    [call],
  )

  const unload = useCallback(
    async (token: number): Promise<void> => {
      await call<Extract<GifRequest, { type: 'matteUnload' }>>({ type: 'matteUnload', token })
    },
    [call],
  )

  return { load, preview, render, exportGif, unload, sample }
}
