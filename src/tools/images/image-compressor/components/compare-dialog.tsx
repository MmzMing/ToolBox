import { ArrowLeftRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatFileSize } from '../service'
import type { ImageItem } from '../store'

interface CompareDialogProps {
  item: ImageItem | null
  onClose: () => void
}

const CHECKERBOARD =
  'repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 50% / 16px 16px'

/** 压缩前后对比：全屏叠加 + 可拖动分割线 + 交换按钮（参考 tools-pic 对比视图） */
export function CompareDialog({ item, onClose }: CompareDialogProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const [position, setPosition] = useState(50)
  const [showCompressedRight, setShowCompressedRight] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const updateFromPointer = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const percent = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, percent)))
  }, [])

  useEffect(() => {
    if (!item) {
      return
    }
    const onMove = (event: PointerEvent) => {
      if (draggingRef.current) {
        updateFromPointer(event.clientX)
      }
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [item, updateFromPointer])

  if (!item || !item.compress) {
    return null
  }

  const original = { src: item.src, label: t('compare.original'), size: item.blob.size }
  const compressed = {
    src: item.compress.src,
    label: t('compare.compressed'),
    size: item.compress.blob.size,
  }
  const left = showCompressedRight ? original : compressed
  const right = showCompressedRight ? compressed : original

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="h-svh max-w-none rounded-none border-none bg-black/90 p-0 sm:rounded-none [&>button]:hidden">
        <DialogTitle className="sr-only">{t('compare.title')}</DialogTitle>

        <div
          ref={containerRef}
          className="relative size-full select-none"
          onPointerDown={(event) => {
            draggingRef.current = true
            updateFromPointer(event.clientX)
          }}
        >
          {/* 底层：左侧图 */}
          <img
            src={left.src}
            alt={left.label}
            className="absolute inset-0 size-full object-contain"
            draggable={false}
          />
          {/* 顶层：右侧图，按分割线裁剪 */}
          <img
            src={right.src}
            alt={right.label}
            className="absolute inset-0 size-full object-contain"
            style={{ clipPath: `inset(0 0 0 ${position}%)` }}
            draggable={false}
          />

          {/* 透明背景棋盘格衬底（展示透明区域） */}
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: CHECKERBOARD }}
          />

          {/* 分割线 + 拖动把手 */}
          <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${position}%` }}>
            <button
              type="button"
              className="bg-primary text-primary-foreground absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full shadow-lg"
              onPointerDown={(event) => {
                event.stopPropagation()
                draggingRef.current = true
              }}
              aria-label={t('compare.dragHint')}
            >
              <ArrowLeftRight className="size-5" />
            </button>
          </div>

          {/* 左右标签 */}
          <span className="bg-background/80 absolute top-4 left-4 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur">
            {left.label} · {formatFileSize(left.size)}
          </span>
          <span className="bg-background/80 absolute top-4 right-4 rounded-md px-2.5 py-1 text-xs font-medium backdrop-blur">
            {right.label} · {formatFileSize(right.size)}
          </span>

          {/* 右上角操作 */}
          <div className="absolute top-3 right-3 flex gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-background/80 backdrop-blur"
              title={t('compare.swap')}
              onClick={() => setShowCompressedRight((value) => !value)}
            >
              <ArrowLeftRight className="rotate-90" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-background/80 backdrop-blur"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">
            {t('compare.dragHint')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
