import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import {
  EYE_BOX,
  createEyeRuntime,
  setMood,
  stepEyes,
  type EyeRhythm,
  type OrbEyeRuntime,
} from './orb-eyes'
import { EYE_STAGGER_MS, type OrbEyeMood } from './orb-eye-states'
import { cn } from '@/lib/utils'

/**
 * 指针离球多远才算「看满了」。除以 3 倍半径意味着鼠标在 3 个球径之外就打到边界，
 * 页面上绝大多数位置都是满偏转——对小尺寸悬浮球来说，方向才是信息量，幅度不是。
 */
const GAZE_REACH = 3

type OrbEyesProps = {
  /** 眼睛铺满的这个圆就是球体本身，单位 px */
  size: number
  mood: OrbEyeMood
  /** 换笔画的间隔区间（ms）。传引用而不是打包成对象：config 里那是模块级常量，
   *  身份稳定，effect 依赖它才不会每帧重建运行时 */
  eyeHoldMs: readonly [number, number]
  /** 眨眼的间隔区间（ms） */
  eyeBlinkMs: readonly [number, number]
  /** 关掉动画时只渲一帧静止 */
  still?: boolean
  /** 球体根节点：用它算「指针在球的哪个方向」，所以眼睛在页面任何位置都跟 */
  anchorRef: RefObject<HTMLElement | null>
  /** 随机源，测试里可以塞一个确定的 */
  random?: () => number
  className?: string
}

/**
 * 球体上的眼睛：两层 SVG 路径叠在 WebGL 画布之上，逐帧直接写 `d` 与 `transform`，
 * 不进 React state——理由和 FluidOrb 一样，每帧 setState 会拖垮整页。
 *
 * 颜色走 `currentColor`，由外层主题令牌决定：暗色 `--foreground` 是近白、亮色是近黑，
 * 正好是「暗底白眼睛、亮底黑眼睛」，不需要在这里判断主题，也不写死任何颜色。
 *
 * 注视走**窗口级** pointermove，不是球体自己的 hover：悬浮球只占屏幕一角，
 * 要求用户把鼠标移到球上才动，等于没有跟随。
 */
export function OrbEyes({
  size,
  mood,
  eyeHoldMs,
  eyeBlinkMs,
  still = false,
  anchorRef,
  random = Math.random,
  className,
}: OrbEyesProps) {
  const pathRefs = useRef<(SVGPathElement | null)[]>([])
  const runtimeRef = useRef<OrbEyeRuntime | null>(null)
  const moodRef = useRef(mood)
  const paintRef = useRef<((now: number) => void) | null>(null)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)

  // 静止模式没有 rAF 循环替我们读新 mood，换情绪时必须自己补画一帧，
  // 否则 paused / reduced-motion 下眼睛会卡在旧眼形上
  useEffect(() => {
    moodRef.current = mood
    if (still) {
      paintRef.current?.(performance.now())
    }
  }, [mood, still])

  useEffect(() => {
    const track = (event: PointerEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY }
    }
    const forget = () => {
      cursorRef.current = null
    }
    window.addEventListener('pointermove', track, { passive: true })
    window.addEventListener('pointerdown', track, { passive: true })
    // 触屏没有悬停，手指抬起后就没有方向可跟了，退回待机漂移
    window.addEventListener('pointerup', forget, { passive: true })
    window.addEventListener('pointercancel', forget, { passive: true })
    return () => {
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerdown', track)
      window.removeEventListener('pointerup', forget)
      window.removeEventListener('pointercancel', forget)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let onScreen = true
    let lastShape = -1
    let lastFrom = -1
    let morphing = true

    // 节奏在建运行时那一刻定下，之后不再读——config 是模块常量，跑起来不会变
    const rhythm: EyeRhythm = { hold: eyeHoldMs, blink: eyeBlinkMs }
    const paint = (now: number) => {
      const rt = (runtimeRef.current ??= createEyeRuntime(moodRef.current, now, random, rhythm))
      setMood(rt, moodRef.current, now, random)
      // rect 每帧只读一次，且读发生在 rAF 里而不是 pointermove 回调里——
      // 在事件回调里量盒子会在快速甩鼠标时把强制重排塞进输入路径
      const cursor = cursorRef.current
      const anchor = anchorRef.current
      let pointer: { x: number; y: number } | null = null
      if (cursor !== null && anchor !== null) {
        const rect = anchor.getBoundingClientRect()
        const r = Math.max(1, Math.min(rect.width, rect.height) / 2) * GAZE_REACH
        pointer = {
          x: Math.max(-1, Math.min(1, (cursor.x - (rect.left + rect.width / 2)) / r)),
          y: Math.max(-1, Math.min(1, (cursor.y - (rect.top + rect.height / 2)) / r)),
        }
      }
      const frame = stepEyes(rt, { now, pointer, random })
      // 眼形只在「切换中」或「换了下标」时才变，注视与眨眼只动 transform；
      // d 是 48 个点拼出来的长串，没必要每帧重建
      if (frame.shape !== lastShape || rt.from !== lastFrom || morphing) {
        lastShape = frame.shape
        lastFrom = rt.from
        morphing = now < rt.morphAt + rt.morphMs + EYE_STAGGER_MS
        for (let i = 0; i < 2; i += 1) {
          pathRefs.current[i]?.setAttribute('d', frame.eyes[i].d)
        }
      }
      for (let i = 0; i < 2; i += 1) {
        pathRefs.current[i]?.setAttribute('transform', frame.eyes[i].transform)
      }
    }

    const loop = (now: number) => {
      paint(now)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (raf === 0 && !still && onScreen && !document.hidden) {
        raf = requestAnimationFrame(loop)
      }
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    paintRef.current = paint
    paint(performance.now())
    start()

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true
      if (onScreen) {
        start()
      } else {
        stop()
      }
    })
    for (const el of pathRefs.current) {
      if (el) {
        observer.observe(el)
      }
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      paintRef.current = null
      runtimeRef.current = null
    }
  }, [anchorRef, eyeBlinkMs, eyeHoldMs, random, still])

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${EYE_BOX} ${EYE_BOX}`}
      className={cn(
        'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {[0, 1].map((i) => (
        <path
          key={i}
          ref={(el) => {
            pathRefs.current[i] = el
          }}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

export type { OrbEyeMood } from './orb-eye-states'
