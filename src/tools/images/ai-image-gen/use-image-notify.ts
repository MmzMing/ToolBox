import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { playDoneChime } from './sound'
import { useAiImageGenStore } from './store'

/**
 * 出图完成提示：响一声，并在页面处于后台时把标题换成「x 张图片生成成功」，
 * 回到前台（或关掉开关）即交还原标题。
 */
export function useImageNotify(enabled: boolean) {
  const { t } = useTranslation('tools-images')
  const done = useAiImageGenStore((state) =>
    state.jobs.reduce(
      (total, job) =>
        job.kind === 'gen'
          ? total + job.slots.filter((slot) => slot.status === 'done').length
          : total,
      0,
    ),
  )
  const seen = useRef(done)
  const [unread, setUnread] = useState(0)
  const baseTitle = useRef<string | null>(null)

  useEffect(() => {
    const delta = done - seen.current
    seen.current = done
    if (!enabled || delta <= 0) {
      return
    }
    playDoneChime()
    if (document.hidden) {
      setUnread((count) => count + delta)
    }
  }, [done, enabled])

  useEffect(() => {
    const clear = () => {
      if (!document.hidden) {
        setUnread(0)
      }
    }
    document.addEventListener('visibilitychange', clear)
    window.addEventListener('focus', clear)
    return () => {
      document.removeEventListener('visibilitychange', clear)
      window.removeEventListener('focus', clear)
    }
  }, [])

  /** 标题由 DocumentMeta 声明式渲染，这里只在计数期间临时接管，之后原样交还 */
  useEffect(() => {
    if (!enabled || unread === 0) {
      if (baseTitle.current !== null) {
        document.title = baseTitle.current
        baseTitle.current = null
      }
      return
    }
    baseTitle.current ??= document.title
    document.title = t('ai-image-gen.notify.badge', { count: unread })
  }, [enabled, unread, t])
}
