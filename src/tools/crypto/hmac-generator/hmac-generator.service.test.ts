import { describe, expect, it } from 'vitest'

import { computeHmac, hmacAlgorithms } from './hmac-generator.service'

describe('computeHmac', () => {
  it('computes known RFC/wikipedia test vectors', () => {
    const message = 'The quick brown fox jumps over the lazy dog'
    const secret = 'key'
    expect(computeHmac('HMACMD5', message, secret)).toBe('80070713463e7749b90c2dc24911e275')
    expect(computeHmac('HMACSHA1', message, secret)).toBe(
      'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9',
    )
    expect(computeHmac('HMACSHA256', message, secret)).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
    expect(computeHmac('HMACSHA512', message, secret)).toBe(
      'b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a',
    )
  })

  it('supports unicode messages and secrets', () => {
    const digest = computeHmac('HMACSHA256', '中文消息', '中文密钥')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts an empty message', () => {
    const digest = computeHmac('HMACSHA256', '', 'secret')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(computeHmac('HMACSHA256', '', 'secret')).toBe(digest)
  })

  it('produces lowercase hex of the expected length for every algorithm', () => {
    const expectedLengths = { HMACMD5: 32, HMACSHA1: 40, HMACSHA256: 64, HMACSHA512: 128 } as const
    for (const algorithm of hmacAlgorithms) {
      expect(computeHmac(algorithm, 'message', 'secret')).toMatch(
        new RegExp(`^[0-9a-f]{${expectedLengths[algorithm]}}$`),
      )
    }
  })

  it('throws on empty secret', () => {
    expect(() => computeHmac('HMACSHA256', 'message', '')).toThrowError(/secret/i)
  })
})
