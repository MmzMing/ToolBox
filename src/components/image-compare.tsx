import { ChevronLeft, ChevronRight, Columns2, Rows2 } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'
import {
  COMPARE_LABEL_INSET,
  clamp,
  edgeSoftened,
  halfPlaneClip,
  labelOpacity,
  lerp,
  rubberBand,
} from '@/utils/image-compare-geometry'

type Metrics = { w: number; h: number; bw: number; bh: number; aw: number; ah: number }

type Drag = {
  pointer: number
  grab: number
  /** 按在图片上（而非把手上）：按下时分割线要弹到指针处 */
  press: boolean
  started: boolean
  x: number
  y: number
  /** 未经 0–100 夹取的原始位置，松手时用来判断是否处在越界回弹中 */
  raw: number
}

/** horizontal 左右并排（竖线），vertical 上下堆叠（横线）；换向时分割线绕枢轴转四分之一圈，而不是换一套布局。 */
export type ImageCompareOrientation = 'horizontal' | 'vertical'

export type ImageCompareProps = {
  /** 左侧（或上方）的原始内容，通常是原图 */
  before: ReactNode
  /** 右侧（或下方）的结果内容，通常是成品图 */
  after: ReactNode
  /** 分割线位置，沿拖拽轴的百分比；不传则由组件自己维护 */
  position?: number
  defaultPosition?: number
  onPositionChange?: (position: number) => void
  orientation?: ImageCompareOrientation
  /** 两侧标签胶囊，传 undefined 隐藏 */
  labels?: [ReactNode, ReactNode]
  /** 分割线的无障碍名称，默认取 common 文案 */
  label?: string
  /** 画框比例，CSS aspect-ratio；在全屏容器里铺满时传 'auto' */
  aspectRatio?: string
  className?: string
}

const { spring } = motionTokens
/** 跟手位移用 snappy，转轴与回弹用 morph：沿用全站同一组弹簧，不在组件里另写曲线。 */
const moveSpring = spring.snappy
const turnSpring = spring.morph
const kickSpring = spring.morph

/** 按键顶到边界时，把手回弹的初速度（像素/秒）。 */
const BUMP_PX = 150

/**
 * 前后对比画框：一张图叠在另一张上，中间一条可拖拽的分割线。
 *
 * 全站统一的对比交互：按住任意处都能拖（把手 1:1 跟手、越界有橡皮筋、松手停在原地），
 * 点图片会让分割线弹簧式移到该处；触摸端的按下先等待横向意图，页面仍可纵向滚动；
 * 方向键按 1% 步进（Shift 为 10%），Home / End 完全露出某一侧，双击把手回弹到中间；
 * `orientation` 变化时分割线绕枢轴转 90°，标签随线靠近自动淡出。
 */
export function ImageCompare({
  before,
  after,
  position,
  defaultPosition = 50,
  onPositionChange,
  orientation = 'horizontal',
  labels,
  label,
  aspectRatio = '3 / 2',
  className,
}: ImageCompareProps) {
  const { t } = useTranslation('common')
  const reduced = usePrefersReducedMotion()
  const vertical = orientation === 'vertical'
  const [internal, setInternal] = useState(defaultPosition)
  const current = clamp(position ?? internal, 0, 100)
  const afterShare = Math.round(100 - current)
  const rootRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const beforeChip = useRef<HTMLSpanElement>(null)
  const afterChip = useRef<HTMLSpanElement>(null)
  const latest = useRef(current)
  const goal = useRef(current)
  const drag = useRef<Drag | null>(null)
  const pressedHandle = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [quiet, setQuiet] = useState(false)

  // 分割线 = 已提交位置 + 一段追赶偏移：按下时把偏移弹簧归零，指针移动则 1:1 改位置，
  // 于是线会滑向手指，却永远不会拖在手指后面。
  const pos = useMotionValue(current)
  const lag = useMotionValue(0)
  const theta = useMotionValue(vertical ? 90 : 0)
  const metrics = useMotionValue<Metrics>({
    w: 0,
    h: 0,
    bw: 0,
    bh: 0,
    aw: 0,
    ah: 0,
  })
  const shown = useTransform(() => pos.get() + lag.get())
  const turn = useTransform(() => clamp(theta.get() / 90, 0, 1))
  /** 分割线枢轴（像素），横竖两套布局之间按转角混合。 */
  const center = (p: number, m: Metrics): [number, number] => [
    lerp((p / 100) * m.w, m.w / 2, turn.get()),
    lerp(m.h / 2, (p / 100) * m.h, turn.get()),
  ]
  // 静止时所有样式都写成百分比：首屏可直接渲染，窗口缩放也不会慢一拍，只有转身过程中才用像素。
  const clipPath = useTransform(() => {
    const angle = theta.get()
    const p = clamp(shown.get(), 0, 100)
    const m = metrics.get()
    if (angle === 0 || !m.w) {
      return angle >= 45
        ? `inset(0 0 ${(100 - p).toFixed(3)}% 0)`
        : `inset(0 ${(100 - p).toFixed(3)}% 0 0)`
    }
    if (angle === 90) {
      return `inset(0 0 ${(100 - p).toFixed(3)}% 0)`
    }
    return halfPlaneClip(m.w, m.h, center(p, m), (angle * Math.PI) / 180)
  })
  const rest = (angle: number, m: Metrics) => angle === 0 || angle === 90 || !m.w
  const pivotX = useTransform(() => {
    const angle = theta.get()
    const m = metrics.get()
    return rest(angle, m)
      ? angle >= 45
        ? '50%'
        : `${shown.get()}%`
      : `${center(shown.get(), m)[0]}px`
  })
  const pivotY = useTransform(() => {
    const angle = theta.get()
    const m = metrics.get()
    return rest(angle, m)
      ? angle >= 45
        ? `${shown.get()}%`
        : '50%'
      : `${center(shown.get(), m)[1]}px`
  })
  /** 把手沿拖拽轴离线中心的偏移，保证贴边时整颗把手都在框内。 */
  const offset = () => {
    const m = metrics.get()
    if (!m.w) {
      return 0
    }
    const p = shown.get()
    const x = (p / 100) * m.w
    const y = (p / 100) * m.h
    return lerp(edgeSoftened(x, m.w) - x, edgeSoftened(y, m.h) - y, turn.get())
  }
  const handleX = useTransform(() => offset() * Math.cos((theta.get() * Math.PI) / 180))
  const handleY = useTransform(() => offset() * Math.sin((theta.get() * Math.PI) / 180))
  // 标签在线靠近时淡出，转身过半时由「横向那块」交给「纵向那块」，中间不闪断。
  const beforeOpacity = useTransform(() => {
    const m = metrics.get()
    const k = turn.get()
    const p = clamp(shown.get(), 0, 100)
    const across = clamp(1 - k * 3, 0, 1)
    const down = clamp(k * 3 - 2, 0, 1)
    if (!m.w) {
      return across + down
    }
    return (
      across * labelOpacity((p / 100) * m.w - (COMPARE_LABEL_INSET + m.bw + 8)) +
      down * labelOpacity((p / 100) * m.h - (COMPARE_LABEL_INSET + m.bh + 8))
    )
  })
  const afterAcross = useTransform(() => {
    const m = metrics.get()
    const k = clamp(1 - turn.get() * 3, 0, 1)
    if (!m.w) {
      return k
    }
    const room = m.w - COMPARE_LABEL_INSET - m.aw - 8 - (clamp(shown.get(), 0, 100) / 100) * m.w
    return k * labelOpacity(room)
  })
  const afterDown = useTransform(() => {
    const m = metrics.get()
    const k = clamp(turn.get() * 3 - 2, 0, 1)
    if (!m.w) {
      return k
    }
    const room = m.h - COMPARE_LABEL_INSET - m.ah - 8 - (clamp(shown.get(), 0, 100) / 100) * m.h
    return k * labelOpacity(room)
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = () =>
      metrics.set({
        w: root.clientWidth,
        h: root.clientHeight,
        bw: beforeChip.current?.offsetWidth ?? 0,
        bh: beforeChip.current?.offsetHeight ?? 0,
        aw: afterChip.current?.offsetWidth ?? 0,
        ah: afterChip.current?.offsetHeight ?? 0,
      })
    const observer = new ResizeObserver(measure)
    ;[root, beforeChip.current, afterChip.current].forEach((node) => node && observer.observe(node))
    measure()
    return () => observer.disconnect()
  }, [metrics])

  // 换方向：分割线绕枢轴转四分之一圈，裁剪路径跟着转。
  useEffect(() => {
    const target = vertical ? 90 : 0
    if (theta.get() === target) {
      return
    }
    if (reduced) {
      theta.jump(target)
    } else {
      animate(theta, target, turnSpring)
    }
  }, [reduced, theta, vertical])

  // 来自拖拽之外的位置变化（props、方向键、双击回中）都用弹簧送过去。
  useLayoutEffect(() => {
    latest.current = current
    if (drag.current?.started || goal.current === current) {
      return
    }
    goal.current = current
    const from = pos.get() + lag.get()
    lag.jump(0)
    pos.jump(from)
    if (reduced) {
      pos.jump(current)
    } else {
      animate(pos, current, moveSpring)
    }
  })

  function commit(next: number, live = false) {
    if (live && Math.round(next) === Math.round(latest.current)) {
      return
    }
    const value = Number(next.toFixed(2))
    if (value === latest.current) {
      return
    }
    latest.current = value
    if (position === undefined) {
      setInternal(value)
    }
    onPositionChange?.(value)
  }

  const percentAt = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) {
      return 0
    }
    return vertical
      ? ((clientY - rect.top) / (rect.height || 1)) * 100
      : ((clientX - rect.left) / (rect.width || 1)) * 100
  }
  const axisSize = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    return (vertical ? rect?.height : rect?.width) || 1
  }
  /** 指针带来的焦点保持安静：按下键才出现焦点环。 */
  function focusQuietly() {
    const node = handleRef.current
    if (!node || document.activeElement === node) {
      return
    }
    setQuiet(true)
    node.focus({ preventScroll: true })
  }

  function start(state: Drag, at: number) {
    const from = pos.get() + lag.get()
    state.started = true
    state.grab = state.press ? 0 : at - from
    lag.jump(0)
    pos.jump(from)
    setDragging(true)
    focusQuietly()
    follow(state, at, true)
  }
  /** 把线放到指针处（越界带阻力），并按整百分比提交位置。 */
  function follow(state: Drag, at: number, first = false) {
    const raw = at - state.grab
    const size = axisSize()
    const edge = clamp(raw, 0, 100)
    const placed = reduced ? edge : edge + (rubberBand(((raw - edge) / 100) * size) / size) * 100
    state.raw = raw
    if (first && state.press && !reduced) {
      const from = pos.get()
      pos.jump(placed)
      lag.jump(from - placed)
      animate(lag, 0, moveSpring)
    } else {
      pos.set(placed)
    }
    commit(edge, true)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || !rootRef.current) {
      return
    }
    const onHandle = !!(event.target as HTMLElement).closest('[data-handle]')
    pressedHandle.current = onHandle
    event.currentTarget.setPointerCapture(event.pointerId)
    const state: Drag = {
      pointer: event.pointerId,
      grab: 0,
      press: !onHandle,
      started: false,
      x: event.clientX,
      y: event.clientY,
      raw: 0,
    }
    drag.current = state
    // 手指落在图片上可能只是要滚页面，所以先等横向意图；鼠标或按在把手上则立即响应。
    if (event.pointerType !== 'touch' || onHandle) {
      start(state, percentAt(event.clientX, event.clientY))
    }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) {
      return
    }
    if (!state.started) {
      const along = Math.abs(vertical ? event.clientY - state.y : event.clientX - state.x)
      const across = Math.abs(vertical ? event.clientX - state.x : event.clientY - state.y)
      if (along < 6 && across < 6) {
        return
      }
      if (across > along) {
        drag.current = null
        return
      }
      start(state, percentAt(event.clientX, event.clientY))
      return
    }
    follow(state, percentAt(event.clientX, event.clientY))
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) {
      return
    }
    drag.current = null
    // 点一下图片：分割线移过去。
    if (!state.started) {
      if (event.type === 'pointerup') {
        focusQuietly()
        commit(clamp(percentAt(event.clientX, event.clientY), 0, 100))
      }
      return
    }
    // 松手就停在哪儿；越界中或还在追赶按压时，带着当前速度继续弹簧到位。
    const from = pos.get() + lag.get()
    const velocity = lag.getVelocity() + (from > 100 || from < 0 ? pos.getVelocity() : 0)
    const target = clamp(lag.get() !== 0 ? state.raw : from, 0, 100)
    lag.jump(0)
    pos.jump(from)
    goal.current = Number(target.toFixed(2))
    if (from !== target) {
      if (reduced) {
        pos.jump(target)
      } else {
        animate(pos, target, { ...moveSpring, velocity })
      }
    }
    commit(target)
    setDragging(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const large = event.shiftKey ? 10 : 1
    // 方向键按线的朝向走；另外两支跟随数值本身：上/右都表示多看一点 after。
    const toward: Record<string, number> = vertical
      ? {
          ArrowUp: -large,
          ArrowDown: large,
          ArrowRight: -large,
          ArrowLeft: large,
          PageUp: -10,
          PageDown: 10,
        }
      : {
          ArrowLeft: -large,
          ArrowRight: large,
          ArrowUp: -large,
          ArrowDown: large,
          PageUp: -10,
          PageDown: 10,
        }
    let next: number
    if (event.key === 'Home') next = 100
    else if (event.key === 'End') next = 0
    else if (event.key in toward) next = Math.round(latest.current) + (toward[event.key] ?? 0)
    else return
    event.preventDefault()
    setQuiet(false)
    const clamped = clamp(next, 0, 100)
    if (clamped === latest.current) {
      if (!reduced && next !== clamped) {
        animate(pos, goal.current, {
          ...kickSpring,
          velocity: ((Math.sign(next - clamped) * BUMP_PX) / axisSize()) * 100,
        })
      }
      return
    }
    commit(clamped)
  }

  const capsule = dragging
    ? vertical
      ? { width: 36, height: 56 }
      : { width: 56, height: 36 }
    : { width: 40, height: 40 }

  return (
    <div
      ref={rootRef}
      className={cn(
        'border-border relative overflow-hidden rounded-lg border select-none',
        vertical ? 'cursor-ns-resize touch-pan-x' : 'cursor-ew-resize touch-pan-y',
        className,
      )}
      data-orientation={orientation}
      data-dragging={dragging || undefined}
      style={{ aspectRatio }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onMouseDown={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      // 指针捕获会把双击送到画框上，所以这里回看两次按下最初落在哪儿。
      onDoubleClick={() => {
        if (pressedHandle.current && latest.current !== 50) {
          commit(50)
        }
      }}
    >
      <div className="absolute inset-0 overflow-hidden">{after}</div>
      <motion.div className="absolute inset-0 overflow-hidden" style={{ clipPath }}>
        {before}
      </motion.div>
      {labels && (
        <>
          <motion.span
            ref={beforeChip}
            className="bg-overlay/85 text-overlay-foreground absolute top-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur"
            style={{ opacity: beforeOpacity }}
            aria-hidden="true"
          >
            {labels[0]}
          </motion.span>
          <motion.span
            ref={afterChip}
            className="bg-overlay/85 text-overlay-foreground absolute top-3 right-3 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur"
            style={{ opacity: afterAcross }}
            aria-hidden="true"
          >
            {labels[1]}
          </motion.span>
          <motion.span
            className="bg-overlay/85 text-overlay-foreground absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur"
            style={{ opacity: afterDown }}
            aria-hidden="true"
          >
            {labels[1]}
          </motion.span>
        </>
      )}
      <motion.div className="pointer-events-none absolute inset-0" style={{ x: pivotX, y: pivotY }}>
        {/* 转轴盒与画框等大、绕左上角（即枢轴点）旋转；线在局部纵向上拉到 300vmax，任何角度都不会短出画框。 */}
        <motion.span
          className="absolute inset-0 origin-top-left"
          style={{ rotate: theta }}
          aria-hidden="true"
        >
          <span className="[[data-dragging]_&]:bg-primary bg-overlay-foreground/80 pointer-events-none absolute -top-[100vmax] -left-px h-[300vmax] w-0.5" />
        </motion.span>
        <motion.span className="absolute top-0 left-0" style={{ x: handleX, y: handleY }}>
          <motion.div
            ref={handleRef}
            data-handle=""
            className={cn(
              'bg-primary text-primary-foreground pointer-events-auto absolute top-0 left-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-lg outline-none',
              !quiet && 'focus-visible:ring-ring/60 focus-visible:ring-2',
            )}
            role="slider"
            tabIndex={0}
            aria-label={label ?? t('imageCompare.label')}
            aria-orientation={orientation}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={afterShare}
            aria-valuetext={t('imageCompare.valueText', { percent: afterShare })}
            initial={false}
            animate={capsule}
            transition={reduced ? { duration: 0 } : spring.morph}
            onKeyDown={onKeyDown}
            onBlur={() => setQuiet(false)}
          >
            <motion.span
              className="flex items-center justify-center gap-0.5"
              style={{ rotate: theta }}
              aria-hidden="true"
            >
              <motion.span
                initial={false}
                animate={{ x: dragging ? -4 : 0 }}
                transition={reduced ? { duration: 0 } : spring.morph}
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </motion.span>
              <motion.span
                initial={false}
                animate={{ x: dragging ? 4 : 0 }}
                transition={reduced ? { duration: 0 } : spring.morph}
              >
                <ChevronRight size={16} strokeWidth={1.75} />
              </motion.span>
            </motion.span>
          </motion.div>
        </motion.span>
      </motion.div>
    </div>
  )
}

export type ImageCompareOrientationToggleProps = {
  orientation: ImageCompareOrientation
  onOrientationChange: (orientation: ImageCompareOrientation) => void
  className?: string
}

/** 对比画框的方向开关：图标是当前朝向，点击在左右并排与上下堆叠之间换向。 */
export function ImageCompareOrientationToggle({
  orientation,
  onOrientationChange,
  className,
}: ImageCompareOrientationToggleProps) {
  const { t } = useTranslation('common')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn('rounded-full', className)}
      aria-label={t('imageCompare.orientation')}
      title={t('imageCompare.orientation')}
      onClick={() => onOrientationChange(orientation === 'horizontal' ? 'vertical' : 'horizontal')}
    >
      {orientation === 'horizontal' ? <Columns2 /> : <Rows2 />}
    </Button>
  )
}
