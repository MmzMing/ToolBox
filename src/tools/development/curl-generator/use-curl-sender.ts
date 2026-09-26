import { useCallback, useRef, useState } from 'react'

import { toFetchPlan, type HttpRequestModel } from './curl-generator.service'

export interface SendOutcome {
  status?: number
  statusText?: string
  ok: boolean
  ms: number
  headers: [string, string][]
  text?: string
  truncated: boolean
  contentType?: string
  byteSize?: number
  downloadUrl?: string
  downloadName?: string
  /** 请求根本没到服务器：fetch 只抛一个 TypeError，无法区分具体原因 */
  errorKey?: 'corsBlocked' | 'aborted' | 'networkError'
  skippedHeaders: string[]
  warnings: string[]
}

const MAX_TEXT = 200_000

function isTextual(type: string | null): boolean {
  if (type === null) return false
  return /json|text|xml|urlencoded|javascript|x-sh|csv|html/i.test(type)
}

function fileNameFrom(type: string | null): string {
  if (!type) return 'response.bin'
  const ext = type.split(';')[0].split('/').pop() ?? 'bin'
  return `response.${ext.replace(/[^a-z0-9.+-]/gi, '')}`
}

/**
 * 「发送」只由用户点击触发：浏览器直连目标地址，不经任何中转。
 * 结果里的 skippedHeaders / warnings 如实说明线上请求与 curl 的偏差。
 */
export function useCurlSender() {
  const [outcome, setOutcome] = useState<SendOutcome | null>(null)
  const [pending, setPending] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controller.current?.abort()
  }, [])

  const reset = useCallback(() => setOutcome(null), [])

  const send = useCallback(async (model: HttpRequestModel) => {
    const plan = toFetchPlan(model)
    controller.current?.abort()
    const signal = new AbortController()
    controller.current = signal
    setPending(true)
    const started = performance.now()

    try {
      const response = await fetch(plan.url, {
        method: plan.method,
        headers: plan.headers,
        body: plan.body ?? plan.formData,
        credentials: 'omit',
        redirect: 'follow',
        signal: signal.signal,
      })
      const ms = Math.round(performance.now() - started)
      const type = response.headers.get('content-type')
      const headers = [...response.headers.entries()]
      const base = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        ms,
        headers,
        contentType: type ?? undefined,
        truncated: false,
        skippedHeaders: plan.skippedHeaders,
        warnings: plan.warnings,
      }
      if (isTextual(type)) {
        const all = await response.text()
        setOutcome({ ...base, text: all.slice(0, MAX_TEXT), truncated: all.length > MAX_TEXT })
      } else {
        const blob = await response.blob()
        setOutcome({
          ...base,
          byteSize: blob.size,
          downloadUrl: URL.createObjectURL(blob),
          downloadName: fileNameFrom(type),
        })
      }
    } catch (error) {
      const ms = Math.round(performance.now() - started)
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      setOutcome({
        ok: false,
        ms,
        headers: [],
        truncated: false,
        skippedHeaders: plan.skippedHeaders,
        warnings: plan.warnings,
        errorKey: aborted ? 'aborted' : error instanceof TypeError ? 'corsBlocked' : 'networkError',
      })
    } finally {
      setPending(false)
    }
  }, [])

  return { outcome, pending, send, abort, reset }
}
