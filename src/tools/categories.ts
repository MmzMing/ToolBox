import { BookOpen, Code2, Earth, Images, LifeBuoy, Lock, Repeat2, Sigma, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 分类 key 顺序即侧栏/首页展示顺序，展示名走 i18n：`categories.<key>` */
export const categoryKeys = [
  'crypto',
  'converter',
  'web',
  'images',
  'development',
  'cheatsheet',
  'math',
  'text',
  'life',
] as const

export type CategoryKey = (typeof categoryKeys)[number]

export const categoryIcons: Record<CategoryKey, LucideIcon> = {
  crypto: Lock,
  converter: Repeat2,
  web: Earth,
  images: Images,
  development: Code2,
  cheatsheet: BookOpen,
  math: Sigma,
  text: Type,
  life: LifeBuoy,
}
