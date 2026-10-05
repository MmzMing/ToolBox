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

/** 左上角 2x2 用给定的 alpha 值，其余不透明——用于驱动 1-bit 透明的阈值判定 */
function withTopLeftAlpha(
  width: number,
  height: number,
  alphaValue: number,
  color: [number, number, number] = [10, 200, 30],
): RgbaImage {
  const image = solid(width, height, color)
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const i = (y * width + x) * 4
      image.rgba[i + 3] = alphaValue
    }
  }
  return image
}

function countTransparent(frame: RgbaImage): number {
  let count = 0
  for (let i = 3; i < frame.rgba.length; i += 4) {
    if (frame.rgba[i] === 0) count++
  }
  return count
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

describe('createGifWriter transparency', () => {
  const transparency = { threshold: 127, dispose: 2 as const, clearColor: 0 }

  function encodeOne(image: RgbaImage, options?: Partial<GifWriterOptions>) {
    const writer = createGifWriter({
      maxColors: 256,
      loopCount: 0,
      delayCs: 10,
      transparency,
      ...options,
    })
    writer.addFrame(image)
    return decodeGif(writer.finish().buffer as ArrayBuffer)
  }

  it('writes a 1-bit transparent region that survives the round trip', () => {
    expect(countTransparent(encodeOne(withTopLeftAlpha(8, 8, 0)).frames[0])).toBe(4)
  })

  it('treats alpha at or below the threshold as transparent', () => {
    expect(countTransparent(encodeOne(withTopLeftAlpha(8, 8, 127)).frames[0])).toBe(4)
  })

  it('keeps alpha above the threshold opaque with its colour intact', () => {
    const decoded = encodeOne(withTopLeftAlpha(8, 8, 128))

    expect(countTransparent(decoded.frames[0])).toBe(0)
    expect(Array.from(decoded.frames[0].rgba.slice(0, 3))).toEqual([10, 200, 30])
  })

  it('leaves a fully opaque frame untouched when transparency is requested', () => {
    expect(countTransparent(encodeOne(solid(8, 8, [1, 2, 3])).frames[0])).toBe(0)
  })

  it('does not leak the transparent region into the next frame', () => {
    const writer = createGifWriter({
      maxColors: 256,
      loopCount: 0,
      delayCs: 10,
      transparency,
    })
    writer.addFrame(withTopLeftAlpha(8, 8, 0))
    writer.addFrame(solid(8, 8, [7, 7, 7]))

    const decoded = decodeGif(writer.finish().buffer as ArrayBuffer)

    expect(decoded.descriptor.frameCount).toBe(2)
    expect(countTransparent(decoded.frames[0])).toBe(4)
    expect(countTransparent(decoded.frames[1])).toBe(0)
  })

  it('preserves delays and loop count on the transparent path', () => {
    const writer = createGifWriter({
      maxColors: 256,
      loopCount: 3,
      delayCs: 10,
      transparency,
    })
    writer.addFrame(withTopLeftAlpha(8, 8, 0))
    writer.addFrame(withTopLeftAlpha(8, 8, 0), 25)

    const decoded = decodeGif(writer.finish().buffer as ArrayBuffer)

    expect(decoded.descriptor.delaysCs).toEqual([10, 25])
    expect(decoded.descriptor.loopCount).toBe(3)
  })

  it('does not mutate the caller frame while flattening alpha', () => {
    const image = withTopLeftAlpha(8, 8, 0)
    const writer = createGifWriter({
      maxColors: 256,
      loopCount: 0,
      delayCs: 10,
      transparency,
    })

    writer.addFrame(image)
    writer.finish()

    expect(Array.from(image.rgba.slice(0, 4))).toEqual([10, 200, 30, 0])
  })

  it('rejects maxColors below 3 when transparency is requested', () => {
    expect(() =>
      createGifWriter({ maxColors: 2, loopCount: 0, delayCs: 10, transparency }),
    ).toThrowError(/maxColors >= 3/)
  })

  it('rejects an out-of-range threshold or clear colour', () => {
    expect(() =>
      createGifWriter({
        maxColors: 256,
        loopCount: 0,
        delayCs: 10,
        transparency: { threshold: 256 },
      }),
    ).toThrowError(/threshold/)
    expect(() =>
      createGifWriter({
        maxColors: 256,
        loopCount: 0,
        delayCs: 10,
        transparency: { threshold: 127, clearColor: -1 },
      }),
    ).toThrowError(/clearColor/)
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
