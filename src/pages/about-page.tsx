import { BookOpen, Heart, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DocumentMeta } from '@/modules/seo/document-meta'
import { RepoCard } from '@/components/repo-card'
import { ShieldBadge } from '@/components/shield-badge'
import { siteConfig } from '@/config/site'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryIcons } from '@/tools/categories'
import { tools, toolsByCategory } from '@/tools'
import type { ComponentType, ReactNode } from 'react'

/** 技术栈徽章：与 README 的 shields.io 徽章同一套标识，取值全是版本号，故不进 i18n */
const techStack = [
  { label: 'React', value: '19', valueClassName: 'bg-cyan-400 text-cyan-950' },
  { label: 'Vite', value: '8', valueClassName: 'bg-indigo-500 text-white' },
  { label: 'TypeScript', value: '5', valueClassName: 'bg-blue-600 text-white' },
  { label: 'Tailwind CSS', value: '4', valueClassName: 'bg-sky-500 text-white' },
  { label: 'shadcn/ui', value: 'Radix', valueClassName: 'bg-zinc-900 text-white' },
  { label: 'react-router', value: '8', valueClassName: 'bg-orange-600 text-white' },
  { label: 'zustand', value: '5', valueClassName: 'bg-red-500 text-white' },
  { label: 'i18next', value: '26', valueClassName: 'bg-blue-700 text-white' },
  { label: 'fuse.js', value: '7', valueClassName: 'bg-violet-500 text-white' },
  { label: 'Vitest', value: '5', valueClassName: 'bg-lime-600 text-white' },
]

/**
 * 关于页：一问一答。每个问题一行加粗标题，答案落在带头像的气泡里；
 * 需要展示卡片/徽章的问题把内容放在气泡下方，并与气泡左边缘对齐。
 */
export default function AboutPage() {
  const { t } = useTranslation('about')
  const { t: tCommon } = useTranslation('common')
  const site = { site: tCommon('siteName') }
  const count = { count: tools.length }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <DocumentMeta title={t('title', site)} description={t('metaDescription')} path="/about" />

      <h1 className="text-2xl font-bold md:text-3xl">{t('title', site)}</h1>

      <Qa title={t('q1Title')} body={t('q1Body', { ...site, ...count })}>
        <RepoCard
          owner="MmzMing"
          name="ToolBox"
          repo={siteConfig.githubRepo}
          description={t('repoDescription', count)}
          url={siteConfig.githubUrl}
          license="MIT"
        />
      </Qa>

      <Qa title={t('q2Title')} body={t('q2Body', { ...count, categories: toolsByCategory.length })}>
        <CategoryGrid />
      </Qa>

      <Qa title={t('q3Title')} body={t('q3Body')} />

      <Qa title={t('q4Title')} body={t('q4Body')} />

      <Qa title={t('q5Title')} body={t('q5Body')}>
        <div className="flex flex-wrap gap-2">
          {techStack.map((badge) => (
            <ShieldBadge key={badge.label} {...badge} />
          ))}
        </div>
      </Qa>

      <Qa
        title={t('q6Title')}
        body={
          <>
            {t('q6Body')}{' '}
            <a
              className="text-primary underline underline-offset-4"
              href="./LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              MIT
            </a>{' '}
            {t('q6Tail')}
          </>
        }
      />

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <FeatureCard icon={ShieldCheck} title={t('privacyTitle')} body={t('privacyBody')} />
        <FeatureCard icon={Zap} title={t('fastTitle')} body={t('fastBody')} />
        <FeatureCard
          icon={Heart}
          title={t('openSourceTitle')}
          body={
            <>
              {t('openSourceBody')}{' '}
              <a
                className="text-primary underline underline-offset-4"
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                tools
              </a>
            </>
          }
        />
      </div>

      <div className="mt-4">
        <RepoCard
          owner="MmzMing"
          name="my-blog"
          description={t('blogDescription')}
          url={siteConfig.blogUrl}
          icon={BookOpen}
        />
      </div>
    </div>
  )
}

type QaProps = {
  /** 完整问句，含「Q1：」前缀——标点形态随语言不同，故写进 i18n */
  title: string
  body: ReactNode
  /** 气泡下方的补充内容（仓库卡片、分类网格、徽章等） */
  children?: ReactNode
}

function Qa({ title, body, children }: QaProps) {
  const { t: tCommon } = useTranslation('common')

  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
      <div className="mt-3 flex items-start gap-3">
        <img
          src={siteConfig.icons.brand}
          alt=""
          className="size-9 shrink-0 rounded-full md:size-11"
        />
        <div className="bg-card ring-foreground/15 min-w-0 flex-1 rounded-2xl rounded-tl-sm p-4 ring-1">
          <p className="text-primary text-xs font-semibold">{tCommon('siteName')}</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed md:text-base">
            {body}
          </p>
        </div>
      </div>
      {/* 左缩进 = 头像宽 + gap，让补充内容与气泡左边缘对齐 */}
      {children && <div className="mt-3 ml-12 md:ml-14">{children}</div>}
    </section>
  )
}

/** 分类概览卡片：只报分类与数量，具体工具留给首页与侧栏 */
function CategoryGrid() {
  const { t } = useTranslation('about')
  const { t: tCategory } = useTranslation('categories')

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {toolsByCategory.map(({ category, tools: categoryTools }) => {
        const Icon = categoryIcons[category]
        return (
          <Card key={category} className="flex-row items-center gap-3 p-3">
            <Icon strokeWidth={1.5} className="text-primary size-6 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{tCategory(category)}</span>
              <span className="text-muted-foreground block text-xs">
                {t('toolCount', { count: categoryTools.length })}
              </span>
            </span>
          </Card>
        )
      })}
    </div>
  )
}

type FeatureCardProps = {
  icon: ComponentType<{ className?: string }>
  title: string
  body: ReactNode
}

function FeatureCard({ icon: Icon, title, body }: FeatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-primary size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{body}</CardContent>
    </Card>
  )
}
