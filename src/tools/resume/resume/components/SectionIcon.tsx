import { icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createElement } from 'react'

/**
 * 章节图标。
 *
 * `MenuSection.icon` 存的是 lucide 的导出名（与字段图标选择器同一套命名）；
 * 旧项目遗留的 emoji 不是合法导出名，落到兜底图标。
 */
export function SectionIcon({ name, className }: { name: string; className?: string }) {
  const icon = (name && name in icons ? icons[name as keyof typeof icons] : undefined) as
    LucideIcon | undefined

  return createElement(icon ?? icons.FileText, { className })
}
