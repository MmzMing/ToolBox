import { Maximize2, Minus, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

/** 悬浮在深色遮罩上的控件底板，亮暗主题都可读 */
const CHIP = 'bg-background/80 flex shrink-0 items-center gap-1 rounded-full p-1 backdrop-blur'

type ImageLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 图片地址：blob / object URL / data URL 都可以 */
  src: string
  alt: string
  /** 顶栏左侧的说明文字（通常是提示词），可空 */
  caption?: string
  /** 与缩放控件并排的额外动作，例如下载 */
  actions?: ReactNode
}

/** 全屏灯箱：滚轮缩放 / 拖动平移 / 双击放大，图片按可用区域等比铺入 */
export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt,
  caption,
  actions,
}: ImageLightboxProps) {
  const { t } = useTranslation('common', { keyPrefix: 'lightbox' })
  const [percent, setPercent] = useState(100)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // DialogContent 自带 sm:max-w-sm，跨档位列名不同、合并器不会互相抵掉，必须一并覆盖
        className="flex h-svh max-w-none flex-col gap-3 rounded-none border-none bg-black/90 p-3 sm:max-w-none [&>button]:hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>

        <div className="flex shrink-0 items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate px-2 text-xs text-white/80">{caption}</p>
          <div className={CHIP}>
            {actions}
            {actions ? <Separator orientation="vertical" className="mx-1 h-5" /> : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t('zoomOut')}
              onClick={() => void transformRef.current?.zoomOut()}
            >
              <Minus />
            </Button>
            <span className="text-muted-foreground w-12 text-center font-mono text-xs tabular-nums">
              {percent}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t('zoomIn')}
              onClick={() => void transformRef.current?.zoomIn()}
            >
              <Plus />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t('fit')}
              onClick={() => void transformRef.current?.fitToView()}
            >
              <Maximize2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t('close')}
              onClick={() => onOpenChange(false)}
            >
              <X />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {/* key 随开合与图片变化：换图或重新打开即重建变换实例，缩放回到刚铺好的状态 */}
          <TransformWrapper
            key={`${open}:${src}`}
            ref={transformRef}
            minScale={0.1}
            maxScale={10}
            // 滚轮一格固定 10%：默认的 smooth 会把 deltaY 乘进步长，一格能跳到 250%
            smooth={false}
            wheel={{ step: 0.1 }}
            doubleClick={{ mode: 'toggle' }}
            // 只缩不放：fitOnInit 会把小图拉到 100% 以上，反而比原图更糊
            onInit={(ref) => void ref.fitToView({ mode: 'contain', maxScale: 1, animationTime: 0 })}
            onTransform={(instance) => setPercent(Math.round(instance.state.scale * 100))}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%' }}
            >
              <img src={src} alt={alt} draggable={false} className="size-full object-contain" />
            </TransformComponent>
          </TransformWrapper>
        </div>

        <p className="shrink-0 text-center text-xs text-white/60">{t('hint')}</p>
      </DialogContent>
    </Dialog>
  )
}
