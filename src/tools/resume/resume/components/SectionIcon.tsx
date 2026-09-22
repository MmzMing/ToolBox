import { icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createElement } from 'react'

/**
 * 章节图标。
 *
 * `MenuSection.icon` 存的是 lucide 的导出名（与字段图标选择器同一套命名）。
 * 旧项目遗留的 emoji 在 normalizeResume 阶段就已换算成导出名，
 * 这里的兜底只负责名字不存在于 lucide 的情况（手改数据、未来改名）。
 */
export function SectionIcon({ name, className }: { name: string; className?: string }) {
  const icon = (name && name in icons ? icons[name as keyof typeof icons] : undefined) as
    LucideIcon | undefined

  return createElement(icon ?? icons.FileText, { className })
}
