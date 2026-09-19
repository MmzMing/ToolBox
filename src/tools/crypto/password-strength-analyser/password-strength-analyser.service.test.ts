import { describe, expect, it } from 'vitest'

import { CHECK_IDS, analysePassword } from './password-strength-analyser.service'

function checksOf(analysis: ReturnType<typeof analysePassword>): Record<string, boolean> {
  return Object.fromEntries(analysis.checks.map((check) => [check.id, check.passed]))
}

describe('analysePassword', () => {
  it('scores a strong password with all checks passed', () => {
    const analysis = analysePassword('Str0ng!Pwd2026')
    expect(analysis.length).toBe(14)
    expect(analysis.charsetSize).toBe(26 + 26 + 10 + 33)
    expect(analysis.entropyBits).toBe(Math.round(14 * Math.log2(95) * 100) / 100)
    expect(analysis.checks.map((check) => check.id)).toEqual([...CHECK_IDS])
    expect(Object.values(checksOf(analysis)).every(Boolean)).toBe(true)
    expect(analysis.score).toBe(4)
    expect(analysis.crackTimeText).toBe('centuries')
  })

  it('scores a short weak password as 0', () => {
    const analysis = analysePassword('abc')
    expect(analysis.entropyBits).toBe(Math.round(3 * Math.log2(26) * 100) / 100)
    expect(analysis.score).toBe(0)
    expect(analysis.crackTimeText).toBe('less than a second')
  })

  it('fails the repeated characters check for consecutive duplicates', () => {
    expect(checksOf(analysePassword('aaaaaaaaaaaa')).noRepeatedChars).toBe(false)
    expect(checksOf(analysePassword('password1234')).noRepeatedChars).toBe(false)
    expect(checksOf(analysePassword('D1vers3-Pwd')).noRepeatedChars).toBe(true)
  })

  it('fails individual character class checks accordingly', () => {
    const checks = checksOf(analysePassword('password1234'))
    expect(checks.minLength12).toBe(true)
    expect(checks.lowercase).toBe(true)
    expect(checks.uppercase).toBe(false)
    expect(checks.digit).toBe(true)
    expect(checks.symbol).toBe(false)
  })

  it('adds a unicode pool to the charset size', () => {
    const ascii = analysePassword('abcdefgh!x')
    const unicode = analysePassword('abcdefgh!中')
    expect(unicode.charsetSize).toBe(ascii.charsetSize + 67)
  })

  it('handles the empty password', () => {
    const analysis = analysePassword('')
    expect(analysis.length).toBe(0)
    expect(analysis.charsetSize).toBe(0)
    expect(analysis.entropyBits).toBe(0)
    expect(analysis.checks).toHaveLength(CHECK_IDS.length)
    expect(Object.values(checksOf(analysis)).every((passed) => !passed)).toBe(true)
    expect(analysis.score).toBe(0)
    expect(analysis.crackTimeText).toBe('less than a second')
  })

  it('keeps every check id stable', () => {
    for (const password of ['', 'abc', 'Str0ng!Pwd2026']) {
      expect(analysePassword(password).checks.map((check) => check.id)).toEqual([...CHECK_IDS])
    }
  })
})
