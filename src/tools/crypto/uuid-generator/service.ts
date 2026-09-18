import { v4 } from 'uuid'

export const MIN_COUNT = 1
export const MAX_COUNT = 99

export const uuidV4Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 批量生成 UUID v4，数量收敛到 [MIN_COUNT, MAX_COUNT] */
export function generateUuids(count: number): string[] {
  const safeCount = Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(count)))
  return Array.from({ length: safeCount }, () => v4())
}

export function isValidUuidV4(value: string): boolean {
  return uuidV4Regex.test(value.trim())
}
