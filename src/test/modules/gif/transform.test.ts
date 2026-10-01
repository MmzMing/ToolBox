import { describe, expect, it } from 'vitest'

import { cropImage, flipImage, rotateImage } from '@/modules/gif/transform'
import type { RgbaImage } from '@/modules/gif/types'

function pixel(r: number, g: number, b: number): number[] {
  return [r, g, b, 255]
}

function image(width: number, height: number, pixels: number[][]): RgbaImage {
  const rgba = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((value, index) => rgba.set(value, index * 4))
  return { width, height, rgba }
}

function pixelsOf(imageIn: RgbaImage): number[][] {
  const out: number[][] = []
  for (let i = 0; i < imageIn.rgba.length; i += 4) {
    out.push([...imageIn.rgba.subarray(i, i + 4)])
  }
  return out
}

const RED = pixel(255, 0, 0)
const GREEN = pixel(0, 255, 0)
const BLUE = pixel(0, 0, 255)
const BLACK = pixel(0, 0, 0)
const WHITE = pixel(255, 255, 255)
const YELLOW = pixel(255, 255, 0)

describe('rotateImage', () => {
  it('swaps dimensions and puts the left pixel on top for a clockwise quarter turn', () => {
    const rotated = rotateImage(image(2, 1, [RED, GREEN]), 90)

    expect([rotated.width, rotated.height]).toEqual([1, 2])
    expect(pixelsOf(rotated)).toEqual([RED, GREEN])
  })

  it('moves the top-left corner to the top-right', () => {
    const rotated = rotateImage(image(2, 2, [RED, GREEN, BLUE, BLACK]), 90)

    expect(pixelsOf(rotated)).toEqual([BLUE, RED, BLACK, GREEN])
  })

  it('returns the same pixels for 0 degrees and the original after four quarter turns', () => {
    const source = image(2, 2, [RED, GREEN, BLUE, BLACK])

    expect(pixelsOf(rotateImage(source, 0))).toEqual(pixelsOf(source))
    let once = rotateImage(source, 90)
    once = rotateImage(once, 90)
    once = rotateImage(once, 90)
    const back = rotateImage(once, 90)

    expect([back.width, back.height]).toEqual([2, 2])
    expect(pixelsOf(back)).toEqual(pixelsOf(source))
  })

  it('rejects a rotation GIF cannot express', () => {
    expect(() => rotateImage(image(1, 1, [RED]), 45 as 0)).toThrowError(/unsupported rotation/)
  })

  it('allocates a buffer it owns, which the encoder requires', () => {
    const source = image(2, 1, [RED, GREEN])
    const view = { width: 2, height: 1, rgba: new Uint8ClampedArray(source.rgba.buffer) }
    const rotated = rotateImage({ ...view, rgba: source.rgba.subarray() }, 90)

    expect(rotated.rgba.byteOffset).toBe(0)
    expect(rotated.rgba.buffer.byteLength).toBe(rotated.rgba.byteLength)
  })
})

describe('cropImage', () => {
  const grid = image(3, 2, [RED, GREEN, BLUE, BLACK, WHITE, YELLOW])

  it('extracts the requested sub-rectangle row by row', () => {
    const cropped = cropImage(grid, { x: 1, y: 0, width: 2, height: 2 })

    expect([cropped.width, cropped.height]).toEqual([2, 2])
    expect(pixelsOf(cropped)).toEqual([GREEN, BLUE, WHITE, YELLOW])
  })

  it('returns the same object when the rect already covers the frame', () => {
    expect(cropImage(grid, { x: 0, y: 0, width: 3, height: 2 })).toBe(grid)
  })

  it('allocates a buffer it owns so the encoder reads the right pixels', () => {
    const cropped = cropImage(grid, { x: 0, y: 0, width: 2, height: 1 })

    expect(cropped.rgba.byteOffset).toBe(0)
    expect(cropped.rgba.buffer.byteLength).toBe(cropped.rgba.byteLength)
  })

  it('rejects a rect that leaves the frame', () => {
    expect(() => cropImage(grid, { x: 2, y: 0, width: 2, height: 1 })).toThrowError(/outside 3x2/)
    expect(() => cropImage(grid, { x: 0, y: 1, width: 3, height: 2 })).toThrowError(/outside 3x2/)
    expect(() => cropImage(grid, { x: 0.5, y: 0, width: 2, height: 1 })).toThrowError(/outside 3x2/)
  })
})

describe('flipImage', () => {
  it('mirrors left to right', () => {
    expect(pixelsOf(flipImage(image(2, 1, [RED, GREEN]), 'horizontal'))).toEqual([GREEN, RED])
  })

  it('mirrors top to bottom', () => {
    expect(pixelsOf(flipImage(image(1, 2, [RED, GREEN]), 'vertical'))).toEqual([GREEN, RED])
  })

  it('is its own inverse', () => {
    const source = image(2, 2, [RED, GREEN, BLUE, BLACK])

    expect(pixelsOf(flipImage(flipImage(source, 'horizontal'), 'horizontal'))).toEqual(
      pixelsOf(source),
    )
  })

  it('keeps the dimensions', () => {
    const flipped = flipImage(image(3, 2, [RED, GREEN, BLUE, BLACK, RED, GREEN]), 'vertical')

    expect([flipped.width, flipped.height]).toEqual([3, 2])
  })
})
