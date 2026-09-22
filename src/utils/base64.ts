/** 分块 btoa，避免大数组一次性 String.fromCharCode 撑爆调用栈 */
export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
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
