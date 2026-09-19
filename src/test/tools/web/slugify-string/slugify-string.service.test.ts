import { describe, expect, it } from 'vitest'

import {
  removeStopWords,
  slugifyAll,
  slugifyText,
  stopWords,
} from '@/tools/web/slugify-string/slugify-string.service'

describe('slugifyText', () => {
  it('slugifies text with defaults (kebab-case)', () => {
    expect(slugifyText('Hello World')).toBe('hello-world')
    expect(slugifyText('  Multiple   Spaces  ')).toBe('multiple-spaces')
  })

  it('supports the underscore separator', () => {
    expect(slugifyText('Hello World', { replacement: '_' })).toBe('hello_world')
  })

  it('can keep the original casing', () => {
    expect(slugifyText('Hello World', { lower: false })).toBe('Hello-World')
  })

  it('removes stop words when asked', () => {
    expect(slugifyText('The Quick Brown Fox', { removeStopwords: true })).toBe('quick-brown-fox')
    expect(slugifyText('State of the Art', { removeStopwords: true })).toBe('state-art')
  })

  it('keeps stop words by default', () => {
    expect(slugifyText('The Quick Brown Fox')).toBe('the-quick-brown-fox')
  })

  it('drops non-latin characters like slugify does', () => {
    expect(slugifyText('你好 World')).toBe('world')
  })

  it('returns an empty string for empty or symbol-only input', () => {
    expect(slugifyText('')).toBe('')
    expect(slugifyText('   ')).toBe('')
    expect(slugifyText('你好')).toBe('')
  })
})

describe('removeStopWords', () => {
  it('filters stop words case-insensitively and collapses whitespace', () => {
    expect(removeStopWords('The  quick AND   brown')).toBe('quick brown')
  })

  it('keeps non stop words untouched', () => {
    expect(removeStopWords('hello world')).toBe('hello world')
  })

  it('returns an empty string when every word is a stop word', () => {
    expect(removeStopWords('the of to')).toBe('')
  })
})

describe('slugifyAll', () => {
  it('generates kebab, snake and compact variants', () => {
    expect(slugifyAll('Hello World')).toEqual({
      kebab: 'hello-world',
      snake: 'hello_world',
      compact: 'helloworld',
    })
  })

  it('returns empty variants for empty input', () => {
    expect(slugifyAll('')).toEqual({ kebab: '', snake: '', compact: '' })
  })
})

describe('stopWords', () => {
  it('is a lowercase unique list', () => {
    expect(stopWords.length).toBeGreaterThanOrEqual(15)
    for (const word of stopWords) {
      expect(word).toBe(word.toLowerCase())
    }
    expect(new Set(stopWords).size).toBe(stopWords.length)
  })
})
