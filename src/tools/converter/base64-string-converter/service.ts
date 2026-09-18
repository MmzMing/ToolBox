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
