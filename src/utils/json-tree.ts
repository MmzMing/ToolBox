/**
 * JSON 树视图的纯逻辑：类型判定、路径语法、展开集合与搜索。
 *
 * 只处理可序列化数据，不碰 DOM 与 React。`components/json-viewer.tsx` 以及任何
 * 「把一段 JSON 当结构来看」的场景都复用这里，避免各处各写一套路径与遍历。
 */

export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'other'

/** 能写成 `root.a` 的键；其余走 `root["a-b"]` */
const IDENT = /^[A-Za-z_$][\w$]*$/

/** 单次搜索最多记录的命中数：粘贴整份日志时不至于把主线程算死 */
const MAX_MATCHES = 2000

export function jsonTypeOf(value: unknown): JsonValueType {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'string':
      return 'string'
    case 'number':
    case 'bigint':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'other'
  }
}

export function isJsonBranch(type: JsonValueType): boolean {
  return type === 'object' || type === 'array'
}

/** 分支的子项：数组给下标，对象给键；叶子为空 */
export function jsonEntriesOf(value: unknown): [string | number, unknown][] {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item])
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
  }
  return []
}

export function jsonChildPath(parent: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${parent}[${key}]`
  }
  return IDENT.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
}

/** `id` 是否落在 `ancestor` 这棵子树里（含自身） */
export function jsonWithin(ancestor: string, id: string): boolean {
  return id === ancestor || id.startsWith(`${ancestor}.`) || id.startsWith(`${ancestor}[`)
}

export function jsonPrimitiveText(value: unknown, type: JsonValueType): string {
  if (type === 'string') {
    return value as string
  }
  if (type === 'null') {
    return 'null'
  }
  return String(value)
}

/** 复制用的文本：字符串给裸值，分支给缩进两空格的 JSON，其余给字面量 */
export function jsonCopyText(value: unknown, type: JsonValueType): string {
  if (type === 'string') {
    return value as string
  }
  if (isJsonBranch(type)) {
    return JSON.stringify(value, null, 2)
  }
  return jsonPrimitiveText(value, type)
}

/**
 * 所有分支的路径；`depth` 限制只收集前若干层，用于「默认展开到第 N 层」。
 * `Infinity` 即全部展开。
 */
export function jsonBranchPaths(data: unknown, rootName: string, depth = Infinity): string[] {
  const out: string[] = []
  const visit = (value: unknown, id: string, level: number) => {
    if (level >= depth || !isJsonBranch(jsonTypeOf(value))) {
      return
    }
    out.push(id)
    for (const [key, child] of jsonEntriesOf(value)) {
      visit(child, jsonChildPath(id, key), level + 1)
    }
  }
  visit(data, rootName, 0)
  return out
}

export type JsonSearchResult = {
  /** 命中节点的路径，按遍历顺序，可作为「第 N 个匹配」的导航序列 */
  matches: string[]
  /** 命中节点的全部祖先，搜索时自动展开的就是这一批 */
  ancestors: Set<string>
  /** 祖先路径 -> 为了让命中可见该分支至少要展开到第几个子项 */
  needed: Map<string, number>
}

/** 命中判定：键名包含，或叶子值的文本包含（都忽略大小写） */
export function jsonSearch(data: unknown, rootName: string, needle: string): JsonSearchResult {
  const matches: string[] = []
  const ancestors = new Set<string>()
  const needed = new Map<string, number>()
  /** 当前遍历栈上的 (分支路径, 该分支内序号)，命中时整条栈都要展开 */
  const frames: [string, number][] = []

  const visit = (value: unknown, id: string, name: string | number | null) => {
    if (matches.length >= MAX_MATCHES) {
      return
    }
    const type = jsonTypeOf(value)
    const keyHit = typeof name === 'string' && name.toLowerCase().includes(needle)
    const valueHit =
      !isJsonBranch(type) && jsonPrimitiveText(value, type).toLowerCase().includes(needle)
    if (keyHit || valueHit) {
      matches.push(id)
      for (const [frame, index] of frames) {
        ancestors.add(frame)
        needed.set(frame, Math.max(needed.get(frame) ?? 0, index + 1))
      }
    }
    if (!isJsonBranch(type)) {
      return
    }
    jsonEntriesOf(value).forEach(([key, child], index) => {
      frames.push([id, index])
      visit(child, jsonChildPath(id, key), key)
      frames.pop()
    })
  }

  visit(data, rootName, null)
  return { matches, ancestors, needed }
}

/**
 * 宽松解析：不合法就返回 undefined，而不是抛错。
 * `undefined` 不是任何合法 JSON 的结果，所以可以安全当作「解析失败」的哨兵值。
 */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
