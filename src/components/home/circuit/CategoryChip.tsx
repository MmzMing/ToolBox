import { motion } from 'motion/react'
import type { CSSProperties, Ref } from 'react'

import { cn } from '@/lib/utils'
import { categoryIcons, type CategoryKey } from '@/tools/categories'

import {
  chipBoxOf,
  circuitIndexOf,
  cqwOf,
  pctOf,
  type BoardLayout,
  type ChipSlot,
  type TraceFlow,
} from './circuit-layout'
import { ChipFace } from './ChipFace'

type CategoryChipProps = {
  layout: BoardLayout
  slot: ChipSlot
  label: string
  /** 静置浮动的相位偏移：每颗错开一点，板子才不像在集体做广播体操 */
  driftDelay: number
  /** 对应走线的流星节奏：充电背光靠它和光头抵达的瞬间同相 */
  flow: TraceFlow
  /** 本颗芯片的克隆体正在飞向核心，原位只留一个空座 */
  hollow: boolean
  /** 入场弹出的延迟（秒）：按顺时针序由调用方给 */
  introDelay: number
  onActivate: (category: CategoryKey, element: HTMLElement) => void
  chipRef: Ref<HTMLButtonElement>
}

/**
 * 分类小芯片：图标在上、名字在下的一颗 IC 封装，左右两侧梳出引脚。
 *
 * 外层 div 只管"钉在图纸的哪个坐标"（left/top 百分比 + 居中 transform + 静置浮动），
 * 中间一层负责入场的气泡弹出（CSS scale 属性），
 * 里层 button 才交给 Motion 管 scale——三者各占一个 CSS 属性，
 * hover 的缩放与弹出的缩放因此都不会把居中用的 translate(-50%,-50%) 冲掉。
 * 所有尺寸走 cqw 跟着版图等比缩放，不需要 JS 测量回写。
 *
 * button 里垫了一层 chip-charge 背光：流星光头抵达本颗焊盘的瞬间（循环零点）
 * 亮起再缓降，像被充了一次电；相位直接复用走线的 duration/delay，天然同相。
 */
export function CategoryChip({
  layout,
  slot,
  label,
  driftDelay,
  flow,
  hollow,
  introDelay,
  onActivate,
  chipRef,
}: CategoryChipProps) {
  const box = chipBoxOf(layout, slot)
  const Icon = categoryIcons[slot.category]
  const color = `var(--circuit-${circuitIndexOf(slot.category)})`
  /** 芯片上的尺寸一律按封装宽度的比例取，三档版图长得一样、只是大小不同 */
  const metric = (ratio: number) => cqwOf(layout, layout.chip.w * ratio)

  return (
    <div
      className="circuit-chip-drift absolute"
      style={
        {
          left: `${pctOf(box.x, layout.width)}%`,
          top: `${pctOf(box.y, layout.height)}%`,
          width: `${pctOf(box.w, layout.width)}%`,
          aspectRatio: `${box.w} / ${box.h}`,
          transform: 'translate(-50%, -50%)',
          color,
          '--circuit-drift-delay': `${driftDelay}s`,
        } as CSSProperties
      }
    >
      <div
        className="circuit-pop-in size-full"
        style={{ '--circuit-in-delay': `${introDelay}s` } as CSSProperties}
      >
        <motion.button
          ref={chipRef}
          type="button"
          aria-haspopup="dialog"
          aria-label={label}
          onClick={(event) => onActivate(slot.category, event.currentTarget)}
          whileHover={{ scale: hollow ? 1 : 1.06 }}
          whileTap={{ scale: 0.95 }}
          animate={{ opacity: hollow ? 0.22 : 1 }}
          transition={{ type: 'spring', duration: 0.42, bounce: 0.26 }}
          className={cn(
            'chip-live bg-card relative size-full overflow-visible rounded-lg',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
            'cursor-pointer hover:z-10',
          )}
        >
          {/* 充电背光：垫在脸下面，内阴影从四边往里泛光，颜色跟本颗分类色 */}
          <span
            aria-hidden="true"
            className="chip-charge pointer-events-none absolute inset-0 rounded-lg"
            style={
              {
                '--circuit-flow-duration': `${flow.duration}s`,
                '--circuit-flow-delay': `${flow.delay}s`,
              } as CSSProperties
            }
          />
          <ChipFace
            label={label}
            Icon={Icon}
            color={color}
            iconSize={metric(0.24)}
            fontSize={metric(0.125)}
          />
        </motion.button>
      </div>
    </div>
  )
}
