import { useEffect, useState, type RefObject } from 'react'

import { clampRect, type Bounds } from '@/modules/gif/crop'
import {
  cropImage,
  flipImage,
  frameToImageData,
  resizeImage,
  rotateImage,
} from '@/modules/gif/transform'
import type { RgbaFrame } from '@/modules/gif/types'

import type { EditorTransforms } from './gif-editor.service'

/** 变换顺序固定为 旋转 → 翻转 → 裁剪 → 缩放，裁剪框因此活在旋转后的坐标系里（所见即所得） */
export function applyEditorTransforms(
  frame: RgbaFrame,
  transforms: EditorTransforms,
  size: Bounds,
): RgbaFrame {
  const rotated = rotateImage(frame, transforms.rotate)
  const flipped = transforms.flip === 'none' ? rotated : flipImage(rotated, transforms.flip)
  const cropped = transforms.crop
    ? cropImage(flipped, clampRect(transforms.crop, flipped))
    : flipped
  return { ...resizeImage(cropped, size), delayCs: frame.delayCs }
}

export function rotatedBounds(source: Bounds, rotate: number): Bounds {
  return rotate === 90 || rotate === 270 ? { width: source.height, height: source.width } : source
}

type PlayerInput = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  frames: readonly RgbaFrame[]
  delaysCs: readonly number[]
  transforms: EditorTransforms
  size: Bounds | null
  /** transforms 摊平成字符串：只有真正影响画面的改动才重画 */
  signature: string
}

/**
 * 播放头是 React 状态而不是闭包里的计数器——进度条与缩略图都要能反向跳转它。
 * 每帧一个 setTimeout，比自建 rAF 循环简单，也天然跟着 delaysCs 变化走。
 */
export function useFramePlayer(input: PlayerInput) {
  const { canvasRef, frames, delaysCs, transforms, size, signature } = input
  const [playing, setPlaying] = useState(true)
  const [playhead, setPlayhead] = useState(0)
  // 删帧后播放头可能越界：派生一个安全索引，而不是在 effect 里回写 state
  const head = Math.min(playhead, Math.max(0, frames.length - 1))

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const delay = Math.max(1, delaysCs[head] ?? 10) * 10
    const timer = window.setTimeout(() => {
      setPlayhead(
        (current) => (Math.min(current, Math.max(0, frames.length - 1)) + 1) % frames.length,
      )
    }, delay)
    return () => window.clearTimeout(timer)
  }, [playing, head, frames.length, delaysCs])

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frames[head]
    if (!canvas || !frame || !size) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const drawn = applyEditorTransforms(frame, transforms, size)
    canvas.width = drawn.width
    canvas.height = drawn.height
    ctx.putImageData(frameToImageData(drawn), 0, 0)
  }, [canvasRef, frames, head, transforms, size, signature])

  return {
    playing,
    playhead: head,
    toggle: () => setPlaying((current) => !current),
    seek: (index: number) => {
      setPlaying(false)
      setPlayhead(index)
    },
  }
}
