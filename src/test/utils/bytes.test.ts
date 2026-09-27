import { describe, expect, it } from 'vitest'

import { bytesEqual, bytesToHex, concatBytes, hexToBytes } from '@/utils/bytes'

describe('bytesToHex / hexToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i))
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes)
  })

  it('emits lower-case hex with no separators', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0xff, 0x0a]))).toBe('00ff0a')
    expect(bytesToHex(new Uint8Array([]))).toBe('')
  })

  it('accepts upper case, whitespace and colons from pasted fingerprints', () => {
    expect(bytesToHex(hexToBytes('00 FF:0A'))).toBe('00ff0a')
  })

  it('throws on odd length and non-hex characters', () => {
    expect(() => hexToBytes('0a1')).toThrowError(/even number of digits/)
    expect(() => hexToBytes('zz')).toThrowError(/invalid character/)
  })
})

describe('concatBytes', () => {
  it('joins fragments in order', () => {
    const joined = concatBytes(new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3]))
    expect([...joined]).toEqual([1, 2, 3])
  })

  it('returns an empty buffer for no parts', () => {
    expect(concatBytes().length).toBe(0)
  })
})

describe('bytesEqual', () => {
  it('compares content, not identity', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false)
  })
})
