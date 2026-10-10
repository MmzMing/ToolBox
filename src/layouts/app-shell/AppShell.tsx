import { House } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'

import { BeianCaption } from '@/layouts/app-shell/BeianCaption'
import { CategoryPanel } from '@/layouts/app-shell/CategoryPanel'
import { DockHandle } from '@/layouts/app-shell/DockHandle'
import { DockRail } from '@/layouts/app-shell/DockRail'
import { MobileDock } from '@/layouts/app-shell/MobileDock'
import { TopCapsules } from '@/layouts/app-shell/TopCapsules'
import {
  buildBreadcrumbs,
  highlightedCategory,
  isDockCollapsed,
  isImmersivePath,
  resolveShellLayout,
  routeCategoryOf,
} from '@/layouts/app-shell/dock-logic'
import type { DockItem } from '@/layouts/app-shell/dock-logic'
import { useBreakpoint } from '@/composable/use-breakpoint'
import { useDockController } from '@/composable/use-dock-controller'
import { categoryIcons, categoryKeys } from '@/tools/categories'
import { getToolByPath, tools } from '@/tools'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSearchStore } from '@/stores/search.store'
import { cn } from '@/lib/utils'

/** 与顶栏面包屑分离动效同一套 spring，dock 收起/展开的手感要对齐 */
const dockTransition = { type: 'spring' as const, duration: 0.42, bounce: 0.18 }

/**
 * app-shell 布局根：`h-svh overflow-hidden`，唯一的滚动容器是 `<main>`。
 *
 * dock 与顶部胶囊都是 root 的直接子节点，用 absolute 浮在滚动区之上——
 * 顶栏/侧栏一律不放 sticky，因为移动端浏览器工具栏伸缩会改变视口高度，
 * sticky 头部会随之位移（表现为"头部往上收缩"，见 AGENTS.md §6）。
 */
export function AppShell() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const location = useLocation()
  const reducedMotion = useReducedMotion() === true
  const breakpoint = useBreakpoint()
  const layout = resolveShellLayout(breakpoint)

  const openPalette = useSearchStore((state) => state.setOpen)
  const activeCategory = usePreferencesStore((state) => state.activeCategory)
  const {
    visibleCategory,
    hover,
    togglePin,
    dismiss,
    panelRef,
    registerItem,
    focusItem,
    anchorRectFor,
  } = useDockController({ enabled: layout.panel === 'floating' })
  // 记的是"在哪条路由上被收起的"：换页即自动展开，省掉一次 effect 里的 setState
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null)

  const immersive = isImmersivePath(location.pathname, tools)
  const dockCollapsed = isDockCollapsed({ collapsedAt, pathname: location.pathname })

  const activeTool = getToolByPath(location.pathname)
  const routeCategory = routeCategoryOf(location.pathname, tools)
  const highlight = highlightedCategory({
    panelCategory: visibleCategory,
    routeCategory,
    activeCategory,
  })
  const isHome = location.pathname === '/'
  const activeKey = isHome ? 'home' : highlight

  const items: DockItem[] = [
    { kind: 'home', label: t('dock.home'), icon: House, href: '/' },
    ...categoryKeys.map((category) => ({
      kind: 'category' as const,
      key: category,
      label: tCategory(category),
      icon: categoryIcons[category],
    })),
  ]

  const crumbs = buildBreadcrumbs({
    pathname: location.pathname,
    homeLabel: t('breadcrumbHome'),
    toolTitle: activeTool ? t(`tools-${activeTool.category}:${activeTool.name}.title`) : null,
    toolCategory: activeTool?.category ?? null,
    categoryLabel: activeTool === undefined ? null : tCategory(activeTool.category),
    staticPageLabel: location.pathname === '/about' ? t('about') : null,
  })

  const handleRailActivate = (item: DockItem) => {
    if (item.kind === 'category') {
      togglePin(item.key)
    }
  }

  return (
    <div className="bg-background relative flex h-svh flex-col overflow-hidden">
      {layout.topCapsules && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex px-6 pt-4">
          <div className="w-full">
            <TopCapsules
              crumbs={crumbs}
              breadcrumbVisible={layout.breadcrumb}
              externalLinks={layout.externalLinks}
              isHome={isHome}
              onOpenPalette={() => openPalette(true)}
            />
          </div>
        </div>
      )}

      {layout.dock === 'rail' ? (
        <AnimatePresence initial={false} mode="popLayout">
          {dockCollapsed ? (
            <motion.div
              key="dock-handle"
              // 折叠按钮与展开后的图标条共用左边缘这条垂直中线。容器 inset-y-0 会盖住
              // 整条左边的内容区，所以容器不吃指针，只有那颗键吃。
              className="pointer-events-none absolute inset-y-0 left-0 z-40 flex items-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={dockTransition}
            >
              <DockHandle label={t('dock.expand')} onExpand={() => setCollapsedAt(null)} />
            </motion.div>
          ) : (
            <motion.div
              key="dock-rail"
              className="pointer-events-none absolute inset-y-0 left-3 z-40 flex items-center"
              style={{ originX: 0, originY: 0.5 }}
              initial={{ opacity: 0, x: reducedMotion ? 0 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: reducedMotion ? 0 : -30 }}
              transition={dockTransition}
            >
              {/* 图标条与浮层共用一个悬停容器：鼠标从键位横移到浮层不会触发 leave，
                  否则经过两者之间那道缝隙时浮层会先关掉、点不到里面的工具 */}
              <div
                className="pointer-events-auto flex items-center gap-2"
                onPointerLeave={() => hover(null)}
              >
                <DockRail
                  items={items}
                  label={t('dock.categories')}
                  activeKey={activeKey}
                  expandedKey={visibleCategory}
                  onActivate={handleRailActivate}
                  onHover={(item) => hover(item.kind === 'category' ? item.key : null)}
                  registerItem={registerItem}
                  focusItem={focusItem}
                />
                <CategoryPanel
                  category={visibleCategory}
                  panelRef={panelRef}
                  anchorRectFor={anchorRectFor}
                  onNavigate={dismiss}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
          <div className="pointer-events-auto">
            <MobileDock homeActive={isHome} onOpenPalette={() => openPalette(true)} />
          </div>
        </div>
      )}

      <main
        data-app-shell-scroll=""
        // 第一次碰内容区就把 dock 折到左边缘，把画面整个让给用户；
        // dock 与浮层都不在 main 里，所以点键位不会触发折叠。
        onPointerDown={() => setCollapsedAt(location.pathname)}
        className={cn(
          // 普通页：让出顶部胶囊带、左侧 dock 条与手机底部 dock。
          // 沉浸页：main 一律不加 padding，画布从视口顶铺到底——
          // 顶部胶囊因此真的浮在画布上，而不是压在一块纯色带上。
          // 有自己标题行的那几个工具在自己的根节点上补这份让位。
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          immersive
            ? 'pb-(--shell-immersive-inset-bottom)'
            : 'scroll-pt-(--shell-inset-top) ps-(--shell-inset-inline-start) pe-4 pt-(--shell-inset-top) pb-(--shell-inset-bottom)',
        )}
      >
        <Outlet />
        {/* 备案号属法定信息，按站点惯例只在首页页脚出现；工具页正文不该被它占位 */}
        {isHome && <BeianCaption className="pt-2 pb-4" />}
      </main>
    </div>
  )
}
