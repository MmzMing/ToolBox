import { describe, expect, it } from 'vitest'

import {
  canUseTemporalModel,
  DEFAULT_MATTE_PARAMS,
  matteForFrame,
  matteSequence,
  prepareSource,
  renderPreview,
  renderSequence,
  type MatteParams,
} from '@/modules/gif/matte-pipeline'
import { rgbaLength, type RgbaFrame, type RgbaImage } from '@/modules/gif/types'

function image(width: number, height: number, color: [number, number, number]): RgbaImage {
  const rgba = new Uint8ClampedArray(rgbaLength(width, height))
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color[0]
    rgba[i + 1] = color[1]
    rgba[i + 2] = color[2]
    rgba[i + 3] = 255
  }
  return { width, height, rgba }
}

function paint(target: RgbaImage, x: number, y: number, color: [number, number, number]): void {
  const i = (y * target.width + x) * 4
  target.rgba[i] = color[0]
  target.rgba[i + 1] = color[1]
  target.rgba[i + 2] = color[2]
}

function frameOf(source: RgbaImage, delayCs = 10): RgbaFrame {
  return { width: source.width, height: source.height, delayCs, rgba: source.rgba }
}

/** 默认参数会做 1px 形态学与引导滤波，在 12x4 的小图上会把 2x2 的块整个吃掉，测试里先关掉 */
function params(overrides: Partial<MatteParams> = {}): MatteParams {
  return {
    ...DEFAULT_MATTE_PARAMS,
    guided: false,
    open: 0,
    close: 0,
    feather: 0,
    edge: 0,
    temporal: 0,
    ...overrides,
  }
}

/** 静止渐变背景 + 逐帧右移的 2x2 方块，方块最多盖住每格 2/5 帧 */
function blockSource(count = 5): ReturnType<typeof prepareSource> {
  const frames: RgbaFrame[] = []
  for (let t = 0; t < count; t++) {
    const canvas = image(12, 4, [10, 10, 10])
    for (let x = 0; x < 12; x++) paint(canvas, x, 0, [30 + x * 12, 60, 120])
    paint(canvas, t, 1, [200, 20, 20])
    paint(canvas, t, 2, [200, 20, 20])
    paint(canvas, t + 1, 1, [200, 20, 20])
    paint(canvas, t + 1, 2, [200, 20, 20])
    frames.push(frameOf(canvas))
  }
  return prepareSource(frames)
}

function alphaAt(matte: { alpha: Uint8ClampedArray; width: number }, x: number, y: number) {
  return matte.alpha[y * matte.width + x]
}

describe('canUseTemporalModel', () => {
  it('needs a real median, so two frames are not enough', () => {
    expect(canUseTemporalModel(2)).toBe(false)
    expect(canUseTemporalModel(3)).toBe(true)
  })
})

describe('prepareSource', () => {
  it('computes the shared background board once', () => {
    const source = blockSource()

    expect(source.frames).toHaveLength(5)
    expect(source.model).not.toBeNull()
  })

  it('leaves the model absent for a sequence too short to median', () => {
    expect(prepareSource([frameOf(image(4, 4, [1, 2, 3]))]).model).toBeNull()
  })

  it('refuses an empty sequence', () => {
    expect(() => prepareSource([])).toThrowError(/at least one frame/)
  })
})

describe('matteForFrame', () => {
  it('separates the moving block from a background it never saw change', () => {
    const source = blockSource()
    const matte = matteForFrame(source.frames[2], source, [], params())

    expect(alphaAt(matte, 2, 1)).toBe(255)
    expect(alphaAt(matte, 2, 0)).toBe(0)
  })

  it('keeps everything when there is neither a model nor a colour to key on', () => {
    const source = prepareSource([frameOf(image(4, 3, [9, 9, 9]))])
    const matte = matteForFrame(source.frames[0], source, [], params({ mode: 'key' }))

    expect(matte.alpha).toHaveLength(12)
    expect(Array.from(new Set(matte.alpha))).toEqual([255])
  })

  it('ignores the temporal model entirely in key mode', () => {
    const source = blockSource()
    const keyed = matteForFrame(
      source.frames[2],
      source,
      [{ x: 2, y: 1, color: [200, 20, 20] }],
      params({ mode: 'key' }),
    )

    // 种子落在方块自身上：方块被判为背景，静止的背景反而留着
    expect(alphaAt(keyed, 2, 1)).toBe(0)
    expect(alphaAt(keyed, 2, 0)).toBe(255)
  })

  it('carries the seed colour across frames instead of re-reading it', () => {
    const source = blockSource()
    const keyOnly = params({
      mode: 'key',
      key: { ...DEFAULT_MATTE_PARAMS.key, connected: false },
    })
    // (2,1) 在 t=2 是方块、在 t=4 已经变回背景
    const remembered = matteForFrame(
      source.frames[4],
      source,
      [{ x: 2, y: 1, color: [200, 20, 20] }],
      keyOnly,
    )
    const reread = matteForFrame(source.frames[4], source, [{ x: 2, y: 1 }], keyOnly)

    // 记住取色那一刻的颜色，才不会出现「方块走过后自己被抠掉」的反转
    expect(alphaAt(remembered, 2, 1)).toBe(255)
    expect(alphaAt(reread, 2, 1)).toBe(0)
  })
})

describe('matteSequence', () => {
  /** 只有一帧在 (11,3) 上闪了一下：单帧看是前景，跨帧中值应该把它按回去 */
  function flickerSource() {
    const frames = blockSource().frames.map((frame) => ({
      ...frame,
      rgba: new Uint8ClampedArray(frame.rgba),
    }))
    paint(frames[2], 11, 3, [250, 250, 250])
    return prepareSource(frames)
  }

  it('leaves a one-frame flicker in place without temporal smoothing', () => {
    const source = flickerSource()
    const mattes = matteSequence(source, [], params())

    expect(alphaAt(mattes[2], 11, 3)).toBe(255)
    expect(alphaAt(mattes[3], 11, 3)).toBe(0)
  })

  it('median-suppresses the flicker when smoothing is on', () => {
    const source = flickerSource()
    const mattes = matteSequence(source, [], params({ temporal: 1 }))

    expect(alphaAt(mattes[2], 11, 3)).toBe(0)
  })

  it('reports progress once per frame', () => {
    const source = blockSource()
    const seen: number[] = []
    matteSequence(source, [], params(), [], (done) => seen.push(done))

    expect(seen.slice(0, 5)).toEqual([1, 2, 3, 4, 5])
  })

  /** 5 帧里方块只盖住 (1,1) 两帧，中值仍判它为背景，所以擦除笔迹前后能区分开 */
  function eraseAt(x: number, y: number) {
    return { mode: 'erase' as const, radius: 1, feather: 0, points: [{ x, y }] }
  }

  it('applies an unscoped stroke to every frame', () => {
    const source = blockSource(5)
    const baseline = matteSequence(source, [], params())
    const mattes = matteSequence(source, [], params(), [
      { frameIndex: null, stroke: eraseAt(1, 1) },
    ])

    expect(alphaAt(baseline[0], 1, 1)).toBe(255)
    expect(alphaAt(mattes[0], 1, 1)).toBe(0)
    expect(alphaAt(mattes[1], 1, 1)).toBe(0)
  })

  it('applies a scoped stroke to exactly one frame', () => {
    const source = blockSource(5)
    const mattes = matteSequence(source, [], params(), [{ frameIndex: 1, stroke: eraseAt(1, 1) }])

    expect(alphaAt(mattes[1], 1, 1)).toBe(0)
    // 第 2 帧不该被这条笔画到：(2,1) 在那里是前景，且就在笔刷半径边缘外
    expect(alphaAt(mattes[2], 2, 1)).toBe(255)
  })

  it('rejects a stroke pointing at a frame that is not there', () => {
    const source = blockSource(3)
    const stroke = {
      frameIndex: 9,
      stroke: { mode: 'keep' as const, radius: 1, feather: 0, points: [{ x: 0, y: 0 }] },
    }

    expect(() => matteSequence(source, [], params(), [stroke])).toThrowError(/out of range/)
  })
})

describe('renderSequence', () => {
  function greenSource() {
    const frames: RgbaFrame[] = []
    for (let t = 0; t < 3; t++) {
      const canvas = image(8, 8, [10, 10, 10])
      paint(canvas, 1 + t * 2, 3, [0, 255, 0])
      frames.push(frameOf(canvas))
    }
    return prepareSource(frames)
  }

  it('composites onto the matte colour and keeps every frame opaque', () => {
    const source = greenSource()
    const mattes = matteSequence(source, [], params())
    const frames = renderSequence(source, mattes, params(), {
      mode: 'matte',
      color: [255, 255, 255],
    })

    expect(frames).toHaveLength(3)
    for (const frame of frames) {
      for (let i = 3; i < frame.rgba.length; i += 4) expect(frame.rgba[i]).toBe(255)
    }
    expect(Array.from(frames[0].rgba.slice(0, 4))).toEqual([255, 255, 255, 255])
  })

  it('pulls green spill out of the kept foreground', () => {
    const source = greenSource()
    const mattes = matteSequence(source, [], params())
    const without = renderSequence(source, mattes, params(), { mode: 'binary', threshold: 127 })
    const cleaned = renderSequence(source, mattes, params({ despillStrength: 1 }), {
      mode: 'binary',
      threshold: 127,
    })
    const index = (3 * 8 + 1) * 4

    expect(without[0].rgba[index + 1]).toBe(255)
    expect(cleaned[0].rgba[index + 1]).toBe(0)
  })

  it('unmixes the compositing equation on the soft edge when asked', () => {
    const frames = [
      frameOf(image(2, 1, [200, 100, 100])),
      frameOf(image(2, 1, [100, 100, 100])),
      frameOf(image(2, 1, [100, 100, 100])),
    ]
    const source = prepareSource(frames)
    const matte = { width: 2, height: 1, alpha: new Uint8ClampedArray([128, 255]) }
    const mattes = [matte, matte, matte]
    const plain = renderSequence(source, mattes, params(), { mode: 'binary', threshold: 127 })
    const unmixed = renderSequence(source, mattes, params({ decontaminateEdges: true }), {
      mode: 'binary',
      threshold: 127,
    })

    expect(plain[0].rgba[0]).toBe(200)
    expect(unmixed[0].rgba[0]).toBe(255)
    expect(unmixed[0].rgba[1]).toBe(100)
  })

  it('rejects a matte count that does not match the frames', () => {
    const source = blockSource(3)
    const mattes = matteSequence(source, [], params())

    expect(() =>
      renderSequence(source, mattes.slice(1), params(), { mode: 'binary', threshold: 127 }),
    ).toThrowError(/2 mattes for 3 frames/)
  })
})

describe('renderPreview', () => {
  it('renders just the requested frame with its delay intact', () => {
    const source = prepareSource([
      frameOf(image(4, 4, [1, 2, 3]), 7),
      frameOf(image(4, 4, [4, 5, 6]), 21),
      frameOf(image(4, 4, [7, 8, 9]), 33),
    ])
    const preview = renderPreview(source, 1, [], params(), [], {
      mode: 'matte',
      color: [0, 0, 0],
    })

    expect(preview.delayCs).toBe(21)
    expect(preview.width).toBe(4)
  })

  it('honours a stroke scoped to the previewed frame only', () => {
    const source = blockSource(5)
    const stroke = {
      frameIndex: 0,
      stroke: { mode: 'erase' as const, radius: 1, feather: 0, points: [{ x: 1, y: 1 }] },
    }
    const erased = renderPreview(source, 0, [], params(), [stroke], {
      mode: 'binary',
      threshold: 127,
    })
    const untouched = renderPreview(source, 1, [], params(), [stroke], {
      mode: 'binary',
      threshold: 127,
    })
    const offset = (1 * 12 + 1) * 4

    expect(erased.rgba[offset + 3]).toBe(0)
    expect(untouched.rgba[offset + 3]).toBe(255)
  })

  it('rejects a frame index outside the sequence', () => {
    const source = blockSource(3)

    expect(() =>
      renderPreview(source, 3, [], params(), [], { mode: 'binary', threshold: 127 }),
    ).toThrowError(/out of range/)
  })
})
