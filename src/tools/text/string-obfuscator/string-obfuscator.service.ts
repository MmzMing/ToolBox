import { encode as base64Encode } from 'js-base64'

/** 零宽空格 U+200B */
const ZERO_WIDTH_CHAR = '\u200b'

export const obfuscatorOptions = ['zeroWidth', 'htmlEntities', 'base64', 'reverse'] as const

export type ObfuscatorOption = (typeof obfuscatorOptions)[number]

export type ObfuscatorSelection = Record<ObfuscatorOption, boolean>

/** 在每个字符后插入零宽空格 U+200B（视觉上不可见） */
export function insertZeroWidth(text: string): string {
  return Array.from(text)
    .map((char) => char + ZERO_WIDTH_CHAR)
    .join('')
}

/** 去除文本中的零宽空格 U+200B（与 insertZeroWidth 互为逆操作） */
export function removeZeroWidth(text: string): string {
  return text.replaceAll(ZERO_WIDTH_CHAR, '')
}

/** 把每个字符转成十六进制 HTML 数字实体（&#x61; 形式），按 Unicode 码点处理 */
export function toHtmlEntities(text: string): string {
  return Array.from(text)
    .map((char) => {
      const codePoint = char.codePointAt(0)
      return codePoint === undefined ? char : `&#x${codePoint.toString(16)};`
    })
    .join('')
}

/** 颠倒字符串顺序（Array.from 按 Unicode 码点切分，emoji 簇不会被拆坏） */
export function reverseString(text: string): string {
  return Array.from(text).reverse().join('')
}

/** 应用顺序：颠倒顺序 → HTML 实体 → 零宽字符 → Base64（保证零宽字符仍可被 removeZeroWidth 还原） */
export function obfuscateText(text: string, options: ObfuscatorSelection): string {
  let result = text
  if (options.reverse) {
    result = reverseString(result)
  }
  if (options.htmlEntities) {
    result = toHtmlEntities(result)
  }
  if (options.zeroWidth) {
    result = insertZeroWidth(result)
  }
  if (options.base64) {
    result = base64Encode(result)
  }
  return result
}
