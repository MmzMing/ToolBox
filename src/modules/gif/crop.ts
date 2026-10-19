export type Rect = { x: number; y: number; width: number; height: number }

export type Bounds = { width: number; height: number }

/** 裁剪框最小边长：再小就只是一个点，拖拽时反而容易误操作 */
export const MIN_CROP_EDGE = 8

/** 居中裁剪到指定比例；ratio 为 null 表示保持画面 */
export function centerCrop(source: Bounds, ratio: number | null): Rect {
  if (!ratio) {
    return { x: 0, y: 0, width: source.width, height: source.height }
  }
  const targetHeight = Math.round(source.width / ratio)
  if (targetHeight <= source.height) {
    return {
      x: 0,
      y: Math.round((source.height - targetHeight) / 2),
      width: source.width,
      height: targetHeight,
    }
  }
  const targetWidth = Math.round(source.height * ratio)
  return {
    x: Math.round((source.width - targetWidth) / 2),
    y: 0,
    width: targetWidth,
    height: source.height,
  }
}

/** 把任意拖拽出来的框收进画面内，并保证整数、边长不为零 */
export function clampRect(rect: Rect, bounds: Bounds): Rect {
  const width = Math.max(MIN_CROP_EDGE, Math.min(Math.round(rect.width), bounds.width))
  const height = Math.max(MIN_CROP_EDGE, Math.min(Math.round(rect.height), bounds.height))
  return {
    x: Math.max(0, Math.min(Math.round(rect.x), bounds.width - width)),
    y: Math.max(0, Math.min(Math.round(rect.y), bounds.height - height)),
    width,
    height,
  }
}

export function fullRect(bounds: Bounds): Rect {
  return { x: 0, y: 0, width: bounds.width, height: bounds.height }
}

export function isFullRect(rect: Rect, bounds: Bounds): boolean {
  return (
    rect.x === 0 && rect.y === 0 && rect.width === bounds.width && rect.height === bounds.height
  )
}

/** 按比例拖框时，短于这条边视为误点，不产生新框 */
export const MIN_CREATE_EDGE = 16

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

export type Point = { x: number; y: number }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 定比例下拖角点：谁拖得远就以谁为主轴，另一条边按比例反推，
 * 主轴顶到画面边缘后再反推副轴，保证框始终在画面里且比例不变。
 */
function sizeWithinRatio(
  width: number,
  height: number,
  ratio: number,
  available: Bounds,
): { width: number; height: number } {
  const max = { width: Math.max(1, available.width), height: Math.max(1, available.height) }
  let nextWidth: number
  let nextHeight: number
  // 把纵向拖距折算到横向同一量纲再比较，才能判断哪条边在主导
  if (Math.abs(height) * ratio > Math.abs(width)) {
    nextHeight = clamp(Math.round(height), MIN_CROP_EDGE, max.height)
    nextWidth = Math.round(nextHeight * ratio)
    if (nextWidth > max.width) {
      nextWidth = max.width
      nextHeight = Math.round(nextWidth / ratio)
    }
  } else {
    nextWidth = clamp(Math.round(width), MIN_CROP_EDGE, max.width)
    nextHeight = Math.round(nextWidth / ratio)
    if (nextHeight > max.height) {
      nextHeight = max.height
      nextWidth = Math.round(nextHeight * ratio)
    }
  }
  return {
    width: clamp(nextWidth, MIN_CROP_EDGE, max.width),
    height: clamp(nextHeight, MIN_CROP_EDGE, max.height),
  }
}

/** 由拖拽方向求出锚点（对角不动）与它在两个方向上还能长多少 */
function anchorOf(origin: Rect, handle: CropHandle, bounds: Bounds) {
  const west = handle === 'nw' || handle === 'sw'
  const north = handle === 'nw' || handle === 'ne'
  const x = west ? origin.x + origin.width : origin.x
  const y = north ? origin.y + origin.height : origin.y
  return {
    west,
    north,
    x,
    y,
    available: {
      width: west ? x : bounds.width - x,
      height: north ? y : bounds.height - y,
    },
  }
}

/** 拖角点缩放 / 拖框体平移，返回未 clamp 但已收进画面的矩形 */
export function resizeRect(
  origin: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  bounds: Bounds,
): Rect {
  if (handle === 'move') return { ...origin, x: origin.x + dx, y: origin.y + dy }
  const anchor = anchorOf(origin, handle, bounds)
  const width = anchor.west ? anchor.x - (origin.x + dx) : origin.width + dx
  const height = anchor.north ? anchor.y - (origin.y + dy) : origin.height + dy
  const sized = ratio
    ? sizeWithinRatio(width, height, ratio, anchor.available)
    : {
        width: clamp(Math.round(width), MIN_CROP_EDGE, Math.max(1, anchor.available.width)),
        height: clamp(Math.round(height), MIN_CROP_EDGE, Math.max(1, anchor.available.height)),
      }
  return {
    x: anchor.west ? anchor.x - sized.width : anchor.x,
    y: anchor.north ? anchor.y - sized.height : anchor.y,
    width: sized.width,
    height: sized.height,
  }
}

/** 在空白处按下拖出新框：锚点是按下那一点，方向随指针落在锚点哪一侧决定 */
export function rectFromDrag(from: Point, to: Point, ratio: number | null, bounds: Bounds): Rect {
  const west = to.x < from.x
  const north = to.y < from.y
  const available = {
    width: west ? from.x : bounds.width - from.x,
    height: north ? from.y : bounds.height - from.y,
  }
  const width = Math.abs(to.x - from.x)
  const height = Math.abs(to.y - from.y)
  const sized = ratio
    ? sizeWithinRatio(width, height, ratio, available)
    : {
        width: clamp(Math.round(width), 0, Math.max(1, available.width)),
        height: clamp(Math.round(height), 0, Math.max(1, available.height)),
      }
  return {
    x: west ? from.x - sized.width : from.x,
    y: north ? from.y - sized.height : from.y,
    width: sized.width,
    height: sized.height,
  }
}

export type FillMode = 'contain' | 'cover' | 'stretch'

/**
 * 把源图放进目标画布的绘制矩形。
 * contain 留白（由底色垫）、cover 溢出（由画布裁掉）、stretch 直接拉变形。
 * 返回的矩形允许超出 canvas，drawImage 会自然裁切，所以这里不做 clamp。
 */
export function placementRect(source: Bounds, canvas: Bounds, fill: FillMode): Rect {
  if (fill === 'stretch') {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height }
  }
  const scaleContain = Math.min(canvas.width / source.width, canvas.height / source.height)
  const scaleCover = Math.max(canvas.width / source.width, canvas.height / source.height)
  const scale = fill === 'cover' ? scaleCover : scaleContain
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  return {
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
  }
}

/**
 * 定画布：ratio 为 null 时跟随源图（等比收口到 maxEdge）；
 * 否则画布的**长边**就是 maxEdge，短边按比例跟随，所以选 9:16 得到的是 180×320 而不是 320×569。
 */
export function canvasForRatio(ratio: number | null, source: Bounds, maxEdge: number): Bounds {
  if (!ratio) {
    return scaleToBounds(source, maxEdge)
  }
  if (ratio >= 1) {
    return { width: maxEdge, height: Math.max(1, Math.round(maxEdge / ratio)) }
  }
  return { width: Math.max(1, Math.round(maxEdge * ratio)), height: maxEdge }
}

/** 等比收口到最长边，永不放大 */
export function scaleToBounds(source: Bounds, maxEdge: number): Bounds {
  const longest = Math.max(source.width, source.height)
  if (longest <= maxEdge) {
    return { width: source.width, height: source.height }
  }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/**
 * 显示尺寸（CSS px）与帧像素坐标互转。两个方向是同一个线性缩放，
 * 只是把 natural / display 换个位置——预览 canvas 用 CSS 缩放显示，
 * 不换算就会出现「框拖在左上角、裁的却是右下角」。
 */
export function mapRect(rect: Rect, from: Bounds, to: Bounds): Rect {
  if (
    !Number.isInteger(from.width) ||
    !Number.isInteger(from.height) ||
    from.width < 1 ||
    from.height < 1
  ) {
    throw new Error(`invalid source bounds ${from.width}x${from.height}`)
  }
  return clampRect(
    {
      x: (rect.x / from.width) * to.width,
      y: (rect.y / from.height) * to.height,
      width: (rect.width / from.width) * to.width,
      height: (rect.height / from.height) * to.height,
    },
    to,
  )
}
