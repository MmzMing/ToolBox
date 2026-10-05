import { describe, expect, it } from 'vitest'

import {
  canUseAutoEngine,
  CANVAS_TOOLS,
  draftStroke,
  encodeOptions,
  estimateOutputBytes,
  exportName,
  matteOutput,
  matteParams,
  MATTE_SWATCHES,
  parseHexColor,
  pngFrameName,
  pushSeed,
  removerBudget,
  stageScale,
  toHexColor,
  toolStrokeMode,
  DEFAULT_SETTINGS,
  type RemoverSettings,
} from '@/tools/images/gif-bg-remover/gif-bg-remover.service'
import { DESKTOP_LIMITS } from '@/modules/gif/budget'
import type { GifDescriptor } from '@/modules/gif/types'

function settings(overrides: Partial<RemoverSettings> = {}): RemoverSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

function descriptor(overrides: Partial<GifDescriptor> = {}): GifDescriptor {
  return {
    width: 200,
    height: 160,
    frameCount: 12,
    loopCount: 0,
    delaysCs: Array.from({ length: 12 }, () => 10),
    ...overrides,
  }
}

describe('parseHexColor / toHexColor', () => {
  it('reads a hex colour with or without the leading hash', () => {
    expect(parseHexColor('#ff8000')).toEqual([255, 128, 0])
    expect(parseHexColor('00ff80')).toEqual([0, 255, 128])
  })

  it('returns null for anything that is not six hex digits', () => {
    expect(parseHexColor('#fff')).toBeNull()
    expect(parseHexColor('rebeccapurple')).toBeNull()
    expect(parseHexColor('')).toBeNull()
  })

  it('round-trips through toHexColor', () => {
    expect(toHexColor([10, 200, 30])).toBe('#0ac81e')
    expect(parseHexColor(toHexColor([1, 2, 3]))).toEqual([1, 2, 3])
  })
})

describe('matteParams', () => {
  it('maps the flat UI knobs onto the nested pipeline params', () => {
    const params = matteParams(
      settings({ engine: 'both', threshold: 11, ramp: 40, tolerance: 7, despill: 50 }),
    )

    expect(params.mode).toBe('both')
    expect(params.difference).toEqual({ threshold: 11, softness: 40 })
    expect(params.key.tolerance).toBe(7)
    expect(params.despillStrength).toBe(0.5)
  })

  it('feeds the single morphology slider into both open and close', () => {
    expect(matteParams(settings({ morph: 2 }))).toMatchObject({ open: 2, close: 2 })
  })
})

describe('matteOutput', () => {
  it('falls back to white when the matte colour is malformed', () => {
    expect(matteOutput(settings({ output: 'matte', matteColor: 'nope' }))).toEqual({
      mode: 'matte',
      color: [255, 255, 255],
    })
  })

  it('keeps the soft alpha for the PNG sequence', () => {
    expect(matteOutput(settings({ output: 'png' }))).toEqual({ mode: 'alpha' })
  })

  it('selects the dither method the user picked', () => {
    expect(matteOutput(settings({ output: 'dither', dither: 'floyd-steinberg' }))).toEqual({
      mode: 'dither',
      method: 'floyd-steinberg',
    })
  })
})

describe('encodeOptions', () => {
  it('asks for a transparent slot only for the two transparent modes', () => {
    expect(encodeOptions(settings({ output: 'transparent' }), null).transparency).toMatchObject({
      threshold: 127,
      dispose: 2,
    })
    expect(encodeOptions(settings({ output: 'dither' }), null).transparency).toBeDefined()
    expect(encodeOptions(settings(), null).transparency).toBeUndefined()
    expect(encodeOptions(settings({ output: 'png' }), null).transparency).toBeUndefined()
  })

  it('inherits loop count and the first frame delay from the source', () => {
    const options = encodeOptions(settings(), descriptor({ loopCount: 3, delaysCs: [17, 8] }))

    expect(options.loopCount).toBe(3)
    expect(options.delayCs).toBe(17)
  })

  it('falls back to looping forever when the source has no loop extension', () => {
    expect(encodeOptions(settings(), descriptor({ loopCount: null })).loopCount).toBe(0)
  })
})

describe('pushSeed', () => {
  const seed = (index: number) => ({
    x: index,
    y: 0,
    color: [index, 0, 0] as [number, number, number],
  })

  it('appends until the cap, then keeps the most recent picks', () => {
    let seeds: ReturnType<typeof pushSeed> = []
    for (let index = 0; index < 12; index++) seeds = pushSeed(seeds, seed(index))

    expect(seeds).toHaveLength(8)
    expect(seeds[0].x).toBe(4)
    expect(seeds[7].x).toBe(11)
  })

  it('never mutates the list it was given', () => {
    const before = [seed(0)]

    pushSeed(before, seed(1))

    expect(before).toHaveLength(1)
  })
})

describe('draftStroke', () => {
  const draft = { mode: 'erase' as const, points: [{ x: 3, y: 4 }] }

  it('scopes the stroke to every frame when asked', () => {
    expect(draftStroke(draft, 10, true, 5).frameIndex).toBeNull()
  })

  it('pins the stroke to the current frame otherwise, and feathers off the radius', () => {
    const stroke = draftStroke(draft, 8, false, 5)

    expect(stroke.frameIndex).toBe(5)
    expect(stroke.stroke.radius).toBe(8)
    expect(stroke.stroke.feather).toBe(4)
  })
})

describe('removerBudget', () => {
  it('passes an ordinary sticker and reports seconds from the delays', () => {
    expect(removerBudget(descriptor(), false).ok).toBe(true)
  })

  it('rejects a source wider than the desktop cap', () => {
    const verdict = removerBudget(descriptor({ width: DESKTOP_LIMITS.maxWidth + 1 }), false)

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('width')
  })

  it('rejects a long animation by seconds rather than frame count', () => {
    const long = descriptor({ frameCount: 100, delaysCs: Array.from({ length: 100 }, () => 50) })
    const verdict = removerBudget(long, false)

    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('seconds')
  })
})

describe('canvas tool', () => {
  it('maps the three-way pointer onto the two brush stroke modes', () => {
    expect(toolStrokeMode('pick')).toBe('erase')
    expect(toolStrokeMode('erase')).toBe('erase')
    expect(toolStrokeMode('restore')).toBe('keep')
  })

  it('offers the picker first so the default gesture is the safe one', () => {
    expect(CANVAS_TOOLS[0]).toBe('pick')
    expect(CANVAS_TOOLS).toHaveLength(3)
  })

  it('lists matte swatches as parseable hex colours', () => {
    for (const hex of MATTE_SWATCHES) expect(parseHexColor(hex)).not.toBeNull()
  })
})

describe('helpers', () => {
  it('needs three frames before the temporal engine has a median', () => {
    expect(canUseAutoEngine(2)).toBe(false)
    expect(canUseAutoEngine(3)).toBe(true)
  })

  it('estimates output size from pixels, not from the file', () => {
    expect(
      estimateOutputBytes(descriptor({ width: 100, height: 100, frameCount: 10 })),
    ).toBeGreaterThan(estimateOutputBytes(descriptor({ width: 100, height: 100, frameCount: 2 })))
  })

  it('never upscales on mobile and caps upscaling on desktop', () => {
    const box = { width: 800, height: 800 }
    const small = { width: 40, height: 40 }

    expect(stageScale(box, small, true)).toBe(1)
    expect(stageScale(box, small, false)).toBe(4)
    expect(stageScale({ width: 200, height: 200 }, { width: 400, height: 400 }, false)).toBe(0.5)
  })

  it('names the artefact after the chosen output mode', () => {
    expect(exportName('cat.gif', settings())).toBe('cat-nobg.gif')
    expect(exportName('cat.gif', settings({ output: 'png' }))).toBe('cat-frames.zip')
    expect(pngFrameName(7)).toBe('frame-007.png')
  })
})
