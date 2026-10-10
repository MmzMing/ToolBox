import { ArrowLeft, House, Info, LayoutGrid, Menu, Search, Settings, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'

import { GithubIcon } from '@/components/icons/github-icon'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { dockItemClass, pillClass } from '@/components/pill-styles'
import { fanSlots } from '@/layouts/app-shell/dock-logic'
import { NavList } from '@/layouts/nav-list'
import { siteConfig } from '@/config/site'
import { categoryIcons } from '@/tools/categories'
import type { CategoryKey } from '@/tools/categories'
import { toolsByCategory } from '@/tools'
import { cn } from '@/lib/utils'

/** 齿轮散开后动作键沿上半圆排布的半径，以及逐个错开的间隔 */
const FAN_RADIUS = 132
const FAN_STAGGER = 0.035

const fanSpring = { type: 'spring' as const, duration: 0.5, bounce: 0.28 }

/** 横向条 ⇄ 卡片的形变，与 dock 折叠、顶栏面包屑分离同一套 spring */
const shellSpring = { type: 'spring' as const, duration: 0.45, bounce: 0.18 }

/** 内容换层比外壳形变慢半拍起，形变最扭曲的那一截由外壳的缩放独自扛 */
const contentFade = { duration: 0.22, delay: 0.14 }

/** 散开时那颗玻璃底：齿轮键本身是透明的，浮在画面上要自带底 */
const fanGlassClass = cn(pillClass, 'bg-dock text-dock-foreground shadow-dock backdrop-blur-dock')

type MobileDockProps = {
  homeActive: boolean
  onOpenPalette: () => void
}

/** 卡片停在第几级：null 是分类网格，否则是该分类的工具列表 */
type CardState = { open: boolean; category: CategoryKey | null; pathname: string }

/**
 * 手机档底部 dock：左主页、中齿轮、右菜单，两端是「图标 + 文字」。
 *
 * 菜单键不再是底部抽屉，而是让整条 dock 原地变形为一张响应式卡片——外壳用 motion 的
 * layout 投影做形变，卡片与条互为对方的进出场，尺寸完全由内容决定，不测像素。
 * 卡片内两级：分类图标网格 → 该分类的工具列表，与桌面档「图标条 + 分类浮层」同一套心智。
 *
 * 齿轮仍走扇形：五个快捷入口沿上半圆散开到 dock 上方。
 */
export function MobileDock({ homeActive, onOpenPalette }: MobileDockProps) {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion() === true
  const dockRef = useRef<HTMLDivElement | null>(null)
  // 散开态记着所在路由：换页即派生成收起，省掉一次 effect 里的 setState
  const [fan, setFan] = useState(() => ({ open: false, pathname: location.pathname }))
  const fanOpen = fan.pathname === location.pathname && fan.open
  // 卡片同理，另外记着停在第几级
  const [card, setCard] = useState<CardState>(() => ({
    open: false,
    category: null,
    pathname: location.pathname,
  }))
  const cardOpen = card.pathname === location.pathname && card.open

  const setFanOpen = (open: boolean) => setFan({ open, pathname: location.pathname })

  const dismissAll = useCallback(() => {
    const pathname = location.pathname
    setFan({ open: false, pathname })
    setCard({ open: false, category: null, pathname })
  }, [location.pathname])

  const toggleCard = () =>
    setCard(
      cardOpen
        ? { open: false, category: null, pathname: location.pathname }
        : { open: true, category: null, pathname: location.pathname },
    )

  const openCategory = (category: CategoryKey) =>
    setCard({ open: true, category, pathname: location.pathname })

  const backToCategories = () => setCard((current) => ({ ...current, category: null }))

  useEffect(() => {
    if (!fanOpen && !cardOpen) {
      return
    }
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (dockRef.current?.contains(target)) {
        return
      }
      dismissAll()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissAll()
      }
    }
    document.addEventListener('pointerdown', dismissOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [cardOpen, dismissAll, fanOpen])

  const slots = fanSlots(5, FAN_RADIUS)
  const fanChildren: ReactNode[] = [
    <ThemeToggle variant="dock" className={fanGlassClass} />,
    <LocaleSwitcher variant="dock" className={fanGlassClass} />,
    <FanButton
      icon={Search}
      label={t('searchPlaceholder')}
      onClick={() => {
        setFanOpen(false)
        onOpenPalette()
      }}
    />,
    <FanButton
      icon={Info}
      label={t('about')}
      onClick={() => {
        setFanOpen(false)
        navigate('/about')
      }}
    />,
    <a
      href={siteConfig.githubUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={t('github')}
      className={fanGlassClass}
    >
      <GithubIcon className="size-5 shrink-0" />
    </a>,
  ]

  const cardToolCount =
    card.category === null
      ? 0
      : (toolsByCategory.find((group) => group.category === card.category)?.tools.length ?? 0)
  const CardIcon = card.category === null ? null : categoryIcons[card.category]

  return (
    <motion.div
      ref={dockRef}
      layout
      initial={false}
      transition={reducedMotion ? { duration: 0 } : shellSpring}
      className={cn(
        // 无边框，玻璃底 + 阴影浮起来。overflow-hidden 只在卡片态挂：常驻会把齿轮
        // 散开的扇形键削掉，那五个键本来就浮在条上方 132px 的溢出的区域里
        'bg-dock text-dock-foreground shadow-dock backdrop-blur-dock',
        cardOpen ? 'w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-4xl' : 'rounded-full',
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {cardOpen ? (
          <motion.div
            key="dock-card"
            layout
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.12 } }}
            transition={reducedMotion ? { duration: 0 } : contentFade}
            className="flex min-h-0 flex-col"
          >
            <header className="flex items-center gap-1.5 px-4 pt-2 pb-1">
              {card.category === null ? (
                <>
                  <LayoutGrid className="text-dock-foreground/70 size-5 shrink-0" />
                  <h2 className="text-dock-foreground text-sm font-medium">
                    {t('dock.categories')}
                  </h2>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={t('dock.back')}
                    onClick={backToCategories}
                    className={dockItemClass(false)}
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                  {CardIcon === null ? null : (
                    <CardIcon className="text-dock-foreground/70 size-5 shrink-0" />
                  )}
                  <h2 className="text-dock-foreground truncate text-sm font-medium">
                    {tCategory(card.category)}
                  </h2>
                  <span className="text-muted-foreground text-xs">{cardToolCount}</span>
                </>
              )}
              <button
                type="button"
                aria-label={t('dock.collapse')}
                onClick={dismissAll}
                className={cn(dockItemClass(false), 'ms-auto')}
              >
                <X className="size-5" />
              </button>
            </header>

            {card.category === null ? (
              <CategoryGrid onPick={openCategory} />
            ) : (
              <div className="inset-scrollbar max-h-[50svh] min-h-0 overflow-y-auto p-2">
                <NavList category={card.category} onNavigate={dismissAll} />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="dock-bar"
            layout
            role="toolbar"
            aria-orientation="horizontal"
            aria-label={t('dock.settings')}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.12 } }}
            transition={reducedMotion ? { duration: 0 } : contentFade}
            className="flex items-center gap-2 p-1"
          >
            <LabeledKey icon={House} label={t('dock.home')} to="/" active={homeActive} />

            <div className="relative flex items-center justify-center">
              <AnimatePresence initial={false}>
                {fanOpen &&
                  slots.map((slot, index) => (
                    <motion.div
                      key={index}
                      className="absolute"
                      initial={reducedMotion ? false : { x: 0, y: 0, scale: 0.2, opacity: 0 }}
                      animate={{ x: slot.x, y: slot.y, scale: 1, opacity: 1 }}
                      exit={{
                        x: 0,
                        y: 0,
                        scale: 0.2,
                        opacity: 0,
                        transition: reducedMotion
                          ? { duration: 0 }
                          : { delay: (slots.length - index - 1) * FAN_STAGGER },
                      }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { ...fanSpring, delay: index * FAN_STAGGER }
                      }
                    >
                      {fanChildren[index]}
                    </motion.div>
                  ))}
              </AnimatePresence>

              <motion.button
                type="button"
                aria-label={t('dock.settings')}
                aria-expanded={fanOpen}
                onClick={() => setFanOpen(!fanOpen)}
                animate={{ scale: fanOpen && !reducedMotion ? 1.14 : 1, rotate: fanOpen ? 90 : 0 }}
                transition={fanSpring}
                className="bg-primary text-primary-foreground relative z-10 flex size-11 items-center justify-center rounded-full"
              >
                <Settings className="size-5" />
              </motion.button>
            </div>

            <LabeledKey
              icon={Menu}
              label={t('dock.menu')}
              onActivate={toggleCard}
              expanded={cardOpen}
              active={cardOpen}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** 卡片第一级：分类图标网格，点进去在同一张卡片里换成该分类的工具列表 */
function CategoryGrid({ onPick }: { onPick: (category: CategoryKey) => void }) {
  const { t: tCategory } = useTranslation('categories')

  return (
    <div className="grid grid-cols-3 gap-1 p-2">
      {toolsByCategory.map(({ category, tools }) => {
        const Icon = categoryIcons[category]
        return (
          <button
            key={category}
            type="button"
            onClick={() => onPick(category)}
            className="text-dock-foreground/75 hover:bg-foreground/10 hover:text-dock-foreground focus-visible:ring-dock-accent flex flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-colors duration-200 outline-none focus-visible:ring-2 motion-reduce:transition-none"
          >
            <Icon className="size-5 shrink-0" />
            <span className="max-w-full truncate text-xs">{tCategory(category)}</span>
            <span className="text-muted-foreground text-[11px] leading-none">{tools.length}</span>
          </button>
        )
      })}
    </div>
  )
}

/** dock 两端的「图标 + 文字」键：只留文字与图标，不要胶囊底、描边和阴影 */
const labeledKeyClass =
  'text-dock-foreground/80 hover:text-dock-foreground flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm no-underline outline-none transition-colors duration-200 hover:no-underline motion-reduce:transition-none'

type LabeledKeyProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  /** 站内路由：必须走 Link，裸 `<a href>` 会整页重载，dev 下表现为白屏数秒、dock 一起消失 */
  to?: string
  active?: boolean
  /** disclosure 模式播报展开态：菜单键开的是同级卡片，不是链接 */
  expanded?: boolean
  onActivate?: () => void
}

/** dock 两端的「图标 + 文字」键：常驻可见，不像顶栏那样要悬停才长出文字 */
function LabeledKey({
  icon: Icon,
  label,
  to,
  active = false,
  expanded,
  onActivate,
}: LabeledKeyProps) {
  const classes = cn(labeledKeyClass, active && 'text-dock-accent')
  const inner = (
    <>
      <Icon className="size-5 shrink-0" />
      <span className="text-sm">{label}</span>
    </>
  )

  return to === undefined ? (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onActivate}
      className={classes}
    >
      {inner}
    </button>
  ) : (
    <Link to={to} aria-label={label} className={classes}>
      {inner}
    </Link>
  )
}

function FanButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={fanGlassClass}>
      <Icon className="size-5 shrink-0" />
    </button>
  )
}
