import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useLocation } from 'react-router'

import { toggleCategory, panelSlideDirection } from '@/layouts/app-shell/dock-logic'
import { categoryKeys, type CategoryKey } from '@/tools/categories'
import { usePreferencesStore } from '@/stores/preferences.store'

type DockController = {
  /** 浮层该显示哪个分类：悬停优先，其次是被点击固定的那个 */
  visibleCategory: CategoryKey | null
  /** 被点击固定的分类；null 表示当前只是悬停预览 */
  pinnedCategory: CategoryKey | null
  /** 上一次换层的方向：1 表示新列表从下方升入，浮层内容按它决定滑入方向 */
  slideDir: 1 | -1
  /** 鼠标移到某个分类键上 */
  hover: (category: CategoryKey | null) => void
  /** 点击分类键：固定 / 取消固定 */
  togglePin: (category: CategoryKey) => void
  /** Esc：悬停与固定一起清掉 */
  dismiss: () => void
  /** 浮层根节点，用于外点判定 */
  panelRef: RefObject<HTMLDivElement | null>
  /** 图标条按键注册自身节点，供焦点归还与 roving tabindex 使用 */
  registerItem: (key: string, node: HTMLElement | null) => void
  focusItem: (key: string) => void
  /** 取某个键的矩形，浮层左侧的箭头靠它对准分类键 */
  anchorRectFor: (key: string) => DOMRect | null
}

/**
 * 浮层这一层的完整状态：悬停预览、点击固定、换层方向，外加它们产生于哪条路由。
 *
 * 四者总是一起被同一个动作改写，拆开成三个 useState 就会出现「hover 已换层、方向还是旧的」
 * 这种中间帧；pathname 也收在同一个对象里，换页后整体派生成关闭，比在 effect 里补一次
 * setState 少一轮渲染，也不会留下悬停不走的浮层。
 */
type Layer = {
  hover: CategoryKey | null
  pin: CategoryKey | null
  /** 1 表示新列表从下方升入 */
  dir: 1 | -1
  pathname: string
}

/**
 * 悬浮 dock 的浮层开合：悬停即出、点击固定、移开回落、换页收起。
 *
 * 只负责"哪一个分类在浮层里"。持久化的 activeCategory 是刷新后的高亮线索，
 * 刻意不参与开合——加载时永远不自动弹浮层。
 */
export function useDockController(options: { enabled: boolean }): DockController {
  const { enabled } = options
  const location = useLocation()
  const [layer, setLayer] = useState<Layer>(() => ({
    hover: null,
    pin: null,
    dir: 1,
    pathname: location.pathname,
  }))
  const onSameRoute = layer.pathname === location.pathname
  const hoveredCategory = onSameRoute ? layer.hover : null
  const pinnedCategory = onSameRoute ? layer.pin : null
  const visibleCategory = hoveredCategory ?? pinnedCategory

  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef(new Map<string, HTMLElement>())
  const setActiveCategory = usePreferencesStore((state) => state.setActiveCategory)

  // 浮层换层的滑动方向：由"新键在图标条上更靠下还是更靠上"决定，
  // 只有真正换层时才改，收起与重复悬停同一颗键都保持原值
  const directionOf = useCallback(
    (next: CategoryKey | null, current: 1 | -1): 1 | -1 =>
      next !== null && visibleCategory !== null && next !== visibleCategory
        ? panelSlideDirection(categoryKeys, visibleCategory, next)
        : current,
    [visibleCategory],
  )

  const registerItem = useCallback((key: string, node: HTMLElement | null) => {
    if (node === null) {
      itemRefs.current.delete(key)
    } else {
      itemRefs.current.set(key, node)
    }
  }, [])

  const focusItem = useCallback((key: string) => {
    itemRefs.current.get(key)?.focus()
  }, [])

  const anchorRectFor = useCallback((key: string) => {
    const node = itemRefs.current.get(key)
    return node ? node.getBoundingClientRect() : null
  }, [])

  const dismiss = useCallback(() => {
    const pathname = location.pathname
    setLayer((current) => ({ ...current, hover: null, pin: null, pathname }))
  }, [location.pathname])

  const hover = useCallback(
    (category: CategoryKey | null) => {
      const pathname = location.pathname
      setLayer((current) => ({
        hover: category,
        pin: current.pin,
        dir: directionOf(category, current.dir),
        pathname,
      }))
    },
    [directionOf, location.pathname],
  )

  const togglePin = useCallback(
    (category: CategoryKey) => {
      const next = toggleCategory(pinnedCategory, category)
      const pathname = location.pathname
      setLayer((current) => ({
        hover: current.hover,
        pin: next,
        dir: directionOf(next, current.dir),
        pathname,
      }))
      setActiveCategory(category)
    },
    [directionOf, location.pathname, pinnedCategory, setActiveCategory],
  )

  useEffect(() => {
    if (!enabled || pinnedCategory === null) {
      return
    }
    // 固定态才需要"点外面取消"；悬停态由容器自己的 pointerleave 收尾
    const trigger = itemRefs.current.get(pinnedCategory) ?? null
    const unpinOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || trigger?.contains(target)) {
        return
      }
      setLayer((current) => ({ ...current, pin: null, pathname: location.pathname }))
    }
    document.addEventListener('pointerdown', unpinOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', unpinOnOutsidePointer)
  }, [enabled, pinnedCategory, location.pathname])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      const focusInsidePanel = panelRef.current?.contains(document.activeElement) ?? false
      const trigger =
        visibleCategory === null ? null : (itemRefs.current.get(visibleCategory) ?? null)
      dismiss()
      // 只有键盘用户才会把焦点 tab 进浮层；这时要把焦点还回触发它的那颗分类键
      if (focusInsidePanel) {
        trigger?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [enabled, dismiss, visibleCategory])

  return {
    visibleCategory,
    pinnedCategory,
    slideDir: layer.dir,
    hover,
    togglePin,
    dismiss,
    panelRef,
    registerItem,
    focusItem,
    anchorRectFor,
  }
}
