import { EMPTY_CELL, type BeadColor, type BeadGrid } from './image-to-beads.service'

export type GridRenderOptions = {
  grid: BeadGrid
  palette: readonly BeadColor[]
  cellSize: number
  /** 每格左上角印色号（格太小时自动跳过） */
  showRefs: boolean
  /** false = 空格保持透明（导出 PNG 用） */
  fillBackground: boolean
  /** square = 图纸方格（导出用）；bead = 圆豆造型（成品预览用） */
  shape?: 'square' | 'bead'
}

/** 每 10 格一条粗线，对应实体豆板的分区，方便照图摆豆 */
const RULER_EVERY = 10
const MIN_REF_CELL_SIZE = 16

/** 把网格画到 2D 上下文：色块 + 细网格线 + 分区粗线 + 可选色号 */
export function renderGridToContext(
  context: CanvasRenderingContext2D,
  { grid, palette, cellSize, showRefs, fillBackground, shape = 'square' }: GridRenderOptions,
): void {
  const { cols, rows, cells } = grid
  const width = cols * cellSize
  const height = rows * cellSize

  context.clearRect(0, 0, width, height)
  if (fillBackground) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const value = cells[y * cols + x]
      if (value === EMPTY_CELL) continue
      context.fillStyle = rgbCss(palette[value].rgb)
      if (shape === 'bead') {
        const cx = x * cellSize + cellSize / 2
        const cy = y * cellSize + cellSize / 2
        context.beginPath()
        context.arc(cx, cy, cellSize * 0.46, 0, Math.PI * 2)
        context.fill()
        if (cellSize >= 6) {
          // 豆孔：烫豆时中间会塌陷成洞
          context.fillStyle = fillBackground ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'
          context.beginPath()
          context.arc(cx, cy, cellSize * 0.17, 0, Math.PI * 2)
          context.fill()
        }
        continue
      }
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
    }
  }

  if (showRefs && cellSize >= MIN_REF_CELL_SIZE) {
    context.fillStyle = '#1f2937'
    context.font = `${Math.round(cellSize * 0.32)}px ui-sans-serif, system-ui, sans-serif`
    context.textBaseline = 'top'
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const value = cells[y * cols + x]
        if (value === EMPTY_CELL) continue
        context.fillText(palette[value].ref, x * cellSize + 2, y * cellSize + 1)
      }
    }
  }

  context.lineWidth = 1
  context.strokeStyle = 'rgba(15, 23, 42, 0.18)'
  context.beginPath()
  for (let x = 0; x <= cols; x += 1) {
    context.moveTo(x * cellSize + 0.5, 0)
    context.lineTo(x * cellSize + 0.5, height)
  }
  for (let y = 0; y <= rows; y += 1) {
    context.moveTo(0, y * cellSize + 0.5)
    context.lineTo(width, y * cellSize + 0.5)
  }
  context.stroke()

  context.lineWidth = 2
  context.strokeStyle = 'rgba(15, 23, 42, 0.55)'
  context.beginPath()
  for (let x = 0; x <= cols; x += RULER_EVERY) {
    context.moveTo(x * cellSize + 1, 0)
    context.lineTo(x * cellSize + 1, height)
  }
  for (let y = 0; y <= rows; y += RULER_EVERY) {
    context.moveTo(0, y * cellSize + 1)
    context.lineTo(width, y * cellSize + 1)
  }
  context.stroke()
}

function rgbCss([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`
}
