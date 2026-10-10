import { Fragment, useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Transition } from 'motion/react'

import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

/** 答案弹出：带一点过冲的弹簧，像消息被发出去 */
const SEND: Transition = { type: 'spring', visualDuration: 0.42, bounce: 0.28 }
/** 问题气泡互相让位：位移要跟手，但不能晃 */
const SHIFT: Transition = { type: 'spring', visualDuration: 0.4, bounce: 0.1 }
/** 收起比展开快，否则连续点问题时节奏会拖半拍 */
const LEAVE: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] }
const INSTANT: Transition = { duration: 0 }

const QUESTION = '[data-slot="faq-question"]'
const KEY_STEPS: Record<string, (index: number, last: number) => number> = {
  ArrowDown: (index) => index + 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_, last) => last,
}

export type FaqItem = {
  /** 展开态标识，同时用作 aria 关联前缀 */
  id: string
  question: string
  answer: ReactNode
  /** 答案气泡下方的整宽补充内容（仓库卡片、分类网格、徽章）——气泡的 85% 宽装不下这些 */
  detail?: ReactNode
}

type BubbleProps = {
  item: FaqItem
  ids: { question: string; answer: string }
  open: boolean
  openId: string | null
  reduced: boolean
  /** 问题用的标题标签，由 Faq 的 level 决定 */
  Tag: 'h2' | 'h3'
}

/** 站内品牌头像：与仓库卡片同源，离线可用 */
function BrandAvatar() {
  return (
    <span
      aria-hidden
      className="bg-card ring-foreground/10 size-8 shrink-0 overflow-hidden rounded-full ring-1"
    >
      <img src={siteConfig.icons.brand} alt="" className="size-full object-cover" />
    </span>
  )
}

function Question({
  item,
  ids,
  open,
  openId,
  reduced,
  Tag,
  onToggle,
}: BubbleProps & {
  onToggle: () => void
}) {
  return (
    // 问题本身是标题：关于页靠它组成文档大纲，收起答案时也还给爬虫一层结构
    <Tag className="flex max-w-[85%] self-start">
      <motion.button
        id={ids.question}
        type="button"
        data-slot="faq-question"
        aria-expanded={open}
        aria-controls={open ? ids.answer : undefined}
        onClick={onToggle}
        // 任一答案展开都会让后面的问题下移，所以每个气泡都要重新测位
        layout="position"
        layoutDependency={openId}
        transition={reduced ? INSTANT : SHIFT}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        className={cn(
          'text-card-foreground focus-visible:ring-ring/50 w-full cursor-pointer rounded-2xl rounded-bl-sm px-4 py-2.5 text-left text-sm leading-relaxed transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none md:text-base',
          open ? 'bg-card shadow-sm' : 'bg-muted',
        )}
      >
        {item.question}
      </motion.button>
    </Tag>
  )
}

function Answer({
  item,
  ids,
  open,
  openId,
  reduced,
  avatar,
}: BubbleProps & {
  avatar: ReactNode
}) {
  const hasDetail = item.detail !== undefined
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {open && (
        <motion.div
          key="answer"
          layout="position"
          layoutDependency={openId}
          // 带卡片的答案只做淡入位移：0.6 的缩放会把卡片里的文字抖糊
          initial={hasDetail ? { opacity: 0, y: 12 } : { opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: hasDetail ? 1 : 0.9, transition: reduced ? INSTANT : LEAVE }}
          transition={reduced ? INSTANT : SEND}
          style={{ originX: 1, originY: 1 }}
          className="flex flex-col items-end gap-2"
        >
          <div className="flex w-full items-end justify-end gap-2">
            <div
              id={ids.answer}
              role="region"
              data-slot="faq-answer"
              aria-labelledby={ids.question}
              className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed md:text-base"
            >
              {item.answer}
            </div>
            {avatar != null && avatar}
          </div>
          {item.detail != null && <div className="w-full">{item.detail}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type FaqProps = {
  items: FaqItem[]
  /** 首屏就展开的问题 id，不传则全部收起 */
  defaultOpen?: string
  /** 问题标题的层级：页面上方已有小节标题时传 3 */
  level?: 2 | 3
  /** 答案气泡右侧的头像，默认站内品牌图 */
  avatar?: ReactNode
  className?: string
}

/**
 * 聊天气泡式 FAQ：问题靠左、一次只展开一个答案，答案从右下弹入。
 * 问题气泡支持 ↑ ↓ Home End 在组内漫游。
 */
export function Faq({
  items,
  defaultOpen,
  level = 2,
  avatar = <BrandAvatar />,
  className,
}: FaqProps) {
  const reduced = useReducedMotion() === true
  const uid = useId()
  const [openId, setOpenId] = useState<string | null>(defaultOpen ?? null)
  const Tag: 'h2' | 'h3' = level === 3 ? 'h3' : 'h2'

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key]
    const target = event.target
    if (!step || !(target instanceof HTMLElement) || !target.matches(QUESTION)) {
      return
    }
    const questions = [...event.currentTarget.querySelectorAll<HTMLElement>(QUESTION)]
    const next = step(questions.indexOf(target), questions.length - 1)
    event.preventDefault()
    questions.at((next + questions.length) % questions.length)?.focus()
  }

  return (
    <div
      data-slot="faq"
      onKeyDown={onKeyDown}
      className={cn('relative flex w-full flex-col gap-3', className)}
    >
      {items.map((item) => {
        const bubble = {
          item,
          ids: {
            question: `${uid}-${item.id}-question`,
            answer: `${uid}-${item.id}-answer`,
          },
          open: openId === item.id,
          openId,
          reduced,
          Tag,
        }
        return (
          <Fragment key={item.id}>
            <Question {...bubble} onToggle={() => setOpenId(openId === item.id ? null : item.id)} />
            <Answer {...bubble} avatar={avatar} />
          </Fragment>
        )
      })}
    </div>
  )
}
