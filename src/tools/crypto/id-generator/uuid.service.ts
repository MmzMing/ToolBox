import { NIL, v1, v3, v4, v5, v6, v7, validate } from 'uuid'

import { clampCount } from './id-format.service'

export const UUID_VERSIONS = ['v1', 'v3', 'v4', 'v5', 'v6', 'v7', 'nil'] as const

export type UuidVersion = (typeof UUID_VERSIONS)[number]

/** 时间有序、可反解出时刻的版本 */
export const SORTABLE_UUID_VERSIONS = ['v1', 'v6', 'v7'] as const

/** 同输入必然同输出，批量对它们没有意义 */
const DETERMINISTIC_VERSIONS: readonly UuidVersion[] = ['v3', 'v5', 'nil']

export const UUID_NAMESPACES = ['dns', 'url', 'oid', 'x500', 'custom'] as const

export type UuidNamespace = (typeof UUID_NAMESPACES)[number]

/**
 * RFC 9562 §7 预定义命名空间。uuid@14 只导出 DNS 与 URL，
 * OID / X500 是协议里写死的常量，这里补齐而不是让用户手抄。
 */
export const UUID_NAMESPACE_VALUES: Record<Exclude<UuidNamespace, 'custom'>, string> = {
  dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
}

export type UuidOptions = {
  /** Unix 毫秒时间戳，仅 v1 / v6 / v7 使用 */
  timestamp?: number
  /** 命名空间 UUID，仅 v3 / v5 使用 */
  namespace?: string
  /** 被哈希的名字，仅 v3 / v5 使用 */
  name?: string
}

/** clk_seq_hi_variant 高位的四种变体族（RFC 9562 §4.1） */
export type UuidVariant = 'ncs' | 'rfc4122' | 'microsoft' | 'reserved'

function toHex32(value: string): string {
  const hex = value.replaceAll('-', '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('Expected a UUID with 32 hexadecimal digits')
  }
  return hex
}

export function uuidVersionOf(value: string): number {
  return Number.parseInt(toHex32(value)[12], 16)
}

export function uuidVariantOf(value: string): UuidVariant {
  const sequence = Number.parseInt(toHex32(value).slice(16, 18), 16)
  if ((sequence & 0x80) === 0) {
    return 'ncs'
  }
  if ((sequence & 0xc0) === 0x80) {
    return 'rfc4122'
  }
  if ((sequence & 0xe0) === 0xc0) {
    return 'microsoft'
  }
  return 'reserved'
}

/** 命名空间预设解析；custom 需要一条合法 UUID */
export function resolveNamespace(namespace: UuidNamespace, custom?: string): string {
  if (namespace !== 'custom') {
    return UUID_NAMESPACE_VALUES[namespace]
  }
  const value = (custom ?? '').trim()
  if (!validate(value)) {
    throw new Error('Custom namespace must be a valid UUID')
  }
  return value
}

function timestampOf(timestamp: number | undefined): number {
  if (timestamp === undefined) {
    return Date.now()
  }
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error('UUID timestamp must be a non-negative integer of milliseconds')
  }
  return timestamp
}

function nameInput(options: UuidOptions): [string, string] {
  // 逐字节哈希，不能 trim：多了个空格就是另一个 UUID
  const name = options.name ?? ''
  if (name.length === 0) {
    throw new Error('Named UUID requires a non-empty name')
  }
  const namespace = options.namespace ?? ''
  if (!validate(namespace)) {
    throw new Error('Named UUID requires a valid namespace UUID')
  }
  return [name, namespace]
}

export function isDeterministic(version: UuidVersion): boolean {
  return DETERMINISTIC_VERSIONS.includes(version)
}

export function generateUuid(version: UuidVersion, options: UuidOptions = {}): string {
  switch (version) {
    case 'nil':
      return NIL
    case 'v4':
      return v4()
    case 'v1':
      return v1({ msecs: timestampOf(options.timestamp) })
    case 'v6':
      return v6({ msecs: timestampOf(options.timestamp) })
    case 'v7':
      return v7({ msecs: timestampOf(options.timestamp) })
    case 'v3': {
      const [name, namespace] = nameInput(options)
      return v3(name, namespace)
    }
    case 'v5': {
      const [name, namespace] = nameInput(options)
      return v5(name, namespace)
    }
  }
}

/**
 * 批量生成。时间有序版本逐条 +1ms，保证列表本身就是有序且互不相同的；
 * 确定性版本（v3 / v5 / Nil）同输入同输出，数量恒为 1。
 */
export function generateUuids(version: UuidVersion, options: UuidOptions, count: number): string[] {
  if (isDeterministic(version)) {
    return [generateUuid(version, options)]
  }
  const total = clampCount(count)
  if (version === 'v4') {
    return Array.from({ length: total }, () => generateUuid(version, options))
  }
  const base = timestampOf(options.timestamp)
  return Array.from({ length: total }, (_, index) =>
    generateUuid(version, { ...options, timestamp: base + index }),
  )
}
