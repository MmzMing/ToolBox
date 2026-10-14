import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { ChipFace } from './ChipFace'
import { circuitIndexOf } from './circuit-layout'
import { clipFor, planFlight, type Rect } from './flight-plan'
import { ToolCard } from '@/components/tool-card'
import { motionTokens } from '@/lib/motion-tokens'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { categoryIcons, type CategoryKey } from '@/tools/categories'
import { toolsByCategory } from '@/tools'

export type ChipFlight = {
  category: CategoryKey
  /** 起飞那颗芯片在视口里的矩形 */
  origin: Rect
  /** 核心芯片在视口里的矩形：既是落点，也是卡片展开的起点 */
  core: Rect
}

type Phase = 'fly' | 'unfold' | 'open' | 'fold' | 'line'

/** 各阶段时长（毫秒）：飞行—展开—收起—余线，节奏一路收得比放得快 */
const PHASE_MS: Record<Phase, number> = { fly: 420, unfold: 560, open: 0, fold: 400, line: 260 }

const NEXT_PHASE: Record<Phase, Phase> = {
  fly: 'unfold',
  unfold: 'open',
  open: 'open',
  fold: 'line',
  line: 'line',
}

/** 展开用缓出（取自令牌，与全站入场曲线同一条）、收起用缓入：屏幕点亮是"摊开"，二向箔收拢是"抽紧" */
const EASE_OUT = [...motionTokens.ease.enter] as [number, number, number, number]
const EASE_IN = [0.7, 0, 0.84, 0] as const

type ChipDetailOverlayProps = {
  flight: ChipFlight
  /** 收起动画整条跑完，调用方才可以卸载并把焦点还给芯片 */
  onFinished: () => void
}

/**
 * 点分类芯片后浮起来的那张卡片，整条动效分五拍：
 *
 * 1. fly     芯片的克隆体从原位飞到核心正中，原地只留一个空座；
 * 2. unfold  背景虚化，卡片以核心足迹为起点用 clip-path 往外摊开，四角支架同时滑到卡片四角；
 * 3. open    停住，展示该分类的工具；
 * 4. fold    二向箔收拢——上下两边向中线合，左右宽度不变，直到压成一道缝；
 * 5. line    缝亮起再淡出，同一拍里背景解除虚化。
 *
 * clip-path 而不是 transform：二向箔要求"水平方向一点都不缩"，
 * 用 scaleY 会连带把内容压扁，只有 inset 能只收上下两条边。
 */
export function ChipDetailOverlay({ flight, onFinished }: ChipDetailOverlayProps) {
  const { t } = useTranslation('home')
  const { t: tCategory } = useTranslation('categories')
  const reduced = usePrefersReducedMotion()
  // 关掉动画时直接以「已展开」起手：状态在初始化时一次定死，
  // 不在 effect 里补一次 setState（那会多渲染一轮，也被 lint 拦）
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'open' : 'fly'))
  const cardRef = useRef<HTMLDivElement>(null)

  // 视口尺寸只在挂载那一刻取一次：卡片一旦定位就不该再跟着窗口跳
  const [plan] = useState(() =>
    planFlight(flight.origin, flight.core, {
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  )

  const categoryLabel = tCategory(flight.category)
  const color = `var(--circuit-${circuitIndexOf(flight.category)})`
  const Icon = categoryIcons[flight.category]
  const tools = toolsByCategory.find((group) => group.category === flight.category)?.tools ?? []

  const seconds = (ms: number) => (reduced ? 0 : ms / 1000)

  useEffect(() => {
    // 关掉动画就没有分拍可走：起手即 open，收起在 handleClose 里直接结束
    if (reduced || phase === 'open') {
      return
    }
    const timer = setTimeout(() => {
      if (phase === 'line') {
        onFinished()
      } else {
        setPhase(NEXT_PHASE[phase])
      }
    }, PHASE_MS[phase])
    return () => clearTimeout(timer)
  }, [onFinished, phase, reduced])

  // 展开时把焦点收进卡片：Escape 与 Tab 都从这里开始
  useEffect(() => {
    if (phase === 'unfold' || (reduced && phase === 'open')) {
      cardRef.current?.focus()
    }
  }, [phase, reduced])

  const handleClose = useCallback(() => {
    if (reduced) {
      onFinished()
      return
    }
    setPhase((current) => (current === 'fly' ? current : 'fold'))
  }, [onFinished, reduced])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [handleClose])

  const collapsing = phase === 'fold' || phase === 'line'
  // 点下去就虚化：背景先退到景深里，芯片再飞进这片虚化中，才有"聚焦这一类"的手感
  const blurOn = phase !== 'line'
  const bracketSize = Math.max(18, plan.cornerRadius * 1.7)

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* 虚化背景：整层（含 backdrop-blur 的成像结果）用 opacity 淡入淡出。
          它同时是"点外面关掉"的命中区，touch-none 免得手机上把滚动传给底下的 main */}
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={t('circuit.close')}
        onClick={handleClose}
        className="bg-background/55 absolute inset-0 size-full cursor-default touch-none backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: blurOn ? 1 : 0 }}
        transition={{ duration: seconds(collapsing ? 260 : 340), ease: 'easeOut' }}
      />

      <div
        className="absolute"
        style={{
          left: plan.card.left,
          top: plan.card.top,
          width: plan.card.width,
          height: plan.card.height,
        }}
      >
        <motion.div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={categoryLabel}
          tabIndex={-1}
          className="bg-card/95 text-card-foreground absolute inset-0 flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl outline-none"
          style={{ borderRadius: plan.cornerRadius }}
          initial={{ clipPath: clipFor('core', plan), opacity: 0 }}
          animate={{
            clipPath: clipFor(phase === 'fly' ? 'core' : collapsing ? 'foil' : 'card', plan),
            opacity: phase === 'fly' ? 0 : 1,
          }}
          transition={{
            clipPath: {
              duration: seconds(phase === 'fold' ? 400 : 560),
              ease: phase === 'fold' ? EASE_IN : EASE_OUT,
            },
            opacity: { duration: seconds(phase === 'fly' ? 1 : 120) },
          }}
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: blurOn && !collapsing ? 1 : 0, scale: 1 }}
            transition={{
              duration: seconds(collapsing ? 120 : 260),
              delay: reduced || collapsing ? 0 : 0.18,
            }}
          >
            <header className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-2">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  color,
                  backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
                }}
              >
                <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h2 className="truncate text-base font-semibold">{categoryLabel}</h2>
              <span className="text-muted-foreground shrink-0 text-sm">
                {t('circuit.toolCount', { total: tools.length })}
              </span>
              <button
                type="button"
                aria-label={t('circuit.close')}
                onClick={handleClose}
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring ms-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="inset-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <ToolCard key={tool.path} tool={tool} />
                ))}
              </div>
            </div>
          </motion.div>

          {/* 点亮瞬间横扫的一道光：只在展开那一拍出现，强化"屏幕开机"的观感 */}
          {phase === 'unfold' && !reduced && (
            <motion.span
              aria-hidden="true"
              className="via-primary/30 pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent to-transparent blur-md"
              initial={{ x: '-140%', opacity: 0 }}
              animate={{ x: '540%', opacity: [0, 1, 0] }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          )}
        </motion.div>

        {/* 四角支架：从核心足迹的四角滑到卡片四角，收拢时再一起压到中线 */}
        {(
          [
            {
              key: 'tl',
              className: 'left-0 top-0',
              start: { x: plan.core.left, y: plan.core.top },
              corner: `${plan.cornerRadius}px 0 0 0`,
              borders: 'border-t-2 border-l-2',
            },
            {
              key: 'tr',
              className: 'right-0 top-0',
              start: { x: -plan.core.left, y: plan.core.top },
              corner: `0 ${plan.cornerRadius}px 0 0`,
              borders: 'border-t-2 border-r-2',
            },
            {
              key: 'bl',
              className: 'bottom-0 left-0',
              start: { x: plan.core.left, y: -plan.core.top },
              corner: `0 0 0 ${plan.cornerRadius}px`,
              borders: 'border-b-2 border-l-2',
            },
            {
              key: 'br',
              className: 'bottom-0 right-0',
              start: { x: -plan.core.left, y: -plan.core.top },
              corner: `0 0 ${plan.cornerRadius}px 0`,
              borders: 'border-b-2 border-r-2',
            },
          ] as const
        ).map((corner) => (
          <motion.span
            key={corner.key}
            aria-hidden="true"
            className={`pointer-events-none absolute border-current ${corner.className} ${corner.borders}`}
            style={{
              width: bracketSize,
              height: bracketSize,
              borderRadius: corner.corner,
              color,
              filter: `drop-shadow(0 0 6px color-mix(in oklch, ${color} 80%, transparent))`,
            }}
            initial={{ x: corner.start.x, y: corner.start.y, opacity: 0 }}
            animate={{
              x: phase === 'fly' ? corner.start.x : 0,
              y: phase === 'fly' ? corner.start.y : 0,
              // 收起这一拍四角直接淡出：卡片已经压成线，支架再留在原地就是四块亮斑
              opacity: phase === 'fly' || collapsing ? 0 : 1,
            }}
            transition={{
              duration: seconds(collapsing ? 160 : 560),
              ease: collapsing ? EASE_IN : EASE_OUT,
              // 让克隆体的四角先淡干净，卡片的四角再亮起来交接，两段不会同时在场
              delay: reduced || phase !== 'unfold' ? 0 : 0.1,
            }}
          />
        ))}

        {/* 二向箔压到最后剩下的那道缝：亮起、再随背景一起淡出 */}
        {collapsing && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 14px 2px color-mix(in oklch, ${color} 70%, transparent)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'fold' ? 1 : 0 }}
            transition={{
              duration: seconds(phase === 'fold' ? 150 : 250),
              delay: reduced || phase === 'line' ? 0 : 0.26,
            }}
          />
        )}
      </div>

      {/* 飞行克隆体：盖在卡片之上，落到核心后原地化开，交接给摊开的卡片 */}
      {(phase === 'fly' || phase === 'unfold') && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: flight.origin.left,
            top: flight.origin.top,
            width: flight.origin.width,
            height: flight.origin.height,
          }}
        >
          <motion.div
            className="size-full"
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: plan.fly.x,
              y: plan.fly.y,
              scale: plan.fly.scale,
              opacity: phase === 'fly' ? 1 : 0,
            }}
            transition={
              phase === 'fly'
                ? { duration: seconds(PHASE_MS.fly), ease: EASE_OUT }
                : { duration: seconds(160), ease: 'easeOut' }
            }
          >
            <div className="bg-card relative size-full rounded-lg" style={{ color }}>
              <ChipFace
                label={categoryLabel}
                Icon={Icon}
                color={color}
                iconSize={`${flight.origin.width * 0.24}px`}
                fontSize={`${flight.origin.width * 0.125}px`}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>,
    document.body,
  )
}
