import { LayoutGrid } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { dockItemClass } from '@/components/pill-styles'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { DOCK_HANDLE_RETRACT_DELAY_MS, DOCK_HANDLE_RETRACT_X } from '@/layouts/app-shell/dock-logic'
import { motionTokens } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'

/** 折叠键贴的这条边：桌面档是左侧图标条，手机档是底部 dock 折到右下边缘 */
type DockHandleSide = 'left' | 'right'

type DockHandleProps = {
  label: string
  onExpand: () => void
  side?: DockHandleSide
}

/**
 * dock 折叠后留在边缘的那颗按钮：静止时自动缩进视窗，只露半个球；
 * 悬停立刻滑出成完整按钮，移开 1s 后才收回，避免横向掠过边缘时来回抖动。
 * 触屏没有悬停，所以收回侧垫一块透明命中区，半截球也点得动。
 */
export function DockHandle({ label, onExpand, side = 'left' }: DockHandleProps) {
  const reduced = usePrefersReducedMotion()
  const [retracted, setRetracted] = useState(false)
  const retractTimer = useRef<number | null>(null)

  const cancelRetract = useCallback(() => {
    if (retractTimer.current === null) {
      return
    }
    window.clearTimeout(retractTimer.current)
    retractTimer.current = null
  }, [])

  const scheduleRetract = useCallback(() => {
    cancelRetract()
    retractTimer.current = window.setTimeout(() => {
      retractTimer.current = null
      setRetracted(true)
    }, DOCK_HANDLE_RETRACT_DELAY_MS)
  }, [cancelRetract])

  const extend = useCallback(() => {
    cancelRetract()
    setRetracted(false)
  }, [cancelRetract])

  // 刚折下来时先完整露出，停手一秒再收回半截，用户才知道图标条变成了这颗键。
  // 关了动效就常驻完整可见——半截收起本身是一种动效，不该在 reduced 下偷偷跑。
  useEffect(() => {
    if (!reduced) {
      scheduleRetract()
    }
    return cancelRetract
  }, [cancelRetract, reduced, scheduleRetract])

  return (
    <motion.button
      type="button"
      data-tour="dock"
      aria-label={label}
      onClick={onExpand}
      onPointerEnter={extend}
      onPointerLeave={reduced ? undefined : scheduleRetract}
      // 键盘 Tab 进来的是半截按钮，看不清也难点中，与悬停同样处理
      onFocus={extend}
      animate={{
        x: retracted ? (side === 'left' ? DOCK_HANDLE_RETRACT_X : -DOCK_HANDLE_RETRACT_X) : 0,
      }}
      transition={reduced ? { duration: 0 } : motionTokens.spring.shell}
      className={cn(
        dockItemClass(false, 'accent'),
        'bg-dock text-dock-foreground shadow-dock backdrop-blur-dock pointer-events-auto',
        'before:absolute before:inset-y-0 before:w-6 before:content-[""]',
        side === 'left' ? 'before:-right-6' : 'before:-left-6',
      )}
    >
      <LayoutGrid className="size-5" />
    </motion.button>
  )
}
