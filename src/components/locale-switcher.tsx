import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'

import { ActionPill } from '@/components/action-pill'
import { dockPillClass } from '@/components/pill-styles'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { changeLocale } from '@/modules/i18n'
import { nextLocale, type Locale } from '@/stores/preferences.store'
import { cn } from '@/lib/utils'

/** 语言名按 endonym 惯例写死在本语言里：英文界面下也显示「简体中文」，不进口语包 */
const localeLabels = { zh: '简体中文', en: 'English' } as const

const glyphClass = 'flex items-center justify-center text-[13px] leading-none font-medium'

function Glyph({ char, className }: { char: string; className?: string }) {
  return (
    <span aria-hidden className={cn(glyphClass, className)}>
      {char}
    </span>
  )
}

/**
 * 图标位只吃 className，所以两档各绑一个稳定组件，而不是在渲染期现造组件类型
 * （后者每次渲染都会被 React 当成新组件重挂）。
 */
const glyphIcons: Record<Locale, ComponentType<{ className?: string }>> = {
  zh: (props) => <Glyph char="中" {...props} />,
  en: (props) => <Glyph char="A" {...props} />,
}

type LocaleSwitcherProps = {
  /** icon：带 Tooltip 的小图标钮（简历编辑器独立壳）；pill：顶栏悬停展开胶囊；dock：手机底部 dock 的纯图标键 */
  variant?: 'icon' | 'pill' | 'dock'
  /** pill 变体的外观覆盖 */
  className?: string
}

/**
 * 中英切换：点一下直接换（持久化在 preferences store）。
 *
 * 与主题键同构，不再是下拉列表：两档语言用列表选属于多点一次，而且手机扇形里再开一层
 * Radix 菜单还要处理叠放。徽标读的是**当前**界面语言——中文界面显示「中」、英文显示「A」，
 * 说清"现在是什么、点一下会变成什么"的活儿交给 aria-label 与 Tooltip。
 */
export function LocaleSwitcher({ variant = 'icon', className }: LocaleSwitcherProps) {
  const { t, i18n } = useTranslation('common')

  const current: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh'
  const next = nextLocale(current)
  const Icon = glyphIcons[current]
  const modeName = localeLabels[current]
  const cycleHint = t('localeCycle', { current: modeName, next: localeLabels[next] })
  const cycle = () => changeLocale(next)

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
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{cycleHint}</TooltipContent>
    </Tooltip>
  )
}
