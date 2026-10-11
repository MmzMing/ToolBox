export type BubbleSide = 'top' | 'bottom' | 'left' | 'right'

export type Box = { x: number; y: number; width: number; height: number }

/** 气泡与球之间的间距，也是箭头露出的长度 */
export const BUBBLE_GAP = 14
/** 气泡贴到屏幕边缘时保留的余量 */
export const BUBBLE_EDGE_MARGIN = 12
/** 箭头离气泡两端最近多远：圆角是 rounded-2xl（16px），再留 4px 才不压在弧上 */
export const ARROW_EDGE_MARGIN = 20

export type BubblePlacement = {
  side: BubbleSide
  /** 沿交叉轴的整体位移，见下方推导 */
  shift: number
  /** 箭头中心到气泡交叉轴起始边的距离——球被挤到一边时箭头仍要指着它 */
  arrow: number
}

/**
 * 气泡该摆在球的哪一侧、沿交叉轴挪多少。
 *
 * 顺序是「上 → 下 → 左 → 右」：球平时在右侧竖边居中，上方空间最充裕；
 * 但它一旦飞到某个目标附近就可能贴到屏幕任何一边，所以四向都要能让。
 * 四个方向都塞不下（气泡比屏幕还大）时退回上方，至少交叉轴上的夹取还能救回一部分。
 *
 * shift 是沿交叉轴的位移：上/下时是水平方向，左/右时是垂直方向。
 * 球贴着屏幕右边时，居中的气泡会有一半溢出屏幕，靠这个位移把它推回来。
 */
export function placeBubble(
  anchor: Box,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = BUBBLE_GAP,
): BubblePlacement {
  const cx = anchor.x + anchor.width / 2
  const cy = anchor.y + anchor.height / 2
  const fitsTop = anchor.y - gap - bubble.height >= 0
  const fitsBottom = anchor.y + anchor.height + gap + bubble.height <= viewport.height
  const fitsLeft = anchor.x - gap - bubble.width >= 0
  const fitsRight = anchor.x + anchor.width + gap + bubble.width <= viewport.width

  const side: BubbleSide = fitsTop
    ? 'top'
    : fitsBottom
      ? 'bottom'
      : fitsLeft
        ? 'left'
        : fitsRight
          ? 'right'
          : 'top'

  const half = (side === 'top' || side === 'bottom' ? bubble.width : bubble.height) / 2
  const center = side === 'top' || side === 'bottom' ? cx : cy
  const span = side === 'top' || side === 'bottom' ? viewport.width : viewport.height
  const min = BUBBLE_EDGE_MARGIN + half
  const max = span - BUBBLE_EDGE_MARGIN - half
  // 气泡比可用宽度还宽时 min > max，此时不位移，交给 max-w 去截
  const shift = max >= min ? Math.min(Math.max(center, min), max) - center : 0

  // 箭头不能跟着气泡一起居中：气泡被 shift 推开之后它指的是气泡中心，不是球。
  // 按球心在气泡局部坐标里投影回去，两端各留一点免得爬到圆角上。
  const cross = half * 2
  const edge = Math.min(ARROW_EDGE_MARGIN, cross / 2)
  const arrow = Math.min(Math.max(cross / 2 - shift, edge), cross - edge)

  return { side, shift, arrow }
}
