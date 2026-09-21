import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { MIN_SELECTION_SIZE as MIN_SIZE, type Selection } from '../selection'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * 圆点居中压在选区边框线上。子元素的定位基准是 padding box，
 * 而边框有 2px，所以每条边都要再往外挪 1px 才落在线的中线上。
 */
const HANDLES: { key: Handle; className: string; cursor: string }[] = [
  {
    key: 'nw',
    className: '-top-px -left-px -translate-x-1/2 -translate-y-1/2',
    cursor: 'nwse-resize',
  },
  {
    key: 'n',
    className: '-top-px left-1/2 -translate-x-1/2 -translate-y-1/2',
    cursor: 'ns-resize',
  },
  {
    key: 'ne',
    className: '-top-px -right-px translate-x-1/2 -translate-y-1/2',
    cursor: 'nesw-resize',
  },
  {
    key: 'e',
    className: '-right-px top-1/2 translate-x-1/2 -translate-y-1/2',
    cursor: 'ew-resize',
  },
  {
    key: 'se',
    className: '-right-px -bottom-px translate-x-1/2 translate-y-1/2',
    cursor: 'nwse-resize',
  },
  {
    key: 's',
    className: '-bottom-px left-1/2 -translate-x-1/2 translate-y-1/2',
    cursor: 'ns-resize',
  },
  {
    key: 'sw',
    className: '-bottom-px -left-px -translate-x-1/2 translate-y-1/2',
    cursor: 'nesw-resize',
  },
  {
    key: 'w',
    className: '-left-px top-1/2 -translate-x-1/2 -translate-y-1/2',
    cursor: 'ew-resize',
  },
]

type Drag =
  | { kind: 'move'; startX: number; startY: number; origin: Selection }
  | { kind: 'handle'; handle: Handle; startX: number; startY: number; origin: Selection }
  | { kind: 'draw'; startX: number; startY: number }

type BeadStageProps = {
  imageUrl: string
  imageName: string
  /** source = 原图 + 可拖动选区；preview = 同一块位置显示成品图纸 */
  mode: 'source' | 'preview'
  /** 已提交的选区（松手后才更新，拖动过程中只动本地草稿，避免每帧重算量化） */
  selection: Selection
  onCommit: (selection: Selection) => void
  /** 由选区算出格数与徽标文案，父级提供（含颗粒度与每板孔数） */
  describe: (selection: Selection) => { cols: number; rows: number; badge: string }
  /** 锁定宽高比（宽 / 高），null = 自由 */
  aspect: number | null
  /** source 模式：选区里的实时预览 */
  children?: ReactNode
  /** preview 模式：同一位置显示的成品图纸 */
  chart?: ReactNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 图片操作台：整图铺在中间，鼠标圈定有效范围；成品预览直接长在选区里 */
export function BeadStage({
  imageUrl,
  imageName,
  mode,
  selection,
  onCommit,
  describe,
  aspect,
  children,
  chart,
}: BeadStageProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<Selection | null>(null)

  const shown = draft ?? selection
  const { cols, rows, badge } = describe(shown)

  /** 把指针位置换算成图像内的 0..1 坐标 */
  const toImagePoint = useCallback((clientX: number, clientY: number) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 }
    return {
      x: clamp((clientX - box.left) / box.width, 0, 1),
      y: clamp((clientY - box.top) / box.height, 0, 1),
    }
  }, [])

  const applyDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current
      if (!drag) return
      const point = toImagePoint(clientX, clientY)

      if (drag.kind === 'draw') {
        const x = Math.min(drag.startX, point.x)
        const y = Math.min(drag.startY, point.y)
        const width = Math.abs(point.x - drag.startX)
        let height = Math.abs(point.y - drag.startY)
        if (aspect) height = width / aspect
        if (width < MIN_SIZE || height < MIN_SIZE) return
        setDraft(
          fitToFrame(
            { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) },
            aspect,
          ),
        )
        return
      }

      const dx = point.x - drag.startX
      const dy = point.y - drag.startY
      const origin = drag.origin

      if (drag.kind === 'move') {
        setDraft({
          ...origin,
          x: clamp(origin.x + dx, 0, 1 - origin.width),
          y: clamp(origin.y + dy, 0, 1 - origin.height),
        })
        return
      }

      const next = { ...origin }
      const handle = drag.handle
      if (handle.includes('e')) next.width = clamp(origin.width + dx, MIN_SIZE, 1 - origin.x)
      if (handle.includes('s')) next.height = clamp(origin.height + dy, MIN_SIZE, 1 - origin.y)
      if (handle.includes('w')) {
        const right = origin.x + origin.width
        next.x = clamp(origin.x + dx, 0, right - MIN_SIZE)
        next.width = right - next.x
      }
      if (handle.includes('n')) {
        const bottom = origin.y + origin.height
        next.y = clamp(origin.y + dy, 0, bottom - MIN_SIZE)
        next.height = bottom - next.y
      }
      setDraft(fitToFrame(next, aspect))
    },
    [aspect, toImagePoint],
  )

  const isDragging = draft !== null

  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: PointerEvent) => applyDrag(event.clientX, event.clientY)
    const onUp = () => {
      setDraft((current) => {
        if (current) onCommit(current)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, applyDrag, onCommit])

  const startMove = (event: React.PointerEvent) => {
    event.stopPropagation()
    const point = toImagePoint(event.clientX, event.clientY)
    dragRef.current = { kind: 'move', startX: point.x, startY: point.y, origin: selection }
    setDraft(selection)
  }

  const startHandle = (handle: Handle) => (event: React.PointerEvent) => {
    event.stopPropagation()
    const point = toImagePoint(event.clientX, event.clientY)
    dragRef.current = {
      kind: 'handle',
      handle,
      startX: point.x,
      startY: point.y,
      origin: selection,
    }
    setDraft(selection)
  }

  const startDraw = (event: React.PointerEvent) => {
    const point = toImagePoint(event.clientX, event.clientY)
    dragRef.current = { kind: 'draw', startX: point.x, startY: point.y }
    setDraft({ ...selection, width: 0, height: 0 })
  }

  const dim = 'bg-background/65 pointer-events-none absolute'

  return (
    <div className="flex flex-col items-center gap-3 pt-9">
      <div
        ref={frameRef}
        onPointerDown={startDraw}
        // 高度上限只给 img：框子自己再限一次会把边框算进 max-height，
        // 内容盒就比图片矮 2px，选区拉到 100% 也盖不住图片最下面一行
        className="border-border relative cursor-crosshair touch-none border select-none"
      >
        <img
          src={imageUrl}
          alt={imageName}
          draggable={false}
          className={cn('block max-h-[62vh] w-auto max-w-full', mode === 'preview' && 'opacity-25')}
        />

        {/* 两种模式共用同一套选区控件：切到成品预览只是把选区里的内容换成图纸 */}
        <>
          {/* 选区外的压暗层 */}
          <div
            className={dim}
            style={{ left: 0, top: 0, width: `${shown.x * 100}%`, height: '100%' }}
          />
          <div
            className={dim}
            style={{
              left: `${(shown.x + shown.width) * 100}%`,
              top: 0,
              width: `${(1 - shown.x - shown.width) * 100}%`,
              height: '100%',
            }}
          />
          <div
            className={dim}
            style={{
              left: `${shown.x * 100}%`,
              top: 0,
              width: `${shown.width * 100}%`,
              height: `${shown.y * 100}%`,
            }}
          />
          <div
            className={dim}
            style={{
              left: `${shown.x * 100}%`,
              top: `${(shown.y + shown.height) * 100}%`,
              width: `${shown.width * 100}%`,
              height: `${(1 - shown.y - shown.height) * 100}%`,
            }}
          />

          {/* 有效范围：松手后在里面显示成品预览，格线叠在预览之上 */}
          <div
            onPointerDown={startMove}
            className="border-primary absolute cursor-move border-2"
            style={{
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.width * 100}%`,
              height: `${shown.height * 100}%`,
            }}
          >
            {isDragging ? null : mode === 'preview' ? (
              <div className="absolute inset-0 overflow-hidden">{chart}</div>
            ) : (
              children
            )}
            <div
              aria-hidden
              className="bead-grid-lines pointer-events-none absolute inset-0"
              style={{ backgroundSize: `${100 / cols}% ${100 / rows}%` }}
            />
            <div
              aria-hidden
              className="bead-grid-rulers pointer-events-none absolute inset-0"
              style={{ backgroundSize: `${(10 * 100) / cols}% ${(10 * 100) / rows}%` }}
            />
            {HANDLES.map((handle) => (
              <span
                key={handle.key}
                onPointerDown={startHandle(handle.key)}
                aria-hidden
                className={cn(
                  'bg-background border-primary absolute size-3 rounded-full border-2',
                  handle.className,
                )}
                style={{ cursor: handle.cursor }}
              />
            ))}
          </div>
        </>

        <span
          className="bg-card border-border text-foreground absolute -top-8 left-0 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums"
          style={{ transform: `translateX(${shown.x * 100}%)` }}
        >
          {badge}
        </span>
      </div>
    </div>
  )
}

/** 锁定比例时把选区收进画面内 */
function fitToFrame(next: Selection, aspect: number | null): Selection {
  if (!aspect) return next
  let { width, height } = next
  if (width / height > aspect) width = height * aspect
  else height = width / aspect
  width = Math.min(width, 1)
  height = Math.min(height, 1)
  return {
    x: clamp(next.x, 0, 1 - width),
    y: clamp(next.y, 0, 1 - height),
    width,
    height,
  }
}
