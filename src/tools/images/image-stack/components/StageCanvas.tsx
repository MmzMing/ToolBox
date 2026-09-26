import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fitBox, sceneCells, scaleScene, zoomFocus, type Focus } from '../image-stack.service'
import { drawHover, drawPickup, drawSelection, renderSceneToContext } from '../render'
import { IMAGE_DRAG_MIME, useImageStackStore } from '../store'
import { isReady } from '../assets'
import { useContainerWidth } from '../use-container-width'
import { useAssetResolver, useStitchScene } from '../use-scene'

/** 舞台最大高度：给素材条与右侧面板留出空间，页面本身不建滚动容器 */
const MAX_STAGE_HEIGHT = 560
/** 高分屏最多按 2 倍 backing store 画，再高只是白吃显存 */
const MAX_DPR = 2

type LocateEvent = { clientX: number; clientY: number }

/** 一次指针手势：没出格子是调焦点，跨出格子就改判为把图搬去目标格 */
type Gesture = {
  index: number
  lastX: number
  lastY: number
  moved: boolean
  focus: Focus
}

/**
 * 拼接舞台：画面由 canvas 按 previewScene 实时绘制，交互只改 store 里的 focus。
 * 预览与导出共用 renderSceneToContext，所以所见即所得。
 */
export function StageCanvas() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const [wrapRef, availableWidth] = useContainerWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)

  const scene = useStitchScene()
  const resolvePreview = useAssetResolver('preview')
  const items = useImageStackStore((state) => state.items)
  const layers = useImageStackStore((state) => state.layers)
  const selectedCell = useImageStackStore((state) => state.selectedCell)
  const hoverCell = useImageStackStore((state) => state.hoverCell)
  const brushId = useImageStackStore((state) => state.brushId)
  const selectCell = useImageStackStore((state) => state.selectCell)
  const setHoverCell = useImageStackStore((state) => state.setHoverCell)
  const assignCell = useImageStackStore((state) => state.assignCell)
  const swapCells = useImageStackStore((state) => state.swapCells)
  const setCellFocus = useImageStackStore((state) => state.setCellFocus)
  const panCellFocus = useImageStackStore((state) => state.panCellFocus)
  const resetCellFocus = useImageStackStore((state) => state.resetCellFocus)

  const display = useMemo(
    () => fitBox(scene.canvas, availableWidth, MAX_STAGE_HEIGHT),
    [scene.canvas, availableWidth],
  )

  /** 等比缩小后的 scene：布局归一化，所以缩小后与导出几何全等 */
  const preview = useMemo(
    () => (display ? scaleScene(scene, display.scale) : null),
    [scene, display],
  )
  const cells = useMemo(() => (preview ? sceneCells(preview) : []), [preview])

  /** 拎起来的图：跟手的浮层卡片，只在手势跨出源格子后出现 */
  const ghost = useMemo(() => {
    if (!gesture?.moved) {
      return null
    }
    const imageId = layers[gesture.index]?.imageId
    const cell = cells[gesture.index]
    const asset = imageId ? items.find((item) => item.id === imageId) : undefined
    if (!cell || !asset || !isReady(asset)) {
      return null
    }
    return {
      url: asset.thumbUrl,
      x: gesture.lastX,
      y: gesture.lastY,
      width: Math.round(Math.min(200, Math.max(72, cell.width * 0.7))),
      height: Math.round(Math.min(200, Math.max(72, cell.height * 0.7))),
    }
  }, [gesture, layers, cells, items])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !preview || !display) {
      return
    }
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const pixelWidth = Math.max(1, Math.round(display.width * dpr))
    const pixelHeight = Math.max(1, Math.round(display.height * dpr))
    if (canvas.width !== pixelWidth) {
      canvas.width = pixelWidth
    }
    if (canvas.height !== pixelHeight) {
      canvas.height = pixelHeight
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderSceneToContext(context, preview, resolvePreview, { showPlaceholders: true })
    if (selectedCell !== null) {
      const cell = cells[selectedCell]
      if (cell) {
        drawSelection(context, cell)
      }
    }
    if (gesture?.moved) {
      const source = cells[gesture.index]
      if (source) {
        drawPickup(context, source)
      }
    }
    if (hoverCell !== null && hoverCell !== selectedCell) {
      const cell = cells[hoverCell]
      if (cell) {
        drawHover(context, cell)
      }
    }
  }, [preview, display, resolvePreview, selectedCell, hoverCell, gesture, cells])

  const locate = useCallback(
    (event: LocateEvent): number | null => {
      const canvas = canvasRef.current
      if (!canvas) {
        return null
      }
      const box = canvas.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) {
        return null
      }
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      const index = cells.findIndex(
        (cell) =>
          x >= cell.x && x <= cell.x + cell.width && y >= cell.y && y <= cell.y + cell.height,
      )
      return index >= 0 ? index : null
    },
    [cells],
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const index = locate(event)
    if (index === null) {
      selectCell(null)
      return
    }
    selectCell(index)
    if (brushId) {
      assignCell(index, brushId)
      return
    }
    const layer = layers[index]
    if (layer?.imageId) {
      setGesture({
        index,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        focus: layer.focus,
      })
    }
  }

  // 手势期间监听 window：指针冲出画布也能继续跟，不必依赖 pointer capture
  useEffect(() => {
    if (!gesture) {
      return
    }
    const onMove = (event: PointerEvent) => {
      const cell = cells[gesture.index]
      if (!cell) {
        return
      }
      const over = locate(event)
      const inside = over === gesture.index
      if (!gesture.moved && inside) {
        const dx = event.clientX - gesture.lastX
        const dy = event.clientY - gesture.lastY
        setGesture({ ...gesture, lastX: event.clientX, lastY: event.clientY })
        if (cell.width > 0 && cell.height > 0) {
          panCellFocus(gesture.index, dx / cell.width, dy / cell.height)
        }
        return
      }
      if (!gesture.moved) {
        // 刚跨出格子：这段平移不是用户想要的，回滚后再高亮落点
        setCellFocus(gesture.index, gesture.focus)
      }
      setGesture({ ...gesture, lastX: event.clientX, lastY: event.clientY, moved: true })
      setHoverCell(over)
    }
    const onUp = () => {
      const hover = useImageStackStore.getState().hoverCell
      setGesture(null)
      setHoverCell(null)
      if (!gesture.moved) {
        return
      }
      if (hover !== null && hover !== gesture.index) {
        swapCells(gesture.index, hover)
      } else {
        selectCell(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [gesture, cells, locate, panCellFocus, setCellFocus, setHoverCell, swapCells, selectCell])

  // 滚轮缩放格内图片。要 preventDefault 拦住页面滚动，React 的 onWheel 是 passive 监听，
  // 拦不住，所以挂原生监听。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      const index = locate(event)
      const layer = index === null ? undefined : layers[index]
      const cell = index === null ? undefined : cells[index]
      const asset = layer?.imageId ? resolvePreview(layer.imageId) : null
      if (index === null || !layer?.imageId || !cell || !asset) {
        return
      }
      if (cell.width <= 0 || cell.height <= 0) {
        return
      }
      event.preventDefault()
      selectCell(index)
      const box = canvas.getBoundingClientRect()
      const u = (event.clientX - box.left - cell.x) / cell.width
      const v = (event.clientY - box.top - cell.y) / cell.height
      const next = layer.focus.zoom * Math.exp(-event.deltaY * 0.0015)
      setCellFocus(index, zoomFocus(layer.focus, cell, asset.size, next, u, v))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [locate, layers, cells, resolvePreview, selectCell, setCellFocus])

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col items-center gap-2">
      <div
        className="bg-muted flex w-full justify-center overflow-hidden p-3"
        style={display ? { minHeight: display.height + 24 } : undefined}
      >
        {display ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('stage.ariaLabel')}
            className="cursor-grab touch-none shadow-sm select-none active:cursor-grabbing"
            style={{ width: display.width, height: display.height }}
            onPointerDown={handlePointerDown}
            onDoubleClick={(event) => {
              const index = locate(event)
              if (index !== null) {
                resetCellFocus(index)
              }
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(IMAGE_DRAG_MIME)) {
                return
              }
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setHoverCell(locate(event))
            }}
            onDragLeave={() => setHoverCell(null)}
            onDrop={(event) => {
              const imageId = event.dataTransfer.getData(IMAGE_DRAG_MIME)
              const index = locate(event)
              setHoverCell(null)
              event.preventDefault()
              if (imageId && index !== null) {
                assignCell(index, imageId)
              }
            }}
          />
        ) : null}
      </div>

      {ghost ? (
        <div
          aria-hidden
          className="border-border bg-card pointer-events-none fixed z-50 overflow-hidden rounded-lg border p-1 shadow-xl"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
            transform: 'translate(-50%, -50%) rotate(-3deg)',
          }}
        >
          <img src={ghost.url} alt="" className="size-full rounded-md object-cover" />
        </div>
      ) : null}
    </div>
  )
}
