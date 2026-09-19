import { jwtDecode } from 'jwt-decode'

/* ---------------------------------- Base64 --------------------------------- */

/** 字符串 → Base64（UTF-8 安全，等价 it-tools 的 btoa 实现） */
export function encodeToBase64(plain: string): string {
  const bytes = new TextEncoder().encode(plain)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

/** Base64 → 字符串；非法 Base64 输入抛 Error，由 UI 层展示 */
export function decodeFromBase64(base64: string): string {
  const normalized = base64.replaceAll(/\s/g, '')
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/* ------------------------------------ JWT ---------------------------------- */

export type JwtParts = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  /** 原始签名段（base64url，未做解码） */
  signature: string
}

export type JwtClaimInfo = {
  key: string
  value: string
  kind: 'date' | 'plain'
}

/** 识别为秒级时间戳的标准 JWT 声明 */
const dateClaims = ['exp', 'iat', 'nbf'] as const

/** 标量直接转字符串，对象/数组 JSON 序列化（兜底 String） */
function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  const json = JSON.stringify(value)
  return json ?? String(value)
}

/** 解码 JWT：header 用 jwtDecode({ header: true })，payload 常规解码；非法输入抛 Error */
export function decodeJwt(token: string): JwtParts {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 3 || parts[0] === '' || parts[1] === '') {
    throw new Error('Invalid JWT: expected 3 dot-separated base64url parts')
  }
  try {
    const header = jwtDecode<Record<string, unknown>>(trimmed, { header: true })
    const payload = jwtDecode<Record<string, unknown>>(trimmed)
    return { header, payload, signature: parts[2] ?? '' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JWT: ${reason}`, { cause: err })
  }
}

/**
 * 分析 payload 声明：exp/iat/nbf（有限数字）识别为日期并转 ISO 字符串，
 * 其余声明原样转为展示字符串，顺序与 payload 键序一致
 */
export function analyseJwtClaims(payload: Record<string, unknown>): JwtClaimInfo[] {
  return Object.entries(payload).map(([key, value]) => {
    const isDate =
      (dateClaims as readonly string[]).includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    if (isDate) {
      return { key, value: new Date(value * 1000).toISOString(), kind: 'date' as const }
    }
    return { key, value: toDisplayValue(value), kind: 'plain' as const }
  })
}

/** 判断 JWT 是否已过期：无 exp 或 exp 非有限数字返回 null；nowMs 可注入便于测试 */
export function isJwtExpired(
  payload: Record<string, unknown>,
  nowMs: number = Date.now(),
): boolean | null {
  const exp = payload['exp']
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return null
  }
  return nowMs >= exp * 1000
}

/** 从 header 读取 alg 声明，缺失或非字符串返回 null */
export function getJwtAlgorithm(header: Record<string, unknown>): string | null {
  const alg = header['alg']
  return typeof alg === 'string' && alg !== '' ? alg : null
}

/* ------------------------------------ URL ---------------------------------- */

export const urlEncodeModes = ['component', 'uri'] as const

export type UrlEncodeMode = (typeof urlEncodeModes)[number]

/** 编码 URL：component 模式用 encodeURIComponent（编码所有保留字符），uri 模式用 encodeURI（保留 URL 结构字符） */
export function encodeUrl(text: string, mode: UrlEncodeMode): string {
  return mode === 'uri' ? encodeURI(text) : encodeURIComponent(text)
}

/** 解码 URL 编码文本，非法百分号序列（如 '%E0%A4%A'）抛 Error */
export function decodeUrl(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid URL-encoded input: ${reason}`, { cause: err })
  }
}

/* --------------------------------- Unicode --------------------------------- */

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

/* ---------------------------------- 二进制 --------------------------------- */

/** 文本 → 空格分隔的 8 位二进制串（UTF-8 字节） */
export function textToBinary(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(2).padStart(8, '0'),
  ).join(' ')
}

/** 文本 → 空格分隔的两位十六进制串（UTF-8 字节，小写） */
export function textToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join(' ')
}

/** 二进制 → 文本：容忍空格分隔与 8 位连续串；非法字符或长度非 8 的倍数抛 Error */
export function binaryToText(binary: string): string {
  const bits = binary.replaceAll(/\s+/g, '')
  if (bits === '') {
    return ''
  }
  if (!/^[01]+$/.test(bits)) {
    throw new Error('Invalid binary input: only 0, 1 and whitespace are allowed')
  }
  if (bits.length % 8 !== 0) {
    throw new Error('Invalid binary input: bit count must be a multiple of 8')
  }
  const bytes = new Uint8Array(bits.length / 8)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** 十六进制 → 文本：容忍空格分隔与连续串；非法字符或长度非偶数抛 Error */
export function hexToText(hex: string): string {
  const cleaned = hex.replaceAll(/\s+/g, '')
  if (cleaned === '') {
    return ''
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid hex input: only hexadecimal digits and whitespace are allowed')
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex input: digit count must be even')
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}
