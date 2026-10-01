import { encodeFrames } from '../encode'
import { decodeGif } from '../decode'
import { optimizeGif } from '../optimize'
import type { GifProgress, GifRequest, GifResponse } from '../protocol'

self.onmessage = async (event: MessageEvent<GifRequest>) => {
  const request = event.data
  let response: GifResponse

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
        const progress: GifProgress = { id: request.id, type: 'progress', phase, total }
        self.postMessage(progress)
      })
      response = {
        id: request.id,
        ok: true,
        type: 'decode',
        descriptor: decoded.descriptor,
        frames: decoded.frames,
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

  self.postMessage(response)
}
