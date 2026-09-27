import { TIME_MAX, decodeTime, isValid, monotonicFactory, ulid, ulidToUUID, uuidToULID } from 'ulid'

import { clampCount } from './id-format.service'

/** ULID 定长 26 个 Crockford Base32 字符 */
export const ULID_LENGTH = 26

/** 48bit 毫秒时间戳上限 */
export const ULID_MAX_TIMESTAMP = TIME_MAX

export type UlidOptions = {
  /** Unix 毫秒时间戳，缺省为当前时间 */
  timestamp?: number
  /** 同毫秒内让随机段递增，保证批量结果字典序严格上升 */
  monotonic?: boolean
}

function assertTimestamp(timestamp: number): void {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > ULID_MAX_TIMESTAMP) {
    throw new Error('ULID timestamp must be an integer of milliseconds within 48 bits')
  }
}

export function isValidUlid(value: string): boolean {
  return isValid(value.trim())
}

export function generateUlid(options: UlidOptions = {}): string {
  if (options.timestamp !== undefined) {
    assertTimestamp(options.timestamp)
  }
  if (options.monotonic) {
    return monotonicFactory()(options.timestamp)
  }
  return ulid(options.timestamp)
}

/**
 * 批量生成。单调模式共用一个工厂并固定基准时间戳，于是同毫秒内的
 * 随机段逐条 +1；非单调模式各自取随机段，靠 80bit 随机数保唯一。
 */
export function generateUlids(count: number, options: UlidOptions = {}): string[] {
  const total = clampCount(count)
  if (!options.monotonic) {
    return Array.from({ length: total }, () => generateUlid(options))
  }
  if (options.timestamp !== undefined) {
    assertTimestamp(options.timestamp)
  }
  const factory = monotonicFactory()
  return Array.from({ length: total }, () => factory(options.timestamp))
}

/** 反解 48bit 毫秒时间戳 */
export function ulidTimestamp(value: string): number {
  const id = value.trim()
  if (!isValid(id)) {
    throw new Error('ULID time extraction requires a valid 26-character ULID')
  }
  return decodeTime(id)
}

/** ULID → UUID 字符串（128bit 逐字节搬运，无版本/变体重写），归一为小写 */
export function ulidToUuid(value: string): string {
  const id = value.trim()
  if (!isValid(id)) {
    throw new Error('ULID to UUID conversion requires a valid 26-character ULID')
  }
  return ulidToUUID(id.toUpperCase()).toLowerCase()
}

export function uuidToUlid(value: string): string {
  try {
    return uuidToULID(value.trim())
  } catch {
    throw new Error('UUID to ULID conversion requires a canonical 8-4-4-4-12 UUID')
  }
}
