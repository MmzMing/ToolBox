export type GifBudgetLimits = {
  maxWidth: number
  maxHeight: number
  maxSeconds: number
  maxFrames: number
}

/** 设计文档 §4 的上限表；720px 档 v1 不开放，避免移动端 OOM 面扩大 */
export const DESKTOP_LIMITS: GifBudgetLimits = {
  maxWidth: 480,
  maxHeight: 480,
  maxSeconds: 20,
  maxFrames: 300,
}

export const MOBILE_LIMITS: GifBudgetLimits = {
  maxWidth: 320,
  maxHeight: 320,
  maxSeconds: 10,
  maxFrames: 120,
}

export function limitsFor(isMobile: boolean): GifBudgetLimits {
  return isMobile ? MOBILE_LIMITS : DESKTOP_LIMITS
}

export type BudgetInput = {
  width: number
  height: number
  frames: number
  /** 总播放时长（秒），由帧延时累加 */
  seconds: number
}

/**
 * 编码前的粗估：POC 标定 gifenc 全帧输出约 20KB/百万像素（未做帧差），
 * 用于「先拒再算」，避免把内存花在注定失败的作业上。
 */
const BYTES_PER_MEGAPIXEL = 20 * 1024

export function estimateGifBytes(input: Pick<BudgetInput, 'width' | 'height' | 'frames'>): number {
  const megapixels = (input.width * input.height * input.frames) / 1e6
  return Math.round(megapixels * BYTES_PER_MEGAPIXEL)
}

export type BudgetFailure = {
  ok: false
  reason: 'width' | 'height' | 'frames' | 'seconds'
  /** 建议值：按超限项直接收口到上限，UI 可一键应用 */
  suggestion: { width: number; height: number; frames: number; seconds: number }
}

export type BudgetVerdict = { ok: true } | BudgetFailure

export function checkBudget(input: BudgetInput, limits: GifBudgetLimits): BudgetVerdict {
  const suggestion = {
    width: Math.min(input.width, limits.maxWidth),
    height: Math.min(input.height, limits.maxHeight),
    frames: Math.min(input.frames, limits.maxFrames),
    seconds: Math.min(input.seconds, limits.maxSeconds),
  }
  if (input.width > limits.maxWidth) return { ok: false, reason: 'width', suggestion }
  if (input.height > limits.maxHeight) return { ok: false, reason: 'height', suggestion }
  if (input.frames > limits.maxFrames) return { ok: false, reason: 'frames', suggestion }
  if (input.seconds > limits.maxSeconds) return { ok: false, reason: 'seconds', suggestion }
  return { ok: true }
}
