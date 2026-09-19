import { describe, expect, it } from 'vitest'

import {
  ULID_ENCODING,
  ULID_REGEX,
  generateUlid,
  generateUlids,
  ULID_COUNT_RANGE,
} from './ulid-generator.service'

/** 解码 ULID 前 10 位时间戳部分 */
function decodeTime(ulid: string): number {
  let value = 0
  for (const char of ulid.slice(0, 10)) {
    value = value * 32 + ULID_ENCODING.indexOf(char)
  }
  return value
}

describe('generateUlid', () => {
  it('generates 26 uppercase Crockford Base32 characters', () => {
    const ulid = generateUlid(0)
    expect(ulid).toHaveLength(26)
    expect(ulid).toMatch(ULID_REGEX)
    expect(ulid).toBe(ulid.toUpperCase())
  })

  it('encodes the given timestamp into the first 10 characters', () => {
    expect(generateUlid(0).slice(0, 10)).toBe('0000000000')
    const timestamp = 1_700_000_000_000
    expect(decodeTime(generateUlid(timestamp))).toBe(timestamp)
  })

  it('uses the current time by default', () => {
    const ulid = generateUlid()
    const decoded = decodeTime(ulid)
    // 取样与生成之间时钟可能走动，用宽容窗口避免抖动
    expect(Math.abs(decoded - Date.now())).toBeLessThan(60_000)
  })

  it('sorts lexicographically by timestamp', () => {
    const older = generateUlid(1_000)
    const newer = generateUlid(2_000)
    expect(older < newer).toBe(true)
  })

  it('keeps randomness only in the last 16 characters', () => {
    expect(generateUlid(123).slice(0, 10)).toBe(generateUlid(123).slice(0, 10))
    expect(generateUlid(123)).not.toBe(generateUlid(123))
  })

  it('rejects invalid timestamps', () => {
    expect(() => generateUlid(-1)).toThrowError(/timestamp/i)
    expect(() => generateUlid(2 ** 48)).toThrowError(/timestamp/i)
    expect(() => generateUlid(1.5)).toThrowError(/timestamp/i)
  })
})

describe('generateUlids', () => {
  it('generates the requested number of unique ULIDs', () => {
    const ulids = generateUlids(20)
    expect(ulids).toHaveLength(20)
    expect(new Set(ulids).size).toBe(20)
    for (const ulid of ulids) {
      expect(ulid).toMatch(ULID_REGEX)
    }
  })

  it('rejects out-of-range count', () => {
    expect(() => generateUlids(0)).toThrowError(/count/i)
    expect(() => generateUlids(ULID_COUNT_RANGE.max + 1)).toThrowError(/count/i)
    expect(() => generateUlids(2.5)).toThrowError(/count/i)
  })
})
