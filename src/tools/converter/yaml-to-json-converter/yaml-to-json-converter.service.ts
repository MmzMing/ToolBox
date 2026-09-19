import { parseAllDocuments } from 'yaml'

/** YAML → JSON：多文档取第一篇；空输入返回 ''；解析失败抛 Error 由 UI 展示 */
export function yamlToJson(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  // 注释等空流不含文档；多文档输入只取第一篇，错误收集在 doc.errors
  const [doc] = parseAllDocuments(input)
  if (!doc) {
    return ''
  }
  if (doc.errors.length > 0) {
    throw new Error(doc.errors[0].message)
  }

  return JSON.stringify(doc.toJSON() ?? null, null, 2)
}
