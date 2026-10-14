import { describe, expect, it } from 'vitest'

import {
  COMPARE_EDGE_MARGIN,
  COMPARE_LABEL_FADE_PX,
  COMPARE_STRETCH_PX,
  clamp,
  edgeSoftened,
  halfPlaneClip,
  labelOpacity,
  lerp,
  rubberBand,
} from '@/utils/image-compare-geometry'

/** 从 polygon(...) 文本里取回顶点，方便按坐标断言。 */
function verticesOf(clip: string): [number, number][] {
  return clip
    .slice('polygon('.length, -1)
    .split(', ')
    .map((pair) => pair.split(' ').map((n) => Number.parseFloat(n)) as [number, number])
}

describe('clamp / lerp', () => {
  it('keeps values inside the inclusive bounds', () => {
    expect(clamp(-5, 0, 100)).toBe(0)
    expect(clamp(140, 0, 100)).toBe(100)
    expect(clamp(42, 0, 100)).toBe(42)
  })

  it('interpolates at both ends and in between', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.25)).toBe(12.5)
  })
})

describe('rubberBand', () => {
  it('does not move at all for zero travel', () => {
    expect(rubberBand(0)).toBe(0)
  })

  it('gives less than the raw distance and mirrors its sign', () => {
    expect(rubberBand(30)).toBeLessThan(30)
    expect(rubberBand(-30)).toBeGreaterThan(-30)
    expect(rubberBand(30)).toBeCloseTo(-rubberBand(-30), 10)
  })

  it('never passes the limit, however far the pointer goes', () => {
    for (const distance of [1, 50, 1_000, 1_000_000]) {
      expect(Math.abs(rubberBand(distance))).toBeLessThanOrEqual(COMPARE_STRETCH_PX)
    }
    expect(rubberBand(1_000_000)).toBeCloseTo(COMPARE_STRETCH_PX, 1)
  })

  it('gets harder monotonically, so the divider cannot fly off', () => {
    let previous = 0
    for (const distance of [1, 2, 5, 10, 25, 100]) {
      const next = rubberBand(distance)
      expect(next).toBeGreaterThan(previous)
      previous = next
    }
  })
})

describe('edgeSoftened', () => {
  const SIZE = 400

  it('leaves the handle alone in the safe middle', () => {
    expect(edgeSoftened(SIZE / 2, SIZE)).toBe(SIZE / 2)
    expect(edgeSoftened(COMPARE_EDGE_MARGIN, SIZE)).toBe(COMPARE_EDGE_MARGIN)
    expect(edgeSoftened(SIZE - COMPARE_EDGE_MARGIN, SIZE)).toBe(SIZE - COMPARE_EDGE_MARGIN)
  })

  it('pulls the handle inward at both edges, by the same amount', () => {
    const atZero = edgeSoftened(0, SIZE)
    const atEnd = edgeSoftened(SIZE, SIZE)
    expect(atZero).toBeGreaterThan(0)
    expect(atZero).toBeLessThanOrEqual(COMPARE_EDGE_MARGIN)
    expect(SIZE - atEnd).toBeCloseTo(atZero, 10)
  })

  it('keeps the inset bounded by the give distance', () => {
    // 让位最多 GIVE，于是贴边时仍留在 [MARGIN - GIVE, MARGIN] 内
    expect(edgeSoftened(0, SIZE)).toBeGreaterThanOrEqual(COMPARE_EDGE_MARGIN - 12)
    expect(edgeSoftened(-40, SIZE)).toBeLessThan(COMPARE_EDGE_MARGIN)
  })

  it('moves forward with the line instead of stopping dead', () => {
    const steps = [0, 5, 15, 30, 42].map((at) => edgeSoftened(at, SIZE))
    steps.forEach((value, index) => {
      if (index > 0) {
        expect(value).toBeGreaterThan(steps[index - 1] as number)
      }
    })
  })
})

describe('labelOpacity', () => {
  it('is fully hidden once the line reaches the label', () => {
    expect(labelOpacity(0)).toBe(0)
    expect(labelOpacity(-20)).toBe(0)
  })

  it('fades linearly and stops at one', () => {
    expect(labelOpacity(COMPARE_LABEL_FADE_PX / 2)).toBe(0.5)
    expect(labelOpacity(COMPARE_LABEL_FADE_PX)).toBe(1)
    expect(labelOpacity(COMPARE_LABEL_FADE_PX * 4)).toBe(1)
  })
})

describe('halfPlaneClip', () => {
  const W = 100
  const H = 60

  it('cuts the left half for a horizontal divider at the middle', () => {
    expect(halfPlaneClip(W, H, [50, 30], 0)).toBe(
      'polygon(0.00px 0.00px, 50.00px 0.00px, 50.00px 60.00px, 0.00px 60.00px)',
    )
  })

  it('cuts the top half once the divider has turned vertical', () => {
    expect(halfPlaneClip(W, H, [50, 30], Math.PI / 2)).toBe(
      'polygon(0.00px 0.00px, 100.00px 0.00px, 100.00px 30.00px, 0.00px 30.00px)',
    )
  })

  it('keeps every vertex on the frame or on the line while turning', () => {
    const points = verticesOf(halfPlaneClip(W, H, [50, 30], Math.PI / 4))
    expect(points.length).toBeGreaterThanOrEqual(3)
    points.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(W)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(H)
    })
  })

  it('collapses to nothing when the line is off the left edge', () => {
    const clip = halfPlaneClip(W, H, [0, 30], 0)
    expect(clip.startsWith('polygon(')).toBe(true)
    verticesOf(clip).forEach(([x]) => {
      expect(x).toBe(0)
    })
  })

  it('reveals the whole frame once the line passes it', () => {
    expect(halfPlaneClip(W, H, [W, 30], 0)).toBe(
      'polygon(0.00px 0.00px, 100.00px 0.00px, 100.00px 60.00px, 0.00px 60.00px)',
    )
  })

  it('falls back to an empty inset when the plane misses the frame', () => {
    expect(halfPlaneClip(W, H, [-10, 30], 0)).toBe('inset(50%)')
  })
})
