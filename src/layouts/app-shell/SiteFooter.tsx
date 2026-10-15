import { ArrowRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { LiquidText } from '@/components/liquid-text'
import { SplitAccordion } from '@/components/split-accordion'
import type { SplitAccordionItem } from '@/components/split-accordion'
import { siteConfig } from '@/config/site'
import { getToolByPath, tools } from '@/tools'
import type { Tool } from '@/tools/define-tool'
import { BeianCaption } from '@/layouts/app-shell/BeianCaption'
import { cn } from '@/lib/utils'

/** 页脚「常用工具」栏：跨分类挑的代表作，路径失效就自动少一条，不会渲染出死链 */
const popularPaths = [
  '/image-compressor',
  '/image-stack',
  '/resume',
  '/ai-image-gen',
  '/dns-lookup',
  '/music-to-video',
] as const

/** 页脚常见问题：只放四问四答，展开的那条从卡里裂开；完整问答在 /about */
const faqIds = ['account', 'privacy', 'mobile', 'contribute'] as const

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
 * 首页站点页脚：左品牌说明、中常见问题手风琴、右常用工具与关于本站两栏，
 * 底行左中右分别是版权、备案与工具数。
 */
export function SiteFooter() {
  const { t } = useTranslation('common')

  const popular = popularPaths.map(getToolByPath).filter((tool): tool is Tool => Boolean(tool))

  const faqItems: SplitAccordionItem[] = faqIds.map((id) => ({
    id,
    title: t(`footer.faq.q-${id}`),
    content: t(`footer.faq.a-${id}`),
  }))

  return (
    <footer
      aria-label={t('footer.ariaLabel')}
      className="border-border mx-auto mt-12 w-full max-w-7xl border-t px-4 pt-8 pb-4 md:px-8"
    >
      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <LiquidText text={t('siteName')} className="text-2xl md:text-3xl" />
          <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
            {t('footer.tagline')}
          </p>
        </div>

        <div className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold">{t('footer.faq.title')}</h2>
          <SplitAccordion items={faqItems} />
          <Link to="/about" className={cn(itemClass, 'mt-3 text-xs')}>
            {t('footer.faq.more')}
            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          <FooterColumn title={t('footer.popular')}>
            {popular.map((tool) => (
              <InternalItem key={tool.path} to={tool.path}>
                {t(`tools-${tool.category}:${tool.name}.title`)}
              </InternalItem>
            ))}
          </FooterColumn>

          <FooterColumn title={t('footer.about')}>
            <InternalItem to="/">{t('footer.home')}</InternalItem>
            <InternalItem to="/about">{t('about')}</InternalItem>
            <ExternalItem href={siteConfig.githubUrl}>{t('github')}</ExternalItem>
            <ExternalItem href={siteConfig.blogUrl}>{t('blog')}</ExternalItem>
          </FooterColumn>
        </div>
      </div>

      <div className="border-border mt-10 grid justify-items-center gap-3 border-t pt-5 md:grid-cols-3 md:items-center md:justify-items-start">
        <span className="text-muted-foreground text-xs">
          {t('footer.copyright', { year: new Date().getFullYear(), site: t('siteName') })}
        </span>
        <BeianCaption className="md:justify-self-center" />
        <p className="text-muted-foreground text-xs md:justify-self-end">
          {t('footer.toolCount', { total: tools.length })}
        </p>
      </div>
    </footer>
  )
}
