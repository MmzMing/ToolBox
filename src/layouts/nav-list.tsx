import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

import type { CategoryKey } from '@/tools/categories'
import { toolsByCategory } from '@/tools'
import { cn } from '@/lib/utils'

const toolLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2 py-2 text-sm no-underline text-muted-foreground transition-colors hover:bg-accent hover:text-foreground hover:no-underline',
    isActive && 'bg-accent font-medium text-accent-foreground',
  )

type NavListProps = {
  category: CategoryKey
  onNavigate?: () => void
}

/**
 * 单个分类的工具列表，桌面浮层与手机变形卡片共用。
 *
 * 只渲染一个分类：手机的卡片是横向 dock 原地变出来的，尺寸有限，
 * 九个分类连同全部工具一次性铺开会让手机用户在长列表里盲滚；
 * 分类选择由调用方（桌面图标条 / 手机卡片网格）负责。
 */
export function NavList({ category, onNavigate }: NavListProps) {
  // dock.tools 在 common 命名空间里：不带 ns 的 useTranslation() 会落到不存在的
  // translation 命名空间，aria-label 直接退化成键名（console 报 missing key）
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const group = toolsByCategory.find((entry) => entry.category === category)

  return (
    <nav
      className="flex flex-col gap-0.5"
      aria-label={t('dock.tools', { category: tCategory(category) })}
    >
      {(group?.tools ?? []).map((tool) => (
        <NavLink key={tool.path} to={tool.path} onClick={onNavigate} className={toolLinkClass}>
          <tool.icon className="size-4 shrink-0" />
          <span className="truncate">{t(`tools-${tool.category}:${tool.name}.title`)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
