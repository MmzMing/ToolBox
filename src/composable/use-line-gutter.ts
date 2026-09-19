import { useCallback, useRef } from 'react'

/**
 * 行号槽与滚动容器的同步器：直接改 transform，避免每次滚动都重渲染整棵子树。
 * 用法：内容区 onScroll 里调用 syncScroll(el.scrollTop)。
 */
export function useLineGutter() {
  const innerRef = useRef<HTMLDivElement>(null)

  const syncScroll = useCallback((scrollTop: number) => {
    const inner = innerRef.current
    if (inner) {
      inner.style.transform = `translateY(${-scrollTop}px)`
    }
  }, [])

  return { innerRef, syncScroll }
}
