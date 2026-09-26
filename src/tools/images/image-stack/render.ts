import {
  sceneCells,
  resolvePlacement,
  type Rect,
  type Scene,
  type Size,
} from './image-stack.service'

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** 按 imageId 取位图；缺失（解码中 / 已移除）返回 null，该格露背景 */
export type AssetResolver = (imageId: string) => { source: CanvasImageSource; size: Size } | null

export type RenderOptions = {
  /** 仅预览用：给空格子画虚线占位，导出必须关掉 */
  showPlaceholders?: boolean
}

/** 选中框与占位用的中性灰，canvas 读不到 CSS 变量，跟 grid-render.ts 一样就地取色 */
const PLACEHOLDER_FILL = 'rgba(120, 120, 128, 0.14)'
const PLACEHOLDER_STROKE = 'rgba(120, 120, 128, 0.45)'
const SELECTED_STROKE = 'rgba(59, 130, 246, 0.9)'
const HOVER_STROKE = 'rgba(59, 130, 246, 0.9)'
const HOVER_FILL = 'rgba(59, 130, 246, 0.12)'
/** 图被拎走时源格子盖一层中性纱，表示「这里空出来了」 */
const PICKUP_SCRIM = 'rgba(148, 163, 184, 0.4)'

/**
 * 把 scene 画到任意 2D 上下文。预览画到屏幕 canvas、导出画到 OffscreenCanvas
 * 走的是这同一个函数，所以两边必然像素一致。
 */
export function renderSceneToContext(
  context: RenderContext,
  scene: Scene,
  resolveAsset: AssetResolver,
  options: RenderOptions = {},
): void {
  const { canvas, style, layers } = scene
  const { width, height } = canvas

  context.clearRect(0, 0, width, height)
  context.save()

  if (style.canvasRadius > 0) {
    context.beginPath()
    context.roundRect(0, 0, width, height, cornerRadius(style.canvasRadius, width, height))
    context.clip()
  }
  if (style.background.type === 'color') {
    context.fillStyle = style.background.value
    context.fillRect(0, 0, width, height)
  }

  const cells = sceneCells(scene)

  cells.forEach((cell, index) => {
    const layer = layers[index]
    const asset = layer?.imageId ? resolveAsset(layer.imageId) : null
    if (!layer || !asset) {
      if (options.showPlaceholders) {
        drawPlaceholder(context, cell)
      }
      return
    }

    const placement = resolvePlacement(cell, asset.size, layer)
    if (placement.sw <= 0 || placement.sh <= 0) {
      return
    }

    context.save()
    if (style.cellRadius > 0) {
      context.beginPath()
      // 圆角裁在图片实际落位那块，contain 的留白不该被切
      context.roundRect(
        placement.dx,
        placement.dy,
        placement.dw,
        placement.dh,
        cornerRadius(style.cellRadius, placement.dw, placement.dh),
      )
      context.clip()
    }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      asset.source,
      placement.sx,
      placement.sy,
      placement.sw,
      placement.sh,
      placement.dx,
      placement.dy,
      placement.dw,
      placement.dh,
    )
    context.restore()
  })

  context.restore()
}

/** 预览专用的选中框，画在所有图层之上，导出时不调用 */
export function drawSelection(context: RenderContext, cell: Rect): void {
  const lineWidth = 2
  context.save()
  context.strokeStyle = SELECTED_STROKE
  context.lineWidth = lineWidth
  const inset = lineWidth / 2
  context.strokeRect(
    cell.x + inset,
    cell.y + inset,
    Math.max(0, cell.width - inset * 2),
    Math.max(0, cell.height - inset * 2),
  )
  context.restore()
}

/** 拖拽落点高亮：蓝色虚线框 + 淡底，与选中框的实线区分 */
export function drawHover(context: RenderContext, cell: Rect): void {
  const lineWidth = 2
  context.save()
  context.fillStyle = HOVER_FILL
  context.fillRect(cell.x, cell.y, cell.width, cell.height)
  context.strokeStyle = HOVER_STROKE
  context.lineWidth = lineWidth
  context.setLineDash([6, 4])
  const inset = lineWidth / 2
  context.strokeRect(
    cell.x + inset,
    cell.y + inset,
    Math.max(0, cell.width - inset * 2),
    Math.max(0, cell.height - inset * 2),
  )
  context.restore()
}

/** 源格子蒙纱：图已经被拎到光标上，这块要看起来是空的 */
export function drawPickup(context: RenderContext, cell: Rect): void {
  context.save()
  context.fillStyle = PICKUP_SCRIM
  context.fillRect(cell.x, cell.y, cell.width, cell.height)
  context.restore()
}

function cornerRadius(radius: number, width: number, height: number): number {
  return Math.min(radius, Math.min(width, height) / 2)
}

function drawPlaceholder(context: RenderContext, cell: Rect): void {
  if (cell.width <= 0 || cell.height <= 0) {
    return
  }
  const short = Math.min(cell.width, cell.height)
  context.save()
  context.fillStyle = PLACEHOLDER_FILL
  context.fillRect(cell.x, cell.y, cell.width, cell.height)

  context.strokeStyle = PLACEHOLDER_STROKE
  context.lineWidth = Math.max(1, short * 0.006)
  context.setLineDash([short * 0.05, short * 0.04])
  const inset = context.lineWidth
  context.strokeRect(
    cell.x + inset,
    cell.y + inset,
    cell.width - inset * 2,
    cell.height - inset * 2,
  )
  context.setLineDash([])

  // 中点画个加号，提示这一格还能放图
  const arm = Math.max(4, short * 0.08)
  const cx = cell.x + cell.width / 2
  const cy = cell.y + cell.height / 2
  context.beginPath()
  context.moveTo(cx - arm, cy)
  context.lineTo(cx + arm, cy)
  context.moveTo(cx, cy - arm)
  context.lineTo(cx, cy + arm)
  context.stroke()
  context.restore()
}
