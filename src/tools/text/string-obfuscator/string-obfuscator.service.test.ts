import { describe, expect, it } from 'vitest'

import {
  insertZeroWidth,
  obfuscateText,
  removeZeroWidth,
  reverseString,
  toHtmlEntities,
} from './string-obfuscator.service'

const noOptions = { zeroWidth: false, htmlEntities: false, base64: false, reverse: false }

describe('insertZeroWidth / removeZeroWidth', () => {
  it('inserts a zero-width space after every character', () => {
    const obfuscated = insertZeroWidth('ab')
    expect(obfuscated).toBe('a\u200bb\u200b')
    expect(obfuscated.length).toBe(4)
  })

  it('round-trips back to the original text', () => {
    expect(removeZeroWidth(insertZeroWidth('hello world'))).toBe('hello world')
  })

  it('round-trips emoji clusters unchanged', () => {
    expect(removeZeroWidth(insertZeroWidth('a👍🏻b'))).toBe('a👍🏻b')
  })

  it('handles empty input', () => {
    expect(insertZeroWidth('')).toBe('')
    expect(removeZeroWidth('')).toBe('')
  })
})

describe('toHtmlEntities', () => {
  it('converts every character to hex entities', () => {
    expect(toHtmlEntities('aA<&')).toBe('&#x61;&#x41;&#x3c;&#x26;')
  })

  it('converts CJK and emoji by code point', () => {
    expect(toHtmlEntities('中')).toBe('&#x4e2d;')
    expect(toHtmlEntities('😀')).toBe('&#x1f600;')
  })

  it('handles empty input', () => {
    expect(toHtmlEntities('')).toBe('')
  })
})

describe('reverseString', () => {
  it('reverses plain text', () => {
    expect(reverseString('abc')).toBe('cba')
  })

  it('keeps astral-plane emoji intact', () => {
    expect(reverseString('a👍b')).toBe('b👍a')
    expect(reverseString('a😀b')).toBe('b😀a')
  })

  it('handles empty input', () => {
    expect(reverseString('')).toBe('')
  })
})

describe('obfuscateText', () => {
  it('returns the input unchanged when no option is selected', () => {
    expect(obfuscateText('abc', noOptions)).toBe('abc')
  })

  it('applies each single option', () => {
    expect(obfuscateText('ab', { ...noOptions, reverse: true })).toBe('ba')
    expect(obfuscateText('a', { ...noOptions, zeroWidth: true })).toBe('a\u200b')
    expect(obfuscateText('a', { ...noOptions, htmlEntities: true })).toBe('&#x61;')
    expect(obfuscateText('ab', { ...noOptions, base64: true })).toBe('YWI=')
  })

  it('still allows removing zero-width chars from the full pipeline output', () => {
    const output = obfuscateText('hi', { ...noOptions, zeroWidth: true, htmlEntities: true })
    expect(removeZeroWidth(output)).toBe('&#x68;&#x69;')
  })

  it('handles empty input', () => {
    expect(obfuscateText('', { ...noOptions, base64: true, reverse: true })).toBe('')
  })
})
