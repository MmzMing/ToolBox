import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ActionPill } from '@/components/action-pill'
import { dockPillClass } from '@/components/pill-styles'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { nextTheme, useTheme } from '@/modules/theme/theme-context'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  /** icon：带 Tooltip 的小图标钮（简历编辑器独立壳）；pill：顶栏悬停展开胶囊；dock：手机底部 dock 的纯图标键 */
  variant?: 'icon' | 'pill' | 'dock'
  /** pill 变体的外观覆盖 */
  className?: string
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const
const THEME_LABEL_KEYS = { light: 'themeLight', dark: 'themeDark', system: 'themeSystem' } as const

/**
 * 亮/暗/跟随系统 三态切换（modules/theme 持久化，class 策略驱动 shadcn 令牌）。
 *
 * 点一下走一档，不再展开列表：触屏上选主题原本要点两次，手机扇形里再套一层 Radix
 * 菜单还要处理它与扇形浮层的叠放。图标本身就是当前档的读数，所以 tooltip / 展开文字
 * 都只说「现在是什么、点一下会变成什么」。
 */
export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { t } = useTranslation('common')
  const { theme, setTheme } = useTheme()

  const Icon = THEME_ICONS[theme]
  const modeName = t(THEME_LABEL_KEYS[theme])
  const cycleHint = t('themeCycle', {
    current: modeName,
    next: t(THEME_LABEL_KEYS[nextTheme(theme)]),
  })
  const cycle = () => setTheme(nextTheme(theme))

  if (variant !== 'icon') {
    const dockKey = variant === 'dock'
    return (
      <ActionPill
        label={modeName}
        icon={Icon}
        // ActionPill 把 aria-label 写在 {...rest} 之前，这里显式传入即可覆盖成整句提示
        aria-label={cycleHint}
        iconOnly={dockKey}
        className={cn(dockKey && dockPillClass, className)}
        onClick={cycle}
      />
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={cycleHint} onClick={cycle}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{cycleHint}</TooltipContent>
    </Tooltip>
  )
}
