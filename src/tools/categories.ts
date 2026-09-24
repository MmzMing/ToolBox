import {
  BookOpen,
  Clapperboard,
  Code2,
  Earth,
  IdCard,
  Images,
  LifeBuoy,
  Lock,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 分类 key 顺序即侧栏/首页展示顺序，展示名走 i18n：`categories.<key>` */
export const categoryKeys = [
  'resume',
  'crypto',
  'web',
  'images',
  'video',
  'development',
  'cheatsheet',
  'text',
  'life',
] as const

export type CategoryKey = (typeof categoryKeys)[number]

export const categoryIcons: Record<CategoryKey, LucideIcon> = {
  resume: IdCard,
  crypto: Lock,
  web: Earth,
  images: Images,
  video: Clapperboard,
  development: Code2,
  cheatsheet: BookOpen,
  text: Type,
  life: LifeBuoy,
}
