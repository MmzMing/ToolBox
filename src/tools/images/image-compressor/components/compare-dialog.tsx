import { ArrowLeftRight, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageCompare, ImageCompareOrientationToggle } from '@/components/image-compare'
import type { ImageCompareOrientation } from '@/components/image-compare'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatFileSize } from '../service'
import type { ImageItem } from '../store'

interface CompareDialogProps {
  item: ImageItem | null
  onClose: () => void
}

/** 悬浮在全屏遮罩上的控件底板 */
const CHIP = 'bg-background/80 rounded-full backdrop-blur'

/** 压缩前后对比：全屏画框 + 共享 ImageCompare 分割线 + 换向与交换按钮 */
export function CompareDialog({ item, onClose }: CompareDialogProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-compressor' })
  const [showCompressedRight, setShowCompressedRight] = useState(true)
  const [orientation, setOrientation] = useState<ImageCompareOrientation>('horizontal')

  if (!item || !item.compress) {
    return null
  }

  const original = {
    src: item.src,
    label: t('compare.original'),
    size: item.blob.size,
    dim: `${item.width}×${item.height}`,
  }
  const compressed = {
    src: item.compress.src,
    label: t('compare.compressed'),
    size: item.compress.blob.size,
    dim: `${item.compress.width}×${item.compress.height}`,
  }
  const left = showCompressedRight ? original : compressed
  const right = showCompressedRight ? compressed : original
  const chipOf = (side: typeof original) =>
    `${side.label} · ${side.dim} · ${formatFileSize(side.size)}`
  const imageOf = (side: typeof original) => (
    <img src={side.src} alt={side.label} className="size-full object-contain" draggable={false} />
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-overlay/90 h-svh max-w-none rounded-none border-none p-0 sm:max-w-none sm:rounded-none [&>button]:hidden">
        <DialogTitle className="sr-only">{t('compare.title')}</DialogTitle>

        <div className="checkerboard relative size-full">
          {/* key 只跟图片项：换一张图回到居中，重压缩保留当前分割线位置 */}
          <ImageCompare
            key={item.key}
            className="size-full rounded-none border-none"
            aspectRatio="auto"
            orientation={orientation}
            before={imageOf(left)}
            after={imageOf(right)}
            labels={[chipOf(left), chipOf(right)]}
          />

          <div className="absolute top-3 right-3 z-20 flex gap-2">
            <ImageCompareOrientationToggle
              orientation={orientation}
              onOrientationChange={setOrientation}
              className={CHIP}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className={CHIP}
              title={t('compare.swap')}
              onClick={() => setShowCompressedRight((value) => !value)}
            >
              <ArrowLeftRight className={orientation === 'vertical' ? '' : 'rotate-90'} />
            </Button>
            <Button variant="ghost" size="icon-sm" className={CHIP} onClick={onClose}>
              <X />
            </Button>
          </div>

          <p className="text-overlay-foreground/60 pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-xs">
            {t('compare.dragHint')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
