import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion } from 'motion/react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'

/** motion 只能补间数值，这两处镜像 `--radius-2xl` 与 `my-2.5`，改主题令牌时记得同步 */
const CARD_RADIUS = 18
const CARD_GAP = 10
const INSTANT = { duration: 0 } as const

export type SplitAccordionItem = {
  id: string
  title: string
  content: ReactNode
}

type SplitAccordionProps = {
  items: SplitAccordionItem[]
  /** 首屏就展开的那条，不传则全部收起 */
  defaultOpenId?: string
  className?: string
}

/**
 * 卡片分裂式手风琴：收起时是一整张没有内部分隔的卡，点开一条它就从卡里脱出来，
 * 上下各让出一道缝，相邻两条因此各自补回朝向缝隙的圆角。一次只展开一条。
 */
export function SplitAccordion({ items, defaultOpenId, className }: SplitAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null)
  const openIndex = items.findIndex((item) => item.id === openId)

  return (
    <ul className={cn('flex w-full flex-col', className)}>
      {items.map((item, index) => (
        <SplitAccordionRow
          key={item.id}
          item={item}
          index={index}
          total={items.length}
          openIndex={openIndex}
          open={index === openIndex}
          onToggle={() => setOpenId(openId === item.id ? null : item.id)}
        />
      ))}
    </ul>
  )
}

type RowProps = {
  item: SplitAccordionItem
  index: number
  total: number
  openIndex: number
  open: boolean
  onToggle: () => void
}

function SplitAccordionRow({ item, index, total, openIndex, open, onToggle }: RowProps) {
  const reduced = usePrefersReducedMotion()
  const transition = reduced ? INSTANT : motionTokens.spring.snappy
  const questionId = `split-accordion-${item.id}-question`
  const answerId = `split-accordion-${item.id}-answer`

  const isFirst = index === 0
  const isLast = index === total - 1
  const isBeforeOpen = index === openIndex - 1
  const isAfterOpen = index === openIndex + 1

  // 每条只画自己的上边线，相邻两条之间因此恰好是 1px 而不是 2px；
  // 整张卡的封口由最后一条的下边线负责，脱出来的那条四条边都要画全。
  const radiusTop = open || isAfterOpen || isFirst ? CARD_RADIUS : 0
  const radiusBottom = open || isBeforeOpen || isLast ? CARD_RADIUS : 0

  return (
    <motion.li
      animate={{
        marginTop: open ? CARD_GAP : 0,
        marginBottom: open ? CARD_GAP : 0,
        borderTopLeftRadius: radiusTop,
        borderTopRightRadius: radiusTop,
        borderBottomLeftRadius: radiusBottom,
        borderBottomRightRadius: radiusBottom,
      }}
      transition={transition}
      className={cn(
        'border-border bg-card overflow-hidden border border-solid',
        radiusTop === 0 && 'border-t-0',
        open && 'shadow-sm',
      )}
    >
      <h3>
        <button
          type="button"
          id={questionId}
          aria-expanded={open}
          aria-controls={answerId}
          onClick={onToggle}
          className="hover:bg-accent/40 flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-start transition-colors"
        >
          <span className="text-foreground truncate text-sm font-medium">{item.title}</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={transition}
            className="text-muted-foreground shrink-0"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </motion.span>
        </button>
      </h3>

      <motion.div
        id={answerId}
        role="region"
        aria-labelledby={questionId}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={transition}
        className="overflow-hidden"
      >
        <div className="text-muted-foreground px-3 pb-3 text-xs leading-relaxed">
          {item.content}
        </div>
      </motion.div>
    </motion.li>
  )
}
