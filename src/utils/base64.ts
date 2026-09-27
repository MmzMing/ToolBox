/** 分块 btoa，避免大数组一次性 String.fromCharCode 撑爆调用栈 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

/** 严格解析标准 base64（容忍换行等空白），非法输入抛错而非静默截断 */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/\s+/g, '')
  if (!BASE64_PATTERN.test(clean)) {
    throw new Error('base64: input contains characters outside the base64 alphabet')
  }
  if (clean.length % 4 !== 0) {
    throw new Error(`base64: expected a multiple of 4 characters, got ${clean.length}`)
  }
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** RFC 4648 §5 无填充 base64url，JWK 与 JWS 各字段的约定编码 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) {
    throw new Error('base64url: input contains characters outside the base64url alphabet')
  }
  return base64ToBytes(
    clean.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (clean.length % 4)) % 4),
  )
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`
}

export function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array<ArrayBuffer>
  mimeType: string
} {
  const [header, data] = dataUrl.split(',')
  const mimeType = header.slice(5, header.indexOf(';'))
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, mimeType }
}

/** base64 载荷解码后的字节数估算，用于配额与体积上限判断 */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    return 0
  }
  const payload = dataUrl.slice(comma + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}
