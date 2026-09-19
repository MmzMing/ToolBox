export const jsonDiffTypes = ['added', 'removed', 'changed'] as const

export type JsonDiffType = (typeof jsonDiffTypes)[number]

export interface JsonDiffEntry {
  /** 点号路径（数组下标直接拼接，如 'items.0.name'）；根级差异为 '(root)' */
  path: string
  type: JsonDiffType
  /** 变更前的展示值（added 时缺省） */
  left?: string
  /** 变更后的展示值（removed 时缺省） */
  right?: string
}

/** 根级差异的路径占位（纯技术记号，非文案） */
const ROOT_PATH = '(root)'

function parseSide(raw: string, side: 'A' | 'B'): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in ${side}: ${reason}`, { cause: err })
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 值的展示形式：字符串原样，其余 JSON 序列化（对象/数组/数字/布尔/null） */
function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  const json = JSON.stringify(value)
  return json ?? String(value)
}

function diffWalk(a: unknown, b: unknown, path: string, out: JsonDiffEntry[]): void {
  if (isPlainObject(a) && isPlainObject(b)) {
    // 键序稳定：先 A 的键，再 B 新增的键
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    for (const key of keys) {
      const childPath = path === '' ? key : `${path}.${key}`
      if (!(key in a)) {
        out.push({ path: childPath, type: 'added', right: toDisplayValue(b[key]) })
      } else if (!(key in b)) {
        out.push({ path: childPath, type: 'removed', left: toDisplayValue(a[key]) })
      } else {
        diffWalk(a[key], b[key], childPath, out)
      }
    }
    return
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    // 数组按下标逐一对比
    const length = Math.max(a.length, b.length)
    for (let index = 0; index < length; index += 1) {
      const childPath = path === '' ? String(index) : `${path}.${index}`
      if (index >= a.length) {
        out.push({ path: childPath, type: 'added', right: toDisplayValue(b[index]) })
      } else if (index >= b.length) {
        out.push({ path: childPath, type: 'removed', left: toDisplayValue(a[index]) })
      } else {
        diffWalk(a[index], b[index], childPath, out)
      }
    }
    return
  }

  if (!Object.is(a, b)) {
    out.push({
      path: path === '' ? ROOT_PATH : path,
      type: 'changed',
      left: toDisplayValue(a),
      right: toDisplayValue(b),
    })
  }
}

/**
 * 对比两个 JSON 文本：递归对象（键并集）与数组（下标），
 * 输出 added/removed/changed 行级差异列表；JSON 非法时抛 Error
 */
export function diffJson(a: string, b: string): JsonDiffEntry[] {
  const left = parseSide(a, 'A')
  const right = parseSide(b, 'B')
  const entries: JsonDiffEntry[] = []
  diffWalk(left, right, '', entries)
  return entries
}
