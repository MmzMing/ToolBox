import { useEffect, useRef } from 'react'

import { renderGridToContext } from '../grid-render'
import type { BeadColor, BeadGrid } from '../image-to-beads.service'

/** 每格 26 px：印色号时字号够大，缩放显示时也不会糊成一团 */
export const CHART_CELL_PX = 26

type BeadChartCanvasProps = {
  grid: BeadGrid
  palette: readonly BeadColor[]
  showRefs: boolean
  backgroundWhite: boolean
  label: string
  /** fit = 等比缩放到容器内；natural = 保持原始像素（外层自己滚动，灯箱用的就是这档）；fill = 铺满父框 */
  sizing: 'fit' | 'natural' | 'fill'
}

/** 成品图纸画布：圆豆造型 + 单格细线 + 每 10 格分界粗线 + 可选色号 */
export function BeadChartCanvas({
  grid,
  palette,
  showRefs,
  backgroundWhite,
  label,
  sizing,
}: BeadChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = grid.cols * CHART_CELL_PX
    canvas.height = grid.rows * CHART_CELL_PX
    const context = canvas.getContext('2d')
    if (!context) return
    renderGridToContext(context, {
      grid,
      palette,
      cellSize: CHART_CELL_PX,
      showRefs,
      fillBackground: backgroundWhite,
      shape: 'bead',
    })
  }, [grid, palette, showRefs, backgroundWhite])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={
        sizing === 'natural'
          ? 'block max-w-none'
          : sizing === 'fill'
            ? 'h-full w-full object-contain'
            : 'block max-h-[62vh] max-w-full object-contain'
      }
    />
  )
}
