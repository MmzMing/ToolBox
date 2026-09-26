import { DIALECT_SPECS, joinArguments, quoteFor, type DialectSpec } from './dialect-escape'
import {
  createHeaderRow,
  createParamRow,
  type HeaderRow,
  type HttpRequestModel,
  type ParamRow,
} from './request-model'

/** basic 认证走请求头时要 base64；不引依赖，手写标准字母表 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const remaining = Math.min(3, bytes.length - i)
    out += B64[(chunk >> 18) & 63] + B64[(chunk >> 12) & 63]
    out += remaining > 1 ? B64[(chunk >> 6) & 63] : '='
    out += remaining > 2 ? B64[chunk & 63] : '='
  }
  return out
}

export function encodeQueryValue(value: string): string {
  return encodeURIComponent(value)
}

/** query 行与 fragment 拼回完整 URL；认证注入的行通过 extraQuery 传入，不改入参 */
export function assembleUrl(model: HttpRequestModel, extraQuery: readonly ParamRow[] = []): string {
  const rows = [...model.query, ...extraQuery].filter(
    (row) => row.enabled && row.name.trim() !== '',
  )
  const query = rows
    .map((row) => `${encodeQueryValue(row.name)}=${encodeQueryValue(row.value)}`)
    .join('&')
  const base = model.url + (query === '' ? '' : `?${query}`)
  return model.fragment === '' ? base : `${base}#${model.fragment}`
}

/** GET 无请求体、POST 有请求体时 curl 自己就能推出来，不必写 -X */
function needsExplicitMethod(model: HttpRequestModel): boolean {
  if (model.method === '') return false
  const implied = model.body.kind === 'none' ? 'GET' : 'POST'
  return model.method !== implied
}

interface AuthPlan {
  flag?: string
  flagValue?: string
  /** 认证以 `--digest` 这类机制开关的形式补写 */
  mechanismFlag?: string
  headers: HeaderRow[]
  query: ParamRow[]
}

function planAuth(model: HttpRequestModel): AuthPlan {
  const auth = model.auth
  const plan: AuthPlan = { headers: [], query: [] }
  switch (auth.kind) {
    case 'basic':
      if (auth.via === 'header') {
        plan.headers.push(
          createHeaderRow('Authorization', `Basic ${base64(`${auth.user}:${auth.password}`)}`),
        )
      } else {
        plan.flag = '-u'
        plan.flagValue = `${auth.user}:${auth.password}`
      }
      break
    case 'digest':
      plan.flag = '-u'
      plan.flagValue = `${auth.user}:${auth.password}`
      plan.mechanismFlag = '--digest'
      break
    case 'bearer':
      if (auth.via === 'header') {
        plan.headers.push(createHeaderRow('Authorization', `Bearer ${auth.token}`))
      } else {
        plan.flag = '--oauth2-bearer'
        plan.flagValue = auth.token
      }
      break
    case 'apikey':
      if (auth.in === 'header') plan.headers.push(createHeaderRow(auth.name, auth.value))
      else plan.query.push(createParamRow(auth.name, auth.value))
      break
    default:
      break
  }
  return plan
}

/** flag 与它的值必须落在同一个片段里，否则续行符会插到中间 */
function pushFlag(parts: string[], spec: DialectSpec, written: string, value?: string) {
  parts.push(value === undefined ? written : `${written} ${quoteFor(spec, value)}`)
}

function buildBodyParts(parts: string[], spec: DialectSpec, model: HttpRequestModel) {
  const body = model.body
  switch (body.kind) {
    case 'json':
      if (body.text !== '') pushFlag(parts, spec, '--data-raw', body.text)
      break
    case 'raw':
      if (body.text !== '') {
        pushFlag(parts, spec, body.useDataRaw ? '--data-raw' : '-d', body.text)
      }
      break
    case 'binary':
      if (body.path !== '') pushFlag(parts, spec, '--data-binary', `@${body.path}`)
      break
    case 'urlencoded': {
      const fields = body.fields.filter((field) => field.enabled && field.name.trim() !== '')
      const plain = fields.filter((field) => !field.encode)
      const encoded = fields.filter((field) => field.encode)
      if (plain.length > 1) {
        pushFlag(parts, spec, '-d', plain.map((field) => `${field.name}=${field.value}`).join('&'))
      } else {
        for (const field of plain) pushFlag(parts, spec, '-d', `${field.name}=${field.value}`)
      }
      for (const field of encoded) {
        pushFlag(parts, spec, '--data-urlencode', `${field.name}=${field.value}`)
      }
      break
    }
    case 'form':
      for (const field of body.fields.filter((item) => item.enabled && item.name.trim() !== '')) {
        pushFlag(parts, spec, '-F', `${field.name}=${field.isFile ? '@' : ''}${field.value}`)
      }
      break
    default:
      break
  }
}

export function buildCurl(model: HttpRequestModel): string {
  // 没有地址时不输出 `curl ''` 这种半成品，让 UI 显示占位提示
  if (model.url.trim() === '') return ''
  const spec = DIALECT_SPECS[model.dialect]
  const plan = planAuth(model)
  // 可执行名与 URL 同行，续行只发生在它们之后
  const parts: string[] = [`${spec.executable} ${quoteFor(spec, assembleUrl(model, plan.query))}`]

  if (model.method === 'HEAD' && model.body.kind === 'none') parts.push('-I')
  else if (needsExplicitMethod(model)) {
    // 方法名是纯字母时不必加引号，读起来和 DevTools 的产物一致
    parts.push(
      /^[A-Za-z]+$/.test(model.method)
        ? `-X ${model.method}`
        : `-X ${quoteFor(spec, model.method)}`,
    )
  }

  for (const header of [...model.headers, ...plan.headers].filter(
    (item) => item.enabled && item.name.trim() !== '',
  )) {
    pushFlag(parts, spec, '-H', `${header.name}: ${header.value}`)
  }

  if (plan.flag !== undefined) pushFlag(parts, spec, plan.flag, plan.flagValue)
  if (plan.mechanismFlag !== undefined) parts.push(plan.mechanismFlag)

  buildBodyParts(parts, spec, model)

  for (const option of model.options.filter((item) => item.enabled)) {
    pushFlag(parts, spec, option.flag, option.value)
  }
  for (const extra of model.extras) {
    parts.push(quoteFor(spec, extra))
  }

  return joinArguments(parts, spec, model.lineStyle === 'multiline')
}

/**
 * 浏览器会静默丢弃这批请求头（fetch 的 forbidden header names）。
 * 「发送」前必须剔除并如实告知，否则用户以为线上请求和 curl 一样。
 */
const FORBIDDEN_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'date',
  'expect',
  'host',
  'keep-alive',
  'name',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
])

export interface FetchPlan {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  formData?: FormData
  /** 跳过的受限请求头名 */
  skippedHeaders: string[]
  /** 无法在浏览器里等价复现的部分，按 issue key 报告给 UI */
  warnings: string[]
}

/** 模型 → fetch 参数。纯函数，副作用（真正发请求）留在 use-curl-sender */
export function toFetchPlan(model: HttpRequestModel): FetchPlan {
  const plan = planAuth(model)
  const warnings: string[] = []
  const headers: Record<string, string> = {}
  const skippedHeaders: string[] = []

  for (const header of [...model.headers, ...plan.headers].filter((item) => item.enabled)) {
    if (FORBIDDEN_HEADERS.has(header.name.toLowerCase())) {
      skippedHeaders.push(header.name)
      continue
    }
    headers[header.name] = header.value
  }
  if (model.auth.kind === 'digest') warnings.push('digestUnsupported')

  const body = model.body
  let text: string | undefined
  let formData: FormData | undefined
  if (model.method !== 'GET' && model.method !== 'HEAD') {
    switch (body.kind) {
      case 'json':
      case 'raw':
        text = body.text === '' ? undefined : body.text
        break
      case 'urlencoded': {
        const fields = body.fields.filter((field) => field.enabled)
        if (fields.length > 0) {
          const params = new URLSearchParams()
          for (const field of fields) params.append(field.name, field.value)
          text = params.toString()
          headers['Content-Type'] ??= 'application/x-www-form-urlencoded'
        }
        break
      }
      case 'form': {
        formData = new FormData()
        for (const field of body.fields.filter((item) => item.enabled)) {
          if (field.isFile) {
            warnings.push('fileFieldSkipped')
            continue
          }
          formData.append(field.name, field.value)
        }
        break
      }
      case 'binary':
        warnings.push('binaryBodySkipped')
        break
      default:
        break
    }
  }

  return {
    method: model.method,
    url: assembleUrl(model, plan.query),
    headers,
    ...(text === undefined ? {} : { body: text }),
    ...(formData === undefined ? {} : { formData }),
    skippedHeaders,
    warnings,
  }
}
