/** 文本 → \uXXXX（BMP）与 \u{XXXXXX}（增补平面）转义串 */
export function textToUnicodeEscapes(text: string): string {
  let result = ''
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) {
      continue
    }
    const hex = codePoint.toString(16).toUpperCase()
    result += codePoint <= 0xffff ? `\\u${hex.padStart(4, '0')}` : `\\u{${hex}}`
  }
  return result
}

/** 文本 → 十进制 HTML 实体（&#xxxx;，按码点展开） */
export function textToHtmlEntities(text: string): string {
  let result = ''
  for (const char of text) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) {
      continue
    }
    result += `&#${codePoint};`
  }
  return result
}

/** 转义串 → 文本：支持 \uXXXX 与 \u{XXXXXX}，其余字符原样保留；非法转义抛 Error */
export function unicodeEscapesToText(escaped: string): string {
  let result = ''
  let index = 0
  while (index < escaped.length) {
    const char = escaped[index]
    if (char !== '\\') {
      result += char
      index += 1
      continue
    }
    const rest = escaped.slice(index)
    const braced = /^\\u\{([0-9a-fA-F]{1,6})\}/.exec(rest)
    if (braced) {
      const codePoint = Number.parseInt(braced[1], 16)
      if (codePoint > 0x10ffff) {
        throw new Error(`Invalid Unicode escape: \\u{${braced[1]}}`)
      }
      result += String.fromCodePoint(codePoint)
      index += braced[0].length
      continue
    }
    const simple = /^\\u([0-9a-fA-F]{4})/.exec(rest)
    if (simple) {
      result += String.fromCharCode(Number.parseInt(simple[1], 16))
      index += simple[0].length
      continue
    }
    throw new Error(`Invalid Unicode escape sequence at position ${index}`)
  }
  return result
}

/** HTML 实体 → 文本：支持 &#xxxx;（十进制）与 &#xhhhh;（十六进制）；非法实体抛 Error */
export function htmlEntitiesToText(entities: string): string {
  let result = ''
  let index = 0
  while (index < entities.length) {
    const char = entities[index]
    if (char !== '&') {
      result += char
      index += 1
      continue
    }
    // 非 &# 开头的 & 按普通字符处理
    if (entities[index + 1] !== '#') {
      result += char
      index += 1
      continue
    }
    const match = /^&#(x[0-9a-fA-F]+|[0-9]+);/.exec(entities.slice(index))
    if (!match) {
      throw new Error(`Invalid HTML entity at position ${index}`)
    }
    const hex = match[1].toLowerCase().startsWith('x')
    const codePoint = hex ? Number.parseInt(match[1].slice(1), 16) : Number.parseInt(match[1], 10)
    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      throw new Error(`HTML entity code point out of range: ${match[1]}`)
    }
    result += String.fromCodePoint(codePoint)
    index += match[0].length
  }
  return result
}
