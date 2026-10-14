import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { BrandLogo } from '@/components/brand-logo'
import { siteConfig } from '@/config/site'
import { getToolByPath, tools } from '@/tools'
import type { Tool } from '@/tools/define-tool'
import { CATEGORY_PARAM, categoryKeys } from '@/tools/categories'
import { BeianCaption } from '@/layouts/app-shell/BeianCaption'
import { cn } from '@/lib/utils'

/** 页脚「常用工具」栏：跨分类挑的代表作，路径失效就自动少一条，不会渲染出死链 */
const popularPaths = [
  '/hash-text',
  '/qr-code',
  '/image-compressor',
  '/text-diff',
  '/http-status-codes',
  '/resume',
] as const

const itemClass =
  'text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-sm text-sm transition-colors'

function FooterColumn({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  )
}

function InternalItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className={itemClass}>
        {children}
      </Link>
    </li>
  )
}

function ExternalItem({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className={itemClass}>
        {children}
        <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
      </a>
    </li>
  )
}

/**
 * 首页站点页脚：品牌说明 + 分类/常用工具/关于本站三栏链接，底行是版权与备案。
 * 分类指向 `/?category=<key>` 由首页电路板接住并点亮对应芯片（分类本身没有路由）。
 */
export function SiteFooter() {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')

  const popular = popularPaths.map(getToolByPath).filter((tool): tool is Tool => Boolean(tool))

  return (
    <footer
      aria-label={t('footer.ariaLabel')}
      className="border-border mx-auto mt-12 w-full max-w-6xl border-t px-4 pt-8 pb-4"
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
          <BrandLogo />
          <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
            {t('footer.tagline')}
          </p>
          <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
            {t('footer.localNote')}
          </p>
        </div>

        <FooterColumn title={t('footer.categories')}>
          {categoryKeys.map((category) => (
            <InternalItem key={category} to={`/?${CATEGORY_PARAM}=${category}`}>
              {tCategory(category)}
            </InternalItem>
          ))}
        </FooterColumn>

        <FooterColumn title={t('footer.popular')}>
          {popular.map((tool) => (
            <InternalItem key={tool.path} to={tool.path}>
              {t(`tools-${tool.category}:${tool.name}.title`)}
            </InternalItem>
          ))}
        </FooterColumn>

        <FooterColumn title={t('footer.about')} className="col-span-2 md:col-span-1">
          <InternalItem to="/">{t('footer.home')}</InternalItem>
          <InternalItem to="/about">{t('about')}</InternalItem>
          <ExternalItem href={siteConfig.githubUrl}>{t('github')}</ExternalItem>
          <ExternalItem href={siteConfig.blogUrl}>{t('blog')}</ExternalItem>
        </FooterColumn>
      </div>

      <div className="border-border mt-8 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground text-xs">
            {t('footer.copyright', { year: new Date().getFullYear(), site: t('siteName') })}
          </span>
          <BeianCaption />
        </div>
        <p className="text-muted-foreground text-xs">
          {t('footer.toolCount', { total: tools.length })}
        </p>
      </div>
    </footer>
  )
}
