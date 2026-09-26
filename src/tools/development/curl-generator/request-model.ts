export type Dialect = 'bash' | 'cmd' | 'powershell'
export type LineStyle = 'multiline' | 'single'
export type BodyKind = 'none' | 'json' | 'raw' | 'urlencoded' | 'form' | 'binary'
export type AuthKind = 'none' | 'basic' | 'bearer' | 'apikey' | 'digest'

export interface ParamRow {
  readonly id: string
  name: string
  value: string
  enabled: boolean
}
export interface HeaderRow {
  readonly id: string
  name: string
  value: string
  enabled: boolean
}
export interface FormFieldRow {
  readonly id: string
  name: string
  value: string
  /** value 是否为 `@path` / `<path` 形式的文件引用 */
  isFile: boolean
  enabled: boolean
}
export interface EncodedFieldRow {
  readonly id: string
  name: string
  value: string
  /** true 走 `--data-urlencode`，false 走 `-d`（值需调用方自行编码好） */
  encode: boolean
  enabled: boolean
}

export type RequestBody =
  | { kind: 'none' }
  | { kind: 'json'; text: string }
  | { kind: 'raw'; text: string; useDataRaw: boolean }
  | { kind: 'urlencoded'; fields: EncodedFieldRow[] }
  | { kind: 'form'; fields: FormFieldRow[] }
  | { kind: 'binary'; path: string }

export type RequestAuth =
  | { kind: 'none' }
  | { kind: 'basic'; user: string; password: string; via: 'option' | 'header' }
  | { kind: 'bearer'; token: string; via: 'option' | 'header' }
  | { kind: 'apikey'; name: string; value: string; in: 'header' | 'query' }
  | { kind: 'digest'; user: string; password: string }

/**
 * 已建模的开关与未识别的透传参数共用这一结构：`recognized` 只决定它落在 UI 的
 * 「高级开关」区还是「其他参数」区，生成时一律按 `flag` 的原样写法拼回。
 */
export interface OptionItem {
  readonly id: string
  /** 用户看到的写法，如 `-k` 或 `--insecure` */
  flag: string
  value?: string
  recognized: boolean
  enabled: boolean
}

export interface HttpRequestModel {
  dialect: Dialect
  lineStyle: LineStyle
  method: string
  url: string
  query: ParamRow[]
  fragment: string
  headers: HeaderRow[]
  body: RequestBody
  auth: RequestAuth
  options: OptionItem[]
  /** 无法归入选项的裸 token（例如粘贴内容里没有可执行名） */
  extras: string[]
}

const DIALECTS = ['bash', 'cmd', 'powershell'] as const
const LINE_STYLES = ['multiline', 'single'] as const
const BODY_KINDS = ['none', 'json', 'raw', 'urlencoded', 'form', 'binary'] as const
const AUTH_KINDS = ['none', 'basic', 'bearer', 'apikey', 'digest'] as const

let idSeed = 0

/** 行 id 仅在会话内唯一，供列表渲染与增删定位；不参与结构相等比较 */
export function newRowId(prefix = 'r'): string {
  idSeed += 1
  return `${prefix}${idSeed}`
}

export function createParamRow(name = '', value = ''): ParamRow {
  return { id: newRowId('q'), name, value, enabled: true }
}
export function createHeaderRow(name = '', value = ''): HeaderRow {
  return { id: newRowId('h'), name, value, enabled: true }
}
export function createFormFieldRow(name = '', value = '', isFile = false): FormFieldRow {
  return { id: newRowId('f'), name, value, isFile, enabled: true }
}
export function createEncodedFieldRow(name = '', value = '', encode = true): EncodedFieldRow {
  return { id: newRowId('e'), name, value, encode, enabled: true }
}
export function createOption(flag: string, value?: string, recognized = false): OptionItem {
  return { id: newRowId('o'), flag, value, recognized, enabled: true }
}

export function createEmptyModel(dialect: Dialect = 'bash'): HttpRequestModel {
  return {
    dialect,
    lineStyle: 'multiline',
    method: 'GET',
    url: '',
    query: [],
    fragment: '',
    headers: [],
    body: { kind: 'none' },
    auth: { kind: 'none' },
    options: [],
    extras: [],
  }
}

/** 抹掉行 id 后的规范化字符串，供「解析 → 生成 → 解析」这类结构相等断言 */
export function structuralKey(model: HttpRequestModel): string {
  const rows = (list: readonly { id: string }[]): unknown[] =>
    list.map((row) => {
      const { id: _omit, ...rest } = row
      return rest
    })
  const body =
    model.body.kind === 'form' || model.body.kind === 'urlencoded'
      ? { kind: model.body.kind, fields: rows(model.body.fields) }
      : { ...model.body }
  return JSON.stringify({
    dialect: model.dialect,
    lineStyle: model.lineStyle,
    method: model.method,
    url: model.url,
    fragment: model.fragment,
    query: rows(model.query),
    headers: rows(model.headers),
    body,
    auth: { ...model.auth },
    options: rows(model.options),
    extras: [...model.extras],
  })
}

function text(input: unknown, fallback = ''): string {
  return typeof input === 'string' ? input : fallback
}
function bool(input: unknown, fallback: boolean): boolean {
  return typeof input === 'boolean' ? input : fallback
}
function oneOf<T extends string>(input: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(input as T) ? (input as T) : fallback
}
function object(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}
function list(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) return []
  return input.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  )
}

/**
 * 校验来自 localStorage 或 URL hash 的不可信数据，字段缺失与类型不符时逐项兜底。
 * 完全不像请求模型时返回 null，由调用方决定怎么提示。
 */
export function normalizeModel(input: unknown): HttpRequestModel | null {
  const source = object(input)
  if (typeof source.url !== 'string' && typeof source.method !== 'string') return null

  const bodySource = object(source.body)
  const authSource = object(source.auth)

  return {
    dialect: oneOf(source.dialect, DIALECTS, 'bash'),
    lineStyle: oneOf(source.lineStyle, LINE_STYLES, 'multiline'),
    method: (text(source.method, 'GET') || 'GET').toUpperCase(),
    url: text(source.url),
    fragment: text(source.fragment),
    query: list(source.query).map((item) => ({
      id: newRowId('q'),
      name: text(item.name),
      value: text(item.value),
      enabled: bool(item.enabled, true),
    })),
    headers: list(source.headers).map((item) => ({
      id: newRowId('h'),
      name: text(item.name),
      value: text(item.value),
      enabled: bool(item.enabled, true),
    })),
    body: normalizeBody(bodySource),
    auth: normalizeAuth(authSource),
    options: list(source.options)
      .map((item) => ({
        id: newRowId('o'),
        flag: text(item.flag),
        value: typeof item.value === 'string' ? item.value : undefined,
        recognized: bool(item.recognized, false),
        enabled: bool(item.enabled, true),
      }))
      .filter((item) => item.flag !== ''),
    extras: Array.isArray(source.extras)
      ? source.extras.filter((item): item is string => typeof item === 'string' && item !== '')
      : [],
  }
}

function normalizeBody(source: Record<string, unknown>): RequestBody {
  switch (oneOf(source.kind, BODY_KINDS, 'none')) {
    case 'json':
      return { kind: 'json', text: text(source.text) }
    case 'raw':
      return { kind: 'raw', text: text(source.text), useDataRaw: bool(source.useDataRaw, true) }
    case 'urlencoded':
      return {
        kind: 'urlencoded',
        fields: list(source.fields).map((item) => ({
          id: newRowId('e'),
          name: text(item.name),
          value: text(item.value),
          encode: bool(item.encode, true),
          enabled: bool(item.enabled, true),
        })),
      }
    case 'form':
      return {
        kind: 'form',
        fields: list(source.fields).map((item) => ({
          id: newRowId('f'),
          name: text(item.name),
          value: text(item.value),
          isFile: bool(item.isFile, text(item.value).startsWith('@')),
          enabled: bool(item.enabled, true),
        })),
      }
    case 'binary':
      return { kind: 'binary', path: text(source.path) }
    default:
      return { kind: 'none' }
  }
}

function normalizeAuth(source: Record<string, unknown>): RequestAuth {
  switch (oneOf(source.kind, AUTH_KINDS, 'none')) {
    case 'basic':
      return {
        kind: 'basic',
        user: text(source.user),
        password: text(source.password),
        via: oneOf(source.via, ['option', 'header'] as const, 'option'),
      }
    case 'bearer':
      return {
        kind: 'bearer',
        token: text(source.token),
        via: oneOf(source.via, ['option', 'header'] as const, 'header'),
      }
    case 'apikey':
      return {
        kind: 'apikey',
        name: text(source.name),
        value: text(source.value),
        in: oneOf(source.in, ['header', 'query'] as const, 'header'),
      }
    case 'digest':
      return { kind: 'digest', user: text(source.user), password: text(source.password) }
    default:
      return { kind: 'none' }
  }
}
