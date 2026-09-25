import {
  BookOpen,
  Clapperboard,
  Code2,
  Earth,
  IdCard,
  Images,
  House,
  Lock,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 分类展示顺序的唯一真相：侧栏、首页与命令面板都按这里排（见 tools/index.ts） */
export const categoryKeys = [
  'resume',
  'images',
  'video',
  'crypto',
  'web',
  'development',
  'text',
  'life',
  'cheatsheet',
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
  life: House,
}
