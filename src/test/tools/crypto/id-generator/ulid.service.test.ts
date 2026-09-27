import { describe, expect, it } from 'vitest'

import {
  ULID_LENGTH,
  ULID_MAX_TIMESTAMP,
  generateUlid,
  generateUlids,
  isValidUlid,
  ulidTimestamp,
  ulidToUuid,
  uuidToUlid,
} from '@/tools/crypto/id-generator/ulid.service'

/** 官方 README 的示例 ULID，时间戳 2016-07-30T23:54:10.259Z */
const SAMPLE = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const BASE = 1_700_000_000_123

describe('generateUlid', () => {
  it('returns a 26-character Crockford Base32 id stamped with the current time', () => {
    const id = generateUlid()
    expect(id).toHaveLength(ULID_LENGTH)
    expect(isValidUlid(id)).toBe(true)
    expect(Math.abs(ulidTimestamp(id) - Date.now())).toBeLessThan(2_000)
  })

  it('embeds an explicit timestamp and reads it back', () => {
    expect(ulidTimestamp(generateUlid({ timestamp: BASE }))).toBe(BASE)
  })

  it('emits uppercase and accepts lowercase as input', () => {
    const id = generateUlid()
    expect(id).toBe(id.toUpperCase())
    expect(isValidUlid(id.toLowerCase())).toBe(true)
    expect(isValidUlid(SAMPLE.toLowerCase())).toBe(true)
  })

  it('rejects timestamps outside the 48-bit millisecond range', () => {
    expect(() => generateUlid({ timestamp: -1 })).toThrow(Error)
    expect(() => generateUlid({ timestamp: 1.5 })).toThrow(Error)
    expect(() => generateUlid({ timestamp: ULID_MAX_TIMESTAMP + 1 })).toThrow(Error)
  })
})

describe('generateUlids', () => {
  it('clamps the batch size into the supported range', () => {
    expect(generateUlids(0)).toHaveLength(1)
    expect(generateUlids(Number.NaN)).toHaveLength(1)
    expect(generateUlids(5)).toHaveLength(5)
    expect(generateUlids(99_999)).toHaveLength(1_000)
  })

  it('increments the random segment inside one millisecond when monotonic', () => {
    const batch = generateUlids(6, { timestamp: BASE, monotonic: true })
    expect(new Set(batch).size).toBe(6)
    expect([...batch].sort()).toEqual(batch)
    expect(batch.every((id) => ulidTimestamp(id) === BASE)).toBe(true)
  })

  it('relies on the 80-bit random segment when not monotonic', () => {
    const batch = generateUlids(6, { timestamp: BASE })
    expect(new Set(batch).size).toBe(6)
    expect(batch.every((id) => ulidTimestamp(id) === BASE)).toBe(true)
  })

  it('rejects an invalid batch timestamp', () => {
    expect(() => generateUlids(3, { timestamp: -5 })).toThrow(Error)
    expect(() => generateUlids(3, { timestamp: 2.5, monotonic: true })).toThrow(Error)
  })
})

describe('ulidTimestamp', () => {
  it('decodes the documented sample', () => {
    expect(ulidTimestamp(SAMPLE)).toBe(1_469_922_850_259)
  })

  it('throws for a malformed id', () => {
    expect(() => ulidTimestamp('not-a-ulid')).toThrow(Error)
    expect(() => ulidTimestamp(SAMPLE.slice(0, 25))).toThrow(Error)
    // Crockford Base32 不含 I / L / O / U
    expect(() => ulidTimestamp(`${SAMPLE.slice(0, 24)}IO`)).toThrow(Error)
  })
})

describe('ULID <-> UUID', () => {
  it('moves the 128 bits across unchanged', () => {
    expect(ulidToUuid(SAMPLE)).toBe('01563e3a-b5d3-d676-4c61-efb99302bd5b')
    expect(uuidToUlid(ulidToUuid(SAMPLE))).toBe(SAMPLE)
  })

  it('rejects a ULID that is not valid', () => {
    expect(() => ulidToUuid('xxx')).toThrow(Error)
  })

  it('rejects a UUID without hyphens', () => {
    expect(() => uuidToUlid('01563e3ab5d3d6764c61efb99302bd5b')).toThrow(Error)
  })
})
