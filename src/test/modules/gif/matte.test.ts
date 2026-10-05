import { describe, expect, it } from 'vitest'

import {
  applyMatte,
  applyStroke,
  bayerLevel,
  binarizeAlpha,
  colorDistance,
  colorKeyMatte,
  combineMatte,
  compositeOver,
  decontaminate,
  despill,
  differenceMatte,
  ditherAlpha,
  erode,
  estimateBackgroundModel,
  feather,
  guidedFilter,
  morphology,
  rgbToLab,
  sampleIndexes,
  shiftEdge,
  temporalSmoothMatte,
  type BackgroundModel,
  type Matte,
} from '@/modules/gif/matte'
import { rgbaLength, type RgbaFrame, type RgbaImage } from '@/modules/gif/types'

type Rgb = readonly [number, number, number]

function blank(width: number, height: number): RgbaImage {
  return { width, height, rgba: new Uint8ClampedArray(rgbaLength(width, height)) }
}

function fill(image: RgbaImage, color: Rgb): void {
  for (let i = 0; i < image.rgba.length; i += 4) {
    image.rgba[i] = color[0]
    image.rgba[i + 1] = color[1]
    image.rgba[i + 2] = color[2]
    image.rgba[i + 3] = 255
  }
}

function fillRect(image: RgbaImage, x0: number, y0: number, w: number, h: number, color: Rgb) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * image.width + x) * 4
      image.rgba[i] = color[0]
      image.rgba[i + 1] = color[1]
      image.rgba[i + 2] = color[2]
      image.rgba[i + 3] = 255
    }
  }
}

function pixel(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * image.width + x) * 4
  return [image.rgba[i], image.rgba[i + 1], image.rgba[i + 2], image.rgba[i + 3]]
}

/** 静止的横向渐变背景 + 一个逐帧右移的方块：块最多覆盖每个像素 2/5 帧，中值仍是背景 */
function movingBlockFrames(count = 5, width = 12, height = 4): RgbaFrame[] {
  const background: Rgb[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) background.push([20 + x * 10, 60, 120 + y * 5])
  }
  return Array.from({ length: count }, (_, t) => {
    const image = blank(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = background[y * width + x]
        fillRect(image, x, y, 1, 1, color)
      }
    }
    fillRect(image, t, 1, 2, 2, [200, 20, 20])
    return { ...image, delayCs: 10 }
  })
}

function flatMatte(width: number, height: number, value: number): Matte {
  return { width, height, alpha: new Uint8ClampedArray(width * height).fill(value) }
}

function alphaAt(matte: Matte, x: number, y: number): number {
  return matte.alpha[y * matte.width + x]
}

function opaqueRatio(matte: Matte): number {
  let opaque = 0
  for (const value of matte.alpha) if (value === 255) opaque++
  return opaque / matte.alpha.length
}

function stepMatte(width: number, height: number, edge: number): Matte {
  const alpha = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) alpha[y * width + x] = x < edge ? 0 : 255
  }
  return { width, height, alpha }
}

function stepGuide(width: number, height: number, edge: number): RgbaImage {
  const image = blank(width, height)
  fillRect(image, 0, 0, edge, height, [10, 10, 10])
  fillRect(image, edge, 0, width - edge, height, [240, 240, 240])
  return image
}

function flatGuide(width: number, height: number, value = 128): RgbaImage {
  const image = blank(width, height)
  fill(image, [value, value, value])
  return image
}

describe('sampleIndexes', () => {
  it('keeps every frame when the sequence is already short', () => {
    expect(sampleIndexes(4)).toEqual([0, 1, 2, 3])
  })

  it('spreads evenly over long sequences and keeps both ends', () => {
    const indexes = sampleIndexes(300, 15)

    expect(indexes).toHaveLength(15)
    expect(indexes[0]).toBe(0)
    expect(indexes[14]).toBe(299)
    expect(new Set(indexes).size).toBe(15)
    expect(indexes.every((value, i) => i === 0 || value > indexes[i - 1])).toBe(true)
  })

  it('rejects a nonsensical frame count', () => {
    expect(() => sampleIndexes(0)).toThrowError(/positive integer/)
  })
})

describe('estimateBackgroundModel', () => {
  it('recovers a static background from a moving subject', () => {
    const frames = movingBlockFrames()
    const model = estimateBackgroundModel(frames)
    const truth = movingBlockFrames()[0]

    let worst = 0
    for (let x = 0; x < model.width; x++) {
      // 第 0 行永远没有方块经过，是唯一绝对可信的参照
      const estimated = [
        model.background[x * 4],
        model.background[x * 4 + 1],
        model.background[x * 4 + 2],
      ]
      for (let c = 0; c < 3; c++) {
        worst = Math.max(worst, Math.abs(estimated[c] - truth.rgba[x * 4 + c]))
      }
      expect(model.motion[x]).toBe(0)
    }
    expect(worst).toBeLessThan(4)
  })

  it('picks the farthest sample as the foreground estimate', () => {
    const model = estimateBackgroundModel(movingBlockFrames())
    // 方块走过的像素：F̂ 应该就是方块的颜色
    expect([
      model.foreground[(1 * 12 + 1) * 4],
      model.foreground[(1 * 12 + 1) * 4 + 1],
      model.foreground[(1 * 12 + 1) * 4 + 2],
    ]).toEqual([200, 20, 20])
  })

  it('refuses sequences too short to hold a median and frames of mixed size', () => {
    const frames = movingBlockFrames()

    expect(() => estimateBackgroundModel(frames.slice(0, 2))).toThrowError(/at least 3 frames/)
    expect(() =>
      estimateBackgroundModel([...frames, { ...blank(3, 3), delayCs: 10 }]),
    ).toThrowError(/share one size/)
  })
})

describe('differenceMatte', () => {
  const frames = movingBlockFrames()
  const model: BackgroundModel = estimateBackgroundModel(frames)

  it('marks the moving subject opaque and the never-changing background transparent', () => {
    const matte = differenceMatte(frames[2], model)

    expect(alphaAt(matte, 2, 1)).toBe(255)
    expect(alphaAt(matte, 2, 0)).toBe(0)
  })

  it('is monotone in the threshold: a higher noise floor removes more', () => {
    const loose = differenceMatte(frames[2], model, { threshold: 4 })
    const strict = differenceMatte(frames[2], model, { threshold: 255 })

    expect(alphaAt(loose, 2, 1)).toBe(255)
    expect(alphaAt(strict, 2, 1)).toBe(0)
  })

  it('softens with a wider ramp instead of stepping straight to opaque', () => {
    // 方块在 t=0 只覆盖了部分走过的像素，中值差是部分混合色 → 斜坡能给出中间值
    const sharp = differenceMatte(frames[0], model, { threshold: 0, softness: 8 })
    const soft = differenceMatte(frames[0], model, { threshold: 0, softness: 600 })

    expect(alphaAt(soft, 1, 1)).toBeLessThanOrEqual(alphaAt(sharp, 1, 1))
  })

  it('rejects a frame that does not match the model', () => {
    expect(() => differenceMatte(blank(3, 3), model)).toThrowError(/background model/)
  })

  it('rejects a non-positive softness', () => {
    expect(() => differenceMatte(frames[0], model, { softness: 0 })).toThrowError(/softness/)
  })
})

describe('colorDistance', () => {
  it('is zero for the same colour and ~100 between black and white', () => {
    expect(colorDistance([0, 0, 0], [0, 0, 0])).toBeCloseTo(0, 6)
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 0)
  })

  it('measures the mid grey of a channel ramp as L only', () => {
    const [lightness] = rgbToLab(128, 128, 128)

    expect(lightness).toBeGreaterThan(50)
    expect(lightness).toBeLessThan(60)
    expect(rgbToLab(128, 128, 128)[1]).toBeCloseTo(0, 1)
  })
})

describe('colorKeyMatte', () => {
  /** 背景 10,10,10；主体是一圈白环，环心故意涂成背景色，右上角放一块中等灰度 */
  function ringFrame(): RgbaImage {
    const image = blank(7, 7)
    fill(image, [10, 10, 10])
    fillRect(image, 1, 1, 5, 5, [240, 240, 240])
    fillRect(image, 2, 2, 3, 3, [200, 30, 30])
    fillRect(image, 3, 3, 1, 1, [10, 10, 10])
    fillRect(image, 6, 0, 1, 1, [60, 60, 60])
    return image
  }

  it('keys out the seeded background but keeps the subject', () => {
    const matte = colorKeyMatte(ringFrame(), [{ x: 0, y: 0 }])

    expect(alphaAt(matte, 0, 0)).toBe(0)
    expect(alphaAt(matte, 1, 3)).toBe(255)
  })

  it('protects an enclosed patch of the background colour when connected', () => {
    const connected = colorKeyMatte(ringFrame(), [{ x: 0, y: 0 }], { connected: true })
    const global = colorKeyMatte(ringFrame(), [{ x: 0, y: 0 }], { connected: false })

    expect(alphaAt(connected, 3, 3)).toBe(255)
    expect(alphaAt(global, 3, 3)).toBe(0)
  })

  it('is monotone in tolerance: a wider key eats into the near-background grey', () => {
    const frame = ringFrame()
    // (6,0) 是 60 灰，离种子色的 ΔE 约 23，正好落在斜坡上
    const tight = colorKeyMatte(frame, [{ x: 0, y: 0 }], { tolerance: 2, connected: false })
    const loose = colorKeyMatte(frame, [{ x: 0, y: 0 }], { tolerance: 20, connected: false })

    expect(alphaAt(tight, 6, 0)).toBe(255)
    expect(alphaAt(loose, 6, 0)).toBeLessThan(alphaAt(tight, 6, 0))
  })

  it('keys every seed it is given', () => {
    const frame = ringFrame()
    const matte = colorKeyMatte(frame, [{ x: 3, y: 1 }], { tolerance: 4, connected: false })

    expect(alphaAt(matte, 3, 1)).toBe(0)
    expect(alphaAt(matte, 0, 0)).toBe(255)
  })

  it('rejects an empty seed list and seeds outside the frame', () => {
    const frame = ringFrame()

    expect(() => colorKeyMatte(frame, [])).toThrowError(/at least one seed/)
    expect(() => colorKeyMatte(frame, [{ x: 7, y: 0 }])).toThrowError(/outside 7x7/)
  })
})

describe('guidedFilter', () => {
  it('holds a flat matte flat', () => {
    const smoothed = guidedFilter(flatMatte(16, 8, 128), flatGuide(16, 8), { radius: 2 })

    for (const value of smoothed.alpha) expect(Math.abs(value - 128)).toBeLessThan(2)
  })

  it('keeps a step that lines up with the guide sharper than plain feathering', () => {
    const matte = stepMatte(16, 8, 8)
    const guide = stepGuide(16, 8, 8)
    const guided = guidedFilter(matte, guide, { radius: 2, epsilon: 0.001 })
    const soft = feather(matte, 2)

    const intermediate = (input: Matte) =>
      input.alpha.filter((value) => value > 0 && value < 255).length

    expect(intermediate(guided)).toBeLessThan(intermediate(soft))
  })

  it('rejects a mismatched guide and a useless radius', () => {
    const matte = stepMatte(8, 8, 4)

    expect(() => guidedFilter(matte, blank(6, 6))).toThrowError(/guide size/)
    expect(() => guidedFilter(matte, stepGuide(8, 8, 4), { radius: 0 })).toThrowError(/radius/)
  })
})

describe('morphology and edge controls', () => {
  function speckMatte(): Matte {
    const matte = flatMatte(11, 5, 0)
    matte.alpha[2 * 11 + 5] = 255
    matte.alpha[2 * 11 + 6] = 255
    return matte
  }

  it('erode shrinks a block by exactly the radius', () => {
    const matte = stepMatte(10, 1, 5)
    const shrunk = erode(matte, 1)

    expect(alphaAt(shrunk, 4, 0)).toBe(0)
    // 腐蚀把不透明区整体右移一列：原来 5 起，现在 6 起
    expect(alphaAt(shrunk, 5, 0)).toBe(0)
    expect(alphaAt(shrunk, 6, 0)).toBe(255)
  })

  it('shiftEdge widens on the way out', () => {
    const matte = stepMatte(10, 1, 5)
    const grown = shiftEdge(matte, -1)

    expect(alphaAt(grown, 3, 0)).toBe(0)
    expect(alphaAt(grown, 4, 0)).toBe(255)
  })

  it('opening removes an isolated speck without touching nothing', () => {
    const opened = morphology(speckMatte(), { open: 1 })

    expect(opaqueRatio(opened)).toBe(0)
  })

  it('closing fills a one-pixel hole inside the subject', () => {
    const matte = flatMatte(5, 1, 255)
    matte.alpha[2] = 0
    const closed = morphology(matte, { close: 1 })

    expect(closed.alpha[2]).toBe(255)
  })

  it('copies rather than mutates when no radius is asked for', () => {
    const matte = flatMatte(4, 4, 90)
    const copied = morphology(matte)

    expect(copied.alpha).not.toBe(matte.alpha)
    expect(copied.alpha[0]).toBe(90)
  })

  it('rejects negative radii', () => {
    expect(() => erode(flatMatte(2, 2, 0), -1)).toThrowError(/radius/)
    expect(() => morphology(flatMatte(2, 2, 0), { open: -2 })).toThrowError(/must not be negative/)
  })
})

describe('feather', () => {
  it('lowers the peak and keeps the mass', () => {
    const matte = stepMatte(20, 5, 10)
    const soft = feather(matte, 2)
    const sum = (input: Matte) => input.alpha.reduce((total, value) => total + value, 0)

    expect(alphaAt(soft, 10, 2)).toBeLessThan(255)
    expect(alphaAt(soft, 10, 2)).toBeGreaterThan(0)
    expect(Math.abs(sum(soft) - sum(matte)) / sum(matte)).toBeLessThan(0.02)
  })

  it('is a no-op copy at radius zero', () => {
    const matte = stepMatte(8, 2, 4)

    expect(feather(matte, 0).alpha).toEqual(matte.alpha)
  })
})

describe('temporalSmoothMatte', () => {
  it('kills a one-frame spike', () => {
    const base = flatMatte(4, 1, 0)
    const spike = flatMatte(4, 1, 255)
    const smoothed = temporalSmoothMatte([base, spike, base])

    expect(smoothed[1].alpha[0]).toBe(0)
  })

  it('returns copies when the sequence is too short to smooth', () => {
    const matte = flatMatte(4, 1, 10)
    const [copy] = temporalSmoothMatte([matte])

    expect(copy.alpha).not.toBe(matte.alpha)
    expect(copy.alpha[0]).toBe(10)
  })

  it('rejects mixed sizes and a zero window', () => {
    expect(() => temporalSmoothMatte([flatMatte(4, 1, 0), flatMatte(3, 1, 0)])).toThrowError(
      /share one size/,
    )
    expect(() => temporalSmoothMatte([flatMatte(4, 1, 0)], 0)).toThrowError(/window/)
  })
})

describe('ditherAlpha', () => {
  it('spreads the Bayer levels over a full 64-step permutation', () => {
    const levels = new Set<number>()
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) levels.add(bayerLevel(x, y))
    }

    expect(levels.size).toBe(64)
    expect(Math.min(...levels)).toBeGreaterThan(0)
    expect(Math.max(...levels)).toBeLessThan(255)
  })

  it('preserves the average opacity of a flat matte', () => {
    const dithered = ditherAlpha(flatMatte(64, 64, 128))

    expect(Math.abs(opaqueRatio(dithered) - 128 / 255)).toBeLessThan(0.01)
  })

  it('diffuses the error without losing the average', () => {
    const dithered = ditherAlpha(flatMatte(64, 64, 128), { method: 'floyd-steinberg' })

    expect(Math.abs(opaqueRatio(dithered) - 128 / 255)).toBeLessThan(0.02)
  })

  it('is deterministic, so the dither pattern cannot crawl between frames', () => {
    const matte = stepMatte(32, 8, 16)

    expect(ditherAlpha(matte).alpha).toEqual(ditherAlpha(matte).alpha)
  })

  it('keeps pure transparent and pure opaque regions pure', () => {
    expect(opaqueRatio(ditherAlpha(flatMatte(16, 16, 0)))).toBe(0)
    expect(opaqueRatio(ditherAlpha(flatMatte(16, 16, 255)))).toBe(1)
  })
})

describe('binarizeAlpha', () => {
  it('flips at the threshold', () => {
    const matte = flatMatte(2, 2, 128)
    expect(binarizeAlpha(matte, 128).alpha[0]).toBe(0)
    expect(binarizeAlpha(matte, 127).alpha[0]).toBe(255)
  })

  it('rejects an out-of-range threshold', () => {
    expect(() => binarizeAlpha(flatMatte(2, 2, 0), 256)).toThrowError(/threshold/)
  })
})

describe('combineMatte', () => {
  it('drops a pixel either method calls background', () => {
    const first = flatMatte(2, 1, 255)
    const second = flatMatte(2, 1, 0)

    expect(combineMatte(first, second, 'min').alpha[0]).toBe(0)
    expect(combineMatte(first, second, 'max').alpha[0]).toBe(255)
  })

  it('refuses to combine different sizes', () => {
    expect(() => combineMatte(flatMatte(2, 2, 0), flatMatte(2, 3, 0))).toThrowError(
      /different sizes/,
    )
  })
})

describe('applyStroke', () => {
  const stroke = {
    mode: 'keep' as const,
    radius: 2,
    feather: 0,
    points: [{ x: 5, y: 2 }],
  }

  it('paints a solid disc and fades only outside the radius', () => {
    const kept = applyStroke(flatMatte(11, 5, 0), stroke)

    expect(alphaAt(kept, 5, 2)).toBe(255)
    expect(alphaAt(kept, 3, 2)).toBe(255)
    expect(alphaAt(kept, 2, 2)).toBe(0)
  })

  it('is idempotent, which is what makes replaying strokes safe', () => {
    const once = applyStroke(flatMatte(11, 5, 0), stroke)
    const twice = applyStroke(once, stroke)

    expect(twice.alpha).toEqual(once.alpha)
  })

  it('erase pulls alpha down instead', () => {
    const erased = applyStroke(flatMatte(11, 5, 255), { ...stroke, mode: 'erase' })

    expect(alphaAt(erased, 5, 2)).toBe(0)
    expect(alphaAt(erased, 0, 0)).toBe(255)
  })

  it('gives a soft shoulder when feathered', () => {
    const soft = applyStroke(flatMatte(11, 5, 0), { ...stroke, feather: 3 })

    expect(alphaAt(soft, 5, 2)).toBe(255)
    expect(alphaAt(soft, 8, 2)).toBeGreaterThan(0)
    expect(alphaAt(soft, 8, 2)).toBeLessThan(255)
  })

  it('rejects a zero radius', () => {
    expect(() => applyStroke(flatMatte(4, 4, 0), { ...stroke, radius: 0 })).toThrowError(/radius/)
  })
})

describe('despill', () => {
  it('pulls green back to the strongest of the other channels', () => {
    const image = blank(2, 1)
    fillRect(image, 0, 0, 1, 1, [0, 255, 0])
    fillRect(image, 1, 0, 1, 1, [200, 255, 200])

    const cleaned = despill(image)

    expect(pixel(cleaned, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixel(cleaned, 1, 0)).toEqual([200, 200, 200, 255])
  })

  it('leaves non-green pixels alone', () => {
    const image = blank(1, 1)
    fillRect(image, 0, 0, 1, 1, [100, 50, 20])

    expect(pixel(despill(image), 0, 0)).toEqual([100, 50, 20, 255])
  })
})

describe('decontaminate', () => {
  it('solves the compositing equation back to the foreground colour', () => {
    const image = blank(1, 1)
    // I = 0.5 F + 0.5 B，反解应该回到 F
    fillRect(image, 0, 0, 1, 1, [150, 75, 75])
    const matte = flatMatte(1, 1, 128)
    const background = new Uint8ClampedArray([100, 100, 100, 255])

    const recovered = decontaminate(image, matte, background)

    expect(Math.abs(recovered.rgba[0] - 200)).toBeLessThanOrEqual(3)
    expect(Math.abs(recovered.rgba[1] - 50)).toBeLessThanOrEqual(3)
  })

  it('skips fully transparent and fully opaque pixels', () => {
    const image = blank(1, 1)
    fillRect(image, 0, 0, 1, 1, [150, 75, 75])
    const background = new Uint8ClampedArray([100, 100, 100, 255])

    expect(decontaminate(image, flatMatte(1, 1, 0), background).rgba).toEqual(image.rgba)
    expect(decontaminate(image, flatMatte(1, 1, 255), background).rgba).toEqual(image.rgba)
  })
})

describe('compositeOver', () => {
  it('blends toward the matte colour and always ends opaque', () => {
    const image = blank(2, 1)
    fillRect(image, 0, 0, 1, 1, [200, 20, 20])
    fillRect(image, 1, 0, 1, 1, [100, 100, 100])
    const matte = { width: 2, height: 1, alpha: new Uint8ClampedArray([255, 0]) }

    const result = compositeOver(image, matte, [255, 255, 255])

    expect(pixel(result, 0, 0)).toEqual([200, 20, 20, 255])
    expect(pixel(result, 1, 0)).toEqual([255, 255, 255, 255])
  })
})

describe('applyMatte', () => {
  const frames = movingBlockFrames(2)
  const matte = differenceMatte(frames[0], estimateBackgroundModel(movingBlockFrames()))

  it('keeps per-frame delays in every output mode', () => {
    const framesWithDelays = [
      { ...frames[0], delayCs: 7 },
      { ...frames[1], delayCs: 21 },
    ]
    const result = applyMatte(framesWithDelays, [matte, matte], {
      mode: 'matte',
      color: [255, 255, 255],
    })

    expect(result.map((frame) => frame.delayCs)).toEqual([7, 21])
  })

  it('writes only 0 or 255 alpha for the transparent modes', () => {
    for (const output of [
      { mode: 'binary' as const, threshold: 127 },
      { mode: 'dither' as const, method: 'bayer8' as const },
    ]) {
      const result = applyMatte(frames, [matte, matte], output)

      for (const frame of result) {
        for (let i = 3; i < frame.rgba.length; i += 4) {
          expect(frame.rgba[i] === 0 || frame.rgba[i] === 255).toBe(true)
        }
      }
    }
  })

  it('does not mutate the source frames', () => {
    const before = Array.from(frames[0].rgba)

    applyMatte(frames, [matte, matte], { mode: 'binary', threshold: 127 })

    expect(Array.from(frames[0].rgba)).toEqual(before)
  })

  it('rejects mismatched frame and matte counts or sizes', () => {
    expect(() => applyMatte(frames, [matte], { mode: 'binary', threshold: 127 })).toThrowError(
      /1 mattes for 2 frames/,
    )
    expect(() =>
      applyMatte(frames, [flatMatte(3, 3, 0), flatMatte(3, 3, 0)], {
        mode: 'binary',
        threshold: 127,
      }),
    ).toThrowError(/does not match the frame size/)
  })
})
