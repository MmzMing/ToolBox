import { useMemo } from 'react'

/**
 * 源文本经 `convert` 转换：空输入直接给空输出，service 抛错时把技术信息交给 Alert。
 *
 * `convert` 必须是稳定引用（用 `useMemo` 从 service 的纯函数里按方向与形式挑一个），
 * 否则每次输入都会重跑一次转换。
 */
export function useConversion(
  source: string,
  convert: (text: string) => string,
): { value: string; error: string | null } {
  return useMemo(() => {
    if (source === '') {
      return { value: '', error: null }
    }
    try {
      return { value: convert(source), error: null }
    } catch (err) {
      return { value: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [source, convert])
}
