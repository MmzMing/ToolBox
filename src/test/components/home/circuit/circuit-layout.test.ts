import { describe, expect, it } from 'vitest'

import {
  assignRoutes,
  BOARD_LAYOUTS,
  boxEdge,
  buildTraces,
  chipBoxOf,
  circuitIndexOf,
  curvePath,
  FLOW_CYCLE,
  FLOW_TRAVEL,
  flowFor,
  introOf,
  routeCurve,
  sampleCurve,
  SIDE_NORMAL,
  sidesFor,
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
  // 一般线段与矩形求交：先看端点，再看是否跨过四条边（采样后的曲线段都很短，逐段扫足够准）
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

/**
 * 曲线端点的切线必须与该边法线平行，否则它是斜着插进芯片边的，
 * 看着就不像"接在上面"。平行等价于两向量叉积为 0。
 */
function tangentParallelTo(a: Point, b: Point, normal: Point): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) {
    return true
  }
  return Math.abs((dx / len) * normal.y - (dy / len) * normal.x) < 1e-9
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

  it.each(LAYOUTS)('%s mirrors the chips about the core vertical axis', (_name, layout) => {
    const left = layout.slots.filter((slot) => slot.x < layout.core.x)
    const right = layout.slots.filter((slot) => slot.x > layout.core.x)
    expect(left).toHaveLength(right.length)
    for (const slot of right) {
      // 只按 x 配对会有歧义（45° 与 135° 两颗离轴同样远），必须 x、y 同时对上
      const mirrors = left.filter(
        (other) =>
          Math.abs(2 * layout.core.x - other.x - slot.x) < 1 && Math.abs(other.y - slot.y) < 1,
      )
      expect(mirrors, `${slot.category} has no mirror twin`).toHaveLength(1)
    }
  })

  it.each(LAYOUTS)('%s sits exactly one chip on the bottom tip of the heart', (_name, layout) => {
    const onAxis = layout.slots.filter((slot) => Math.abs(slot.x - layout.core.x) < 1)
    expect(onAxis).toHaveLength(1)
    expect(onAxis[0].y).toBeGreaterThan(layout.core.y)
  })

  it.each(LAYOUTS)('%s bulges at the lobes and converges to the tip', (_name, layout) => {
    const offsets = layout.slots.map((slot) => Math.abs(slot.x - layout.core.x))
    const widest = Math.max(...offsets)
    const narrowest = Math.min(...offsets.filter((value) => value > 1))
    // 两瓣最宽处必须明显宽于贴近中轴的那几颗，否则读不出心形
    expect(widest).toBeGreaterThan(narrowest * 2)
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
  it.each(LAYOUTS)('%s draws every trace as one smooth cubic', (_name, layout) => {
    for (const trace of buildTraces(layout)) {
      expect(trace.path.match(/[A-Za-z]/g)).toEqual(['M', 'C'])
      expect(trace.path.match(/-?\d+(?:\.\d+)?/g)).toHaveLength(8)
    }
  })

  it.each(LAYOUTS)('%s leaves and enters each box perpendicular to its edge', (_name, layout) => {
    for (const trace of buildTraces(layout)) {
      const curve = routeCurve(trace, layout.stub)
      expect(
        tangentParallelTo(curve.from, curve.c1, SIDE_NORMAL[trace.exit]),
        `${trace.category} leaves at an angle`,
      ).toBe(true)
      expect(
        tangentParallelTo(curve.c2, curve.to, SIDE_NORMAL[trace.entry]),
        `${trace.category} enters at an angle`,
      ).toBe(true)
    }
  })

  it.each(LAYOUTS)(
    '%s orders anchors along the edge so traces never swap sides',
    (_name, layout) => {
      // 同一条边上的锚点次序必须与芯片在该边延伸方向上的次序一致，否则两根曲线打叉
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const horizontal = side === 'left' || side === 'right'
        const group = buildTraces(layout)
          .filter((trace) => trace.exit === side)
          .map((trace) => ({
            along: horizontal ? trace.to.y : trace.to.x,
            anchor: horizontal ? trace.from.y : trace.from.x,
          }))
        const byChip = [...group].sort((a, b) => a.along - b.along)
        const byAnchor = [...group].sort((a, b) => a.anchor - b.anchor)
        expect(byAnchor.map((item) => item.along)).toEqual(byChip.map((item) => item.along))
      }
    },
  )

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

  it('emits one M and one C with two-decimal coordinates', () => {
    const path = curvePath({
      from: { x: 0, y: 0 },
      c1: { x: 10.256, y: 4 },
      c2: { x: 20, y: 4 },
      to: { x: 30, y: 0 },
    })
    expect(path).toBe('M0 0 C10.26 4 20 4 30 0')
  })
})

describe('circuit-layout: curve geometry', () => {
  it('pulls both control points along their edge normals', () => {
    const curve = routeCurve(
      {
        category: 'web',
        exit: 'right',
        entry: 'left',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 20 },
      },
      10,
    )
    expect(curve.c1.x).toBeCloseTo(55, 6)
    expect(curve.c1.y).toBe(0)
    expect(curve.c2.x).toBeCloseTo(45, 6)
    expect(curve.c2.y).toBe(20)
  })

  it('keeps a minimum control arm so near-touching chips still get a round elbow', () => {
    const curve = routeCurve(
      {
        category: 'web',
        exit: 'right',
        entry: 'left',
        from: { x: 0, y: 0 },
        to: { x: 6, y: 2 },
      },
      10,
    )
    expect(curve.c1.x).toBe(10)
  })

  it('sizes the arm by the gap along the normal, not by the straight-line distance', () => {
    // 芯片几乎在正上方但偏了一大截：法线是竖直的，力臂只能按竖直间距算，
    // 按直线距离算会把控制点甩到芯片背后，曲线先冲过头再拐回来就是一个结
    const curve = routeCurve(
      {
        category: 'web',
        exit: 'top',
        entry: 'bottom',
        from: { x: 0, y: 0 },
        to: { x: 400, y: -20 },
      },
      10,
    )
    expect(curve.c1.x).toBe(0)
    expect(curve.c1.y).toBeCloseTo(-11, 6)
    expect(curve.c2.x).toBe(400)
    expect(curve.c2.y).toBeCloseTo(-9, 6)
  })

  it('samples the cubic from end to end along the curve', () => {
    const curve = {
      from: { x: 0, y: 0 },
      c1: { x: 0, y: 99 },
      c2: { x: 99, y: 99 },
      to: { x: 99, y: 0 },
    }
    const points = sampleCurve(curve, 4)
    expect(points).toHaveLength(5)
    expect(points[0]).toEqual(curve.from)
    expect(points[4]).toEqual(curve.to)
    expect(points[2]).toEqual({ x: 49.5, y: 74.25 })
  })
})

describe('circuit-layout: decoration and flow', () => {
  it('locks all nine traces to one cycle so the waves cannot drift apart', () => {
    const flows = Array.from({ length: 9 }, (_, index) => flowFor(index))
    expect(new Set(flows.map((flow) => flow.duration)).size).toBe(1)
    // 冲刺短于周期才有空窗：一波扫过之后全板静一拍
    expect(FLOW_TRAVEL).toBeLessThan(FLOW_CYCLE)
  })

  it('sweeps three waves and leaves a silent tail in every cycle', () => {
    const flows = Array.from({ length: 9 }, (_, index) => flowFor(index))
    const step = (index: number) => flows[index + 1].delay - flows[index].delay
    // 波内逐颗的递进比换波小，序号才读得出"三颗一波"
    expect(step(0)).toBeLessThan(step(2))
    // 波与波不重叠：上一波最后一颗抵达之前，下一波不许出发，否则九条线叠成一片常亮
    expect(flowFor(2).delay + FLOW_TRAVEL).toBeLessThanOrEqual(flowFor(3).delay)
    expect(flowFor(5).delay + FLOW_TRAVEL).toBeLessThanOrEqual(flowFor(6).delay)
    for (let index = 1; index < flows.length; index += 1) {
      expect(flows[index].delay).toBeGreaterThan(flows[index - 1].delay)
    }
    for (const flow of flows) {
      // delay 取负：挂载时动画已跑到起跑线之前，第一帧不会把光头停在线头
      expect(flow.delay).toBeLessThanOrEqual(0)
      expect(flow.delay).toBeGreaterThanOrEqual(-flow.duration)
    }
    const last = flows[flows.length - 1]
    // 换算回周期内的时刻：起跑点 + 冲刺时长，必须仍留有全板静默的一段
    const fire = last.delay + last.duration
    const arrival = fire + FLOW_TRAVEL
    expect(arrival).toBeLessThan(FLOW_CYCLE)
    expect(FLOW_CYCLE - arrival).toBeGreaterThan(0.5)
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
