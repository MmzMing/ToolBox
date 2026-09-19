export type ListTransformOptions = {
  /** 单行连接时的分隔符 */
  separator: string
  dedupe: boolean
  sort: boolean
  reverse: boolean
  lowercase: boolean
  uppercase: boolean
  removeEmpty: boolean
  trim: boolean
}

export type ListTransformResult = {
  lines: string[]
  joined: string
}

/** 处理顺序：trim → 去空行 → 大小写（同开时大写生效）→ 去重 → 排序 → 反转 */
export function transformList(input: string, options: ListTransformOptions): ListTransformResult {
  let items = input.split('\n')
  if (options.trim) {
    items = items.map((item) => item.trim())
  }
  if (options.removeEmpty) {
    items = items.filter((item) => item !== '')
  }
  if (options.lowercase) {
    items = items.map((item) => item.toLowerCase())
  }
  if (options.uppercase) {
    items = items.map((item) => item.toUpperCase())
  }
  if (options.dedupe) {
    items = [...new Set(items)]
  }
  if (options.sort) {
    items = [...items].sort()
  }
  if (options.reverse) {
    items = [...items].reverse()
  }
  return { lines: items, joined: items.join(options.separator) }
}
