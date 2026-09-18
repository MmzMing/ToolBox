import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { FavoriteButton } from '@/components/favorite-button'
import { Badge } from '@/components/ui/badge'
import { DocumentMeta } from '@/modules/seo/document-meta'
import type { Tool } from '@/tools/define-tool'

interface ToolLayoutProps {
  tool: Tool
  children: ReactNode
}

/** 工具页统一骨架：图标 + 标题 + 收藏星标 + 描述 + 内容区 */
export function ToolLayout({ tool, children }: ToolLayoutProps) {
  const { t } = useTranslation(`tools-${tool.category}`)
  const title = t(`${tool.name}.title`)
  const description = t(`${tool.name}.description`)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <DocumentMeta title={`${title} · ToolBox`} description={description} keywords={tool.keywords} />

      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <tool.icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{title}</h1>
          {tool.isNew && <Badge className="shrink-0">NEW</Badge>}
        </div>
        <FavoriteButton tool={tool} />
      </header>

      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </div>
  )
}
