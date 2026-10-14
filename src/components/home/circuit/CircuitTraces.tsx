import { useEffect, useId, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import type { CategoryKey } from '@/tools/categories'

import {
  buildTraces,
  circuitIndexOf,
  FLOW_TRAVEL,
  introOf,
  type BoardLayout,
} from './circuit-layout'

/**
 * 电路走线层：一块铺满版图的 SVG。
 *
 * 由下往上：线本体（九条同色的一根中性导管，不带分类色）、沿线跑的一束流星光。
 * 颜色只属于流星：这样"路"和"跑在路上的东西"一眼分得开，
 * 九条线也不会因为各自有色而把整块板子读成九截霓虹。
 *
 * 一束光 = 一段 dash 长度固定的亮线，配一个跟着光头走的 userSpaceOnUse 线性渐变
 * （尾端透明 → 头部最亮）。渐变必须逐帧把两端对齐到路径上的真实坐标，
 * 所以这一层由 rAF 驱动，而不是 CSS 关键帧：CSS 只能推进 dashoffset，
 * 推不动渐变的两端，于是拖尾会脱离路径方向，看着就是一截等高不透明的亮线
 * ——那正是"光悬在线外"的成因。
 *
 * dash 用真实路径长度（user 单位）表达，所以这里不写 pathLength，
 * 归一化只留给入场那段"从核心画向芯片"的导管。
 */
export function CircuitTraces({
  layout,
  focus,
}: {
  layout: BoardLayout
  /** 正被 hover / 键盘聚焦的分类：其余走线上的光束压暗 */
  focus: CategoryKey | null
}) {
  const traces = useMemo(() => buildTraces(layout), [layout])
  const intro = useMemo(() => introOf(layout), [layout])
  const uid = 'circuit' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const reduced = usePrefersReducedMotion()

  /** 每颗分类三个节点：量长度的导管、被 rAF 写 opacity 的光束组、跟着跑的渐变 */
  const lineRefs = useRef<(SVGPathElement | null)[]>([])
  const beamRefs = useRef<(SVGGElement | null)[]>([])
  const gradRefs = useRef<(SVGLinearGradientElement | null)[]>([])
  // 循环读 hover 焦点而不因此重启
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  useEffect(() => {
    if (reduced) {
      return
    }
    const lengths = traces.map((_, i) => lineRefs.current[i]?.getTotalLength() ?? 0)
    // 拖尾长度只取决于线长，量一次就固定下来，dasharray 不必每帧重写
    const segs = lengths.map((L) => Math.min(TAIL_MAX, L * TAIL_RATIO))
    beamRefs.current.forEach((beam, i) => {
      if (!beam || !lengths[i]) {
        return
      }
      for (const path of Array.from(beam.children)) {
        ;(path as SVGPathElement).style.strokeDasharray = `${segs[i]} ${lengths[i] + segs[i]}`
      }
    })
    let raf = 0

    const frame = (now: number) => {
      const sec = now / 1000
      traces.forEach((trace, i) => {
        const line = lineRefs.current[i]
        const beam = beamRefs.current[i]
        const grad = gradRefs.current[i]
        const L = lengths[i]
        const seg = segs[i]
        if (!line || !beam || !grad || !L || !seg) {
          return
        }
        // 与 CSS 充电背光同一条相位公式
        const progress = ((sec - trace.flow.delay) / trace.flow.duration) % 1
        const elapsed = progress * trace.flow.duration
        if (elapsed >= FLOW_TRAVEL) {
          // 空窗：整发没入芯片，只留导管
          beam.style.opacity = '0'
          return
        }
        const focused = focusRef.current === null || focusRef.current === trace.category
        beam.style.opacity = focused ? '1' : '0.06'
        const head = easeInOut(elapsed / FLOW_TRAVEL) * (L + seg)
        for (const path of Array.from(beam.children)) {
          ;(path as SVGPathElement).style.strokeDashoffset = `${seg - head}`
        }
        // 渐变沿"尾 → 头"铺开，于是尾巴真的顺着路径渐隐下去
        const tail = line.getPointAtLength(Math.max(0, Math.min(L, head - seg)))
        const tip = line.getPointAtLength(Math.max(0, Math.min(L, head)))
        grad.setAttribute('x1', `${tail.x}`)
        grad.setAttribute('y1', `${tail.y}`)
        grad.setAttribute('x2', `${tip.x + (tail.x === tip.x && tail.y === tip.y ? 0.01 : 0)}`)
        grad.setAttribute('y2', `${tip.y}`)
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [traces, reduced])

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        {traces.map((trace, i) => (
          <linearGradient
            key={trace.category}
            id={`${uid}-g${i}`}
            gradientUnits="userSpaceOnUse"
            className="circuit-flow-grad"
            ref={(element) => {
              gradRefs.current[i] = element
            }}
            style={{ '--circuit-trace-color': circuitColor(trace.category) } as CSSProperties}
          >
            <stop offset="0" className="circuit-flow-tail" />
            <stop offset="0.55" className="circuit-flow-body" />
            <stop offset="1" className="circuit-flow-head" />
          </linearGradient>
        ))}
      </defs>

      {/* 线本体：九条共用一根中性导管，常态不发光也不带分类色——颜色只属于跑在里面的流星，
          于是线是"路"、光是"车"，一眼分得开。
          拐角在 path 里已抹成圆弧，两端直接抵住芯片边，不画焊盘圆圈。
          入场时从核心一侧起笔画向芯片，延迟与芯片弹出同一顺时针序 */}
      <g>
        {traces.map((trace) => (
          <path
            key={trace.category}
            d={trace.path}
            pathLength={1}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            stroke="var(--circuit-line)"
            className="circuit-trace-draw"
            style={{ '--circuit-in-delay': `${intro.trace[trace.category]}s` } as CSSProperties}
          />
        ))}
      </g>

      {/* 流星：等走线全部画完再淡入，否则线还没接通就先看见光头在跑。
          粗而糊的一层当辉光，细而锐的一层当本体，两层共用同一个渐变与 dash 偏移，
          锐利那层与导管同宽，所以亮头始终被线框住，不会糊到线外 */}
      <g
        className="circuit-fade-in"
        style={{ '--circuit-in-delay': `${intro.flow}s` } as CSSProperties}
      >
        {traces.map((trace, i) => {
          const stroke = `url(#${uid}-g${i})`
          return (
            <g
              key={trace.category}
              className="circuit-comet"
              style={{ opacity: 0 }}
              ref={(element) => {
                beamRefs.current[i] = element
              }}
            >
              <path
                d={trace.path}
                fill="none"
                stroke={stroke}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.35}
                style={{ filter: 'blur(2px)' }}
              />
              <path
                ref={(element) => {
                  lineRefs.current[i] = element
                }}
                d={trace.path}
                fill="none"
                stroke={stroke}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/** 拖尾占该条线长的比例与上限（user 单位）：短线按比例、长线截断，免得尾巴盖住整块板 */
const TAIL_RATIO = 0.3
const TAIL_MAX = 90

/** 光头进出自如：起步与抵达都软下来，而不是匀速滑过 */
function easeInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

function circuitColor(category: CategoryKey): string {
  return `var(--circuit-${circuitIndexOf(category)})`
}
