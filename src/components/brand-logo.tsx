import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

type BrandLogoProps = {
  /** 外层排布类名（间距、字号等场景差异） */
  className?: string
  /** 图标尺寸类名，默认 size-7 */
  iconClassName?: string
}

/** 品牌图标：路径取自 src/config/site.ts，换图只改 config */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={siteConfig.icons.brandSmall}
      width={16}
      height={16}
      alt=""
      aria-hidden="true"
      className={cn('size-4 shrink-0 object-contain', className)}
    />
  )
}

/** 图标 + 站名组合，侧栏与移动端顶栏共用 */
export function BrandLogo({ className, iconClassName }: BrandLogoProps) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img
        src={siteConfig.icons.brand}
        width={28}
        height={28}
        alt=""
        aria-hidden="true"
        className={cn('size-7 shrink-0 rounded-lg object-contain', iconClassName)}
      />
      <span className="text-base font-semibold">{siteConfig.name}</span>
    </span>
  )
}
