import slugify from 'slugify'

export const slugSeparators = ['-', '_'] as const

export type SlugSeparator = (typeof slugSeparators)[number]

export interface SlugifyOptions {
  /** 是否转为小写（默认 true） */
  lower?: boolean
  /** 词间分隔符（默认 '-'） */
  replacement?: SlugSeparator
  /** 是否去除英文停用词（默认 false） */
  removeStopwords?: boolean
}

/** 内置英文停用词表（小写），按空白分词后整词匹配 */
export const stopWords: readonly string[] = [
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'at',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
]

/** 预处理：按空白分词并剔除停用词（大小写不敏感） */
export function removeStopWords(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => word !== '' && !stopWords.includes(word.toLowerCase()))
    .join(' ')
}

/** 文本 → slug：包装 slugify 库，支持小写、分隔符与停用词选项 */
export function slugifyText(text: string, options: SlugifyOptions = {}): string {
  const { lower = true, replacement = '-', removeStopwords = false } = options
  const cleaned = removeStopwords ? removeStopWords(text) : text
  return slugify(cleaned, { lower, replacement })
}

export const slugVariants = ['kebab', 'snake', 'compact'] as const

export type SlugVariant = (typeof slugVariants)[number]

/** 一次生成常用变体：kebab-case / snake_case / 无分隔符（均为小写） */
export function slugifyAll(text: string): Record<SlugVariant, string> {
  return {
    kebab: slugifyText(text, { replacement: '-' }),
    snake: slugifyText(text, { replacement: '_' }),
    compact: slugifyText(text, { replacement: '-' }).replaceAll('-', ''),
  }
}
