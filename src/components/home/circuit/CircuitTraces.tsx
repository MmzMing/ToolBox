import type { CSSProperties } from 'react'
import { useMemo } from 'react'

import type { CategoryKey } from '@/tools/categories'

import {
  buildTraces,
  circuitIndexOf,
  introOf,
  type BoardLayout,
  type Trace,
} from './circuit-layout'

/**
 * 电路走线层：一块铺满版图的 SVG。
 *
 * 由下往上：线本体（常态只是分类默认色的暗导管，不发光）、
 * 沿线跑的流星光（发光只属于流星：宽糊尾 + 中尾 + 核尾 + 亮头 + 白核五点叠成）、
 * 最后是焊盘与过孔。
 *
 * 流星光用 pathLength={1} 把整条线归一化成"1"，于是 dasharray/dashoffset 都是占比，
 * 九条长短悬殊的走线能共用同一段 keyframes，速度差只由 duration 决定。
 * 一条彗星 = 七层 dash 分进三档 blur 组：宽尾重糊淡出、窄头轻糊提亮，
 * 各层 gap + dash 恒为同一常量让亮头对齐，叠出来是一团极光在飘而不是一截线段。
 */
export function CircuitTraces({ layout }: { layout: BoardLayout }) {
  const traces = useMemo(() => buildTraces(layout), [layout])
  const intro = useMemo(() => introOf(layout), [layout])

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {/* 线本体：常态不发光，只是一根半透明导管，光只属于跑在里面的流星；
          拐角在 path 里已抹成圆弧，两端直接抵住芯片边，不画焊盘圆圈。
          入场时从核心一侧起笔画向芯片，延迟与芯片弹出同一顺时针序 */}
      <g opacity={0.3}>
        {traces.map((trace) => (
          <path
            key={trace.category}
            d={trace.path}
            pathLength={1}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            stroke={circuitColor(trace.category)}
            className="circuit-trace-draw"
            style={{ '--circuit-in-delay': `${intro.trace[trace.category]}s` } as CSSProperties}
          />
        ))}
      </g>

      {/* 极光脉冲：等走线全部画完再淡入，否则线还没接通就先看见光头在跑。
          四层细线叠成一发"光头"——宽糊晕只做极淡的外发光，
          主体是与导管同宽的细亮线，拖尾只留全程的 12%，
          冲到头就整发没入焊盘消失（扫程 >1 造出停歇空窗），
          停一拍再发下一发，不是一条拖着长尾巴的光管 */}
      <g
        className="circuit-fade-in"
        style={{ '--circuit-in-delay': `${intro.flow}s` } as CSSProperties}
      >
        <g style={{ filter: 'blur(4px)' }} opacity={0.5}>
          {traces.map((trace) => (
            <CometLayer
              key={trace.category}
              trace={trace}
              layer="a"
              dash={0.12}
              width={4.5}
              opacity={0.3}
            />
          ))}
        </g>
        <g style={{ filter: 'blur(1.5px)' }} opacity={0.85}>
          {traces.map((trace) => (
            <CometLayer
              key={trace.category}
              trace={trace}
              layer="b"
              dash={0.06}
              width={2.2}
              opacity={0.75}
            />
          ))}
        </g>
        <g style={{ filter: 'blur(0.8px)' }}>
          {traces.map((trace) => (
            <CometLayer
              key={trace.category}
              trace={trace}
              layer="c"
              dash={0.018}
              width={2.4}
              opacity={1}
              head
            />
          ))}
          {traces.map((trace) => (
            <CometLayer
              key={`${trace.category}-c`}
              trace={trace}
              layer="d"
              dash={0.007}
              width={1.3}
              opacity={0.9}
              core
            />
          ))}
        </g>
      </g>
    </svg>
  )
}

/**
 * 彗星的一层。图案只写「ON 拖尾 + OFF 余量」两值（dasharray 从 ON 段开始数，
 * 多写前导间隙会把余量段变成第二截亮线）；扫程 PERIOD = 1 + IDLE，
 * 光头没入焊盘后整条 dash 走在路径外，停一拍再发下一发。
 * 四层共用"亮头对齐"这件事交给四组固定值 keyframes（每层起点 = 本层 dash 长），
 * 关键帧里不出现 var，动画就不会被浏览器静默丢弃。
 */
const PERIOD = 1.45

type CometLayerKey = 'a' | 'b' | 'c' | 'd'

type CometLayerProps = {
  trace: Trace
  layer: CometLayerKey
  /** 本层拖尾占全程的比例；头层与白核取极小值，round cap 把它们撑成亮斑 */
  dash: number
  width: number
  opacity: number
  /** 彗星头：混一点白，比尾巴亮一档才像光源 */
  head?: boolean
  /** 白核：头里最亮的一点纯白，"光源"的灯珠 */
  core?: boolean
}

function CometLayer({
  trace,
  layer,
  dash,
  width,
  opacity,
  head = false,
  core = false,
}: CometLayerProps) {
  const color = circuitColor(trace.category)
  const stroke = core ? 'white' : head ? `color-mix(in oklch, ${color} 45%, white)` : color
  return (
    <path
      d={trace.path}
      pathLength={1}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      className={`circuit-comet circuit-comet-${layer}`}
      style={
        {
          strokeDasharray: `${dash} ${PERIOD - dash}`,
          '--circuit-flow-duration': `${trace.flow.duration}s`,
          '--circuit-flow-delay': `${trace.flow.delay}s`,
        } as CSSProperties
      }
    />
  )
}

function circuitColor(category: CategoryKey): string {
  return `var(--circuit-${circuitIndexOf(category)})`
}
