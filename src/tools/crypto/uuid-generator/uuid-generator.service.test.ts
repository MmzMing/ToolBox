import { describe, expect, it } from 'vitest'

import { MAX_COUNT, MIN_COUNT, generateUuids, isValidUuidV4 } from './service'

describe('generateUuids', () => {
  it('generates the requested amount of valid uuid v4', () => {
    const uuids = generateUuids(5)
    expect(uuids).toHaveLength(5)
    for (const uuid of uuids) {
      expect(isValidUuidV4(uuid)).toBe(true)
    }
  })

  it('clamps count into the allowed range', () => {
    expect(generateUuids(0)).toHaveLength(MIN_COUNT)
    expect(generateUuids(-10)).toHaveLength(MIN_COUNT)
    expect(generateUuids(1000)).toHaveLength(MAX_COUNT)
  })

  it('floors fractional counts', () => {
    expect(generateUuids(2.9)).toHaveLength(2)
  })

  it('generates unique values', () => {
    const uuids = generateUuids(MAX_COUNT)
    expect(new Set(uuids).size).toBe(MAX_COUNT)
  })
})

describe('isValidUuidV4', () => {
  it('accepts a canonical v4 uuid', () => {
    expect(isValidUuidV4('2f4c1a6e-9b8d-4c3a-a1b2-3c4d5e6f7a8b')).toBe(true)
  })

  it('rejects non-v4 or malformed strings', () => {
    expect(isValidUuidV4('not-a-uuid')).toBe(false)
    expect(isValidUuidV4('2f4c1a6e-9b8d-1c3a-a1b2-3c4d5e6f7a8b')).toBe(false)
    expect(isValidUuidV4('')).toBe(false)
  })
})
