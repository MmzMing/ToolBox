/** 经典 Lorem Ipsum 词汇表（首段原型词 + 常见拉丁补充词） */
const LOREM_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'eu',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'non',
  'proident',
  'sunt',
  'culpa',
  'qui',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'id',
  'est',
  'laborum',
  'curabitur',
  'praesent',
  'interdum',
  'malesuada',
  'fames',
  'ante',
  'primis',
  'facilisis',
  'vulputate',
  'sapien',
  'donec',
  'morbi',
  'aenean',
  'pellentesque',
] as const

export const loremTypes = ['paragraphs', 'sentences', 'words'] as const

export type LoremType = (typeof loremTypes)[number]

export const MIN_COUNT = 1
export const MAX_COUNT = 50

/** 首段固定以经典开头起步（it-tools 同款体验） */
const FIRST_SENTENCE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'

function randomInt(minInclusive: number, maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive
}

function randomWord(): string {
  return LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)] ?? 'lorem'
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** 生成一个句子：首词大写、句号结尾 */
function buildSentence(wordCount: number): string {
  const words = Array.from({ length: wordCount }, randomWord)
  return `${capitalize(words.join(' '))}.`
}

function buildSentenceList(sentenceCount: number, isFirstList: boolean): string[] {
  return Array.from({ length: sentenceCount }, (_, index) =>
    isFirstList && index === 0 ? FIRST_SENTENCE : buildSentence(randomInt(8, 16)),
  )
}

/**
 * 生成 Lorem Ipsum 占位文本：
 * - paragraphs：count 个段落（每段 4-6 句，空行分隔），首段以 "Lorem ipsum dolor sit amet…" 开头
 * - sentences：count 个句子（每句 8-16 词）
 * - words：count 个单词
 * 数量越界或类型非法时抛出 Error。
 */
export function generateLorem(type: LoremType, count: number): string {
  if (!loremTypes.includes(type)) {
    throw new Error(`Unknown lorem type: ${String(type)}`)
  }
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new Error(`Count must be an integer between ${MIN_COUNT} and ${MAX_COUNT}, got: ${count}`)
  }

  if (type === 'words') {
    return Array.from({ length: count }, randomWord).join(' ')
  }

  if (type === 'sentences') {
    return buildSentenceList(count, true).join(' ')
  }

  return Array.from({ length: count }, (_, index) =>
    buildSentenceList(randomInt(4, 6), index === 0).join(' '),
  ).join('\n\n')
}
