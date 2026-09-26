import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fitBox, panFocus, zoomFocus } from '../image-stack.service'
import { useImageStackStore } from '../store'
import { useContainerWidth } from '../use-container-width'
import { useSplitGeometry } from '../use-scene'

const MAX_SPLIT_HEIGHT = 560

/**
 * 拆分预览：不走 canvas，用 <img> 加一层 CSS Grid 切割线。
 * 源图按裁切框放大位移对齐，容器比例即裁切框比例，所以切割线落点与导出一致。
 * 拖拽与滚轮改的都是 splitFocus（裁切框在源图里的位置与缩放），所以预览即成品。
 */
export function SplitPreview() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const [wrapRef, availableWidth] = useContainerWidth<HTMLDivElement>()
  const geometry = useSplitGeometry()
  const splitFocus = useImageStackStore((state) => state.splitFocus)
  const setSplitFocus = useImageStackStore((state) => state.setSplitFocus)
  const resetSplitFocus = useImageStackStore((state) => state.resetSplitFocus)
  const boxRef = useRef<HTMLDivElement>(null)
  const lastPoint = useRef({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const display = useMemo(
    () =>
      geometry
        ? fitBox(
            { width: geometry.crop.width, height: geometry.crop.height },
            availableWidth,
            MAX_SPLIT_HEIGHT,
          )
        : null,
    [geometry, availableWidth],
  )

  const cols = geometry?.template.cols.length ?? 0
  const rows = geometry?.template.rows.length ?? 0

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    lastPoint.current = { x: event.clientX, y: event.clientY }
    setIsDragging(true)
  }, [])

  // 手势期间监听 window：指针冲出裁切框也能继续跟
  useEffect(() => {
    if (!isDragging || !display) {
      return
    }
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - lastPoint.current.x
      const dy = event.clientY - lastPoint.current.y
      lastPoint.current = { x: event.clientX, y: event.clientY }
      if (display.width <= 0 || display.height <= 0) {
        return
      }
      const focus = useImageStackStore.getState().splitFocus
      setSplitFocus(panFocus(focus, dx / display.width, dy / display.height))
    }
    const stop = () => setIsDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [isDragging, display, setSplitFocus])

  // 滚轮缩放要 preventDefault 拦住页面滚动，React 的 onWheel 是 passive 监听拦不住
  useEffect(() => {
    const box = boxRef.current
    if (!box || !geometry || !display) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      if (display.width <= 0 || display.height <= 0) {
        return
      }
      event.preventDefault()
      const rect = box.getBoundingClientRect()
      const next = splitFocus.zoom * Math.exp(-event.deltaY * 0.0015)
      setSplitFocus(
        zoomFocus(
          splitFocus,
          { width: display.width, height: display.height },
          { width: geometry.source.width, height: geometry.source.height },
          next,
          (event.clientX - rect.left) / rect.width,
          (event.clientY - rect.top) / rect.height,
        ),
      )
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [geometry, display, splitFocus, setSplitFocus])

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col items-center gap-2">
      <div className="bg-muted flex w-full justify-center p-3">
        {geometry && display ? (
          <div
            ref={boxRef}
            onPointerDown={handlePointerDown}
            onDoubleClick={resetSplitFocus}
            className={
              isDragging
                ? 'relative cursor-grabbing touch-none overflow-hidden'
                : 'relative cursor-grab touch-none overflow-hidden'
            }
            style={{ width: display.width, height: display.height }}
          >
            <img
              src={geometry.source.thumbUrl}
              alt={geometry.source.name}
              draggable={false}
              className="absolute max-w-none"
              style={{
                width: `${(geometry.source.width / geometry.crop.width) * 100}%`,
                height: `${(geometry.source.height / geometry.crop.height) * 100}%`,
                left: `${(-geometry.crop.x / geometry.crop.width) * 100}%`,
                top: `${(-geometry.crop.y / geometry.crop.height) * 100}%`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 grid"
              style={{
                gridTemplateColumns: geometry.template.cols
                  .map((weight) => `${weight}fr`)
                  .join(' '),
                gridTemplateRows: geometry.template.rows.map((weight) => `${weight}fr`).join(' '),
              }}
            >
              {Array.from({ length: cols * rows }, (_, index) => {
                const row = Math.floor(index / cols)
                const col = index % cols
                return (
                  <div
                    key={`${row}-${col}`}
                    // 切割线画在用户照片上，不是主题化表面，浅色半透明才在任何图上都看得见
                    className="relative border border-dashed border-white/75"
                  >
                    <span className="absolute top-0.5 left-0.5 rounded bg-black/45 px-1 font-mono text-[10px] text-white tabular-nums">
                      {row + 1}-{col + 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground py-20 text-sm">{t('split.noSource')}</p>
        )}
      </div>

      {geometry ? (
        <p className="text-muted-foreground text-center text-xs">
          {t('split.summary', {
            cols,
            rows,
            total: cols * rows,
            width: geometry.cells[0]?.width ?? 0,
            height: geometry.cells[0]?.height ?? 0,
          })}
        </p>
      ) : null}
    </div>
  )
}
