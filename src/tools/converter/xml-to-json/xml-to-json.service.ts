import { XMLParser, XMLValidator } from 'fast-xml-parser'

// 其余选项走库默认（ignoreAttributes 默认 true，即忽略属性）
const parser = new XMLParser({ attributeNamePrefix: '@_', ignoreDeclaration: true })

/** XML → JSON（2 空格缩进）；先经 XMLValidator 校验，非法 XML 抛 Error 由 UI 展示 */
export function xmlToJson(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    throw new Error(validation.err.msg)
  }

  return JSON.stringify(parser.parse(input), null, 2)
}
