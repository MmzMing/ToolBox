import { describe, expect, it } from 'vitest'

import { decryptAES, encryptAES } from './encryption.service'

describe('encryptAES', () => {
  it('produces an OpenSSL salted Base64 cipher', () => {
    const cipher = encryptAES('hello toolbox', 'secret-key')
    expect(cipher).toMatch(/^U2FsdGVkX1/)
  })

  it('supports unicode plaintext', () => {
    const cipher = encryptAES('中文 + emoji 🎉', '密钥')
    expect(decryptAES(cipher, '密钥')).toBe('中文 + emoji 🎉')
  })

  it('allows empty plaintext', () => {
    const cipher = encryptAES('', 'secret-key')
    expect(decryptAES(cipher, 'secret-key')).toBe('')
    expect(() => decryptAES(cipher, 'wrong-key')).toThrowError(/decryption failed/i)
  })

  it('throws on empty secret', () => {
    expect(() => encryptAES('plain', '')).toThrowError(/secret/i)
  })
})

describe('decryptAES', () => {
  it('round-trips encrypt then decrypt', () => {
    const cipher = encryptAES('round-trip 消息', 'secret-key')
    expect(decryptAES(cipher, 'secret-key')).toBe('round-trip 消息')
  })

  it('throws when the secret is wrong', () => {
    const cipher = encryptAES('round-trip 消息', 'secret-key')
    expect(() => decryptAES(cipher, 'wrong-key')).toThrowError(/decryption failed/i)
  })

  it('throws on invalid cipher text', () => {
    expect(() => decryptAES('not-a-valid-cipher', 'secret-key')).toThrowError(/decryption failed/i)
  })

  it('throws on empty cipher text', () => {
    expect(() => decryptAES('', 'secret-key')).toThrowError(/cipher text/i)
  })

  it('throws on empty secret', () => {
    expect(() => decryptAES('U2FsdGVkX1', '')).toThrowError(/secret/i)
  })
})
