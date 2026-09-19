/** CJK 字符（汉字/假名/谚文）：分词时逐字拆开 */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/** 含字母或数字的 token 才算词（过滤纯标点） */
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/** 中英混排分词：CJK 连续串逐字拆词，其余按空白切分 */
function tokenizeWords(text: string): string[] {
  return text
    .replace(CJK_CHAR, (char) => ` ${char} `)
    .split(/\s+/)
    .filter((token) => token !== '' && HAS_LETTER_OR_DIGIT.test(token))
}

export interface TextStats {
  chars: number
  charsNoSpaces: number
  words: number
  lines: number
  sentences: number
  paragraphs: number
  avgWordLength: number
  readingMinutes: number
}

/** 阅读时长基准：200 词/分钟 */
const WORDS_PER_MINUTE = 200

/** 统计文本的字符、词、行、句子、段落与阅读时长 */
export function analyzeText(text: string): TextStats {
  const chars = text.length
  const charsNoSpaces = text.replace(/\s/g, '').length

  const words = tokenizeWords(text)
  const avgWordLength =
    words.length === 0
      ? 0
      : Math.round((words.reduce((sum, word) => sum + word.length, 0) / words.length) * 100) / 100

  const lines = text === '' ? 0 : text.split('\n').length
  const sentences = text.split(/[.!?。！？]+/).filter((part) => part.trim() !== '').length
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part !== '').length

  const readingMinutes =
    words.length === 0 ? 0 : Math.round((words.length / WORDS_PER_MINUTE) * 100) / 100

  return {
    chars,
    charsNoSpaces,
    words: words.length,
    lines,
    sentences,
    paragraphs,
    avgWordLength,
    readingMinutes,
  }
}
