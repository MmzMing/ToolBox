import { cn } from 'cn'

type ShieldBadgeProps = {
  /** 左半段：项目名 */
  label: string
  /** 右半段：版本号 */
  value: string
  /**
   * 右半段配色，取 Tailwind 调色板中最接近官方品牌色的一档。
   * 品牌色是标识的一部分，不随亮暗主题翻转，因此不走语义令牌。
   */
  valueClassName: string
}

/** shields.io 双色徽章的本地复刻（离线可用，不发外部图片请求） */
export function ShieldBadge({ label, value, valueClassName }: ShieldBadgeProps) {
  return (
    <span className="ring-foreground/15 inline-flex shrink-0 items-center overflow-hidden rounded-sm text-xs font-medium ring-1">
      <span className="text-background bg-foreground/85 px-2 py-0.5">{label}</span>
      <span className={cn('px-2 py-0.5', valueClassName)}>{value}</span>
    </span>
  )
}
