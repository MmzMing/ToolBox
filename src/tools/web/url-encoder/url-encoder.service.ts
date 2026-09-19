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
