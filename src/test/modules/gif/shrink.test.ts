import { describe, expect, it } from 'vitest'

import { shrinkToTarget } from '@/modules/gif/shrink'
import { optimizeOptionsFor, type GifsicleOptions } from '@/modules/gif/optimize'
import { stepAt, type EncodeParams } from '@/modules/gif/targets'

const SOURCE = { width: 320, height: 180 }
const BYTES = new ArrayBuffer(16)

/** 假 gifsicle：体积完全由参数决定，于是搜索结果可预测 */
function fakeOptimize(seen: GifsicleOptions[]) {
  return async (_bytes: ArrayBuffer, options: GifsicleOptions) => {
    seen.push(options)
    const width = options.resize?.width ?? SOURCE.width
    const colors = options.maxColors ?? 256
    const lossy = options.lossy ?? 0
    return new Blob([new Uint8Array(Math.round((width * colors * (400 - lossy)) / 400))])
  }
}

describe('shrinkToTarget', () => {
  it('returns the gentlest parameters that fit the budget', async () => {
    const seen: GifsicleOptions[] = []
    const outcome = await shrinkToTarget({
      bytes: BYTES,
      source: SOURCE,
      targetBytes: 128 * 1024,
      optimize: fakeOptimize(seen),
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.blob.size).toBeLessThanOrEqual(128 * 1024)
    expect(outcome.rounds).toBeGreaterThanOrEqual(1)
    expect(seen).toHaveLength(outcome.rounds)
  })

  it('reports failure with the harshest attempt instead of looping forever', async () => {
    const seen: GifsicleOptions[] = []
    const outcome = await shrinkToTarget({
      bytes: BYTES,
      source: SOURCE,
      targetBytes: 64,
      optimize: fakeOptimize(seen),
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.params).toEqual(stepAt({ width: 320, fps: 5, maxColors: 256, lossy: 0 }, 6))
  })

  it('starts from the untouched source size when no start is given', async () => {
    const seen: GifsicleOptions[] = []
    await shrinkToTarget({
      bytes: BYTES,
      source: SOURCE,
      targetBytes: 10 * 1024 * 1024,
      optimize: fakeOptimize(seen),
    })

    expect(seen[0]).toEqual(
      optimizeOptionsFor({ width: 320, fps: 5, maxColors: 256, lossy: 0 }, SOURCE).options,
    )
    expect(seen).toHaveLength(1)
  })

  it('honours an explicit start parameter', async () => {
    const seen: GifsicleOptions[] = []
    const start: EncodeParams = { width: 160, fps: 5, maxColors: 64, lossy: 120 }
    await shrinkToTarget({
      bytes: BYTES,
      source: SOURCE,
      targetBytes: 1,
      start,
      optimize: fakeOptimize(seen),
    })

    expect(seen[0]).toMatchObject({ maxColors: 64, lossy: 120, resize: { width: 160, height: 90 } })
  })
})
