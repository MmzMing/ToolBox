/**
 * 让出一帧，好把主线程交还给浏览器。
 *
 * 只等 requestAnimationFrame 不够：页面切到后台时 rAF 根本不触发，
 * 一次分段导出或接缝识别会永远挂在那里。所以再挂一个短超时兜底，
 * 前台照旧按帧让，后台按拍让（约 4 帧的间隔，足够让输入事件挤进来）。
 */
export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 64)
    requestAnimationFrame(() => {
      window.clearTimeout(timer)
      resolve()
    })
  })
}
