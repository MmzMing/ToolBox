import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { LONG_ZOOM_MAX, LONG_ZOOM_MIN } from '../long-stack.service'
import { useImageStackStore } from '../store'
import { useLongGeometry, useReadyAssets } from '../use-scene'
import { LongBands } from './LongBands'
import { LongMinimap } from './LongMinimap'

/** 缩览那一栏的宽度：够看清「哪一段是图、哪一段是空白」就够了 */
const MINIMAP_WIDTH = 56

/**
 * 长图预览：固定高度的缩放视口，而不是把上万像素摊在页面上。
 *
 * 摊开来的话，调一个参数要滚很久才看到结果，成品越堆越长会把整页撑到两三万像素高。
 * 收进视口后成品区始终是那么大，「看整体」交给右侧缩览，「看接缝」交给缩放。
 *
 * 预览仍然走 DOM：一张 16000px 高的成品画进单个 canvas，backing store 要吃三千多万像素，
 * 浏览器不报错但会把内存打爆。几何与导出读的是同一个 `resolveLongLayout` 结果，
 * 要看逐位精确的成品用导出对话框里的预览（那份是真 canvas 渲染出来的）。
 *
 * 这是这一档唯一的内层滚动容器。它与 app-shell 反对的那种「页面里再套一层滚动」不同：
 * 外层 <main> 照常滚动，这一块是一块查看器画布，尺寸由自身决定，不会因为
 * 移动端浏览器工具栏伸缩而把页面头部顶走。
 */
export function LongStage() {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [view, setView] = useState({ top: 0, ratio: 1 })
  const { layout } = useLongGeometry()
  const assets = useReadyAssets()
  const style = useImageStackStore((state) => state.longStyle)
  const zoom = useImageStackStore((state) => state.longZoom)
  const setLongZoom = useImageStackStore((state) => state.setLongZoom)
  const selection = useImageStackStore((state) => state.longSelection)
  const selectLongItem = useImageStackStore((state) => state.selectLongItem)

  const sources = useMemo(
    () => new Map(assets.map((item) => [item.id, { url: item.thumbUrl, name: item.name }])),
    [assets],
  )
  const fitScale = layout.width > 0 ? box.width / layout.width : 0
  const scale = fitScale * zoom

  /** 视口尺寸既决定成品按多宽铺，也决定缩览那一栏多高 */
  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    const sync = () => setBox({ width: node.clientWidth, height: node.clientHeight })
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const syncView = useCallback(() => {
    const node = scrollRef.current
    if (!node || node.scrollHeight <= 0) {
      setView({ top: 0, ratio: 1 })
      return
    }
    setView({
      top: node.scrollTop / node.scrollHeight,
      ratio: node.clientHeight / node.scrollHeight,
    })
  }, [])

  // 缩放或素材变化都会改内容高度，视口框得重新量一次，否则会停在旧比例上
  useEffect(() => {
    syncView()
  }, [syncView, scale, layout.height])

  // 缩放手势：ctrl/⌘ + 滚轮，普通滚轮留给视口纵向滚动。
  // React 的 onWheel 是 passive 监听，拦不住浏览器默认的整页缩放，所以挂原生监听。
  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }
      event.preventDefault()
      setLongZoom(zoom * Math.exp(-event.deltaY * 0.0015))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoom, setLongZoom])

  const jump = (ratio: number) => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    node.scrollTop = ratio * node.scrollHeight - node.clientHeight / 2
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
        <span className="text-muted-foreground shrink-0 text-xs">{t('long.zoom')}</span>
        <Slider
          aria-label={t('long.zoom')}
          className="w-36"
          min={LONG_ZOOM_MIN * 100}
          max={LONG_ZOOM_MAX * 100}
          step={25}
          value={[Math.round(zoom * 100)]}
          onValueChange={([value = 100]) => setLongZoom(value / 100)}
        />
        <span className="text-muted-foreground w-11 shrink-0 font-mono text-xs">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="xs" variant="ghost" onClick={() => setLongZoom(LONG_ZOOM_MIN)}>
          {t('long.zoomFit')}
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">{t('long.zoomHint')}</span>
      </div>

      <div className="flex min-w-0 items-stretch gap-3">
        <div
          ref={scrollRef}
          id="long-stage-viewport"
          aria-label={t('long.stageAria')}
          onScroll={syncView}
          className="bg-muted border-border h-[min(72vh,880px)] min-h-0 grow overflow-auto rounded-lg border"
        >
          <div className="flex min-h-full w-max min-w-full items-center justify-center">
            {layout.bands.length === 0 ? (
              <p className="text-muted-foreground px-6 py-12 text-center text-xs">
                {t('long.emptyStage')}
              </p>
            ) : scale > 0 ? (
              <LongBands
                layout={layout}
                style={style}
                scale={scale}
                sources={sources}
                selection={selection}
                onPick={(imageId) => selectLongItem(selection === imageId ? null : imageId)}
              />
            ) : null}
          </div>
        </div>

        <LongMinimap
          layout={layout}
          style={style}
          sources={sources}
          width={MINIMAP_WIDTH}
          height={box.height}
          viewRatio={view.ratio}
          viewTopRatio={view.top}
          onJump={jump}
        />
      </div>
    </div>
  )
}
