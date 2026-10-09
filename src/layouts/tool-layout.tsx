import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyLinkButton } from '@/components/copy-link-button'
import { FavoriteButton } from '@/components/favorite-button'
import { absoluteUrl } from '@/config/site'
import { cn } from '@/lib/utils'
import { DocumentMeta } from '@/modules/seo/document-meta'
import { JsonLd } from '@/modules/seo/json-ld'
import { breadcrumbSchema, toolSchema } from '@/modules/seo/schema'
import type { Tool } from '@/tools/define-tool'

interface ToolLayoutProps {
  tool: Tool
  children: ReactNode
  /** 整页沉浸式：高度链打通到视口，页内自管滚动区 */
  fill?: boolean
  /** 宽版工作台：内容区放宽到 screen-2xl */
  wide?: boolean
}

/** 工具页统一骨架：图标 + 标题 + 收藏星标 + 描述 + 内容区 */
export function ToolLayout({ tool, children, fill = false, wide = false }: ToolLayoutProps) {
  const { t } = useTranslation(`tools-${tool.category}`)
  const { t: tCommon } = useTranslation('common')
  const title = t(`${tool.name}.title`)
  const description = t(`${tool.name}.description`)

  // SEO 标签与可见头部拆开：两个分支共用同一份 meta，扩字段不会漏改
  const meta = (
    <>
      {/* 品牌后缀随界面语言走：英文页拼中文品牌是错配信号，也会被 Google 改写标题 */}
      <DocumentMeta
        title={`${title} · ${tCommon('siteName')}`}
        description={description}
        keywords={tool.keywords}
        path={tool.path}
      />
      {/* 面包屑只两级：首页与工具页都是真实可访问 URL（首页没有按分类的锚点） */}
      <JsonLd
        data={[
          toolSchema({ title, description, path: tool.path }),
          breadcrumbSchema([
            { name: tCommon('breadcrumbHome'), url: absoluteUrl('/') },
            { name: title, url: absoluteUrl(tool.path) },
          ]),
        ]}
      />
    </>
  )

  const header = (
    <header className="flex shrink-0 items-center gap-3">
      <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
        <tool.icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate text-xl font-semibold md:text-2xl">{title}</h1>
      </div>
      <FavoriteButton tool={tool} />
      <CopyLinkButton path={tool.path} />
    </header>
  )

  if (fill) {
    // 沉浸式工具自管页面头部与留白（画布类要贴边，卡片网格类自己加 padding），
    // 这里只给 SEO（无可见头部）与打通到视口的高度链——app-shell 的 `<main>` 有确定
    // 高度，所以 `h-full` 现在真的能铺满。
    // sr-only 的 h1 不能省：整页式工具没有可见标题，缺 H1 就等于缺页面主题。
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        {meta}
        <h1 className="sr-only">{title}</h1>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    )
  }

  return (
    <div className={cn('mx-auto w-full px-4 py-6', wide ? 'max-w-screen-2xl' : 'max-w-6xl')}>
      {meta}
      {header}
      <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </div>
  )
}
