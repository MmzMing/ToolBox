/**
 * 离屏画布助手。渲染管线需要多块缓存画布（碎片精灵、残影层、辉光降采样…），
 * 统一在这里创建，避免每处都要处理 getContext 的 null。
 */

export function makeCanvas(w = 2, h = 2): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.trunc(w))
  cv.height = Math.max(1, Math.trunc(h))
  return cv
}

export function ctxOf(
  cv: HTMLCanvasElement,
  opts?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = cv.getContext('2d', opts)
  if (!ctx) throw new Error('Canvas 2D context is unavailable in this browser')
  return ctx
}

/** 复用地画布：尺寸变了才重建缓冲区 */
export function ensure(cv: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const nw = Math.max(1, Math.trunc(w))
  const nh = Math.max(1, Math.trunc(h))
  if (cv.width !== nw || cv.height !== nh) {
    cv.width = nw
    cv.height = nh
  }
  return cv
}
