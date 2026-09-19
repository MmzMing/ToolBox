import { jwtDecode } from 'jwt-decode'

export interface JwtParts {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  /** 原始签名段（base64url，未做解码） */
  signature: string
}

export interface JwtClaimInfo {
  key: string
  value: string
  kind: 'date' | 'plain'
}

/** 识别为秒级时间戳的标准 JWT 声明 */
const dateClaims = ['exp', 'iat', 'nbf'] as const

/** 标量直接转字符串，对象/数组 JSON 序列化（兜底 String） */
function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  const json = JSON.stringify(value)
  return json ?? String(value)
}

/** 解码 JWT：header 用 jwtDecode({ header: true })，payload 常规解码；非法输入抛 Error */
export function decodeJwt(token: string): JwtParts {
  const trimmed = token.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 3 || parts[0] === '' || parts[1] === '') {
    throw new Error('Invalid JWT: expected 3 dot-separated base64url parts')
  }
  try {
    const header = jwtDecode<Record<string, unknown>>(trimmed, { header: true })
    const payload = jwtDecode<Record<string, unknown>>(trimmed)
    return { header, payload, signature: parts[2] ?? '' }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JWT: ${reason}`, { cause: err })
  }
}

/**
 * 分析 payload 声明：exp/iat/nbf（有限数字）识别为日期并转 ISO 字符串，
 * 其余声明原样转为展示字符串，顺序与 payload 键序一致
 */
export function analyseJwtClaims(payload: Record<string, unknown>): JwtClaimInfo[] {
  return Object.entries(payload).map(([key, value]) => {
    const isDate =
      (dateClaims as readonly string[]).includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    if (isDate) {
      return { key, value: new Date(value * 1000).toISOString(), kind: 'date' as const }
    }
    return { key, value: toDisplayValue(value), kind: 'plain' as const }
  })
}

/** 判断 JWT 是否已过期：无 exp 或 exp 非有限数字返回 null；nowMs 可注入便于测试 */
export function isJwtExpired(
  payload: Record<string, unknown>,
  nowMs: number = Date.now(),
): boolean | null {
  const exp = payload['exp']
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    return null
  }
  return nowMs >= exp * 1000
}

/** 从 header 读取 alg 声明，缺失或非字符串返回 null */
export function getJwtAlgorithm(header: Record<string, unknown>): string | null {
  const alg = header['alg']
  return typeof alg === 'string' && alg !== '' ? alg : null
}
