/**
 * 多格式互转引擎：把「源格式读成 JS 值 → 目标格式写成文本」两段拼起来。
 * 纯逻辑，零 DOM / React 依赖；「格式转换」与「代码格式化」共用这一份实现。
 *
 * 设计取舍：
 * - 不提供缩进选项，统一 2 空格；选同一个格式即「规范化 / 美化」；
 * - CSV 与其余格式之间走「对象数组」这一中间形态，结构不符时明确报错；
 * - Markdown / HTML 互为唯一目标（不做通用标记语言解析），SQL 只能格式化、
 *   无法通用反解析，因此它的可达目标只有自己。
 */
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { marked } from 'marked'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { format as formatSql } from 'sql-formatter'
import TurndownService from 'turndown'
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml'

export type FormatId =
  'json' | 'json-min' | 'yaml' | 'toml' | 'xml' | 'csv' | 'markdown' | 'html' | 'sql'

/** 可作为输入源的格式。`json-min` 只是「压缩输出」变体，不能当输入 */
export const sourceFormats: readonly FormatId[] = [
  'json',
  'yaml',
  'toml',
  'xml',
  'csv',
  'markdown',
  'html',
  'sql',
]

/** 有读写器、可互转的数据格式 */
const DATA_FORMATS: readonly FormatId[] = ['json', 'yaml', 'toml', 'xml', 'csv']

/** 自成一体的格式：可达目标写死，不走数据管道 */
const TEXT_FORMATS: Partial<Record<FormatId, readonly FormatId[]>> = {
  markdown: ['markdown', 'html'],
  html: ['html', 'markdown'],
  sql: ['sql'],
}

const LANGUAGES: Record<FormatId, string> = {
  json: 'json',
  'json-min': 'json',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  csv: 'plaintext',
  markdown: 'markdown',
  html: 'xml',
  sql: 'sql',
}

/** highlight.js 语言标识；没有对应语言时由输出区降级成纯文本 */
export function languageOf(format: FormatId): string {
  return LANGUAGES[format]
}

/**
 * 该格式能做哪些输出。界面据此裁剪目标格式下拉，用户不会选出「转换不了」的组合，
 * 只有内容本身非法（如 JSON 语法错误）才会走到报错分支。
 */
export function targetFormatsOf(from: FormatId): readonly FormatId[] {
  const fixed = TEXT_FORMATS[from]
  if (fixed) {
    return fixed
  }
  if (DATA_FORMATS.includes(from)) {
    return ['json', 'json-min', 'yaml', 'toml', 'xml', 'csv']
  }
  return ['json']
}

/**
 * 把目标格式退回一个可达的默认值（源格式改变、原目标不可达时用）。
 *
 * 优先挑「换个格式」而非压缩变体或自身：从 JSON 换源时默认落到 YAML 而不是
 * `json-min`——用户刚切了源格式，显然是想看另一种写法，不是想看压缩结果。
 */
export function defaultTargetOf(from: FormatId): FormatId {
  const targets = targetFormatsOf(from)
  return (
    targets.find((target) => target !== from && target !== 'json-min') ??
    targets.find((target) => target !== from) ??
    targets[0] ??
    'json'
  )
}

// ------------------------------------------------------------------ CSV 原语

/** RFC 4180 转义：含引号 / 分隔符 / 换行的单元格用双引号包裹并把内部引号翻倍 */
export function escapeCsvCell(cell: unknown, delimiter = ','): string {
  if (cell === null || cell === undefined) {
    return ''
  }
  const raw = typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
  if (raw.includes('"') || raw.includes(delimiter) || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

/** 逐字符扫描解析（不做全文正则替换，避免大文本上的回溯与额外分配） */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  if (text === '') {
    return []
  }
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (quoted) {
      if (char !== '"') {
        cell += char
      } else if (text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  row.push(cell)
  rows.push(row)

  // 结尾换行会多出一个只含空串的行，丢掉
  const last = rows.at(-1)
  if (rows.length > 1 && last !== undefined && last.length === 1 && last[0] === '') {
    rows.pop()
  }
  return rows
}

/** 首行当表头，其余行转成对象数组 */
export function csvRowsToRecords(rows: readonly string[][]): Record<string, string>[] {
  const [header, ...body] = rows
  if (header === undefined) {
    return []
  }
  return body.map((cells) => {
    const record: Record<string, string> = {}
    header.forEach((key, index) => {
      record[key] = cells[index] ?? ''
    })
    return record
  })
}

/** 对象数组转 CSV：列取所有对象键的并集，保证不丢字段 */
export function recordsToCsv(records: readonly Record<string, unknown>[]): string {
  const keys: string[] = []
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }
  }
  const lines = [keys.map((key) => escapeCsvCell(key)).join(',')]
  for (const record of records) {
    lines.push(keys.map((key) => escapeCsvCell(record[key])).join(','))
  }
  return lines.join('\n')
}

// ------------------------------------------------------------------ 空白压平

/**
 * 压成单行（「全部折叠」的底层动作）：引号外的连续空白（含换行、制表符）压成一个空格，
 * 引号内的内容原样保留。
 *
 * 刻意只做空白压平、不按标点省空格——`text (note)`、`hello <b>x</b>` 这类文本内容里的
 * 空格是有意义的，省掉会改变含义。JSON 的最小化写法走 `JSON.stringify`，
 * XML 走不带缩进的 builder，都不依赖这里。
 */
export function collapseToSingleLine(text: string): string {
  let out = ''
  let quote: string | null = null
  let pendingSpace = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    if (quote !== null) {
      out += char
      if (char === '\\') {
        // 转义符连同下一个字符一起收进来，免得把 \" 误当成字符串收尾
        const next = text[index + 1]
        if (next !== undefined) {
          out += next
          index += 1
        }
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      if (pendingSpace && out !== '') {
        out += ' '
      }
      pendingSpace = false
      quote = char
      out += char
      continue
    }
    // 所有 <= 空格的字符都算空白：空格、制表符、换行
    if (char <= ' ') {
      pendingSpace = true
      continue
    }
    if (pendingSpace && out !== '') {
      out += ' '
    }
    pendingSpace = false
    out += char
  }
  return out
}

// ---------------------------------------------------------------- 各格式读写

function ensureObject(value: unknown, format: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${format} root must be an object`)
  }
  return value as Record<string, unknown>
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }
}

/** YAML 取第一篇文档；空流返回 undefined，错误收集在 doc.errors */
function parseYamlInput(text: string): unknown {
  const [doc] = parseAllDocuments(text)
  if (!doc) {
    return undefined
  }
  if (doc.errors.length > 0) {
    throw new Error(`Invalid YAML: ${doc.errors[0].message}`)
  }
  return doc.toJSON()
}

function parseXml(text: string): unknown {
  const validation = XMLValidator.validate(text)
  if (validation !== true) {
    const { msg, line, col } = validation.err
    throw new Error(`Invalid XML: ${msg} (line ${line}, column ${col})`)
  }
  try {
    return new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
    }).parse(text)
  } catch (err) {
    throw new Error(`Invalid XML: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }
}

/** 按格式把文本读成 JS 值（仅数据格式） */
function readValue(format: FormatId, text: string): unknown {
  switch (format) {
    case 'json':
    case 'json-min': {
      return parseJson(text)
    }
    case 'yaml':
      return parseYamlInput(text)
    case 'toml': {
      try {
        return parseToml(text)
      } catch (err) {
        throw new Error(`Invalid TOML: ${err instanceof Error ? err.message : String(err)}`, {
          cause: err,
        })
      }
    }
    case 'xml':
      return parseXml(text)
    case 'csv':
      return csvRowsToRecords(parseCsvRows(text))
    default:
      throw new Error(`${format} is not a data format`)
  }
}

/** 按格式把 JS 值写成文本（仅数据格式）；`compact` 为真时输出折叠成单行 */
function writeValue(format: FormatId, value: unknown, compact: boolean): string {
  switch (format) {
    case 'json':
      return compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)
    case 'json-min':
      return JSON.stringify(value)
    case 'yaml':
      return compact
        ? stringifyYaml(value, {
            collectionStyle: 'flow',
            flowCollectionPadding: false,
            lineWidth: 0,
          }).trimEnd()
        : stringifyYaml(value, { indent: 2, lineWidth: 100 }).trimEnd()
    case 'toml':
      // TOML 本身按行组织，没有单行写法，折叠时只能压平空白
      return compact
        ? collapseToSingleLine(stringifyToml(ensureObject(value, 'TOML')))
        : stringifyToml(ensureObject(value, 'TOML'))
    case 'xml':
      return new XMLBuilder({
        format: !compact,
        indentBy: '  ',
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        suppressEmptyNode: true,
      })
        .build(ensureObject(value, 'XML'))
        .trimEnd()
    case 'csv': {
      if (!Array.isArray(value)) {
        throw new Error('CSV output requires an array of objects')
      }
      for (const item of value) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new Error('Every element of the array must be an object')
        }
      }
      const text = recordsToCsv(value as Record<string, unknown>[])
      return compact ? collapseToSingleLine(text) : text
    }
    default:
      throw new Error(`${format} is not a data format`)
  }
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

function markdownToHtml(input: string): string {
  return (marked.parse(input, { async: false, gfm: true, breaks: false }) as string).trimEnd()
}

function htmlToMarkdown(input: string): string {
  return turndown.turndown(input).trimEnd()
}

// -------------------------------------------------------------------- 入口

/** 输出形态：`pretty` 缩进美化（默认），`compact` 折叠成单行 */
export type ConvertStyle = 'pretty' | 'compact'

export interface ConvertOptions {
  style?: ConvertStyle
}

/**
 * 执行转换。空输入返回空串，非法内容抛 `Error`（英文技术信息，界面直接展示）。
 * 同格式调用即「规范化 / 美化」：JSON/YAML/TOML/XML 走一遍读写，SQL 交给 sql-formatter，
 * Markdown / HTML 无通用美化器，原样返回。
 *
 * `style: 'compact'` 换一个输出形态（「全部折叠」），两种形态都由同一份输入现算，
 * 来回切换不会丢内容。
 */
export function convert(
  from: FormatId,
  to: FormatId,
  input: string,
  options: ConvertOptions = {},
): string {
  if (input.trim() === '') {
    return ''
  }
  const compact = options.style === 'compact'
  const fold = (text: string) => (compact ? collapseToSingleLine(text) : text)

  if (from === 'markdown' && to === 'html') {
    return fold(markdownToHtml(input))
  }
  if (from === 'html' && to === 'markdown') {
    return fold(htmlToMarkdown(input))
  }

  // 自成一体的格式：目标只能是自己（或上面的互为转换）
  if (TEXT_FORMATS[from] !== undefined) {
    if (to !== from) {
      throw new Error(`Unsupported conversion: ${from} → ${to}`)
    }
    if (from === 'sql') {
      try {
        return fold(formatSql(input, { language: 'sql', tabWidth: 2, keywordCase: 'upper' }))
      } catch (err) {
        throw new Error(`Invalid SQL: ${err instanceof Error ? err.message : String(err)}`, {
          cause: err,
        })
      }
    }
    return fold(input)
  }

  if (to === 'markdown' || to === 'html' || to === 'sql') {
    throw new Error(`Unsupported conversion: ${from} → ${to}`)
  }

  return writeValue(to, readValue(from, input), compact)
}
