import { cn } from '@/lib/utils'

/**
 * 悬浮层胶囊的共享类名。
 *
 * 放在 components 层是因为顶栏胶囊、左侧 dock 键位、手机底部 dock 与语言/主题下拉
 * 都要用同一套外观；layouts 层的样式常量不能让 components 反向 import。
 */

/** 胶囊本体：无边框、纯背景、44px 高。`group` 供文字段响应悬停/聚焦/展开 */
export const pillClass =
  'bg-dock text-dock-foreground/85 hover:text-dock-foreground shadow-dock focus-visible:ring-dock-accent group inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border-0 px-3 text-sm outline-none backdrop-blur-dock transition-colors duration-200 hover:no-underline focus-visible:ring-2 motion-reduce:transition-none'

/**
 * dock 键位：44px 圆形触控目标，选中态用中性灰底、绿色只留给图标本身，
 * 否则整条 dock 会跳。
 *
 * 悬停色调必须二选一：两条 `hover:text-*` / `hover:bg-*` 权重相同，
 * 调用方再叠一个 `hover:text-dock-accent` 盖不住（Tailwind 生成顺序里灰色那条在后面）。
 */
export function dockItemClass(
  active: boolean,
  hoverTone: 'neutral' | 'accent' = 'neutral',
): string {
  return cn(
    'text-dock-foreground/70 focus-visible:ring-dock-accent relative flex size-11 shrink-0 items-center justify-center rounded-full no-underline outline-none focus-visible:ring-2',
    hoverTone === 'accent'
      ? 'hover:bg-dock-accent/15 hover:text-dock-accent'
      : 'hover:bg-foreground/10 hover:text-dock-foreground',
    'transition-[background-color,color] duration-200 motion-reduce:transition-none',
    active && 'bg-foreground/15 text-dock-accent',
  )
}

/** 语言与主题下拉要长得和 dock 键位一样，把常态那一档开放给它们复用 */
export const dockButtonClass = dockItemClass(false)

/**
 * 手机底部 dock 里的语言/主题：复用 ActionPill 的骨架，
 * 但必须剥掉自带的一层玻璃与阴影，否则 dock 里会出现"胶囊套胶囊"的双层底。
 */
export const dockPillClass = cn(
  dockButtonClass,
  'bg-transparent px-0 shadow-none backdrop-blur-none',
)
