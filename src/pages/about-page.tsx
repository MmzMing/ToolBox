import { BookOpen, Heart, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DocumentMeta } from '@/modules/seo/document-meta'
import { Faq } from '@/components/faq'
import type { FaqItem } from '@/components/faq'
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
 * 关于页：聊天气泡式问答。问题靠左成泡，点一下答案从右下弹入；
 * 需要展示卡片/徽章的问题把内容放在答案气泡下方的整宽区里。
 */
export default function AboutPage() {
  const { t } = useTranslation('about')
  const { t: tCommon } = useTranslation('common')
  const site = { site: tCommon('siteName') }
  const count = { count: tools.length }

  const items: FaqItem[] = [
    {
      id: 'what',
      question: t('q1Title'),
      answer: t('q1Body', { ...site, ...count }),
      detail: (
        <RepoCard
          owner="MmzMing"
          name="ToolBox"
          repo={siteConfig.githubRepo}
          description={t('repoDescription', count)}
          url={siteConfig.githubUrl}
          license="MIT"
        />
      ),
    },
    {
      id: 'tools',
      question: t('q2Title'),
      answer: t('q2Body', { ...count, categories: toolsByCategory.length }),
      detail: <CategoryGrid />,
    },
    { id: 'privacy', question: t('q3Title'), answer: t('q3Body') },
    { id: 'why', question: t('q4Title'), answer: t('q4Body') },
    {
      id: 'stack',
      question: t('q5Title'),
      answer: t('q5Body'),
      detail: (
        <div className="flex flex-wrap gap-2">
          {techStack.map((badge) => (
            <ShieldBadge key={badge.label} {...badge} />
          ))}
        </div>
      ),
    },
    {
      id: 'license',
      question: t('q6Title'),
      answer: (
        <>
          {t('q6Body')}{' '}
          <a
            className="underline underline-offset-4"
            href="./LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            MIT
          </a>{' '}
          {t('q6Tail')}
        </>
      ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <DocumentMeta title={t('title', site)} description={t('metaDescription')} path="/about" />

      <h1 className="text-2xl font-bold md:text-3xl">{t('title', site)}</h1>

      <section aria-labelledby="about-features" className="mt-8">
        <h2 id="about-features" className="text-xl font-semibold md:text-2xl">
          {t('featuresTitle')}
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
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
      </section>

      <section aria-labelledby="about-faq" className="mt-10">
        <h2 id="about-faq" className="text-xl font-semibold md:text-2xl">
          {t('faqTitle')}
        </h2>
        <Faq items={items} defaultOpen="what" level={3} className="mt-3" />
      </section>
    </div>
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
