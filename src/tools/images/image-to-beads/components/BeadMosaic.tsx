import { useEffect, useRef } from 'react'

import { EMPTY_CELL, type BeadColor, type BeadGrid } from '../image-to-beads.service'

type BeadMosaicProps = {
  grid: BeadGrid
  palette: readonly BeadColor[]
  /** 空格画成白纸还是透出原图 */
  backgroundWhite: boolean
  label: string
}

/**
 * 选区里的成品预览：画布底图就是 cols × rows 一个像素一颗豆，
 * 靠 CSS 放大 + image-rendering: pixelated 得到色块，避免上万次 DOM/矩形绘制。
 */
export function BeadMosaic({ grid, palette, backgroundWhite, label }: BeadMosaicProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = grid.cols
    canvas.height = grid.rows
    const context = canvas.getContext('2d')
    if (!context) return

    const image = context.createImageData(grid.cols, grid.rows)
    const data = image.data
    for (let index = 0; index < grid.cells.length; index += 1) {
      const value = grid.cells[index]
      const at = index * 4
      if (value === EMPTY_CELL) {
        if (backgroundWhite) {
          data[at] = 255
          data[at + 1] = 255
          data[at + 2] = 255
          data[at + 3] = 255
        } else {
          data[at + 3] = 0
        }
        continue
      }
      const [r, g, b] = palette[value].rgb
      data[at] = r
      data[at + 1] = g
      data[at + 2] = b
      data[at + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [grid, palette, backgroundWhite])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className="h-full w-full [image-rendering:pixelated]"
    />
  )
}
