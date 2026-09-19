import { describe, expect, it } from 'vitest'

import { analyzeText } from '@/tools/text/text-statistics/text-statistics.service'

describe('analyzeText', () => {
  it('returns all zeros for empty input', () => {
    expect(analyzeText('')).toEqual({
      chars: 0,
      charsNoSpaces: 0,
      words: 0,
      lines: 0,
      sentences: 0,
      paragraphs: 0,
      avgWordLength: 0,
      readingMinutes: 0,
    })
  })

  it('counts basic English statistics', () => {
    const stats = analyzeText('Hello world. This is a test!')
    expect(stats.chars).toBe(28)
    expect(stats.charsNoSpaces).toBe(23)
    expect(stats.words).toBe(6)
    expect(stats.lines).toBe(1)
    expect(stats.sentences).toBe(2)
    expect(stats.paragraphs).toBe(1)
  })

  it('splits continuous CJK strings into one word per character', () => {
    expect(analyzeText('中文').words).toBe(2)
    expect(analyzeText('中文 english words').words).toBe(4)
  })

  it('handles mixed Chinese and English sentences', () => {
    const stats = analyzeText('Hello world. 你好世界！')
    expect(stats.sentences).toBe(2)
    // Hello / world / 你 / 好 / 世 / 界
    expect(stats.words).toBe(6)
  })

  it('counts multiple paragraphs and lines', () => {
    const stats = analyzeText('first\n\nsecond\nthird\n')
    expect(stats.paragraphs).toBe(3)
    expect(stats.lines).toBe(5)
  })

  it('computes average word length across CJK and Latin words', () => {
    const stats = analyzeText('abc 中')
    // words: abc(3) 中(1) → avg 2
    expect(stats.avgWordLength).toBe(2)
  })

  it('estimates reading time at 200 words per minute', () => {
    const words400 = Array.from({ length: 400 }, () => 'a').join(' ')
    expect(analyzeText(words400).readingMinutes).toBe(2)
    expect(analyzeText('one').readingMinutes).toBe(0.01)
  })

  it('handles whitespace-only input', () => {
    const stats = analyzeText('  \n\n  ')
    expect(stats.words).toBe(0)
    expect(stats.sentences).toBe(0)
    expect(stats.paragraphs).toBe(0)
    expect(stats.lines).toBe(3)
    expect(stats.charsNoSpaces).toBe(0)
  })
})
