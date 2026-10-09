import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'

import { categoryIcons, type CategoryKey } from '@/tools/categories'
import { toolsByCategory } from '@/tools'
import { cn } from '@/lib/utils'

const toolLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-md px-2 py-2 text-sm no-underline text-muted-foreground transition-colors hover:bg-accent hover:text-foreground hover:no-underline',
    isActive && 'bg-accent font-medium text-accent-foreground',
  )

type NavListProps = {
  onNavigate?: () => void
} & (
  | {
      /** 桌面浮层：只渲染选中的那一个分类 */
      mode: 'panel'
      category: CategoryKey
    }
  | {
      /** 手机抽屉：全部分类平铺，不做展开收起 */
      mode: 'sheet'
    }
)

/**
 * 分类 → 工具两级导航列表，桌面浮层与手机抽屉共用。
 *
 * 手机抽屉整屏就是导航，所以九分类连同各自的全部工具一次性铺开——
 * 手风琴在这里只会多一层要点开的操作，收起来的状态反而藏住了内容。
 */
export function NavList(props: NavListProps) {
  const { t } = useTranslation()
  const { t: tCategory } = useTranslation('categories')

  if (props.mode === 'panel') {
    const group = toolsByCategory.find((entry) => entry.category === props.category)
    return (
      <nav
        className="flex flex-col gap-0.5"
        aria-label={t('dock.tools', { category: tCategory(props.category) })}
      >
        {(group?.tools ?? []).map((tool) => (
          <NavLink
            key={tool.path}
            to={tool.path}
            onClick={props.onNavigate}
            className={toolLinkClass}
          >
            <tool.icon className="size-4 shrink-0" />
            <span className="truncate">{t(`tools-${tool.category}:${tool.name}.title`)}</span>
          </NavLink>
        ))}
      </nav>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {toolsByCategory.map(({ category, tools }) => {
        const Icon = categoryIcons[category]
        return (
          <section key={category} aria-labelledby={`nav-cat-${category}`}>
            <h2
              id={`nav-cat-${category}`}
              className="text-dock-foreground/60 flex items-center gap-2 px-2 text-sm font-medium"
            >
              <Icon className="size-4 shrink-0" />
              {tCategory(category)}
              <span className="text-muted-foreground text-xs">{tools.length}</span>
            </h2>
            {/* 工具整组右移，与上一级的分类标题错开，扫一眼就能分出层级 */}
            <nav className="mt-1 flex flex-col gap-0.5 ps-5">
              {tools.map((tool) => (
                <NavLink
                  key={tool.path}
                  to={tool.path}
                  onClick={props.onNavigate}
                  className={toolLinkClass}
                >
                  <tool.icon className="size-4 shrink-0" />
                  <span className="truncate">{t(`tools-${tool.category}:${tool.name}.title`)}</span>
                </NavLink>
              ))}
            </nav>
          </section>
        )
      })}
    </div>
  )
}
