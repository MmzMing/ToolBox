import type { RgbaFrame } from './types'

export type VideoExtraction = {
  frames: RgbaFrame[]
  /** 读回全黑而重seek 的次数：POC 实测到偶发空帧（见设计文档 §12 结论 5） */
  retried: number
  /** seek 超时被跳过的帧 */
  skipped: number
}

export type ExtractOptions = {
  startSec: number
  endSec: number
  fps: number
  size: { width: number; height: number }
  /** 源视频坐标系内的裁剪矩形 */
  crop: { x: number; y: number; width: number; height: number }
  onProgress?: (done: number, total: number) => void
}

const SEEK_TIMEOUT_MS = 3000

export function frameCountFor(startSec: number, endSec: number, fps: number): number {
  if (!(endSec > startSec) || !(fps > 0)) {
    throw new Error(`invalid range ${startSec}s..${endSec}s at ${fps}fps`)
  }
  return Math.max(1, Math.round((endSec - startSec) * fps))
}

function seekTo(video: HTMLVideoElement, time: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3) {
      resolve(true)
      return
    }
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      resolve(ok)
    }
    const onSeeked = () => finish(true)
    const timer = setTimeout(() => finish(false), SEEK_TIMEOUT_MS)
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

/** 抽稀采样判断是否整帧全黑（解码器偶发返回空帧） */
function isBlank(rgba: Uint8ClampedArray): boolean {
  for (let i = 0; i < rgba.length; i += 4001) {
    if (rgba[i] !== 0 || rgba[i + 1] !== 0 || rgba[i + 2] !== 0) return false
  }
  return true
}

/**
 * 逐帧 seek 取像素。必须在主线程：Worker 里没有 DOM，造不出 <video>，
 * 而 OffscreenCanvas 也画不了视频元素。
 */
export async function extractVideoFrames(
  video: HTMLVideoElement,
  options: ExtractOptions,
): Promise<VideoExtraction> {
  const { startSec, endSec, fps, size, crop, onProgress } = options
  const total = frameCountFor(startSec, endSec, fps)
  const delayCs = Math.max(1, Math.round(100 / fps))
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('canvas 2d context unavailable')
  }

  const frames: RgbaFrame[] = []
  let retried = 0
  let skipped = 0
  const lastSafe = Math.max(0, (video.duration || endSec) - 0.05)

  for (let index = 0; index < total; index += 1) {
    const time = Math.min(startSec + index / fps, lastSafe)
    const seeked = await seekTo(video, time)
    if (!seeked) {
      skipped += 1
      onProgress?.(index + 1, total)
      continue
    }
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
    let rgba = ctx.getImageData(0, 0, size.width, size.height).data
    if (isBlank(rgba)) {
      retried += 1
      await seekTo(video, time + 0.001)
      ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
      rgba = ctx.getImageData(0, 0, size.width, size.height).data
    }
    frames.push({ width: size.width, height: size.height, delayCs, rgba })
    onProgress?.(index + 1, total)
  }

  return { frames, retried, skipped }
}

/** 挂载一个隐藏但参与解码的 video 元素（游离元素在部分浏览器不解码） */
export function attachHiddenVideo(url: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0'
  document.body.appendChild(video)
  return video
}

export function detachVideo(video: HTMLVideoElement): void {
  video.removeAttribute('src')
  video.load()
  video.remove()
}
