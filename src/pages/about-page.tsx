import { Heart, ShieldCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DocumentMeta } from '@/modules/seo/document-meta'
import { GithubIcon } from '@/components/icons/github-icon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const GITHUB_URL = 'https://github.com/your-org/toolbox'
const IT_TOOLS_URL = 'https://github.com/CorentinTh/it-tools'

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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <DocumentMeta title={`${t('title')} · ToolBox`} description={t('intro')} />

      <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{t('intro')}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              {t('privacyTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t('privacyBody')}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-primary" />
              {t('fastTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t('fastBody')}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4 text-primary" />
              {t('openSourceTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('openSourceBody')}{' '}
            <a className="text-primary underline underline-offset-4" href={IT_TOOLS_URL} target="_blank" rel="noreferrer">
              it-tools
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
      <div className="flex gap-3">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <GithubIcon className="size-4" />
          GitHub
        </a>
      </div>
    </div>
  )
}
