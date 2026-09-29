import { useStore } from '@xyflow/react'
import { ulid } from 'ulid'
import { useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { rulerStepOf, rulerTicksOf } from '../ai-image-gen.service'
import { useAiImageGenStore, type Guide } from '../store'

/** 落点离画布边多远算回到尺上（尺身厚 22px，再给一点余量） */
const DROP_BACK_PX = 30

type Drag = { axis: 'x' | 'y'; pos: number; id: string | null }

/**
 * 画布标尺与参考线。
 *
 * 尺身只画在四条边内的 22px 里，刻度按当前缩放现算，所以平移与缩放时它自己会跟着走；
 * 参考线存的是画布坐标而不是屏幕坐标，因此同一根线在任何缩放下都钉在同一处。
 * 从尺上拖出即新建，拖回尺上即删除，一条路径同时管增、移、删。
 */
export function Rulers() {
  const rulersOn = useAiImageGenStore((state) => state.rulersOn)
  const guidesOn = useAiImageGenStore((state) => state.guidesOn)
  const guides = useAiImageGenStore((state) => state.guides)
  const setGuides = useAiImageGenStore((state) => state.setGuides)
  const [tx, ty, zoom] = useStore((state) => state.transform)
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const step = rulerStepOf(zoom)
  const xTicks = rulerTicksOf(-tx / zoom, (width - tx) / zoom, step)
  const yTicks = rulerTicksOf(-ty / zoom, (height - ty) / zoom, step)

  const flowAt = (event: React.PointerEvent, axis: 'x' | 'y') => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) {
      return 0
    }
    return axis === 'x'
      ? (event.clientX - rect.left - tx) / zoom
      : (event.clientY - rect.top - ty) / zoom
  }

  const begin = (event: React.PointerEvent, axis: 'x' | 'y', id: string | null) => {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ axis, id, pos: flowAt(event, axis) })
  }

  const move = (event: React.PointerEvent) => {
    if (!drag) {
      return
    }
    setDrag({ ...drag, pos: flowAt(event, drag.axis) })
  }

  /** 松手：落在尺上即抹掉，否则按新位置写回（新建与挪动走同一段） */
  const finish = (event: React.PointerEvent) => {
    if (!drag) {
      return
    }
    const rect = rootRef.current?.getBoundingClientRect()
    const screen = rect
      ? drag.axis === 'x'
        ? event.clientX - rect.left
        : event.clientY - rect.top
      : DROP_BACK_PX
    const next = guides.filter((item) => item.id !== drag.id)
    if (screen > DROP_BACK_PX) {
      next.push({ id: drag.id ?? ulid(), axis: drag.axis, pos: Math.round(drag.pos) })
    }
    setGuides(next)
    setDrag(null)
  }

  const lineOf = (guide: Guide) =>
    guide.axis === 'x'
      ? { left: guide.pos * zoom + tx, top: 0, width: 0, height }
      : { left: 0, top: guide.pos * zoom + ty, width, height: 0 }

  const shown = guidesOn ? guides : []
  const dragging =
    drag && guidesOn ? { ...lineOf({ id: '', axis: drag.axis, pos: drag.pos }) } : null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {shown.map((guide) => {
        const box = lineOf(guide)
        return (
          <div
            key={guide.id}
            role="separator"
            aria-label={guide.axis === 'x' ? `x ${guide.pos}` : `y ${guide.pos}`}
            className="group/guide pointer-events-auto absolute"
            style={{
              left: box.left - (guide.axis === 'x' ? 4 : 0),
              top: box.top - (guide.axis === 'y' ? 4 : 0),
              width: guide.axis === 'x' ? 9 : box.width,
              height: guide.axis === 'y' ? 9 : box.height,
              cursor: guide.axis === 'x' ? 'ew-resize' : 'ns-resize',
            }}
            onPointerDown={(event) => begin(event, guide.axis, guide.id)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => setDrag(null)}
          >
            <span
              className={cn(
                'bg-primary/70 group-hover/guide:bg-primary pointer-events-none absolute transition-colors',
                guide.axis === 'x'
                  ? 'inset-y-0 left-1/2 w-px -translate-x-1/2'
                  : 'top-1/2 right-0 left-0 h-px -translate-y-1/2',
              )}
            />
          </div>
        )
      })}

      {dragging ? (
        <span
          aria-hidden
          className="border-primary absolute border-dashed"
          style={
            drag?.axis === 'x'
              ? { left: dragging.left, top: 0, height: dragging.height, borderWidth: '0 0 0 1px' }
              : { top: dragging.top, left: 0, width: dragging.width, borderWidth: '1px 0 0 0' }
          }
        />
      ) : null}

      {rulersOn ? (
        <>
          <div
            className="bg-card/95 border-border text-muted-foreground pointer-events-auto absolute inset-x-0 top-0 h-[22px] cursor-ns-resize border-b select-none"
            onPointerDown={(event) => begin(event, 'y', null)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => setDrag(null)}
          >
            {xTicks.map((tick) => (
              <span
                key={tick}
                className="border-border/70 absolute top-0 h-full border-l pl-0.5 text-[9px] leading-[22px] tabular-nums"
                style={{ left: tick * zoom + tx }}
              >
                {tick}
              </span>
            ))}
          </div>
          <div
            className="bg-card/95 border-border text-muted-foreground pointer-events-auto absolute inset-y-0 left-0 w-[22px] cursor-ew-resize border-r select-none"
            onPointerDown={(event) => begin(event, 'x', null)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={() => setDrag(null)}
          >
            {yTicks.map((tick) => (
              <span
                key={tick}
                className="border-border/70 absolute right-0.5 text-[9px] tabular-nums"
                style={{ top: tick * zoom + ty }}
              >
                {tick}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
