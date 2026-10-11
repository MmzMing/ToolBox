import { describe, expect, it } from 'vitest'

import {
  ARROW_EDGE_MARGIN,
  BUBBLE_GAP,
  placeBubble,
} from '@/components/fluid-orb/orb-bubble-placement'

const VIEW = { width: 1200, height: 900 }
const BUBBLE = { width: 240, height: 100 }

describe('placeBubble', () => {
  it('prefers sitting above the orb when there is room', () => {
    const placed = placeBubble({ x: 500, y: 400, width: 60, height: 60 }, BUBBLE, VIEW)
    expect(placed.side).toBe('top')
    expect(placed.shift).toBe(0)
  })

  it('drops below when the top edge is in the way', () => {
    const placed = placeBubble({ x: 500, y: 40, width: 60, height: 60 }, BUBBLE, VIEW)
    expect(placed.side).toBe('bottom')
  })

  it('moves to a side when neither above nor below fits', () => {
    const placed = placeBubble({ x: 500, y: 20, width: 60, height: 870 }, BUBBLE, VIEW)
    expect(placed.side).toBe('left')
  })

  it('uses the right side when the orb hugs the left edge', () => {
    const placed = placeBubble({ x: 0, y: 20, width: 60, height: 870 }, BUBBLE, VIEW)
    expect(placed.side).toBe('right')
  })

  it('slides the bubble inward so it never overhangs the screen edge', () => {
    // 球贴着右边，气泡居中会有一半溢出屏幕
    const placed = placeBubble({ x: 1150, y: 400, width: 50, height: 50 }, BUBBLE, VIEW)
    expect(placed.side).toBe('top')
    expect(placed.shift).toBeLessThan(0)
    const centre = 1150 + 25 + placed.shift
    expect(centre + BUBBLE.width / 2).toBeLessThanOrEqual(VIEW.width - 12)
  })

  it('shifts along the vertical cross axis when sitting to one side', () => {
    // 球又高又贴顶：上下都塞不下 240×200 的气泡，只能去侧面，
    // 而气泡中心会被夹到安全线以内（cy 100 < min 112 → 往下挪 12）
    const placed = placeBubble(
      { x: 400, y: 0, width: 200, height: 200 },
      { width: 240, height: 200 },
      { width: 1200, height: 260 },
    )
    expect(placed.side).toBe('left')
    expect(placed.shift).toBe(12)
  })

  it('gives up on shifting when the bubble is wider than the whole viewport', () => {
    const placed = placeBubble(
      { x: 100, y: 400, width: 40, height: 40 },
      { width: 4000, height: 100 },
      VIEW,
    )
    expect(placed.shift).toBe(0)
  })

  it('keeps the gap it advertises', () => {
    expect(BUBBLE_GAP).toBeGreaterThan(0)
  })
})

describe('placeBubble arrow', () => {
  it('sits at the bubble centre when the bubble needed no shift', () => {
    const placed = placeBubble({ x: 500, y: 400, width: 60, height: 60 }, BUBBLE, VIEW)
    expect(placed.arrow).toBe(BUBBLE.width / 2)
  })

  it('slides back by exactly the shift so it still points at the orb', () => {
    // 中等位移、还没撞端点：箭头落回视口坐标必须正好是球心
    const anchor = { x: 1050, y: 400, width: 60, height: 60 }
    const placed = placeBubble(anchor, BUBBLE, VIEW)
    expect(placed.shift).toBeLessThan(0)
    const bubbleLeft = anchor.x + anchor.width / 2 - BUBBLE.width / 2 + placed.shift
    expect(bubbleLeft + placed.arrow).toBe(anchor.x + anchor.width / 2)
  })

  it('stops short of the rounded corner instead of sliding off the bubble', () => {
    // 球几乎贴右边缘：要追回的气泡位移比箭头可活动范围还大，只能停在端点
    const placed = placeBubble({ x: 1150, y: 400, width: 50, height: 50 }, BUBBLE, VIEW)
    expect(placed.arrow).toBe(BUBBLE.width - ARROW_EDGE_MARGIN)
  })

  it('tracks the orb along the vertical cross axis too', () => {
    const anchor = { x: 400, y: 0, width: 200, height: 200 }
    const bubble = { width: 240, height: 200 }
    const placed = placeBubble(anchor, bubble, { width: 1200, height: 260 })
    expect(placed.side).toBe('left')
    expect(placed.arrow).toBe(bubble.height / 2 - placed.shift)
  })
})
