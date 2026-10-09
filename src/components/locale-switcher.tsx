import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ActionPill } from '@/components/action-pill'
import { dockPillClass } from '@/components/pill-styles'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { changeLocale } from '@/modules/i18n'
import { supportedLocales } from '@/stores/preferences.store'
import { cn } from '@/lib/utils'

const localeLabels = { zh: '简体中文', en: 'English' } as const

type LocaleSwitcherProps = {
  /** icon：带 Tooltip 的小图标钮（简历编辑器独立壳）；pill：顶栏悬停展开胶囊；dock：手机底部 dock 的纯图标键 */
  variant?: 'icon' | 'pill' | 'dock'
  /** pill 变体的外观覆盖 */
  className?: string
  /** 受控开关。顶栏要让它和主题/更多下拉互斥，不传则 Radix 自己管 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** 语言切换下拉（中英），持久化在 preferences store */
export function LocaleSwitcher({
  variant = 'icon',
  className,
  open,
  onOpenChange,
}: LocaleSwitcherProps) {
  const { t, i18n } = useTranslation('common')

  const items = (
    <>
      {supportedLocales.map((value) => (
        <DropdownMenuItem
          key={value}
          onClick={() => changeLocale(value)}
          disabled={value === i18n.resolvedLanguage}
        >
          {localeLabels[value]}
          {value === i18n.resolvedLanguage && (
            <span className="text-primary ml-auto text-xs">✓</span>
          )}
        </DropdownMenuItem>
      ))}
    </>
  )

  if (variant !== 'icon') {
    const dockKey = variant === 'dock'
    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <ActionPill
            label={t('language')}
            icon={Languages}
            iconOnly={dockKey}
            className={cn(dockKey && dockPillClass, className)}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('language')}>
              <Languages />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('language')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">{items}</DropdownMenuContent>
    </DropdownMenu>
  )
}
