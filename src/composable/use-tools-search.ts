import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Fuse from 'fuse.js'

import type { Tool } from '@/tools/define-tool'
import { toolsByCategory } from '@/tools'

export interface ToolSearchItem {
  tool: Tool
  /** 当前语言标题 */
  title: string
  /** 另一语言标题（跨语言搜索，中文用户也能搜英文关键词） */
  altTitle: string
  description: string
  keywords: string[]
}

function otherLocale(locale: 'zh' | 'en'): 'zh' | 'en' {
  return locale === 'zh' ? 'en' : 'zh'
}

/** 全量可搜索工具条目（当前语言 + 另一语言标题 + 关键词），随语言切换重建 */
export function useToolSearchItems(): ToolSearchItem[] {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh'
  const alt = otherLocale(locale)

  return useMemo(
    () =>
      toolsByCategory.flatMap(({ tools }) =>
        tools.map((tool) => ({
          tool,
          title: i18n.t(`${tool.name}.title`, { ns: `tools-${tool.category}`, lng: locale }),
          altTitle: i18n.t(`${tool.name}.title`, { ns: `tools-${tool.category}`, lng: alt }),
          description: i18n.t(`${tool.name}.description`, {
            ns: `tools-${tool.category}`,
            lng: locale,
          }),
          keywords: tool.keywords,
        })),
      ),
    [i18n, locale, alt],
  )
}

export function createToolsFuse(items: ToolSearchItem[]): Fuse<ToolSearchItem> {
  return new Fuse(items, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'altTitle', weight: 1.5 },
      { name: 'keywords', weight: 1 },
      { name: 'tool.name', weight: 1 },
      { name: 'description', weight: 0.5 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  })
}
