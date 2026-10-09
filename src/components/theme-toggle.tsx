import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/modules/theme/theme-context'
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
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  /** icon：带 Tooltip 的小图标钮（简历编辑器独立壳）；pill：顶栏悬停展开胶囊；dock：手机底部 dock 的纯图标键 */
  variant?: 'icon' | 'pill' | 'dock'
  /** pill 变体的外观覆盖 */
  className?: string
  /** 受控开关。顶栏要让它和语言/更多下拉互斥，不传则 Radix 自己管 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** 亮/暗/跟随系统 三态切换（modules/theme 持久化，class 策略驱动 shadcn 令牌） */
export function ThemeToggle({ variant = 'icon', className, open, onOpenChange }: ThemeToggleProps) {
  const { t } = useTranslation('common')
  const { theme, setTheme } = useTheme()

  const options = [
    { value: 'light', label: t('themeLight'), icon: Sun },
    { value: 'dark', label: t('themeDark'), icon: Moon },
    { value: 'system', label: t('themeSystem'), icon: Monitor },
  ] as const

  const items = options.map(({ value, label, icon: Icon }) => (
    <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
      <Icon className="size-4" />
      {label}
      {theme === value && <span className="text-primary ml-auto text-xs">✓</span>}
    </DropdownMenuItem>
  ))

  // 胶囊上那颗图标要说清"现在是什么"，跟随系统时不能画成太阳
  const TriggerIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun

  if (variant !== 'icon') {
    const dockKey = variant === 'dock'
    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <ActionPill
            label={t('theme')}
            icon={TriggerIcon}
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
            <Button variant="ghost" size="icon-sm" aria-label={t('theme')}>
              <Sun className="hidden dark:block" />
              <Moon className="block dark:hidden" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('theme')}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">{items}</DropdownMenuContent>
    </DropdownMenu>
  )
}
