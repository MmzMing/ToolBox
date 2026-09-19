import { describe, expect, it } from 'vitest'

import {
  htmlEntitiesToText,
  textToHtmlEntities,
  textToUnicodeEscapes,
  unicodeEscapesToText,
} from './service'

describe('textToUnicodeEscapes', () => {
  it('encodes BMP characters as \\uXXXX', () => {
    expect(textToUnicodeEscapes('A')).toBe('\\u0041')
    expect(textToUnicodeEscapes('中')).toBe('\\u4E2D')
    expect(textToUnicodeEscapes('A中')).toBe('\\u0041\\u4E2D')
  })

  it('encodes astral characters as \\u{...}', () => {
    expect(textToUnicodeEscapes('🚀')).toBe('\\u{1F680}')
  })

  it('returns an empty string for empty input', () => {
    expect(textToUnicodeEscapes('')).toBe('')
  })
})

describe('unicodeEscapesToText', () => {
  it('decodes \\uXXXX sequences and passes literals through', () => {
    expect(unicodeEscapesToText('\\u0041\\u4E2D')).toBe('A中')
    expect(unicodeEscapesToText('\\u0041abc')).toBe('Aabc')
    expect(unicodeEscapesToText('plain text')).toBe('plain text')
  })

  it('decodes \\u{...} sequences', () => {
    expect(unicodeEscapesToText('\\u{1F680}')).toBe('🚀')
    expect(unicodeEscapesToText('\\u{1F680}\\u4E2D')).toBe('🚀中')
  })

  it('recombines surrogate pairs written as two \\uXXXX', () => {
    expect(unicodeEscapesToText('\\uD83D\\uDE00')).toBe('😀')
    expect(unicodeEscapesToText('\\uD83D\\uDE80')).toBe('🚀')
  })

  it('roundtrips arbitrary text', () => {
    const text = '中文 English 🚀 mix'
    expect(unicodeEscapesToText(textToUnicodeEscapes(text))).toBe(text)
  })

  it('returns an empty string for empty input', () => {
    expect(unicodeEscapesToText('')).toBe('')
  })

  it('throws on malformed escapes', () => {
    expect(() => unicodeEscapesToText('\\u12')).toThrow()
    expect(() => unicodeEscapesToText('\\u{}')).toThrow()
    expect(() => unicodeEscapesToText('\\')).toThrow()
  })

  it('throws on out-of-range code points', () => {
    expect(() => unicodeEscapesToText('\\u{110000}')).toThrow()
  })
})

describe('textToHtmlEntities', () => {
  it('encodes code points as decimal entities', () => {
    expect(textToHtmlEntities('A')).toBe('&#65;')
    expect(textToHtmlEntities('A中')).toBe('&#65;&#20013;')
    expect(textToHtmlEntities('🚀')).toBe('&#128640;')
  })

  it('returns an empty string for empty input', () => {
    expect(textToHtmlEntities('')).toBe('')
  })
})

describe('htmlEntitiesToText', () => {
  it('decodes decimal and hex entities', () => {
    expect(htmlEntitiesToText('&#65;&#20013;')).toBe('A中')
    expect(htmlEntitiesToText('&#65;&#x4E2D;')).toBe('A中')
    expect(htmlEntitiesToText('&#128640;')).toBe('🚀')
  })

  it('passes plain text through', () => {
    expect(htmlEntitiesToText('plain & text')).toBe('plain & text')
  })

  it('roundtrips arbitrary text', () => {
    const text = '实体 entities 🚀'
    expect(htmlEntitiesToText(textToHtmlEntities(text))).toBe(text)
  })

  it('returns an empty string for empty input', () => {
    expect(htmlEntitiesToText('')).toBe('')
  })

  it('throws on malformed entities', () => {
    expect(() => htmlEntitiesToText('&#65')).toThrow()
    expect(() => htmlEntitiesToText('&#zz;')).toThrow()
  })

  it('throws on out-of-range entities', () => {
    expect(() => htmlEntitiesToText('&#99999999;')).toThrow()
  })
})
