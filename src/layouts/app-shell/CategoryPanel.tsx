import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
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

/** 换层时内容的纵向位移：够读出「从下面升上来」，又不至于让整列文字跑出面板 */
const SLIDE_PX = 24

/** 面板纵向跟随、高度形变与内容换层共用这一条时长，三者同步才不像各自为政 */
const SWAP = 0.24

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * 面板几何。height 就是当前那一层内容的自然高度，y 是相对定位容器顶边的位移，
 * instant 标记「这一轮打开的第一次落位」——它必须直接落位，否则面板会从
 * 未测量时的位置飞进来，表现为多出一段纵向位移。
 */
type Geom = { height: number; y: number; arrow: number; instant: boolean }

type CategoryPanelProps = {
  category: CategoryKey | null
  /** 换层方向：1 表示新列表从下方升入，由 dock 控制器按扫描方向算好传进来 */
  slideDir: 1 | -1
  panelRef: RefObject<HTMLDivElement | null>
  /** 定位基准：图标条与浮层共用的那个悬停容器，面板绝对定位在它的右缘 */
  containerRef: RefObject<HTMLDivElement | null>
  /** 分类键的矩形，用来把左侧箭头对准它 */
  anchorRectFor: (key: string) => DOMRect | null
  onNavigate: () => void
  className?: string
}

/**
 * dock 右侧滑出的二级浮层：盖在内容区之上，不挤压布局。
 *
 * 鼠标留在图标条上横扫分类键时，浮层不换实例、只换内容层：新列表按扫描方向
 * 从下/上方升入，旧列表朝反方向退场，面板高度与纵向位置同步补间——
 * 读起来是「上下滑动切换」，而不是每换一个键就重画一次。
 */
export function CategoryPanel({
  category,
  slideDir,
  panelRef,
  containerRef,
  anchorRectFor,
  onNavigate,
  className,
}: CategoryPanelProps) {
  const reduced = usePrefersReducedMotion()
  const { t: tCategory } = useTranslation('categories')
  const [geom, setGeom] = useState<Geom | null>(null)
  const toolCount =
    category === null
      ? 0
      : (toolsByCategory.find((group) => group.category === category)?.tools.length ?? 0)
  const Icon = category === null ? null : categoryIcons[category]

  // 收起后重新打开要重新落位，所以标记在关闭那一刻复位
  const freshRef = useRef(true)
  useEffect(() => {
    if (category === null) {
      freshRef.current = true
    }
  }, [category])

  // 各层内容的节点，按分类存着：换层时量新那一层的自然高度当作面板目标高度
  const contentRefs = useRef(new Map<CategoryKey, HTMLDivElement | null>())

  /**
   * 面板绝对定位在悬停容器顶边，纵向位置全靠 y 位移表达，所以高度变化不会再
   * 触发「居中基准跟着变」的连锁跳动。用 offsetHeight 而不是
   * getBoundingClientRect：后者会把 motion 正在应用的位移与形变也算进去。
   */
  useLayoutEffect(() => {
    if (category === null) {
      return
    }
    const measure = () => {
      const container = containerRef.current
      const content = contentRefs.current.get(category) ?? null
      const anchor = anchorRectFor(category)
      if (container === null || content === null || anchor === null) {
        return
      }
      const height = content.offsetHeight
      const viewport = window.innerHeight
      const keyCenter = anchor.top + anchor.height / 2
      const top = clamp(keyCenter - ARROW_INSET, VIEWPORT_EDGE, viewport - height - VIEWPORT_EDGE)
      const instant = freshRef.current
      freshRef.current = false
      setGeom({
        height,
        y: top - container.getBoundingClientRect().top,
        arrow: clamp(keyCenter - top, ARROW_EDGE_INSET, height - ARROW_EDGE_INSET),
        instant,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [category, anchorRectFor, containerRef])

  const bodyVariants = {
    enter: (dir: number) => (reduced ? { opacity: 0 } : { y: dir * SLIDE_PX, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (dir: number) => (reduced ? { opacity: 0 } : { y: -dir * SLIDE_PX, opacity: 0 }),
  }
  const morph = {
    duration: reduced || (geom?.instant ?? true) ? 0 : SWAP,
    ease: 'easeOut' as const,
  }
  return (
    <AnimatePresence initial={false}>
      {category !== null && Icon !== null && (
        <motion.div
          // key 必须与分类无关：按分类做 key 会让快速横扫键位时旧面板还在退场、
          // 新面板已经挂载，两张玻璃底在同一处叠出重影。
          // 保持单实例，换分类就只是就地换内容，也不会重播入场淡入。
          key="dock-panel"
          ref={panelRef}
          initial={reduced ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0, y: geom?.y ?? 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -12 }}
          transition={{
            opacity: { duration: SWAP, ease: 'easeOut' },
            x: { duration: SWAP, ease: 'easeOut' },
            y: morph,
          }}
          id="dock-panel"
          className={cn(
            // 不能 overflow-hidden：左侧那颗箭头要探出边框去指分类键。
            // 绝对定位挂在容器右缘，那 8px 内边距留在容器里当指针桥，
            // 鼠标横过缝隙时不会先触发容器的 pointerleave 把浮层关掉
            'bg-dock-panel text-dock-foreground shadow-dock backdrop-blur-dock absolute start-full top-0 w-60 rounded-2xl',
            className,
          )}
        >
          {geom !== null && (
            <span
              aria-hidden="true"
              style={{ top: geom.arrow }}
              className="bg-dock-panel absolute -left-1 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px]"
            />
          )}
          {/* 各层内容一律脱流叠在这里，容器高度只由 height 表达：换层时它跟着补间，
              玻璃底才不会在内容滑动的同时把底边硬切一刀 */}
          <motion.div
            className="relative overflow-hidden rounded-2xl"
            initial={false}
            animate={{ height: geom?.height ?? 0 }}
            transition={morph}
          >
            <AnimatePresence initial={false} custom={slideDir}>
              <motion.div
                key={category}
                // AnimatePresence 的 custom 只喂给退场层，入场层要自己拿方向
                custom={slideDir}
                ref={(node) => {
                  contentRefs.current.set(category, node)
                }}
                variants={bodyVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduced ? 0 : SWAP, ease: 'easeOut' }}
                className="absolute inset-x-0 top-0"
              >
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
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
