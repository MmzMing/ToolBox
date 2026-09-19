import { generateMnemonic, validateMnemonic } from '@scure/bip39'
import { wordlist as chineseSimplified } from '@scure/bip39/wordlists/simplified-chinese.js'
import { wordlist as chineseTraditional } from '@scure/bip39/wordlists/traditional-chinese.js'
import { wordlist as english } from '@scure/bip39/wordlists/english.js'

export const bip39WordlistIds = ['english', 'chinese-simplified', 'chinese-traditional'] as const

export type Bip39WordlistId = (typeof bip39WordlistIds)[number]

export const mnemonicWordCounts = [12, 15, 18, 21, 24] as const

export type MnemonicWordCount = (typeof mnemonicWordCounts)[number]

const WORDLISTS: Record<Bip39WordlistId, string[]> = {
  english,
  'chinese-simplified': chineseSimplified,
  'chinese-traditional': chineseTraditional,
}

/** 词数 → 熵强度（bit），BIP39 规定 words = strength / 32 * 3 */
const WORD_COUNT_TO_STRENGTH: Record<MnemonicWordCount, number> = {
  12: 128,
  15: 160,
  18: 192,
  21: 224,
  24: 256,
}

function resolveWordlist(wordlistId: Bip39WordlistId): string[] {
  const wordlist = WORDLISTS[wordlistId]
  if (!wordlist) {
    throw new Error(`Unknown BIP39 wordlist: ${String(wordlistId)}`)
  }
  return wordlist
}

/** 生成 BIP39 助记词，语种或词数非法时抛出 Error */
export function generateBip39Mnemonic(
  wordlistId: Bip39WordlistId,
  wordCount: MnemonicWordCount,
): string {
  const wordlist = resolveWordlist(wordlistId)
  if (!mnemonicWordCounts.includes(wordCount)) {
    throw new Error(`Word count must be one of ${mnemonicWordCounts.join(', ')}`)
  }
  return generateMnemonic(wordlist, WORD_COUNT_TO_STRENGTH[wordCount])
}

/** 校验助记词是否属于指定语种且校验和正确 */
export function isBip39MnemonicValid(mnemonic: string, wordlistId: Bip39WordlistId): boolean {
  return validateMnemonic(mnemonic, resolveWordlist(wordlistId))
}
