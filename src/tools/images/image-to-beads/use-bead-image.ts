import { useCallback, useEffect, useRef, useState } from 'react'

import { FULL_SELECTION, type Selection } from './selection'

/** 解码前先等比缩到该边长以内：104 格的网格最多每格约 11 px 取样，再大没有收益 */
const MAX_SIDE = 1200

export type BeadSource = {
  url: string
  name: string
  pixels: Uint8ClampedArray
  width: number
  height: number
}

export type BeadImageError = 'unsupported' | 'decode'

/**
 * 选图 → RGBA 像素：封装拖拽/粘贴/取文件后的解码、防串扰与 object URL 回收。
 * 选区与图片同源，因此一并在这里持有 —— 换图即回到整图，不需要额外的 effect 去重置。
 */
export function useBeadImage() {
  const [source, setSource] = useState<BeadSource | null>(null)
  const [selection, setSelection] = useState<Selection>(FULL_SELECTION)
  const [isDecoding, setIsDecoding] = useState(false)
  const [error, setError] = useState<BeadImageError | null>(null)
  /** 每次选图自增，晚到的异步结果据此作废，防止旧图覆盖新图 */
  const runIdRef = useRef(0)

  useEffect(() => {
    if (!source) return
    return () => URL.revokeObjectURL(source.url)
  }, [source])

  const load = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('unsupported')
      return
    }
    const runId = (runIdRef.current += 1)
    setError(null)
    setIsDecoding(true)
    const url = URL.createObjectURL(file)
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          throw new Error('Canvas 2D context is unavailable in this browser')
        }
        context.drawImage(bitmap, 0, 0, width, height)
        const imageData = context.getImageData(0, 0, width, height)
        if (runIdRef.current !== runId) {
          URL.revokeObjectURL(url)
          return
        }
        setSource({ url, name: file.name, pixels: imageData.data, width, height })
        setSelection(FULL_SELECTION)
      } finally {
        bitmap.close()
      }
    } catch {
      URL.revokeObjectURL(url)
      if (runIdRef.current === runId) {
        setError('decode')
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsDecoding(false)
      }
    }
  }, [])

  const clear = useCallback(() => {
    runIdRef.current += 1
    setSource(null)
    setSelection(FULL_SELECTION)
    setError(null)
    setIsDecoding(false)
  }, [])

  const resetSelection = useCallback(() => setSelection(FULL_SELECTION), [])

  return { source, selection, setSelection, resetSelection, isDecoding, error, load, clear }
}
