import { dataTools } from './data'
import { isRecentTool, type DefinedTool, type Tool } from './define-tool'
import type { CategoryKey } from './categories'
import type { RecentToolEntry } from '@/stores/tools.store'

import { cryptoTools } from './crypto'
import { converterTools } from './converter'
import { developmentTools } from './development'
import { imagesTools } from './images'
import { mathTools } from './math'
import { measurementTools } from './measurement'
import { networkTools } from './network'
import { textTools } from './text'
import { webTools } from './web'

export interface ToolCategory {
  readonly category: CategoryKey
  readonly tools: readonly Tool[]
}

function attachCategory(category: CategoryKey, rawTools: readonly DefinedTool[]): readonly Tool[] {
  return rawTools.map((tool) => ({ ...tool, isNew: isRecentTool(tool), category }))
}

/**
 * 工具注册中心（按分类聚合）。新增工具：在对应分类目录下建四件套，
 * 并把 import 加入该分类的 index.ts（或用 `pnpm create:tool` 脚手架）。
 */
export const toolsByCategory: readonly ToolCategory[] = [
  { category: 'crypto', tools: attachCategory('crypto', cryptoTools) },
  { category: 'converter', tools: attachCategory('converter', converterTools) },
  { category: 'web', tools: attachCategory('web', webTools) },
  { category: 'development', tools: attachCategory('development', developmentTools) },
  { category: 'images', tools: attachCategory('images', imagesTools) },
  { category: 'network', tools: attachCategory('network', networkTools) },
  { category: 'math', tools: attachCategory('math', mathTools) },
  { category: 'measurement', tools: attachCategory('measurement', measurementTools) },
  { category: 'text', tools: attachCategory('text', textTools) },
  { category: 'data', tools: attachCategory('data', dataTools) },
]

export const tools: readonly Tool[] = toolsByCategory.flatMap((group) => group.tools)

export function getToolByPath(path: string): Tool | undefined {
  return tools.find((tool) => tool.path === path)
}

/** 按收藏顺序解析工具列表（跳过已失效的路径，localStorage 数据可能滞后） */
export function getFavoriteTools(favoritePaths: readonly string[]): Tool[] {
  return favoritePaths
    .map((path) => getToolByPath(path))
    .filter((tool): tool is Tool => Boolean(tool))
}

/** 最近使用：按使用次数与最后使用时间排序取前 N 个 */
export function getRecentTools(recent: readonly RecentToolEntry[], limit = 8): Tool[] {
  return [...recent]
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit)
    .map((entry) => getToolByPath(entry.path))
    .filter((tool): tool is Tool => Boolean(tool))
}
