import { useEffect, useRef, useState, type ReactNode } from 'react'

const ROW_UNIT = 8
const GAP = 12

export type MasonryItem = { key: string; ratio: number; node: ReactNode }

type ResultMasonryProps = {
  items: MasonryItem[]
  onLoadMore: () => void
  hasMore: boolean
}

/** Grid + row-span 瀑布流：按已知宽高比预算高度，保留时间序且零依赖 */
export function ResultMasonry({ items, onLoadMore, hasMore }: ResultMasonryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [columnWidth, setColumnWidth] = useState(240)

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      const cols = width < 768 ? 2 : width < 1280 ? 3 : 4
      setColumnWidth((width - GAP * (cols - 1)) / cols)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) {
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onLoadMore()
        }
      },
      { rootMargin: '240px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  return (
    <div
      ref={containerRef}
      className="grid gap-3"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gridAutoRows: `${ROW_UNIT}px`,
      }}
    >
      {items.map((item) => {
        const height = Math.max(160, columnWidth / (item.ratio || 1))
        const span = Math.ceil((height + GAP) / (ROW_UNIT + GAP))
        return (
          <div key={item.key} style={{ gridRowEnd: `span ${span}` }} className="min-h-0">
            {item.node}
          </div>
        )
      })}
      {hasMore && <div ref={sentinelRef} className="h-px" />}
    </div>
  )
}
