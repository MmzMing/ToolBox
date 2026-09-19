/**
 * IPv4 多格式转换（纯逻辑，零依赖）。
 * 按规范 parseIpv4/formatIpv4 在本工具内独立实现，不引用其他工具的 service。
 */

const UINT32_MAX = 0xffffffff

/** 点分十进制 → uint32，非法输入抛 Error */
export function parseIpv4(input: string): number {
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
export function formatIpv4(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`Value is not a uint32: ${value}`)
  }
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

export interface Ipv4Representations {
  /** 十进制整数，如 '3232235786' */
  decimal: string
  /** 32 位十六进制，如 '0xC0A8010A' */
  hexadecimal: string
  /** 八位点分二进制（每段 8 bit），如 '11000000.10101000.00000001.00001010' */
  binary: string
  /** 点分八进制（每段 3 位补零），如 '300.250.001.012' */
  octal: string
  /** 点分十六进制（每段 1 字节），如 '0xC0.0xA8.0x01.0x0A' */
  dottedHexadecimal: string
}

/** 把点分十进制 IPv4 转换为十进制/十六进制/二进制/八进制/点分十六进制 */
export function convertIpv4(input: string): Ipv4Representations {
  const value = parseIpv4(input)
  const octets = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
  return {
    decimal: String(value),
    hexadecimal: `0x${value.toString(16).toUpperCase().padStart(8, '0')}`,
    binary: octets.map((octet) => octet.toString(2).padStart(8, '0')).join('.'),
    octal: octets.map((octet) => octet.toString(8).padStart(3, '0')).join('.'),
    dottedHexadecimal: octets
      .map((octet) => `0x${octet.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('.'),
  }
}
