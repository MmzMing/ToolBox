import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { LongLayout, LongStyle } from '../long-stack.service'
import { LongBands, type LongBandSource } from './LongBands'

/**
 * 整图缩览：成品有一两万像素高，光靠滚动条根本定位不到「刚调的那条接缝在哪」。
 * 这里把同一份构图按高度塞进一栏，再叠一个视口框；点或拖它就跳过去。
 *
 * 位置全用比例算，不用 px —— 缩放档位改了、窗口高了，都不需要重新量。
 */
export function LongMinimap({
  layout,
  style,
  sources,
  width,
  height,
  viewRatio,
  viewTopRatio,
  onJump,
}: {
  layout: LongLayout
  style: LongStyle
  sources: ReadonlyMap<string, LongBandSource>
  width: number
  height: number
  /** 视口占整条成品的比例（0..1） */
  viewRatio: number
  /** 视口上沿占整条成品的比例 */
  viewTopRatio: number
  onJump: (ratio: number) => void
}) {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const scale =
    layout.width > 0 && layout.height > 0
      ? Math.min(width / layout.width, height / layout.height)
      : 0

  const jumpTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.height <= 0) {
      return
    }
    onJump(Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)))
  }

  return (
    <div
      role="scrollbar"
      aria-label={t('long.minimapAria')}
      aria-controls="long-stage-viewport"
      aria-valuenow={Math.round(viewTopRatio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      className="border-border bg-muted/40 relative shrink-0 touch-none overflow-hidden rounded-md border"
      style={{ width, height }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        jumpTo(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons > 0) {
          jumpTo(event)
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.2 : 0.06
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          onJump(Math.max(0, viewTopRatio - step))
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          onJump(Math.min(1, viewTopRatio + step))
        }
      }}
    >
      {scale > 0 ? (
        <div className="pointer-events-none flex size-full items-center justify-center">
          <LongBands layout={layout} style={style} scale={scale} sources={sources} />
        </div>
      ) : null}
      <div
        className={cn(
          'border-primary bg-primary/15 pointer-events-none absolute inset-x-0 rounded-[2px] border',
        )}
        style={{
          top: `${viewTopRatio * 100}%`,
          height: `${Math.max(0.02, viewRatio) * 100}%`,
        }}
      />
    </div>
  )
}
