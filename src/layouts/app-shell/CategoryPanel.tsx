import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { NavList } from '@/layouts/nav-list'
import { categoryIcons, type CategoryKey } from '@/tools/categories'
import { toolsByCategory } from '@/tools'
import { cn } from '@/lib/utils'

/** 箭头距面板上下两端的最小距离，避免贴到圆角上 */
const ARROW_EDGE_INSET = 16

/** 箭头锚在面板顶部往下这么多，面板再整体平移到让箭头对准分类键 */
const ARROW_INSET = 28

/** 面板离视口上下边缘的最小距离 */
const VIEWPORT_EDGE = 12

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type CategoryPanelProps = {
  category: CategoryKey | null
  panelRef: RefObject<HTMLDivElement | null>
  /** 分类键的矩形，用来把左侧箭头对准它 */
  anchorRectFor: (key: string) => DOMRect | null
  onNavigate: () => void
  className?: string
}

/** dock 右侧滑出的二级浮层：盖在内容区之上，不挤压布局 */
export function CategoryPanel({
  category,
  panelRef,
  anchorRectFor,
  onNavigate,
  className,
}: CategoryPanelProps) {
  const reducedMotion = useReducedMotion()
  const { t: tCategory } = useTranslation('categories')
  const [placement, setPlacement] = useState<{ y: number; arrow: number } | null>(null)
  const toolCount =
    category === null
      ? 0
      : (toolsByCategory.find((group) => group.category === category)?.tools.length ?? 0)
  const Icon = category === null ? null : categoryIcons[category]

  /**
   * 面板默认与图标条垂直居中对齐，而分类键往往不在中线上，箭头怎么摆都对不准。
   * 所以先按"箭头落在键中心"反推面板该停在哪，再算出箭头在这块新位置里的偏移。
   *
   * 用 offsetHeight 而不是 getBoundingClientRect：后者会把 motion 正在应用的
   * translateY 也算进去，拿它去算目标位移就成了循环。
   */
  useLayoutEffect(() => {
    if (category === null) {
      return
    }
    const measure = () => {
      const panel = panelRef.current
      const anchor = anchorRectFor(category)
      if (panel === null || anchor === null) {
        setPlacement(null)
        return
      }
      const height = panel.offsetHeight
      const viewport = window.innerHeight
      const keyCenter = anchor.top + anchor.height / 2
      const naturalTop = (viewport - height) / 2
      const top = clamp(keyCenter - ARROW_INSET, VIEWPORT_EDGE, viewport - height - VIEWPORT_EDGE)
      setPlacement({
        y: top - naturalTop,
        arrow: clamp(keyCenter - top, ARROW_EDGE_INSET, height - ARROW_EDGE_INSET),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [category, anchorRectFor, panelRef])

  return (
    <AnimatePresence initial={false}>
      {category !== null && Icon !== null && (
        <motion.div
          // key 必须与分类无关：按分类做 key 会让快速横扫键位时旧面板还在退场、
          // 新面板已经挂载，两个面板在同一个 flex 容器里并排堆成一摞。
          // 保持单实例，换分类就只是就地换内容，也不会重播入场淡入。
          key="dock-panel"
          ref={panelRef}
          initial={reducedMotion ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0, y: placement?.y ?? 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, x: -12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          id="dock-panel"
          className={cn(
            // 不能 overflow-hidden：左侧那颗箭头要探出边框去指分类键
            'bg-dock-panel text-dock-foreground shadow-dock backdrop-blur-dock relative w-60 rounded-2xl',
            className,
          )}
        >
          {placement !== null && (
            <span
              aria-hidden="true"
              style={{ top: placement.arrow }}
              className="bg-dock-panel absolute -left-1 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px]"
            />
          )}
          <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
            <Icon className="text-dock-foreground/70 size-4 shrink-0" />
            <span className="truncate text-sm font-medium">{tCategory(category)}</span>
            <span className="text-muted-foreground text-xs">{toolCount}</span>
          </div>
          {/* 工具整组右移，与面板顶部的分类标题错开；层级留白由容器负责，NavList 只管列表本身 */}
          <div className="inset-scrollbar max-h-[calc(100svh-8rem)] overflow-y-auto px-1.5 ps-5 pb-1.5">
            <NavList category={category} onNavigate={onNavigate} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
