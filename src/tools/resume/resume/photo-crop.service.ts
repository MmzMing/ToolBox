/**
 * 头像裁剪的纯计算。
 *
 * 模型（截图工具的选图方式）：图片完整摆进画布并居中，只能整体缩放/旋转；
 * 裁剪框是画布上的一个自由矩形，拖动框体移动、拖 8 个手柄缩放，且必须落在图片范围内。
 * 本文件只放可序列化的数学，DOM 侧的测量与绘制落在 PhotoCropCanvas 与 image-utils。
 */
import { ratioMultiplier } from './resume.service'
import type { PhotoAspectRatio } from './types'

export type CropSize = { width: number; height: number }

export type CropRect = { x: number; y: number; width: number; height: number }

export type CropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/** 图片自身的摆法：恒居中在画布，只缩放与旋转 */
export type CropView = {
  /** 相对"整图放进画布"基准缩放的倍数 */
  zoom: number
  /** 顺时针旋转角度，只取 90 的整数倍 */
  rotation: number
}

/** 手柄顺序：顺时针一圈，渲染与拖拽共用 */
export const CROP_HANDLES: readonly CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const IDENTITY_CROP_VIEW: CropView = { zoom: 1, rotation: 0 }

/** 裁剪框最小边长（画布 CSS 像素） */
export const CROP_MIN_FRAME_PX = 48
/** 缩放下限就是"整图放进画布"的 1 倍：再小图片只会更小，没有意义 */
export const CROP_MIN_ZOOM = 1
export const CROP_MAX_ZOOM = 4
export const CROP_ZOOM_STEP = 0.2
/** 导出图片长边：纸面最大 200px，512 足够清晰又不至于撑爆 localStorage */
export const CROP_EXPORT_LONG_EDGE = 512
/** 裁剪框初始占图片区域的比例 */
export const CROP_INITIAL_FRAME_SCALE = 0.62

function quarterTurns(rotation: number): 0 | 1 | 2 | 3 {
  return (((Math.round(rotation / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 裁剪框高/宽比：具名比例走公共换算；自定义比例返回 null，表示自由拖拽不锁形状 */
export function cropFrameRatio(aspectRatio: PhotoAspectRatio): number | null {
  return aspectRatio === 'custom' ? null : ratioMultiplier(aspectRatio)
}

/** 整图放进画布的基准缩放（contain） */
export function canvasFitScale(canvas: CropSize, image: CropSize): number {
  if (canvas.width <= 0 || canvas.height <= 0 || image.width <= 0 || image.height <= 0) {
    return 1
  }
  return Math.min(canvas.width / image.width, canvas.height / image.height)
}

/**
 * 图片在画布里的落位：恒居中，只随缩放/旋转变化。
 *
 * 旋转只取 90 的整数倍，落位仍是正矩形（不是外接框），所以后面所有"框不能出图"的约束都是精确的。
 */
export function imageRectFor(canvas: CropSize, image: CropSize, view: CropView): CropRect {
  const scale = canvasFitScale(canvas, image) * view.zoom
  const swapped = quarterTurns(view.rotation) % 2 === 1
  const width = (swapped ? image.height : image.width) * scale
  const height = (swapped ? image.width : image.height) * scale
  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}

/** 裁剪框的活动范围：图片区域与画布的交集（放大后图片超出画布时取可见部分） */
export function cropBounds(canvas: CropSize, imageRect: CropRect): CropRect {
  const x = Math.max(0, imageRect.x)
  const y = Math.max(0, imageRect.y)
  const right = Math.min(canvas.width, imageRect.x + imageRect.width)
  const bottom = Math.min(canvas.height, imageRect.y + imageRect.height)
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

/** 初始裁剪框：按比例内接图片区域，居中，占 CROP_INITIAL_FRAME_SCALE；自由比例时等比缩小图片区域 */
export function initialCropFrame(bounds: CropRect, ratio: number | null): CropRect {
  const width =
    ratio === null
      ? bounds.width * CROP_INITIAL_FRAME_SCALE
      : Math.min(bounds.width, bounds.height / ratio) * CROP_INITIAL_FRAME_SCALE
  const height = ratio === null ? bounds.height * CROP_INITIAL_FRAME_SCALE : width * ratio
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  }
}

/** 兜底：先缩到能放进范围内，再把位置夹回去（缩放/旋转/换比例后都用它收口） */
export function clampCropFrame(frame: CropRect, ratio: number | null, bounds: CropRect): CropRect {
  const width =
    ratio === null
      ? Math.min(frame.width, bounds.width)
      : Math.min(frame.width, bounds.width, bounds.height / ratio)
  const height = ratio === null ? Math.min(frame.height, bounds.height) : width * ratio
  return {
    x: clamp(frame.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(frame.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  }
}

/**
 * 手柄拖拽 → 新的裁剪框。
 *
 * 跟截图工具一致：对边/对角固定，被拖的那边跟着指针走；到图片边界就停。
 * 锁定比例时角上按主导轴驱动、另一边按比例算；自由比例时两个轴各走各的。
 */
export function resizeCropFrame(
  frame: CropRect,
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
  ratio: number | null,
  bounds: CropRect,
): CropRect {
  const corner = handle.length === 2
  const growsX = corner || handle === 'e' || handle === 'w'
  const growsY = corner || handle === 'n' || handle === 's'
  const signX = handle.includes('e') ? 1 : -1
  const signY = handle.includes('s') ? 1 : -1

  // 被拖的边在移动，对边钉住：拖 e 就钉左边，拖 se 就钉左上角
  const fixedLeft = handle.includes('e')
  const fixedTop = handle.includes('s')
  const fixedRight = handle.includes('w')
  const fixedBottom = handle.includes('n')

  const anchorX = fixedLeft
    ? frame.x
    : fixedRight
      ? frame.x + frame.width
      : frame.x + frame.width / 2
  const anchorY = fixedTop
    ? frame.y
    : fixedBottom
      ? frame.y + frame.height
      : frame.y + frame.height / 2

  const roomX = availableRoom(
    anchorX,
    bounds.x,
    bounds.x + bounds.width,
    fixedLeft ? 'forward' : fixedRight ? 'backward' : 'both',
  )
  const roomY = availableRoom(
    anchorY,
    bounds.y,
    bounds.y + bounds.height,
    fixedTop ? 'forward' : fixedBottom ? 'backward' : 'both',
  )

  let width = frame.width
  let height = frame.height

  if (ratio === null) {
    if (growsX) {
      width = frame.width + signX * deltaX
    }
    if (growsY) {
      height = frame.height + signY * deltaY
    }
  } else if (growsX && (!growsY || Math.abs(deltaX) >= Math.abs(deltaY))) {
    width = frame.width + signX * deltaX
    height = width * ratio
  } else {
    height = frame.height + signY * deltaY
    width = height / ratio
  }

  if (ratio === null) {
    width = clamp(width, Math.min(CROP_MIN_FRAME_PX, roomX), Math.max(1, roomX))
    height = clamp(height, Math.min(CROP_MIN_FRAME_PX, roomY), Math.max(1, roomY))
  } else {
    const maxWidth = Math.max(1, Math.min(roomX, roomY / ratio))
    width = clamp(width, Math.min(CROP_MIN_FRAME_PX, maxWidth), maxWidth)
    height = width * ratio
  }

  return {
    x: fixedLeft ? anchorX : fixedRight ? anchorX - width : anchorX - width / 2,
    y: fixedTop ? anchorY : fixedBottom ? anchorY - height : anchorY - height / 2,
    width,
    height,
  }
}

/** 锚点往前/往后/两侧能长多少：'both' 取两侧较小值再翻倍（中心不动才放得进） */
function availableRoom(
  anchor: number,
  start: number,
  end: number,
  mode: 'forward' | 'backward' | 'both',
): number {
  if (mode === 'forward') {
    return Math.max(1, end - anchor)
  }
  if (mode === 'backward') {
    return Math.max(1, anchor - start)
  }
  return Math.max(1, 2 * Math.min(anchor - start, end - anchor))
}

/** 旋转 ±90°：只动角度，位置约束交给 clampCropFrame 收口 */
export function rotateCropView(view: CropView, delta: number): CropView {
  return { ...view, rotation: (((view.rotation + delta) % 360) + 360) % 360 }
}

/** 缩放倍数夹取并收敛浮点误差，避免连点后出现 1.4000000000000001 */
export function zoomCropView(view: CropView, delta: number): CropView {
  const zoom = clamp(view.zoom + delta, CROP_MIN_ZOOM, CROP_MAX_ZOOM)
  return { ...view, zoom: Math.round(zoom * 100) / 100 }
}

/** 导出尺寸：长边固定，短边按裁剪框比例取整 */
export function cropExportSize(frame: CropSize): CropSize {
  const longEdge = Math.max(frame.width, frame.height)
  const factor = longEdge > 0 ? CROP_EXPORT_LONG_EDGE / longEdge : 1
  return {
    width: Math.max(1, Math.round(frame.width * factor)),
    height: Math.max(1, Math.round(frame.height * factor)),
  }
}
