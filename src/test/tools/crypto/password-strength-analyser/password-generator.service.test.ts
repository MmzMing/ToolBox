import { describe, expect, it } from 'vitest'

import {
  AMBIGUOUS_CHARS,
  CLASS_IDS,
  DEFAULT_GENERATOR_OPTIONS,
  PASSWORD_COUNT_RANGE,
  PASSWORD_LENGTH_RANGE,
  buildCharacterPool,
  generatePasswords,
  validateGeneratorOptions,
  type GeneratedPassword,
  type PasswordClassId,
  type PasswordClassRule,
  type PasswordGeneratorOptions,
} from '@/tools/crypto/password-strength-analyser/password-generator.service'

const CLASS_PATTERNS: Record<PasswordClassId, RegExp> = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digits: /\d/,
  symbols: /[^a-zA-Z\d]/,
}

function optionsWith(
  classes: Partial<Record<PasswordClassId, Partial<PasswordClassRule>>>,
  patch: Partial<PasswordGeneratorOptions> = {},
): PasswordGeneratorOptions {
  const merged = Object.fromEntries(
    CLASS_IDS.map((id) => [id, { ...DEFAULT_GENERATOR_OPTIONS.classes[id], ...classes[id] }]),
  ) as Record<PasswordClassId, PasswordClassRule>
  return { ...DEFAULT_GENERATOR_OPTIONS, ...patch, classes: merged }
}

function countMatching(text: string, pattern: RegExp): number {
  return [...text].filter((char) => pattern.test(char)).length
}

/** 统计类用例需要大样本，按 PASSWORD_COUNT_RANGE.max 分批取满 */
function generateMany(options: PasswordGeneratorOptions, samples: number): GeneratedPassword[] {
  const items: GeneratedPassword[] = []
  while (items.length < samples) {
    items.push(...generatePasswords({ ...options, count: PASSWORD_COUNT_RANGE.max }))
  }
  return items
}

describe('buildCharacterPool', () => {
  it('keeps only the enabled classes', () => {
    const pool = buildCharacterPool(
      optionsWith({
        uppercase: { enabled: false },
        lowercase: { enabled: false },
        digits: { enabled: false },
        symbols: { enabled: true },
      }),
    )
    expect(pool).toBe('!@#$%^&*()-_=+[]{}:;,.<>?/')
  })

  it('removes every ambiguous character when the switch is on', () => {
    const enabled = optionsWith({
      uppercase: { enabled: true },
      lowercase: { enabled: true },
      digits: { enabled: true },
      symbols: { enabled: true },
    })
    const clean = { ...enabled, excludeAmbiguous: true }
    const pool = buildCharacterPool(clean)
    expect(pool).not.toMatch(new RegExp(`[${AMBIGUOUS_CHARS}]`))
    expect(buildCharacterPool(enabled).length - pool.length).toBe(7)
  })

  it('merges custom exclusions with the ambiguous set without double counting', () => {
    const base = optionsWith({ symbols: { enabled: true } })
    const withoutExclusions = buildCharacterPool(base).length
    const pool = buildCharacterPool({ ...base, excludedChars: 'ab' })
    expect(pool).not.toContain('a')
    expect(pool).not.toContain('b')
    expect(withoutExclusions - pool.length).toBe(2)
    const overlapping = buildCharacterPool({
      ...base,
      excludeAmbiguous: true,
      excludedChars: 'l1O',
    })
    expect(withoutExclusions - overlapping.length).toBe(7)
  })
})

describe('validateGeneratorOptions', () => {
  it('accepts the defaults', () => {
    expect(validateGeneratorOptions(DEFAULT_GENERATOR_OPTIONS)).toEqual([])
  })

  it('reports an empty pool when no class is enabled', () => {
    const violations = validateGeneratorOptions(
      optionsWith({
        uppercase: { enabled: false },
        lowercase: { enabled: false },
        digits: { enabled: false },
        symbols: { enabled: false },
      }),
    )
    expect(violations).toContain('emptyPool')
  })

  it('reports an empty pool when exclusions wipe out every character', () => {
    const violations = validateGeneratorOptions({
      ...optionsWith({
        uppercase: { enabled: false },
        lowercase: { enabled: false },
        symbols: { enabled: false },
      }),
      excludedChars: '0123456789',
    })
    expect(violations).toContain('emptyPool')
  })

  it('reports out-of-range length and count', () => {
    expect(
      validateGeneratorOptions(optionsWith({}, { length: PASSWORD_LENGTH_RANGE.max + 1 })),
    ).toContain('lengthOutOfRange')
    expect(validateGeneratorOptions(optionsWith({}, { length: 8.5 }))).toContain('lengthOutOfRange')
    expect(
      validateGeneratorOptions(optionsWith({}, { count: PASSWORD_COUNT_RANGE.max + 1 })),
    ).toContain('countOutOfRange')
  })

  it('reports when the minimums overflow the requested length', () => {
    const violations = validateGeneratorOptions(
      optionsWith(
        { uppercase: { enabled: true, min: 6 }, lowercase: { enabled: true, min: 6 } },
        { length: 10 },
      ),
    )
    expect(violations).toContain('minExceedsLength')
  })
})

describe('generatePasswords', () => {
  it('wraps the random body with the literal prefix and suffix', () => {
    const [first] = generatePasswords(optionsWith({}, { prefix: 'gh-', suffix: '!26', length: 12 }))
    expect(first.randomBody).toHaveLength(12)
    expect(first.value.startsWith('gh-')).toBe(true)
    expect(first.value.endsWith('!26')).toBe(true)
    expect(first.value).toBe(`gh-${first.randomBody}!26`)
  })

  it('keeps prefix characters out of the minimum character accounting', () => {
    const [first] = generatePasswords(
      optionsWith(
        {
          uppercase: { enabled: false },
          lowercase: { enabled: false },
          digits: { enabled: true, min: 2 },
        },
        { prefix: 'abc', length: 8 },
      ),
    )
    expect(countMatching(first.randomBody, /\d/)).toBeGreaterThanOrEqual(2)
    expect(countMatching(first.randomBody, /[a-z]/)).toBe(0)
  })

  it('honours every per-class minimum across many samples', () => {
    const options = optionsWith({
      uppercase: { enabled: true, min: 3 },
      lowercase: { enabled: true, min: 2 },
      digits: { enabled: true, min: 5 },
      symbols: { enabled: true, min: 2 },
    })
    for (const item of generatePasswords({ ...options, count: 20, length: 16 })) {
      expect(countMatching(item.randomBody, CLASS_PATTERNS.uppercase)).toBeGreaterThanOrEqual(3)
      expect(countMatching(item.randomBody, CLASS_PATTERNS.lowercase)).toBeGreaterThanOrEqual(2)
      expect(countMatching(item.randomBody, CLASS_PATTERNS.digits)).toBeGreaterThanOrEqual(5)
      expect(countMatching(item.randomBody, CLASS_PATTERNS.symbols)).toBeGreaterThanOrEqual(2)
      expect(item.randomBody).toHaveLength(16)
    }
  })

  it('lets a class stay absent when its minimum is zero', () => {
    const options = optionsWith({
      uppercase: { enabled: true, min: 0 },
      lowercase: { enabled: true, min: 0 },
      digits: { enabled: true, min: 0 },
      symbols: { enabled: true, min: 0 },
    })
    const bodies = generateMany({ ...options, length: 5 }, 500).map((item) => item.randomBody)
    expect(bodies.some((body) => countMatching(body, CLASS_PATTERNS.symbols) === 0)).toBe(true)
  })

  it('scatters guaranteed characters instead of parking them at the tail', () => {
    const options = optionsWith({
      uppercase: { enabled: false },
      lowercase: { enabled: true, min: 4 },
      digits: { enabled: true, min: 0 },
      symbols: { enabled: true, min: 1 },
    })
    const items = generateMany({ ...options, length: 8 }, 200)
    const symbolPositions = new Set<number>()
    for (const item of items) {
      symbolPositions.add(
        [...item.randomBody].findIndex((char) => CLASS_PATTERNS.symbols.test(char)),
      )
    }
    expect(symbolPositions.size).toBeGreaterThan(3)
  })

  it('accepts both ends of the length range', () => {
    const optionalOnly = {
      uppercase: { enabled: true, min: 0 },
      lowercase: { enabled: true, min: 0 },
      digits: { enabled: true, min: 0 },
      symbols: { enabled: false, min: 0 },
    }
    const min = generatePasswords(optionsWith(optionalOnly, { length: PASSWORD_LENGTH_RANGE.min }))
    expect(min[0].randomBody).toHaveLength(PASSWORD_LENGTH_RANGE.min)
    const max = generatePasswords(optionsWith(optionalOnly, { length: PASSWORD_LENGTH_RANGE.max }))
    expect(max[0].randomBody).toHaveLength(PASSWORD_LENGTH_RANGE.max)
  })

  it('computes effective entropy from the random part only', () => {
    const [first] = generatePasswords(optionsWith({}, { prefix: 'P@ss', suffix: 'w0rd!' }))
    expect(first.poolSize).toBe(buildCharacterPool(DEFAULT_GENERATOR_OPTIONS).length)
    expect(first.effectiveEntropyBits).toBe(Math.round(16 * Math.log2(first.poolSize) * 100) / 100)
  })

  it('drops effective entropy when exclusions shrink the pool', () => {
    const withPool = generatePasswords(DEFAULT_GENERATOR_OPTIONS)[0]
    const excluded = generatePasswords({
      ...DEFAULT_GENERATOR_OPTIONS,
      excludedChars: 'abcdefghijklmnopqrstuvwxyz',
    })[0]
    expect(excluded.poolSize).toBeLessThan(withPool.poolSize)
    expect(excluded.effectiveEntropyBits).toBeLessThan(withPool.effectiveEntropyBits)
  })

  it('returns the requested number of distinct passwords', () => {
    const items = generatePasswords(optionsWith({}, { count: PASSWORD_COUNT_RANGE.max }))
    expect(items).toHaveLength(PASSWORD_COUNT_RANGE.max)
    expect(new Set(items.map((item) => item.value)).size).toBe(PASSWORD_COUNT_RANGE.max)
  })

  it('throws on an empty pool', () => {
    expect(() =>
      generatePasswords(
        optionsWith({
          uppercase: { enabled: false },
          lowercase: { enabled: false },
          digits: { enabled: false },
          symbols: { enabled: false },
        }),
      ),
    ).toThrow(Error)
  })

  it('throws when the minimums exceed the length', () => {
    expect(() =>
      generatePasswords(optionsWith({ digits: { enabled: true, min: 12 } }, { length: 10 })),
    ).toThrow(/minimum/i)
  })

  it('throws on out-of-range length and count', () => {
    expect(() => generatePasswords(optionsWith({}, { length: 0 }))).toThrow(/length/i)
    expect(() => generatePasswords(optionsWith({}, { count: 0 }))).toThrow(/count/i)
  })
})
