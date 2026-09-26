import { ArrowUpRight } from 'lucide-react'
import { Command as CommandPrimitive } from 'cmdk'
import { useTranslation } from 'react-i18next'

import { FavoriteButton } from '@/components/favorite-button'
import type { Tool } from '@/tools/define-tool'
import { cn } from '@/lib/utils'

interface PaletteToolCardProps {
  /** cmdk 内唯一值，收藏/最近分组用前缀避免与分类分组重复 */
  value: string
  tool: Tool
  /** 键盘选中态；鼠标悬停的反色交给 CSS hover，指针移开就消失 */
  active: boolean
  onOpen: (path: string) => void
}

/** 命令面板里的紧凑工具卡片：图标 + 标题 + 跳转箭头 + 收藏星标，选中态整块反色 */
export function PaletteToolCard({ value, tool, active, onOpen }: PaletteToolCardProps) {
  const { t: tTool } = useTranslation(`tools-${tool.category}`)
  const Icon = tool.icon

  return (
    <CommandPrimitive.Item
      value={value}
      data-slot="palette-tool-card"
      onSelect={() => onOpen(tool.path)}
      className={cn(
        'group/card border-input/50 bg-card hover:border-primary hover:bg-primary hover:text-primary-foreground',
        'flex cursor-default items-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-sm outline-hidden transition-colors select-none',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        active && 'border-primary bg-primary text-primary-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          active
            ? 'text-primary-foreground'
            : 'text-primary group-hover/card:text-primary-foreground',
        )}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{tTool(`${tool.name}.title`)}</span>
      <ArrowUpRight
        aria-hidden
        className={cn(
          'size-4 shrink-0 transition-opacity',
          active ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100',
        )}
      />
      {/* 星标不能成为独立 Tab 停靠点：面板里卡片成百上千，Tab 会逐个跳过 */}
      <FavoriteButton
        tool={tool}
        tabIndex={-1}
        className="hover:bg-primary-foreground/15 -mr-1.5 size-6"
      />
    </CommandPrimitive.Item>
  )
}

interface PaletteToolCardsProps {
  tools: readonly Tool[]
  /** 同一工具可能出现在多个分组（收藏/最近 + 分类），加前缀保证 cmdk value 唯一 */
  valuePrefix?: string
  /** 键盘选中项；null 表示当前高亮交给鼠标悬停，不额外点亮任何卡片 */
  activeValue: string | null
  onOpen: (path: string) => void
}

/** 卡片列表，放在 PaletteGroup 的网格容器里 */
export function PaletteToolCards({
  tools,
  valuePrefix = '',
  activeValue,
  onOpen,
}: PaletteToolCardsProps) {
  return (
    <>
      {tools.map((tool) => {
        const value = `${valuePrefix}${tool.path}`
        return (
          <PaletteToolCard
            key={value}
            value={value}
            tool={tool}
            active={activeValue === value}
            onOpen={onOpen}
          />
        )
      })}
    </>
  )
}
