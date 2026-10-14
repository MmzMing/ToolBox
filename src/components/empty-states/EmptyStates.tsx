import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens } from './motion-tokens'
import { FRAMES, KINDS, VIEW, shapePath } from './empty-states-art'
import type { Frame, Phase, SceneId } from './empty-states-art'
import styles from './empty-states.module.css'

/**
 * One product illustration for four empty states. The tabs pick a state; every shape in the drawing travels to its new
 * position, size, radius, rotation and color on a spring, outlines morph point by point, and line accents draw in a beat later.
 * Each primary action does something local and visible: filters clear into results, a retry reconnects after a short wait,
 * a mail check redraws the check, and a lost page is found in the archive. Nothing here talks to a server.
 */

type Copy = { title: string; line: string; action: string }

/** Shapes lead, details trail: back tiles, body, front tiles, then lines and the mark. Totals stay under 0.4s. */
const DELAY = [0.05, 0.03, 0, 0.04, 0.07, 0.1, 0.06, 0.09, 0.11, 0.14]
const NUDGE = [0.03, 0.015, 0, 0.02, 0.035, 0.05, 0.02, 0.04, 0.05, 0.07]
const DRIFT = 2.5

const paintOf = (frame: Frame) =>
  frame.prims.map((p, i) => ({
    ...shapePath(KINDS[i]!, p.geo, p.fx[1], 0, 0),
    o: String(p.fx[0]),
  }))

const enter = [...motionTokens.ease.enter] as [number, number, number, number]
const standard = [...motionTokens.ease.standard] as [number, number, number, number]

/** Motion's visualDuration and bounce, turned into stiffness and damping for the vector springs below. */
function springOf({ visualDuration, bounce }: { visualDuration: number; bounce: number }) {
  const root = (2 * Math.PI) / (visualDuration * 1.2)
  return { k: root * root, c: 2 * Math.min(1, Math.max(0.05, 1 - bounce)) * root }
}
const MORPH = springOf(motionTokens.spring.morph),
  SMOOTH = springOf(motionTokens.spring.smooth),
  SWAY = { k: 90, c: 19 }

type Channel = {
  pos: Float64Array
  vel: Float64Array
  target: Float64Array
  queue: { at: number; values: number[] }[]
  k: number
  c: number
  still: boolean
}
const channel = (values: number[], spring: { k: number; c: number }): Channel => ({
  pos: Float64Array.from(values),
  vel: new Float64Array(values.length),
  target: Float64Array.from(values),
  queue: [],
  ...spring,
  still: true,
})

/** Integrates one spring vector. A new target keeps the current velocity, so shapes retarget mid-flight without a hitch. */
function advance(ch: Channel, now: number, dt: number) {
  while (ch.queue.length && ch.queue[0]!.at <= now) {
    const next = ch.queue.shift()
    if (next) {
      ch.target.set(next.values)
      ch.still = false
    }
  }
  if (!ch.still) {
    const steps = Math.max(1, Math.ceil(dt * 240)),
      h = dt / steps,
      { pos, vel, target, k, c } = ch
    for (let s = 0; s < steps; s++)
      for (let i = 0; i < pos.length; i++) {
        vel[i]! += (-k * (pos[i]! - target[i]!) - c * vel[i]!) * h
        pos[i]! += vel[i]! * h
      }
    let settled = true
    for (let i = 0; i < pos.length; i++)
      if (Math.abs(pos[i]! - target[i]!) > 0.004 || Math.abs(vel[i]!) > 0.02) {
        settled = false
        break
      }
    if (settled) {
      pos.set(target)
      vel.fill(0)
      ch.still = true
    }
  }
  return !ch.still || ch.queue.length > 0
}

type Nodes = {
  paths: SVGPathElement[]
  ghosts: SVGPathElement[]
  main: SVGGElement
  ghost: SVGGElement
}

/** One animation frame loop drives every shape through refs. It sleeps once everything has settled. */
function createEngine(nodes: Nodes, start: Frame) {
  const geo = start.prims.map((p) => channel(p.geo, MORPH))
  const fx = start.prims.map((p) => channel(p.fx, SMOOTH))
  const sway = channel([0, 0], SWAY)
  const written = start.prims.map((p, i) => {
    const { d, dash } = shapePath(KINDS[i]!, p.geo, p.fx[1], 0, 0)
    return { d, o: String(p.fx[0]), dash }
  })
  let frame = start,
    raf = 0,
    last = 0,
    parallax = false

  const paint = () => {
    const ox = sway.pos[0]! * DRIFT,
      oy = sway.pos[1]! * DRIFT
    nodes.paths.forEach((node, i) => {
      const g = geo[i]!.pos,
        f = fx[i]!.pos,
        w = written[i]!
      const { d, dash } = shapePath(KINDS[i]!, g, f[1]!, ox, oy)
      const o = String(Math.round(Math.min(1, Math.max(0, f[0]!)) * 1000) / 1000)
      if (d !== w.d) {
        node.setAttribute('d', d)
        w.d = d
      }
      if (o !== w.o) {
        node.setAttribute('opacity', o)
        w.o = o
      }
      if (dash !== w.dash) {
        node.setAttribute('stroke-dasharray', dash)
        w.dash = dash
      }
    })
  }
  const tick = (time: number) => {
    raf = 0
    const now = time / 1000,
      dt = last ? Math.min(0.034, Math.max(0, now - last)) : 1 / 60
    last = now
    let busy = advance(sway, now, dt)
    for (let i = 0; i < geo.length; i++) busy = advance(geo[i]!, now, dt) || busy
    for (let i = 0; i < fx.length; i++) busy = advance(fx[i]!, now, dt) || busy
    paint()
    if (busy) raf = requestAnimationFrame(tick)
    else last = 0
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }

  const pointer = (x: number, y: number) => {
    sway.queue = []
    sway.target.set(parallax ? [x, y] : [0, 0])
    sway.still = false
    kick()
  }

  return {
    pointer,
    go(next: Frame, sceneChanged: boolean, reduced: boolean) {
      if (reduced) {
        // Crossfade without travel: freeze the old drawing in a ghost layer, snap to the new one, and fade between them.
        nodes.paths.forEach((node, i) => {
          const ghost = nodes.ghosts[i]!
          ghost.setAttribute('d', node.getAttribute('d') ?? '')
          ghost.setAttribute('opacity', node.getAttribute('opacity') ?? '1')
          ghost.setAttribute('stroke-dasharray', node.getAttribute('stroke-dasharray') ?? 'none')
          ghost.dataset.tone = frame.prims[i]!.tone
        })
        next.prims.forEach((p, i) => {
          for (const [ch, values] of [
            [geo[i]!, p.geo],
            [fx[i]!, p.fx],
          ] as const) {
            ch.queue = []
            ch.target.set(values)
            ch.pos.set(values)
            ch.vel.fill(0)
            ch.still = true
          }
        })
        frame = next
        paint()
        animate(
          nodes.ghost,
          { opacity: [1, 0] },
          { duration: motionTokens.duration.standard, ease: standard },
        )
        animate(
          nodes.main,
          { opacity: [0, 1] },
          { duration: motionTokens.duration.standard, ease: standard },
        )
        return
      }
      const now = performance.now() / 1000,
        delays = sceneChanged ? DELAY : NUDGE
      next.prims.forEach((p, i) => {
        const delay = delays[i]!,
          f = fx[i]!
        geo[i]!.queue = [{ at: now + delay, values: p.geo }]
        if (sceneChanged && p.redraw)
          f.queue = [
            { at: now, values: [p.fx[0], 0] },
            { at: now + delay + 0.18, values: p.fx },
          ]
        else
          f.queue = [{ at: now + delay + (p.fx[1] > f.target[1]! + 0.01 ? 0.12 : 0), values: p.fx }]
      })
      frame = next
      kick()
    },
    setParallax(on: boolean) {
      parallax = on
      if (!on) pointer(0, 0)
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    },
  }
}

export type EmptyStatesProps = {
  /** 这一处用哪张场景：404 用 map，命令面板用 search，联网工具用 offline */
  scene: SceneId
  /** 演到哪一拍，由调用方的真实状态给：重试中 loading，成功 done */
  phase?: Phase
  /** 落点自己的文案；不传则取 `common` 里这张场景的通用文案 */
  title?: string
  line?: string
  action?: string
  /** 点一下做什么。不传就不渲染那颗动作键 */
  onAction?: () => void
  /** 主动作左边那颗：落点自己带（404 在这里放「返回首页」），组件不猜它是什么 */
  extra?: ReactNode
  /** 窄容器档：插画与文字收小一号，给命令面板这类地方用 */
  compact?: boolean
  className?: string
}

/**
 * 一张空状态插画：10 个图元在 idle / loading / done 三拍之间沿弹簧旅行。
 *
 * 场景与拍都由调用方给，组件自己不演假动作。引擎经 ref 直接写 SVG 属性，补间期间一次
 * React 渲染都不发生；`prefers-reduced-motion` 下换成两层交叉淡入，只淡不飞。
 */
export function EmptyStates({
  scene,
  phase = 'idle',
  title,
  line,
  action,
  onAction,
  extra,
  compact = false,
  className,
}: EmptyStatesProps) {
  const { t } = useTranslation('common')
  const reduced = usePrefersReducedMotion()
  const paths = useRef<(SVGPathElement | null)[]>([])
  const ghosts = useRef<(SVGPathElement | null)[]>([])
  const mainLayer = useRef<SVGGElement>(null)
  const ghostLayer = useRef<SVGGElement>(null)
  const engine = useRef<ReturnType<typeof createEngine> | null>(null)
  const shown = useRef({ scene, phase })
  const copyInner = useRef<HTMLDivElement>(null)
  const copyHeight = useMotionValue<number | 'auto'>('auto')
  const armedUntil = useRef(0)
  // 首帧画哪一张由挂载时的 props 决定：固定场景的落点（404 只有 map）不该先闪一下别的场景
  const [mount] = useState({ scene, phase })

  // 忙那一拍沿用 idle 的标题与动作，只换说明行；要演"从 done 再查一次"的落点自己传 title
  const at = `empty.${scene}.${phase === 'done' ? 'done' : 'idle'}`
  const copy: Copy = {
    title: title ?? t(`${at}.title`),
    line: line ?? (phase === 'loading' ? t(`empty.${scene}.loading`) : t(`${at}.line`)),
    action: action ?? t(`${at}.action`),
  }
  const copyKey = `${copy.title}|${copy.line}`
  const frame = FRAMES[scene][phase]

  useEffect(() => {
    const main = mainLayer.current,
      ghost = ghostLayer.current
    const nodes = paths.current.filter(Boolean) as SVGPathElement[],
      ghostNodes = ghosts.current.filter(Boolean) as SVGPathElement[]
    if (!main || !ghost || nodes.length !== KINDS.length || ghostNodes.length !== KINDS.length)
      return
    // 第一次跑到这里就是挂载：通道按当前这一拍建，于是补间从首帧接着走而不是从头画
    const instance =
      engine.current ??
      createEngine({ paths: nodes, ghosts: ghostNodes, main, ghost }, FRAMES[scene][phase])
    engine.current = instance
    const prev = shown.current
    if (prev.scene === scene && prev.phase === phase) return
    shown.current = { scene, phase }
    instance.go(FRAMES[scene][phase], prev.scene !== scene, reduced)
  }, [scene, phase, reduced])

  useEffect(
    () => () => {
      engine.current?.destroy()
      engine.current = null
    },
    [],
  )

  useEffect(() => {
    const fine =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    engine.current?.setParallax(fine && !reduced)
  }, [reduced])

  useEffect(() => {
    const prev = shown.current
    if (prev.scene === scene && prev.phase === phase) return
    shown.current = { scene, phase }
    engine.current?.go(FRAMES[scene][phase], prev.scene !== scene, reduced)
  }, [scene, phase, reduced])

  // The copy block springs to the height of the incoming text, so the action never jumps.
  useLayoutEffect(() => {
    armedUntil.current = performance.now() + 700
  }, [copyKey])
  useEffect(() => {
    const node = copyInner.current
    if (!node || typeof ResizeObserver === 'undefined') return
    let measured = false
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      if (!measured || reduced || performance.now() > armedUntil.current) {
        measured = true
        copyHeight.jump(next)
        return
      }
      animate(copyHeight, next, motionTokens.spring.smooth)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced, copyHeight])

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    engine.current?.pointer(
      ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    )
  }

  const rise = reduced
    ? {
        initial: { opacity: 0 },
        exit: { opacity: 0, transition: { duration: motionTokens.duration.exit } },
      }
    : {
        initial: { opacity: 0, y: 8, filter: `blur(${motionTokens.blur.soft}px)` },
        exit: {
          opacity: 0,
          y: -6,
          filter: `blur(${motionTokens.blur.soft}px)`,
          transition: { duration: motionTokens.duration.exit, ease: standard },
        },
      }
  const shownText = { opacity: 1, y: 0, filter: 'blur(0px)' }
  const textIn = (delay: number) => ({
    duration: reduced ? motionTokens.duration.standard : motionTokens.duration.considered,
    ease: enter,
    delay: reduced ? 0 : delay,
  })

  return (
    <section className={cn(styles.root, className)} aria-label={t(`empty.art.${scene}.${phase}`)}>
      <div className={cn(styles.panel, compact && styles.compact)}>
        <div
          className={styles.stage}
          onPointerMove={onPointerMove}
          onPointerLeave={() => engine.current?.pointer(0, 0)}
        >
          <svg
            className={styles.art}
            viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
            role="img"
            aria-hidden="true"
          >
            <g ref={ghostLayer} opacity={0} aria-hidden="true">
              {KINDS.map((kind, i) => (
                <path
                  key={i}
                  ref={(node) => {
                    ghosts.current[i] = node
                  }}
                  className={styles.shape}
                  data-kind={kind}
                  d=""
                />
              ))}
            </g>
            <g ref={mainLayer}>
              {paintOf(FRAMES[mount.scene][mount.phase]).map((item, i) => (
                <path
                  key={i}
                  ref={(node) => {
                    paths.current[i] = node
                  }}
                  className={styles.shape}
                  data-kind={KINDS[i]}
                  data-tone={frame.prims[i]!.tone}
                  d={item.d}
                  opacity={item.o}
                  strokeDasharray={item.dash}
                  style={{ transitionDelay: `${DELAY[i]}s` }}
                />
              ))}
            </g>
          </svg>
        </div>

        <div className={styles.copy}>
          <motion.div className={styles.copyFrame} style={{ height: copyHeight }}>
            <div ref={copyInner} className={styles.copyInner}>
              <h2 className={styles.title}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={copy.title}
                    className={styles.swap}
                    initial={rise.initial}
                    animate={shownText}
                    exit={rise.exit}
                    transition={textIn(0.06)}
                  >
                    {copy.title}
                  </motion.span>
                </AnimatePresence>
              </h2>
              <p className={styles.line}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={copy.line}
                    className={styles.swap}
                    initial={rise.initial}
                    animate={shownText}
                    exit={rise.exit}
                    transition={textIn(0.06 + motionTokens.stagger.word)}
                  >
                    {copy.line}
                  </motion.span>
                </AnimatePresence>
              </p>
            </div>
          </motion.div>
          <p className="sr-only" aria-live="polite">
            {copy.title} {copy.line}
          </p>
          {onAction || extra ? (
            <div className={styles.actions}>
              {extra}
              {onAction ? (
                <Button
                  size="sm"
                  onClick={onAction}
                  disabled={phase === 'loading'}
                  aria-busy={phase === 'loading'}
                >
                  {copy.action}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
