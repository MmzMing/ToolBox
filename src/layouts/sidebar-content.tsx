import { Heart, History, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useToolsStore } from '@/stores/tools.store'
import { categoryIcons, categoryKeys } from '@/tools/categories'
import { getFavoriteTools, getRecentTools, toolsByCategory } from '@/tools'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'block rounded-md px-2 py-1.5 text-sm no-underline text-muted-foreground transition-colors hover:bg-accent hover:text-foreground hover:no-underline',
    isActive && 'bg-accent font-medium text-accent-foreground',
  )

interface SidebarContentProps {
  /** 移动端抽屉点击导航后关闭 */
  onNavigate?: () => void
}

/**
 * 侧栏内容：收藏夹 + 最近使用 + 10 个分类的手风琴导航。
 * 手风琴展开状态持久化在 preferences store（agent.md §8）。
 */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { t } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')

  const favorites = useToolsStore((state) => state.favorites)
  const recent = useToolsStore((state) => state.recent)
  const expandedCategories = usePreferencesStore((state) => state.expandedCategories)
  const setExpandedCategories = usePreferencesStore((state) => state.setExpandedCategories)

  const favoriteTools = useMemo(() => getFavoriteTools(favorites), [favorites])
  const recentTools = useMemo(() => getRecentTools(recent), [recent])
  const accordionValue = expandedCategories ?? [...categoryKeys]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
          <Wrench className="size-4" />
        </span>
        <span className="text-base font-semibold">ToolBox</span>
      </div>

      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="flex flex-col gap-0.5" aria-label={t('favorites')}>
          <div className="text-muted-foreground flex items-center gap-2 px-2 pt-1 pb-1.5 text-xs font-medium">
            <Heart className="size-3.5" />
            {t('favorites')}
            {favoriteTools.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {favoriteTools.length}
              </Badge>
            )}
          </div>
          {favoriteTools.length === 0 ? (
            <p className="text-muted-foreground/70 px-2 pb-1 text-xs">{t('favoritesEmpty')}</p>
          ) : (
            favoriteTools.map((tool) => (
              <NavLink key={tool.path} to={tool.path} onClick={onNavigate} className={navLinkClass}>
                <tool.icon className="mr-2 inline size-4" />
                {t(`tools-${tool.category}:${tool.name}.title`)}
              </NavLink>
            ))
          )}
        </nav>

        {recentTools.length > 0 && (
          <nav className="mt-2 flex flex-col gap-0.5" aria-label={t('recent')}>
            <div className="text-muted-foreground flex items-center gap-2 px-2 pt-1 pb-1.5 text-xs font-medium">
              <History className="size-3.5" />
              {t('recent')}
            </div>
            {recentTools.map((tool) => (
              <NavLink key={tool.path} to={tool.path} onClick={onNavigate} className={navLinkClass}>
                <tool.icon className="mr-2 inline size-4" />
                {t(`tools-${tool.category}:${tool.name}.title`)}
              </NavLink>
            ))}
          </nav>
        )}

        <Accordion
          type="multiple"
          value={accordionValue}
          onValueChange={(value) => setExpandedCategories(value)}
          className="mt-2"
        >
          {toolsByCategory.map(({ category, tools }) => {
            const Icon = categoryIcons[category]
            return (
              <AccordionItem key={category} value={category} className="border-none">
                <AccordionTrigger className="[&[data-state=open]]:bg-accent/50 rounded-md px-2 py-2 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Icon className="text-muted-foreground size-4" />
                    {tCategory(category)}
                    <Badge variant="secondary" className="mr-1 ml-auto">
                      {tools.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                {/* 覆盖生成组件默认的 [&_a]:underline：侧栏导航链接不需要下划线 */}
                <AccordionContent className="pb-1 [&_a]:no-underline">
                  <nav className="flex flex-col gap-0.5">
                    {tools.map((tool) => (
                      <NavLink
                        key={tool.path}
                        to={tool.path}
                        onClick={onNavigate}
                        className={navLinkClass}
                      >
                        {tool.isNew && (
                          <span className="bg-primary mr-1.5 inline-block size-1.5 rounded-full align-middle" />
                        )}
                        {t(`tools-${tool.category}:${tool.name}.title`)}
                      </NavLink>
                    ))}
                  </nav>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </ScrollArea>
    </div>
  )
}
