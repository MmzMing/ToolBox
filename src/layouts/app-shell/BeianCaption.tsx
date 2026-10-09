import { useTranslation } from 'react-i18next'

import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

const beianLinkClass =
  'rounded-sm no-underline transition-colors hover:text-foreground hover:no-underline focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1'

/**
 * 备案号属法定信息，按站点惯例只出现在首页页脚（AppShell 里跟着 `<main>` 内容滚动），
 * 工具页与手机分类抽屉都不再显示，免得白占正文高度。
 */
export function BeianCaption({ className }: { className?: string }) {
  const { t } = useTranslation('common')
  return (
    <div
      className={cn(
        'text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] leading-tight',
        className,
      )}
    >
      <a href={siteConfig.beian.icpUrl} target="_blank" rel="noreferrer" className={beianLinkClass}>
        {siteConfig.beian.icp}
      </a>
      <a
        href={siteConfig.beian.policeUrl}
        target="_blank"
        rel="noreferrer"
        className={cn(beianLinkClass, 'flex items-center gap-1.5')}
      >
        <img
          src={siteConfig.beian.policeIcon}
          alt={t('beian.policeAlt')}
          width={36}
          height={40}
          className="h-4 w-auto shrink-0"
        />
        {siteConfig.beian.police}
      </a>
    </div>
  )
}
