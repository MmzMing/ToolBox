import type { Breakpoint } from '@/composable/use-breakpoint'
import { resolveShellLayout } from '@/layouts/app-shell/dock-logic'

/** 介绍目标的稳定标识，写进元素的 data-tour 属性 */
export type TourKey = 'dock' | 'search' | 'topNav' | 'circuit'

export type TourTarget = {
  key: TourKey
  /**
   * 目标可能比视口高（电路板就是），介绍前先把滚动容器校正到「整块都在屏幕里」。
   * dock 与顶栏是常驻悬浮层，滚不滚都在原位，不需要。
   */
  needsScroll: boolean
  /** 只有渲染顶栏胶囊的档位才介绍它——取值来自布局表，不另写一份断点判断 */
  requiresTopCapsules?: boolean
}

/** 介绍顺序就是数组顺序：从常驻导航讲到内容区，视线由外向内 */
const TARGETS: readonly TourTarget[] = [
  { key: 'dock', needsScroll: false },
  { key: 'search', needsScroll: true },
  { key: 'topNav', needsScroll: false, requiresTopCapsules: true },
  { key: 'circuit', needsScroll: true },
]

/**
 * 某个档位该介绍哪几处。
 *
 * 手机不渲染顶栏胶囊（见 dock-logic 的 LAYOUTS），所以这里跟着表自动少一项，
 * 而不是再抄一遍「mobile 去掉 topNav」——两处各写一份迟早会对不上。
 */
export function tourTargetsFor(breakpoint: Breakpoint): TourTarget[] {
  const { topCapsules } = resolveShellLayout(breakpoint)
  return TARGETS.filter((target) => !target.requiresTopCapsules || topCapsules)
}

/** 元素选择器，全站只有这一处拼法 */
export function tourSelector(key: TourKey): string {
  return `[data-tour="${key}"]`
}

export type Rect = { x: number; y: number; width: number; height: number }

/** 高亮框四周留的呼吸量（px）：贴着边画虚线会显得抠得太紧 */
export const HOLE_PAD = 10

export function holeOf(rect: Rect, pad = HOLE_PAD): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

/**
 * 把高亮框夹进视口：目标比屏幕还高时（小屏上的电路板）宁可让虚线框贴住上下边缘，
 * 也不要画到屏幕外去——框不住总比框错好。
 */
export function clampHole(hole: Rect, viewport: { width: number; height: number }): Rect {
  const width = Math.min(hole.width, viewport.width)
  const height = Math.min(hole.height, viewport.height)
  return {
    x: Math.min(Math.max(hole.x, 0), viewport.width - width),
    y: Math.min(Math.max(hole.y, 0), viewport.height - height),
    width,
    height,
  }
}

export type SpotlightPanel = Rect

/**
 * 用「目标四周的四块面板」拼出周围模糊、中间清晰。
 *
 * 不用 clip-path / SVG mask 挖孔：backdrop-filter 配合挖孔在 Safari 上表现不一致，
 * 而四块面板各自独立地模糊自己身后的内容，拼起来视觉上是一整片。
 *
 * 恒定返回 4 块（贴边的那块尺寸为 0）而不是过滤掉零尺寸：DOM 节点数稳定，
 * 切换目标时四块都能跟着 left/top/width/height 平滑过渡，不会有一块突然消失。
 */
export function spotlightPanels(
  hole: Rect,
  viewport: { width: number; height: number },
): SpotlightPanel[] {
  const edge = (value: number) => Math.max(0, value)
  const bottom = viewport.height - hole.y - hole.height
  const right = viewport.width - hole.x - hole.width
  return [
    { x: 0, y: 0, width: viewport.width, height: edge(hole.y) },
    { x: 0, y: hole.y + hole.height, width: viewport.width, height: edge(bottom) },
    { x: 0, y: hole.y, width: edge(hole.x), height: hole.height },
    { x: hole.x + hole.width, y: hole.y, width: edge(right), height: hole.height },
  ]
}

/** 球站定后与聚光框、与屏幕边缘的间距 */
const STATION_GAP = 12

/**
 * 介绍时球该停在哪儿：默认贴在聚光框下方、右边缘与框对齐；下方放不下就翻到上方。
 *
 * 停在框外而不是框内——球是讲解员，钻进高亮区就把要讲的东西挡住了。
 */
export function orbStation(
  hole: Rect,
  size: number,
  viewport: { width: number; height: number },
): Rect {
  const below = hole.y + hole.height + STATION_GAP
  const fitsBelow = below + size <= viewport.height - STATION_GAP
  const y = fitsBelow
    ? below
    : Math.max(
        STATION_GAP,
        Math.min(hole.y - size - STATION_GAP, viewport.height - size - STATION_GAP),
      )
  const x = clampNumber(
    hole.x + hole.width - size,
    STATION_GAP,
    viewport.width - size - STATION_GAP,
  )
  return { x, y, width: size, height: size }
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }
  return Math.min(Math.max(value, min), max)
}

/**
 * 还要再滚多少 px 才能让目标整块落在视口的安全区内（正数往下、负数往上、0 表示别动）。
 *
 * 三种情况分开说清楚，因为「居中」在目标比屏幕高时是错的：
 * 那时居中会让上下两头都露在外面，不如对齐顶部保住上半截。
 * 已经在安全区内就返回 0，否则每次切目标页面都会抖一下。
 */
export function scrollDelta(rect: Rect, viewport: { height: number }, margin = 24): number {
  const top = rect.y
  const bottom = rect.y + rect.height
  const limit = viewport.height - margin

  if (rect.height + margin * 2 >= viewport.height) {
    return top > margin ? top - margin : 0
  }
  if (top < margin) {
    return top - margin
  }
  if (bottom > limit) {
    return bottom - limit
  }
  return 0
}
