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

/** 按比例锁定尺寸：以宽为主轴；高度顶到画面上边界时改用请求的高度反推宽度 */
export function sizeForRatio(
  width: number,
  height: number,
  ratio: number,
  bounds: Bounds,
): { width: number; height: number } {
  let nextWidth = Math.max(MIN_CROP_EDGE, Math.round(width))
  let nextHeight = Math.max(MIN_CROP_EDGE, Math.round(nextWidth / ratio))
  if (nextHeight > bounds.height) {
    nextHeight = Math.max(MIN_CROP_EDGE, Math.min(Math.round(height), bounds.height))
    nextWidth = Math.max(MIN_CROP_EDGE, Math.round(nextHeight * ratio))
  }
  if (nextWidth > bounds.width) {
    nextWidth = bounds.width
    nextHeight = Math.max(MIN_CROP_EDGE, Math.round(nextWidth / ratio))
  }
  return { width: nextWidth, height: nextHeight }
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
