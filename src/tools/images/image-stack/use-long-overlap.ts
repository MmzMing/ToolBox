import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { MAX_LONG_ITEMS } from './long-stack.service'
import { matchOverlap, type OverlapMatch } from './overlap-match'
import { sampleSeam } from './overlap-sample'
import { useImageStackStore } from './store'
import { useReadyAssets } from './use-scene'
import { yieldFrame } from './yield-frame'

type Seam = { imageId: string; match: OverlapMatch }

export type LongOverlapRunner = {
  isRunning: boolean
  detectAll: () => Promise<void>
  detectSeam: (imageId: string) => Promise<void>
}

/**
 * 相邻截图重叠区的识别运行器。
 *
 * 行指纹缓存在 ref 而不是 store：那是 TypedArray，既不可序列化也没有跨组件共享的需要，
 * 而且 `partialize` 一旦把它带进 localStorage 就等着爆配额。失效键是素材 id 序列 ——
 * 接缝由「相邻」定义，所以拖拽排序也必须让缓存重取。
 */
export function useLongOverlap(): LongOverlapRunner {
  const { t } = useTranslation('tools-images', { keyPrefix: 'image-stack' })
  const assets = useReadyAssets()
  const applyLongOverlaps = useImageStackStore((state) => state.applyLongOverlaps)
  const [isRunning, setIsRunning] = useState(false)
  const cacheKey = useMemo(
    () =>
      assets
        .slice(0, MAX_LONG_ITEMS)
        .map((asset) => asset.id)
        .join('|'),
    [assets],
  )
  const cache = useRef<{ key: string; seams: Seam[] }>({ key: '', seams: [] })
  const cancelled = useRef(false)

  // 卸载后不能再 await 下去：setIsRunning 与 toast 都会打到已经消失的组件上
  useEffect(() => {
    return () => {
      cancelled.current = true
    }
  }, [])

  const seams = useCallback(async (): Promise<Seam[]> => {
    if (cache.current.key === cacheKey) {
      return cache.current.seams
    }
    const used = assets.slice(0, MAX_LONG_ITEMS)
    const collected: Seam[] = []
    for (let index = 0; index + 1 < used.length; index += 1) {
      const pair = sampleSeam(used[index].full, used[index + 1].full)
      collected.push({
        imageId: used[index + 1].id,
        match: matchOverlap(pair.prev, pair.next),
      })
      await yieldFrame()
      if (cancelled.current) {
        return collected
      }
    }
    cache.current = { key: cacheKey, seams: collected }
    return collected
  }, [assets, cacheKey])

  const detectAll = useCallback(async () => {
    setIsRunning(true)
    try {
      const results = await seams()
      const confident = results.filter((item) => item.match.confident && item.match.overlapPx > 0)
      const review = results.filter((item) => !item.match.confident && item.match.overlapPx > 0)
      if (confident.length > 0) {
        applyLongOverlaps(
          confident.map((item) => ({ imageId: item.imageId, trimTopPx: item.match.overlapPx })),
        )
      }
      const removed = confident.reduce((sum, item) => sum + item.match.overlapPx, 0)
      toast.info(
        t('long.dedupDone', {
          applied: confident.length,
          px: removed,
          review: review.length,
          flat: results.filter((item) => item.match.reason === 'flat').length,
        }),
      )
    } finally {
      setIsRunning(false)
    }
  }, [applyLongOverlaps, seams, t])

  /** 单条接缝：用户点名要这一处，所以弱匹配也照落 */
  const detectSeam = useCallback(
    async (imageId: string) => {
      setIsRunning(true)
      try {
        const results = await seams()
        const target = results.find((item) => item.imageId === imageId)
        if (!target || target.match.overlapPx <= 0) {
          toast.info(t(`long.dedupReason.${target?.match.reason ?? 'none'}`))
          return
        }
        applyLongOverlaps([{ imageId, trimTopPx: target.match.overlapPx }])
        toast.success(t('long.dedupApplied', { px: target.match.overlapPx }))
      } finally {
        setIsRunning(false)
      }
    },
    [applyLongOverlaps, seams, t],
  )

  return { isRunning, detectAll, detectSeam }
}
