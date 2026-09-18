import { describe, expect, it } from 'vitest'

import { decodeFromBase64, encodeToBase64 } from './service'

describe('base64 roundtrip', () => {
  it('roundtrips ascii', () => {
    const encoded = encodeToBase64('hello world')
    expect(encoded).toBe('aGVsbG8gd29ybGQ=')
    expect(decodeFromBase64(encoded)).toBe('hello world')
  })

  it('roundtrips utf-8 chinese and emoji', () => {
    const plain = '中文测试 🚀'
    expect(decodeFromBase64(encodeToBase64(plain))).toBe(plain)
  })

  it('handles empty string', () => {
    expect(encodeToBase64('')).toBe('')
    expect(decodeFromBase64('')).toBe('')
  })

  it('tolerates whitespace inside base64 input', () => {
    expect(decodeFromBase64('aGVs\nbG8g\td29ybGQ=')).toBe('hello world')
  })
})

describe('decodeFromBase64', () => {
  it('throws on invalid base64', () => {
    expect(() => decodeFromBase64('!!!!')).toThrow()
  })
})
