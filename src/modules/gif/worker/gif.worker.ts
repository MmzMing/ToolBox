import { encodeFrames } from '../encode'
import { decodeGif } from '../decode'
import { optimizeGif } from '../optimize'
import {
  matteSequence,
  prepareSource,
  renderPreview,
  renderSequence,
  type MatteSource,
} from '../matte-pipeline'
import type { GifProgress, GifRequest, GifResponse } from '../protocol'

/**
 * tsconfig 没有引入 WebWorker lib，`self` 在这里只会推导成 Window，
 * 而 Window 的 postMessage 没有 (message, transfer) 这版重载。只声明用到的那一个。
 */
type WorkerScope = { postMessage(message: unknown, transfer?: Transferable[]): void }
const scope = self as unknown as WorkerScope

/**
 * 抠图是交互式反复计算，所以源帧常驻在这里，主线程之后只发参数。
 * token 由主线程分配：换文件就换一个 token，旧的显式 unload 释放。
 */
const sources = new Map<number, MatteSource>()

function requireSource(token: number): MatteSource {
  const source = sources.get(token)
  if (!source) {
    throw new Error(`no matte source for token ${token}`)
  }
  return source
}

function progress(id: number, phase: GifProgress['phase'], total: number, done?: number): void {
  const message: GifProgress = { id, type: 'progress', phase, total, done }
  scope.postMessage(message)
}

self.onmessage = async (event: MessageEvent<GifRequest>) => {
  const request = event.data
  let response: GifResponse
  const transfer: Transferable[] = []

  try {
    if (request.type === 'inspect') {
      response = {
        id: request.id,
        ok: true,
        type: 'inspect',
        descriptor: decodeGif(request.bytes).descriptor,
      }
    } else if (request.type === 'optimize') {
      response = {
        id: request.id,
        ok: true,
        type: 'optimize',
        blob: await optimizeGif(request.bytes, request.options),
      }
    } else if (request.type === 'decode') {
      const decoded = decodeGif(request.bytes, (phase, total) => {
        progress(request.id, phase, total)
      })
      response = {
        id: request.id,
        ok: true,
        type: 'decode',
        descriptor: decoded.descriptor,
        frames: decoded.frames,
      }
    } else if (request.type === 'matteLoad') {
      const source = prepareSource(request.frames)
      sources.set(request.token, source)
      progress(request.id, 'model', source.frames.length, source.frames.length)
      response = {
        id: request.id,
        ok: true,
        type: 'matteLoad',
        token: request.token,
        hasTemporalModel: source.model !== null,
      }
    } else if (request.type === 'mattePreview') {
      const source = requireSource(request.token)
      const frame = renderPreview(
        source,
        request.frameIndex,
        request.seeds,
        request.params,
        request.strokes,
        request.output,
      )
      transfer.push(frame.rgba.buffer)
      response = { id: request.id, ok: true, type: 'mattePreview', frame }
    } else if (request.type === 'matteRender') {
      const source = requireSource(request.token)
      progress(request.id, 'matte', source.frames.length)
      const mattes = matteSequence(
        source,
        request.seeds,
        request.params,
        request.strokes,
        (done, total) => progress(request.id, 'matte', total, done),
      )
      const frames = renderSequence(source, mattes, request.params, request.output)
      for (const frame of frames) transfer.push(frame.rgba.buffer)
      response = { id: request.id, ok: true, type: 'matteRender', frames }
    } else if (request.type === 'matteExport') {
      const source = requireSource(request.token)
      const mattes = matteSequence(
        source,
        request.seeds,
        request.params,
        request.strokes,
        (done, total) => progress(request.id, 'matte', total, done),
      )
      const frames = renderSequence(source, mattes, request.params, request.output)
      const bytes = encodeFrames(frames, request.encode)
      response = {
        id: request.id,
        ok: true,
        type: 'matteExport',
        blob: new Blob([bytes], { type: 'image/gif' }),
      }
    } else if (request.type === 'matteUnload') {
      sources.delete(request.token)
      response = { id: request.id, ok: true, type: 'matteUnload', token: request.token }
    } else if (request.type === 'matteSample') {
      const source = requireSource(request.token)
      const frame = source.frames[request.frameIndex]
      if (!frame) throw new Error(`no source frame ${request.frameIndex}`)
      const offset = (request.y * frame.width + request.x) * 4
      response = {
        id: request.id,
        ok: true,
        type: 'matteSample',
        color: [frame.rgba[offset], frame.rgba[offset + 1], frame.rgba[offset + 2]],
      }
    } else {
      const bytes = encodeFrames(request.frames, request.options)
      response = {
        id: request.id,
        ok: true,
        type: 'encode',
        blob: new Blob([bytes], { type: 'image/gif' }),
      }
    }
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  scope.postMessage(response, transfer)
}
