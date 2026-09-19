import { XMLBuilder } from 'fast-xml-parser'

// 直接以 JSON 对象为根构建 XML；数组输出为重复标签；@_ 前缀键渲染为属性
const builder = new XMLBuilder({
  format: true,
  indentBy: '  ',
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

/** JSON → XML；顶层必须是对象，否则抛 Error 由 UI 展示 */
export function jsonToXml(input: string): string {
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
    throw new Error('JSON root must be an object to be represented as XML')
  }

  return builder.build(value)
}
