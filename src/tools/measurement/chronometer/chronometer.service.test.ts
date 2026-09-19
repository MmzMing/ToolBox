import { describe, expect, it } from 'vitest'

import { computeLaps, formatChronometer } from './chronometer.service'

describe('formatChronometer', () => {
  it('formats zero as 00:00.00', () => {
    expect(formatChronometer(0)).toBe('00:00.00')
  })

  it('formats sub-second values with centiseconds', () => {
    expect(formatChronometer(1230)).toBe('00:01.23')
    expect(formatChronometer(90)).toBe('00:00.09')
  })

  it('formats 59.99s without rolling over', () => {
    expect(formatChronometer(59990)).toBe('00:59.99')
  })

  it('formats one hour as h:mm:ss.cs', () => {
    expect(formatChronometer(3600000)).toBe('1:00:00.00')
  })

  it('formats values just below one hour without hours', () => {
    expect(formatChronometer(3599999)).toBe('59:59.99')
  })

  it('formats multi-hour values', () => {
    expect(formatChronometer(7223456)).toBe('2:00:23.45')
  })

  it('floors fractional milliseconds', () => {
    expect(formatChronometer(1999.9)).toBe('00:01.99')
  })

  it('clamps negative input to zero', () => {
    expect(formatChronometer(-5)).toBe('00:00.00')
  })
})

describe('computeLaps', () => {
  it('returns an empty array for no laps', () => {
    expect(computeLaps([])).toEqual([])
  })

  it('computes index, total and delta for each lap', () => {
    expect(computeLaps([1000, 2500, 4000])).toEqual([
      { index: 1, total: 1000, delta: 1000 },
      { index: 2, total: 2500, delta: 1500 },
      { index: 3, total: 4000, delta: 1500 },
    ])
  })

  it('uses the first lap time as its own delta', () => {
    expect(computeLaps([650])).toEqual([{ index: 1, total: 650, delta: 650 }])
  })
})
