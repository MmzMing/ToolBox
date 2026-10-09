import { House, Info, Menu, Search, Settings } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ComponentType, ReactNode, SVGProps } from 'react'
import { useLocation, useNavigate, Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { GithubIcon } from '@/components/icons/github-icon'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { pillClass } from '@/components/pill-styles'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { fanSlots } from '@/layouts/app-shell/dock-logic'
import { NavList } from '@/layouts/nav-list'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

/** 抽屉整宽滑入滑出：ui/sheet 内置的 slide-in-from-bottom-10 位移只有 40px，内联变量优先级更高 */
const sheetSlideStyle = {
  '--tw-enter-translate-y': '100%',
  '--tw-exit-translate-y': '100%',
} as CSSProperties

/** 齿轮散开后动作键沿上半圆排布的半径，以及逐个错开的间隔 */
const FAN_RADIUS = 132
const FAN_STAGGER = 0.035

const fanSpring = { type: 'spring' as const, duration: 0.5, bounce: 0.28 }

/** 散开时那颗玻璃底：齿轮键本身是透明的，浮在画面上要自带底 */
const fanGlassClass = cn(pillClass, 'bg-dock text-dock-foreground shadow-dock backdrop-blur-dock')

type MobileDockProps = {
  homeActive: boolean
  onOpenPalette: () => void
}

/**
 * 手机档底部 dock：左主页、中齿轮、右菜单，两端是「图标 + 文字」。
 *
 * 齿轮展开时把五个快捷入口沿上半圆散开到 dock 上方，收起时原路收回，像个收纳盒。
 * 搜索/语言/主题/关于/GitHub 从原来的五键条挪进了这里，常驻那条只剩三个高频入口。
 */
export function MobileDock({ homeActive, onOpenPalette }: MobileDockProps) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion() === true
  const dockRef = useRef<HTMLDivElement | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // 散开态记着所在路由：换页即派生成收起，省掉一次 effect 里的 setState
  const [fan, setFan] = useState(() => ({ open: false, pathname: location.pathname }))
  const fanOpen = fan.pathname === location.pathname && fan.open
  const [openMenu, setOpenMenu] = useState<'locale' | 'theme' | null>(null)

  const setFanOpen = (open: boolean) => setFan({ open, pathname: location.pathname })

  const owner = (key: 'locale' | 'theme') => ({
    open: openMenu === key,
    // 关闭回调只允许抹掉自己那一项，否则会把同一次点击里另一个菜单的开启覆盖掉
    onOpenChange: (next: boolean) =>
      setOpenMenu((current) => (next ? key : current === key ? null : current)),
  })

  useEffect(() => {
    if (!fanOpen) {
      return
    }
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (dockRef.current?.contains(target)) {
        return
      }
      // 语言/主题的下拉内容挂在 body 上的 portal 里，点它不属于"点了 dock 外面"，
      // 否则一选语言扇形就被判成外点而缩回去
      if (target instanceof Element && target.closest('[role=menu]')) {
        return
      }
      setFan({ open: false, pathname: location.pathname })
    }
    document.addEventListener('pointerdown', dismissOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', dismissOnOutsidePointer)
  }, [fanOpen, location.pathname])

  const openSheet = () => setSheetOpen(true)

  const closeSheet = () => setSheetOpen(false)

  const slots = fanSlots(5, FAN_RADIUS)
  const fanChildren: ReactNode[] = [
    <ThemeToggle variant="dock" className={fanGlassClass} {...owner('theme')} />,
    <LocaleSwitcher variant="dock" className={fanGlassClass} {...owner('locale')} />,
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

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="bg-dock-panel inset-x-2 bottom-2 h-[78svh] max-h-[78svh] gap-0 overflow-hidden rounded-none border p-0 duration-300"
          style={sheetSlideStyle}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('dock.categories')}</SheetTitle>
            <SheetDescription>{t('openMenu')}</SheetDescription>
          </SheetHeader>

          <div className="inset-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
            <NavList mode="sheet" onNavigate={closeSheet} />
          </div>
        </SheetContent>
      </Sheet>

      <div
        ref={dockRef}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={t('dock.settings')}
        className="bg-dock text-dock-foreground shadow-dock backdrop-blur-dock flex items-center gap-2 rounded-full p-1"
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
                    reducedMotion ? { duration: 0 } : { ...fanSpring, delay: index * FAN_STAGGER }
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

        <LabeledKey icon={Menu} label={t('dock.menu')} onActivate={openSheet} active={sheetOpen} />
      </div>
    </>
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
  onActivate?: () => void
}

/** dock 两端的「图标 + 文字」键：常驻可见，不像顶栏那样要悬停才长出文字 */
function LabeledKey({ icon: Icon, label, to, active = false, onActivate }: LabeledKeyProps) {
  const classes = cn(labeledKeyClass, active && 'text-dock-accent')
  const inner = (
    <>
      <Icon className="size-5 shrink-0" />
      <span className="text-sm">{label}</span>
    </>
  )

  return to === undefined ? (
    <button type="button" aria-label={label} onClick={onActivate} className={classes}>
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
