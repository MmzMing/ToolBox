import { useEffect, useRef, useState } from 'react'

import { clampHole, holeOf, spotlightPanels, type Rect } from './targets'
import { cn } from '@/lib/utils'

type TourSpotlightProps = {
  /** 当前目标的视口矩形；null 表示目标还没测到，宁可不画也不画在空处 */
  rect: Rect | null
  /** 点模糊区退出介绍 */
  onStop: () => void
  className?: string
}

/**
 * 导览聚光层：目标四周铺四块模糊面板，中间留一块清晰区，清晰区描一圈虚线。
 *
 * 挂在 app-shell 根上并用 absolute 铺满——项目约定唯一滚动容器是 `<main>`，
 * 这里再开一个 fixed 层会跟那套壳层打架。
 */
export function TourSpotlight({ rect, onStop, className }: TourSpotlightProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (host === null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox({ width, height })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const hole = rect === null || box.width === 0 ? null : clampHole(holeOf(rect), box)

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 z-45', className)}
    >
      {hole === null
        ? null
        : spotlightPanels(hole, box).map((panel, i) => (
            <div
              key={i}
              // 点模糊区就退出：介绍是可随时打断的说明，不是必须走完的流程
              onPointerDown={onStop}
              // 宿主不吃指针（否则导览没开时这层空壳会吞掉全站点击），
              // 所以四块面板要自己把指针收回来——点模糊区退出介绍靠的就是它们
              className="bg-background/55 pointer-events-auto absolute cursor-zoom-out backdrop-blur-[3px] transition-all duration-500 ease-out"
              style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
            />
          ))}
      {hole === null ? null : (
        <div
          className="border-foreground/70 absolute rounded-2xl border-2 border-dashed transition-all duration-500 ease-out"
          style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }}
        />
      )}
    </div>
  )
}
