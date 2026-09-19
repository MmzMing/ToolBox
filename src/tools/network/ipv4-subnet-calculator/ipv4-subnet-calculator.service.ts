/**
 * IPv4 子网计算（纯逻辑，零依赖）。全部整数运算基于 uint32（CIDR 标准算法）。
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

export interface ParsedNetworkInput {
  ip: number
  prefix: number
}

/** 前缀长度 → 掩码 uint32（prefix=0 时掩码为 0，避免 32 位移位陷阱） */
export function prefixToNetmask(prefix: number): number {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid prefix length: ${prefix}`)
  }
  return prefix === 0 ? 0 : (UINT32_MAX << (32 - prefix)) >>> 0
}

/** 解析 '1.2.3.4/24'、'1.2.3.4/255.255.0.0' 或裸 IP（默认 /32），非法输入抛 Error */
export function parseNetmaskOrPrefix(input: string): ParsedNetworkInput {
  const trimmed = input.trim()
  const slashIndex = trimmed.indexOf('/')
  const ipPart = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex)
  const maskPart = slashIndex === -1 ? '' : trimmed.slice(slashIndex + 1)
  const ip = parseIpv4(ipPart)
  if (maskPart === '') {
    return { ip, prefix: 32 }
  }
  if (/^\d{1,2}$/.test(maskPart)) {
    const prefix = Number(maskPart)
    if (prefix > 32) {
      throw new Error(`Prefix length out of range: "/${maskPart}"`)
    }
    return { ip, prefix }
  }
  const netmask = parseIpv4(maskPart)
  return { ip, prefix: prefixFromNetmask(netmask) }
}

/** 掩码 → 前缀长度：要求掩码连续（高位全 1 低位全 0），否则抛 Error */
function prefixFromNetmask(netmask: number): number {
  const inverse = ~netmask >>> 0
  if ((inverse & (inverse + 1)) !== 0) {
    throw new Error(`Netmask is not contiguous: "${formatIpv4(netmask)}"`)
  }
  return 32 - popcount(inverse)
}

function popcount(value: number): number {
  let bits = value
  let count = 0
  while (bits !== 0) {
    bits &= bits - 1
    count += 1
  }
  return count
}

export type Ipv4AddressClass = 'A' | 'B' | 'C' | 'D' | 'E'

export interface SubnetCalculation {
  /** 输入的主机地址（点分十进制） */
  ip: string
  prefix: number
  networkAddress: string
  broadcastAddress: string
  netmask: string
  wildcardMask: string
  /** 地址块总地址数（含网络地址与广播地址） */
  totalHosts: number
  /** 可用主机数：/31 按 RFC 3021 为 2，/32 为 1，其余为总数减 2 */
  usableHosts: number
  firstUsableHost: string
  lastUsableHost: string
  addressClass: Ipv4AddressClass
  /** RFC 1918 私有地址（10/8、172.16/12、192.168/16） */
  isPrivate: boolean
}

/** 计算 CIDR 子网的全部字段（IP 为主机地址，自动归到网络地址） */
export function calculateSubnet(ip: number, prefix: number): SubnetCalculation {
  if (!Number.isInteger(ip) || ip < 0 || ip > UINT32_MAX) {
    throw new Error(`Invalid IPv4 address value: ${ip}`)
  }
  const netmask = prefixToNetmask(prefix)
  const wildcard = ~netmask >>> 0
  const network = (ip & netmask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  const totalHosts = 2 ** (32 - prefix)
  const usableHosts = prefix === 32 ? 1 : prefix === 31 ? 2 : totalHosts - 2
  // /31 两个地址均可用，/32 只有自身，其余首末可用地址排除网络/广播地址
  const firstUsableHost = prefix >= 31 ? network : network + 1
  const lastUsableHost = prefix >= 31 ? broadcast : broadcast - 1
  return {
    ip: formatIpv4(ip),
    prefix,
    networkAddress: formatIpv4(network),
    broadcastAddress: formatIpv4(broadcast),
    netmask: formatIpv4(netmask),
    wildcardMask: formatIpv4(wildcard),
    totalHosts,
    usableHosts,
    firstUsableHost: formatIpv4(firstUsableHost),
    lastUsableHost: formatIpv4(lastUsableHost),
    addressClass: addressClassOf(ip),
    isPrivate: isPrivateIpv4(ip),
  }
}

function addressClassOf(ip: number): Ipv4AddressClass {
  const firstOctet = (ip >>> 24) & 255
  if (firstOctet <= 127) {
    return 'A'
  }
  if (firstOctet <= 191) {
    return 'B'
  }
  if (firstOctet <= 223) {
    return 'C'
  }
  if (firstOctet <= 239) {
    return 'D'
  }
  return 'E'
}

const PRIVATE_RANGES: readonly { base: number; prefix: number }[] = [
  { base: 0x0a000000, prefix: 8 }, // 10.0.0.0/8
  { base: 0xac100000, prefix: 12 }, // 172.16.0.0/12
  { base: 0xc0a80000, prefix: 16 }, // 192.168.0.0/16
]

function isPrivateIpv4(ip: number): boolean {
  return PRIVATE_RANGES.some(
    (range) => (((ip ^ range.base) >>> 0) & prefixToNetmask(range.prefix)) === 0,
  )
}
