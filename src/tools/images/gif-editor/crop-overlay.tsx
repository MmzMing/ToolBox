import { useRef } from 'react'

import {
  MIN_CREATE_EDGE,
  clampRect,
  rectFromDrag,
  resizeRect,
  type Bounds,
  type CropHandle,
  type Point,
  type Rect,
} from '@/modules/gif/crop'

const HANDLES: { mode: CropHandle; place: string; cursor: string }[] = [
  { mode: 'nw', place: 'left-0 top-0', cursor: 'cursor-nwse-resize' },
  { mode: 'ne', place: 'left-full top-0', cursor: 'cursor-nesw-resize' },
  { mode: 'sw', place: 'left-0 top-full', cursor: 'cursor-nesw-resize' },
  { mode: 'se', place: 'left-full top-full', cursor: 'cursor-nwse-resize' },
]

type DragState =
  | {
      mode: CropHandle
      origin: Rect
      startX: number
      startY: number
      scale: Scale
    }
  | {
      mode: 'create'
      /** 按下那一刻在帧坐标系里的位置，即新框的锚角 */
      anchor: Point
      stageLeft: number
      stageTop: number
      scale: Scale
    }

/** 每 CSS 像素代表多少帧像素；横纵分开算，布局还没稳定时也不会把框拖歪 */
type Scale = { x: number; y: number }

function toFrame(value: number, origin: number, unitsPerPx: number, limit: number): number {
  return Math.min(Math.max((value - origin) * unitsPerPx, 0), limit)
}

type CropOverlayProps = {
  stageRef: { current: HTMLDivElement | null }
  rect: Rect
  bounds: Bounds
  ratio: number | null
  onChange: (rect: Rect) => void
  /** 一次拖拽开始时回调一次，供外层压撤销快照（拖拽中的每一像素不该各占一步） */
  onBegin?: () => void
}

/**
 * 裁剪框浮层：空白处拖拽框出新区域、整块平移、四角缩放。
 * 位置一律用百分比表达，所以 canvas 被 CSS 缩放成多大都不影响框的形状；
 * 只有拖拽那一刻才去量 stage 的实际像素尺寸做换算。
 */
export function CropOverlay({
  stageRef,
  rect,
  bounds,
  ratio,
  onChange,
  onBegin,
}: CropOverlayProps) {
  const dragRef = useRef<DragState | null>(null)

  // 单一处理器 + data-mode 派发，而不是渲染期给每个模式生成一个闭包：
  // 后者会被 React Compiler 判定为「渲染期间写 ref」，且每次渲染都新建函数。
  const begin = (event: React.PointerEvent) => {
    const mode = (event.currentTarget as HTMLElement).dataset.mode as DragState['mode'] | undefined
    const stage = stageRef.current
    if (!mode || !stage) return
    const box = stage.getBoundingClientRect()
    const scale: Scale = {
      x: bounds.width / box.width,
      y: bounds.height / box.height,
    }
    event.preventDefault()
    event.stopPropagation()
    onBegin?.()
    dragRef.current =
      mode === 'create'
        ? {
            mode,
            scale,
            stageLeft: box.left,
            stageTop: box.top,
            anchor: {
              x: toFrame(event.clientX, box.left, scale.x, bounds.width),
              y: toFrame(event.clientY, box.top, scale.y, bounds.height),
            },
          }
        : {
            mode,
            origin: rect,
            startX: event.clientX,
            startY: event.clientY,
            scale,
          }
    // 捕获在触发元素上：手柄是裁剪框的子节点，事件仍会冒泡到框上的 move 监听。
    // 不必显式 release —— 指针抬起时浏览器会自动释放捕获。
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const move = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'create') {
      const to = {
        x: toFrame(event.clientX, drag.stageLeft, drag.scale.x, bounds.width),
        y: toFrame(event.clientY, drag.stageTop, drag.scale.y, bounds.height),
      }
      const next = rectFromDrag(drag.anchor, to, ratio, bounds)
      // 起框头几像素太碎，直接写回会被 clampRect 撑成一个点，看着像卡住了
      if (next.width >= MIN_CREATE_EDGE && next.height >= MIN_CREATE_EDGE) {
        onChange(next)
      }
      return
    }
    const dx = Math.round((event.clientX - drag.startX) * drag.scale.x)
    const dy = Math.round((event.clientY - drag.startY) * drag.scale.y)
    onChange(clampRect(resizeRect(drag.origin, drag.mode, dx, dy, ratio, bounds), bounds))
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
      {/* 起框层铺满整块画面；裁剪框与手柄在它之后渲染，所以永远压在上面 */}
      <div
        data-mode="create"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
      />
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
