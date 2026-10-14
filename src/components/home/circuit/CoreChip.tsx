import { motion } from 'motion/react'
import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { siteConfig } from '@/config/site'
import { CoreAurora, type AuroraPointer } from './CoreAurora'
import { cqwOf, pctOf, type BoardLayout } from './circuit-layout'

type CoreChipProps = {
  layout: BoardLayout
  /** 主芯片下方那行名字 */
  name: string
  /** 工具总数那行说明，由调用方翻好再传进来 */
  countCaption: string
  /** 有分类芯片正飞进来：核心亮起迎接 */
  charging: boolean
  /** 入场弹出的延迟（秒） */
  introDelay: number
  coreRef: Ref<HTMLDivElement>
}

/** 与 CSS rounded-[9%] 对齐的圆角比例（占芯片宽度） */
const RADIUS_RATIO = 0.09

/**
 * 中央主芯片：图标在上、站名在下。
 *
 * 卡片内部铺一层 CoreAurora 的极光：贴着圆角边框内侧绕圈顺时针巡游，
 * 描边与极光共用同一条沿周长跑的明暗，所以是一缕光绕着边走而不是整圈均亮。
 * 画布与芯片盒完全重合，极光只留在卡片内部，圆角由这层 overflow-hidden 裁。
 *
 * 点火环挂在 wrapper 上：芯片自己 overflow-hidden，挂进去会被削平。
 */
export function CoreChip({
  layout,
  name,
  countCaption,
  charging,
  introDelay,
  coreRef,
}: CoreChipProps) {
  const core = layout.core
  const color = 'var(--circuit-core)'
  const metric = (ratio: number) => cqwOf(layout, core.w * ratio)
  const reduced = usePrefersReducedMotion()
  const pointer = useRef<AuroraPointer>({ x: 0, y: 0, push: 0 })

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const u = (event.clientX - rect.left) / rect.width
    const v = (event.clientY - rect.top) / rect.height
    pointer.current = {
      x: (u - 0.5) * (rect.width / rect.height),
      // 着色器的 y 轴与 gl_FragCoord 同向（原点在下）
      y: 0.5 - v,
      push: 1,
    }
  }
  const handlePointerLeave = () => {
    pointer.current.push = 0
  }

  return (
    <div
      ref={coreRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="absolute"
      style={
        {
          left: `${pctOf(core.x, layout.width)}%`,
          top: `${pctOf(core.y, layout.height)}%`,
          width: `${pctOf(core.w, layout.width)}%`,
          aspectRatio: `${core.w} / ${core.h}`,
          transform: 'translate(-50%, -50%)',
          color,
        } as CSSProperties
      }
    >
      <div
        className="circuit-pop-in bg-card relative size-full overflow-hidden rounded-[9%]"
        style={{ '--circuit-in-delay': `${introDelay}s` } as CSSProperties}
      >
        <CoreAurora radiusRatio={RADIUS_RATIO} pointer={pointer} still={reduced} />
        <span className="relative flex size-full flex-col items-center justify-center gap-[3%] px-[6%] text-center">
          <img
            src={siteConfig.icons.brand}
            width={52}
            height={52}
            alt=""
            aria-hidden="true"
            className="rounded-[24%] object-contain drop-shadow-lg"
            style={{ width: metric(0.25), height: metric(0.25) }}
          />
          <span
            className="text-foreground w-full font-semibold text-balance"
            style={{ fontSize: metric(0.095), lineHeight: 1.2 }}
          >
            {name}
          </span>
          <span
            className="text-foreground/70 font-mono tracking-wide"
            style={{ fontSize: metric(0.058), lineHeight: 1.2 }}
          >
            {countCaption}
          </span>
        </span>
      </div>

      {/* 芯片被"点火"时亮起的一圈环：分类芯片正飞进来 */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[9%]"
        initial={false}
        animate={{ opacity: charging ? 1 : 0, scale: charging ? 1.03 : 1 }}
        transition={{ duration: 0.35 }}
        style={{
          boxShadow: `0 0 0 2px ${color}, 0 0 34px 4px color-mix(in oklch, ${color} 60%, transparent)`,
        }}
      />
    </div>
  )
}
