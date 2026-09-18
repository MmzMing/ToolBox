import {
  Code2,
  Database,
  Earth,
  Images,
  Lock,
  Network,
  Ruler,
  Sigma,
  Repeat2,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 分类 key 顺序即侧栏/首页展示顺序，展示名走 i18n：`categories.<key>` */
export const categoryKeys = [
  'crypto',
  'converter',
  'web',
  'images',
  'development',
  'network',
  'math',
  'measurement',
  'text',
  'data',
] as const

export type CategoryKey = (typeof categoryKeys)[number]

export const categoryIcons: Record<CategoryKey, LucideIcon> = {
  crypto: Lock,
  converter: Repeat2,
  web: Earth,
  images: Images,
  development: Code2,
  network: Network,
  math: Sigma,
  measurement: Ruler,
  text: Type,
  data: Database,
}
