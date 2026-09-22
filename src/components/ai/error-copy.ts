import { AIRequestError } from '@/modules/ai/transport'

/**
 * 把 AI 链路的异常翻成 i18n 键。
 *
 * 浏览器里 fetch 失败拿不到状态码，`corsBlocked` 的文案必须同时点出「跨域被拦」和
 * 「地址不可达」两种可能，否则用户会反复检查其实没写错的 key。
 */
export function aiErrorKey(error: unknown): string {
  if (error instanceof AIRequestError) {
    return `common:ai.errors.${error.code}`
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'common:ai.errors.aborted'
    }
    if (error.name === 'TimeoutError') {
      return 'common:ai.errors.timeout'
    }
  }
  return 'common:ai.errors.unknown'
}
