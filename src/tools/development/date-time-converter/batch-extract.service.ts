/**
 * 批量时间戳提取：把 JSON / YAML / XML / 纯文本里的时间值找出来，归一化成
 * 可排序、可算间隔的时间点。纯逻辑，零 DOM / React 依赖。
 *
 * 识别口径只有两条：
 * - 数字：整数部分 10 / 13 / 16 / 19 位分别按秒 / 毫秒 / 微秒 / 纳秒解释，
 *   换算后必须落在 1995–2100 之间，否则当成编号丢掉；
 * - 字符串：整体匹配 ISO-8601 形态（日期、日期时间、可选时区）才认。
 *
 * 字段名是否带时间语义（`_at`、`expiresAt`、`time`…）不参与判定，只作为
 * 「疑似」标记与过滤依据——10 位数字与订单号、手机号同形，靠位数区分不了。
 */
import { readStructured, structuredFormats, type StructuredFormat } from '@/utils/format-convert'

import { formatLocalDateTime } from './service'

/** 可选的输入格式：auto 走探测，text 强制逐行扫描 */
export type InputFormat = 'auto' | StructuredFormat | 'text'
export const inputFormats: readonly InputFormat[] = ['auto', ...structuredFormats, 'text']

/** 探测不出结构时按纯文本处理 */
export type DetectedFormat = StructuredFormat | 'text'

export type TimestampUnit = 's' | 'ms' | 'us' | 'ns'
export type TimeValueKind = 'unix' | 'iso'

export interface TimeField {
  /** 字段路径，如 `order.items[1].added_to_cart`；纯文本里是行内键名，取不到为空串 */
  path: string
  /** 原始文本，原样回显 */
  raw: string
  kind: TimeValueKind
  /** 数字时间戳的单位；ISO 字符串没有单位 */
  unit: TimestampUnit | null
  /** 归一化到毫秒，微秒 / 纳秒来源会带小数 */
  ms: number
  local: string
  iso: string
  /** 路径里是否出现了时间语义词 */
  named: boolean
  /** 纯文本模式下的行号（1 起），结构化模式为 null */
  line: number | null
}

export interface ExtractResult {
  format: DetectedFormat
  fields: TimeField[]
  /** 命中数超过上限：结果不完整，UI 必须提示而不是让用户以为只有这些 */
  truncated: boolean
}

/** 换算后允许落下的时间窗，超出这个范围的位数组合基本不是时间 */
const MIN_PLAUSIBLE_MS = Date.UTC(1995, 0, 1)
const MAX_PLAUSIBLE_MS = Date.UTC(2100, 0, 1)

/** 位数 → 单位：秒 10 位、毫秒 13 位、微秒 16 位、纳秒 19 位 */
const UNIT_BY_DIGITS: Record<number, TimestampUnit> = { 10: 's', 13: 'ms', 16: 'us', 19: 'ns' }
const MS_PER_UNIT: Record<TimestampUnit, number> = { s: 1e3, ms: 1, us: 1e-3, ns: 1e-6 }

/** 单次提取的结果上限：日志类输入动辄上万命中，不设上限会拖死主线程 */
export const MAX_EXTRACTED_FIELDS = 500

/** 递归深度上限，防御畸形嵌套 */
const MAX_DEPTH = 64

const NUMBER_TEXT = /^[+-]?\d+(?:\.\d+)?$/
const ISO_TEXT =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const TIME_WORD =
  /(?:^|[^a-z0-9])(?:at|time|timestamp|ts|date|datetime|dt|epoch|unix|stamp|created|updated|deleted|modified|expired|expires|published|started|ended|finished|login|logout|deadline|due)(?:[^a-z0-9]|$)/
/** 数字前面挂着键名（`created_at=170600180`、`"ts": 170600180`）时把它当路径 */
const TRAILING_KEY = /([A-Za-z_][\w.-]*)["']?\s*[:=]\s*$/
/** 行内 token：ISO 串优先，其次整词数字；两侧不粘单词字符，避免切进长编号 */
const TOKEN =
  /(?<![\w])(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?)(?![\w])|(?<![\w])([+-]?\d+(?:\.\d+)?)(?![\w])/g

/** 路径 / 键名里是否出现了时间语义词（先按驼峰拆下划线，再整词匹配） */
export function isTimeNamedKey(key: string): boolean {
  const snake = key
    .replace(/^@_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
  return TIME_WORD.test(`.${snake}.`)
}

function plausible(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_PLAUSIBLE_MS && ms <= MAX_PLAUSIBLE_MS
}

/** 把一个标量文本判成时间点；不像时间就返回 null */
export function classifyValue(
  path: string,
  raw: string,
  line: number | null = null,
): TimeField | null {
  const value = raw.trim()
  if (value === '') {
    return null
  }
  const named = isTimeNamedKey(path)
  const date = (ms: number, unit: TimestampUnit | null, kind: TimeValueKind): TimeField => {
    const full = new Date(ms)
    return {
      path,
      raw: value,
      kind,
      unit,
      ms,
      local: formatLocalDateTime(full),
      iso: full.toISOString(),
      named,
      line,
    }
  }

  if (ISO_TEXT.test(value)) {
    const ms = Date.parse(value.replace(',', '.'))
    return plausible(ms) ? date(ms, null, 'iso') : null
  }
  if (NUMBER_TEXT.test(value)) {
    const num = Number(value)
    const unit = UNIT_BY_DIGITS[String(Math.trunc(Math.abs(num))).length]
    if (unit === undefined) {
      return null
    }
    const ms = num * MS_PER_UNIT[unit]
    return plausible(ms) ? date(ms, unit, 'unix') : null
  }
  return null
}

/** 依次尝试 XML（仅尖括号开头）、JSON、YAML，取第一个读出容器的格式 */
export function detectStructured(
  text: string,
): { format: StructuredFormat; value: unknown } | null {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }
  const order: StructuredFormat[] = []
  if (trimmed.startsWith('<')) {
    order.push('xml')
  }
  if (/^[[{]/.test(trimmed)) {
    order.push('json')
  }
  order.push('yaml')

  for (const format of order) {
    try {
      const value = readStructured(format, trimmed)
      if (value !== null && typeof value === 'object') {
        return { format, value }
      }
    } catch {
      // 换下一种格式再试
    }
  }
  return null
}

function walk(value: unknown, path: string, depth: number, hits: TimeField[]): void {
  if (hits.length > MAX_EXTRACTED_FIELDS || depth > MAX_DEPTH) {
    return
  }
  if (value instanceof Date) {
    push(classifyValue(path, value.toISOString()), hits)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, `${path}[${index}]`, depth + 1, hits)
    })
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [rawKey, item] of Object.entries(value as Record<string, unknown>)) {
      // XML 属性带的 `@_` 前缀只是内部寻址，展示路径还原成可读键名
      const key = rawKey.startsWith('@_') ? rawKey.slice(2) : rawKey
      walk(item, path === '' ? key : `${path}.${key}`, depth + 1, hits)
    }
    return
  }
  if (typeof value === 'string' || typeof value === 'number') {
    push(classifyValue(path, String(value)), hits)
  }
}

function push(field: TimeField | null, hits: TimeField[]): void {
  if (field) {
    hits.push(field)
  }
}

function collect(value: unknown): TimeField[] {
  const hits: TimeField[] = []
  walk(value, '', 0, hits)
  return hits
}

/** 逐行扫描：抓整词数字与 ISO 串，键名能从 `key=` / `"key":` 里带出来就带上 */
export function extractFromText(text: string): TimeField[] {
  const hits: TimeField[] = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    if (hits.length > MAX_EXTRACTED_FIELDS) {
      break
    }
    const line = lines[index] ?? ''
    TOKEN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TOKEN.exec(line)) !== null) {
      const raw = match[1] ?? match[2] ?? ''
      const path = TRAILING_KEY.exec(line.slice(0, match.index))?.[1] ?? ''
      push(classifyValue(path, raw, index + 1), hits)
      if (hits.length > MAX_EXTRACTED_FIELDS) {
        break
      }
    }
  }
  return hits
}

/** 提取入口：auto 走探测，探测不出结构退回逐行扫描；显式格式内容非法时抛 Error */
export function extractTimeFields(input: string, format: InputFormat = 'auto'): ExtractResult {
  const text = input.trim()
  if (text === '') {
    return { format: 'text', fields: [], truncated: false }
  }

  if (format === 'text') {
    return finish('text', extractFromText(text))
  }
  if (format === 'auto') {
    const detected = detectStructured(text)
    return detected
      ? finish(detected.format, collect(detected.value))
      : finish('text', extractFromText(text))
  }

  return finish(format, collect(readStructured(format, text)))
}

function finish(format: DetectedFormat, hits: TimeField[]): ExtractResult {
  return {
    format,
    fields: hits.slice(0, MAX_EXTRACTED_FIELDS),
    truncated: hits.length > MAX_EXTRACTED_FIELDS,
  }
}

export type SortMode = 'time' | 'path'

/** 按时间升序（同刻按路径），或按路径自然序（`items[2]` 排在 `items[10]` 前） */
export function sortFields(fields: readonly TimeField[], mode: SortMode): TimeField[] {
  const byPath = (a: TimeField, b: TimeField) =>
    a.path.localeCompare(b.path, undefined, { numeric: true })
  return [...fields].sort((a, b) =>
    mode === 'time' ? a.ms - b.ms || byPath(a, b) : byPath(a, b) || a.ms - b.ms,
  )
}

export type DurationUnit = 'd' | 'h' | 'm' | 's' | 'ms'
export interface DurationPart {
  value: number
  unit: DurationUnit
}

const DURATIONS: readonly [DurationUnit, number][] = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
  ['ms', 1],
]

/** 把毫秒差拆成展示片段（最多 maxParts 段，全零时给 0 毫秒） */
export function diffParts(ms: number, maxParts = 3): DurationPart[] {
  let rest = Math.abs(Math.round(ms))
  const parts: DurationPart[] = []
  for (const [unit, size] of DURATIONS) {
    if (parts.length >= maxParts) {
      break
    }
    const value = Math.floor(rest / size)
    if (value > 0) {
      parts.push({ value, unit })
      rest -= value * size
    }
  }
  return parts.length > 0 ? parts : [{ value: 0, unit: 'ms' }]
}

/** 首尾跨度 */
export function spanMs(fields: readonly TimeField[]): number {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const field of fields) {
    min = Math.min(min, field.ms)
    max = Math.max(max, field.ms)
  }
  return fields.length < 2 ? 0 : max - min
}

export type CopyFormat = 'json' | 'tsv'

/** 结果导出：JSON 给程序，TSV 给表格软件 */
export function serializeFields(fields: readonly TimeField[], format: CopyFormat): string {
  if (format === 'json') {
    return JSON.stringify(
      fields.map((field) => ({
        path: field.path,
        value: field.raw,
        unit: field.unit,
        local: field.local,
        iso: field.iso,
      })),
      null,
      2,
    )
  }
  const rows = fields.map((field) =>
    [field.path, field.raw, field.unit ?? '', field.local, field.iso].join('\t'),
  )
  return ['path\tvalue\tunit\tlocal\tiso', ...rows].join('\n')
}
