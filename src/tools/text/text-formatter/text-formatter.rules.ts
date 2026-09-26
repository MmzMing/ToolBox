/**
 * 快捷规则注册表：9 组 64 条一键规则，全部是 (text) => text 的纯函数。
 * 分组顺序与图标在 RulePanel.tsx，本文件不引任何 UI 依赖。
 */
import {
  camelCase,
  constantCase,
  kebabCase,
  pascalCase,
  sentenceCase,
  snakeCase,
  split,
  trainCase,
} from 'change-case'

import { fromLines, mapLines, titleWord, toLines, upperFirst } from './text-formatter.service'

export const ruleGroups = [
  'sort',
  'case',
  'naming',
  'extract',
  'delimiter',
  'wrap',
  'escape',
  'clean',
  'convert',
] as const

export type RuleGroup = (typeof ruleGroups)[number]

export type TextRule = {
  /** 同时是 i18n 键 `text-formatter.rules.<id>` 与列表 key */
  id: string
  group: RuleGroup
  apply: (text: string) => string
}

// ---------------------------------------------------------------------- 原语

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true })

const codePoints = (value: string) => [...value].length

/** 删掉 pattern 命中的部分 */
const strip = (text: string, pattern: RegExp) => text.replace(pattern, '')

const nonEmptyLines = (text: string) =>
  toLines(text)
    .map((line) => line.trim())
    .filter((line) => line !== '')

const sortedLines = (text: string, direction: 1 | -1) =>
  fromLines([...toLines(text)].sort((a, b) => collator.compare(a, b) * direction))

const sortedByLength = (text: string, direction: 1 | -1) =>
  fromLines(
    [...toLines(text)].sort(
      (a, b) => (codePoints(a) - codePoints(b)) * direction || collator.compare(a, b),
    ),
  )

function shuffledLines(text: string, random: () => number = Math.random): string {
  const lines = toLines(text)
  for (let index = lines.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const current = lines[index] ?? ''
    lines[index] = lines[target] ?? ''
    lines[target] = current
  }
  return fromLines(lines)
}

const swapCase = (text: string) =>
  text.replace(/\p{L}/gu, (char) =>
    char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase(),
  )

/** 只把每个词的首字母转大写，其余字符与分隔符原样保留 */
const capitalizeWords = (text: string) => text.replace(/\p{L}[\p{L}\p{N}]*/gu, upperFirst)

/** 只把每句的首字母转大写（句末标点或换行之后），用后行断言避免把前缀一起改写 */
const capitalizeSentences = (text: string) =>
  text.replace(/(?<=^|[.!?。！？]\s*|\n)\p{L}/gmu, upperFirst)

const perLine = (convert: (line: string) => string) => (text: string) => mapLines(text, convert)

// ---------------------------------------------------------------------- 提取

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/gu
const LINK = /https?:\/\/[^\s<>"'）)，。、；]+/giu
const NUMBER = /-?\d+(?:\.\d+)?/gu
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu
const LATIN_WORD = /[A-Za-z]+/gu
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/gu

function extractAll(text: string, pattern: RegExp, isValid?: (value: string) => boolean): string {
  const found = text.match(pattern) ?? []
  return (isValid === undefined ? found : found.filter(isValid)).join('\n')
}

const isIpv4 = (value: string) => value.split('.').every((part) => Number(part) <= 255)

// ------------------------------------------------------------------ 分隔符

/** 按分隔符拆成多行：逐项去空白并丢弃空项 */
const toLineBy = (separator: RegExp) => (text: string) =>
  fromLines(
    text
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  )

/** 多行合成一行，用 glue 连接 */
const fromLineBy = (glue: string) => (text: string) => nonEmptyLines(text).join(glue)

// -------------------------------------------------------------- 包裹与编号

const wrapLines = (open: string, close: string) => (text: string) =>
  mapLines(text, (line) => (line.trim() === '' ? line : `${open}${line}${close}`))

function addLineNumbers(text: string): string {
  if (text === '') {
    return ''
  }
  const lines = toLines(text)
  const width = String(lines.length).length
  return fromLines(lines.map((line, index) => `${String(index + 1).padStart(width)}\t${line}`))
}

// ---------------------------------------------------------------------- 转义

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', '\u00a0'],
  ['copy', '©'],
  ['reg', '®'],
  ['trade', '™'],
  ['hellip', '…'],
  ['mdash', '—'],
  ['ndash', '–'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['bull', '•'],
  ['middot', '·'],
  ['times', '×'],
  ['divide', '÷'],
  ['deg', '°'],
  ['plusmn', '±'],
  ['pound', '£'],
  ['euro', '€'],
  ['yen', '¥'],
  ['cent', '¢'],
  ['sect', '§'],
  ['para', '¶'],
  ['micro', 'µ'],
])

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char)

function unescapeHtml(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match) => {
    const body = match.slice(1, -1)
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isNaN(code) || code < 1 || code > 0x10ffff ? match : String.fromCodePoint(code)
    }
    return NAMED_ENTITIES.get(body) ?? match
  })
}

const hex4 = (code: number) => `\\u${code.toString(16).padStart(4, '0')}`

/** ASCII 保留，其余转成 `\\uXXXX`（非 BMP 拆成代理对），Java 源码里可直接粘贴 */
function escapeJava(text: string): string {
  let out = ''
  for (const char of text) {
    switch (char) {
      case '\\':
        out += '\\\\'
        break
      case '"':
        out += '\\"'
        break
      case '\n':
        out += '\\n'
        break
      case '\r':
        out += '\\r'
        break
      case '\t':
        out += '\\t'
        break
      default: {
        const code = char.codePointAt(0) ?? 0
        if (code < 0x80) {
          out += char
        } else if (code <= 0xffff) {
          out += hex4(code)
        } else {
          const shifted = code - 0x10000
          out += hex4(0xd800 + (shifted >> 10)) + hex4(0xdc00 + (shifted & 0x3ff))
        }
      }
    }
  }
  return out
}

const javaEscapeChar = (char: string): string | undefined => {
  switch (char) {
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    case '\\':
      return '\\'
    case '"':
      return '"'
    case "'":
      return "'"
    default:
      return undefined
  }
}

/** 逐个还原转义，无法识别的写法保持原样 */
function unescapeJava(text: string): string {
  let out = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (char !== '\\') {
      out += char
      continue
    }
    const next = text[index + 1] ?? ''
    if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6))) {
      // 代理对的两个 \uXXXX 会先后解码，拼在同一个字符串里即成对生效
      out += String.fromCharCode(Number.parseInt(text.slice(index + 2, index + 6), 16))
      index += 5
      continue
    }
    const mapped = javaEscapeChar(next)
    if (mapped === undefined) {
      out += char
      continue
    }
    out += mapped
    index += 1
  }
  return out
}

// ------------------------------------------------------------------ 清理删除

function removeDuplicateLines(text: string): string {
  const seen = new Set<string>()
  return fromLines(
    toLines(text).filter((line) => {
      if (seen.has(line)) {
        return false
      }
      seen.add(line)
      return true
    }),
  )
}

// ------------------------------------------------------------------ 格式转换

const fullwidthToHalf = (text: string) =>
  text.replace(/[\u3000\uff01-\uff5e]/g, (char) => {
    const code = char.codePointAt(0) ?? 0
    return code === 0x3000 ? ' ' : String.fromCharCode(code - 0xfee0)
  })

/** 只剥语法符号、保留正文：代码块内容与链接可见文字都留下 */
function markdownToText(text: string): string {
  return text
    .replace(/^```[^\n]*$/gm, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>+\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^(\s*[-*_]){3,}$/gm, '')
    .replace(/\*\*|__|\*|_/g, '')
    .trim()
}

function htmlToText(text: string): string {
  const withBreaks = text
    .replace(/<\s*(br|hr)\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|h[1-6]|tr|blockquote|pre|section|article)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return fromLines(withBreaks.split('\n').map((line) => line.trim()))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// -------------------------------------------------------------------- 注册表

export const textRules: readonly TextRule[] = [
  // 排序与顺序
  { id: 'sort-asc', group: 'sort', apply: (text) => sortedLines(text, 1) },
  { id: 'sort-desc', group: 'sort', apply: (text) => sortedLines(text, -1) },
  { id: 'sort-length-asc', group: 'sort', apply: (text) => sortedByLength(text, 1) },
  { id: 'sort-length-desc', group: 'sort', apply: (text) => sortedByLength(text, -1) },
  { id: 'reverse-lines', group: 'sort', apply: (text) => fromLines([...toLines(text)].reverse()) },
  { id: 'shuffle-lines', group: 'sort', apply: (text) => shuffledLines(text) },

  // 大小写
  { id: 'upper', group: 'case', apply: (text) => text.toUpperCase() },
  { id: 'lower', group: 'case', apply: (text) => text.toLowerCase() },
  { id: 'capitalize-words', group: 'case', apply: capitalizeWords },
  { id: 'capitalize-sentences', group: 'case', apply: capitalizeSentences },
  { id: 'swap-case', group: 'case', apply: swapCase },

  // 命名风格
  { id: 'to-camel', group: 'naming', apply: perLine(camelCase) },
  { id: 'to-pascal', group: 'naming', apply: perLine(pascalCase) },
  { id: 'to-snake', group: 'naming', apply: perLine(snakeCase) },
  { id: 'to-constant', group: 'naming', apply: perLine(constantCase) },
  { id: 'to-kebab', group: 'naming', apply: perLine(kebabCase) },
  { id: 'to-train', group: 'naming', apply: perLine(trainCase) },
  {
    id: 'to-title',
    group: 'naming',
    apply: perLine((line) => split(line).map(titleWord).join(' ')),
  },
  { id: 'to-sentence', group: 'naming', apply: perLine(sentenceCase) },

  // 提取
  { id: 'extract-email', group: 'extract', apply: (text) => extractAll(text, EMAIL) },
  { id: 'extract-url', group: 'extract', apply: (text) => extractAll(text, LINK) },
  { id: 'extract-number', group: 'extract', apply: (text) => extractAll(text, NUMBER) },
  { id: 'extract-cjk', group: 'extract', apply: (text) => extractAll(text, CJK_RUN) },
  { id: 'extract-latin', group: 'extract', apply: (text) => extractAll(text, LATIN_WORD) },
  { id: 'extract-ip', group: 'extract', apply: (text) => extractAll(text, IPV4, isIpv4) },

  // 分隔符互转
  { id: 'comma-to-line', group: 'delimiter', apply: toLineBy(/[,，]+/) },
  { id: 'semicolon-to-line', group: 'delimiter', apply: toLineBy(/[;；]+/) },
  { id: 'period-to-line', group: 'delimiter', apply: toLineBy(/。|\.(?=\s|$)/g) },
  { id: 'amp-to-line', group: 'delimiter', apply: toLineBy(/&+/) },
  { id: 'space-to-line', group: 'delimiter', apply: toLineBy(/\s+/) },
  { id: 'pipe-to-line', group: 'delimiter', apply: toLineBy(/\|+/) },
  { id: 'ideographic-comma-to-line', group: 'delimiter', apply: toLineBy(/、+/) },
  { id: 'line-to-comma', group: 'delimiter', apply: fromLineBy(',') },
  { id: 'line-to-semicolon', group: 'delimiter', apply: fromLineBy(';') },
  { id: 'line-to-period', group: 'delimiter', apply: fromLineBy('。') },
  { id: 'line-to-amp', group: 'delimiter', apply: fromLineBy('&') },
  { id: 'line-to-space', group: 'delimiter', apply: fromLineBy(' ') },
  { id: 'line-to-pipe', group: 'delimiter', apply: fromLineBy('|') },
  { id: 'line-to-ideographic-comma', group: 'delimiter', apply: fromLineBy('、') },
  { id: 'merge-lines', group: 'delimiter', apply: (text) => toLines(text).join('') },

  // 包裹与编号
  { id: 'wrap-double-quote', group: 'wrap', apply: wrapLines('"', '"') },
  { id: 'wrap-single-quote', group: 'wrap', apply: wrapLines("'", "'") },
  {
    id: 'sql-list',
    group: 'wrap',
    apply: (text) => {
      const items = nonEmptyLines(text)
      return items.length === 0 ? '' : `'${items.join("','")}'`
    },
  },
  { id: 'add-line-numbers', group: 'wrap', apply: addLineNumbers },

  // 转义
  { id: 'escape-html', group: 'escape', apply: escapeHtml },
  { id: 'unescape-html', group: 'escape', apply: unescapeHtml },
  { id: 'escape-java', group: 'escape', apply: escapeJava },
  { id: 'unescape-java', group: 'escape', apply: unescapeJava },

  // 清理与删除
  { id: 'remove-spaces', group: 'clean', apply: (text) => strip(text, /[ \t\u3000]/g) },
  { id: 'trim-lines', group: 'clean', apply: (text) => mapLines(text, (line) => line.trim()) },
  {
    id: 'collapse-spaces',
    group: 'clean',
    apply: (text) => text.replace(/[ \t\u3000]{2,}/g, ' '),
  },
  { id: 'remove-empty-lines', group: 'clean', apply: (text) => fromLines(nonEmptyLines(text)) },
  { id: 'remove-duplicate-lines', group: 'clean', apply: removeDuplicateLines },
  { id: 'remove-punctuation', group: 'clean', apply: (text) => strip(text, /[\p{P}\p{S}]/gu) },
  { id: 'remove-special-chars', group: 'clean', apply: (text) => strip(text, /[^\p{L}\p{N}\s]/gu) },
  { id: 'remove-digits', group: 'clean', apply: (text) => strip(text, /\p{N}/gu) },
  { id: 'remove-html-tags', group: 'clean', apply: (text) => strip(text, /<[^>]*>/g) },
  {
    id: 'remove-comment-lines',
    group: 'clean',
    apply: (text) => fromLines(toLines(text).filter((line) => !/^\s*(?:#|\/\/|--)/.test(line))),
  },
  {
    id: 'remove-invisible-chars',
    group: 'clean',
    apply: (text) =>
      strip(
        text,
        // eslint-disable-next-line no-control-regex -- 本规则的职责就是清掉这些控制字符
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\ufeff]/g,
      ),
  },

  // 格式转换
  { id: 'fullwidth-to-half', group: 'convert', apply: fullwidthToHalf },
  { id: 'tab-to-spaces', group: 'convert', apply: (text) => text.replace(/\t/g, '    ') },
  { id: 'normalize-newlines', group: 'convert', apply: (text) => fromLines(toLines(text)) },
  { id: 'markdown-to-text', group: 'convert', apply: markdownToText },
  { id: 'html-to-text', group: 'convert', apply: htmlToText },
]

export function rulesOfGroup(group: RuleGroup): readonly TextRule[] {
  return textRules.filter((rule) => rule.group === group)
}

export type RuleOutcome = { ok: true; value: string } | { ok: false; message: string }

/** 规则内部抛错时降级为失败结果，绝不让页面崩 */
export function applyRule(rule: TextRule, text: string): RuleOutcome {
  try {
    return { ok: true, value: rule.apply(text) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
