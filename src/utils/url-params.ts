/**
 * 查询类工具共用：查询条件与地址栏 query 之间的读写。
 * 各工具只在首屏读（pickUrlParams），写地址栏仅发生在「复制链接」这类明确动作里，
 * 跨工具复用故放 utils。
 */

/** null 与空串都表示"该键不该出现在地址栏里" */
export type UrlParamValues = Record<string, string | null>

/** 覆盖同名键、删除空值、其余参数原样保留；不修改入参 */
export function applyUrlParams(current: URLSearchParams, values: UrlParamValues): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  }
  return next
}

/** 只取本工具关心的键；缺失与空值都归一为 undefined，便于调用方兜底 */
export function pickUrlParams(
  current: URLSearchParams,
  keys: readonly string[],
): Record<string, string | undefined> {
  const picked: Record<string, string | undefined> = {}
  for (const key of keys) {
    const value = current.get(key)
    if (value !== null && value !== '') {
      picked[key] = value
    }
  }
  return picked
}

/** 基于完整 URL 生成分享链接，用于「复制链接」而非改地址栏 */
export function urlWithParams(current: string, values: UrlParamValues): string {
  const url = new URL(current)
  url.search = applyUrlParams(url.searchParams, values).toString()
  return url.toString()
}
