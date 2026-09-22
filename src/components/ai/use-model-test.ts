import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { requestAIText, parseJsonPayload } from '@/modules/ai/transport'
import { toAIConnection, canModelParsePdf } from '@/modules/ai/providers'
import type { AIModelProfile } from '@/modules/ai/providers'
import { aiErrorKey } from './error-copy'

const VISION_TEST_PROMPT =
  'Read the digits in the image. Return only a JSON object with one string field named "code" containing those digits. Do not guess if you cannot read the image.'

const TEST_SYSTEM_PROMPT = 'Reply with exactly OK.'

const TEST_USER_PROMPT = 'Test this connection.'

/** 命中即判成功；容忍模型习惯性的句末标点 */
const TEST_OK_PATTERN = /^OK[.!]?$/i

const TEST_TIMEOUT_MS = 130_000

/** 本地画一张写有随机 6 位数字的图，模型读回来必须一模一样才算它真能看图 */
function createVisionTestCard() {
  const digits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('')
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 120
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  context.font = 'bold 56px monospace'
  context.textBaseline = 'middle'
  context.fillText(digits, 24, canvas.height / 2)
  return { digits, dataUrl: canvas.toDataURL('image/png') }
}

export type TestState = { status: 'idle' | 'running' | 'ok' | 'failed'; message?: string }

/**
 * 单个模型的连通性自检。
 *
 * 字段一改就 abort 并回到 idle，且用 revision 挡掉迟到的旧结果——
 * 否则换了 key 之后，上一条慢请求的失败会盖到新配置上。
 */
export function useModelTest() {
  const { t } = useTranslation('tools-resume')
  const [state, setState] = useState<TestState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const revisionRef = useRef(0)

  const reset = useCallback(() => {
    revisionRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setState({ status: 'idle' })
  }, [])

  const test = useCallback(
    async (model: AIModelProfile) => {
      revisionRef.current += 1
      const revision = revisionRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ status: 'running' })

      const settle = (next: TestState) => {
        if (revisionRef.current === revision) {
          setState(next)
        }
      }

      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TEST_TIMEOUT_MS)])

      try {
        const connection = toAIConnection(model)
        let ok = false

        if (canModelParsePdf(model)) {
          const card = createVisionTestCard()
          if (!card) {
            settle({ status: 'failed', message: t('common:ai.test.canvasUnavailable') })
            return
          }
          const content = await requestAIText(
            connection,
            {
              system: VISION_TEST_PROMPT,
              text: VISION_TEST_PROMPT,
              images: [card.dataUrl],
              json: true,
            },
            signal,
          )
          const code = String((parseJsonPayload(content) as { code?: unknown })?.code ?? '').trim()
          ok = code === card.digits
        } else {
          const content = await requestAIText(
            connection,
            { system: TEST_SYSTEM_PROMPT, text: TEST_USER_PROMPT },
            signal,
          )
          ok = TEST_OK_PATTERN.test(content.trim())
        }

        settle(
          ok
            ? { status: 'ok', message: t('common:ai.test.ok') }
            : { status: 'failed', message: t('common:ai.test.mismatch') },
        )
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        settle({ status: 'failed', message: t(aiErrorKey(error)) })
      }
    },
    [t],
  )

  return { state, test, reset }
}
