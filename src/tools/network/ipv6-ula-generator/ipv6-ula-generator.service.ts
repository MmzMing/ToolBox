/**
 * IPv6 ULA 前缀生成（RFC 4193，纯逻辑，零 DOM/React 依赖）。
 * /48 前缀 = fd00::/8 + 40bit 随机全局 ID。
 */

export const ULA_COUNT_RANGE = { min: 1, max: 50 } as const

/** 匹配 RFC 4193 /48 ULA 前缀，如 'fd12:3456:789a::/48' */
export const ulaRegex = /^fd[0-9a-f]{2}:[0-9a-f]{4}:[0-9a-f]{4}::\/48$/

const GLOBAL_ID_BYTES = 5
const ZERO_ATTEMPTS_MAX = 2

const hex2 = (value: number): string => value.toString(16).padStart(2, '0')
const hex4 = (value: number): string => value.toString(16).padStart(4, '0')

function formatUlaPrefix(bytes: Uint8Array): string {
  const secondHextet = ((bytes[1] << 8) | bytes[2]) & 0xffff
  const thirdHextet = ((bytes[3] << 8) | bytes[4]) & 0xffff
  return `fd${hex2(bytes[0])}:${hex4(secondHextet)}:${hex4(thirdHextet)}::/48`
}

/** 40bit 随机全局 ID；全零概率极低，出现时重试一次 */
function randomGlobalIdBytes(): Uint8Array {
  for (let attempt = 0; attempt < ZERO_ATTEMPTS_MAX; attempt += 1) {
    const bytes = new Uint8Array(GLOBAL_ID_BYTES)
    crypto.getRandomValues(bytes)
    if (bytes.some((byte) => byte !== 0)) {
      return bytes
    }
  }
  // 2^-80 概率事件：两次全零，接受为零以终止
  return new Uint8Array(GLOBAL_ID_BYTES)
}

/** 生成 count 个 fd00::/8 内的随机 /48 ULA 前缀（如 'fd12:3456:789a::/48'） */
export function generateIpv6UlaPrefixes(count: number): string[] {
  if (!Number.isInteger(count) || count < ULA_COUNT_RANGE.min || count > ULA_COUNT_RANGE.max) {
    throw new Error(
      `Count must be an integer between ${ULA_COUNT_RANGE.min} and ${ULA_COUNT_RANGE.max}`,
    )
  }
  const prefixes: string[] = []
  for (let index = 0; index < count; index += 1) {
    prefixes.push(formatUlaPrefix(randomGlobalIdBytes()))
  }
  return prefixes
}
