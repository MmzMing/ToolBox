import {
  HISTOGRAM_BINS,
  MAX_WINDOW_ROWS,
  OVERLAP_SAMPLE_WIDTH,
  type RowSignature,
} from './overlap-match'

/**
 * 取像素那一侧：把一张图的上沿或下沿窗口缩到 144px 宽，逐行压成指纹。
 * 只有这个文件碰 canvas，匹配本身在 overlap-match.ts 里保持零 DOM 可单测。
 */

/** 一条边最多取多高的窗口：再长也不是重叠区，白白多比对 */
const MAX_WINDOW_PX = 1440
/** 窗口占图高的比例：滚动截图的重叠通常不到半屏 */
const WINDOW_RATIO = 0.45

const EMPTY: RowSignature = {
  width: OVERLAP_SAMPLE_WIDTH,
  rowStride: 1,
  means: new Float32Array(0),
  gradients: new Float32Array(0),
  details: new Float32Array(0),
  histograms: new Uint16Array(0),
}

function windowPxFor(height: number): number {
  if (!Number.isFinite(height) || height <= 0) {
    return 0
  }
  return Math.min(height, Math.max(1, Math.floor(height * WINDOW_RATIO)), MAX_WINDOW_PX)
}

function strideFor(windowPx: number): number {
  return Math.max(1, Math.ceil(windowPx / MAX_WINDOW_ROWS))
}

/** 把一条边带画进 144 × rows 的小画布，逐行统计四个证据通道 */
function sampleEdge(
  source: ImageBitmap,
  side: 'bottom' | 'top',
  windowPx: number,
  rowStride: number,
): RowSignature {
  const rows = Math.floor(windowPx / rowStride)
  if (windowPx <= 0 || rows <= 0) {
    return { ...EMPTY, rowStride }
  }
  const canvas = new OffscreenCanvas(OVERLAP_SAMPLE_WIDTH, rows)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return { ...EMPTY, rowStride }
  }
  const sy = side === 'bottom' ? source.height - windowPx : 0
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, sy, source.width, windowPx, 0, 0, OVERLAP_SAMPLE_WIDTH, rows)

  const { data } = context.getImageData(0, 0, OVERLAP_SAMPLE_WIDTH, rows)
  const means = new Float32Array(rows)
  const gradients = new Float32Array(rows)
  const details = new Float32Array(rows)
  const histograms = new Uint16Array(rows * HISTOGRAM_BINS)
  const half = Math.floor(OVERLAP_SAMPLE_WIDTH / 2)

  for (let row = 0; row < rows; row += 1) {
    let sum = 0
    let left = 0
    let right = 0
    let lowest = 1
    let highest = 0
    for (let x = 0; x < OVERLAP_SAMPLE_WIDTH; x += 1) {
      const offset = (row * OVERLAP_SAMPLE_WIDTH + x) * 4
      // ITU-R BT.601 亮度；截图比对只关心明暗，色彩通道留给人眼
      const luma =
        (data[offset] ?? 0) * 0.299 +
        (data[offset + 1] ?? 0) * 0.587 +
        (data[offset + 2] ?? 0) * 0.114
      const value = luma / 255
      sum += value
      if (x < half) {
        left += value
      } else {
        right += value
      }
      if (value < lowest) {
        lowest = value
      }
      if (value > highest) {
        highest = value
      }
      histograms[
        row * HISTOGRAM_BINS + Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS))
      ] += 1
    }
    means[row] = sum / OVERLAP_SAMPLE_WIDTH
    gradients[row] = Math.abs(left / half - right / (OVERLAP_SAMPLE_WIDTH - half))
    // 行内极差而不是相邻列之差：横向缩到 144px 会把文字抹成一片灰，列间差随之归零，
    // 极差却仍记得住那几笔深色。用它当「这一行有没有内容」的证据。
    details[row] = highest - lowest
  }

  return { width: OVERLAP_SAMPLE_WIDTH, rowStride, means, gradients, details, histograms }
}

/** 一条接缝两侧各自的指纹；rowStride 取两者较大，保证两边同一行对同一段源图 */
export function sampleSeam(
  prev: ImageBitmap,
  next: ImageBitmap,
): { prev: RowSignature; next: RowSignature } {
  const prevWindow = windowPxFor(prev.height)
  const nextWindow = windowPxFor(next.height)
  const rowStride = Math.max(strideFor(prevWindow), strideFor(nextWindow))
  return {
    prev: sampleEdge(prev, 'bottom', prevWindow, rowStride),
    next: sampleEdge(next, 'top', nextWindow, rowStride),
  }
}
