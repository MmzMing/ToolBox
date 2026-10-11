import { describe, expect, it } from 'vitest'

import {
  clampHole,
  holeOf,
  orbStation,
  scrollDelta,
  spotlightPanels,
  tourTargetsFor,
  type Rect,
} from '@/modules/page-tour/targets'

const VIEW = { width: 1200, height: 900 }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function area(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height)
}

describe('tourTargetsFor', () => {
  it('introduces the top bar only on the tiers that render it', () => {
    expect(tourTargetsFor('desktop').map((t) => t.key)).toEqual([
      'dock',
      'search',
      'topNav',
      'circuit',
    ])
    expect(tourTargetsFor('tablet').map((t) => t.key)).toContain('topNav')
    // 手机不渲染顶栏胶囊（dock-logic 的 LAYOUTS），所以这里自动少一项
    expect(tourTargetsFor('mobile').map((t) => t.key)).toEqual(['dock', 'search', 'circuit'])
  })

  it('marks the tall and in-content targets as needing a scroll correction', () => {
    const byKey = Object.fromEntries(tourTargetsFor('desktop').map((t) => [t.key, t.needsScroll]))
    expect(byKey.circuit).toBe(true)
    expect(byKey.search).toBe(true)
    expect(byKey.dock).toBe(false)
    expect(byKey.topNav).toBe(false)
  })
})

describe('holeOf / clampHole', () => {
  it('pads the target on all four sides', () => {
    expect(holeOf({ x: 100, y: 100, width: 50, height: 30 }, 10)).toEqual({
      x: 90,
      y: 90,
      width: 70,
      height: 50,
    })
  })

  it('keeps the hole inside the viewport instead of drawing off-screen', () => {
    const hole = clampHole({ x: -40, y: 800, width: 1300, height: 300 }, VIEW)
    expect(hole.x).toBe(0)
    expect(hole.y + hole.height).toBeLessThanOrEqual(VIEW.height)
    expect(hole.width).toBeLessThanOrEqual(VIEW.width)
  })
})

describe('spotlightPanels', () => {
  it('always emits four panels so the DOM stays stable across steps', () => {
    expect(spotlightPanels({ x: 300, y: 200, width: 200, height: 100 }, VIEW)).toHaveLength(4)
  })

  it('covers the surround without touching the hole', () => {
    const hole = { x: 300, y: 200, width: 200, height: 100 }
    const panels = spotlightPanels(hole, VIEW)
    for (const panel of panels) {
      expect(overlaps(panel, hole)).toBe(false)
    }
    const covered = panels.reduce((sum, p) => sum + area(p), 0)
    expect(covered).toBe(VIEW.width * VIEW.height - area(hole))
  })

  it('collapses to nothing on the side the hole is flush with', () => {
    const panels = spotlightPanels({ x: 0, y: 0, width: 200, height: 100 }, VIEW)
    expect(area(panels[0])).toBe(0)
    expect(area(panels[2])).toBe(0)
    expect(area(panels[1])).toBeGreaterThan(0)
    expect(area(panels[3])).toBeGreaterThan(0)
  })
})

describe('scrollDelta', () => {
  it('does not move a target that is already inside the safe zone', () => {
    expect(scrollDelta({ x: 0, y: 200, width: 300, height: 100 }, VIEW)).toBe(0)
  })

  it('scrolls up to reveal a target clipped by the top edge', () => {
    expect(scrollDelta({ x: 0, y: -60, width: 300, height: 100 }, VIEW, 24)).toBe(-84)
  })

  it('scrolls down to reveal a target clipped by the bottom edge', () => {
    // 底边 900 要退到安全线 876 以内
    expect(scrollDelta({ x: 0, y: 800, width: 300, height: 100 }, VIEW, 24)).toBe(24)
  })

  it('aligns a taller-than-viewport target to the top instead of centring it', () => {
    const tall = { x: 0, y: 300, width: 300, height: 1400 }
    expect(scrollDelta(tall, VIEW)).toBe(300 - 24)
    // 已经贴顶就别动，否则每次切目标都会抖一下
    expect(scrollDelta({ ...tall, y: 10 }, VIEW)).toBe(0)
  })
})

describe('orbStation', () => {
  it('stands below the hole, right-aligned to it', () => {
    const station = orbStation({ x: 100, y: 100, width: 300, height: 80 }, 60, VIEW)
    expect(station.y).toBe(192)
    expect(station.x).toBe(340)
  })

  it('flips above when there is no room below', () => {
    const station = orbStation({ x: 100, y: 700, width: 300, height: 180 }, 60, VIEW)
    expect(station.y + 60).toBeLessThanOrEqual(700)
  })

  it('stays inside the viewport when the hole is wider than the screen', () => {
    const station = orbStation({ x: -50, y: 100, width: 2000, height: 80 }, 60, VIEW)
    expect(station.x).toBeGreaterThanOrEqual(0)
    expect(station.x + 60).toBeLessThanOrEqual(VIEW.width)
  })
})
