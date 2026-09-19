/** RFC 4180 转义：包含引号/分隔符/换行的单元格用双引号包裹并把内部引号翻倍 */
export function escapeCsvCell(cell: unknown, delimiter: string): string {
  if (cell === null || cell === undefined) {
    return ''
  }
  const raw = typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
  if (raw.includes('"') || raw.includes(delimiter) || raw.includes('\n') || raw.includes('\r')) {
    return `"${raw.replaceAll('"', '""')}"`
  }
  return raw
}

/**
 * 把 JSON 对象数组转换为 CSV：列为所有键的并集（按首次出现顺序），
 * 嵌套对象/数组 JSON.stringify，非数组输入或元素非普通对象抛 Error
 */
export function jsonToCsv(input: string, options: { delimiter: string }): string {
  const { delimiter } = options
  if (delimiter === '') {
    throw new Error('Delimiter must not be empty')
  }

  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON: ${reason}`, { cause: err })
  }
  if (!Array.isArray(data)) {
    throw new Error('Input must be a JSON array of objects')
  }
  for (const item of data) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Every element of the array must be a JSON object')
    }
  }

  const records = data as Record<string, unknown>[]
  const keys: string[] = []
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }
  }

  const lines = [keys.map((key) => escapeCsvCell(key, delimiter)).join(delimiter)]
  for (const record of records) {
    lines.push(keys.map((key) => escapeCsvCell(record[key], delimiter)).join(delimiter))
  }
  return lines.join('\n')
}
