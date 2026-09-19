import { stringify as stringifyToml } from 'smol-toml'

/** JSON → TOML；顶层必须是对象（TOML 文档即一张表），否则抛 Error，TOML 不支持的结构由 smol-toml 抛出 */
export function jsonToToml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON root must be an object to be represented as TOML')
  }

  return stringifyToml(value)
}
