import { useState } from 'react'
import { motion } from 'motion/react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { springOf } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'

/** 一个字符走完一次起伏的时长区间（秒）：彼此错开才不会像被同一根线整排拽动 */
const PERIOD_BASE = 2.6
const PERIOD_SPREAD = 1.9
/** 上下浮动像素数、剪切角度、纵向拉伸比例 */
const WAVE = 3
const SKEW = 4
const STRETCH = 0.06
/** 相邻字符的起步时差 */
const STAGGER = 0.07
/** 悬停时逐字上提的像素与「变高变瘦」的比例，RIPPLE 是字与字之间让位的间隔 */
const LIFT = 4
const SQUISH = 0.14
const RIPPLE = 0.02

const HOVER_IN = springOf(0.22, 0.45)
/** 回位比进场拖得更久、回弹更多，对应原型里的 elastic.out */
const HOVER_OUT = springOf(0.62, 0.72)
const INSTANT = { duration: 0 } as const

/** 由序号定出的稳定伪随机：同一字符每次渲染都拿到同一个数，节奏不会刷新一次就换一套 */
function seeded(index: number): number {
  const x = Math.sin((index + 1) * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

type LiquidTextProps = {
  text: string
  className?: string
}

/**
 * 液态标题：外层逐字符做正弦起伏 + 轻微剪切拉伸，像浸在水里被推着走；
 * 悬停时由内层把字往上提、拉高收窄，两层各写各的 transform，所以增弹不会打断波动。
 * 颜色一律走 currentColor，辉光用 color-mix 掺掉透明度，因此跟着主题令牌变。
 */
export function LiquidText({ text, className }: LiquidTextProps) {
  const reduced = usePrefersReducedMotion()
  const [hovered, setHovered] = useState(false)

  return (
    <span
      className={cn('font-bold tracking-wide', className)}
      style={{ textShadow: '0 0 18px color-mix(in oklab, currentColor 20%, transparent)' }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* 拆成单字只为做动画，读屏与爬虫要拿到整词 */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex">
        {[...text].map((char, index) => (
          <motion.span
            key={`${index}-${char}`}
            initial={false}
            animate={
              reduced
                ? undefined
                : {
                    y: [0, -WAVE, 0, WAVE * 0.6, 0],
                    skewX: [0, SKEW, 0, -SKEW, 0],
                    scaleY: [1, 1 + STRETCH, 1, 1 - STRETCH, 1],
                  }
            }
            transition={{
              duration: PERIOD_BASE + seeded(index) * PERIOD_SPREAD,
              ease: 'easeInOut',
              repeat: Infinity,
              delay: index * STAGGER,
            }}
            className="inline-block"
          >
            <motion.span
              initial={false}
              animate={
                hovered
                  ? { y: -LIFT, scaleX: 1 - SQUISH, scaleY: 1 + SQUISH }
                  : { y: 0, scaleX: 1, scaleY: 1 }
              }
              transition={
                reduced ? INSTANT : { ...(hovered ? HOVER_IN : HOVER_OUT), delay: index * RIPPLE }
              }
              className="inline-block will-change-transform"
            >
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          </motion.span>
        ))}
      </span>
    </span>
  )
}
