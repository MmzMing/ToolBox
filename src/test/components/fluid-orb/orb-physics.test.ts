import { describe, expect, it } from 'vitest'

import {
  approach,
  applyTap,
  autoVolumeAt,
  clamp,
  clamp01,
  createSquishState,
  finiteOr,
  MAX_SQUISH,
  orbStateTargets,
  resolveLevel,
  smoothstep,
  stepSquish,
} from '@/components/fluid-orb/orb-physics'

function simulate(seconds: number, from = createSquishState()) {
  const steps = Math.round(seconds * 60)
  let state = from
  for (let i = 0; i < steps; i += 1) {
    state = stepSquish(state, 1 / 60)
  }
  return state
}

describe('clamp / clamp01 / finiteOr', () => {
  it('pins values to the range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
  })

  it('treats NaN and Infinity as missing', () => {
    expect(finiteOr(Number.NaN, 3)).toBe(3)
    expect(finiteOr(Number.POSITIVE_INFINITY, 3)).toBe(3)
    expect(finiteOr(undefined, 3)).toBe(3)
    expect(finiteOr(0, 3)).toBe(0)
  })
})

describe('smoothstep', () => {
  it('saturates outside the edges and eases between them', () => {
    expect(smoothstep(0, 1, -2)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5)
  })

  it('degrades to a hard step when the edges coincide', () => {
    expect(smoothstep(1, 1, 0)).toBe(0)
    expect(smoothstep(1, 1, 1)).toBe(1)
  })
})

describe('approach', () => {
  it('leaves the value alone for a zero timestep', () => {
    expect(approach(0.2, 1, 8, 0)).toBe(0.2)
  })

  it('moves toward the target without overshooting', () => {
    const next = approach(0, 1, 8, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(1)
  })

  it('is frame-rate independent', () => {
    const oneBig = approach(0, 1, 8, 1 / 30)
    const twoSmall = approach(approach(0, 1, 8, 1 / 60), 1, 8, 1 / 60)
    expect(oneBig).toBeCloseTo(twoSmall, 4)
  })
})

describe('applyTap', () => {
  it('injects velocity into every degree of freedom', () => {
    const tapped = applyTap(createSquishState(), 0, 1)
    expect(tapped.amountVel).toBeGreaterThan(0)
    expect(tapped.mode2Vel).toBeGreaterThan(0)
    expect(tapped.mode3Vel).toBeLessThan(0)
  })

  it('scales with strength and clamps out-of-range values', () => {
    expect(applyTap(createSquishState(), 0, 1).amountVel).toBeGreaterThan(
      applyTap(createSquishState(), 0, 0.3).amountVel,
    )
    expect(applyTap(createSquishState(), 0, 9).amountVel).toBe(
      applyTap(createSquishState(), 0, 1).amountVel,
    )
    expect(applyTap(createSquishState(), 0, -2).amountVel).toBe(0)
  })

  it('stores the squish axis in radians', () => {
    expect(applyTap(createSquishState(), 90, 0.5).angle).toBeCloseTo(Math.PI / 2, 5)
    expect(applyTap(createSquishState(), Number.NaN, 0.5).angle).toBe(0)
  })

  it('stacks on the leftover velocity so repeated taps get wilder', () => {
    const once = applyTap(createSquishState(), 0, 0.6)
    expect(applyTap(once, 0, 0.6).amountVel).toBeGreaterThan(once.amountVel)
  })
})

describe('stepSquish', () => {
  it('actually deforms within a few frames and then settles', () => {
    const tapped = applyTap(createSquishState(), 0, 1)
    expect(simulate(0.1, tapped).amount).toBeGreaterThan(0.05)
    const settled = simulate(10, tapped)
    expect(Math.abs(settled.amount)).toBeLessThan(1e-2)
    expect(Math.abs(settled.mode2)).toBeLessThan(1e-2)
    expect(Math.abs(settled.mode3)).toBeLessThan(1e-2)
  })

  it('overshoots at least once, which is the bubble part of the feel', () => {
    const tapped = applyTap(createSquishState(), 0, 1)
    let min = 0
    let state = tapped
    for (let i = 0; i < 240; i += 1) {
      state = stepSquish(state, 1 / 60)
      min = Math.min(min, state.amount)
    }
    expect(min).toBeLessThan(0)
  })

  it('never lets the deformation reach the flip-the-SDF range', () => {
    let state = applyTap(createSquishState(), 0, 1)
    for (let i = 0; i < 40; i += 1) {
      state = stepSquish(applyTap(state, 45, 1), 1 / 60)
      expect(Math.abs(state.amount)).toBeLessThanOrEqual(MAX_SQUISH)
      expect(Math.abs(state.mode3)).toBeLessThanOrEqual(MAX_SQUISH / 2)
    }
  })

  it('survives a throttled-tab timestep by substepping instead of exploding', () => {
    const state = stepSquish(applyTap(createSquishState(), 0, 1), 5)
    expect(Number.isFinite(state.amount)).toBe(true)
    expect(Math.abs(state.amount)).toBeLessThanOrEqual(MAX_SQUISH)
  })

  it('keeps the axis while stepping', () => {
    const tapped = applyTap(createSquishState(), 30, 0.8)
    expect(stepSquish(tapped, 1 / 60).angle).toBe(tapped.angle)
  })
})

describe('orbStateTargets', () => {
  it('leaves idle as the neutral baseline', () => {
    expect(orbStateTargets('idle')).toMatchObject({ rim: 1, halo: 1, swell: 0 })
  })

  it('makes thinking the fastest colour wheel and speaking the loudest swell', () => {
    expect(orbStateTargets('thinking').colorSpeed).toBeGreaterThan(
      orbStateTargets('idle').colorSpeed,
    )
    expect(orbStateTargets('speaking').swell).toBeGreaterThan(orbStateTargets('listening').swell)
  })

  it('has a row for every state', () => {
    for (const state of ['idle', 'listening', 'thinking', 'speaking'] as const) {
      expect(orbStateTargets(state).rim).toBeGreaterThan(0)
    }
  })
})

describe('autoVolumeAt', () => {
  it('stays inside the documented 0..1 range', () => {
    for (let t = 0; t < 60; t += 0.017) {
      const level = autoVolumeAt(t)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic and actually moves', () => {
    expect(autoVolumeAt(3.25)).toBe(autoVolumeAt(3.25))
    const samples = new Set(Array.from({ length: 400 }, (_, i) => autoVolumeAt(i / 40)))
    expect(samples.size).toBeGreaterThan(100)
  })

  it('leaves silent gaps so the fake voice is not a constant hum', () => {
    const quiet = Array.from({ length: 600 }, (_, i) => autoVolumeAt(i / 60)).filter(
      (level) => level < 0.02,
    )
    expect(quiet.length).toBeGreaterThan(0)
  })

  it('treats a broken time as zero rather than NaN', () => {
    expect(autoVolumeAt(Number.NaN)).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(autoVolumeAt(Number.NaN))).toBe(true)
  })
})

describe('resolveLevel', () => {
  const base = { autoVolume: true, state: 'speaking' as const, time: 1 }

  it('prefers an explicit volume over everything else', () => {
    expect(resolveLevel({ ...base, volume: 0.25, sampled: 0.9 })).toBe(0.25)
  })

  it('clamps an out-of-range explicit volume', () => {
    expect(resolveLevel({ ...base, volume: 4 })).toBe(1)
  })

  it('falls back to the sampled analyser value', () => {
    expect(resolveLevel({ ...base, sampled: 0.6 })).toBe(0.6)
  })

  it('ignores a NaN sample and keeps looking', () => {
    expect(resolveLevel({ ...base, sampled: Number.NaN })).toBe(autoVolumeAt(1))
  })

  it('only fakes a voice while listening or speaking', () => {
    expect(resolveLevel({ ...base, state: 'idle', autoVolume: true })).toBe(0)
    expect(resolveLevel({ ...base, state: 'thinking', autoVolume: true })).toBe(0)
  })

  it('goes silent when autoVolume is off', () => {
    expect(resolveLevel({ ...base, autoVolume: false })).toBe(0)
  })
})
