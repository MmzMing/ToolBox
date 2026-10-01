import { useRef } from 'react'

import { clampRect, sizeForRatio, type Bounds, type Rect } from '@/modules/gif/crop'

type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

type DragState = {
  mode: Mode
  startX: number
  startY: number
  origin: Rect
  /** 每 CSS 像素代表多少帧像素 */
  unitsPerPx: number
}

const HANDLES: { mode: Mode; place: string; cursor: string }[] = [
  { mode: 'nw', place: 'left-0 top-0', cursor: 'cursor-nwse-resize' },
  { mode: 'ne', place: 'left-full top-0', cursor: 'cursor-nesw-resize' },
  { mode: 'sw', place: 'left-0 top-full', cursor: 'cursor-nesw-resize' },
  { mode: 'se', place: 'left-full top-full', cursor: 'cursor-nwse-resize' },
]

/** 由锚点（拖拽方向的对角）+ 位移推出新框 */
function nextRect(
  mode: Mode,
  origin: Rect,
  dx: number,
  dy: number,
  ratio: number | null,
  bounds: Bounds,
): Rect {
  if (mode === 'move') {
    return { ...origin, x: origin.x + dx, y: origin.y + dy }
  }
  const right = origin.x + origin.width
  const bottom = origin.y + origin.height
  const west = mode === 'nw' || mode === 'sw'
  const north = mode === 'nw' || mode === 'ne'

  let width = west ? origin.x - dx : origin.width + dx
  let height = north ? origin.y - dy : origin.height + dy

  if (ratio) {
    const sized = sizeForRatio(width, height, ratio, bounds)
    width = sized.width
    height = sized.height
  }

  return {
    x: west ? right - width : origin.x,
    y: north ? bottom - height : origin.y,
    width,
    height,
  }
}

type CropOverlayProps = {
  stageRef: { current: HTMLDivElement | null }
  rect: Rect
  bounds: Bounds
  ratio: number | null
  onChange: (rect: Rect) => void
}

/**
 * 裁剪框浮层：整块拖动平移、四角缩放。
 * 位置一律用百分比表达，所以 canvas 被 CSS 缩放成多大都不影响框的形状；
 * 只有拖拽那一刻才去量 stage 的实际像素尺寸做换算。
 */
export function CropOverlay({ stageRef, rect, bounds, ratio, onChange }: CropOverlayProps) {
  const dragRef = useRef<DragState | null>(null)

  // 单一处理器 + data-mode 派发，而不是渲染期生成 5 个闭包：
  // 后者会被 React Compiler 判定为「渲染期间写 ref」，且每次渲染都新建函数。
  const begin = (event: React.PointerEvent) => {
    const mode = (event.currentTarget as HTMLElement).dataset.mode as Mode | undefined
    const stage = stageRef.current
    if (!mode || !stage) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: rect,
      unitsPerPx: bounds.width / stage.getBoundingClientRect().width,
    }
    // 捕获在触发元素上：手柄是裁剪框的子节点，事件仍会冒泡到框上的 move 监听。
    // 不必显式 release —— 指针抬起时浏览器会自动释放捕获。
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = Math.round((event.clientX - drag.startX) * drag.unitsPerPx)
    const dy = Math.round((event.clientY - drag.startY) * drag.unitsPerPx)
    onChange(clampRect(nextRect(drag.mode, drag.origin, dx, dy, ratio, bounds), bounds))
  }

  const end = () => {
    dragRef.current = null
  }

  const box = {
    left: `${(rect.x / bounds.width) * 100}%`,
    top: `${(rect.y / bounds.height) * 100}%`,
    width: `${(rect.width / bounds.width) * 100}%`,
    height: `${(rect.height / bounds.height) * 100}%`,
  }
  const band = 'bg-background/60 absolute'

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className={band} style={{ left: 0, right: 0, top: 0, height: box.top }} />
      <div
        className={band}
        style={{ left: 0, right: 0, top: `calc(${box.top} + ${box.height})`, bottom: 0 }}
      />
      <div
        className={band}
        style={{ left: 0, top: box.top, width: box.left, height: box.height }}
      />
      <div
        className={band}
        style={{
          top: box.top,
          height: box.height,
          left: `calc(${box.left} + ${box.width})`,
          right: 0,
        }}
      />
      <div
        data-mode="move"
        style={box}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="border-primary pointer-events-auto absolute cursor-move touch-none border-2"
      >
        {HANDLES.map((handle) => (
          <span
            key={handle.mode}
            data-mode={handle.mode}
            onPointerDown={begin}
            className={`bg-primary absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm ${handle.place} ${handle.cursor}`}
          />
        ))}
      </div>
    </div>
  )
}
