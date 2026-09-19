import { describe, expect, it } from 'vitest'

import { toNatoAlphabet, toNatoText } from '@/tools/converter/text-to-nato-alphabet/service'

describe('toNatoAlphabet', () => {
  it('maps letters to NATO words case-insensitively', () => {
    expect(toNatoAlphabet('A')).toEqual([{ char: 'A', word: 'Alfa' }])
    expect(toNatoAlphabet('z')).toEqual([{ char: 'z', word: 'Zulu' }])
  })

  it('maps digits to Zero..Nine', () => {
    expect(toNatoAlphabet('0')).toEqual([{ char: '0', word: 'Zero' }])
    expect(toNatoAlphabet('9')).toEqual([{ char: '9', word: 'Nine' }])
  })

  it('maps spaces to [space] and keeps other chars as [unknown]', () => {
    expect(toNatoAlphabet(' ')).toEqual([{ char: ' ', word: '[space]' }])
    expect(toNatoAlphabet('!')).toEqual([{ char: '!', word: '[unknown]' }])
    expect(toNatoAlphabet('中')).toEqual([{ char: '中', word: '[unknown]' }])
  })

  it('converts a mixed sequence in order', () => {
    const entries = toNatoAlphabet('AB1 x')
    expect(entries.map((entry) => entry.word)).toEqual(['Alfa', 'Bravo', 'One', '[space]', 'X-ray'])
  })

  it('returns an empty array for empty input', () => {
    expect(toNatoAlphabet('')).toEqual([])
  })
})

describe('toNatoText', () => {
  it('joins words with spaces', () => {
    expect(toNatoText('SOS')).toBe('Sierra Oscar Sierra')
  })

  it('skips space separators but keeps unknown markers', () => {
    expect(toNatoText('A B')).toBe('Alfa Bravo')
    expect(toNatoText('A!B')).toBe('Alfa [unknown] Bravo')
  })

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(toNatoText('')).toBe('')
    expect(toNatoText('   ')).toBe('')
  })
})
