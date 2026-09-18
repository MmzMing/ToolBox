import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

async function writeClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}

/** navigator.clipboard 不可用（http 站点/旧浏览器）时的降级方案 */
function fallbackCopy(value: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

/**
 * 复制到剪贴板 + 成功 toast + “刚复制过”状态（2 秒后自动复位）。
 * 用法：const { copy, isCopied } = useCopy(); await copy(value)
 */
export function useCopy(resetMs = 2000) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    async (value: string, options?: { silent?: boolean }) => {
      try {
        await writeClipboard(value)
      } catch {
        if (!fallbackCopy(value)) {
          toast.error(t('copyFailed'))
          return false
        }
      }
      if (!options?.silent) {
        toast.success(t('copied'))
      }
      setCopied(value)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => setCopied(null), resetMs)
      return true
    },
    [resetMs, t],
  )

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    },
    [],
  )

  const isCopied = useCallback((value: string) => copied === value, [copied])

  return { copy, isCopied, copied }
}
