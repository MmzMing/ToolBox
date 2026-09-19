import { describe, expect, it } from 'vitest'

import { SALT_ROUNDS_RANGE, comparePassword, hashPassword } from './bcrypt.service'

/** hashPassword('password123', 10) 的固定结果，用于跨会话校验 */
const PASSWORD123_HASH = '$2b$10$zBBr9FQZZbCgAXTNtqj/cOiHNjUsNvlDqpwyOxClYF0.k0p5/z/wO'

describe('hashPassword', () => {
  it('produces a bcrypt hash with the configured salt rounds', () => {
    const hash = hashPassword('password123', 10)
    expect(hash).toMatch(/^\$2[ab]\$10\$.{53}$/)
  })

  it('encodes the salt rounds in the hash prefix', () => {
    expect(hashPassword('password123', SALT_ROUNDS_RANGE.min)).toMatch(/^\$2[ab]\$04\$/)
  })

  it('verifies against a pre-computed hash', () => {
    expect(comparePassword('password123', PASSWORD123_HASH)).toBe(true)
    expect(comparePassword('password124', PASSWORD123_HASH)).toBe(false)
  })

  it('throws on empty password', () => {
    expect(() => hashPassword('', 10)).toThrowError(/password/i)
  })

  it('rejects out-of-range salt rounds', () => {
    expect(() => hashPassword('password123', SALT_ROUNDS_RANGE.min - 1)).toThrowError(
      /salt rounds/i,
    )
    expect(() => hashPassword('password123', SALT_ROUNDS_RANGE.max + 1)).toThrowError(
      /salt rounds/i,
    )
    expect(() => hashPassword('password123', 10.5)).toThrowError(/salt rounds/i)
  })
})

describe('comparePassword', () => {
  it('returns true when password matches the hash', () => {
    const hash = hashPassword('s3cret!password', 4)
    expect(comparePassword('s3cret!password', hash)).toBe(true)
  })

  it('returns false when password does not match', () => {
    const hash = hashPassword('s3cret!password', 4)
    expect(comparePassword('wrong-password', hash)).toBe(false)
  })

  it('returns false for empty password or empty hash', () => {
    const hash = hashPassword('s3cret!password', 4)
    expect(comparePassword('', hash)).toBe(false)
    expect(comparePassword('s3cret!password', '')).toBe(false)
  })

  it('returns false instead of throwing for malformed hashes', () => {
    expect(comparePassword('s3cret!password', 'not-a-bcrypt-hash')).toBe(false)
    expect(
      comparePassword(
        's3cret!password',
        '$2b$99$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalidsa',
      ),
    ).toBe(false)
  })
})
