import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCopy } from '@/composable/use-copy'
import { absoluteUrl } from '@/config/site'
import { cn } from '@/lib/utils'

interface CopyLinkButtonProps {
  /** 要复制的页面路由，如 '/hash-text' */
  path: string
  className?: string
}

/**
 * 复制本页链接：把 canonical 形态的绝对地址写进剪贴板，用户自行粘到任何地方。
 * 不做平台专属分享组件——那类组件分享出去的是它自己的跳转链接，
 * 卡片标题会变成平台页面名而不是本站标题。
 */
export function CopyLinkButton({ path, className }: CopyLinkButtonProps) {
  const { t } = useTranslation('common')
  const { copy } = useCopy()
  const url = absoluteUrl(path)
  const label = t('copyLink')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn('shrink-0', className)}
          aria-label={label}
          onClick={() => void copy(url)}
        >
          <Link2 className="text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      {/* 提示里给出将要复制的具体地址，避免用户以为复制的是地址栏里的临时状态 */}
      <TooltipContent side="bottom">{url}</TooltipContent>
    </Tooltip>
  )
}
