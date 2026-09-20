import { createContext, useContext } from 'react'

import type { MenuSection } from '../types'

export type TemplateContextValue = {
  templateId: string
  menuSections: MenuSection[]
}

/**
 * 模板内各处要按当前模板与章节顺序取标题，逐层传 props 会污染 9 套模板的每个 section。
 *
 * Provider 由 TemplateSurface 直接渲染；这里只放 context 与读取钩子，
 * 组件与函数不同文件导出是为了保住 react-refresh（AGENTS.md §6 的既有约定）。
 */
export const TemplateContext = createContext<TemplateContextValue | undefined>(undefined)

export function useTemplateContext(): TemplateContextValue | undefined {
  return useContext(TemplateContext)
}
