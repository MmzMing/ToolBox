/**
 * 带悬浮说明的按钮。
 *
 * Radix Tooltip 在按钮拿到焦点时就会展开，而鼠标点击会把焦点留在按钮上，
 * 于是"点完提示就一直挂着"。这里只在 mouse 指针按下时阻止默认（只挡聚焦，
 * click 照常派发），触屏不拦——拦了会把移动端的一次点击整个吃掉。
 */
import type { ComponentProps, PointerEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type TipButtonProps = Omit<ComponentProps<typeof Button>, 'title'> & {
  tip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function TipButton({ tip, side = 'bottom', onPointerDown, ...rest }: TipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={tip}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
            if (e.pointerType === 'mouse') e.preventDefault()
            onPointerDown?.(e)
          }}
          {...rest}
        />
      </TooltipTrigger>
      <TooltipContent side={side}>{tip}</TooltipContent>
    </Tooltip>
  )
}
