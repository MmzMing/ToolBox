import { LayoutGrid } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { dockItemClass } from '@/components/pill-styles'
import { DOCK_HANDLE_RETRACT_DELAY_MS, DOCK_HANDLE_RETRACT_X } from '@/layouts/app-shell/dock-logic'
import { cn } from '@/lib/utils'

/** 与图标条同一套 spring：折下去与滑出来要读作同一个动作 */
const handleSpring = { type: 'spring' as const, duration: 0.42, bounce: 0.18 }

type DockHandleProps = {
  label: string
  onExpand: () => void
}

/**
 * dock 折叠后留在左边缘、垂直居中的那颗按钮：静止时自动缩进视窗，只露半个球；
 * 悬停立刻滑出成完整按钮，移开 1s 后才收回，避免横向掠过左边缘时来回抖动。
 */
export function DockHandle({ label, onExpand }: DockHandleProps) {
  const reducedMotion = useReducedMotion() === true
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
  // 关了动效就常驻完整可见——半截收起本身是一种动效，不该在 reducedMotion 下偷偷跑。
  useEffect(() => {
    if (!reducedMotion) {
      scheduleRetract()
    }
    return cancelRetract
  }, [cancelRetract, reducedMotion, scheduleRetract])

  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onExpand}
      onPointerEnter={extend}
      onPointerLeave={reducedMotion ? undefined : scheduleRetract}
      // 键盘 Tab 进来的是半截按钮，看不清也难点中，与悬停同样处理
      onFocus={extend}
      animate={{ x: retracted ? DOCK_HANDLE_RETRACT_X : 0 }}
      transition={reducedMotion ? { duration: 0 } : handleSpring}
      className={cn(
        dockItemClass(false, 'accent'),
        'bg-dock text-dock-foreground shadow-dock backdrop-blur-dock pointer-events-auto',
      )}
    >
      <LayoutGrid className="size-5" />
    </motion.button>
  )
}
