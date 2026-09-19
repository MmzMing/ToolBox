import { describe, expect, it } from 'vitest'

import {
  base32Decode,
  base32Encode,
  generateTotp,
  verifyTotp,
} from './otp-code-generator-and-validator.service'

// RFC 6238 附录 B 测试密钥（ASCII "12345678901234567890"）的 Base32 编码
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('base32Encode', () => {
  it('encodes the rfc 6238 test secret', () => {
    expect(base32Encode(new TextEncoder().encode('12345678901234567890'))).toBe(RFC_SECRET)
  })

  it('pads final partial group', () => {
    // "A" = 0x41 = 010000 10(0) → 'IE======'
    expect(base32Encode(new TextEncoder().encode('A'))).toBe('IE')
    expect(base32Encode(new Uint8Array(0))).toBe('')
  })
})

describe('base32Decode', () => {
  it('decodes the rfc 6238 test secret', () => {
    expect(new TextDecoder().decode(base32Decode(RFC_SECRET))).toBe('12345678901234567890')
  })

  it('accepts lowercase, whitespace, hyphens and padding', () => {
    expect(new TextDecoder().decode(base32Decode('gez dgn-bv=='))).toBe('12345')
  })

  it('returns empty bytes for empty input', () => {
    expect(base32Decode('')).toEqual(new Uint8Array(0))
    expect(base32Decode('====')).toEqual(new Uint8Array(0))
  })

  it('throws on characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow(/Invalid base32 character: 1/)
    expect(() => base32Decode('AB!')).toThrow(/Invalid base32 character: !/)
  })
})

describe('generateTotp', () => {
  it('matches rfc 6238 sha-1 test vectors (8 digits)', async () => {
    const vector: [number, string][] = [
      [59, '94287082'],
      [1_111_111_109, '07081804'],
      [1_111_111_111, '14050471'],
      [1_234_567_890, '89005924'],
      [2_000_000_000, '69279037'],
      [20_000_000_000, '65353130'],
    ]
    for (const [seconds, expected] of vector) {
      await expect(
        generateTotp(RFC_SECRET, { digits: 8, period: 30 }, seconds * 1000),
      ).resolves.toBe(expected)
    }
  })

  it('supports 6 digits by truncation', async () => {
    await expect(generateTotp(RFC_SECRET, { digits: 6, period: 30 }, 59_000)).resolves.toBe(
      '287082',
    )
  })

  it('supports 60-second periods', async () => {
    // 同一个 60s 周期内（1111111080–1111111139s）验证码保持不变
    const [start, end] = await Promise.all([
      generateTotp(RFC_SECRET, { digits: 8, period: 60 }, 111_111_108_000),
      generateTotp(RFC_SECRET, { digits: 8, period: 60 }, 111_111_113_999),
    ])
    expect(start).toBe(end)
  })

  it('rejects empty and invalid secrets', async () => {
    await expect(generateTotp('', { digits: 6, period: 30 }, 0)).rejects.toThrow(
      /secret must not be empty/i,
    )
    await expect(generateTotp('ABC1!', { digits: 6, period: 30 }, 0)).rejects.toThrow(
      /Invalid base32/,
    )
  })
})

describe('verifyTotp', () => {
  it('accepts the code of the current window', async () => {
    const code = await generateTotp(RFC_SECRET, { digits: 8, period: 30 }, 111_111_110_900)
    await expect(
      verifyTotp(RFC_SECRET, code, { digits: 8, period: 30 }, 111_111_110_900),
    ).resolves.toBe(true)
  })

  it('accepts codes from the previous and next windows', async () => {
    const previous = await generateTotp(RFC_SECRET, { digits: 8, period: 30 }, 111_111_110_900)
    const next = await generateTotp(RFC_SECRET, { digits: 8, period: 30 }, 111_111_116_900)
    await expect(
      verifyTotp(RFC_SECRET, previous, { digits: 8, period: 30 }, 111_111_113_900),
    ).resolves.toBe(true)
    await expect(
      verifyTotp(RFC_SECRET, next, { digits: 8, period: 30 }, 111_111_113_900),
    ).resolves.toBe(true)
  })

  it('rejects codes older than one window', async () => {
    const stale = await generateTotp(RFC_SECRET, { digits: 8, period: 30 }, 111_111_110_900)
    await expect(
      verifyTotp(RFC_SECRET, stale, { digits: 8, period: 30 }, 111_111_196_900),
    ).resolves.toBe(false)
  })

  it('rejects malformed codes', async () => {
    await expect(verifyTotp(RFC_SECRET, 'abc', { digits: 6, period: 30 }, 59_000)).resolves.toBe(
      false,
    )
    await expect(verifyTotp(RFC_SECRET, '12345', { digits: 6, period: 30 }, 59_000)).resolves.toBe(
      false,
    )
    await expect(verifyTotp(RFC_SECRET, '', { digits: 6, period: 30 }, 59_000)).resolves.toBe(false)
  })

  it('propagates invalid secret errors', async () => {
    await expect(verifyTotp('1', '123456', { digits: 6, period: 30 }, 0)).rejects.toThrow(
      /Invalid base32/,
    )
  })
})
