import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { placeBubble, type Box, type BubbleSide } from './orb-bubble-placement'
import { cn } from '@/lib/utils'

const SIDE_CLASS: Record<BubbleSide, string> = {
  top: 'bottom-full left-1/2 mb-3.5',
  bottom: 'top-full left-1/2 mt-3.5',
  left: 'right-full top-1/2 mr-3.5',
  right: 'left-full top-1/2 ml-3.5',
}

/**
 * 箭头：一颗转 45° 的方块，只描朝外的两条边，另两条被气泡本体盖住。
 * 交叉轴上的位置由 `placement.arrow` 单独给（气泡自己会被挤开，居中就指不到球了），
 * 所以这里只留朝外的那条边和描边方向。
 */
const ARROW_CLASS: Record<BubbleSide, string> = {
  top: 'bottom-[-5px] -ml-[6px] rotate-45 border-r border-b',
  bottom: 'top-[-5px] -ml-[6px] rotate-45 border-t border-l',
  left: 'right-[-5px] -mt-[6px] rotate-45 border-r border-t',
  right: 'left-[-5px] -mt-[6px] rotate-45 border-l border-b',
}

type OrbBubbleProps = {
  /** 球在视口里的矩形，由调用方算好——球会飞、会被拖，但它的位置本来就在调用方手里 */
  anchor: Box
  children: ReactNode
  className?: string
}

/**
 * 悬浮球的气泡框：单色描边 + 一支箭头，四向自适应翻转。
 *
 * 颜色一律走主题令牌（`bg-popover` / `border-foreground`），所以亮色页是白底黑框、
 * 暗色页是黑底白框，两种都是「黑白」，不需要在这里判断主题、也不写死任何颜色。
 *
 * 位移用上 `marginLeft` / 垂直用上 `marginTop` 而不是 translate：
 * 居中本身已经占了 `-translate-x-1/2`，再叠一层会把居中吃掉。
 */
export function OrbBubble({ anchor, children, className }: OrbBubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) {
      return
    }
    const measure = () => setSize({ width: el.offsetWidth, height: el.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const placement = placeBubble(anchor, size, {
    width: window.innerWidth,
    height: window.innerHeight,
  })
  const horizontal = placement.side === 'top' || placement.side === 'bottom'

  return (
    <div
      ref={ref}
      // 必须挡住：气泡是球的后代，而球的拖拽在 pointerdown 里调 setPointerCapture。
      // 一旦按下落在气泡的按钮上，捕获会把 click 的目标从按钮改成那个祖先，
      // 按钮的 onClick 就永远不会触发（程序化 .click() 绕过指针序列，测不出来）。
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'bg-popover text-popover-foreground absolute z-10 w-max max-w-[min(19rem,calc(100vw-1.5rem))]',
        'border-foreground/25 rounded-2xl border px-4 py-3 shadow-lg',
        'transition-[left,top,right,bottom,margin] duration-300 ease-out',
        SIDE_CLASS[placement.side],
        horizontal ? '-translate-x-1/2' : '-translate-y-1/2',
        className,
      )}
      style={horizontal ? { marginLeft: placement.shift } : { marginTop: placement.shift }}
    >
      <span
        aria-hidden="true"
        // 和气泡本体的 margin 位移同速过渡，两者在视口里正好抵消，球飞的时候箭头不脱节
        className={cn(
          'bg-popover border-foreground/25 absolute size-3',
          'transition-[left,top] duration-300 ease-out',
          ARROW_CLASS[placement.side],
        )}
        style={horizontal ? { left: placement.arrow } : { top: placement.arrow }}
      />
      {children}
    </div>
  )
}
