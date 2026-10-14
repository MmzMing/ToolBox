import type { ComponentType, SVGProps } from 'react'

import { BookOpen, Clapperboard, Code2, Images, Type } from 'lucide-react'

import { CategoryCryptoIcon } from '@/components/icons/category-crypto-icon'
import { CategoryLifeIcon } from '@/components/icons/category-life-icon'
import { CategoryResumeIcon } from '@/components/icons/category-resume-icon'
import { CategoryWebIcon } from '@/components/icons/category-web-icon'

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

/** 分类图标：lucide 或 src/components/icons/ 下的自绘 SVG（约定见 AGENTS.md §6） */
export const categoryIcons: Record<CategoryKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  resume: CategoryResumeIcon,
  crypto: CategoryCryptoIcon,
  web: CategoryWebIcon,
  images: Images,
  video: Clapperboard,
  development: Code2,
  cheatsheet: BookOpen,
  text: Type,
  life: CategoryLifeIcon,
}

/**
 * 分类没有独立路由，页脚的分类入口统一走首页的 `/?category=<key>`：
 * CircuitBoard 读到合法值就点亮对应芯片，非法值一律当没填。
 */
export const CATEGORY_PARAM = 'category'

export function resolveCategoryParam(raw: string | null | undefined): CategoryKey | null {
  return categoryKeys.find((category) => category === raw) ?? null
}
