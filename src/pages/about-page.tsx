import { BookOpen, Heart, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DocumentMeta } from '@/modules/seo/document-meta'
import { GithubIcon } from '@/components/icons/github-icon'
import { siteConfig } from '@/config/site'
import { tools } from '@/tools'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const techStack = [
  'React 19',
  'Vite 8',
  'TypeScript 5',
  'Tailwind CSS v4',
  'shadcn/ui',
  'react-router v8',
  'zustand',
  'i18next',
  'fuse.js',
  'Vitest',
]

export default function AboutPage() {
  const { t } = useTranslation('about')
  const { t: tCommon } = useTranslation('common')
  const site = { site: siteConfig.name }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <DocumentMeta
        title={t('title', site)}
        description={t('intro', { ...site, count: tools.length })}
      />

      <h1 className="text-2xl font-bold md:text-3xl">{t('title', site)}</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed md:text-base">
        {t('intro', { ...site, count: tools.length })}
      </p>

      <h2 className="mt-10 mb-3 text-lg font-semibold">{t('whyTitle')}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed md:text-base">{t('whyBody')}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-primary size-4" />
              {t('privacyTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">{t('privacyBody')}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="text-primary size-4" />
              {t('fastTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">{t('fastBody')}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="text-primary size-4" />
              {t('openSourceTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {t('openSourceBody')}{' '}
            <a
              className="text-primary underline underline-offset-4"
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              tools
            </a>
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">{t('stackTitle')}</h2>
      <div className="flex flex-wrap gap-2">
        {techStack.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">{t('linksTitle')}</h2>
      <p className="text-muted-foreground mt-2 text-xs">
        {t('licenseNote')}（
        <a
          className="text-primary underline underline-offset-4"
          href="./LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          MIT
        </a>
        ）
      </p>

      <div className="mt-3 flex gap-5">
        <a
          href={siteConfig.blogUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <BookOpen className="size-4" />
          {tCommon('blog')}
        </a>
        <a
          href={siteConfig.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <GithubIcon className="size-4" />
          GitHub
        </a>
      </div>
    </div>
  )
}
