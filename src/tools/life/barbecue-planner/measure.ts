import type { LocalText, Measure, Range } from './types'

/** 有来源支撑的数值；单值时 min === max */
export function num(
  min: number,
  max: number = min,
  confidence: 'authoritative' | 'derived' = 'authoritative',
  basis?: LocalText,
): Measure {
  return { kind: 'num', min, max, confidence, basis }
}

/** 公开资料缺口：类型上就带不了数值，UI 必须灰化而不是显示编造出来的克数 */
export function gap(basis: LocalText): Measure {
  return { kind: 'gap', confidence: 'gap', basis }
}

/** 可选量与 gap 量一并归入 undefined 分支，调用方不必层层判空 */
export function isNum(measure: Measure | undefined): measure is Extract<Measure, { kind: 'num' }> {
  return measure?.kind === 'num'
}

/** 区间中位，用于把区间折算成单一采购量 */
export function midpoint(measure: Measure | undefined): number | null {
  return measure && measure.kind === 'num' ? (measure.min + measure.max) / 2 : null
}

export function range(min: number, max: number): Range {
  return { min, max }
}

/** 1500 → "1.5 kg"；小于 1000 走克；用于采购清单的可读输出 */
export function formatGrams(grams: number): string {
  if (grams >= 1000) {
    return `${(Math.round(grams / 50) / 20).toFixed(2).replace(/\.?0+$/, '')} kg`
  }
  return `${Math.round(grams)} g`
}

/** 分钟区间 → "8–10 min"；单值 → "25 min" */
export function formatMinutes(minutes: Range): string {
  return minutes.min === minutes.max ? `${minutes.min} min` : `${minutes.min}–${minutes.max} min`
}

/** 区间折叠成可读字符串：min === max 时不写"1–1"这种废话 */
export function formatSpan(min: number, max: number, unit: string): string {
  const show = (value: number) => String(Math.round(value * 10) / 10)
  return min === max ? `${show(min)} ${unit}` : `${show(min)}–${show(max)} ${unit}`
}

/** T-24h / T-40min / T-0 这样的倒排标签 */
export function formatOffset(offsetMin: number): string {
  if (offsetMin === 0) {
    return 'T-0'
  }
  const abs = Math.abs(offsetMin)
  if (abs < 60) {
    return `T-${abs}min`
  }
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  return rest === 0 ? `T-${hours}h` : `T-${hours}h${rest}min`
}
