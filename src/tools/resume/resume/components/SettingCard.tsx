import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type SettingCardProps = {
  icon: LucideIcon
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** 左侧设置栏的统一卡壳：图标 + 标题，右上角可放一个操作 */
export function SettingCard({ icon: Icon, title, action, children, className }: SettingCardProps) {
  return (
    <Card className={cn('gap-0 border shadow-sm', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Icon className="text-muted-foreground size-4" />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}
