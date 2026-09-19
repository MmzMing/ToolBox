/**
 * IP 范围 → 最小 CIDR 列表（纯逻辑，零依赖）。
 * 标准对齐块算法：从 start 出发，每次取“当前地址对齐的最大 2 的幂块”且不超过剩余范围。
 */

const UINT32_MAX = 0xffffffff

/** 点分十进制 → uint32，非法输入抛 Error */
function parseIpv4(input: string): number {
  const parts = input.trim().split('.')
  if (parts.length !== 4) {
    throw new Error(`Invalid IPv4 address: "${input}"`)
  }
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      throw new Error(`Invalid IPv4 octet: "${part}"`)
    }
    const octet = Number(part)
    if (octet > 255) {
      throw new Error(`IPv4 octet out of range: "${part}"`)
    }
    value = value * 256 + octet
  }
  return value >>> 0
}

/** uint32 → 点分十进制，非 uint32 输入抛 Error */
function formatIpv4(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`Value is not a uint32: ${value}`)
  }
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

/**
 * 将闭区间 [start, end] 展开为覆盖该范围的最小 CIDR 块列表（如 192.168.1.1-192.168.1.10 → 5 段）。
 * start > end 或任一地址非法时抛 Error。
 */
export function ipv4RangeToCidrs(start: string, end: string): string[] {
  const startValue = parseIpv4(start)
  const endValue = parseIpv4(end)
  if (startValue > endValue) {
    throw new Error(`Range start ${start.trim()} is greater than end ${end.trim()}`)
  }
  const cidrs: string[] = []
  let current = startValue
  while (current <= endValue) {
    const remaining = endValue - current + 1
    // 当前地址允许的最大对齐块：最低置位比特（0.0.0.0 对齐整个地址空间）
    const aligned = current === 0 ? UINT32_MAX + 1 : (current & -current) >>> 0
    let block = 1
    while (block * 2 <= aligned && block * 2 <= remaining) {
      block *= 2
    }
    cidrs.push(`${formatIpv4(current)}/${32 - Math.log2(block)}`)
    current += block
  }
  return cidrs
}
