import { Maximize2, Minus, Plus, Scan, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** 灯箱里的两页：圈中的原图 / 映射后的成品图纸 */
export type BeadLightboxView = 'source' | 'chart'

/** 悬浮在深色遮罩上的控件底板，亮暗主题都可读 */
const CHIP = 'bg-background/80 flex shrink-0 items-center gap-1 rounded-full p-1 backdrop-blur'

type BeadLightboxProps = {
  /** 打开时先看哪一页（跟随操作台当前的 tab） */
  initialView: BeadLightboxView
  sourceView: ReactNode
  /** 传 null 表示还没有成品，此时不显示切换器 */
  chartView: ReactNode | null
}

/** 灯箱查看：全屏遮罩 + 滚轮缩放 / 拖动平移 / 双击放大，原图与图纸两页可切换 */
export function BeadLightbox({ initialView, sourceView, chartView }: BeadLightboxProps) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-to-beads.lightbox' })
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<BeadLightboxView>('source')
  const [percent, setPercent] = useState(100)
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null)

  const hasChart = chartView != null
  const current: BeadLightboxView = hasChart ? view : 'source'

  /** 每次打开都回到当前 tab 对应的那一页，缩放指示复位（实际比例由 fitOnInit 回报） */
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setView(hasChart ? initialView : 'source')
      setPercent(100)
    }
    setOpen(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasChart) return
    if (event.key === 'ArrowLeft') setView('source')
    if (event.key === 'ArrowRight') setView('chart')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('trigger')}>
          <Scan className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent
        onKeyDown={handleKeyDown}
        // DialogContent 自带 sm:max-w-sm，跨档位列名不同、合并器不会互相抵掉，必须一并覆盖
        className="flex h-svh max-w-none flex-col gap-3 rounded-none border-none bg-black/90 p-3 sm:max-w-none [&>button]:hidden"
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          {hasChart ? (
            <ToggleGroup
              type="single"
              value={current}
              onValueChange={(value) => value && setView(value as BeadLightboxView)}
              className={CHIP}
            >
              <ToggleGroupItem value="source" size="sm" className="rounded-full px-3 text-xs">
                {t('source')}
              </ToggleGroupItem>
              <ToggleGroupItem value="chart" size="sm" className="rounded-full px-3 text-xs">
                {t('chart')}
              </ToggleGroupItem>
            </ToggleGroup>
          ) : (
            <span />
          )}

          <div className={CHIP}>
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
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {/* key 换页即重建变换实例，缩放与平移自然回到刚打开的状态 */}
          <TransformWrapper
            ref={transformRef}
            key={current}
            minScale={0.1}
            maxScale={10}
            doubleClick={{ mode: 'toggle' }}
            // 首屏铺满但不放大：fitOnInit 会把小图拉到 180%，反而比原图更糊
            onInit={(ref) => void ref.fitToView({ mode: 'contain', maxScale: 1, animationTime: 0 })}
            onTransform={(instance) => setPercent(Math.round(instance.state.scale * 100))}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              {current === 'chart' ? chartView : sourceView}
            </TransformComponent>
          </TransformWrapper>
        </div>

        <p className="shrink-0 text-center text-xs text-white/60">{t('hint')}</p>
      </DialogContent>
    </Dialog>
  )
}
