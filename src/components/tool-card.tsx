import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import { FavoriteButton } from '@/components/favorite-button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { Tool } from '@/tools/define-tool'

interface ToolCardProps {
  tool: Tool
}

/** 首页/搜索结果里的工具卡片 */
export function ToolCard({ tool }: ToolCardProps) {
  const { t } = useTranslation(`tools-${tool.category}`)

  return (
    <Card className="group relative overflow-hidden p-4 transition-all hover:border-primary/40 hover:shadow-sm">
      <Link to={tool.path} className="flex flex-col gap-2 outline-none">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <tool.icon className="size-5" />
          </span>
          <h3 className="truncate text-sm font-semibold md:text-base">{t(`${tool.name}.title`)}</h3>
          {tool.isNew && <Badge className="ml-auto shrink-0">NEW</Badge>}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{t(`${tool.name}.description`)}</p>
      </Link>
      <FavoriteButton tool={tool} className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 has-[.fill-amber-400]:opacity-100" />
    </Card>
  )
}
