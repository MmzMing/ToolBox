import { ShellSyntaxError, splitShellCommands } from '@/utils/shell-tokenize'

import { CURL_FLAGS, SHORT_TO_LONG, resolveLongFlag } from './curl-flags'
import {
  createEmptyModel,
  createEncodedFieldRow,
  createFormFieldRow,
  createHeaderRow,
  createOption,
  createParamRow,
  type Dialect,
  type EncodedFieldRow,
  type FormFieldRow,
  type HeaderRow,
  type HttpRequestModel,
  type LineStyle,
  type OptionItem,
  type ParamRow,
} from './request-model'

/** `key` 供 UI 查 i18n 文案，`detail` 是面向排障的技术串 */
export interface Issue {
  readonly level: 'error' | 'warn'
  readonly key: string
  readonly detail?: string
  readonly field?: string
}

export interface ParseResult {
  model: HttpRequestModel
  issues: Issue[]
}

/** 一个已归一的选项：`long` 为规范长名，表里没有时为 null */
export interface FlagPair {
  long: string | null
  /** 用户原本的写法，透传时一字不差还原 */
  written: string
  value?: string
  /** 长选项是否以 `--flag=value` 等号形式书写 */
  inline?: boolean
}

export interface ParseInput {
  dialect?: Dialect
  lineStyle?: LineStyle
}

type BodyFamily = 'text' | 'encoded' | 'multipart'

const FAMILY_OF: Readonly<Record<string, BodyFamily>> = {
  data: 'text',
  'data-ascii': 'text',
  'data-raw': 'text',
  'data-binary': 'text',
  json: 'text',
  'data-urlencode': 'encoded',
  form: 'multipart',
  'form-string': 'multipart',
}

const AUTH_MECHANISM_FLAG: Readonly<Record<string, string>> = {
  digest: '--digest',
  ntlm: '--ntlm',
  negotiate: '--negotiate',
  any: '--anyauth',
}

function isKnownLong(name: string): name is keyof typeof CURL_FLAGS {
  return Object.prototype.hasOwnProperty.call(CURL_FLAGS, name)
}

/** token 流 → 规范化的 (flag, value) 对；不做任何业务解释 */
export function collectFlagPairs(tokens: readonly string[]): {
  pairs: FlagPair[]
  issues: Issue[]
} {
  const pairs: FlagPair[] = []
  const issues: Issue[] = []
  let optionsEnded = false
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    if (optionsEnded || !token.startsWith('-') || token === '-') {
      pairs.push({ long: null, written: '', value: token === '-' ? '' : token })
      i += 1
      continue
    }
    if (token === '--') {
      optionsEnded = true
      i += 1
      continue
    }

    if (token.startsWith('--')) {
      const body = token.slice(2)
      const eq = body.indexOf('=')
      const rawName = eq < 0 ? body : body.slice(0, eq)
      const long = isKnownLong(rawName) ? rawName : resolveLongFlag(rawName)
      if (long === null || !isKnownLong(long)) {
        pairs.push({ long: null, written: token, value: eq < 0 ? undefined : body.slice(eq + 1) })
        i += 1
        continue
      }
      if (!CURL_FLAGS[long].value) {
        pairs.push({ long, written: `--${long}` })
        i += 1
        continue
      }
      if (eq >= 0) {
        pairs.push({ long, written: `--${long}`, value: body.slice(eq + 1), inline: true })
        i += 1
        continue
      }
      const value = tokens[i + 1]
      if (value === undefined) {
        issues.push({ level: 'error', key: 'missingOptionValue', detail: `--${long}` })
      } else {
        pairs.push({ long, written: `--${long}`, value })
      }
      i += 2
      continue
    }

    // 短选项簇：`-sSL` 逐个展开，`-XPOST` / `-dvalue` 取剩余部分为值
    const cluster = token.slice(1)
    let handled = false
    for (let j = 0; j < cluster.length; j += 1) {
      const ch = cluster[j]
      const long = SHORT_TO_LONG[ch]
      if (long === undefined || !isKnownLong(long)) {
        pairs.push({ long: null, written: token })
        handled = true
        break
      }
      if (!CURL_FLAGS[long].value) {
        pairs.push({ long, written: `-${ch}` })
        continue
      }
      const rest = cluster.slice(j + 1)
      if (rest !== '') {
        pairs.push({ long, written: `-${ch}`, value: rest })
      } else {
        const value = tokens[i + 1]
        if (value === undefined) {
          issues.push({ level: 'error', key: 'missingOptionValue', detail: `-${ch}` })
        } else {
          pairs.push({ long, written: `-${ch}`, value })
        }
        i += 1
      }
      handled = true
      break
    }
    if (!handled) issues.push({ level: 'error', key: 'missingOptionValue', detail: token })
    i += 1
  }

  return { pairs, issues }
}

interface Builder {
  model: HttpRequestModel
  issues: Issue[]
  explicitMethod: string | null
  asGet: boolean
  /** 三族请求体互斥，后来者覆盖前者 */
  family: BodyFamily | null
  textItems: { flag: string; value: string }[]
  encodedItems: string[]
  multipartItems: string[]
  user?: string
  mechanism: string | null
  bearer?: string
}

export function applyFlagPairs(
  pairs: readonly FlagPair[],
  model: HttpRequestModel,
  issues: Issue[],
): HttpRequestModel {
  const state: Builder = {
    model,
    issues,
    explicitMethod: null,
    asGet: false,
    family: null,
    textItems: [],
    encodedItems: [],
    multipartItems: [],
    mechanism: null,
  }

  for (const pair of pairs) {
    if (pair.long === null) {
      collectUnknown(pair, state)
      continue
    }
    const value = pair.value ?? ''
    switch (pair.long) {
      case 'request':
        state.explicitMethod = value.toUpperCase()
        break
      case 'url':
        model.url = value
        break
      case 'head':
        state.explicitMethod ??= 'HEAD'
        break
      case 'get':
        state.asGet = true
        break
      case 'header':
        pushHeader(value, model.headers, issues)
        break
      case 'user':
        state.user = value
        break
      case 'basic':
        state.mechanism ??= 'basic'
        break
      case 'digest':
      case 'ntlm':
      case 'negotiate':
      case 'anyauth':
        state.mechanism = pair.long === 'anyauth' ? 'any' : pair.long
        break
      case 'oauth2-bearer':
        state.bearer = value
        break
      case 'next':
        issues.push({ level: 'warn', key: 'onlyFirstRequest' })
        return seal(state)
      default:
        if (pair.long in FAMILY_OF) collectBody(pair.long, value, state)
        else model.options.push(toOption(pair))
    }
  }
  return seal(state)
}

function collectUnknown(pair: FlagPair, state: Builder) {
  if (pair.written === '') {
    const value = pair.value ?? ''
    if (value === '') return
    if (state.model.url === '') state.model.url = value
    else state.model.extras.push(value)
    return
  }
  state.model.options.push(createOption(pair.written, pair.value, false))
  state.issues.push({ level: 'warn', key: 'unrecognizedOption', detail: pair.written })
}

function toOption(pair: FlagPair): OptionItem {
  if (pair.inline && pair.value !== undefined) {
    return createOption(`${pair.written}=${pair.value}`, undefined, true)
  }
  return createOption(pair.written, pair.value, true)
}

function collectBody(flag: string, value: string, state: Builder) {
  const family = FAMILY_OF[flag]
  if (state.family !== null && state.family !== family) {
    state.issues.push({
      level: 'warn',
      key: 'bodyTypeOverridden',
      detail: `${state.family} → ${family}`,
      field: 'body',
    })
    state.textItems = []
    state.encodedItems = []
    state.multipartItems = []
  }
  state.family = family
  if (family === 'text') state.textItems.push({ flag, value })
  else if (family === 'encoded') state.encodedItems.push(value)
  else state.multipartItems.push(value)
}

function seal(state: Builder): HttpRequestModel {
  const { model, issues } = state
  model.method =
    state.explicitMethod ?? (state.asGet ? 'GET' : state.family === null ? 'GET' : 'POST')

  if (state.asGet && (state.textItems.length > 0 || state.encodedItems.length > 0)) {
    moveBodyIntoQuery(state)
  } else {
    applyBody(state)
  }
  applyAuth(state)
  splitUrl(model, issues)

  if (model.method === 'GET' && model.body.kind !== 'none') {
    issues.push({ level: 'warn', key: 'getBodyWithGet', field: 'method' })
  }
  if (model.url === '') issues.push({ level: 'warn', key: 'missingUrl', field: 'url' })
  return model
}

function applyBody(state: Builder) {
  const { model, issues } = state
  if (state.family === null) return

  if (state.family === 'multipart') {
    model.body = {
      kind: 'form',
      fields: state.multipartItems.map((item) => parseMultipartItem(item, issues)),
    }
    return
  }

  if (state.family === 'encoded') {
    const fields: EncodedFieldRow[] = []
    for (const item of state.encodedItems) {
      const eq = item.indexOf('=')
      if (eq > 0) {
        fields.push(createEncodedFieldRow(item.slice(0, eq), item.slice(eq + 1), true))
      } else {
        model.options.push(createOption('--data-urlencode', item, true))
        issues.push({ level: 'warn', key: 'dataUrlencodeShape', detail: item, field: 'body' })
      }
    }
    model.body = { kind: 'urlencoded', fields }
    return
  }

  const joined = state.textItems.map((item) => item.value).join('&')
  const usedJson = state.textItems.some((item) => item.flag === 'json')
  const usedBinaryOnly = state.textItems.every((item) => item.flag === 'data-binary')
  const safeForPlainData = state.textItems.every(
    (item) => item.flag === 'data' || item.flag === 'data-ascii',
  )

  if (usedBinaryOnly && joined.startsWith('@')) {
    model.body = { kind: 'binary', path: joined.slice(1) }
    return
  }
  if (usedJson || looksLikeJson(joined)) {
    model.body = { kind: 'json', text: joined }
    return
  }
  if (isFlatForm(joined)) {
    const fields: EncodedFieldRow[] = []
    for (const part of joined.split('&')) {
      const eq = part.indexOf('=')
      fields.push(createEncodedFieldRow(part.slice(0, eq), part.slice(eq + 1), false))
    }
    model.body = { kind: 'urlencoded', fields }
    return
  }
  model.body = { kind: 'raw', text: joined, useDataRaw: !safeForPlainData }
  if (joined.startsWith('@') || joined.startsWith('<')) {
    issues.push({ level: 'warn', key: 'dataFileReference', field: 'body' })
  }
}

/**
 * 整串形如 `a=1&b=2` 时 `-d` 与 `--data-raw` 等价，可以按表单字段展开编辑；
 * 含换行、制表符或以 `@` 开头时不行，curl 会改变语义。
 */
export function isFlatForm(joined: string): boolean {
  if (joined === '' || joined.startsWith('@') || joined.startsWith('<')) return false
  if (hasControlChar(joined)) return false
  return joined.split('&').every((part) => {
    const eq = part.indexOf('=')
    return eq > 0 && !part.startsWith('@')
  })
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function looksLikeJson(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function parseMultipartItem(item: string, issues: Issue[]): FormFieldRow {
  const eq = item.indexOf('=')
  if (eq < 0) {
    issues.push({ level: 'warn', key: 'malformedFormField', detail: item, field: 'body' })
    return createFormFieldRow(item, '', false)
  }
  const raw = item.slice(eq + 1)
  // `@path` 交给 curl 读文件；模型里只存路径，`@` 由生成器补回
  if (raw.startsWith('@')) return createFormFieldRow(item.slice(0, eq), raw.slice(1), true)
  return createFormFieldRow(item.slice(0, eq), raw, false)
}

function applyAuth(state: Builder) {
  const { model, issues } = state
  if (state.bearer !== undefined) {
    model.auth = { kind: 'bearer', token: state.bearer, via: 'option' }
    return
  }
  if (state.user === undefined) {
    if (state.mechanism !== null && state.mechanism !== 'basic') {
      model.options.push(createOption(AUTH_MECHANISM_FLAG[state.mechanism], undefined, true))
    }
    return
  }
  const colon = state.user.indexOf(':')
  if (colon < 0) {
    model.auth = { kind: 'basic', user: state.user, password: '', via: 'option' }
    issues.push({ level: 'warn', key: 'userWithoutPassword', field: 'auth' })
    return
  }
  const user = state.user.slice(0, colon)
  const password = state.user.slice(colon + 1)
  model.auth =
    state.mechanism === 'digest'
      ? { kind: 'digest', user, password }
      : { kind: 'basic', user, password, via: 'option' }
  if (state.mechanism !== null && state.mechanism !== 'basic' && state.mechanism !== 'digest') {
    model.options.push(createOption(AUTH_MECHANISM_FLAG[state.mechanism], undefined, true))
  }
}

function moveBodyIntoQuery(state: Builder) {
  const raw =
    state.family === 'encoded'
      ? state.encodedItems.join('&')
      : state.textItems.map((item) => item.value).join('&')
  state.model.body = { kind: 'none' }
  pushQueryString(raw, state.model.query, state.issues)
  state.issues.push({ level: 'warn', key: 'getMovedBodyToQuery', field: 'query' })
}

function pushHeader(raw: string, headers: HeaderRow[], issues: Issue[]) {
  const colon = raw.indexOf(':')
  if (colon < 0) {
    headers.push(createHeaderRow(raw.trim(), ''))
    issues.push({ level: 'warn', key: 'headerWithoutColon', detail: raw, field: 'headers' })
    return
  }
  const name = raw.slice(0, colon).trim()
  const value = raw.slice(colon + 1).trim()
  // `-H ': Name'` 是 curl 8.10 起「按名字移除响应头」的写法，这里按普通名字保留
  headers.push(createHeaderRow(name === '' ? value : name, name === '' ? '' : value))
}

function pushQueryString(query: string, rows: ParamRow[], issues: Issue[]) {
  for (const part of query.split('&')) {
    if (part === '') continue
    const eq = part.indexOf('=')
    const rawKey = eq < 0 ? part : part.slice(0, eq)
    const rawValue = eq < 0 ? '' : part.slice(eq + 1)
    if (rawKey.includes('+') || rawValue.includes('+')) {
      issues.push({ level: 'warn', key: 'plusInQuery', detail: part })
    }
    rows.push(createParamRow(decodePart(rawKey), decodePart(rawValue)))
  }
}

/** 拆出 query 行与 fragment，让左侧面板可逐条编辑 */
export function splitUrl(model: HttpRequestModel, issues: Issue[]) {
  if (model.url === '') return
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(model.url)) {
    model.url = `https://${model.url}`
    issues.push({ level: 'warn', key: 'schemeAdded', detail: 'https', field: 'url' })
  }
  const hashAt = model.url.indexOf('#')
  if (hashAt >= 0) {
    model.fragment = model.url.slice(hashAt + 1)
    model.url = model.url.slice(0, hashAt)
  }
  const qMark = model.url.indexOf('?')
  if (qMark < 0) return
  const query = model.url.slice(qMark + 1)
  model.url = model.url.slice(0, qMark)
  pushQueryString(query, model.query, issues)
}

function decodePart(value: string): string {
  if (!value.includes('%') && !value.includes('+')) return value
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

function isCurlCommand(argv: readonly string[]): boolean {
  return /(^|[\\/])curl(\.exe)?$/i.test(argv[0] ?? '')
}

/**
 * 行尾的 `^`（cmd）与反引号（PowerShell）是续行符。它们只在「该行就此结束」时成立，
 * 所以合并必须先于分词——否则分词器会把反引号当成命令替换直接报错。
 */
function joinWrappedLines(text: string): string {
  return text.replace(/(?:\^|`)[ \t]*\r?\n[ \t]*/g, ' ')
}

export function parseCurl(source: string, input: ParseInput = {}): ParseResult {
  const model = createEmptyModel(input.dialect)
  if (input.lineStyle) model.lineStyle = input.lineStyle
  const trimmed = joinWrappedLines(source.trim())
  if (trimmed.trim() === '') {
    return { model, issues: [{ level: 'error', key: 'emptyInput' }] }
  }

  let argv: string[] | undefined
  try {
    const commands = splitShellCommands(trimmed)
    argv = commands.find(isCurlCommand) ?? commands[0]
  } catch (error) {
    if (error instanceof ShellSyntaxError) {
      return {
        model,
        issues: [
          {
            level: 'error',
            key: 'shellSyntax',
            detail: `${error.message} (${error.line}:${error.column})`,
          },
        ],
      }
    }
    throw error
  }
  if (argv === undefined) {
    return { model, issues: [{ level: 'error', key: 'noCurlCommand' }] }
  }

  const { pairs, issues } = collectFlagPairs(argv.slice(1))
  const collected: Issue[] = [...issues]
  if (!isCurlCommand(argv)) {
    collected.unshift({ level: 'warn', key: 'commandMayNotBeCurl', detail: argv[0] })
  }
  applyFlagPairs(pairs, model, collected)
  return { model, issues: collected }
}
