import { Handle, type Position } from '@xyflow/react'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

/** ::after 撑出的可点击余量，与 index.css 里的 inset 保持一致：
 *  朝节点外给足，探进节点内只留一点，上下各留一点 */
const OUTWARD = 30
const INWARD = 8
const PAD = 10

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

/**
 * 加号跟手：只写 CSS 变量，不 setState，免得每次移动都重渲染节点。
 *
 * 画布带缩放，而 client 坐标是屏幕像素、CSS 变量按未变换的本地位数解释，
 * 所以先用「元素屏幕宽 / 元素布局宽」还原缩放系数，再把鼠标位置换算成本位偏移；
 * 跟随范围取「把手本体 + ::after 余量」，于是热区内任意一点加号都正好压在鼠标下。
 */
function trackKnob(event: React.PointerEvent<HTMLDivElement>) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  const scale = rect.width / el.offsetWidth || 1
  const half = el.offsetWidth / 2
  const left = el.classList.contains('react-flow__handle-left')
  const x = (event.clientX - (rect.left + rect.width / 2)) / scale
  const y = (event.clientY - rect.top) / scale
  const kx = left
    ? clamp(x, -(half + OUTWARD), half + INWARD)
    : clamp(x, -(half + INWARD), half + OUTWARD)
  const ky = clamp(y, -PAD, el.offsetHeight + PAD)
  el.style.setProperty('--kx', `${Math.round(kx)}px`)
  el.style.setProperty('--ky', `${Math.round(ky)}px`)
}

function resetKnob(event: React.PointerEvent<HTMLDivElement>) {
  event.currentTarget.style.removeProperty('--kx')
  event.currentTarget.style.removeProperty('--ky')
}

/**
 * 贴着节点侧边中点的连接热区：一段有限大小的活动区，加号在其中跟手二维游动，
 * 静止时停在侧边外一点。热区中心压在侧边中点上，所以 React Flow 算出的连线端点不变。
 * invisible 用于不可连的一侧：既不显示也不吃事件，免得挡住节点拖拽。
 */
export function LinkZone({
  type,
  position,
  invisible = false,
}: {
  type: 'source' | 'target'
  position: Position
  invisible?: boolean
}) {
  return (
    <Handle
      type={type}
      position={position}
      isConnectable={!invisible}
      className={cn('canvas-link-zone', invisible && 'pointer-events-none opacity-0')}
      onPointerMove={invisible ? undefined : trackKnob}
      onPointerLeave={invisible ? undefined : resetKnob}
    >
      {invisible ? null : (
        <span className="canvas-link-knob">
          <Plus className="size-3" />
        </span>
      )}
    </Handle>
  )
}
