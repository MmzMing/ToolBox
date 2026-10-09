import type { Breakpoint } from '@/composable/use-breakpoint'
import type { ComponentType, SVGProps } from 'react'
import type { CategoryKey } from '@/tools/categories'

/**
 * app-shell 的纯逻辑：断点降级、面板互斥、键盘焦点移动、沉浸页淡出、面包屑构造。
 *
 * 这里刻意不 import 任何值（只有 `import type`），保证在 node 测试环境下可跑，
 * 也让分类顺序、工具清单等由调用方注入，便于单测构造边界数据。
 */

export type DockIcon = ComponentType<SVGProps<SVGSVGElement>>

/**
 * 图标条上的一个键。首页是真链接，分类只开浮层、没有对应 URL，
 * 所以用 kind 判别而不是给分类键塞一个假 href。
 */
export type DockItem =
  | { kind: 'home'; label: string; icon: DockIcon; href: string }
  | { kind: 'category'; key: CategoryKey; label: string; icon: DockIcon }

/** 键位标识：首页固定为 'home'，其余就是分类 key */
export function dockItemKey(item: DockItem): string {
  return item.kind === 'home' ? 'home' : item.key
}

/** 悬浮导航的两种形态：桌面/平板的左侧图标条，手机的底部胶囊条 */
export type DockMode = 'rail' | 'bottom'

/** 一级分类浮层的落点：桌面用浮层面板，手机用底部抽屉 */
export type PanelMode = 'floating' | 'sheet'

/** 博客/关于/GitHub 三个外链入口的落点（只在渲染顶栏胶囊的两档有意义） */
export type ExternalLinkMode = 'inline' | 'menu'

export type ShellLayout = {
  dock: DockMode
  panel: PanelMode
  externalLinks: ExternalLinkMode
  /** 左上角面包屑胶囊是否渲染 */
  breadcrumb: boolean
  /** 顶部两组悬浮胶囊是否渲染（手机全部并入底部 dock） */
  topCapsules: boolean
}

const LAYOUTS: Record<Breakpoint, ShellLayout> = {
  desktop: {
    dock: 'rail',
    panel: 'floating',
    externalLinks: 'inline',
    breadcrumb: true,
    topCapsules: true,
  },
  tablet: {
    dock: 'rail',
    panel: 'floating',
    externalLinks: 'menu',
    breadcrumb: true,
    topCapsules: true,
  },
  mobile: {
    dock: 'bottom',
    panel: 'sheet',
    // 手机不渲染顶栏胶囊，这一项取值无消费者，只是为了让 ShellLayout 的字段保持完整
    externalLinks: 'inline',
    breadcrumb: false,
    topCapsules: false,
  },
}

/** 断点 → 布局形态的唯一真相；新增档位只需改 LAYOUTS 表 */
export function resolveShellLayout(breakpoint: Breakpoint): ShellLayout {
  return LAYOUTS[breakpoint]
}

/** 点同一个分类键即收起，点别的键则互斥切换 */
export function toggleCategory(current: CategoryKey | null, next: CategoryKey): CategoryKey | null {
  return current === next ? null : next
}

/** localStorage 可能被改坏：只认白名单里的分类键，其余回落 null（AGENTS.md §8） */
export function normalizeActiveCategory(
  value: unknown,
  allowed: readonly CategoryKey[],
): CategoryKey | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as CategoryKey)
    : null
}

type Routable = { path: string; category: CategoryKey }

export function routeCategoryOf(pathname: string, tools: readonly Routable[]): CategoryKey | null {
  return tools.find((tool) => tool.path === pathname)?.category ?? null
}

type ImmersiveAware = { path: string; immersive?: boolean }

export function isImmersivePath(pathname: string, tools: readonly ImmersiveAware[]): boolean {
  return tools.find((tool) => tool.path === pathname)?.immersive === true
}

/**
 * 图标条上该高亮哪一个：正在展开的分类优先，其次是当前路由命中的分类，
 * 最后才是上次手动打开的分类（刷新后只留高亮，不自动弹面板）。
 */
export function highlightedCategory(input: {
  panelCategory: CategoryKey | null
  routeCategory: CategoryKey | null
  activeCategory: CategoryKey | null
}): CategoryKey | null {
  return input.panelCategory ?? input.routeCategory ?? input.activeCategory
}

export type FocusOrientation = 'vertical' | 'horizontal'

const FOCUS_KEYS = {
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
} as const

/**
 * roving tabindex 的焦点移动：返回下一个键位下标（越界回绕），
 * 非方向键/Home/End 返回 null 表示不拦截。
 */
export function nextFocusIndex(input: {
  index: number
  total: number
  key: string
  orientation: FocusOrientation
}): number | null {
  const { index, total, key, orientation } = input
  if (total <= 0) {
    return null
  }
  if (key === 'Home') {
    return 0
  }
  if (key === 'End') {
    return total - 1
  }
  const step = (FOCUS_KEYS as Record<string, number | undefined>)[key]
  if (step === undefined) {
    return null
  }
  const forward = orientation === 'vertical' ? key === 'ArrowDown' : key === 'ArrowRight'
  const backward = orientation === 'vertical' ? key === 'ArrowUp' : key === 'ArrowLeft'
  if (!forward && !backward) {
    return null
  }
  return (index + step + total) % total
}

/**
 * dock 是否折成左下角那颗按钮。
 *
 * 只在沉浸式工具页成立（普通工具页要靠 dock 频繁切换，收起来等于把导航弄丢），
 * 并且比对折叠时所在的路由：换页后自动展开，比在 effect 里补一次 setState 少一轮渲染。
 */
export function isDockCollapsed(input: {
  collapsedAt: string | null
  pathname: string
  immersive: boolean
}): boolean {
  const { collapsedAt, pathname, immersive } = input
  return immersive && collapsedAt !== null && collapsedAt === pathname
}

/** 手机 dock 齿轮展开时，动作键沿上半圆散开的落点（相对齿轮中心，屏幕坐标 y 向下） */
export type FanSlot = { x: number; y: number }

/**
 * 从 150°（左上）扫到 30°（右上），90° 正上方居中，所以左右对称。
 * 半径要大到让最外侧那颗键的上沿仍然离开 dock 本体，否则散开时会压在条上。
 */
export function fanSlots(count: number, radius: number): FanSlot[] {
  if (count <= 0) {
    return []
  }
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1)
    const degrees = 150 + (30 - 150) * t
    const radians = (degrees * Math.PI) / 180
    return {
      x: Math.round(Math.cos(radians) * radius),
      y: -Math.round(Math.sin(radians) * radius),
    }
  })
}

/** Mac 系徽标用 ⌘，其余用 Ctrl；与实际监听的 metaKey || ctrlKey 一致 */
export function modKeyLabel(userAgent: string): string {
  return /mac|iphone|ipad/i.test(userAgent) ? '⌘' : 'Ctrl'
}

export type Crumb = {
  kind: 'home' | 'category' | 'page'
  label: string
  /** null 表示该级没有对应页面（分类没有锚点 URL），只作层级提示 */
  href: string | null
  categoryKey: CategoryKey | null
}

/**
 * 面包屑层级：首页 → 分类 → 工具。非工具路由退化成 首页 → 页面名，
 * 未知路径用 pathname 兜底而不是抛错，保证顶栏永远不会渲染出空白。
 */
export function buildBreadcrumbs(input: {
  pathname: string
  homeLabel: string
  toolTitle: string | null
  toolCategory: CategoryKey | null
  categoryLabel: string | null
  staticPageLabel: string | null
}): Crumb[] {
  const { pathname, homeLabel, toolTitle, toolCategory, categoryLabel, staticPageLabel } = input
  const crumbs: Crumb[] = [{ kind: 'home', label: homeLabel, href: '/', categoryKey: null }]

  if (toolCategory !== null && toolTitle !== null) {
    crumbs.push({
      kind: 'category',
      label: categoryLabel ?? '',
      href: null,
      categoryKey: toolCategory,
    })
    crumbs.push({ kind: 'page', label: toolTitle, href: pathname, categoryKey: toolCategory })
    return crumbs
  }

  if (pathname !== '/') {
    crumbs.push({
      kind: 'page',
      label: staticPageLabel ?? pathname,
      href: pathname,
      categoryKey: null,
    })
  }

  return crumbs
}
