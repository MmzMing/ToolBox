import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'
import { marked } from 'marked'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml'

/* ---------- 各格式基础读写（语义与拆分版服务一致） ---------- */

/** YAML 取第一篇文档；空流返回 undefined，错误收集在 doc.errors */
function readYaml(input: string): unknown {
  const [doc] = parseAllDocuments(input)
  if (!doc) {
    return undefined
  }
  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message)
  }
  return doc.toJSON()
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }
}

function ensureObject(value: unknown, format: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${format} root must be an object`)
  }
  return value as Record<string, unknown>
}

const xmlParser = new XMLParser({ attributeNamePrefix: '@_', ignoreDeclaration: true })
const xmlBuilder = new XMLBuilder({
  format: true,
  indentBy: '  ',
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

/* ---------- 九种转换 ---------- */

export type ConversionId =
  | 'yaml-to-json'
  | 'json-to-yaml'
  | 'yaml-to-toml'
  | 'toml-to-yaml'
  | 'json-to-toml'
  | 'toml-to-json'
  | 'xml-to-json'
  | 'json-to-xml'
  | 'markdown-to-html'

export type ConversionGroup = 'YAML' | 'JSON' | 'TOML' | 'XML' | 'Markdown'

export interface ConversionDef {
  id: ConversionId
  /** 下拉分组 */
  group: ConversionGroup
  from: string
  to: string
  inputLanguage: string
  outputLanguage: string
  transform: (input: string) => string
}

export const conversions: readonly ConversionDef[] = [
  {
    id: 'yaml-to-json',
    group: 'YAML',
    from: 'YAML',
    to: 'JSON',
    inputLanguage: 'yaml',
    outputLanguage: 'json',
    transform: (input) => {
      if (input.trim() === '') return ''
      return JSON.stringify(readYaml(input) ?? null, null, 2)
    },
  },
  {
    id: 'json-to-yaml',
    group: 'JSON',
    from: 'JSON',
    to: 'YAML',
    inputLanguage: 'json',
    outputLanguage: 'yaml',
    transform: (input) => {
      if (input.trim() === '') return ''
      return stringifyYaml(parseJson(input), { indent: 2 })
    },
  },
  {
    id: 'yaml-to-toml',
    group: 'YAML',
    from: 'YAML',
    to: 'TOML',
    inputLanguage: 'yaml',
    outputLanguage: 'toml',
    transform: (input) => {
      if (input.trim() === '') return ''
      const value = readYaml(input)
      if (value === undefined || value === null) return stringifyToml({})
      return stringifyToml(ensureObject(value, 'YAML'))
    },
  },
  {
    id: 'toml-to-yaml',
    group: 'TOML',
    from: 'TOML',
    to: 'YAML',
    inputLanguage: 'toml',
    outputLanguage: 'yaml',
    transform: (input) => {
      if (input.trim() === '') return ''
      return stringifyYaml(parseToml(input), { indent: 2 })
    },
  },
  {
    id: 'json-to-toml',
    group: 'JSON',
    from: 'JSON',
    to: 'TOML',
    inputLanguage: 'json',
    outputLanguage: 'toml',
    transform: (input) => {
      if (input.trim() === '') return ''
      return stringifyToml(ensureObject(parseJson(input), 'JSON'))
    },
  },
  {
    id: 'toml-to-json',
    group: 'TOML',
    from: 'TOML',
    to: 'JSON',
    inputLanguage: 'toml',
    outputLanguage: 'json',
    transform: (input) => {
      if (input.trim() === '') return ''
      return JSON.stringify(parseToml(input), null, 2)
    },
  },
  {
    id: 'xml-to-json',
    group: 'XML',
    from: 'XML',
    to: 'JSON',
    inputLanguage: 'xml',
    outputLanguage: 'json',
    transform: (input) => {
      if (input.trim() === '') return ''
      const validation = XMLValidator.validate(input)
      if (validation !== true) {
        throw new Error(validation.err.msg)
      }
      return JSON.stringify(xmlParser.parse(input), null, 2)
    },
  },
  {
    id: 'json-to-xml',
    group: 'XML',
    from: 'JSON',
    to: 'XML',
    inputLanguage: 'json',
    outputLanguage: 'xml',
    transform: (input) => {
      if (input.trim() === '') return ''
      return xmlBuilder.build(ensureObject(parseJson(input), 'JSON'))
    },
  },
  {
    id: 'markdown-to-html',
    group: 'Markdown',
    from: 'Markdown',
    to: 'HTML',
    inputLanguage: 'markdown',
    outputLanguage: 'xml',
    transform: (input) => {
      if (input.trim() === '') return ''
      return marked.parse(input, { async: false, gfm: true, breaks: false }) as string
    },
  },
]

export function getConversion(id: string): ConversionDef {
  const def = conversions.find((item) => item.id === id)
  if (!def) {
    throw new Error(`Unknown conversion: ${id}`)
  }
  return def
}

/** 执行转换；空输入返回 ''，非法输入由各转换抛 Error */
export function runConversion(id: string, input: string): string {
  return getConversion(id).transform(input)
}

/** 下拉展示文案（语言中立）：YAML → JSON */
export function conversionLabel(def: ConversionDef): string {
  return `${def.from} → ${def.to}`
}
