/** 把请求模型压进 URL hash 用 base64url；跨工具复用，故放在 utils */
function bytesToBinary(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return binary
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff
  return bytes
}

export function toBase64Url(text: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function fromBase64Url(value: string): string | null {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return new TextDecoder().decode(binaryToBytes(atob(padded)))
  } catch {
    return null
  }
}

/** 分享链接里的请求负载；版本号便于日后模型字段变更时拒绝旧链接 */
const SHARE_VERSION = 1

export function encodeSharePayload(data: unknown): string {
  return toBase64Url(JSON.stringify({ v: SHARE_VERSION, d: data }))
}

/** 解码失败或版本不符时返回 null，调用方静默忽略即可，不要抛错 */
export function decodeSharePayload(hash: string): unknown | null {
  const match = /[#&]req=([^&]+)/.exec(hash)
  if (match === null) return null
  const json = fromBase64Url(match[1])
  if (json === null) return null
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const envelope = parsed as { v?: unknown; d?: unknown }
    if (envelope.v !== SHARE_VERSION) return null
    return envelope.d ?? null
  } catch {
    return null
  }
}

/**
 * 判断负载里是否可能出现凭据：分享前据此要求用户确认，
 * 避免把 token / Cookie 顺手粘进聊天工具。
 */
export function payloadLooksSensitive(data: unknown): boolean {
  const json = JSON.stringify(data ?? null)?.toLowerCase() ?? ''
  return (
    json.includes('authorization') ||
    json.includes('cookie') ||
    json.includes('"-u"') ||
    json.includes('"--user"') ||
    json.includes('"oauth2-bearer"') ||
    json.includes('"apikey"') ||
    json.includes('proxy-user')
  )
}

/** 链接过长时浏览器与 IM 都可能截断，提前提醒 */
export const SHARE_LENGTH_WARN = 1800
