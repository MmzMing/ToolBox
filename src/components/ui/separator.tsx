import * as React from 'react'
import { cn } from 'cn'
import { Separator as SeparatorPrimitive } from 'radix-ui'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        // Radix 写的是 data-orientation，选择器必须写全；原来的 `data-vertical:` 匹配的是
        // data-vertical 属性，永远不命中，导致竖向分隔线宽度为 0（全站在 14 处隐形分割线）。
        // 这里刻意不给 self-stretch：调用方都带 h-5/h-6 确定高度，而 stretch 遇到确定高度会
        // 退化成 flex-start，把竖线顶到容器上沿；交给父级 flex 的 items-center 居中。
        'bg-border shrink-0 border-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
