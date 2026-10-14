import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import type { Breakpoint } from '@/composable/use-breakpoint'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { scrollDelta, tourSelector, tourTargetsFor, type Rect, type TourTarget } from './targets'

/** 滚动停稳的判定：连续这么多帧 scrollTop 不变就算停了；再多个上限帧数兜底不死等 */
const SETTLED_FRAMES = 3
const MAX_FRAMES = 60

/** 项目里唯一的页面滚动容器（见 AppShell 的 data 属性） */
const SCROLLER = '[data-app-shell-scroll]'

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/**
 * 把目标滚进视口，等滚动动画停稳后再回报它的位置。
 *
 * 必须等停：平滑滚动过程中量到的是中间态，虚线框会画在半路上。
 * 用 rAF 轮询 scrollTop 而不是监听 scroll 事件，是因为事件里拿不到「不再变化」这个信息。
 */
function measureAfterScroll(
  el: Element,
  scroller: Element | null,
  smooth: boolean,
  done: (rect: Rect) => void,
): void {
  const rect = rectOf(el)
  const container = scroller as HTMLElement | null
  const delta = container === null ? 0 : scrollDelta(rect, { height: container.clientHeight })

  if (container === null || Math.abs(delta) < 1) {
    done(rect)
    return
  }

  container.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' })
  let last = container.scrollTop
  let still = 0
  let frames = 0
  const poll = () => {
    frames += 1
    if (Math.abs(container.scrollTop - last) < 0.5) {
      still += 1
    } else {
      still = 0
    }
    last = container.scrollTop
    if (still >= SETTLED_FRAMES || frames >= MAX_FRAMES) {
      done(rectOf(el))
      return
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
}

export type PageTour = {
  active: boolean
  step: number
  target: TourTarget | null
  targets: TourTarget[]
  rect: Rect | null
  /** 第 1 步为 false，按钮文案从「下一步」换成「结束」要用它 */
  isFirst: boolean
  isLast: boolean
  start: () => void
  next: () => void
  stop: () => void
}

/**
 * 首页导览。
 *
 * 目标清单跟着断点走（手机没有顶栏胶囊，就不介绍它），每一步测一次目标位置；
 * 目标太高时先把它滚进视口再量，量到的才是最终位置而不是滚动中途。
 */
export function usePageTour(breakpoint: Breakpoint): PageTour {
  const navigate = useNavigate()
  const location = useLocation()
  const reduced = usePrefersReducedMotion()
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState<Rect | null>(null)
  /** 在非首页点了介绍：先记下来，等路由真的落到首页再开第一步 */
  const pending = useRef(false)

  const targets = useMemo(() => tourTargetsFor(breakpoint), [breakpoint])
  const active = step >= 0
  const target = active ? (targets[Math.min(step, targets.length - 1)] ?? null) : null
  /** 开始介绍时的阅读位置；电路板那一处必须把页面滚下来才能框全，结束后要还回去 */
  const scrollMemory = useRef<number | null>(null)

  const stop = useCallback(() => {
    pending.current = false
    setStep(-1)
    setRect(null)
    const scroller = document.querySelector(SCROLLER) as HTMLElement | null
    if (scroller !== null && scrollMemory.current !== null) {
      scroller.scrollTo({ top: scrollMemory.current, behavior: 'auto' })
    }
    scrollMemory.current = null
  }, [])

  const start = useCallback(() => {
    if (location.pathname !== '/') {
      pending.current = true
      navigate('/')
      return
    }
    const scroller = document.querySelector(SCROLLER) as HTMLElement | null
    scrollMemory.current = scroller?.scrollTop ?? null
    setStep(0)
  }, [location.pathname, navigate])

  const next = useCallback(() => {
    if (step >= targets.length - 1) {
      stop()
      return
    }
    // 不清 rect：新目标要等一帧才测得到，中间留空会让球退回默认停靠位再跳回来，
    // 看着就是闪现而不是滑过去。留着旧值，球原地等，测到后一次性滑过去。
    setStep(step + 1)
  }, [step, targets.length, stop])

  // 落回首页后把记下的那一下补上
  useEffect(() => {
    if (pending.current && location.pathname === '/') {
      pending.current = false
      setStep(0)
    }
  }, [location.pathname])

  // 换目标时测位置；目标不存在（比如还在渲染）就退回上一步，不让虚线框画在空处
  useEffect(() => {
    if (!active || target === null) {
      return
    }
    let alive = true
    const frame = requestAnimationFrame(() => {
      if (!alive) {
        return
      }
      const el = document.querySelector(tourSelector(target.key))
      if (el === null) {
        setRect(null)
        return
      }
      measureAfterScroll(el, document.querySelector(SCROLLER), !reduced, (measured) => {
        if (alive) {
          setRect(measured)
        }
      })
    })
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [active, reduced, target])

  // 视口变化与用户自己滚动时，把框重新贴到目标上
  useEffect(() => {
    if (!active || target === null) {
      return
    }
    const remeasure = () => {
      const el = document.querySelector(tourSelector(target.key))
      setRect(el === null ? null : rectOf(el))
    }
    window.addEventListener('resize', remeasure)
    const scroller = document.querySelector(SCROLLER)
    scroller?.addEventListener('scroll', remeasure, { passive: true })
    return () => {
      window.removeEventListener('resize', remeasure)
      scroller?.removeEventListener('scroll', remeasure)
    }
  }, [active, target])

  useEffect(() => {
    if (!active) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, stop])

  // 断点变了目标清单长度也会变，步数越界就退到最后一个
  const safeStep = Math.min(step, Math.max(0, targets.length - 1))

  return {
    active,
    step: safeStep,
    target,
    targets,
    rect,
    isFirst: safeStep === 0,
    isLast: safeStep >= targets.length - 1,
    start,
    next,
    stop,
  }
}
