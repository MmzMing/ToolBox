import { describe, expect, it } from 'vitest'

import {
  dateToTs,
  formatDateAll,
  formatLocalDateTime,
  parseDateInput,
  toDatetimeLocalValue,
  tsToDate,
} from '@/tools/development/date-time-converter/service'

describe('parseDateInput', () => {
  it('parses pure digits as a millisecond timestamp', () => {
    expect(parseDateInput('1789821296000').getTime()).toBe(1789821296000)
  })

  it('tolerates surrounding whitespace on timestamps', () => {
    expect(parseDateInput('  1789821296000  ').getTime()).toBe(1789821296000)
  })

  it('parses ISO strings', () => {
    expect(parseDateInput('2026-09-19T12:34:56.000Z').getTime()).toBe(1789821296000)
  })

  it('parses date-only strings', () => {
    expect(parseDateInput('2026-09-19').toISOString()).toBe('2026-09-19T00:00:00.000Z')
  })

  it('throws on empty input', () => {
    expect(() => parseDateInput('')).toThrow()
    expect(() => parseDateInput('   ')).toThrow()
  })

  it('throws on unparseable text', () => {
    expect(() => parseDateInput('not-a-date')).toThrow()
  })

  it('throws on out-of-range dates', () => {
    expect(() => parseDateInput('2026-13-40')).toThrow()
  })
})

describe('formatDateAll', () => {
  const date = new Date('2026-09-19T12:34:56.000Z')

  it('returns all six formats with stable labels', () => {
    expect(formatDateAll(date).map((output) => output.label)).toEqual([
      'iso',
      'local',
      'unixSeconds',
      'unixMs',
      'utc',
      'relative',
    ])
  })

  it('formats iso / unix / utc values deterministically', () => {
    const values = Object.fromEntries(formatDateAll(date).map((o) => [o.label, o.value]))
    expect(values.iso).toBe('2026-09-19T12:34:56.000Z')
    expect(values.unixMs).toBe('1789821296000')
    expect(values.unixSeconds).toBe('1789821296')
    expect(values.utc).toBe('Sat, 19 Sep 2026 12:34:56 GMT')
  })

  it('produces non-empty local and relative strings', () => {
    const values = Object.fromEntries(formatDateAll(date).map((o) => [o.label, o.value]))
    expect(values.local.length).toBeGreaterThan(0)
    expect(values.relative.length).toBeGreaterThan(0)
  })
})

describe('timestamp helpers', () => {
  it('converts timestamps with unit awareness', () => {
    const date = new Date('2026-09-19T00:00:00.000Z')
    expect(dateToTs(date, 's')).toBe(Math.floor(date.getTime() / 1000))
    expect(dateToTs(date, 'ms')).toBe(date.getTime())
    expect(tsToDate(dateToTs(date, 'ms'), 'ms').getTime()).toBe(date.getTime())
    expect(tsToDate(dateToTs(date, 's'), 's').getTime()).toBe(
      date.getTime() - (date.getTime() % 1000),
    )
  })

  it('rejects invalid timestamps', () => {
    expect(() => tsToDate(-1, 's')).toThrowError(/Invalid timestamp/)
  })

  it('formats local datetime and datetime-local value', () => {
    const date = new Date(2026, 8, 19, 9, 5, 3)
    expect(formatLocalDateTime(date)).toBe('2026/09/19 09:05:03')
    expect(toDatetimeLocalValue(date)).toBe('2026-09-19T09:05:03')
  })
})
