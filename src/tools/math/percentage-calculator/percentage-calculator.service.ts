/**
 * 百分比计算（纯逻辑）。全部结果四舍五入 6 位小数，避免浮点尾巴。
 */

function round6(value: number): number {
  return Number(value.toFixed(6))
}

/** X 的 Y% 是多少（如 percentOf(200, 15) → 30） */
export function percentOf(x: number, y: number): number {
  return round6((x * y) / 100)
}

/** X 是 Y 的百分之几（如 whatPercentIs(30, 200) → 15）；Y = 0 抛 Error */
export function whatPercentIs(x: number, y: number): number {
  if (y === 0) {
    throw new Error('Cannot divide by zero: Y must not be 0')
  }
  return round6((x / y) * 100)
}

/** 从 X 到 Y 的百分比变化，负数表示减少（如 percentageChange(100, 150) → 50）；X = 0 抛 Error */
export function percentageChange(from: number, to: number): number {
  if (from === 0) {
    throw new Error('Cannot divide by zero: the starting value must not be 0')
  }
  return round6(((to - from) / from) * 100)
}

/** X 增加 percent% 后的值，负数表示减少（如 applyPercentage(200, 10) → 220） */
export function applyPercentage(x: number, percent: number): number {
  return round6(x * (1 + percent / 100))
}
