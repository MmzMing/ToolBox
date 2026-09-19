import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser'

const PARSER_OPTIONS = { ignoreAttributes: false, trimValues: true }

const BUILDER_OPTIONS = {
  format: true,
  indentBy: '  ',
  ignoreAttributes: false,
  suppressEmptyNode: true,
}

/** 美化与缩进 XML：解析后以 2 空格缩进重建；空输入原样返回，非法输入抛带行列信息的 Error */
export function formatXml(input: string): string {
  if (input.trim() === '') {
    return ''
  }

  const validation = XMLValidator.validate(input)
  if (validation !== true) {
    const { msg, line, col } = validation.err
    throw new Error(`Invalid XML: ${msg} (line ${line}, column ${col})`)
  }

  let data: unknown
  try {
    data = new XMLParser(PARSER_OPTIONS).parse(input)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid XML: ${reason}`, { cause: err })
  }

  return new XMLBuilder(BUILDER_OPTIONS).build(data).trimEnd()
}
