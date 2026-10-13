import type { Breakpoint } from '@/composable/use-breakpoint'
import { categoryKeys, type CategoryKey } from '@/tools/categories'

/**
 * 电路板首屏的「图纸层」：三套断点各有一张**心形**版图。
 *
 * 九颗分类芯片钉在心形轮廓上，主芯片坐在心口，走线是一根根平滑的三次贝塞尔：
 * 从主芯片某条边的法线出发，到芯片朝向主芯片那条边的法线收住，两端垂直进出，
 * 中段顺着力臂自己弯过去——把参考实现里 `mx = (a.x + b.x) / 2` 那套
 * "直线进出、中段成弧"的习惯推广到四周发散的方向上。
 * 这里全是纯函数与纯数据，UI 只负责画。
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
}

export type BoardLayout = {
  width: number
  height: number
  /** 小芯片尺寸：同一档断点内所有芯片等大 */
  chip: { w: number; h: number }
  core: Box
  slots: readonly ChipSlot[]
  /** 控制点沿法线的最小力臂：芯片贴得再近，曲线也不会挤成一个尖 */
  stub: number
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

function isHorizontal(side: Side): boolean {
  return side === 'left' || side === 'right'
}

function add(p: Point, v: Point, scale: number): Point {
  return { x: p.x + v.x * scale, y: p.y + v.y * scale }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/* ---------- 心形版图 ---------- */

/**
 * 心形参数方程（数学坐标，y 轴朝上，x∈[-16,16]、y∈[-17,12]）：
 * t=0 落在两瓣之间的顶部凹口，t=π 落在下面那颗尖。
 */
function heartAt(t: number): Point {
  const s = Math.sin(t)
  return {
    x: 16 * s * s * s,
    y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  }
}

/**
 * 九颗芯片的参数角：两瓣上各四颗（45°–135° 与镜像的 225°–315°，每 30° 一颗），
 * 再加 180° 的下心尖一颗。左右严格镜像，心形读得出来。
 *
 * 不能按角度均分：心形在顶部凹口（0°/360°）和下尖（180°）两处都会急速收拢，
 * 均分会让凹口/尖两侧那一对镜像芯片横向只剩五成宽度，直接叠在一起。
 * 所以两端各留 45° 的空档，把点都放在两瓣外缘这段"宽处"。
 */
const HEART_ANGLES = [45, 75, 105, 135, 180, 225, 255, 285, 315].map((deg) => (deg * Math.PI) / 180)

type HeartSpec = {
  /** 心形中心 = 主芯片中心（设计像素） */
  cx: number
  cy: number
  /** 横纵向半径系数：分开取值才能把心竖着拉长，给窄屏腾出放芯片的宽度 */
  sx: number
  sy: number
}

/** 把心形按 spec 摊到画布上得到九个槽位；序号顺序本身就是顺时针 */
function heartSlots(spec: HeartSpec): ChipSlot[] {
  return categoryKeys.map((category, k) => {
    const p = heartAt(HEART_ANGLES[k])
    return {
      category,
      x: round(spec.cx + p.x * spec.sx),
      y: round(spec.cy - p.y * spec.sy),
    }
  })
}

/**
 * 三档版图：画布、芯片与主芯片大小、心的横纵系数各自调过。
 * 每一档都必须满足「芯片互不重叠、不压主芯片、不出画布」，
 * 这三条由 circuit-layout 的测试逐档守住；窄屏靠把心竖着拉（sy > sx）来腾地方，
 * 而不是把芯片缩到看不清。
 */
export const BOARD_LAYOUTS: Record<Breakpoint, BoardLayout> = {
  mobile: {
    width: 360,
    height: 520,
    chip: { w: 68, h: 46 },
    core: { x: 180, y: 250, w: 126, h: 100 },
    stub: 14,
    slots: heartSlots({ cx: 180, cy: 250, sx: 9.2, sy: 13.2 }),
  },
  tablet: {
    width: 720,
    height: 600,
    chip: { w: 92, h: 58 },
    core: { x: 360, y: 280, w: 160, h: 130 },
    stub: 18,
    slots: heartSlots({ cx: 360, cy: 280, sx: 17, sy: 15.5 }),
  },
  desktop: {
    width: 1000,
    height: 680,
    chip: { w: 104, h: 66 },
    core: { x: 500, y: 330, w: 200, h: 160 },
    stub: 22,
    slots: heartSlots({ cx: 500, cy: 330, sx: 24, sy: 18 }),
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
 * 1cqw 就是版图渲染宽度的 1%，于是字号、图标、圆角全跟着版图等比缩放，
 * 不需要 JS 测量再回写 —— 320px 的手机和 1440px 的桌面看到的是同一张图形的两种尺寸。
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
  /** 主芯片侧的起笔点（在边上） */
  from: Point
  /** 芯片侧的收笔点（在朝向主芯片的那条边上） */
  to: Point
}

/**
 * 同一条出边上的多条走线按沿边顺序均分锚点，否则全挤在边中点重叠成一坨。
 * 排序键必须取**该边延伸方向**上的坐标：左右两条边的锚点沿 y 分布，
 * 上下两条边沿 x 分布；取错轴会让锚点次序和芯片次序相反，两根曲线直接打叉。
 */
export function assignRoutes(layout: BoardLayout): TraceRoute[] {
  const resolved = layout.slots.map((slot) => {
    const chip = chipBoxOf(layout, slot)
    const auto = sidesFor(layout.core, chip)
    return { slot, chip, exit: auto.exit, entry: auto.entry }
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
    const key = (item: (typeof group)[number]) => (isHorizontal(side) ? item.chip.y : item.chip.x)
    const along = [...group].sort((a, b) => key(a) - key(b))
    along.forEach((item, index) => {
      anchorT.set(item.slot, (index + 1) / (along.length + 1))
    })
  }

  return resolved.map((item) => ({
    category: item.slot.category,
    exit: item.exit,
    entry: item.entry,
    from: boxEdge(layout.core, item.exit, anchorT.get(item.slot) ?? 0.5),
    to: boxEdge(item.chip, item.entry),
  }))
}

/** 一条三次贝塞尔：两端点 + 两控制点 */
export type Curve = { from: Point; c1: Point; c2: Point; to: Point }

/**
 * 控制点力臂只按**沿法线方向的间距**算，不按两点直线距离算。
 * 心形上不少芯片是"斜上方"：法线是竖直的，可竖直间距常常比水平偏移还小。
 * 用直线距离会把控制点甩到芯片背后，曲线于是先冲过头再拐回来，看着就是一个结。
 */
export function routeCurve(route: TraceRoute, stub: number): Curve {
  const along = isHorizontal(route.exit)
    ? Math.abs(route.to.x - route.from.x)
    : Math.abs(route.to.y - route.from.y)
  const pull = Math.max(stub, along * 0.55)
  return {
    from: route.from,
    c1: add(route.from, SIDE_NORMAL[route.exit], pull),
    c2: add(route.to, SIDE_NORMAL[route.entry], pull),
    to: route.to,
  }
}

export function curvePath(curve: Curve): string {
  const { from, c1, c2, to } = curve
  return `M${round(from.x)} ${round(from.y)} C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`
}

/**
 * 把贝塞尔采成折线。曲线做不了逐段几何校验，采样之后就能按线段去查
 * 「有没有从别的芯片底下穿过去」——那是走线最不该出现的画面。
 */
export function sampleCurve(curve: Curve, steps = 16): Point[] {
  const { from, c1, c2, to } = curve
  const out: Point[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    out.push({
      x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
      y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
    })
  }
  return out
}

export type TraceFlow = { duration: number; delay: number }

export type Trace = TraceRoute & {
  /** 曲线的采样折线，供碰撞检测用 */
  points: Point[]
  path: string
  flow: TraceFlow
}

/* ---------- 流星节奏：三波接力，一波扫过再静一拍 ---------- */

/**
 * 一颗脉冲的完整周期（秒），含冲刺与空窗；九条线共用同一个值，波次才不会随时间散架。
 * 取值 = 两波间隔 + 两次波内递进 + 一次冲刺 + 一段全板静默。
 */
export const FLOW_CYCLE = 6.4
/**
 * 光头实际冲刺时长（秒）。抵达时刻 = FLOW_TRAVEL / FLOW_CYCLE 周期处，
 * 芯片充电背光按这一刻对齐。
 */
export const FLOW_TRAVEL = 1.3
/** 每波同时点亮的走线数 */
const FLOW_WAVE_SIZE = 3
/** 波与波的间隔：必须盖过「上一波最后一颗的抵达时刻」，否则两波叠成一片常亮 */
const FLOW_WAVE_GAP = 1.65
/** 同一波内逐颗的递进 */
const FLOW_STAGGER = 0.16

/**
 * 三波编排：序号 0–2 / 3–5 / 6–8 各成一波，波内递进 0.16s、波间隔 1.65s。
 * 槽位序号本身就是顺时针的，于是三波依次从右上、下心尖、左上扫过整颗心。
 * 波间隔大于「冲刺 + 两次递进」，所以屏幕上任何时刻只有一波（三颗）在跑，
 * 最后一发抵达后还剩约 1.5s 全板静默——呼吸感就来自这段静默。
 * delay 取负：等价相位，但动画一挂载就已跑到自己的起跑线之前，
 * 于是第一帧不会把光头停在线头。CSS 的充电背光与 rAF 的光束用同一条
 * `progress = (t - delay) / duration` 公式，两者因此严格同相。
 */
export function flowFor(index: number): TraceFlow {
  const fire =
    Math.floor(index / FLOW_WAVE_SIZE) * FLOW_WAVE_GAP + (index % FLOW_WAVE_SIZE) * FLOW_STAGGER
  return { duration: FLOW_CYCLE, delay: fire - FLOW_CYCLE }
}

export function buildTraces(layout: BoardLayout): Trace[] {
  return assignRoutes(layout).map((route, index) => {
    const curve = routeCurve(route, layout.stub)
    return { ...route, points: sampleCurve(curve), path: curvePath(curve), flow: flowFor(index) }
  })
}

/* ---------- 入场动效时序 ---------- */

const INTRO_CHIP_START = 0.6
const INTRO_CHIP_STEP = 0.075
const INTRO_TRACE_START = 1.7
const INTRO_TRACE_STEP = 0.06
const INTRO_CORE_DELAY = 0.12
/** 走线全部画完之后，流星与提示文字才亮 */
const INTRO_FLOW_DELAY = 2.75

export type CircuitIntro = {
  /** 中央主芯片弹出的延迟 */
  core: number
  /** 流星光与提示文字淡入的延迟 */
  flow: number
  /** 各分类芯片的弹出延迟，按顺时针排 */
  chip: Record<CategoryKey, number>
  /** 各条走线从核心画向芯片的延迟，与芯片同一顺时针序 */
  trace: Record<CategoryKey, number>
}

const TAU = Math.PI * 2

/** 相对核心的方位角：0 指向 12 点方向、顺时针递增（屏幕 y 轴朝下，atan2 本身就是顺时针） */
function bearingFromCore(core: Box, slot: ChipSlot): number {
  return (Math.atan2(slot.y - core.y, slot.x - core.x) + Math.PI / 2 + TAU) % TAU
}

/**
 * 入场节奏：核心先弹 → 分类芯片自 12 点方向起顺时针逐颗弹 → 走线再从核心画向各芯片。
 * 只算延迟秒数，播放交给 CSS（animation-delay 用 --circuit-in-delay 下发），
 * 所以断点切换、重渲染都不会打断已经跑完的时间线。
 */
export function introOf(layout: BoardLayout): CircuitIntro {
  const clockwise = [...layout.slots].sort(
    (a, b) => bearingFromCore(layout.core, a) - bearingFromCore(layout.core, b),
  )
  const delays = (start: number, step: number) =>
    Object.fromEntries(
      clockwise.map((slot, index) => [slot.category, start + index * step]),
    ) as Record<CategoryKey, number>

  return {
    core: INTRO_CORE_DELAY,
    flow: INTRO_FLOW_DELAY,
    chip: delays(INTRO_CHIP_START, INTRO_CHIP_STEP),
    trace: delays(INTRO_TRACE_START, INTRO_TRACE_STEP),
  }
}
