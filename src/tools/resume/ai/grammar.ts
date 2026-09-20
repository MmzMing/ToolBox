import { parseJsonPayload } from './transport'

export type GrammarError = {
  context: string
  text: string
  suggestion: string
  reason: string
  type: 'spelling' | 'punctuation' | 'grammar'
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntity(raw: string): string | null {
  if (raw.startsWith('&#x') || raw.startsWith('&#X')) {
    const code = Number.parseInt(raw.slice(3, -1), 16)
    return Number.isFinite(code) ? String.fromCodePoint(code) : null
  }
  if (raw.startsWith('&#')) {
    const code = Number.parseInt(raw.slice(2, -1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : null
  }
  return NAMED_ENTITIES[raw.slice(1, -1).toLowerCase()] ?? null
}

/**
 * 把 HTML 摊成纯文本视图，并记录每个字符对应回原串的区间。
 *
 * 模型给的是渲染后可见的纯文本，字段存的却是 HTML：直接对 HTML 做字符串替换会
 * 撞上 `&amp;` 这类实体（长度不等）以及 `<strong>` 这类标签（可能替换进标签内部）。
 */
export function plainTextView(html: string) {
  const chars: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let index = 0

  while (index < html.length) {
    const char = html[index]
    if (char === '<') {
      const close = html.indexOf('>', index)
      if (close === -1) {
        // 未闭合的 '<'：后面的内容按标签处理，直接结束
        break
      }
      index = close + 1
      continue
    }
    if (char === '&') {
      const semi = html.indexOf(';', index)
      if (semi !== -1 && semi - index <= 10) {
        const decoded = decodeEntity(html.slice(index, semi + 1))
        if (decoded) {
          for (const out of decoded) {
            chars.push(out)
            starts.push(index)
            ends.push(semi + 1)
          }
          index = semi + 1
          continue
        }
      }
    }
    chars.push(char)
    starts.push(index)
    ends.push(index + 1)
    index += 1
  }

  return { text: chars.join(''), starts, ends }
}

/** 在纯文本空间里替换，映射回原 HTML；找不到返回 null */
export function replacePlainText(html: string, find: string, replace: string): string | null {
  if (!find) {
    return null
  }
  const view = plainTextView(html)
  const at = view.text.indexOf(find)
  if (at === -1) {
    return null
  }
  const from = view.starts[at]
  const to = view.ends[at + find.length - 1]
  if (from === undefined || to === undefined) {
    return null
  }
  return `${html.slice(0, from)}${escapeHtml(replace)}${html.slice(to)}`
}

/**
 * 对单个字段值应用一条校对结果。
 *
 * 优先用 context 锚定（把整句里的错词换掉再整体替换），未命中才退化成全局替换，
 * 且沿用旧项目的门槛：短于 3 个字符的错误词不做全局替换，免得误伤。
 */
export function applyGrammarErrorToHtml(html: string, error: GrammarError): string | null {
  if (error.context && error.context.includes(error.text)) {
    const at = error.context.indexOf(error.text)
    const patchedContext = `${error.context.slice(0, at)}${error.suggestion}${error.context.slice(
      at + error.text.length,
    )}`
    const byContext = replacePlainText(html, error.context, patchedContext)
    if (byContext !== null) {
      return byContext
    }
  }
  if (error.text.length > 2) {
    return replacePlainText(html, error.text, error.suggestion)
  }
  return null
}

/** 这些键不参与文本替换：id 与图片 base64 改了会破坏数据，图标名是组件标识 */
const UNTOUCHABLE_KEYS = new Set([
  'id',
  'photo',
  'icon',
  'key',
  'createdAt',
  'updatedAt',
  'templateId',
  'activeSection',
  'fieldOrder',
])

function applyToValue(value: unknown, error: GrammarError): [unknown, boolean] {
  if (typeof value === 'string') {
    const next = applyGrammarErrorToHtml(value, error)
    return next === null ? [value, false] : [next, true]
  }
  if (Array.isArray(value)) {
    let applied = false
    const next = value.map((item) => {
      if (applied) {
        return item
      }
      const [replaced, hit] = applyToValue(item, error)
      applied = hit
      return replaced
    })
    return [next, applied]
  }
  if (value && typeof value === 'object') {
    let applied = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (applied || UNTOUCHABLE_KEYS.has(key)) {
        next[key] = item
        continue
      }
      const [replaced, hit] = applyToValue(item, error)
      applied = hit
      next[key] = replaced
    }
    return [next, applied]
  }
  return [value, false]
}

/** 整份简历里第一处命中的字段被改，其余原样返回；与旧项目「一路改到底」不同，避免连带误伤 */
export function applyGrammarError<T>(data: T, error: GrammarError): { data: T; applied: boolean } {
  const [next, applied] = applyToValue(data, error)
  return { data: next as T, applied }
}

const TYPES = new Set(['spelling', 'punctuation', 'grammar'])

/** 模型偶尔会把 type 写成中文或漏掉，统一收进联合类型 */
function normalizeType(value: unknown): GrammarError['type'] {
  return typeof value === 'string' && TYPES.has(value)
    ? (value as GrammarError['type'])
    : 'spelling'
}

export function parseGrammarErrors(content: string): GrammarError[] {
  const payload = parseJsonPayload(content)
  const errors = Array.isArray((payload as { errors?: unknown })?.errors)
    ? (payload as { errors: unknown[] }).errors
    : []

  return (
    errors
      .map((item) => {
        const entry = (item ?? {}) as Record<string, unknown>
        const read = (key: string) =>
          typeof entry[key] === 'string' ? (entry[key] as string).trim() : ''
        return {
          context: read('context'),
          text: read('text'),
          suggestion: read('suggestion'),
          reason: read('reason'),
          type: normalizeType(entry.type),
        }
      })
      // 没有原文或没有建议的条目无法应用，直接丢
      .filter((item) => item.text && item.suggestion)
  )
}
