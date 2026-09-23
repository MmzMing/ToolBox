import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { FavoriteButton } from '@/components/favorite-button'
import { DocumentMeta } from '@/modules/seo/document-meta'
import type { Tool } from '@/tools/define-tool'

interface ToolLayoutProps {
  tool: Tool
  children: ReactNode
  /** 整页沉浸式：高度链打通到视口，页内自管滚动区 */
  fill?: boolean
}

/** 工具页统一骨架：图标 + 标题 + 收藏星标 + 描述 + 内容区 */
export function ToolLayout({ tool, children, fill = false }: ToolLayoutProps) {
  const { t } = useTranslation(`tools-${tool.category}`)
  const title = t(`${tool.name}.title`)
  const description = t(`${tool.name}.description`)

  const head = (
    <>
      <DocumentMeta
        title={`${title} · ToolBox`}
        description={description}
        keywords={tool.keywords}
      />
      <header className="flex shrink-0 items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <tool.icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-xl font-semibold md:text-2xl">{title}</h1>
        </div>
        <FavoriteButton tool={tool} />
      </header>
    </>
  )

  if (fill) {
    // 沉浸式工具自管页面头部与留白（画布类要贴边，卡片网格类自己加 padding），
    // 这里只给 SEO 与打通到视口的高度链
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <DocumentMeta
          title={`${title} · ToolBox`}
          description={description}
          keywords={tool.keywords}
        />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {head}
      <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </div>
  )
}
