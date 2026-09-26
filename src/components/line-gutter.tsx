import { memo, type Ref } from 'react'

import { cn } from '@/lib/utils'

interface LineGutterProps {
  /** 行数（至少 1，空内容也显示首行号） */
  count: number
  innerRef: Ref<HTMLDivElement>
  className?: string
}

/**
 * 只读行号列。行高用与内容区相同的 `text-sm leading-relaxed` 撑出，
 * 数字本身缩到 text-xs，保证逐行对齐不会因为行高差异累积错位。
 *
 * memo 是必要的：行数上千时这里会渲染上千个 div，父组件每次输入都重建一遍会明显掉帧。
 */
export const LineGutter = memo(function LineGutter({
  count,
  innerRef,
  className,
}: LineGutterProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-muted/40 border-border text-muted-foreground w-10 shrink-0 overflow-hidden border-r text-right',
        className,
      )}
    >
      <div ref={innerRef} className="pt-3 text-sm leading-relaxed">
        {Array.from({ length: Math.max(count, 1) }, (_, index) => (
          <div key={index} className="pr-2">
            <span className="text-xs">{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
})
