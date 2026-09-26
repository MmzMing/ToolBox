/**
 * 文本格式化的纯逻辑层：行原语、文本统计与处理链 reducer。
 * 零 DOM / React 依赖；规则注册表见 text-formatter.rules.ts，光标换算在 @/utils/text-caret。
 */

/** 撤销栈保留的最大步数 */
export const MAX_HISTORY = 50

/** 按行拆开，顺带把 CRLF / CR 归一成 LF */
export function toLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function fromLines(lines: readonly string[]): string {
  return lines.join('\n')
}

/** 逐行改写，行结构不变 */
export function mapLines(text: string, fn: (line: string) => string): string {
  return fromLines(toLines(text).map(fn))
}

/** 码点计数，避免 emoji 等代理对被算成 2 */
export function codePointLength(value: string): number {
  return [...value].length
}

/** 首字母大写、其余原样保留 */
export function upperFirst(word: string): string {
  const [first, ...rest] = word
  return first === undefined ? '' : first.toUpperCase() + rest.join('')
}

/** 首字母大写、其余转小写（Title Case 的词形） */
export function titleWord(word: string): string {
  const [first, ...rest] = word
  return first === undefined ? '' : first.toUpperCase() + rest.join('').toLowerCase()
}

// ------------------------------------------------------------------------- 统计

/** CJK 字符（汉字/假名/谚文）：分词时逐字拆开 */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** 含字母或数字的 token 才算词（过滤纯标点） */
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

const LETTER = /\p{L}/u
const DIGIT = /\p{N}/u

/** JS `\s` 的码点集合，逐字符判断省掉一次全文正则替换 */
function isWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  )
}

const utf8Size = (code: number): number =>
  code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4

type CharScan = {
  codePoints: number
  bytes: number
  nonSpace: number
  letters: number
  digits: number
  cjk: number
  longestLine: number
}

/**
 * 单遍扫描出字符、字节、行最长等指标。
 * 旧实现靠 [...text] 与 text.match(/\p{L}/gu) 取长度，十万字要分配几十万个字符串，
 * 实测 130KB 文本一次 21ms，逐键重算就是「打字很卡」的主因。
 */
function scanChars(text: string): CharScan {
  const scan: CharScan = {
    codePoints: 0,
    bytes: 0,
    nonSpace: 0,
    letters: 0,
    digits: 0,
    cjk: 0,
    longestLine: 0,
  }
  let lineLength = 0

  for (let index = 0; index < text.length;) {
    const code = text.codePointAt(index) ?? 0
    index += code > 0xffff ? 2 : 1
    scan.codePoints += 1
    scan.bytes += utf8Size(code)
    lineLength += 1

    if (code === 0x0a) {
      scan.longestLine = Math.max(scan.longestLine, lineLength - 1)
      lineLength = 0
      continue
    }
    if (isWhitespace(code)) {
      continue
    }
    scan.nonSpace += 1
    // ASCII 走区间判断，只有非 ASCII 才付 Unicode 属性正则的成本
    if (code < 0x80) {
      if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
        scan.letters += 1
      } else if (code >= 0x30 && code <= 0x39) {
        scan.digits += 1
      }
      continue
    }
    const flags = charClass(code)
    if ((flags & CLASS_CJK) !== 0) {
      scan.cjk += 1
    }
    if ((flags & CLASS_LETTER) !== 0) {
      scan.letters += 1
    } else if ((flags & CLASS_DIGIT) !== 0) {
      scan.digits += 1
    }
  }

  scan.longestLine = Math.max(scan.longestLine, lineLength)
  return scan
}

/** 中英混排分词：CJK 逐字成词，其余按空白切分；纯标点 token 不计 */
function scanWords(text: string): { words: number; length: number } {
  let words = 0
  let length = 0
  let token = ''

  const flush = () => {
    if (token !== '' && HAS_LETTER_OR_DIGIT.test(token)) {
      words += 1
      length += codePointLength(token)
    }
    token = ''
  }

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (isWhitespace(code)) {
      flush()
    } else if ((charClass(code) & CLASS_CJK) !== 0) {
      flush()
      words += 1
      length += 1
    } else {
      token += char
    }
  }
  flush()

  return { words, length }
}

export type TextStats = {
  chars: number
  charsNoSpaces: number
  letters: number
  digits: number
  cjk: number
  words: number
  lines: number
  uniqueLines: number
  sentences: number
  paragraphs: number
  longestLine: number
  bytes: number
  avgWordLength: number
  readingMinutes: number
}

/** 阅读时长基准：200 词/分钟 */
const WORDS_PER_MINUTE = 200

const round2 = (value: number): number => Math.round(value * 100) / 100

const EMPTY_STATS: TextStats = {
  chars: 0,
  charsNoSpaces: 0,
  letters: 0,
  digits: 0,
  cjk: 0,
  words: 0,
  lines: 0,
  uniqueLines: 0,
  sentences: 0,
  paragraphs: 0,
  longestLine: 0,
  bytes: 0,
  avgWordLength: 0,
  readingMinutes: 0,
}

const SENTENCE_BREAK = /[.!?。！？]/

/** 码点 → 字符类别位标（1 字母 / 2 数字 / 4 CJK），非 ASCII 字符的Unicode 属性正则只付一次 */
const CLASS_LETTER = 1
const CLASS_DIGIT = 2
const CLASS_CJK = 4
const classCache = new Map<number, number>()

function charClass(code: number): number {
  const cached = classCache.get(code)
  if (cached !== undefined) {
    return cached
  }
  const single = String.fromCodePoint(code)
  let flags = 0
  if (LETTER.test(single)) {
    flags |= CLASS_LETTER
  }
  if (DIGIT.test(single)) {
    flags |= CLASS_DIGIT
  }
  if (CJK_CHAR.test(single)) {
    flags |= CLASS_CJK
  }
  classCache.set(code, flags)
  return flags
}

/** 统计字符、词、行、句、段、字节与阅读时长；空文本各项为 0 */
export function analyzeText(text: string): TextStats {
  if (text === '') {
    return { ...EMPTY_STATS }
  }

  const scan = scanChars(text)
  const wordScan = scanWords(text)
  const lines = toLines(text)

  const unique = new Set<string>()
  let sentences = 0
  let paragraphs = 0
  let pendingSentence = false
  let inParagraph = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      inParagraph = false
    } else {
      unique.add(line)
      if (!inParagraph) {
        paragraphs += 1
        inParagraph = true
      }
    }
    for (const char of line) {
      if (SENTENCE_BREAK.test(char)) {
        if (pendingSentence) {
          sentences += 1
          pendingSentence = false
        }
      } else if (!isWhitespace(char.codePointAt(0) ?? 0)) {
        pendingSentence = true
      }
    }
  }
  if (pendingSentence) {
    sentences += 1
  }

  return {
    chars: scan.codePoints,
    charsNoSpaces: scan.nonSpace,
    letters: scan.letters,
    digits: scan.digits,
    cjk: scan.cjk,
    words: wordScan.words,
    lines: lines.length,
    uniqueLines: unique.size,
    sentences,
    paragraphs,
    longestLine: scan.longestLine,
    bytes: scan.bytes,
    avgWordLength: wordScan.words === 0 ? 0 : round2(wordScan.length / wordScan.words),
    readingMinutes: wordScan.words === 0 ? 0 : round2(wordScan.words / WORDS_PER_MINUTE),
  }
}

/** 指标顺序即统计面板的展示顺序 */
export const statKeys = [
  'chars',
  'charsNoSpaces',
  'letters',
  'digits',
  'cjk',
  'words',
  'lines',
  'uniqueLines',
  'sentences',
  'paragraphs',
  'longestLine',
  'bytes',
  'avgWordLength',
  'readingMinutes',
] as const satisfies readonly (keyof TextStats)[]

// ----------------------------------------------------------------- 处理链状态机

export type FormatterState = {
  /** 左卡的可编辑原文 */
  base: string
  /** 已应用规则的历史值，栈顶为最近一步 */
  past: string[]
  /** 右卡当前内容 */
  present: string
  /** 被撤销掉的内容，栈顶为下一个重做目标 */
  future: string[]
}

export type FormatterAction =
  | { type: 'edit'; value: string }
  | { type: 'apply'; value: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'commitToBase' }
  | { type: 'reset' }

export function initialFormatterState(text = ''): FormatterState {
  return { base: text, past: [], present: text, future: [] }
}

/** 丢弃 future 栈尾多余步，保持栈深不超过 MAX_HISTORY */
function trimPast(past: readonly string[]): string[] {
  return past.length > MAX_HISTORY ? [...past.slice(past.length - MAX_HISTORY)] : [...past]
}

export function formatterReducer(state: FormatterState, action: FormatterAction): FormatterState {
  switch (action.type) {
    case 'edit':
      // 文本没变就不动链路：输入框会延迟上报，同一份文本可能被重复送上一次，
      // 此时若照旧重置，刚应用过的规则与撤销栈会被无声抹掉
      if (action.value === state.base) {
        return state
      }
      return initialFormatterState(action.value)
    case 'apply':
      if (action.value === state.present) {
        return state
      }
      return {
        ...state,
        past: trimPast([...state.past, state.present]),
        present: action.value,
        future: [],
      }
    case 'undo': {
      const previous = state.past.at(-1)
      if (previous === undefined) {
        return state
      }
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (next === undefined) {
        return state
      }
      return {
        ...state,
        past: trimPast([...state.past, state.present]),
        present: next,
        future: state.future.slice(1),
      }
    }
    case 'commitToBase':
      return initialFormatterState(state.present)
    case 'reset':
      if (state.present === state.base) {
        return state
      }
      return {
        ...state,
        past: trimPast([...state.past, state.present]),
        present: state.base,
        future: [],
      }
  }
}
