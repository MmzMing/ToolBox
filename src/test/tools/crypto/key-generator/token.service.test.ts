import { describe, expect, it } from 'vitest'

import {
  TOKEN_COUNT_RANGE,
  TOKEN_LENGTH_RANGE,
  generateTokens,
  tokenCharsetSize,
  tokenEntropyBits,
  type TokenOptions,
} from '@/tools/crypto/key-generator/token.service'

function makeOptions(overrides: Partial<TokenOptions> = {}): TokenOptions {
  return {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false,
    count: 5,
    ...overrides,
  }
}

describe('generateTokens', () => {
  it('generates the requested number of tokens with the requested length', () => {
    const tokens = generateTokens(makeOptions({ length: 24, count: 7 }))
    expect(tokens).toHaveLength(7)
    for (const token of tokens) {
      expect(token).toHaveLength(24)
    }
  })

  it('only uses characters from the selected character sets', () => {
    const tokens = generateTokens(
      makeOptions({ uppercase: false, symbols: false, length: 64, count: 10 }),
    )
    for (const token of tokens) {
      expect(token).toMatch(/^[a-z0-9]+$/)
    }
  })

  it('uses every selected character set for long batches', () => {
    const tokens = generateTokens(makeOptions({ symbols: true, length: 128, count: 50 }))
    const all = tokens.join('')
    expect(all).toMatch(/[A-Z]/)
    expect(all).toMatch(/[a-z]/)
    expect(all).toMatch(/[0-9]/)
    expect(all).toMatch(/[!@#$%^&*()\-_=[\]{}:;,.<>?/]/)
  })

  it('produces distinct tokens across a batch', () => {
    const tokens = generateTokens(makeOptions({ length: 32, count: 50 }))
    expect(new Set(tokens).size).toBeGreaterThan(1)
  })

  it('throws when no character set is selected', () => {
    expect(() =>
      generateTokens(
        makeOptions({ uppercase: false, lowercase: false, numbers: false, symbols: false }),
      ),
    ).toThrowError(/character set/i)
  })

  it('rejects out-of-range length', () => {
    expect(() => generateTokens(makeOptions({ length: 0 }))).toThrowError(/length/i)
    expect(() => generateTokens(makeOptions({ length: TOKEN_LENGTH_RANGE.max + 1 }))).toThrowError(
      /length/i,
    )
    expect(() => generateTokens(makeOptions({ length: 12.5 }))).toThrowError(/length/i)
  })

  it('rejects out-of-range count', () => {
    expect(() => generateTokens(makeOptions({ count: 0 }))).toThrowError(/count/i)
    expect(() => generateTokens(makeOptions({ count: TOKEN_COUNT_RANGE.max + 1 }))).toThrowError(
      /count/i,
    )
  })
})

describe('tokenEntropyBits', () => {
  it('is zero when no character set is selected', () => {
    expect(
      tokenEntropyBits(
        makeOptions({ uppercase: false, lowercase: false, numbers: false, symbols: false }),
      ),
    ).toBe(0)
  })

  it('scales with the charset size: digits only is log2(10) per character', () => {
    const bits = tokenEntropyBits(
      makeOptions({ uppercase: false, lowercase: false, numbers: true, length: 10 }),
    )
    expect(bits).toBeCloseTo(10 * Math.log2(10), 10)
  })

  it('reaches the full 128-character strength with every set selected', () => {
    const all = makeOptions({ symbols: true, length: TOKEN_LENGTH_RANGE.max })
    expect(tokenEntropyBits(all)).toBeCloseTo(128 * Math.log2(tokenCharsetSize(all)), 10)
    // 四类字符互不重叠：26 + 26 + 10 + 26（符号表共 26 个）
    expect(tokenCharsetSize(all)).toBe(88)
  })
})
