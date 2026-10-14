import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Rabbit, RotateCcw, Turtle } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { clamp } from '@/components/fluid-orb/orb-physics'
import { FluidOrb } from '@/components/fluid-orb/FluidOrb'
import { ORB_CANVAS_PAD } from '@/components/fluid-orb/orb-shader'
import { OrbBubble } from '@/components/fluid-orb/OrbBubble'
import type { Box } from '@/components/fluid-orb/orb-bubble-placement'
import { createMoodCycler, tapMood } from '@/components/fluid-orb/orb-mood'
import type { OrbEyeMood } from '@/components/fluid-orb/orb-eye-states'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { clampHole, holeOf, orbStation } from '@/modules/page-tour/targets'
import { resolveVoice } from '@/modules/page-tour/tour-voice'
import { useTourVoice } from '@/modules/page-tour/use-tour-voice'
import type { PageTour } from '@/modules/page-tour/use-page-tour'
import { aiOrbConfig } from '@/config/ai-orb'
import { useIsMobile } from '@/composable/use-breakpoint'
import { cn } from '@/lib/utils'

type Spot = { x: number; y: number }

/** 按下与抬起之间移动超过这个距离，就当作拖拽而不是点击 */
const TAP_SLOP_PX = 6
/** 「加速说话」那档的倍率：1.6 倍念完一句约 6 秒，再快就不像说话而像报警 */
const FAST_RATE = 1.6

/**
 * 把球盒左上角夹进视口。只保证球体本身可见——外扩给 halo 的那圈允许在贴边时出血，
 * 把它也算进去会让球在边缘留下一条拖不到的死区。
 */
function clampToViewport(spot: Spot, size: number): Spot {
  return {
    x: clamp(spot.x, 0, Math.max(0, window.innerWidth - size)),
    y: clamp(spot.y, 0, Math.max(0, window.innerHeight - size)),
  }
}

type AIOrbDockProps = {
  tour: PageTour
}

/**
 * AI 悬浮入口。
 *
 * 只由 `aiOrbConfig.enabled` 这一个代码级 kill switch 决定挂不挂。刻意**不**再叠
 * `toolbox.ai` 的用户总开关：那颗开关守的是「内容要不要发往你配置的服务商」（§12），
 * 而这颗球今天不发任何请求，把它一起关掉只会让装饰效果连带消失，起不到告知作用。
 * 等球真的接上 AI 动作，把那道门加回来。
 *
 * 位置有三个来源，优先级从高到低：介绍进行中（飞到目标旁）> 用户拖过（显式坐标）
 * > 默认（CSS 挂在右侧竖边居中）。默认态不吃 JS 定位，所以首帧不读 `window`，
 * 服务端预渲染与 hydration 的 DOM 也保持一致。
 *
 * 点一下球：换一个表情，并开关气泡。气泡里目前只有「页面介绍」一个动作。
 * 规则在 `orb-mood.ts` 里，是纯函数，可测。
 *
 * 不做 `button` 语义也不给 aria-label：换表情是个玩法，不是能抵达的操作，
 * 读屏软件不该被告知这里有个按钮。
 */
export function AIOrbDock({ tour }: AIOrbDockProps) {
  const { t } = useTranslation('common')
  const mobile = useIsMobile()
  const [spot, setSpot] = useState<Spot | null>(null)
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [mood, setMood] = useState<OrbEyeMood>(aiOrbConfig.orb.mood ?? 'idle')
  const [fast, setFast] = useState(false)
  const grab = useRef<{ dx: number; dy: number } | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const cycler = useRef(createMoodCycler())
  /** 球 + 气泡的盒子。判断"点到了外面"以它为界 */
  const rootRef = useRef<HTMLDivElement>(null)

  const { side } = aiOrbConfig.dock
  const size = mobile ? aiOrbConfig.dock.mobileSize : aiOrbConfig.dock.size
  // 画布比球体外扩一圈给 halo 用，贴边放时这部分会被视口裁掉，所以让位量按实际溢出算
  const bleed = (size * (ORB_CANVAS_PAD - 1)) / 2

  // 窗口缩小或换断点时把已经拖出去的球夹回视口，否则可能再也够不着
  useEffect(() => {
    const keepInside = () =>
      setSpot((current) => (current === null ? current : clampToViewport(current, size)))
    window.addEventListener('resize', keepInside)
    return () => window.removeEventListener('resize', keepInside)
  }, [size])

  // 点盒子外面就收起。气泡是"随口一句"，不该要求用户再精准点回那颗会动的球——
  // 尤其它可能被拖到屏幕另一头。开气泡那一下的 pointerdown 发生在 effect 挂上之前，
  // 所以不会被自己关掉；点球那一下的 target 在盒子内，交给 endDrag 去 toggle。
  useEffect(() => {
    if (!bubbleOpen) {
      return
    }
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setBubbleOpen(false)
      }
    }
    window.addEventListener('pointerdown', dismiss, true)
    return () => window.removeEventListener('pointerdown', dismiss, true)
  }, [bubbleOpen])

  const { speak, stop: stopVoice, revealed } = useTourVoice(aiOrbConfig.tour.sound)
  const reduced = usePrefersReducedMotion()
  const stepKey = tour.target?.key
  const sentence = stepKey ? t(`tour.steps.${stepKey}.body`) : ''
  // 念到哪露到哪。没在念的时候（配音关着、解码没回来、这一句念完了）整句显示，
  // 减弱动效时也直接给全文——打字机本身就是动效
  const typing = revealed !== null && !reduced
  const shown = typing ? sentence.slice(0, revealed) : sentence

  const speakCurrent = (quick = fast) => {
    if (stepKey !== undefined) {
      void speak(resolveVoice(aiOrbConfig.tour.lines[stepKey], sentence), quick ? FAST_RATE : 1)
    }
  }

  // 换到某一步就念这一句。刻意不以 tour.rect 为触发条件：滚动过程中视口监听会反复
  // 写新 rect，把它放进依赖等于每帧重念一遍，一句话被自己打断成杂音
  useEffect(() => {
    if (!tour.active || stepKey === undefined) {
      return
    }
    speakCurrent()
    // speakCurrent 不进依赖：它每次渲染都是新函数，进了等于每帧重念
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, tour.active, sentence])

  // 切速率要立刻听得出效果，所以顺手把这一句从头重念一遍
  const toggleSpeed = () => {
    const next = !fast
    setFast(next)
    speakCurrent(next)
  }

  // 导览一结束就把已排程的音效掐掉，否则球都回到 dock 了声音还在念后半句
  useEffect(() => {
    if (!tour.active) {
      stopVoice()
    }
  }, [tour.active, stopVoice])

  if (!aiOrbConfig.enabled) {
    return null
  }

  const viewport = { width: window.innerWidth, height: window.innerHeight }
  // 默认停靠位的视口坐标，按 CSS 实际排布反算：right-0 加一份 bleed 让位，再垂直居中
  const dockedBox: Box = {
    x: side === 'right' ? viewport.width - bleed - size : bleed,
    y: (viewport.height - size) / 2,
    width: size,
    height: size,
  }
  // 介绍中：站到聚光框的下方（下方不够就翻到上方），右边缘与框对齐。
  // rect 还没测到时站在当前位置不动——绝不能退回默认停靠布局，那套是 flex 定位，
  // 跟 left/top 不是同一个机制，浏览器无法在两者间插值，结果就是「闪一下」而不是滑过去。
  const restBox: Box = spot !== null ? { ...spot, width: size, height: size } : dockedBox
  const station: Box | null = tour.active
    ? tour.rect !== null
      ? orbStation(clampHole(holeOf(tour.rect), viewport), size, viewport)
      : restBox
    : null
  const docked = station === null && spot === null
  const anchor: Box = station ?? restBox

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || tour.active) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    grab.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    press.current = { x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = grab.current
    if (offset === null) {
      return
    }
    const pressed = press.current
    if (
      pressed !== null &&
      !pressed.moved &&
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > TAP_SLOP_PX
    ) {
      pressed.moved = true
    }
    setSpot(clampToViewport({ x: event.clientX - offset.dx, y: event.clientY - offset.dy }, size))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (grab.current === null) {
      return
    }
    grab.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // 没位移过才算「点」：拖一下不该顺手换表情、开关气泡；介绍中点击由气泡里的按钮负责
    const pressed = press.current
    press.current = null
    if (pressed === null || pressed.moved || tour.active) {
      return
    }
    const cycled = tapMood(cycler.current, event.timeStamp)
    cycler.current = cycled.next
    setMood(cycled.mood)
    setBubbleOpen((open) => !open)
  }

  const showTourBubble = tour.active && tour.rect !== null && stepKey !== undefined

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30',
        // 介绍期间球要盖在聚光层（z-45）之上：它是讲解员，不是被讲解的内容
        tour.active && 'z-60',
        // 没拖过时挂整条竖带，且它不吃指针：否则右侧一长条会挡住页面内容的点击
        docked && 'inset-y-0 right-0 flex items-center',
        docked && side === 'left' && 'right-auto left-0',
        // 导览全程挂着位移过渡，球在两个目标之间是「滑」过去的而不是闪现。
        // 必须挂在**这层**——left/top 写在这个元素上，挂到内层去就等于没写。
        // 拖拽时不能挂，否则球会甩在手指后面。
        // easeOutQuint：起步快、收尾很长，比 ease-out 更贴「丝滑」的观感
        tour.active && 'transition-[left,top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
      )}
      style={
        docked
          ? side === 'right'
            ? { paddingInlineEnd: bleed }
            : { paddingInlineStart: bleed }
          : { left: anchor.x, top: anchor.y }
      }
    >
      <div
        ref={rootRef}
        className={cn(
          // relative 是必须的：气泡用 absolute 定位，而外层那条带子在默认态是整屏高的
          // （inset-y-0），不给这层定位上下文的话 bottom-full 会把气泡顶出视口
          'pointer-events-auto relative touch-none select-none',
          tour.active ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <FluidOrb size={size} {...aiOrbConfig.orb} mood={mood} />
        {bubbleOpen || showTourBubble ? (
          <OrbBubble
            anchor={anchor}
            // 讲解气泡逐字露出，w-max 会让它每多一个字就横向抖一次，直到撞上上限。
            // 这里把宽度先钉到上限那一档，让文本只往下长行数
            className={showTourBubble ? 'w-[min(19rem,calc(100vw-1.5rem))]' : undefined}
          >
            {showTourBubble ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  {/* 生命条：一格一个目标，走到哪儿亮到哪儿。读数留在 aria-label 里，
                      图形给人看、数字给读屏，两边都不将就 */}
                  <div
                    role="img"
                    aria-label={t('tour.progress', {
                      n: tour.step + 1,
                      total: tour.targets.length,
                    })}
                    className="flex items-center gap-0.5"
                  >
                    {tour.targets.map((target, i) => (
                      <Heart
                        key={target.key}
                        size={13}
                        className={cn(
                          'shrink-0',
                          i <= tour.step
                            ? 'text-destructive fill-current'
                            : 'text-muted-foreground/35',
                        )}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => speakCurrent()}
                    aria-label={t('tour.replay')}
                    className="text-muted-foreground hover:text-foreground rounded-md p-0.5 transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <p className="text-sm leading-relaxed">
                  {/* 读屏拿整句：逐字露出的正文每帧都在变，让 AT 跟着念只会读到半句 */}
                  <span className="sr-only">{sentence}</span>
                  <span aria-hidden="true">
                    {shown}
                    {typing ? (
                      <span className="bg-foreground/70 ml-1 inline-block h-3.5 w-0.5 animate-pulse align-middle" />
                    ) : null}
                  </span>
                </p>
                <div className="mt-1 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={toggleSpeed}
                    aria-label={fast ? t('tour.normalSpeed') : t('tour.fastSpeed')}
                    aria-pressed={fast}
                    className={cn(
                      'rounded-md p-1.5 transition-colors',
                      fast ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {fast ? <Turtle size={14} /> : <Rabbit size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={tour.next}
                    className="bg-foreground text-background hover:bg-foreground/85 rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                  >
                    {tour.isLast ? t('tour.done') : t('tour.next')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed">{t('tour.welcome')}</p>
                {/* 卡片按内容自己定宽：等分两列会把「AI 助手（开发中）」挤到换行，
                    两行高矮不齐，看着像坏了 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBubbleOpen(false)
                      tour.start()
                    }}
                    className="hover:bg-accent hover:text-accent-foreground shrink-0 rounded-xl border px-3 py-2 text-sm whitespace-nowrap transition-colors"
                  >
                    {t('tour.intro')}
                  </button>
                  {/* 助手还没接上，先把卡片摆出来：点得着的地方不留空，但也绝不假装能用 */}
                  <button
                    type="button"
                    disabled
                    className="text-muted-foreground/60 shrink-0 cursor-not-allowed rounded-xl border px-3 py-2 text-sm whitespace-nowrap"
                  >
                    {t('tour.ai')}
                  </button>
                </div>
              </div>
            )}
          </OrbBubble>
        ) : null}
      </div>
    </div>
  )
}
