import { describe, expect, it } from 'vitest'

import { binaryToText, hexToText, textToBinary, textToHex } from './service'

describe('textToBinary', () => {
  it('encodes ascii as spaced 8-bit groups', () => {
    expect(textToBinary('A')).toBe('01000001')
    expect(textToBinary('AB')).toBe('01000001 01000010')
  })

  it('encodes multibyte utf-8 characters', () => {
    expect(textToBinary('中')).toBe('11100100 10111000 10101101')
  })

  it('returns an empty string for empty input', () => {
    expect(textToBinary('')).toBe('')
  })
})

describe('binaryToText', () => {
  it('decodes spaced groups', () => {
    expect(binaryToText('01000001 01000010')).toBe('AB')
  })

  it('tolerates a continuous 8-bit string without spaces', () => {
    expect(binaryToText('0100000101000010')).toBe('AB')
  })

  it('decodes multibyte utf-8 sequences', () => {
    expect(binaryToText('11100100 10111000 10101101')).toBe('中')
  })

  it('roundtrips arbitrary text', () => {
    const text = 'Hello 世界 🚀'
    expect(binaryToText(textToBinary(text))).toBe(text)
  })

  it('returns an empty string for empty input', () => {
    expect(binaryToText('')).toBe('')
    expect(binaryToText('   ')).toBe('')
  })

  it('throws on invalid characters', () => {
    expect(() => binaryToText('01 02')).toThrow()
    expect(() => binaryToText('abc')).toThrow()
  })

  it('throws when bit count is not a multiple of 8', () => {
    expect(() => binaryToText('0100000')).toThrow()
    expect(() => binaryToText('0100000 11')).toThrow()
  })
})

describe('textToHex / hexToText', () => {
  it('encodes utf-8 bytes as spaced hex pairs', () => {
    expect(textToHex('A')).toBe('41')
    expect(textToHex('AB')).toBe('41 42')
    expect(textToHex('中')).toBe('e4 b8 ad')
    expect(textToHex('')).toBe('')
  })

  it('decodes spaced and continuous hex', () => {
    expect(hexToText('41 42')).toBe('AB')
    expect(hexToText('4142')).toBe('AB')
    expect(hexToText('E4B8AD')).toBe('中')
  })

  it('roundtrips arbitrary text', () => {
    const text = 'hex 十六进制 ff'
    expect(hexToText(textToHex(text))).toBe(text)
  })

  it('returns an empty string for empty input', () => {
    expect(hexToText('')).toBe('')
  })

  it('throws on invalid or odd-length hex', () => {
    expect(() => hexToText('zz')).toThrow()
    expect(() => hexToText('41 4')).toThrow()
    expect(() => hexToText('4')).toThrow()
  })
})
