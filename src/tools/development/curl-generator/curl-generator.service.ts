import { buildCurl, base64, toFetchPlan, type FetchPlan } from './build-curl'
import { parseCurl, splitUrl, type Issue, type ParseInput, type ParseResult } from './parse-curl'
import {
  createEmptyModel,
  createHeaderRow,
  type HttpRequestModel,
  type RequestBody,
} from './request-model'

export { buildCurl, base64, toFetchPlan }
export type { FetchPlan }
export { parseCurl }
export type { Issue, ParseInput, ParseResult }
export * from './request-model'
export { DIALECT_SPECS } from './dialect-escape'

const BODYLESS_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE']

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function bodyText(body: RequestBody): string {
  if (body.kind === 'json' || body.kind === 'raw') return body.text
  if (body.kind === 'binary') return body.path
  return ''
}

function contentTypeOf(model: HttpRequestModel): string | undefined {
  return model.headers
    .filter((header) => header.enabled)
    .find((header) => header.name.toLowerCase() === 'content-type')
    ?.value?.toLowerCase()
}

/**
 * 语义级校验：只报「curl 真跑起来会和你预期不一致」的问题，
 * 每条带 `field` 供 UI 点击定位。
 */
export function validateModel(model: HttpRequestModel): Issue[] {
  const issues: Issue[] = []

  if (model.url === '') {
    issues.push({ level: 'error', key: 'urlRequired', field: 'url' })
  } else {
    const probe = /^[a-z][a-z0-9+.-]*:\/\//i.test(model.url) ? model.url : `https://${model.url}`
    if (!safeUrl(probe))
      issues.push({ level: 'error', key: 'urlInvalid', detail: model.url, field: 'url' })
  }

  if (model.method === '') {
    issues.push({ level: 'error', key: 'methodRequired', field: 'method' })
  } else if (!/^[A-Z]+$/.test(model.method)) {
    issues.push({ level: 'warn', key: 'methodUnusual', detail: model.method, field: 'method' })
  }

  const hasBody =
    model.body.kind !== 'none' &&
    (model.body.kind === 'binary'
      ? model.body.path !== ''
      : bodyText(model.body) !== '' || countFields(model.body) > 0)
  if (hasBody && BODYLESS_METHODS.includes(model.method)) {
    issues.push({ level: 'warn', key: 'bodyWithMethodless', detail: model.method, field: 'method' })
  }
  if (model.body.kind !== 'none' && !hasBody) {
    issues.push({ level: 'warn', key: 'emptyBody', field: 'body' })
  }

  if (model.body.kind === 'json' && model.body.text.trim() !== '') {
    const type = contentTypeOf(model)
    if (type === undefined) {
      issues.push({ level: 'warn', key: 'jsonWithoutContentType', field: 'headers' })
    } else if (!type.includes('json')) {
      issues.push({ level: 'warn', key: 'contentTypeMismatch', detail: type, field: 'headers' })
    }
  }
  if (model.body.kind === 'form') {
    const type = contentTypeOf(model)
    if (type !== undefined && !type.includes('multipart')) {
      issues.push({ level: 'warn', key: 'contentTypeMismatch', detail: type, field: 'headers' })
    }
    for (const field of model.body.fields) {
      if (field.enabled && field.isFile && field.value === '') {
        issues.push({ level: 'warn', key: 'filePathMissing', detail: field.name, field: 'body' })
      }
    }
  }
  if (model.body.kind === 'urlencoded') {
    for (const field of model.body.fields) {
      if (field.enabled && !field.encode && /[&=]/.test(field.value)) {
        issues.push({
          level: 'warn',
          key: 'fieldValueNeedsEncoding',
          detail: field.name,
          field: 'body',
        })
      }
    }
  }

  const seen = new Map<string, string>()
  for (const header of model.headers) {
    if (!header.enabled) continue
    const lower = header.name.toLowerCase()
    if (header.name.trim() === '') {
      issues.push({ level: 'warn', key: 'headerNameMissing', field: 'headers' })
    }
    if (lower === 'host' || lower === 'content-length') {
      issues.push({ level: 'warn', key: 'headerDerived', detail: header.name, field: 'headers' })
    }
    const previous = seen.get(lower)
    if (previous !== undefined && previous !== header.value) {
      issues.push({ level: 'warn', key: 'duplicateHeader', detail: header.name, field: 'headers' })
    }
    seen.set(lower, header.value)
  }

  if (model.auth.kind === 'apikey' && model.auth.name.trim() === '') {
    issues.push({ level: 'warn', key: 'authNameMissing', field: 'auth' })
  }
  if ((model.auth.kind === 'basic' || model.auth.kind === 'digest') && model.auth.user === '') {
    issues.push({ level: 'warn', key: 'authUserMissing', field: 'auth' })
  }

  if (model.dialect === 'cmd') {
    const values = [
      ...model.headers.map((header) => `${header.name}: ${header.value}`),
      bodyText(model.body),
      ...model.query.map((row) => `${row.name}=${row.value}`),
    ]
    if (values.some((value) => hasControlChar(value))) {
      issues.push({ level: 'warn', key: 'cmdControlChars', field: 'output' })
    }
    if (values.some((value) => value.includes('%'))) {
      issues.push({ level: 'warn', key: 'cmdPercent', field: 'output' })
    }
  }

  return issues
}

function countFields(body: RequestBody): number {
  if (body.kind === 'form' || body.kind === 'urlencoded') {
    return body.fields.filter((field) => field.enabled).length
  }
  return 0
}

function safeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export type InputKind = 'curl' | 'httpMessage' | 'unknown'

/** 粘贴框里的东西可能是 curl，也可能是原始 HTTP 报文，先嗅探再分发 */
export function sniffInputKind(text: string): InputKind {
  const trimmed = text.trim()
  if (trimmed === '') return 'unknown'
  if (/(^|[\s;&(])curl(\.exe)?(\s|$)/i.test(trimmed)) return 'curl'
  const firstLine = trimmed.split('\n')[0].trim()
  if (/^[A-Z]{3,10}\s+\S+/.test(firstLine)) return 'httpMessage'
  return 'unknown'
}

const HTTP_METHOD_LINE = /^([A-Z]{3,10})\s+(\S+)(?:\s+HTTP\/\d(?:\.\d)?)?\s*$/

/** 解析浏览器 / 抓包工具导出的原始 HTTP 请求报文 */
export function parseHttpRequest(source: string, input: ParseInput = {}): ParseResult {
  const model = createEmptyModel(input.dialect)
  if (input.lineStyle) model.lineStyle = input.lineStyle
  const issues: Issue[] = []
  const normalized = source.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  const blank = normalized.indexOf('\n\n')
  const headSection = blank < 0 ? normalized : normalized.slice(0, blank)
  const bodySection = blank < 0 ? '' : normalized.slice(blank + 2)
  const lines = headSection.split('\n')
  const [requestLine, ...headerLines] = lines

  const match = HTTP_METHOD_LINE.exec(requestLine?.trim() ?? '')
  if (match === null) {
    issues.push({ level: 'error', key: 'malformedRequestLine', detail: requestLine })
    return { model, issues }
  }
  model.method = match[1].toUpperCase()
  const target = match[2]

  const headers = headerLines.filter((line) => line.trim() !== '')
  const parsed = headers.map((line) => {
    const colon = line.indexOf(':')
    return colon < 0
      ? { name: line.trim(), value: '' }
      : { name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() }
  })
  const host = parsed.find((header) => header.name.toLowerCase() === 'host')?.value
  if (host === undefined) {
    issues.push({ level: 'warn', key: 'hostHeaderMissing', field: 'url' })
  }
  model.url = (host === undefined || host === '' ? '' : `https://${host}`) + target
  model.headers = parsed
    .filter((header) => header.name.toLowerCase() !== 'host')
    .map((header) => createHeaderRow(header.name, header.value))

  if (bodySection !== '') {
    model.body = isJsonText(bodySection)
      ? { kind: 'json', text: bodySection }
      : { kind: 'raw', text: bodySection, useDataRaw: true }
  }
  if (host !== undefined) splitUrl(model, issues)
  return { model, issues }
}

function isJsonText(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

/** 统一入口：按嗅探结果分发，UI 不需要自己判断输入类型 */
export function parseAny(source: string, input: ParseInput = {}): ParseResult {
  return sniffInputKind(source) === 'httpMessage'
    ? parseHttpRequest(source, input)
    : parseCurl(source, input)
}
