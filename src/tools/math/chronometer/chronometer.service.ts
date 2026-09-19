export interface ChronometerLap {
  /** 计次序号，从 1 开始 */
  index: number
  /** 从开始到该计次的累计时间（毫秒） */
  total: number
  /** 与上一计次的间隔（毫秒） */
  delta: number
}

/**
 * 格式化毫秒为 mm:ss.cs（百分秒）；
 * 超过 1 小时显示 h:mm:ss.cs（小时不补零）。
 */
export function formatChronometer(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const centiseconds = Math.floor((safeMs % 1000) / 10)
  const totalSeconds = Math.floor(safeMs / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const pad2 = (value: number) => String(value).padStart(2, '0')
  const mmss = `${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

/** 由累计时间序列计算各计次（delta 为与上一计次的间隔） */
export function computeLaps(times: number[]): ChronometerLap[] {
  return times.map((total, index) => ({
    index: index + 1,
    total,
    delta: total - (times[index - 1] ?? 0),
  }))
}
