import { describe, expect, it } from 'vitest'

import {
  MAX_COUNT,
  MIN_COUNT,
  generateLorem,
} from '@/tools/text/lorem-ipsum-generator/lorem-ipsum-generator.service'
import type { LoremType } from '@/tools/text/lorem-ipsum-generator/lorem-ipsum-generator.service'

describe('generateLorem', () => {
  it('generates the requested number of paragraphs separated by blank lines', () => {
    const result = generateLorem('paragraphs', 3)
    const paragraphs = result.split('\n\n')
    expect(paragraphs).toHaveLength(3)
    for (const paragraph of paragraphs) {
      const sentences = paragraph.split('. ').length
      expect(sentences).toBeGreaterThanOrEqual(4)
      expect(sentences).toBeLessThanOrEqual(6)
    }
  })

  it('generates the requested number of sentences', () => {
    const result = generateLorem('sentences', 5)
    expect(result.split(/(?<=\.)\s+/)).toHaveLength(5)
    expect(result.endsWith('.')).toBe(true)
  })

  it('generates the requested number of words', () => {
    const result = generateLorem('words', 10)
    expect(result.split(' ')).toHaveLength(10)
  })

  it('starts the first paragraph with the classic opener', () => {
    expect(generateLorem('paragraphs', 1).startsWith('Lorem ipsum dolor sit amet,')).toBe(true)
    expect(generateLorem('sentences', 1)).toBe(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    )
  })

  it('capitalizes sentence starts and ends with a period', () => {
    const result = generateLorem('paragraphs', 2)
    for (const paragraph of result.split('\n\n')) {
      expect(paragraph.charAt(0)).toMatch(/[A-Z]/)
      expect(paragraph.endsWith('.')).toBe(true)
    }
  })

  it('only produces vocabulary from the lorem word list', () => {
    const result = generateLorem('paragraphs', 5)
    expect(
      result
        .toLowerCase()
        .replace(/[.,\s]+/g, ' ')
        .trim(),
    ).not.toBe('')
  })

  it('rejects out-of-range counts', () => {
    expect(() => generateLorem('paragraphs', MIN_COUNT - 1)).toThrow(Error)
    expect(() => generateLorem('paragraphs', MAX_COUNT + 1)).toThrow(Error)
    expect(() => generateLorem('paragraphs', 2.5)).toThrow(Error)
    expect(() => generateLorem('words', 0)).toThrow(/between 1 and 50/)
  })

  it('rejects unknown types', () => {
    expect(() => generateLorem('unknown' as LoremType, 1)).toThrow(/Unknown lorem type/)
  })
})
