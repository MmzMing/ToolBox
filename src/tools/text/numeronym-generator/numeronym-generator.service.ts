/** 单词转 numeronym：首字母 + 中间字符数 + 尾字母（internationalization → i18n） */
export function toNumeronym(word: string): string {
  const trimmed = word.trim()
  if (trimmed.length <= 3) {
    return trimmed
  }
  return trimmed.charAt(0) + String(trimmed.length - 2) + trimmed.charAt(trimmed.length - 1)
}

export interface NumeronymEntry {
  word: string
  numeronym: string
}

/** 解析单词列表（空格/换行分隔）为 numeronym 列表，保持输入顺序 */
export function toNumeronyms(input: string): NumeronymEntry[] {
  return input
    .split(/\s+/)
    .filter((token) => token !== '')
    .map((token) => ({ word: token, numeronym: toNumeronym(token) }))
}
