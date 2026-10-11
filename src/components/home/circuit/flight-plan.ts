/**
 * 展开卡片的几何规划：从「芯片原位 + 核心位置 + 视口」推出卡片该多大、落在哪、
 * clip-path 从多少开始展开、克隆体要飞多远。
 *
 * 全是纯计算，所以可以脱离 DOM 单测——尤其是边界情况：
 * 核心被滚出屏幕、视口比卡片还小、手机横屏等，卡片都不允许跑出视口。
 */

export type Rect = { left: number; top: number; width: number; height: number }

export type Viewport = { width: number; height: number }

export type FlightPlan = {
  /** 卡片的固定定位矩形（相对视口） */
  card: Rect
  /** 核心足迹在卡片内的矩形：卡片就是从这块面积往外展开的 */
  core: { left: number; top: number; width: number; height: number }
  /** 展开起点：clip-path inset 的百分比，等于核心足迹到卡片边缘的距离 */
  insetX: number
  insetY: number
  /** 飞行克隆体的位移与缩放（等比，避免芯片里的图标被拉变形） */
  fly: { x: number; y: number; scale: number }
  cornerRadius: number
}

/** 卡片上限与视口留白 */
const CARD_MAX_WIDTH = 880
const CARD_MAX_HEIGHT = 620
const VIEWPORT_MARGIN = 16
/** 核心足迹最多占卡片的多少：留够余量，展开才有"从一个点摊开成整屏"的跨度 */
const CORE_WIDTH_RATIO = 0.5
const CORE_HEIGHT_RATIO = 0.42

function clampCenter(center: number, size: number, viewport: number, margin: number): number {
  const min = margin + size / 2
  const max = viewport - margin - size / 2
  // 视口比卡片还窄/矮时夹不出合法区间，直接居中
  return min > max ? viewport / 2 : Math.min(Math.max(center, min), max)
}

export function planFlight(origin: Rect, coreRect: Rect, viewport: Viewport): FlightPlan {
  const cardWidth = Math.min(CARD_MAX_WIDTH, Math.max(viewport.width - VIEWPORT_MARGIN * 2, 120))
  const cardHeight = Math.min(CARD_MAX_HEIGHT, Math.max(viewport.height - VIEWPORT_MARGIN * 2, 120))

  const centerX = clampCenter(
    coreRect.left + coreRect.width / 2,
    cardWidth,
    viewport.width,
    VIEWPORT_MARGIN,
  )
  const centerY = clampCenter(
    coreRect.top + coreRect.height / 2,
    cardHeight,
    viewport.height,
    VIEWPORT_MARGIN,
  )

  const card: Rect = {
    left: centerX - cardWidth / 2,
    top: centerY - cardHeight / 2,
    width: cardWidth,
    height: cardHeight,
  }

  const coreWidth = Math.min(coreRect.width, cardWidth * CORE_WIDTH_RATIO)
  const coreHeight = Math.min(coreRect.height, cardHeight * CORE_HEIGHT_RATIO)
  const core = {
    left: (cardWidth - coreWidth) / 2,
    top: (cardHeight - coreHeight) / 2,
    width: coreWidth,
    height: coreHeight,
  }

  return {
    card,
    core,
    insetX: (core.left / cardWidth) * 100,
    insetY: (core.top / cardHeight) * 100,
    fly: {
      x: centerX - (origin.left + origin.width / 2),
      y: centerY - (origin.top + origin.height / 2),
      scale: Math.min(coreWidth / origin.width, coreHeight / origin.height),
    },
    cornerRadius: Math.max(12, Math.min(26, cardWidth * 0.03)),
  }
}

/** clip-path 的三档形态：核心足迹 → 整张卡片 → 上下收到中线（水平不变）的一道缝 */
export function clipFor(state: 'core' | 'card' | 'foil', plan: FlightPlan): string {
  const round = `round ${plan.cornerRadius}px`
  if (state === 'core') {
    return `inset(${plan.insetY}% ${plan.insetX}% ${round})`
  }
  if (state === 'foil') {
    return `inset(50% 0% ${round})`
  }
  return `inset(0% 0% ${round})`
}
