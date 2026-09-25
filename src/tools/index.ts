import { isRecentTool, type DefinedTool, type Tool } from './define-tool'
import { categoryKeys, type CategoryKey } from './categories'
import type { RecentToolEntry } from '@/stores/tools.store'

import { cryptoTools } from './crypto'
import { cheatsheetTools } from './cheatsheet'
import { developmentTools } from './development'
import { imagesTools } from './images'
import { videoTools } from './video'
import { resumeTools } from './resume'
import { textTools } from './text'
import { lifeTools } from './life'
import { webTools } from './web'

export interface ToolCategory {
  readonly category: CategoryKey
  readonly tools: readonly Tool[]
}

function attachCategory(category: CategoryKey, rawTools: readonly DefinedTool[]): readonly Tool[] {
  return rawTools.map((tool) => ({ ...tool, isNew: isRecentTool(tool), category }))
}

/** 每个分类的工具清单；新增工具只往对应分类的 index.ts 里注册，不碰这里 */
const toolsOfCategory: Record<CategoryKey, readonly DefinedTool[]> = {
  resume: resumeTools,
  crypto: cryptoTools,
  web: webTools,
  images: imagesTools,
  video: videoTools,
  development: developmentTools,
  cheatsheet: cheatsheetTools,
  text: textTools,
  life: lifeTools,
}

/**
 * 工具注册中心（按分类聚合）。顺序跟着 categoryKeys 走，不再另列一份，
 * 否则改排序要同时动两处（此前就已经对不上了）。
 */
export const toolsByCategory: readonly ToolCategory[] = categoryKeys.map((category) => ({
  category,
  tools: attachCategory(category, toolsOfCategory[category]),
}))

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
