import { Wrench } from 'lucide-react'
import { Link, NavLink } from 'react-router'
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
import { categoryIcons } from '@/tools/categories'
import { toolsByCategory } from '@/tools'
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
 * 侧栏内容：Logo（点击回首页）+ 10 个分类的手风琴导航。
 * 收藏夹与最近使用展示在首页（设计调整：侧栏只承担分类导航职责）。
 * 手风琴展开状态持久化在 preferences store（agent.md §8）。
 */
export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { t } = useTranslation()
  const { t: tCategory } = useTranslation('categories')

  const expandedCategories = usePreferencesStore((state) => state.expandedCategories)
  const setExpandedCategories = usePreferencesStore((state) => state.setExpandedCategories)

  // 二级菜单严格默认收起，仅随手动点击展开/收起（展开状态持久化）
  const accordionValue = expandedCategories ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <Link
          to="/"
          onClick={onNavigate}
          className="focus-visible:ring-ring flex items-center gap-2 rounded-md outline-none focus-visible:ring-2"
          aria-label="ToolBox"
        >
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
            <Wrench className="size-4" />
          </span>
          <span className="text-base font-semibold">ToolBox</span>
        </Link>
      </div>

      {/* min-h-0 是关键：防止 flex 子元素撑开导致无法滚动（详见 agent.md §6） */}
      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <Accordion
          type="multiple"
          value={accordionValue}
          onValueChange={(value) => setExpandedCategories(value)}
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
                  <nav className="ml-5 flex flex-col gap-0.5 border-l pl-2">
                    {tools.map((tool) => (
                      <NavLink
                        key={tool.path}
                        to={tool.path}
                        onClick={onNavigate}
                        className={navLinkClass}
                      >
                        <tool.icon className="mr-2 inline size-4 shrink-0" />
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
