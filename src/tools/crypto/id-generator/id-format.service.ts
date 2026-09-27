/** 批量上限对齐同类工具（tools.top 1–1000），1000 条走只读 textarea 渲染 */
export const ID_COUNT_RANGE = { min: 1, max: 1000 } as const

export const ID_FORMATS = ['default', 'upper', 'lower', 'raw', 'braces', 'urn'] as const

export type IdFormat = (typeof ID_FORMATS)[number]

export const ID_JOINS = ['newline', 'comma', 'quoted', 'jsonArray'] as const

export type IdJoin = (typeof ID_JOINS)[number]

/** UUID 在业界有五种写法；ULID 定长无分隔符，只有大小写之分 */
export const UUID_FORMATS: readonly IdFormat[] = ['default', 'upper', 'raw', 'braces', 'urn']
export const ULID_FORMATS: readonly IdFormat[] = ['default', 'lower']

/** 数量收敛到 [1, 1000]；NaN / Infinity 落到下限，小数向下取整 */
export function clampCount(count: number): number {
  if (!Number.isFinite(count)) {
    return ID_COUNT_RANGE.min
  }
  return Math.min(ID_COUNT_RANGE.max, Math.max(ID_COUNT_RANGE.min, Math.floor(count)))
}

/**
 * 单个 ID 的表示形式。`default` 原样保留（UUID 天生小写、ULID 天生大写），
 * 其余只改大小写或加包装，不动字符内容。
 */
export function applyFormat(value: string, format: IdFormat): string {
  switch (format) {
    case 'default':
      return value
    case 'upper':
      return value.toUpperCase()
    case 'lower':
      return value.toLowerCase()
    case 'raw':
      return value.replaceAll('-', '')
    case 'braces':
      return `{${value}}`
    case 'urn':
      return `urn:uuid:${value}`
  }
}

/** 多条 ID 的拼接形态：换行 / 逗号 / 逗号加引号 / JSON 数组 */
export function joinIds(values: readonly string[], join: IdJoin): string {
  switch (join) {
    case 'newline':
      return values.join('\n')
    case 'comma':
      return values.join(', ')
    case 'quoted':
      return values.map((value) => `"${value}"`).join(', ')
    case 'jsonArray':
      return JSON.stringify(values, null, 2)
  }
}

/** 生成结果 → 输出文本，三个面板共用的一条管道 */
export function renderIds(values: readonly string[], format: IdFormat, join: IdJoin): string {
  return joinIds(
    values.map((value) => applyFormat(value, format)),
    join,
  )
}
