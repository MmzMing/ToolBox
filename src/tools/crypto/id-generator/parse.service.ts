import { v6ToV1 } from 'uuid'

import { bytesToBase64Url } from '@/utils/base64'
import { hexToBytes } from '@/utils/bytes'

import type { UuidVariant } from './uuid.service'

import { ULID_LENGTH, isValidUlid, ulidTimestamp, ulidToUuid, uuidToUlid } from './ulid.service'
import { uuidVariantOf, uuidVersionOf } from './uuid.service'

export type IdKind = 'uuid' | 'ulid' | 'unknown'

export type ParseReason = 'empty' | 'length' | 'character'

/** 1582-10-15 到 Unix 纪元的 100ns 间隔数（RFC 9562 §5.2） */
const GREGORIAN_OFFSET_TICKS = 122_192_928_000_000_000n

const URN_PREFIX = /^urn:uuid:/i
/** 粘贴时常见的包装：引号、方/圆/花括号、空白 */
const WRAPPERS = /^[[\]{}()'"\s]+|[[\]{}()'"\s]+$/g

export type UuidFields = {
  timeLow: string
  timeMid: string
  timeHiAndVersion: string
  clockSeq: string
  node: string
}

export type ParsedUuid = {
  kind: 'uuid'
  canonical: string
  hex: string
  version: number
  variant: UuidVariant
  fields: UuidFields
  binary: string
  base64url: string
  /** v1 / v6 / v7 可反解出毫秒，其余为 null */
  timestamp: number | null
  /** 同一批字节的 ULID 写法 */
  ulidForm: string
}

export type ParsedUlid = {
  kind: 'ulid'
  value: string
  hex: string
  binary: string
  base64url: string
  timestamp: number
  uuidForm: string
}

export type ParsedId = ParsedUuid | ParsedUlid

export type ParseOutcome = { ok: true; value: ParsedId } | { ok: false; reason: ParseReason }

export type BatchLine = {
  raw: string
  kind: IdKind
  version: number | null
  timestamp: number | null
  valid: boolean
}

export type BatchReport = {
  lines: BatchLine[]
  total: number
  valid: number
  invalid: number
  duplicates: number
}

/** 毫秒 → ISO。反解出的 v1 时间戳可以远超 Date 的表示范围，那种情况下退回原始毫秒数 */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(ms)
}

/** 剥掉包装、引号与分隔符，只留有效载荷 */
function stripDecorations(raw: string): string {
  return raw
    .replaceAll(WRAPPERS, '')
    .replace(URN_PREFIX, '')
    .replaceAll(/["']/g, '')
    .replaceAll(/[-\s]/g, '')
}

function toHex32(raw: string): string | null {
  const body = stripDecorations(raw)
  if (body.length !== 32) {
    return null
  }
  return /^[0-9a-f]{32}$/i.test(body) ? body.toLowerCase() : null
}

function toUlid(raw: string): string | null {
  const body = stripDecorations(raw)
  if (body.length !== ULID_LENGTH) {
    return null
  }
  return isValidUlid(body) ? body.toUpperCase() : null
}

export function identifyId(raw: string): IdKind {
  if (toHex32(raw) !== null) {
    return 'uuid'
  }
  return toUlid(raw) === null ? 'unknown' : 'ulid'
}

/** 区分「长度不对」与「有非法字符」，让用户知道该改哪里 */
function failureOf(raw: string): ParseReason {
  const body = stripDecorations(raw)
  if (body.length === 0) {
    return 'empty'
  }
  const onlyAlnum = /^[0-9a-z]+$/i.test(body)
  if (onlyAlnum && body.length !== 32 && body.length !== ULID_LENGTH) {
    return 'length'
  }
  // 长度合法却仍认不出来：hex 串里混进了 g-z，或 Crockford 表里没有 I / L / O / U
  return 'character'
}

function binaryView(hex: string): string {
  return Array.from(hexToBytes(hex))
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join(' ')
}

function canonicalOf(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/** 100ns 计数（1582 起）→ Unix 毫秒 */
function ticksToMs(ticks: bigint): number {
  return Number((ticks - GREGORIAN_OFFSET_TICKS) / 10_000n)
}

function v1TimestampMs(hex: string): number {
  const timeLow = BigInt(`0x${hex.slice(0, 8)}`)
  const timeMid = BigInt(`0x${hex.slice(8, 12)}`)
  const timeHi = BigInt(`0x${hex.slice(12, 16)}`) & 0x0fffn
  return ticksToMs((timeHi << 48n) | (timeMid << 32n) | timeLow)
}

function parseUuidHex(hex: string): ParsedUuid {
  const canonical = canonicalOf(hex)
  const version = uuidVersionOf(canonical)
  let timestamp: number | null = null
  if (version === 1) {
    timestamp = v1TimestampMs(hex)
  } else if (version === 6) {
    // 交给库做 v6→v1 的重排，避免手搓第二次位运算
    timestamp = v1TimestampMs(v6ToV1(canonical).replaceAll('-', ''))
  } else if (version === 7) {
    timestamp = Number(BigInt(`0x${hex.slice(0, 12)}`))
  }

  return {
    kind: 'uuid',
    canonical,
    hex,
    version,
    variant: uuidVariantOf(canonical),
    fields: {
      timeLow: hex.slice(0, 8),
      timeMid: hex.slice(8, 12),
      timeHiAndVersion: hex.slice(12, 16),
      clockSeq: hex.slice(16, 20),
      node: hex.slice(20),
    },
    binary: binaryView(hex),
    base64url: bytesToBase64Url(hexToBytes(hex)),
    timestamp,
    ulidForm: uuidToUlid(canonical),
  }
}

function parseUlidValue(value: string): ParsedUlid {
  const uuidForm = ulidToUuid(value)
  const hex = uuidForm.replaceAll('-', '')
  return {
    kind: 'ulid',
    value,
    hex,
    binary: binaryView(hex),
    base64url: bytesToBase64Url(hexToBytes(hex)),
    timestamp: ulidTimestamp(value),
    uuidForm,
  }
}

/** 解析器永不抛错：垃圾输入换来一个 reason，而不是整页崩溃 */
export function parseId(raw: string): ParseOutcome {
  const hex = toHex32(raw)
  if (hex !== null) {
    return { ok: true, value: parseUuidHex(hex) }
  }
  const ulidValue = toUlid(raw)
  if (ulidValue !== null) {
    return { ok: true, value: parseUlidValue(ulidValue) }
  }
  return { ok: false, reason: failureOf(raw) }
}

export function analyzeIds(text: string): BatchReport {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw) => {
      const outcome = parseId(raw)
      if (!outcome.ok) {
        return { raw, kind: 'unknown' as const, version: null, timestamp: null, valid: false }
      }
      const value = outcome.value
      return {
        raw,
        kind: value.kind,
        version: value.kind === 'uuid' ? value.version : null,
        timestamp: value.timestamp,
        valid: true,
      }
    })

  const validKeys = lines
    .filter((line) => line.valid)
    .map((line) => stripDecorations(line.raw).toLowerCase())
  const valid = validKeys.length

  return {
    lines,
    total: lines.length,
    valid,
    invalid: lines.length - valid,
    duplicates: valid - new Set(validKeys).size,
  }
}
