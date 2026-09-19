import { wordlist as chineseSimplified } from '@scure/bip39/wordlists/simplified-chinese.js'
import { wordlist as chineseTraditional } from '@scure/bip39/wordlists/traditional-chinese.js'
import { wordlist as english } from '@scure/bip39/wordlists/english.js'
import { describe, expect, it } from 'vitest'

import {
  generateBip39Mnemonic,
  isBip39MnemonicValid,
  mnemonicWordCounts,
  type MnemonicWordCount,
  type Bip39WordlistId,
} from '@/tools/crypto/bip39-generator/bip39-generator.service'

describe('generateBip39Mnemonic', () => {
  it('generates a valid 12-word english mnemonic', () => {
    const mnemonic = generateBip39Mnemonic('english', 12)
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(12)
    for (const word of words) {
      expect(english).toContain(word)
    }
    expect(isBip39MnemonicValid(mnemonic, 'english')).toBe(true)
  })

  it('generates mnemonics for every supported word count', () => {
    for (const wordCount of mnemonicWordCounts) {
      const mnemonic = generateBip39Mnemonic('english', wordCount)
      expect(mnemonic.split(' ')).toHaveLength(wordCount)
      expect(isBip39MnemonicValid(mnemonic, 'english')).toBe(true)
    }
  })

  it('supports the simplified chinese wordlist', () => {
    const mnemonic = generateBip39Mnemonic('chinese-simplified', 18)
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(18)
    for (const word of words) {
      expect(chineseSimplified).toContain(word)
    }
    expect(isBip39MnemonicValid(mnemonic, 'chinese-simplified')).toBe(true)
  })

  it('supports the traditional chinese wordlist', () => {
    const mnemonic = generateBip39Mnemonic('chinese-traditional', 24)
    const words = mnemonic.split(' ')
    expect(words).toHaveLength(24)
    for (const word of words) {
      expect(chineseTraditional).toContain(word)
    }
    expect(isBip39MnemonicValid(mnemonic, 'chinese-traditional')).toBe(true)
  })

  it('rejects invalid word counts', () => {
    expect(() => generateBip39Mnemonic('english', 13 as MnemonicWordCount)).toThrowError(
      /word count/i,
    )
    expect(() => generateBip39Mnemonic('english', 0 as MnemonicWordCount)).toThrowError(
      /word count/i,
    )
  })

  it('rejects unknown wordlists', () => {
    expect(() => generateBip39Mnemonic('french' as Bip39WordlistId, 12)).toThrowError(/wordlist/i)
  })

  it('rejects a mnemonic from a mismatched wordlist', () => {
    const mnemonic = generateBip39Mnemonic('english', 12)
    expect(isBip39MnemonicValid(mnemonic, 'chinese-simplified')).toBe(false)
  })
})
