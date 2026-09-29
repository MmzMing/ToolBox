import {
  sceneCells,
  resolvePlacement,
  type Background,
  type Rect,
  type Scene,
  type Size,
} from './image-stack.service'
import {
  blurRadiusOf,
  captionAnchor,
  captionText,
  CAPTION_FONT,
  longFillBox,
  shadowAlpha,
  type LongBand,
  type LongLayout,
  type LongStyle,
} from './long-stack.service'

type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** 按 imageId 取位图；缺失（解码中 / 已移除）返回 null，该格露背景 */
export type AssetResolver = (
  imageId: string,
) => { source: CanvasImageSource; size: Size; name?: string } | null

export type RenderOptions = {
  /** 仅预览用：给空格子画虚线占位，导出必须关掉 */
  showPlaceholders?: boolean
}

/** 圆角与背景这两件事，网格档与长图档要画得一模一样 */
export type CanvasFrame = { background: Background; canvasRadius: number }

/** 分段导出时首尾两段才该有圆角，内部切口必须平直 */
export type FrameEdges = 'all' | 'top' | 'bottom' | 'none'

/** 选中框与占位用的中性灰，canvas 读不到 CSS 变量，跟 grid-render.ts 一样就地取色 */
const PLACEHOLDER_FILL = 'rgba(120, 120, 128, 0.14)'
const PLACEHOLDER_STROKE = 'rgba(120, 120, 128, 0.45)'
const SELECTED_STROKE = 'rgba(59, 130, 246, 0.9)'
const HOVER_STROKE = 'rgba(59, 130, 246, 0.9)'
const HOVER_FILL = 'rgba(59, 130, 246, 0.12)'
/** 图被拎走时源格子盖一层中性纱，表示「这里空出来了」 */
const PICKUP_SCRIM = 'rgba(148, 163, 184, 0.4)'

/**
 * 画布那一层的外框：清屏、按 edges 圆角裁切、铺背景。
 * 调用方负责 save/restore，这样裁切只作用于这一层。
 */
export function paintCanvasFrame(
  context: RenderContext,
  size: Size,
  frame: CanvasFrame,
  edges: FrameEdges = 'all',
): void {
  context.clearRect(0, 0, size.width, size.height)
  const radii = cornerRadii(frame.canvasRadius, size, edges)
  if (radii) {
    context.beginPath()
    context.roundRect(0, 0, size.width, size.height, radii)
    context.clip()
  }
  if (frame.background.type === 'color') {
    context.fillStyle = frame.background.value
    context.fillRect(0, 0, size.width, size.height)
  }
}

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

  context.save()
  paintCanvasFrame(context, canvas, style)

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

/**
 * 长图那一份：一条一条带往下贴。
 * `window` 是画布坐标里要画的那一块 —— 分段导出、以及将来按段预览都靠它，
 * 背景与圆角按 window 尺寸铺，但带子坐标仍是整张画布的坐标。
 */
export type LongRenderOptions = {
  window?: Rect
  edges?: FrameEdges
  /** 仅预览用：素材还没解码出来时画占位 */
  showPlaceholders?: boolean
}

export function renderLongStackToContext(
  context: RenderContext,
  geometry: LongLayout,
  style: LongStyle,
  resolveAsset: AssetResolver,
  options: LongRenderOptions = {},
): void {
  const window = options.window ?? { x: 0, y: 0, width: geometry.width, height: geometry.height }
  context.save()
  paintCanvasFrame(
    context,
    { width: window.width, height: window.height },
    style,
    options.edges ?? 'all',
  )
  context.translate(-window.x, -window.y)
  geometry.bands.forEach((band, index) => {
    const outside =
      band.rect.y + band.rect.height <= window.y || band.rect.y >= window.y + window.height
    if (outside) {
      return
    }
    const asset = resolveAsset(band.imageId)
    if (!asset) {
      if (options.showPlaceholders) {
        drawPlaceholder(context, band.rect)
      }
      return
    }
    if (style.narrowFill === 'blur') {
      drawBlurFill(context, asset, longFillBox(band, geometry))
    }
    drawBand(context, band, asset, style)
    drawCaption(context, band, asset, index, geometry.bands.length, style)
  })
  context.restore()
}

/** 带子与源图裁切区间的对应关系，全是按 sourceImageHeight 折算的比例 */
function bandSourceWindow(band: LongBand, asset: { size: Size }) {
  const ratio = band.sourceImageHeight > 0 ? asset.size.height / band.sourceImageHeight : 1
  return {
    sx: 0,
    sy: band.sourceTop * ratio,
    sw: asset.size.width,
    sh: band.sourceHeight * ratio,
  }
}

/**
 * 一张带：圆角与阴影都得跟着它走。
 *
 * 有样式时先把带子画进一张同尺寸的离屏画布（在那里裁圆角），再整块贴回来 ——
 * 直接在主画布上 clip 完再 drawImage 的话，阴影也会被同一层 clip 削掉，
 * 圆角外那一圈就看不见影子了。没样式就走直算那条快路径，不白建离屏。
 */
function drawBand(
  context: RenderContext,
  band: LongBand,
  asset: { source: CanvasImageSource; size: Size },
  style: LongStyle,
): void {
  const { sx, sy, sw, sh } = bandSourceWindow(band, asset)
  if (sw <= 0 || sh <= 0) {
    return
  }
  const rounded = style.bandRadius > 0
  const shadowed = style.shadow.blur > 0
  const paint = () => {
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      asset.source,
      sx,
      sy,
      sw,
      sh,
      band.rect.x,
      band.rect.y,
      band.rect.width,
      band.rect.height,
    )
  }
  if (!rounded && !shadowed) {
    paint()
    return
  }
  const width = Math.max(1, Math.round(band.rect.width))
  const height = Math.max(1, Math.round(band.rect.height))
  const scratch = new OffscreenCanvas(width, height)
  const layer = scratch.getContext('2d')
  if (!layer) {
    paint()
    return
  }
  if (rounded) {
    layer.beginPath()
    layer.roundRect(0, 0, width, height, cornerRadius(style.bandRadius, width, height))
    layer.clip()
  }
  layer.imageSmoothingEnabled = true
  layer.imageSmoothingQuality = 'high'
  layer.drawImage(asset.source, sx, sy, sw, sh, 0, 0, width, height)
  context.save()
  if (shadowed) {
    context.shadowBlur = style.shadow.blur
    context.shadowOffsetY = style.shadow.offsetY
    context.shadowColor = `rgba(15, 23, 42, ${shadowAlpha(style.shadow)})`
  }
  context.drawImage(scratch, band.rect.x, band.rect.y)
  context.restore()
}

/** 窄图两侧的补白：把这张图自己放大裁切、模糊、铺满整条内容区 */
function drawBlurFill(
  context: RenderContext,
  asset: { source: CanvasImageSource; size: Size },
  box: Rect | null,
): void {
  if (!box || box.width <= 0 || box.height <= 0) {
    return
  }
  // 旧 Safari 的 canvas 没有 filter：宁可留背景色，也不铺一张拉大的锐图
  if (typeof context.filter !== 'string') {
    return
  }
  const blur = blurRadiusOf(box.width)
  // 模糊会把边缘羽化掉，所以往外多铺两倍半径再裁回盒子
  const bleed = blur * 2
  const scale = Math.max(box.width / asset.size.width, box.height / asset.size.height)
  const width = asset.size.width * scale + bleed * 2
  const height = asset.size.height * scale + bleed * 2
  context.save()
  context.beginPath()
  context.rect(box.x, box.y, box.width, box.height)
  context.clip()
  context.filter = `blur(${blur}px)`
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    asset.source,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height,
  )
  context.restore()
}

function drawCaption(
  context: RenderContext,
  band: LongBand,
  asset: { name?: string },
  index: number,
  total: number,
  style: LongStyle,
): void {
  const caption = style.caption
  if (!caption.enabled || caption.text.length === 0) {
    return
  }
  const text = captionText(caption.text, index, total, asset.name ?? '')
  if (text.length === 0) {
    return
  }
  const anchor = captionAnchor(band, caption)
  context.save()
  context.font = `600 ${caption.size}px ${CAPTION_FONT}`
  context.textAlign = anchor.align
  context.textBaseline = anchor.baseline
  // 压在图上必须有对比度，暗底投影比描边更接近截图社区里那种角标
  context.shadowColor = 'rgba(0, 0, 0, 0.6)'
  context.shadowBlur = Math.max(2, caption.size * 0.2)
  context.fillStyle = caption.color
  context.fillText(text, anchor.x, anchor.y)
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

/** 外框圆角；分段时只有首尾两段该有，内部切口必须平直 */
function cornerRadii(
  radius: number,
  size: Size,
  edges: FrameEdges,
): number | [number, number, number, number] | undefined {
  if (edges === 'none' || radius <= 0) {
    return undefined
  }
  const cap = cornerRadius(radius, size.width, size.height)
  if (edges === 'all') {
    return cap
  }
  return edges === 'top' ? [cap, cap, 0, 0] : [0, 0, cap, cap]
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
