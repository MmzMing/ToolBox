import { Palette, Rows3, SlidersHorizontal, Type } from 'lucide-react'

/** 样式工作区的分组：操作栏「样式」层的锚点按钮与编辑区分组共用这份顺序 */
export const STYLE_GROUPS = [
  { key: 'theme', labelKey: 'resume.dock.theme', icon: Palette },
  { key: 'typography', labelKey: 'resume.dock.typography', icon: Type },
  { key: 'spacing', labelKey: 'resume.dock.spacing', icon: Rows3 },
  { key: 'mode', labelKey: 'resume.dock.mode', icon: SlidersHorizontal },
] as const

export type StyleGroupKey = (typeof STYLE_GROUPS)[number]['key']

export const styleAnchorId = (key: StyleGroupKey) => `resume-style-${key}`
