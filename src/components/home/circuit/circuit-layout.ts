import type { Breakpoint } from '@/composable/use-breakpoint'
import { categoryKeys, type CategoryKey } from '@/tools/categories'

/**
 * 电路板首屏的「图纸层」：三套断点各有一张手工排布的不规则版图，
 * 走线按真实 PCB 的习惯生成——先从焊盘垂直出线（stub），中间用 45° 斜角过渡，
 * 再垂直进对面焊盘。这里全是纯函数与纯数据，UI 只负责画。
 *
 * 坐标系是「设计像素」：版图 width×height 与容器的 aspect-ratio 一致，
 * SVG 用 preserveAspectRatio="none" 铺满，HTML 芯片用百分比定位，两者因此严格对齐。
 */

export type Point = { x: number; y: number }

/** 矩形以中心点描述：版图里的芯片与核心都是「先定中心再摊开」 */
export type Box = { x: number; y: number; w: number; h: number }

export type Side = 'top' | 'right' | 'bottom' | 'left'

export type ChipSlot = {
  category: CategoryKey
  /** 芯片中心（设计像素） */
  x: number
  y: number
  /** 走线在中间那段折在哪里的比例 0..1；错开它才有不规则感 */
  bias?: number
  /** 中段凸起绕行的幅度（设计像素，带符号）：0 或不填走直路，填了才弯弯绕绕 */
  meander?: number
  /** 手工指定出线/进线边，留空按主轴自动判 */
  exit?: Side
  entry?: Side
}

export type BoardLayout = {
  width: number
  height: number
  /** 小芯片尺寸：同一档断点内所有芯片等大，位置各自不同 */
  chip: { w: number; h: number }
  core: Box
  slots: readonly ChipSlot[]
  /** 出焊盘后的垂直引线长度 */
  stub: number
  /** 直角处倒 45° 斜角的边长 */
  chamfer: number
}

/** 分类 → 电路色序号（1 起，对应 index.css 的 --circuit-N） */
export function circuitIndexOf(category: CategoryKey): number {
  return categoryKeys.indexOf(category) + 1
}

export const SIDE_NORMAL: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

const OPPOSITE: Record<Side, Side> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

/** 三档版图：手机竖版、平板偏方、PC 宽扁。
 * 芯片远近故意拉得很开——有的贴着核心、有的钉在边角——走线再各自绕行，
 * 于是每条线的长度、拐弯数都不一样，整张板子才像手工布的线 */
export const BOARD_LAYOUTS: Record<Breakpoint, BoardLayout> = {
  mobile: {
    width: 360,
    height: 640,
    chip: { w: 80, h: 56 },
    core: { x: 180, y: 290, w: 126, h: 106 },
    stub: 11,
    chamfer: 9,
    slots: [
      { category: 'resume', x: 78, y: 70, bias: 0.62, meander: 14 },
      { category: 'images', x: 250, y: 170, bias: 0.6, meander: -12 },
      { category: 'crypto', x: 52, y: 200, bias: 0.35, meander: -16 },
      { category: 'web', x: 306, y: 258, bias: 0.55, meander: 14 },
      { category: 'development', x: 52, y: 380, bias: 0.3, meander: -16 },
      { category: 'video', x: 300, y: 440, bias: 0.6, meander: 14 },
      { category: 'text', x: 96, y: 500, bias: 0.45, meander: 12 },
      { category: 'life', x: 272, y: 556, bias: 0.75, meander: -14 },
      { category: 'cheatsheet', x: 140, y: 596, bias: 0.5, meander: -16 },
    ],
  },
  tablet: {
    width: 720,
    height: 560,
    chip: { w: 96, h: 62 },
    core: { x: 360, y: 280, w: 176, h: 144 },
    stub: 16,
    chamfer: 13,
    slots: [
      { category: 'resume', x: 96, y: 78, bias: 0.45, meander: 20 },
      { category: 'images', x: 300, y: 150, bias: 0.6, meander: -16 },
      { category: 'video', x: 556, y: 66, bias: 0.1, meander: -14 },
      { category: 'crypto', x: 646, y: 208, bias: 0.55, meander: -20 },
      { category: 'web', x: 620, y: 420, bias: 0.4, meander: 18 },
      { category: 'development', x: 470, y: 500, bias: 0.65, meander: -24 },
      { category: 'text', x: 250, y: 512, bias: 0.4, meander: 18 },
      { category: 'life', x: 96, y: 430, bias: 0.6, meander: -18 },
      { category: 'cheatsheet', x: 64, y: 250, bias: 0.35, meander: 22 },
    ],
  },
  desktop: {
    width: 1000,
    height: 620,
    chip: { w: 104, h: 68 },
    core: { x: 500, y: 310, w: 208, h: 168 },
    stub: 20,
    chamfer: 16,
    slots: [
      { category: 'resume', x: 120, y: 90, bias: 0.5, meander: -26 },
      { category: 'images', x: 350, y: 140, bias: 0.45, meander: -20 },
      { category: 'video', x: 700, y: 72, bias: 0.4, meander: 30 },
      { category: 'crypto', x: 890, y: 190, bias: 0.6, meander: -26 },
      { category: 'web', x: 860, y: 430, bias: 0.45, meander: 22 },
      { category: 'development', x: 620, y: 480, bias: 0.55, meander: -30 },
      { category: 'text', x: 420, y: 566, bias: 0.5, meander: 24 },
      { category: 'life', x: 170, y: 500, bias: 0.4, meander: -22 },
      { category: 'cheatsheet', x: 64, y: 200, bias: 0.45, meander: 28 },
    ],
  },
}

export function layoutOf(breakpoint: Breakpoint): BoardLayout {
  return BOARD_LAYOUTS[breakpoint]
}

export function chipBoxOf(layout: BoardLayout, slot: ChipSlot): Box {
  return { x: slot.x, y: slot.y, w: layout.chip.w, h: layout.chip.h }
}

/** 设计像素 → 版图对应轴的百分比：HTML 芯片据此定位，和 SVG 的 viewBox 严格对齐 */
export function pctOf(value: number, total: number): number {
  return (value / total) * 100
}

/**
 * 设计像素 → 容器查询单位。版图自己是 `container-type: inline-size`，
 * 1cqw 就是版图渲染宽度的 1%，于是字号、图标、圆角全跟着板子等比缩放，
 * 不需要 JS 测量再回写 —— 320px 的手机和 1440px 的桌面看到的是同一张板子的两种尺寸。
 */
export function cqwOf(layout: BoardLayout, px: number): string {
  return `${(px / layout.width) * 100}cqw`
}

export function boxEdge(box: Box, side: Side, t = 0.5): Point {
  const halfW = box.w / 2
  const halfH = box.h / 2
  switch (side) {
    case 'top':
      return { x: box.x - halfW + t * box.w, y: box.y - halfH }
    case 'bottom':
      return { x: box.x - halfW + t * box.w, y: box.y + halfH }
    case 'left':
      return { x: box.x - halfW, y: box.y - halfH + t * box.h }
    case 'right':
      return { x: box.x + halfW, y: box.y - halfH + t * box.h }
  }
}

/** 主轴决定出哪条边：横向差更大就走左右，否则走上下，进出两边始终面对面 */
export function sidesFor(core: Box, chip: Box): { exit: Side; entry: Side } {
  const dx = chip.x - core.x
  const dy = chip.y - core.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const exit: Side = dx >= 0 ? 'right' : 'left'
    return { exit, entry: OPPOSITE[exit] }
  }
  const exit: Side = dy >= 0 ? 'bottom' : 'top'
  return { exit, entry: OPPOSITE[exit] }
}

export type TraceRoute = {
  category: CategoryKey
  exit: Side
  entry: Side
  /** 核心侧焊盘 */
  from: Point
  /** 芯片侧焊盘 */
  to: Point
  bias: number
  /** 中段绕行幅度（设计像素，带符号）；0 为直路 */
  meander: number
}

function isHorizontal(side: Side): boolean {
  return side === 'left' || side === 'right'
}

/** 同一条出边上的多条走线按沿边顺序均分锚点，否则全挤在边中点重叠成一坨 */
export function assignRoutes(layout: BoardLayout): TraceRoute[] {
  const resolved = layout.slots.map((slot) => {
    const chip = chipBoxOf(layout, slot)
    const auto = sidesFor(layout.core, chip)
    return {
      slot,
      chip,
      exit: slot.exit ?? auto.exit,
      entry: slot.entry ?? auto.entry,
      bias: slot.bias ?? 0.5,
    }
  })

  const byExit = new Map<Side, typeof resolved>()
  for (const item of resolved) {
    const bucket = byExit.get(item.exit)
    if (bucket === undefined) {
      byExit.set(item.exit, [item])
    } else {
      bucket.push(item)
    }
  }

  const anchorT = new Map<ChipSlot, number>()
  for (const [side, group] of byExit) {
    const along = isHorizontal(side)
      ? [...group].sort((a, b) => a.chip.x - b.chip.x)
      : [...group].sort((a, b) => a.chip.y - b.chip.y)
    along.forEach((item, index) => {
      anchorT.set(item.slot, (index + 1) / (along.length + 1))
    })
  }

  return resolved.map((item) => ({
    category: item.slot.category,
    exit: item.exit,
    entry: item.entry,
    bias: item.bias,
    meander: item.slot.meander ?? 0,
    from: boxEdge(layout.core, item.exit, anchorT.get(item.slot) ?? 0.5),
    to: boxEdge(item.chip, item.entry),
  }))
}

function add(p: Point, v: Point, scale: number): Point {
  return { x: p.x + v.x * scale, y: p.y + v.y * scale }
}

/** 未倒角的直角折线：出线 → 中间 Z 形（或 L 形）→ 进线 */
function rawWaypoints(route: TraceRoute, stub: number): Point[] {
  const exitNormal = SIDE_NORMAL[route.exit]
  const entryNormal = SIDE_NORMAL[route.entry]
  const a = add(route.from, exitNormal, stub)
  const b = add(route.to, entryNormal, stub)
  const exitHorizontal = isHorizontal(route.exit)
  const entryHorizontal = isHorizontal(route.entry)

  const middle: Point[] =
    exitHorizontal === entryHorizontal
      ? exitHorizontal
        ? // 横进横出：中间两段拐一个 Z
          [
            { x: a.x + (b.x - a.x) * route.bias, y: a.y },
            { x: a.x + (b.x - a.x) * route.bias, y: b.y },
          ]
        : [
            { x: a.x, y: a.y + (b.y - a.y) * route.bias },
            { x: b.x, y: a.y + (b.y - a.y) * route.bias },
          ]
      : exitHorizontal
        ? [{ x: b.x, y: a.y }]
        : [{ x: a.x, y: b.y }]

  return [route.from, a, ...middle, b, route.to]
}

function unit(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length }
}

/**
 * 中段凸起绕行：在最长的那段中间线上顶出一个矩形包，走线立刻弯弯绕绕。
 * 凸出方向垂直于该段（水平段就竖着凸），所以新增线段仍然只有水平/垂直，
 * PCB 的直角习惯不破；幅度由 slot.meander 手排，符号决定凸向哪一侧。
 */
export function meander(points: readonly Point[], amp: number): Point[] {
  if (amp === 0 || points.length < 4) {
    return [...points]
  }
  let best = 1
  let bestLen = -1
  for (let i = 1; i < points.length - 2; i += 1) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  }
  if (bestLen < 60) {
    return [...points]
  }
  const p = points[best]
  const q = points[best + 1]
  const dir = unit(p, q)
  const normal = { x: -dir.y, y: dir.x }
  const p1 = add(p, dir, bestLen * 0.3)
  const p2 = add(p, dir, bestLen * 0.7)
  const o1 = add(p1, normal, amp)
  const o2 = add(p2, normal, amp)
  return [...points.slice(0, best + 1), p1, o1, o2, p2, ...points.slice(best + 1)]
}

/**
 * 折线 → 圆角路径：每个内拐角砍掉 radius 长、用二次贝塞尔抹成圆弧弯，
 * 就是参考图里那种"弯曲的走线"；半径自动夹到邻边的一半，短拐不会自交。
 * points 仍保留直角折线供碰撞检测，圆角只体现在画出来的 path 上。
 */
export function toRoundedPath(points: readonly Point[], radius: number): string {
  if (points.length < 3) {
    return toPath(points)
  }
  const parts = [`M${round(points[0].x)} ${round(points[0].y)}`]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const back = unit(corner, previous)
    const forward = unit(corner, next)
    const r = Math.min(
      radius,
      Math.hypot(previous.x - corner.x, previous.y - corner.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    )
    const enter = add(corner, back, r)
    const exit = add(corner, forward, r)
    parts.push(
      `L${round(enter.x)} ${round(enter.y)}`,
      `Q${round(corner.x)} ${round(corner.y)} ${round(exit.x)} ${round(exit.y)}`,
    )
  }
  const last = points[points.length - 1]
  parts.push(`L${round(last.x)} ${round(last.y)}`)
  return parts.join(' ')
}

export type TraceFlow = { duration: number; delay: number }

export type Trace = TraceRoute & {
  /** 绕行后的完整直角折线（含两端焊点），供碰撞检测用 */
  points: Point[]
  path: string
  flow: TraceFlow
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function toPath(points: readonly Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ')
}

/**
 * 流星光的节奏：周期与相位都由序号推出来，纯函数所以每帧渲染都稳定不闪。
 * 窗口 traversing 只占周期的 1/1.45：duration 2.0~3.4s 对应光头实际冲刺
 * 1.4~2.3s——"快速冲到分类，没了，停一拍"，慢了就不像脉冲像爬虫。
 * 方向固定核心→分类：光头抵达在周期 69% 处，分类卡片的充电背光
 * 用同一组 duration/delay 就能和抵达瞬间严格同相。
 */
export function flowFor(index: number): TraceFlow {
  return {
    duration: 2.0 + (index % 5) * 0.35,
    delay: -((index * 0.61) % 3),
  }
}

export function buildTraces(layout: BoardLayout): Trace[] {
  return assignRoutes(layout).map((route, index) => {
    // 出线引线长度逐条错开（0.75~1.25 倍），线长差异再拉大一点
    const stub = layout.stub * (0.75 + (((index * 37) % 10) / 10) * 0.5)
    const points = meander(rawWaypoints(route, stub), route.meander ?? 0)
    return { ...route, points, path: toRoundedPath(points, layout.chamfer), flow: flowFor(index) }
  })
}
