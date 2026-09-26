import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { CategoryKey } from './categories'

/** 新工具标记窗口期：创建 14 天内显示 NEW 徽标 */
const NEW_TOOL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/**
 * 工具定义（注册前）。分类由所在分类目录的 index.ts 统一挂载，
 * 工具自身不声明 category（单一事实源原则，见 agent.md §7）。
 */
export interface RawTool {
  /** 工具唯一标识 = 目录名 = 路由 path 去斜杠 */
  readonly name: string
  /** 路由路径，如 '/hash-text' */
  readonly path: string
  /** 搜索关键词（中英文混合），用于 Command Palette 模糊搜索 */
  readonly keywords: string[]
  readonly icon: LucideIcon
  /** 组件加载器，组件需 default export：() => import('./HashText') */
  readonly component: () => Promise<{ default: ComponentType }>
  /** ISO 创建日期（YYYY-MM-DD），两周内自动标记 isNew */
  readonly createdAt?: string
  /** 聊天式整页工具：内容区撑满剩余高度、页内自管滚动（如 AI 生图） */
  readonly immersive?: boolean
  /** 宽版工作台：内容区放宽到 screen-2xl（左右分栏 + 大量操作按钮的工具） */
  readonly wide?: boolean
  /** 旧路径重定向（v1 起保留机制） */
  readonly redirectFrom?: string[]
}

/** defineTool 的产物：在模块作用域一次性创建 lazy 组件（禁止渲染期创建，react-hooks/static-components） */
export interface DefinedTool extends RawTool {
  readonly lazyComponent: LazyExoticComponent<ComponentType>
}

/** 挂载分类与 isNew 后的完整工具对象 */
export interface Tool extends DefinedTool {
  readonly isNew: boolean
  readonly category: CategoryKey
}

/**
 * 定义一个工具。i18n 约定：命名空间 `tools-<category>`，
 * 键 `<name>.title` / `<name>.description`。
 */
export function defineTool(definition: RawTool): DefinedTool {
  return { ...definition, lazyComponent: lazy(definition.component) }
}

export function isRecentTool(tool: RawTool, now: number = Date.now()): boolean {
  if (!tool.createdAt) {
    return false
  }
  const created = new Date(tool.createdAt).getTime()
  return Number.isFinite(created) && now - created < NEW_TOOL_WINDOW_MS
}
