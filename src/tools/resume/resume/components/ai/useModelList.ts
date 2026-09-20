import { useCallback, useEffect, useRef, useState } from 'react'

import { listProviderModels, type ModelListTarget } from '../../../ai/transport'

const LIST_TIMEOUT_MS = 20_000

/**
 * 按当前凭证拉取模型列表。
 *
 * 同一时刻只允许一个请求在飞：重入时打断上一次，避免旧请求的结果盖掉新结果。
 * 被打断（含组件卸载）时返回 null，调用方据此什么都不写。
 */
export function useModelList() {
  const [fetching, setFetching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const load = useCallback(async (target: ModelListTarget): Promise<string[] | null> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setFetching(true)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(LIST_TIMEOUT_MS)])
    try {
      return await listProviderModels(target, signal)
    } catch (error) {
      if (controller.signal.aborted) {
        return null
      }
      throw error
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setFetching(false)
      }
    }
  }, [])

  return { fetching, load }
}
