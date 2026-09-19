import { stringify as stringifyToml } from 'smol-toml'
import { parseAllDocuments } from 'yaml'

/** YAML → TOML；空文档视为空表；顶层非对象（数组/标量）时抛 Error，TOML 不支持的结构由 smol-toml 抛出 */
export function yamlToToml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  // 注释等空流不含文档；多文档输入只取第一篇，错误收集在 doc.errors
  const [doc] = parseAllDocuments(input)
  if (!doc) {
    return stringifyToml({})
  }
  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message)
  }

  const value = doc.toJSON()
  if (value === null || value === undefined) {
    return stringifyToml({})
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('YAML root must be an object to be represented as TOML')
  }

  return stringifyToml(value)
}
