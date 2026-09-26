import { useEffect, useRef, useState } from 'react'

/** 量父容器宽度：舞台与拆分预览都按它配合 fitBox 等比缩放画布 */
export function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      setWidth((previous) => (Math.abs(previous - next) < 1 ? previous : next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
