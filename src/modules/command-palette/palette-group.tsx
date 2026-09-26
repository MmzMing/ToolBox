import type { ReactNode } from 'react'

import { CommandGroup } from '@/components/ui/command'

interface PaletteGroupProps {
  title: string
  count: number
  children: ReactNode
}

/** 分组标题样式：小一号的浅色标签，压在卡片网格上方 */
const groupClass =
  'px-0 py-0 **:[[cmdk-group-heading]]:text-muted-foreground **:[[cmdk-group-heading]]:px-0 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:text-sm **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:pb-1.5'

/** 面板分组：「分类名 (数量)」标题 + 随弹窗宽度递增列数的卡片网格 */
export function PaletteGroup({ title, count, children }: PaletteGroupProps) {
  return (
    <CommandGroup
      heading={
        <>
          {title}
          <span className="text-muted-foreground/70 ml-1 font-normal">({count})</span>
        </>
      }
      className={groupClass}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </CommandGroup>
  )
}
