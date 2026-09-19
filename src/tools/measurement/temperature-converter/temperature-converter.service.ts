export const temperatureUnits = ['C', 'F', 'K'] as const

export type TemperatureUnit = (typeof temperatureUnits)[number]

export interface TemperatureConversions {
  C: number
  F: number
  K: number
}

const round2 = (value: number): number => Math.round(value * 100) / 100

function toCelsius(value: number, from: TemperatureUnit): number {
  if (from === 'C') {
    return value
  }
  if (from === 'F') {
    return ((value - 32) * 5) / 9
  }
  return value - 273.15
}

function fromCelsius(celsius: number, to: TemperatureUnit): number {
  if (to === 'C') {
    return celsius
  }
  if (to === 'F') {
    return (celsius * 9) / 5 + 32
  }
  return celsius + 273.15
}

/** 温度互转：任意单位 → 三单位结果（保留 2 位小数），非法输入抛 Error */
export function convertTemperature(value: number, from: TemperatureUnit): TemperatureConversions {
  if (!Number.isFinite(value)) {
    throw new Error('Temperature value must be a finite number')
  }
  const celsius = toCelsius(value, from)
  return {
    C: round2(celsius),
    F: round2(fromCelsius(celsius, 'F')),
    K: round2(fromCelsius(celsius, 'K')),
  }
}
