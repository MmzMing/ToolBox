import { FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { DocumentMeta } from '@/modules/seo/document-meta'

export default function NotFoundPage() {
  const { t } = useTranslation('not-found')

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-24 text-center">
      <DocumentMeta title={`404 · ToolBox`} description={t('description')} />
      <FileQuestion className="text-muted-foreground/50 size-16" />
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <Button asChild>
        <Link to="/">{t('backHome')}</Link>
      </Button>
    </div>
  )
}
