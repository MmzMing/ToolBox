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
