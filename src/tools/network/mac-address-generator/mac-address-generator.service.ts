/**
 * 随机 MAC 地址批量生成（纯逻辑，零 DOM/React 依赖）。
 */

export type MacSeparator = ':' | '-' | ''

export const macSeparators = [':', '-', ''] as const

export const MAC_COUNT_RANGE = { min: 1, max: 100 } as const

/** 前缀最多 10 个 hex 字符（5 字节），保证至少留 1 个随机字节 */
const PREFIX_HEX_MAX = 10

export interface MacGeneratorOptions {
  count: number
  /** OUI 前缀，如 '00:1A:2B'；空/undefined 表示完全随机 */
  prefix?: string
  separator: MacSeparator
  uppercase: boolean
}

/** 解析前缀为连续 hex 串（偶数长度且不超过 5 字节），非法抛 Error */
function parsePrefixHex(prefix: string | undefined): string {
  if (prefix === undefined || prefix.trim() === '') {
    return ''
  }
  const hex = prefix.replaceAll(/[:.\s-]/g, '').toUpperCase()
  if (!/^[0-9A-F]+$/.test(hex) || hex.length > PREFIX_HEX_MAX || hex.length % 2 !== 0) {
    throw new Error(`Invalid MAC prefix: "${prefix}"`)
  }
  return hex
}

function formatMac(bytes: number[], separator: MacSeparator, uppercase: boolean): string {
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0'))
  const joined = hex.join(separator)
  return uppercase ? joined.toUpperCase() : joined.toLowerCase()
}

/** 批量生成随机 MAC 地址；前缀非法或数量超出范围时抛 Error */
export function generateMacs(options: MacGeneratorOptions): string[] {
  const { count, separator, uppercase } = options
  if (!Number.isInteger(count) || count < MAC_COUNT_RANGE.min || count > MAC_COUNT_RANGE.max) {
    throw new Error(
      `Count must be an integer between ${MAC_COUNT_RANGE.min} and ${MAC_COUNT_RANGE.max}`,
    )
  }
  const prefixHex = parsePrefixHex(options.prefix)
  const prefixBytes = prefixHex.length / 2
  const randomBytes = 6 - prefixBytes
  const buffer = new Uint8Array(count * randomBytes)
  crypto.getRandomValues(buffer)

  const macs: string[] = []
  for (let index = 0; index < count; index += 1) {
    const bytes: number[] = []
    for (let offset = 0; offset < prefixBytes; offset += 1) {
      bytes.push(Number.parseInt(prefixHex.slice(offset * 2, offset * 2 + 2), 16))
    }
    for (let offset = 0; offset < randomBytes; offset += 1) {
      let byte = buffer[index * randomBytes + offset]
      // 首字节随机时清掉组播位（I/G bit），保证生成单播地址
      if (prefixBytes === 0 && offset === 0) {
        byte &= 0xfe
      }
      bytes.push(byte)
    }
    macs.push(formatMac(bytes, separator, uppercase))
  }
  return macs
}
