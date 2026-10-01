import { memo, useEffect, useRef } from 'react'

import { frameToImageData } from '@/modules/gif/transform'
import type { RgbaFrame } from '@/modules/gif/types'

/** 单帧缩略图：RGBA 没有 URL，只能画到小 canvas 上；memo 掉所以播放头移动不会重画全条 */
export const FrameThumb = memo(function FrameThumb({
  frame,
  size = 88,
}: {
  frame: RgbaFrame
  size?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const source = document.createElement('canvas')
    source.width = frame.width
    source.height = frame.height
    source.getContext('2d')?.putImageData(frameToImageData(frame), 0, 0)
    const scale = Math.min(size / frame.width, size / frame.height)
    canvas.width = Math.max(1, Math.round(frame.width * scale))
    canvas.height = Math.max(1, Math.round(frame.height * scale))
    if (ctx) ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  }, [frame, size])

  return <canvas ref={ref} className="rounded" />
})
