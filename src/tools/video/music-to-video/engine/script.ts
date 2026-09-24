/**
 * 文字脚本判定：中文（含混排拉丁/假名）的分词与断行依据。
 */

export type CharKind = 'space' | 'punct' | 'han' | 'latin' | 'digit' | 'kana' | 'other'

/** 中日韩统一表意文字（含扩展 A、兼容表意文字与叠字符号） */
export function isHan(c: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿︰々〆〇]/.test(c)
}

export function isLatin(c: string): boolean {
  return /[A-Za-z]/.test(c)
}

export function isDigit(c: string): boolean {
  return /[0-9０-９]/.test(c)
}

export function isKana(c: string): boolean {
  return /[ぁ-ゟ゠-ヿ]/.test(c)
}

export function isSpace(c: string): boolean {
  return /\s/.test(c) || c === '　'
}

/** 中英文标点（断行与分块时按"黏着在前字"处理） */
export function isPunct(c: string): boolean {
  return /[、。，．,.!?！？…‥·・「」『』（）()【】〈〉《》〔〕［］'"“”‘’ー〜～:：;；\-—―×÷@#&*+/<>|｜￥$€£]/.test(
    c,
  )
}

/** 不能出现在行首的收束标点 */
const CLOSE_PUNCT = '、。，．！？；：）】》」』…％’”‰'
/** 不能出现在行行的开首标点 */
const OPEN_PUNCT = '（【《「『“‘'

export function isClosePunct(c: string): boolean {
  return CLOSE_PUNCT.includes(c)
}
export function isOpenPunct(c: string): boolean {
  return OPEN_PUNCT.includes(c)
}

export function charKind(c: string): CharKind {
  if (isSpace(c)) return 'space'
  if (isPunct(c)) return 'punct'
  if (isHan(c)) return 'han'
  if (isKana(c)) return 'kana'
  if (isLatin(c)) return 'latin'
  if (isDigit(c)) return 'digit'
  return 'other'
}

/** 竖排时需要旋转 90° 的字符（拉丁字母、数字与部分符号） */
export const VERT_ROTATE = 'ー〜～…‥―—-()（）[]［］→←:：;；=＝%％'

/** 有效字形数（去掉空白） */
export function glyphCount(text: string): number {
  return [...text.replace(/\s/g, '')].length
}

/** 词块是否以拉丁为主（决定拼接时用空格还是直接相连） */
export function isLatinDominant(text: string): boolean {
  let latin = 0
  let other = 0
  for (const c of text) {
    if (isLatin(c) || isDigit(c)) latin += 1
    else if (!isSpace(c) && !isPunct(c)) other += 1
  }
  return latin > 0 && latin >= other
}

/** 把词块拼回一行：拉丁词之间补空格，汉字之间直接相连 */
export function joinChunks(chunks: readonly string[]): string {
  return chunks.some(isLatinDominant) ? chunks.join(' ') : chunks.join('')
}
