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
 * 悬浮 dock 的浮层开合：悬停即出、点击固定、移开回落、换页收起。
 *
 * 只负责"哪一个分类在浮层里"。持久化的 activeCategory 是刷新后的高亮线索，
 * 刻意不参与开合——加载时永远不自动弹浮层。
 */
export function useDockController(options: { enabled: boolean }): DockController {
  const { enabled } = options
  const location = useLocation()
  // 两个态都记"是在哪条路由上产生的"：换页后一律派生成关闭，
  // 比在 effect 里补一次 setState 少一轮渲染，也不会留下悬停不走的浮层
  const [hovered, setHovered] = useState(() => ({
    category: null as CategoryKey | null,
    pathname: location.pathname,
  }))
  const [pinned, setPinned] = useState(() => ({
    category: null as CategoryKey | null,
    pathname: location.pathname,
  }))
  const onSameRoute = (state: { pathname: string }) => state.pathname === location.pathname
  const hoveredCategory = onSameRoute(hovered) ? hovered.category : null
  const pinnedCategory = onSameRoute(pinned) ? pinned.category : null
  const visibleCategory = hoveredCategory ?? pinnedCategory

  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef(new Map<string, HTMLElement>())
  const setActiveCategory = usePreferencesStore((state) => state.setActiveCategory)
  // 浮层换层的滑动方向：由"新键在图标条上更靠下还是更靠上"决定，
  // 只有真正换层时才更新，收起与重复悬停同一颗键都保持原值
  const [slideDir, setSlideDir] = useState<1 | -1>(1)

  const stepTo = useCallback(
    (next: CategoryKey | null) => {
      if (next !== null && visibleCategory !== null && next !== visibleCategory) {
        setSlideDir(panelSlideDirection(categoryKeys, visibleCategory, next))
      }
    },
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
    setHovered({ category: null, pathname })
    setPinned({ category: null, pathname })
  }, [location.pathname])

  const hover = useCallback(
    (category: CategoryKey | null) => {
      stepTo(category)
      setHovered({ category, pathname: location.pathname })
    },
    [location.pathname, stepTo],
  )

  const togglePin = useCallback(
    (category: CategoryKey) => {
      const next = toggleCategory(pinnedCategory, category)
      stepTo(next)
      setPinned({ category: next, pathname: location.pathname })
      setActiveCategory(category)
    },
    [pinnedCategory, location.pathname, setActiveCategory, stepTo],
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
      setPinned({ category: null, pathname: location.pathname })
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
    slideDir,
    hover,
    togglePin,
    dismiss,
    panelRef,
    registerItem,
    focusItem,
    anchorRectFor,
  }
}
