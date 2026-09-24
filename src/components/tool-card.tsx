import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { FavoriteButton } from '@/components/favorite-button'
import { Card } from '@/components/ui/card'
import type { Tool } from '@/tools/define-tool'

interface ToolCardProps {
  tool: Tool
}

/**
 * 首页/搜索结果里的工具卡片，内容分三层堆叠（由下往上）：
 *
 * 1. 卡片背景（Card 本身）
 * 2. 中间层：工具图标——去掉原来的底色方块、放大，并往左倾斜一点，是独立一层
 * 3. 顶层：文字——标题一行，描述固定占三行
 *
 * 图标与文字层在空间上是重叠的（不是上下排开的两个块），所以图标绝对定位、z 轴压在字下面，
 * 右下角出血由卡片自己的 overflow-hidden 裁掉。
 *
 * 描述固定三行的高度（不够也占满）：卡片高度因此只由标题行数决定，同一行里的卡片能对齐、
 * 图标也总落在同一个角上，不会因为描述长短不一而互相错位。
 */
export function ToolCard({ tool }: ToolCardProps) {
  const { t } = useTranslation(`tools-${tool.category}`)

  return (
    <Card className="group hover:border-primary/40 relative h-full overflow-hidden p-4 transition-all hover:shadow-sm">
      <Link to={tool.path} className="relative z-10 flex flex-col outline-none">
        <h3 className="text-base font-semibold md:text-lg">{t(`${tool.name}.title`)}</h3>
        {/* min-h-15 = 3 × text-sm 的行高，写死三行的高度，不够三行也撑住 */}
        <p className="text-muted-foreground mt-1 line-clamp-3 min-h-15 text-sm">
          {t(`${tool.name}.description`)}
        </p>
      </Link>
      <tool.icon
        aria-hidden
        strokeWidth={1.5}
        className="text-primary/20 group-hover:text-primary/35 pointer-events-none absolute -right-3 -bottom-3 z-0 size-24 -rotate-12 transition-colors"
      />
      <FavoriteButton
        tool={tool}
        className="absolute top-2 right-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 has-[.fill-amber-400]:opacity-100"
      />
    </Card>
  )
}
