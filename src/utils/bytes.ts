const HEX_DIGITS = '0123456789abcdef'

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) {
    out += HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 0x0f]
  }
  return out
}

/** 解析十六进制串，容忍空格、换行与 openssl 风格的冒号；非法字符或奇数长度抛错 */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/[\s:]/g, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean)) {
    const bad = clean.replace(/[0-9a-f]/g, '')[0]
    throw new Error(`hex: invalid character "${bad}"`)
  }
  if (clean.length % 2 !== 0) {
    throw new Error(`hex: expected an even number of digits, got ${clean.length}`)
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((byte, index) => byte === b[index])
}
