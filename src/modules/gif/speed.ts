/** 浏览器对超短延时不可靠：低于这个值会被合并/丢帧，表现为闪烁 */
export const MIN_RELIABLE_DELAY_CS = 2

export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const

export type SpeedResult = {
  delaysCs: number[]
  /** 被抬到可靠下限的帧数，UI 据此提示「已到最快上限」 */
  clamped: number
}

/**
 * 倍速只改延时不改帧数：2× 是 delay 减半，所以体积不变、时长变短。
 * 想真正省空间得删帧，那是帧列表的事。
 */
export function applySpeedFactor(delaysCs: readonly number[], factor: number): SpeedResult {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`speed factor must be a positive number, got ${factor}`)
  }
  let clamped = 0
  const next = delaysCs.map((delay) => {
    const scaled = Math.round(delay / factor)
    if (scaled < MIN_RELIABLE_DELAY_CS) {
      clamped += 1
      return MIN_RELIABLE_DELAY_CS
    }
    return scaled
  })
  return { delaysCs: next, clamped }
}

/** 输入框用「秒」，内部一律厘秒：GIF 只有 1/100 秒分辨率 */
export function secondsToCs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`seconds must be a positive number, got ${seconds}`)
  }
  return Math.max(1, Math.round(seconds * 100))
}

export function csToSeconds(cs: number): string {
  return (Math.max(1, Math.round(cs)) / 100).toFixed(2)
}

export function secondsOf(delaysCs: readonly number[]): number {
  return delaysCs.reduce((sum, delay) => sum + delay, 0) / 100
}
