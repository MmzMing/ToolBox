import { describe, expect, it } from 'vitest'

import { createGifWriter, type GifWriterOptions } from '@/modules/gif/encode'
import { decodeGif } from '@/modules/gif/decode'
import { rgbaLength, type RgbaImage } from '@/modules/gif/types'

function solid(width: number, height: number, color: [number, number, number]): RgbaImage {
  const rgba = new Uint8ClampedArray(rgbaLength(width, height))
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color[0]
    rgba[i + 1] = color[1]
    rgba[i + 2] = color[2]
    rgba[i + 3] = 255
  }
  return { width, height, rgba }
}

function encodeThreeFrames(
  options: GifWriterOptions = { maxColors: 256, loopCount: 0, delayCs: 10 },
) {
  const writer = createGifWriter(options)
  writer.addFrame(solid(8, 8, [255, 0, 0]))
  writer.addFrame(solid(8, 8, [0, 255, 0]), 25)
  writer.addFrame(solid(8, 8, [0, 0, 255]))
  return writer.finish()
}

describe('createGifWriter', () => {
  it('produces a decodable gif with frame count, delays and loop count preserved', () => {
    const decoded = decodeGif(encodeThreeFrames().buffer as ArrayBuffer)

    expect(decoded.descriptor.frameCount).toBe(3)
    expect(decoded.descriptor.width).toBe(8)
    expect(decoded.descriptor.height).toBe(8)
    expect(decoded.descriptor.loopCount).toBe(0)
    expect(decoded.descriptor.delaysCs).toEqual([10, 25, 10])
  })

  it('keeps per-frame colours distinguishable after the round trip', () => {
    const decoded = decodeGif(encodeThreeFrames().buffer as ArrayBuffer)
    const first = decoded.frames[0].rgba
    const third = decoded.frames[2].rgba

    expect(first[0]).toBe(255)
    expect(first[2]).toBe(0)
    expect(third[0]).toBe(0)
    expect(third[2]).toBe(255)
  })

  it('omits the loop extension when loopCount is null', () => {
    const bytes = encodeThreeFrames({ maxColors: 256, loopCount: null, delayCs: 10 })

    expect(decodeGif(bytes.buffer as ArrayBuffer).descriptor.loopCount).toBeNull()
  })

  it('accepts a rgba view that does not own its buffer', () => {
    const packed = new Uint8ClampedArray(rgbaLength(8, 8) * 2)
    const view = packed.subarray(0, rgbaLength(8, 8))
    const writer = createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 10 })

    writer.addFrame({ width: 8, height: 8, rgba: view })
    const bytes = writer.finish()

    expect(bytes.length).toBeGreaterThan(0)
    expect(decodeGif(bytes.buffer as ArrayBuffer).descriptor.width).toBe(8)
  })

  it('rejects maxColors outside 2..256', () => {
    expect(() => createGifWriter({ maxColors: 257, loopCount: 0, delayCs: 10 })).toThrowError(
      /maxColors/,
    )
    expect(() => createGifWriter({ maxColors: 1, loopCount: 0, delayCs: 10 })).toThrowError(
      /maxColors/,
    )
    expect(() => createGifWriter({ maxColors: 12.5, loopCount: 0, delayCs: 10 })).toThrowError(
      /maxColors/,
    )
  })

  it('rejects a non-positive or fractional default delay', () => {
    expect(() => createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 0 })).toThrowError(
      /delayCs/,
    )
    expect(() => createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 1.5 })).toThrowError(
      /delayCs/,
    )
  })

  it('rejects a negative loop count other than null', () => {
    expect(() => createGifWriter({ maxColors: 256, loopCount: -2, delayCs: 10 })).toThrowError(
      /loopCount/,
    )
  })

  it('rejects a frame whose rgba does not match its dimensions', () => {
    const writer = createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 10 })

    expect(() =>
      writer.addFrame({ width: 8, height: 8, rgba: new Uint8ClampedArray(64) }),
    ).toThrowError(/does not match 8x8/)
  })

  it('refuses to add frames or finish twice after finish', () => {
    const writer = createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 10 })
    writer.addFrame(solid(4, 4, [10, 20, 30]))
    writer.finish()

    expect(() => writer.addFrame(solid(4, 4, [10, 20, 30]))).toThrowError(/already finished/)
    expect(() => writer.finish()).toThrowError(/already finished/)
  })

  it('refuses to finish an empty gif', () => {
    const writer = createGifWriter({ maxColors: 256, loopCount: 0, delayCs: 10 })

    expect(() => writer.finish()).toThrowError(/without frames/)
    expect(writer.frameCount).toBe(0)
  })
})

describe('decodeGif', () => {
  it('reports parse before frames, both carrying the frame count', () => {
    const phases: Array<[string, number]> = []
    const decoded = decodeGif(encodeThreeFrames().buffer as ArrayBuffer, (phase, total) =>
      phases.push([phase, total]),
    )

    expect(phases).toEqual([
      ['parse', 3],
      ['frames', 3],
    ])
    expect(decoded.frames).toHaveLength(3)
  })

  it('decodes without a progress callback', () => {
    expect(decodeGif(encodeThreeFrames().buffer as ArrayBuffer).descriptor.frameCount).toBe(3)
  })

  it('rejects bytes that are not a gif', () => {
    expect(() => decodeGif(new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer)).toThrowError(
      /failed to parse gif/,
    )
  })
})
