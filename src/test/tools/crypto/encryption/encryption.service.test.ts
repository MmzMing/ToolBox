import { describe, expect, it } from 'vitest'

import { decryptAES, encryptAES } from '@/tools/crypto/encryption/encryption.service'

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

  it('normalizes UTF-8 decode failures into decryption errors', () => {
    // 固定 fixture：该密文用错误密钥解出非法 UTF-8（加密使用随机盐，
    // 动态生成密文会导致错误分支不确定，见 service.ts 的无 MAC 说明）
    const cipher = 'U2FsdGVkX1/feQiVKf4qOCmhCzEfp7ORikB15VkMiJuyx5xpwCFdkW8Qj6HmzS3c'
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
