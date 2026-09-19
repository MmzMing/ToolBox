/** 常用命名实体表（~20 个），未收录的非 ASCII 字符回退为十进制数字实体 */
const namedEntities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '\u00a0': '&nbsp;',
  '©': '&copy;',
  '®': '&reg;',
  '™': '&trade;',
  '…': '&hellip;',
  '—': '&mdash;',
  '–': '&ndash;',
  '‘': '&lsquo;',
  '’': '&rsquo;',
  '“': '&ldquo;',
  '”': '&rdquo;',
  '«': '&laquo;',
  '»': '&raquo;',
  '×': '&times;',
  '÷': '&divide;',
  '·': '&middot;',
  '°': '&deg;',
  '±': '&plusmn;',
  '€': '&euro;',
  '£': '&pound;',
  '¥': '&yen;',
}

const reverseNamedEntities: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(namedEntities).map(([char, entity]) => [entity.slice(1, -1), char]),
)

const entityPattern = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z][a-zA-Z0-9]*));/g

/** HTML 实体编码：五个 XML 保留字符 + 常用命名实体 + 非 ASCII 转十进制数字实体 */
export function encodeHtmlEntities(text: string): string {
  let result = ''
  for (const char of text) {
    const named = namedEntities[char]
    if (named !== undefined) {
      result += named
      continue
    }
    const codePoint = char.codePointAt(0) ?? 0
    result += codePoint > 127 ? `&#${codePoint};` : char
  }
  return result
}

/** HTML 实体解码：支持命名实体与十进制/十六进制数字实体，未知命名实体抛 Error */
export function decodeHtmlEntities(text: string): string {
  return text.replace(entityPattern, (match, hex?: string, decimal?: string, name?: string) => {
    if (hex !== undefined) {
      return String.fromCodePoint(Number.parseInt(hex, 16))
    }
    if (decimal !== undefined) {
      return String.fromCodePoint(Number.parseInt(decimal, 10))
    }
    const char = reverseNamedEntities[name ?? '']
    if (char === undefined) {
      throw new Error(`Unknown HTML entity: ${match}`)
    }
    return char
  })
}
