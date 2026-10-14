import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { EmptyStates } from '@/components/empty-states/EmptyStates'
import { Button } from '@/components/ui/button'
import { DocumentMeta } from '@/modules/seo/document-meta'
import { useSearchStore } from '@/stores/search.store'

export default function NotFoundPage() {
  const { t } = useTranslation('not-found')
  const { t: tCommon } = useTranslation('common')
  const openPalette = useSearchStore((state) => state.setOpen)

  return (
    // min-h-full 是必须的：唯一的滚动容器是 <main>，不撑满就没有"垂直居中"可言
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 px-4 py-12">
      {/* 无 path 即不输出 canonical：404 的可索引形态是它自己，不该指向任何"正主" */}
      <DocumentMeta title={`404 · ${tCommon('siteName')}`} description={t('description')} noindex />
      <h1 className="sr-only">{t('heading')}</h1>
      {/* 走丢的那张地图：左边回首页是真链接，右边打开命令面板也是真动作 */}
      <EmptyStates
        scene="map"
        onAction={() => openPalette(true)}
        extra={
          <Button asChild size="sm" variant="outline">
            <Link to="/">{t('backHome')}</Link>
          </Button>
        }
      />
    </div>
  )
}
