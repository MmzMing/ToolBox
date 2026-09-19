import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { format as formatSqlLib } from 'sql-formatter'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/* ---------- 模式定义：六种代码格式化/转换共用一个页面 ---------- */

export const formatterModes = [
  'json-format',
  'json-minify',
  'json-to-csv',
  'sql-format',
  'xml-format',
  'yaml-format',
] as const

export type FormatterMode = (typeof formatterModes)[number]

export const jsonIndents = [2, 4, 'tab'] as const
export type JsonIndent = (typeof jsonIndents)[number]

export interface FormatterModeDef {
  id: FormatterMode
  /** i18n 键（code-formatter.modes.<id>） */
  labelKey: string
  inputLanguage: string
  outputLanguage: string
  /** 该模式是否有额外选项行 */
  hasOptions: 'indent' | 'delimiter' | undefined
}

export const formatterModeDefs: readonly FormatterModeDef[] = [
  {
    id: 'json-format',
    labelKey: 'modes.jsonFormat',
    inputLanguage: 'json',
    outputLanguage: 'json',
    hasOptions: 'indent',
  },
  {
    id: 'json-minify',
    labelKey: 'modes.jsonMinify',
    inputLanguage: 'json',
    outputLanguage: 'json',
    hasOptions: undefined,
  },
  {
    id: 'json-to-csv',
    labelKey: 'modes.jsonToCsv',
    inputLanguage: 'json',
    outputLanguage: 'text',
    hasOptions: 'delimiter',
  },
  {
    id: 'sql-format',
    labelKey: 'modes.sqlFormat',
    inputLanguage: 'sql',
    outputLanguage: 'sql',
    hasOptions: undefined,
  },
  {
    id: 'xml-format',
    labelKey: 'modes.xmlFormat',
    inputLanguage: 'xml',
    outputLanguage: 'xml',
    hasOptions: undefined,
  },
  {
    id: 'yaml-format',
    labelKey: 'modes.yamlFormat',
    inputLanguage: 'yaml',
    outputLanguage: 'yaml',
    hasOptions: undefined,
  },
]

export function getFormatterMode(id: string): FormatterModeDef {
  const def = formatterModeDefs.find((item) => item.id === id)
  if (!def) {
    throw new Error(`Unknown formatter mode: ${id}`)
  }
  return def
}

/* ---------- 解析 helpers ---------- */

function parseJson(input: string): unknown {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON: ${reason}`, { cause: err })
  }
  return data
}

function indentValue(indent: JsonIndent): number | string {
  return indent === 'tab' ? '\t' : indent
}

/* ---------- 各模式实现（语义与拆分版服务一致） ---------- */

export function formatJson(input: string, indent: JsonIndent = 2): string {
  return JSON.stringify(parseJson(input), null, indentValue(indent))
}

export function minifyJson(input: string): string {
  return JSON.stringify(parseJson(input))
}

/** RFC 4180 转义：包含引号/分隔符/换行的单元格用双引号包裹并把内部引号翻倍 */
export function escapeCsvCell(cell: unknown, delimiter: string): string {
  if (cell === null || cell === undefined) {
    return ''
  }
  const raw = typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
  if (raw.includes('"') || raw.includes(delimiter) || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

export function jsonToCsv(input: string, options: { delimiter: string }): string {
  const { delimiter } = options
  if (delimiter === '') {
    throw new Error('Delimiter must not be empty')
  }
  const data = parseJson(input)
  if (!Array.isArray(data)) {
    throw new Error('Input must be a JSON array of objects')
  }
  for (const item of data) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Every element of the array must be a JSON object')
    }
  }

  const records = data as Record<string, unknown>[]
  const keys: string[] = []
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }
  }

  const lines = [keys.map((key) => escapeCsvCell(key, delimiter)).join(delimiter)]
  for (const record of records) {
    lines.push(keys.map((key) => escapeCsvCell(record[key], delimiter)).join(delimiter))
  }
  return lines.join('\n')
}

export function formatSql(input: string): string {
  if (input.trim() === '') {
    return ''
  }
  try {
    return formatSqlLib(input, { language: 'sql', tabWidth: 2, keywordCase: 'upper' })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid SQL: ${reason}`, { cause: err })
  }
}

const XML_PARSER_OPTIONS = { ignoreAttributes: false, trimValues: true }

const XML_BUILDER_OPTIONS = {
  format: true,
  indentBy: '  ',
  ignoreAttributes: false,
  suppressEmptyNode: true,
}

export function formatXml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    const { msg, line, col } = validation.err
    throw new Error(`Invalid XML: ${msg} (line ${line}, column ${col})`)
  }

  let data: unknown
  try {
    data = new XMLParser(XML_PARSER_OPTIONS).parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid XML: ${reason}`, { cause: err })
  }

  return new XMLBuilder(XML_BUILDER_OPTIONS).build(data).trimEnd()
}

export function formatYaml(input: string): string {
  if (input.trim() === '') {
    return ''
  }
  let data: unknown
  try {
    data = parseYaml(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid YAML: ${reason}`, { cause: err })
  }
  return stringifyYaml(data, { indent: 2, lineWidth: 100 }).trimEnd()
}

/* ---------- 统一入口 ---------- */

export interface FormatterOptions {
  indent: JsonIndent
  delimiter: string
}

/** 按模式执行；空输入返回 ''，非法输入抛 Error（UI 层展示） */
export function runFormatter(
  mode: FormatterMode,
  input: string,
  options: FormatterOptions = { indent: 2, delimiter: ',' },
): string {
  if (input.trim() === '') {
    return ''
  }
  switch (mode) {
    case 'json-format':
      return formatJson(input, options.indent)
    case 'json-minify':
      return minifyJson(input)
    case 'json-to-csv':
      return jsonToCsv(input, { delimiter: options.delimiter })
    case 'sql-format':
      return formatSql(input)
    case 'xml-format':
      return formatXml(input)
    case 'yaml-format':
      return formatYaml(input)
    default:
      throw new Error(`Unknown formatter mode: ${mode satisfies never}`)
  }
}
