/**
 * 前后对比画框（`components/image-compare.tsx`）的纯几何计算。
 *
 * 分割线的位置、贴边让距、越界阻力、标签淡出与转身过程中的裁剪多边形都在这里，
 * 组件只负责把它们接到 motion 的 MotionValue 上：这些算式与 DOM 无关，可以单测。
 */

/** 越界橡皮筋的最大行程（像素）。 */
export const COMPARE_STRETCH_PX = 9
/** 把手与框边保持的最小间距（像素）：进入这个区间后把手开始离线让位。 */
export const COMPARE_EDGE_MARGIN = 42
/** 在 COMPARE_EDGE_MARGIN 内把手最多让出的距离（像素）。 */
export const COMPARE_HANDLE_GIVE = 12
/** 标签胶囊距框边的间距，与画框上的 inset-3 对齐。 */
export const COMPARE_LABEL_INSET = 12
/** 分割线距标签还剩这么多像素时，标签已经完全不透明。 */
export const COMPARE_LABEL_FADE_PX = 28

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

/** iOS 式阻力：越界部分越拖越沉，且总位移永远不超过 limit 像素。 */
export function rubberBand(distance: number, limit = COMPARE_STRETCH_PX): number {
  return Math.sign(distance) * (1 - 1 / ((Math.abs(distance) * 0.55) / limit + 1)) * limit
}

/**
 * 把手沿拖拽轴的实际落点：线本身要贴到边框，但把手是圆胶囊，
 * 所以在两端 MARGIN 内逐渐让位，既不切边也不硬停。
 */
export function edgeSoftened(at: number, size: number): number {
  if (at < COMPARE_EDGE_MARGIN) {
    return COMPARE_EDGE_MARGIN - handleGive(COMPARE_EDGE_MARGIN - at)
  }
  if (at > size - COMPARE_EDGE_MARGIN) {
    return size - COMPARE_EDGE_MARGIN + handleGive(at - size + COMPARE_EDGE_MARGIN)
  }
  return at
}

function handleGive(distance: number): number {
  return COMPARE_HANDLE_GIVE * (1 - 1 / (distance / COMPARE_HANDLE_GIVE + 1))
}

/** 标签透明度：线离标签越近越淡，剩 COMPARE_LABEL_FADE_PX 时开始下降，重合时为 0。 */
export function labelOpacity(room: number): number {
  return clamp(room / COMPARE_LABEL_FADE_PX, 0, 1)
}

/**
 * 过 `center`、倾角为 `angleRadians` 的直线把 w×h 的画框切开，返回 before 一侧的多边形 clip-path。
 *
 * 只在横竖切换的转身过程中使用（静止时一律写成百分比 inset，首屏可渲染、缩放不滞后）。
 */
export function halfPlaneClip(
  w: number,
  h: number,
  center: [number, number],
  angleRadians: number,
): string {
  const nx = -Math.cos(angleRadians)
  const ny = -Math.sin(angleRadians)
  const side = ([x, y]: [number, number]) => (x - center[0]) * nx + (y - center[1]) * ny
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const points: [number, number][] = []
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % 4]
    if (!next) {
      return
    }
    const a = side(corner)
    const b = side(next)
    if (a >= 0) {
      points.push(corner)
    }
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b)
      points.push([corner[0] + (next[0] - corner[0]) * t, corner[1] + (next[1] - corner[1]) * t])
    }
  })
  return points.length
    ? `polygon(${points.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(', ')})`
    : 'inset(50%)'
}
