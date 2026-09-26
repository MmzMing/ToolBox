/**
 * 注释剥离：按源格式的注释语法删掉注释，引号里的内容一律不动。
 * 服务「格式工作台」的「去除注释」——JSON 常带 `//` 与 `/* *\/`，
 * 配置类文件（YAML / TOML）带 `#`，XML / HTML / Markdown 带 `<!-- -->`，SQL 带 `--`。
 *
 * 纯逻辑，零 DOM / React 依赖。
 */
import type { FormatId } from './format-convert'

interface CommentSyntax {
  /** 行注释起始符 */
  readonly lines: readonly string[]
  /** 块注释的 [开, 闭] 组合 */
  readonly blocks: readonly (readonly [string, string])[]
  /** 引号种类；引号内的注释符不生效 */
  readonly quotes: readonly string[]
  /** 引号是否支持「同一字符翻倍」的转义（YAML / TOML / SQL 是，JSON / XML 不是） */
  readonly doubledQuote: boolean
  /** 行注释符是否必须落在行首或空白之后（YAML / TOML 的 `#` 有这条限制） */
  readonly lineTokenNeedsBoundary: boolean
}

const JSON_SYNTAX: CommentSyntax = {
  lines: ['//'],
  blocks: [['/*', '*/']],
  quotes: ['"'],
  doubledQuote: false,
  lineTokenNeedsBoundary: false,
}

const MARKUP_SYNTAX: CommentSyntax = {
  lines: [],
  blocks: [['<!--', '-->']],
  quotes: ['"', "'"],
  doubledQuote: false,
  lineTokenNeedsBoundary: false,
}

const SYNTAX: Partial<Record<FormatId, CommentSyntax>> = {
  json: JSON_SYNTAX,
  'json-min': JSON_SYNTAX,
  yaml: {
    lines: ['#'],
    blocks: [],
    quotes: ['"', "'"],
    doubledQuote: true,
    lineTokenNeedsBoundary: true,
  },
  toml: {
    lines: ['#'],
    blocks: [],
    quotes: ['"', "'"],
    doubledQuote: true,
    lineTokenNeedsBoundary: true,
  },
  xml: MARKUP_SYNTAX,
  html: MARKUP_SYNTAX,
  markdown: { ...MARKUP_SYNTAX, quotes: ['"', "'", '`'] },
  sql: {
    lines: ['--'],
    blocks: [['/*', '*/']],
    quotes: ["'", '"', '`'],
    doubledQuote: true,
    lineTokenNeedsBoundary: false,
  },
}

/** 该格式有没有注释可去（CSV 没有注释语法） */
export function canStripComments(format: FormatId): boolean {
  return SYNTAX[format] !== undefined
}

/** `#` 只有在行首或空白之后才开始注释，`a#b` 是普通文本 */
function isBoundary(text: string, index: number): boolean {
  if (index === 0) {
    return true
  }
  const prev = text[index - 1] ?? ''
  return prev === ' ' || prev === '\t' || prev === '\n' || prev === '\r'
}

/** 只被注释占满的行连同换行一起去掉，免得留下一串空行 */
function dropEmptiedLines(original: string, stripped: string): string {
  const before = original.split('\n')
  const after = stripped.split('\n')
  const kept = after.filter(
    (line, index) => !(line.trim() === '' && (before[index] ?? '').trim() !== ''),
  )
  return kept.join('\n')
}

/**
 * 按格式剥离注释。空输入或该格式没有注释语法时原样返回。
 * 块注释跨行时会把其中的换行补回去，让「原文行 → 结果行」始终一一对应。
 */
export function stripComments(text: string, format: FormatId): string {
  const syntax = SYNTAX[format]
  if (!syntax || text === '') {
    return text
  }

  const out: string[] = []
  let index = 0
  let quote: string | null = null

  while (index < text.length) {
    const char = text[index] ?? ''

    if (quote !== null) {
      out.push(char)
      if (char === '\\') {
        const next = text[index + 1]
        if (next !== undefined) {
          out.push(next)
          index += 2
          continue
        }
      } else if (syntax.doubledQuote && char === quote && text[index + 1] === quote) {
        out.push(quote)
        index += 2
        continue
      } else if (char === quote) {
        quote = null
      }
      index += 1
      continue
    }

    if (syntax.quotes.includes(char)) {
      quote = char
      out.push(char)
      index += 1
      continue
    }

    const block = syntax.blocks.find(([open]) => text.startsWith(open, index))
    if (block) {
      const closeAt = text.indexOf(block[1], index + block[0].length)
      const stop = closeAt === -1 ? text.length : closeAt + block[1].length
      for (let cursor = index; cursor < stop; cursor += 1) {
        if (text[cursor] === '\n') {
          out.push('\n')
        }
      }
      index = stop
      continue
    }

    const lineToken = syntax.lines.find(
      (token) =>
        text.startsWith(token, index) &&
        (!syntax.lineTokenNeedsBoundary || isBoundary(text, index)),
    )
    if (lineToken) {
      const newlineAt = text.indexOf('\n', index)
      index = newlineAt === -1 ? text.length : newlineAt
      continue
    }

    out.push(char)
    index += 1
  }

  return dropEmptiedLines(text, out.join(''))
}
