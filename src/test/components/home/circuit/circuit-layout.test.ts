import { describe, expect, it } from 'vitest'

import {
  assignRoutes,
  BOARD_LAYOUTS,
  boxEdge,
  buildTraces,
  chipBoxOf,
  circuitIndexOf,
  flowFor,
  introOf,
  meander,
  sidesFor,
  toPath,
  toRoundedPath,
  type BoardLayout,
  type ChipSlot,
  type Point,
} from '@/components/home/circuit/circuit-layout'
import { categoryKeys } from '@/tools/categories'

const LAYOUTS = Object.entries(BOARD_LAYOUTS) as [string, BoardLayout][]

/** 走线离芯片边框至少留出 CLEARANCE，否则线看着像从芯片底下钻出来 */
const CLEARANCE = 4

/** 线段与轴对齐矩形是否相交（含擦边）：走线一旦穿进芯片底下，画出来就是"线从芯片里长出来" */
function segmentHitsBox(a: Point, b: Point, box: Point, halfW: number, halfH: number): boolean {
  const left = box.x - halfW + CLEARANCE
  const right = box.x + halfW - CLEARANCE
  const top = box.y - halfH + CLEARANCE
  const bottom = box.y + halfH - CLEARANCE
  const inside = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom
  if (inside(a) || inside(b)) {
    return true
  }
  // 轴对齐线段（倒角后的走线只有水平、垂直与 45°，逐段扫边界即可覆盖）
  const hitsVerticalEdge = (edgeX: number) => {
    const span = [a.x, b.x]
    const crossY = a.y + ((edgeX - a.x) * (b.y - a.y)) / (b.x - a.x || 1e-9)
    return (
      Math.min(...span) <= edgeX &&
      Math.max(...span) >= edgeX &&
      crossY >= Math.min(top, bottom) &&
      crossY <= Math.max(top, bottom)
    )
  }
  const hitsHorizontalEdge = (edgeY: number) => {
    const span = [a.y, b.y]
    const crossX = a.x + ((edgeY - a.y) * (b.x - a.x)) / (b.y - a.y || 1e-9)
    return (
      Math.min(...span) <= edgeY &&
      Math.max(...span) >= edgeY &&
      crossX >= Math.min(left, right) &&
      crossX <= Math.max(left, right)
    )
  }
  return (
    hitsVerticalEdge(left) ||
    hitsVerticalEdge(right) ||
    hitsHorizontalEdge(top) ||
    hitsHorizontalEdge(bottom)
  )
}

/** 相邻两点构成的线段只能是水平、垂直或 45° 斜线，这是 PCB 走线的硬约束 */
function segmentKinds(a: Point, b: Point): 'h' | 'v' | 'd' {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dy < 1e-6) {
    return 'h'
  }
  if (dx < 1e-6) {
    return 'v'
  }
  expect(Math.abs(dx - dy)).toBeLessThan(1e-6)
  return 'd'
}

describe('circuit-layout: board layouts', () => {
  it.each(LAYOUTS)('%s keeps every chip inside the board', (_name, layout) => {
    for (const slot of layout.slots) {
      const box = chipBoxOf(layout, slot)
      expect(box.x - box.w / 2).toBeGreaterThanOrEqual(0)
      expect(box.y - box.h / 2).toBeGreaterThanOrEqual(0)
      expect(box.x + box.w / 2).toBeLessThanOrEqual(layout.width)
      expect(box.y + box.h / 2).toBeLessThanOrEqual(layout.height)
    }
  })

  it.each(LAYOUTS)('%s keeps the core inside the board', (_name, layout) => {
    expect(layout.core.x - layout.core.w / 2).toBeGreaterThan(0)
    expect(layout.core.y - layout.core.h / 2).toBeGreaterThan(0)
    expect(layout.core.x + layout.core.w / 2).toBeLessThan(layout.width)
    expect(layout.core.y + layout.core.h / 2).toBeLessThan(layout.height)
  })

  it.each(LAYOUTS)('%s never overlaps chips with each other or with the core', (_name, layout) => {
    const boxes = [
      ...layout.slots.map((slot) => chipBoxOf(layout, slot)),
      { ...layout.core, name: 'core' },
    ]
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        const overlapX =
          Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)
        const overlapY =
          Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2)
        expect(overlapX > 0 && overlapY > 0, `${i} overlaps ${j}`).toBe(false)
      }
    }
  })

  it.each(LAYOUTS)('%s covers all nine categories exactly once', (_name, layout) => {
    expect(layout.slots.map((slot) => slot.category).sort()).toEqual([...categoryKeys].sort())
  })

  it('gives the three breakpoints genuinely different boards', () => {
    const { mobile, tablet, desktop } = BOARD_LAYOUTS
    expect(mobile.height).toBeGreaterThan(mobile.width)
    expect(desktop.width / desktop.height).toBeGreaterThan(1.4)
    expect(tablet.width).not.toBe(desktop.width)
    expect(mobile.chip.w).toBeLessThan(tablet.chip.w)
    expect(tablet.chip.w).toBeLessThan(desktop.chip.w)
  })
})

describe('circuit-layout: side picking', () => {
  const core = { x: 0, y: 0, w: 100, h: 100 }

  it('faces each other on the dominant axis', () => {
    expect(sidesFor(core, { x: 300, y: 40, w: 10, h: 10 })).toEqual({
      exit: 'right',
      entry: 'left',
    })
    expect(sidesFor(core, { x: -300, y: -40, w: 10, h: 10 })).toEqual({
      exit: 'left',
      entry: 'right',
    })
    expect(sidesFor(core, { x: 20, y: 300, w: 10, h: 10 })).toEqual({
      exit: 'bottom',
      entry: 'top',
    })
    expect(sidesFor(core, { x: -20, y: -300, w: 10, h: 10 })).toEqual({
      exit: 'top',
      entry: 'bottom',
    })
  })

  it('prefers the horizontal pair when both axes tie', () => {
    expect(sidesFor(core, { x: 200, y: 200, w: 10, h: 10 }).exit).toBe('right')
  })

  it('puts the anchor on the middle of the chosen edge by default', () => {
    expect(boxEdge(core, 'right')).toEqual({ x: 50, y: 0 })
    expect(boxEdge(core, 'top', 0.25)).toEqual({ x: -25, y: -50 })
    expect(boxEdge(core, 'left', 0.75)).toEqual({ x: -50, y: 25 })
  })
})

describe('circuit-layout: anchor spreading', () => {
  it('gives traces sharing one core edge distinct anchors', () => {
    const layout = BOARD_LAYOUTS.desktop
    const routes = assignRoutes(layout)
    const rights = routes.filter((route) => route.exit === 'right')
    expect(rights.length).toBeGreaterThan(1)
    const ys = new Set(rights.map((route) => route.from.y))
    expect(ys.size).toBe(rights.length)
  })

  it('keeps every anchor on the core outline', () => {
    for (const [, layout] of LAYOUTS) {
      const halfW = layout.core.w / 2
      const halfH = layout.core.h / 2
      for (const route of assignRoutes(layout)) {
        const onVerticalEdge = Math.abs(Math.abs(route.from.x - layout.core.x) - halfW) < 1e-6
        const onHorizontalEdge = Math.abs(Math.abs(route.from.y - layout.core.y) - halfH) < 1e-6
        expect(onVerticalEdge || onHorizontalEdge).toBe(true)
      }
    }
  })
})

describe('circuit-layout: trace routing', () => {
  it.each(LAYOUTS)('%s routes only in horizontal, vertical and 45° segments', (_name, layout) => {
    for (const trace of buildTraces(layout)) {
      for (let i = 1; i < trace.points.length; i += 1) {
        segmentKinds(trace.points[i - 1], trace.points[i])
      }
    }
  })

  it.each(LAYOUTS)('%s starts at the core pad and ends at the chip pad', (_name, layout) => {
    for (const trace of buildTraces(layout)) {
      expect(trace.points[0]).toEqual(trace.from)
      expect(trace.points[trace.points.length - 1]).toEqual(trace.to)
    }
  })

  it.each(LAYOUTS)('%s never runs a trace through a chip', (_name, layout) => {
    const boxes = [
      ...layout.slots.map((slot) => chipBoxOf(layout, slot)),
      { ...layout.core, name: 'core' },
    ]
    for (const trace of buildTraces(layout)) {
      for (let i = 1; i < trace.points.length; i += 1) {
        const a = trace.points[i - 1]
        const b = trace.points[i]
        for (const box of boxes) {
          expect(
            segmentHitsBox(a, b, box, box.w / 2, box.h / 2),
            `${trace.category} segment ${i} crosses a box`,
          ).toBe(false)
        }
      }
    }
  })

  it('emits a path string starting with M and continuing with L', () => {
    const path = toPath([
      { x: 0, y: 0 },
      { x: 10.256, y: 4 },
    ])
    expect(path).toBe('M0 0 L10.26 4')
  })
})

describe('circuit-layout: rounded paths and meander', () => {
  it('rounds interior corners with quadratic curves', () => {
    expect(
      toRoundedPath(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        20,
      ),
    ).toBe('M0 0 L80 0 Q100 0 100 20 L100 100')
  })

  it('clamps the fillet to the shorter leg so tiny jogs stay sane', () => {
    const path = toRoundedPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 6 },
      ],
      20,
    )
    expect(path).toContain('Q100 0 100 3')
  })

  it('inserts a rectangular bump on the longest middle segment', () => {
    const out = meander(
      [
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 200, y: 20 },
        { x: 200, y: 100 },
      ],
      30,
    )
    // 原 4 点 + 凸起 4 点；凸出段垂直于被切的那段水平线
    expect(out).toHaveLength(8)
    expect(out[2]).toEqual({ x: 60, y: 20 })
    expect(out[3]).toEqual({ x: 60, y: 50 })
    expect(out[4]).toEqual({ x: 140, y: 50 })
    expect(out[5]).toEqual({ x: 140, y: 20 })
  })

  it('leaves short or amp-less polylines untouched', () => {
    const straight = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 40 },
    ]
    expect(meander(straight, 20)).toEqual(straight)
    expect(meander(straight, 0)).toEqual(straight)
  })
})

describe('circuit-layout: decoration and flow', () => {
  it('derives a stable, desynchronised flow per trace index', () => {
    expect(flowFor(0)).toMatchObject({ duration: 2.0 })
    expect(flowFor(2).duration).not.toBe(flowFor(3).duration)
    expect(flowFor(4).delay).not.toBe(flowFor(5).delay)
  })

  it('numbers categories from 1 in registry order', () => {
    expect(circuitIndexOf(categoryKeys[0])).toBe(1)
    expect(circuitIndexOf(categoryKeys[categoryKeys.length - 1])).toBe(categoryKeys.length)
  })
})

describe('circuit-layout: entrance timing', () => {
  /** 屏幕坐标（y 朝下）里 atan2 的 0 指向 3 点，旋 90° 让 12 点方向成为顺时针起点 */
  function bearing(layout: BoardLayout, slot: ChipSlot): number {
    const tau = Math.PI * 2
    return (Math.atan2(slot.y - layout.core.y, slot.x - layout.core.x) + Math.PI / 2 + tau) % tau
  }

  /** 按弹出延迟排出的芯片，其方位角必须正好是顺时针递增的一圈 */
  function clockwiseAngles(layout: BoardLayout): number[] {
    const intro = introOf(layout)
    return [...layout.slots]
      .sort((a, b) => intro.chip[a.category] - intro.chip[b.category])
      .map((slot) => bearing(layout, slot))
  }

  it.each(LAYOUTS)("%s pops the chips clockwise from 12 o'clock", (_name, layout) => {
    const angles = clockwiseAngles(layout)
    expect(angles[0]).toBeLessThan(Math.PI / 2)
    expect(angles).toEqual([...angles].sort((a, b) => a - b))
  })

  it.each(LAYOUTS)('%s draws each trace after its own chip has popped', (_name, layout) => {
    const intro = introOf(layout)
    for (const slot of layout.slots) {
      expect(intro.trace[slot.category]).toBeGreaterThan(intro.chip[slot.category])
    }
  })

  it.each(LAYOUTS)('%s lights the comets only once every trace is drawn', (_name, layout) => {
    const intro = introOf(layout)
    const chips = categoryKeys.map((key) => intro.chip[key])
    const lastTrace = Math.max(...categoryKeys.map((key) => intro.trace[key]))
    expect(intro.core).toBeLessThan(Math.min(...chips))
    expect(intro.flow).toBeGreaterThan(lastTrace)
  })

  it('gives every category its own pair of delays', () => {
    const intro = introOf(BOARD_LAYOUTS.desktop)
    expect(Object.keys(intro.chip).sort()).toEqual([...categoryKeys].sort())
    expect(new Set(categoryKeys.map((key) => intro.chip[key])).size).toBe(categoryKeys.length)
    for (const key of categoryKeys) {
      expect(intro.chip[key]).toBeGreaterThan(0)
      expect(intro.trace[key]).toBeGreaterThan(0)
    }
  })
})
