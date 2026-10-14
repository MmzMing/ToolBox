import { AnimatePresence, motion } from 'motion/react'
import { Search } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { ActionPill } from '@/components/action-pill'
import { BrandLogo } from '@/components/brand-logo'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { pillClass } from '@/components/pill-styles'
import { ThemeToggle } from '@/components/theme-toggle'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { BreadcrumbTrail } from '@/layouts/app-shell/BreadcrumbTrail'
import { ExternalLinks } from '@/layouts/app-shell/ExternalLinks'
import { modKeyLabel } from '@/layouts/app-shell/dock-logic'
import type { Crumb, ExternalLinkMode } from '@/layouts/app-shell/dock-logic'
import { siteConfig } from '@/config/site'
import { motionTokens } from '@/lib/motion-tokens'

const MOD_KEY = modKeyLabel(typeof navigator === 'undefined' ? '' : navigator.userAgent)

type TopCapsulesProps = {
  crumbs: Crumb[]
  /** 平板档宽度紧张，把三个外链收进「更多」 */
  externalLinks: ExternalLinkMode
  breadcrumbVisible: boolean
  /** 首页只留 logo 胶囊，换页时才把面包屑胶囊分离出来 */
  isHome: boolean
  onOpenPalette: () => void
}

/**
 * 顶部两组悬浮胶囊：左边 logo（+ 分离出的面包屑）、右边操作区。
 *
 * 整行不贴边也不贴顶：外层给足内边距并居中限宽，视窗变窄时两组自然向中间靠拢。
 * 操作胶囊平时只露图标，悬停才长出文字并把邻居推开，因此不再需要 Tooltip。
 */
export function TopCapsules({
  crumbs,
  externalLinks,
  breadcrumbVisible,
  isHome,
  onOpenPalette,
}: TopCapsulesProps) {
  const reduced = usePrefersReducedMotion()
  const { t } = useTranslation('common')
  const showCrumbs = breadcrumbVisible && !isHome

  return (
    <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          to="/"
          className={`${pillClass} pointer-events-auto px-4`}
          aria-label={siteConfig.name}
        >
          <BrandLogo
            iconClassName="size-7"
            textClassName="hidden max-w-[12rem] truncate sm:inline"
          />
        </Link>
        <AnimatePresence initial={false}>
          {showCrumbs && (
            // 宽度动画的 overflow-hidden 必须落在胶囊自己身上：
            // overflow 只裁子内容，不裁元素自身的 box-shadow，
            // 所以阴影不会被切掉；收起端 32px 的残留由 opacity 0 盖掉。
            <motion.div
              key="breadcrumb"
              className={`${pillClass} pointer-events-auto min-w-0 overflow-hidden px-4`}
              initial={reduced ? false : { width: 0, opacity: 0, x: -14 }}
              animate={{ width: 'auto', opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: -14 }}
              transition={reduced ? { duration: 0 } : motionTokens.spring.shell}
            >
              <BreadcrumbTrail crumbs={crumbs} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
        <ActionPill
          label={t('searchPlaceholder')}
          icon={Search}
          onClick={onOpenPalette}
          // 带常驻内容的胶囊文字两端都要比纯图标那颗更松；纯图标那档必须留 px-3，
          // 否则 20px 图标 + 两侧内边距就不是正圆了
          className="px-4"
          persistent={
            <kbd className="border-dock-border text-muted-foreground hidden h-5 shrink-0 items-center gap-1 rounded border px-1.5 font-mono text-[11px] leading-none md:flex">
              <span>{MOD_KEY}</span>
              <span>K</span>
            </kbd>
          }
        />
        <LocaleSwitcher variant="pill" />
        <ThemeToggle variant="pill" />
        <ExternalLinks mode={externalLinks} />
      </div>
    </div>
  )
}
