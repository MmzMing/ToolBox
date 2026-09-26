import { useEffect, useRef, useState } from 'react'

/** 工作台高度下限（px）：窗口再矮也不至于把编辑区压成一条 */
const MIN_FILL_HEIGHT = 320

/** 内容区底部留白（px），与工具页的 `py-6` 对齐，避免凭空多出一条滚动条 */
const BOTTOM_GAP_PX = 24

/**
 * 实测「视窗剩余高度」交给工作台铺满，窗口尺寸或上方内容变化时重测。
 *
 * 不靠祖先的高度链：工具页的布局没有把高度打通到视口，实测更稳，也不会因为
 * 描述文案折行、上方多出一条错误提示而把高度算错。
 *
 * @param enabled 只在需要铺满的布局（如 PC 分栏）下测量，否则返回 `null`
 * @returns `rootRef` 挂到工作台根节点，`height` 为其像素高度（不测量时为 null）
 */
export function useFillHeight(enabled: boolean) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const element = rootRef.current
    if (!enabled || element === null) {
      setHeight(null)
      return
    }

    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(MIN_FILL_HEIGHT, Math.round(window.innerHeight - top - BOTTOM_GAP_PX)))
    }

    measure()
    window.addEventListener('resize', measure)
    // 上方的错误提示出现/消失会改变本元素的起始位置，用父容器尺寸变化兜住
    const parent = element.parentElement
    const observer =
      parent !== null && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (observer !== null && parent !== null) {
      observer.observe(parent)
    }
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [enabled])

  return { rootRef, height }
}
