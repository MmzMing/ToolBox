import { describe, expect, it } from 'vitest'

import {
  DESKTOP_LIMITS,
  MOBILE_LIMITS,
  checkBudget,
  estimateGifBytes,
  limitsFor,
} from '@/modules/gif/budget'

describe('estimateGifBytes', () => {
  it('stays within 10% of the measured 480x270x300 baseline', () => {
    const measured = 758.7 * 1024
    const estimate = estimateGifBytes({ width: 480, height: 270, frames: 300 })

    expect(Math.abs(estimate - measured) / measured).toBeLessThan(0.1)
  })

  it('scales linearly with frame count', () => {
    const one = estimateGifBytes({ width: 320, height: 180, frames: 10 })
    const ten = estimateGifBytes({ width: 320, height: 180, frames: 100 })

    expect(Math.abs(ten - one * 10) / (one * 10)).toBeLessThan(0.01)
  })
})

describe('checkBudget', () => {
  const inside = { width: 320, height: 180, frames: 60, seconds: 6 }

  it('accepts a job inside every limit', () => {
    expect(checkBudget(inside, DESKTOP_LIMITS)).toEqual({ ok: true })
  })

  it('reports the width breach first and suggests the capped width', () => {
    const verdict = checkBudget({ ...inside, width: 900 }, DESKTOP_LIMITS)

    expect(verdict).toMatchObject({ ok: false, reason: 'width', suggestion: { width: 480 } })
  })

  it('reports a frame count breach', () => {
    const verdict = checkBudget({ ...inside, frames: 500 }, DESKTOP_LIMITS)

    expect(verdict).toMatchObject({ ok: false, reason: 'frames', suggestion: { frames: 300 } })
  })

  it('reports a duration breach', () => {
    const verdict = checkBudget({ ...inside, seconds: 45 }, DESKTOP_LIMITS)

    expect(verdict).toMatchObject({ ok: false, reason: 'seconds', suggestion: { seconds: 20 } })
  })

  it('reports a height breach, which the width cap alone would miss', () => {
    const verdict = checkBudget(
      { width: 200, height: 5000, frames: 10, seconds: 1 },
      DESKTOP_LIMITS,
    )

    expect(verdict).toMatchObject({ ok: false, reason: 'height', suggestion: { height: 480 } })
  })

  it('applies the stricter mobile limits', () => {
    const job = { width: 400, height: 300, frames: 150, seconds: 12 }

    expect(checkBudget(job, DESKTOP_LIMITS)).toEqual({ ok: true })
    expect(checkBudget(job, MOBILE_LIMITS)).toMatchObject({ ok: false })
  })

  it('picks limits by breakpoint', () => {
    expect(limitsFor(true)).toBe(MOBILE_LIMITS)
    expect(limitsFor(false)).toBe(DESKTOP_LIMITS)
  })
})
