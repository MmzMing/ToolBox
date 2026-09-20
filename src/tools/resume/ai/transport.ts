import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFINITIONS,
  isValidBaseUrl,
  type AIConnection,
  type AIProtocol,
} from './providers'

/** AI 链路统一错误：`code` 供 i18n 查表，`status` 只为与旧项目对齐的日志与分类 */
export class AIRequestError extends Error {
  readonly code: AIErrorCode
  readonly status: number

  constructor(code: AIErrorCode, status = 400) {
    super(code)
    this.name = 'AIRequestError'
    this.code = code
    this.status = status
  }
}

export type AIErrorCode =
  | 'invalidProvider'
  | 'configRequired'
  | 'invalidEndpoint'
  | 'corsBlocked'
  | 'networkError'
  | 'timeout'
  | 'aborted'
  | 'authenticationFailed'
  | 'modelAccessDenied'
  | 'rateLimited'
  | 'requestTooLarge'
  | 'modelOrEndpointError'
  | 'upstreamError'
  | 'truncatedOutput'
  | 'refused'
  | 'emptyOutput'
  | 'invalidOutput'
  | 'renderFailed'
  | 'pdfUnreadable'
  | 'tooManyPages'
  | 'fileTooLarge'
  | 'encryptedPdf'

const RETRYABLE_UPSTREAM_STATUSES = new Set([500, 502, 503, 504])
const UPSTREAM_RETRY_DELAYS_MS = [250, 750] as const
const REQUEST_TIMEOUT_MS = 120_000

export type AIGenerationInput = {
  system: string
  text: string
  images?: string[]
  json?: boolean
  stream?: boolean
}

export type AIRequest = { url: string; headers: Record<string, string>; body: unknown }

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const textValue = (value: unknown) => (typeof value === 'string' ? value : '')

export function validateAIConnection(value: unknown): AIConnection {
  const body = asRecord(value)
  const provider = AI_PROVIDERS.find((item) => item === body.provider)
  if (!provider) {
    throw new AIRequestError('invalidProvider')
  }
  const preset = AI_PROVIDER_DEFINITIONS[provider]
  const protocol = preset.protocols.find(
    (item) => item === ((body.protocol ?? preset.protocol) as AIProtocol),
  )
  if (!protocol) {
    throw new AIRequestError('invalidProvider')
  }
  const apiKey = textValue(body.apiKey).trim()
  const model = textValue(body.model).trim()
  const baseUrl = textValue(body.baseUrl ?? preset.baseUrl)
    .trim()
    .replace(/\/+$/, '')
  if (!apiKey || !model || apiKey.length > 4096 || model.length > 256 || /[\r\n]/.test(apiKey)) {
    throw new AIRequestError('configRequired')
  }
  if (!isValidBaseUrl(baseUrl)) {
    throw new AIRequestError('invalidEndpoint')
  }
  return { provider, protocol, apiKey, model, baseUrl }
}

export function buildAIRequest(connection: AIConnection, input: AIGenerationInput): AIRequest {
  const { protocol, model, apiKey } = connection
  const { system, text, images = [], stream = false, json = false } = input
  const base = connection.baseUrl
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|responses|messages)$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const imageData = (image: string) => {
    const [header, data] = image.split(',')
    return { mimeType: header.slice(5, -7), data }
  }

  if (protocol === 'gemini') {
    headers['x-goog-api-key'] = apiKey
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
    return {
      url: `${base.replace(/\/v1(beta)?$/, '')}/v1beta/models/${encodeURIComponent(
        model.replace(/^models\//, ''),
      )}:${method}`,
      headers,
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [{ text }, ...images.map((image) => ({ inlineData: imageData(image) }))],
          },
        ],
        ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
      },
    }
  }

  if (protocol === 'anthropic') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    return {
      url: `${base}/messages`,
      headers,
      body: {
        model,
        max_tokens: 8192,
        system,
        stream,
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((image) => {
                const { mimeType, data } = imageData(image)
                return {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType, data },
                }
              }),
              { type: 'text', text },
            ],
          },
        ],
      },
    }
  }

  headers.Authorization = `Bearer ${apiKey}`

  if (protocol === 'responses') {
    return {
      url: `${base}/responses`,
      headers,
      body: {
        model,
        instructions: system,
        store: false,
        stream,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text },
              ...images.map((image) => ({ type: 'input_image', image_url: image })),
            ],
          },
        ],
      },
    }
  }

  return {
    url: `${base}/chat/completions`,
    headers,
    body: {
      model,
      stream,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: images.length
            ? [
                { type: 'text', text },
                ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
              ]
            : text,
        },
      ],
    },
  }
}

function checkFinishReason(reason: unknown) {
  const value = textValue(reason)
  if (['MAX_TOKENS', 'max_tokens', 'length'].includes(value)) {
    throw new AIRequestError('truncatedOutput', 502)
  }
  if (
    [
      'SAFETY',
      'RECITATION',
      'BLOCKLIST',
      'PROHIBITED_CONTENT',
      'refusal',
      'content_filter',
    ].includes(value)
  ) {
    throw new AIRequestError('refused', 422)
  }
}

export function readAIOutput(protocol: AIProtocol, value: unknown): string {
  const data = asRecord(value)
  let text: string

  if (protocol === 'gemini') {
    const candidate = asRecord(list(data.candidates)[0])
    checkFinishReason(candidate.finishReason)
    if (asRecord(data.promptFeedback).blockReason) {
      throw new AIRequestError('refused', 422)
    }
    text = list(asRecord(candidate.content).parts)
      .map(asRecord)
      .filter((part) => !part.thought)
      .map((part) => textValue(part.text))
      .join('')
  } else if (protocol === 'anthropic') {
    checkFinishReason(data.stop_reason)
    text = list(data.content)
      .map(asRecord)
      .filter((part) => part.type === 'text')
      .map((part) => textValue(part.text))
      .join('')
  } else if (protocol === 'responses') {
    if (data.status === 'incomplete') {
      throw new AIRequestError('truncatedOutput', 502)
    }
    if (data.status === 'failed' || data.error) {
      throw new AIRequestError('upstreamError', 502)
    }
    const parts = list(data.output)
      .map(asRecord)
      .filter((item) => item.type === 'message')
      .flatMap((item) => list(item.content))
      .map(asRecord)
    if (parts.some((part) => part.type === 'refusal')) {
      throw new AIRequestError('refused', 422)
    }
    text = parts
      .filter((part) => part.type === 'output_text')
      .map((part) => textValue(part.text))
      .join('')
  } else {
    const choice = asRecord(list(data.choices)[0])
    checkFinishReason(choice.finish_reason)
    const message = asRecord(choice.message)
    if (message.refusal) {
      throw new AIRequestError('refused', 422)
    }
    text = textValue(message.content)
  }

  if (!text.trim()) {
    throw new AIRequestError('emptyOutput', 502)
  }
  return text
}

export function readStreamDelta(protocol: AIProtocol, value: unknown): string {
  const data = asRecord(value)
  if (data.error || data.type === 'error') {
    throw new AIRequestError('upstreamError', 502)
  }
  if (protocol === 'chat-completions') {
    const choice = asRecord(list(data.choices)[0])
    checkFinishReason(choice.finish_reason)
    return textValue(asRecord(choice.delta).content)
  }
  if (protocol === 'anthropic') {
    const delta = asRecord(data.delta)
    checkFinishReason(delta.stop_reason)
    return delta.type === 'text_delta' ? textValue(delta.text) : ''
  }
  if (protocol === 'responses') {
    if (data.type === 'response.failed') {
      throw new AIRequestError('upstreamError', 502)
    }
    if (data.type === 'response.incomplete') {
      throw new AIRequestError('truncatedOutput', 502)
    }
    return data.type === 'response.output_text.delta' ? textValue(data.delta) : ''
  }
  const candidate = asRecord(list(data.candidates)[0])
  checkFinishReason(candidate.finishReason)
  if (asRecord(data.promptFeedback).blockReason) {
    throw new AIRequestError('refused', 422)
  }
  return list(asRecord(candidate.content).parts)
    .map(asRecord)
    .filter((part) => !part.thought)
    .map((part) => textValue(part.text))
    .join('')
}

/** 跨任意字节边界解 SSE：处理 CRLF、多行 data 合并、末事件无换行、[DONE] */
export async function* textDeltas(
  body: ReadableStream<Uint8Array>,
  protocol: AIProtocol,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let dataLines: string[] = []

  const flush = () => {
    const data = dataLines.join('\n')
    dataLines = []
    if (!data || data === '[DONE]') {
      return ''
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      // 上游偶尔会吐心跳或非 JSON 帧，跳过而不是中断整条流
      return ''
    }
    return readStreamDelta(protocol, parsed)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (done && pending && !pending.endsWith('\n')) {
        pending += '\n'
      }
      let end = -1
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).replace(/\r$/, '')
        pending = pending.slice(end + 1)
        if (!line) {
          const delta = flush()
          if (delta) {
            yield delta
          }
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''))
        }
      }
      if (done) {
        break
      }
    }
    const delta = flush()
    if (delta) {
      yield delta
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function statusToCode(status: number): AIErrorCode {
  if (status === 401) {
    return 'authenticationFailed'
  }
  if (status === 403) {
    return 'modelAccessDenied'
  }
  if (status === 429) {
    return 'rateLimited'
  }
  if (status === 413) {
    return 'requestTooLarge'
  }
  if (status === 400 || status === 404 || status === 422) {
    return 'modelOrEndpointError'
  }
  return 'upstreamError'
}

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timeout = setTimeout(done, delay)
    function done() {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    function abort() {
      clearTimeout(timeout)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/**
 * 发一次请求，5xx 退避重试 2 次。
 *
 * 浏览器里 fetch 抛 TypeError 时拿不到任何状态码：跨域被拦、DNS 失败、离线三种情况长得一样，
 * 所以统一归到 `corsBlocked`，文案里把两种可能都写出来，别让用户以为是 key 错了。
 */
export async function fetchAI(
  connection: AIConnection,
  input: AIGenerationInput,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const request = buildAIRequest(connection, input)
  const body = JSON.stringify(request.body)
  let response: Response | undefined

  for (let attempt = 0; attempt <= UPSTREAM_RETRY_DELAYS_MS.length; attempt++) {
    try {
      response = await fetcher(request.url, {
        method: 'POST',
        headers: request.headers,
        body,
        signal,
        redirect: 'manual',
      })
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw error
      }
      console.error('[resume-ai] request failed', {
        provider: connection.provider,
        model: connection.model,
        error: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      })
      throw new AIRequestError('corsBlocked', 502)
    }
    if (
      response.ok ||
      !RETRYABLE_UPSTREAM_STATUSES.has(response.status) ||
      attempt === UPSTREAM_RETRY_DELAYS_MS.length
    ) {
      break
    }
    await response.body?.cancel()
    await waitForRetry(UPSTREAM_RETRY_DELAYS_MS[attempt], signal)
  }

  if (!response) {
    throw new AIRequestError('networkError', 502)
  }
  if (!response.ok) {
    const code = statusToCode(response.status)
    console.error('[resume-ai] upstream failed', {
      provider: connection.provider,
      model: connection.model,
      upstreamStatus: response.status,
      requestId:
        response.headers.get('x-request-id') ?? response.headers.get('x-goog-request-id') ?? null,
    })
    await response.body?.cancel()
    throw new AIRequestError(code, response.status >= 500 ? 502 : response.status)
  }
  return response
}

/** 组合用户 abort 与 120s 超时；两者都要能打断重试等待 */
function withTimeout(signal: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
}

export async function requestAIText(
  connection: AIConnection,
  input: AIGenerationInput,
  signal: AbortSignal,
  fetcher?: typeof fetch,
): Promise<string> {
  const response = await fetchAI(
    connection,
    { ...input, stream: false },
    withTimeout(signal),
    fetcher,
  )
  const payload = asRecord(await response.json())
  return readAIOutput(connection.protocol, payload)
}

export async function* requestAIStream(
  connection: AIConnection,
  input: AIGenerationInput,
  signal: AbortSignal,
  fetcher?: typeof fetch,
): AsyncGenerator<string> {
  const response = await fetchAI(
    connection,
    { ...input, stream: true },
    withTimeout(signal),
    fetcher,
  )
  if (!response.body) {
    throw new AIRequestError('emptyOutput', 502)
  }
  yield* textDeltas(response.body, connection.protocol)
}

/** 模型常把 JSON 包在围栏或前后废话里，依次尝试三种剥法 */
export function parseJsonPayload(content: string): unknown {
  const text = content.trim()
  const candidates = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    text.match(/\{[\s\S]*\}/)?.[0],
  ]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    try {
      return JSON.parse(candidate)
    } catch {
      // 换下一种剥法
    }
  }
  throw new AIRequestError('invalidOutput', 502)
}

/**
 * 拉取该凭证下可用的模型列表。
 *
 * 各家 /models 的路径、鉴权头与响应形状都不一样：OpenAI 兼容与 Anthropic 都是
 * `{ data: [...] }`，Gemini 是 `{ models: [...] }` 且 id 带 `models/` 前缀。
 * 只要凭证不要模型名：列表本身就是用来填模型名的。
 */
export type ModelListTarget = { protocol: AIProtocol; apiKey: string; baseUrl: string }

export function buildModelsRequest(target: ModelListTarget): {
  url: string
  headers: Record<string, string>
} {
  const base = target.baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/models$/, '')
  const headers: Record<string, string> = {}
  if (target.protocol === 'gemini') {
    headers['x-goog-api-key'] = target.apiKey
    return { url: `${base.replace(/\/v1(beta)?$/, '')}/v1beta/models`, headers }
  }
  if (target.protocol === 'anthropic') {
    headers['x-api-key'] = target.apiKey
    headers['anthropic-version'] = '2023-06-01'
    return { url: `${base}/models`, headers }
  }
  headers.Authorization = `Bearer ${target.apiKey}`
  return { url: `${base}/models`, headers }
}

/** 从三种响应形状里抠出模型 id，去重并按字母序 */
export function parseModelList(value: unknown): string[] {
  const data = asRecord(value)
  const entries = [...list(data.data), ...list(data.models)]
  const ids = entries
    .map((item) => {
      const entry = asRecord(item)
      return textValue(entry.id) || textValue(entry.name)
    })
    .map((id) => id.replace(/^models\//, '').trim())
    .filter(Boolean)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

export async function listProviderModels(
  target: ModelListTarget,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const { url, headers } = buildModelsRequest(target)
  let response: Response
  try {
    response = await fetcher(url, { method: 'GET', headers, signal, redirect: 'manual' })
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
      throw error
    }
    throw new AIRequestError('corsBlocked', 502)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new AIRequestError(
      statusToCode(response.status),
      response.status >= 500 ? 502 : response.status,
    )
  }
  return parseModelList(await response.json())
}
