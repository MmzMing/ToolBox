import { motion, type Transition, type Variants } from 'motion/react'
import { useEffect, useState } from 'react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens } from '@/lib/motion-tokens'

// 生产环境分包多在几十毫秒内就绪，秒切的页面不该闪一下
const SHOW_DELAY_MS = 150
// 进度未知：光头越走越慢、逼近 85% 处悬停，只表达"还在加载"
const TRICKLE_SECONDS = 10
const TRICKLE_AT = 'translateX(85vw)'
// 尾迹最长 32vw，光头越过 100vw + 尾长才算整条离场
const FLY_OUT_AT = 'translateX(135vw)'
const STILL_AT = 'translateX(62vw)'

const trickle: Transition = { duration: TRICKLE_SECONDS, ease: [...motionTokens.ease.enter] }
const fadeIn: Transition = { duration: motionTokens.duration.quick }
const flyOut: Transition = {
  duration: motionTokens.duration.slow,
  ease: [...motionTokens.ease.exit],
}
const fadeOut: Transition = { duration: motionTokens.duration.base }

// 动整串 transform 而不是 x：motion 只把前者交给 WAAPI 走合成器，新页面挂载时主线程再忙也不掉帧
const meteorVariants: Variants = {
  hidden: { transform: 'translateX(0vw)', opacity: 0 },
  loading: {
    transform: TRICKLE_AT,
    opacity: 1,
    transition: { transform: trickle, opacity: fadeIn },
  },
  landed: { transform: FLY_OUT_AT, transition: flyOut },
}

const stillVariants: Variants = {
  hidden: { transform: STILL_AT, opacity: 0 },
  loading: { opacity: 1, transition: fadeIn },
  landed: { opacity: 0, transition: fadeOut },
}

type MeteorLoadingBarProps = {
  /** 在途导航的 location key；null 表示没有在途导航 */
  pendingKey: string | null
}

/** 切页加载条：贴着视窗顶边划过的流星，等待时越飞越慢，页面一提交就冲出右缘 */
export function MeteorLoadingBar({ pendingKey }: MeteorLoadingBarProps) {
  const reduced = usePrefersReducedMotion()
  const [shownKey, setShownKey] = useState<string | null>(null)

  useEffect(() => {
    if (pendingKey === null) {
      return
    }
    const timer = window.setTimeout(() => setShownKey(pendingKey), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [pendingKey])

  if (shownKey === null) {
    return null
  }
  // 这趟导航已提交，或被下一趟导航顶替
  const landed = shownKey !== pendingKey

  return (
    <motion.div
      key={shownKey}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-50 h-0.5 w-0"
      variants={reduced ? stillVariants : meteorVariants}
      initial="hidden"
      animate={landed ? 'landed' : 'loading'}
      onAnimationComplete={(definition) => {
        if (definition === 'landed') {
          setShownKey((current) => (current === shownKey ? null : current))
        }
      }}
    >
      <div className="via-primary/45 to-primary absolute inset-y-0 right-0 w-[32vw] max-w-md bg-linear-to-r from-transparent" />
      <div className="bg-primary shadow-meteor absolute top-1/2 right-0 h-1 w-4 -translate-y-1/2 rounded-full" />
    </motion.div>
  )
}
