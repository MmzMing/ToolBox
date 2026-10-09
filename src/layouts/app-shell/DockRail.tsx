import type { KeyboardEvent } from 'react'

import { dockItemKey, nextFocusIndex } from '@/layouts/app-shell/dock-logic'
import type { DockItem } from '@/layouts/app-shell/dock-logic'
import type { CategoryKey } from '@/tools/categories'
import { DockButton } from '@/layouts/app-shell/DockButton'
import { cn } from '@/lib/utils'

type DockRailProps = {
  items: readonly DockItem[]
  label: string
  activeKey: string | null
  expandedKey: CategoryKey | null
  onActivate: (item: DockItem) => void
  /** 鼠标移到某颗键上就更新预览；移到首页键传回 home，由调用方决定收起 */
  onHover: (item: DockItem) => void
  registerItem: (key: string, node: HTMLElement | null) => void
  focusItem: (key: string) => void
  className?: string
}

/**
 * 桌面与平板档的左侧图标条：首页 + 全部分类，纵向悬浮胶囊。
 *
 * 键盘按 W3C toolbar 模式做 roving tabindex——整条 dock 只占一个 Tab 站点，
 * 进出后用方向键在键位之间移动，避免 10 个键把 Tab 序列拉得很长。
 */
export function DockRail({
  items,
  label,
  activeKey,
  expandedKey,
  onActivate,
  onHover,
  registerItem,
  focusItem,
  className,
}: DockRailProps) {
  // 没有任何高亮键时把 Tab 入口落在第一个键，否则整条 dock 会脱离键盘序列
  const first = items[0]
  const focusKey = activeKey ?? (first === undefined ? null : dockItemKey(first))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => dockItemKey(item) === focusKey)
    const next = nextFocusIndex({
      index: index === -1 ? 0 : index,
      total: items.length,
      key: event.key,
      orientation: 'vertical',
    })
    if (next === null) {
      return
    }
    event.preventDefault()
    const target = items[next]
    if (target !== undefined) {
      focusItem(dockItemKey(target))
    }
  }

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn(
        // 无边框：整条 dock 只靠玻璃底 + 阴影浮起来，描边会在暗色下发脏
        'bg-dock text-dock-foreground shadow-dock inset-scrollbar backdrop-blur-dock flex max-h-[calc(100svh-2rem)] flex-col gap-1 overflow-y-auto rounded-4xl p-1.5',
        className,
      )}
    >
      {items.map((item) => {
        const key = dockItemKey(item)
        const isHome = item.kind === 'home'
        return (
          <DockButton
            key={key}
            label={item.label}
            icon={item.icon}
            href={isHome ? item.href : undefined}
            active={key === activeKey}
            expanded={isHome ? undefined : item.key === expandedKey}
            withTooltip={isHome}
            tabIndex={key === focusKey ? 0 : -1}
            onActivate={() => onActivate(item)}
            onHover={() => onHover(item)}
            onNode={(node) => registerItem(key, node)}
          />
        )
      })}
    </div>
  )
}
