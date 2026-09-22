import { describe, expect, it, vi } from 'vitest'

import {
  AIRequestError,
  buildAIRequest,
  buildModelsRequest,
  fetchAI,
  listProviderModels,
  parseJsonPayload,
  parseModelList,
  readAIOutput,
  readStreamDelta,
  textDeltas,
  validateAIConnection,
} from '@/modules/ai/transport'
import type { ModelListTarget } from '@/modules/ai/transport'
import type { AIConnection } from '@/modules/ai/providers'

const connection = (overrides: Partial<AIConnection> = {}): AIConnection => ({
  provider: 'deepseek',
  protocol: 'chat-completions',
  apiKey: 'sk-test',
  model: 'm1',
  baseUrl: 'https://api.deepseek.com/v1',
  ...overrides,
})

const input = { system: 'sys', text: 'hello' }

describe('validateAIConnection', () => {
  it('accepts a known provider and defaults the protocol', () => {
    expect(validateAIConnection({ provider: 'qwen', apiKey: 'k', model: 'm' })).toMatchObject({
      provider: 'qwen',
      protocol: 'chat-completions',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })
  })

  it('rejects unknown providers, blank credentials and hostile endpoints', () => {
    expect(() => validateAIConnection({ provider: 'evil', apiKey: 'k', model: 'm' })).toThrow(
      AIRequestError,
    )
    expect(() => validateAIConnection({ provider: 'qwen', apiKey: '', model: 'm' })).toThrow(
      'configRequired',
    )
    expect(() => validateAIConnection({ provider: 'qwen', apiKey: 'a\r\nb', model: 'm' })).toThrow(
      'configRequired',
    )
    expect(() =>
      validateAIConnection({
        provider: 'qwen',
        apiKey: 'k',
        model: 'm',
        baseUrl: 'javascript:alert(1)',
      }),
    ).toThrow('invalidEndpoint')
  })
})

describe('buildAIRequest', () => {
  it('uses Bearer auth and a system message for chat-completions', () => {
    const request = buildAIRequest(connection(), input)
    expect(request.url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
    expect(request.headers).not.toHaveProperty('x-api-key')
    const body = request.body as {
      model: string
      messages: Array<{ role: string; content: string }>
    }
    expect(body.model).toBe('m1')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('uses the responses protocol with instructions and input items', () => {
    const request = buildAIRequest(
      connection({
        provider: 'openai',
        protocol: 'responses',
        baseUrl: 'https://api.openai.com/v1',
      }),
      input,
    )
    expect(request.url).toBe('https://api.openai.com/v1/responses')
    expect(request.body).toMatchObject({ instructions: 'sys', store: false })
  })

  it('puts the Gemini key in x-goog-api-key and encodes the model into the path', () => {
    const request = buildAIRequest(
      connection({
        provider: 'gemini',
        protocol: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'models/gemini-3.8-flash',
      }),
      { ...input, json: true },
    )
    expect(request.headers['x-goog-api-key']).toBe('sk-test')
    expect(request.headers).not.toHaveProperty('Authorization')
    expect(request.url).toContain('/v1beta/models/gemini-3.8-flash:generateContent')
    expect(request.body).toMatchObject({
      generationConfig: { responseMimeType: 'application/json' },
    })
  })

  it('sends anthropic-version and max_tokens for Claude', () => {
    const request = buildAIRequest(
      connection({
        provider: 'anthropic',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
      }),
      input,
    )
    expect(request.url).toBe('https://api.anthropic.com/v1/messages')
    expect(request.headers['x-api-key']).toBe('sk-test')
    expect(request.headers['anthropic-version']).toBe('2023-06-01')
    expect(request.body).toMatchObject({ max_tokens: 8192 })
  })

  it('normalizes an endpoint the user pasted with a trailing path or slash', () => {
    const request = buildAIRequest(
      connection({ baseUrl: 'https://api.deepseek.com/v1/chat/completions/' }),
      input,
    )
    expect(request.url).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('attaches images in the shape each protocol expects', () => {
    const withImage = { ...input, images: ['data:image/png;base64,AAA'] }
    expect(buildAIRequest(connection(), withImage).body).toHaveProperty('messages')
    const gemini = buildAIRequest(connection({ provider: 'gemini', protocol: 'gemini' }), withImage)
      .body as { contents: { parts: unknown[] }[] }
    expect(gemini.contents[0].parts).toContainEqual({
      inlineData: { mimeType: 'image/png', data: 'AAA' },
    })
  })
})

describe('readAIOutput', () => {
  it('extracts text per protocol', () => {
    expect(readAIOutput('chat-completions', { choices: [{ message: { content: 'hi' } }] })).toBe(
      'hi',
    )
    expect(
      readAIOutput('anthropic', {
        content: [
          { type: 'thinking', text: 'x' },
          { type: 'text', text: 'hi' },
        ],
      }),
    ).toBe('hi')
    expect(
      readAIOutput('gemini', {
        candidates: [{ content: { parts: [{ text: 'hi' }, { text: 'ignored', thought: true }] } }],
      }),
    ).toBe('hi')
    expect(
      readAIOutput('responses', {
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }],
      }),
    ).toBe('hi')
  })

  it('classifies truncation, refusal and empty payloads', () => {
    expect(() =>
      readAIOutput('chat-completions', { choices: [{ finish_reason: 'length', message: {} }] }),
    ).toThrow('truncatedOutput')
    expect(() =>
      readAIOutput('chat-completions', { choices: [{ message: { refusal: 'no' } }] }),
    ).toThrow('refused')
    expect(() => readAIOutput('gemini', { promptFeedback: { blockReason: 'SAFETY' } })).toThrow(
      'refused',
    )
    expect(() =>
      readAIOutput('chat-completions', { choices: [{ message: { content: '   ' } }] }),
    ).toThrow('emptyOutput')
  })
})

describe('stream decoding', () => {
  const encode = (text: string) => new TextEncoder().encode(text)

  const streamOf = (chunks: Uint8Array[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk))
        controller.close()
      },
    })

  const collect = async (generator: AsyncGenerator<string>) => {
    const seen: string[] = []
    for await (const chunk of generator) {
      seen.push(chunk)
    }
    return seen
  }

  it('reads a delta per protocol', () => {
    expect(readStreamDelta('chat-completions', { choices: [{ delta: { content: 'a' } }] })).toBe(
      'a',
    )
    expect(readStreamDelta('anthropic', { delta: { type: 'text_delta', text: 'b' } })).toBe('b')
    expect(readStreamDelta('anthropic', { delta: { type: 'thinking_delta', text: 'b' } })).toBe('')
    expect(readStreamDelta('responses', { type: 'response.output_text.delta', delta: 'c' })).toBe(
      'c',
    )
    expect(
      readStreamDelta('gemini', { candidates: [{ content: { parts: [{ text: 'd' }] } }] }),
    ).toBe('d')
  })

  it('survives chunk boundaries in the middle of a line and a CRLF terminator', async () => {
    const raw = 'data: {"choices":[{"delta":{"content":"ab"}}]}\r\n\r\ndata: [DONE]\r\n\r\n'
    const chunks = [encode(raw.slice(0, 17)), encode(raw.slice(17, 40)), encode(raw.slice(40))]
    expect(await collect(textDeltas(streamOf(chunks), 'chat-completions'))).toEqual(['ab'])
  })

  it('merges multiple data lines of one event and flushes a final event without a newline', async () => {
    const generator = textDeltas(
      streamOf([encode('data: {"choices":[{"delta":\n'), encode('data: {"content":"x"}}]}\n\n')]),
      'chat-completions',
    )
    expect(await collect(generator)).toEqual(['x'])
  })

  it('skips a non-JSON frame instead of killing the stream', async () => {
    const generator = textDeltas(
      streamOf([encode('data: not json\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n')]),
      'chat-completions',
    )
    expect(await collect(generator)).toEqual(['ok'])
  })
})

describe('fetchAI error mapping', () => {
  const signal = new AbortController().signal

  const responseOf = (status: number, headers: Record<string, string> = {}) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      body: { cancel: () => Promise.resolve() },
    }) as unknown as Response

  it('maps HTTP statuses onto distinct error codes and hides 5xx detail', async () => {
    const cases: Array<[number, string, number]> = [
      [401, 'authenticationFailed', 401],
      [403, 'modelAccessDenied', 403],
      [429, 'rateLimited', 429],
      [413, 'requestTooLarge', 413],
      [404, 'modelOrEndpointError', 404],
      [503, 'upstreamError', 502],
    ]
    for (const [status, code, reported] of cases) {
      const fetcher = vi.fn().mockResolvedValue(responseOf(status))
      await expect(fetchAI(connection(), input, signal, fetcher)).rejects.toMatchObject({
        code,
        status: reported,
      })
    }
  })

  it('reports a cross-origin or unreachable failure as corsBlocked', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchAI(connection(), input, signal, fetcher)).rejects.toMatchObject({
      code: 'corsBlocked',
    })
  })

  it('retries transient 5xx twice then gives up', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseOf(503))
    await expect(fetchAI(connection(), input, signal, fetcher)).rejects.toMatchObject({
      code: 'upstreamError',
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not retry a client error', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseOf(401))
    await expect(fetchAI(connection(), input, signal, fetcher)).rejects.toMatchObject({
      code: 'authenticationFailed',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('parseJsonPayload', () => {
  it('accepts bare JSON, a fenced block and surrounding prose', () => {
    expect(parseJsonPayload('{"a":1}')).toEqual({ a: 1 })
    expect(parseJsonPayload('```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(parseJsonPayload('Sure! Here you go:\n{"a":3}\nHope that helps.')).toEqual({ a: 3 })
  })

  it('throws invalidOutput when nothing parses', () => {
    expect(() => parseJsonPayload('no json at all')).toThrow('invalidOutput')
  })
})

describe('buildModelsRequest', () => {
  const target: ModelListTarget = {
    protocol: 'chat-completions',
    apiKey: 'sk-test',
    baseUrl: 'https://a.b/v1',
  }

  it('uses a bearer GET on /models for OpenAI-compatible endpoints', () => {
    expect(buildModelsRequest(target)).toEqual({
      url: 'https://a.b/v1/models',
      headers: { Authorization: 'Bearer sk-test' },
    })
  })

  it('moves the key into x-goog-api-key and pins the gemini version path', () => {
    const request = buildModelsRequest({
      ...target,
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    })
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(request.headers['x-goog-api-key']).toBe('sk-test')
    expect(request.headers.Authorization).toBeUndefined()
  })

  it('sends anthropic-version alongside x-api-key', () => {
    const request = buildModelsRequest({ ...target, protocol: 'anthropic' })
    expect(request.url).toBe('https://a.b/v1/models')
    expect(request.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
    })
  })

  it('tolerates an endpoint the user pasted with a trailing /models or slash', () => {
    expect(buildModelsRequest({ ...target, baseUrl: 'https://a.b/v1/models/' }).url).toBe(
      'https://a.b/v1/models',
    )
  })
})

describe('parseModelList', () => {
  it('reads both the data and models envelopes', () => {
    expect(parseModelList({ data: [{ id: 'b' }, { id: 'a' }] })).toEqual(['a', 'b'])
    expect(parseModelList({ models: [{ name: 'models/gemini-x' }] })).toEqual(['gemini-x'])
  })

  it('drops blanks, non-objects and duplicates', () => {
    expect(parseModelList({ data: [{ id: 'a' }, { id: ' a ' }, {}, null, { id: '' }] })).toEqual([
      'a',
    ])
    expect(parseModelList(null)).toEqual([])
  })
})

describe('listProviderModels', () => {
  const signal = new AbortController().signal
  const target: ModelListTarget = {
    protocol: 'chat-completions',
    apiKey: 'sk-test',
    baseUrl: 'https://a.b/v1',
  }

  const responseOf = (status: number, payload: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
      body: { cancel: () => Promise.resolve() },
    }) as unknown as Response

  it('issues a GET and returns the parsed ids', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(responseOf(200, { data: [{ id: 'm2' }, { id: 'm1' }] }))
    await expect(listProviderModels(target, signal, fetcher)).resolves.toEqual(['m1', 'm2'])
    expect(fetcher).toHaveBeenCalledWith(
      'https://a.b/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('maps an upstream status and a blocked request the same way fetchAI does', async () => {
    await expect(
      listProviderModels(target, signal, vi.fn().mockResolvedValue(responseOf(401, {}))),
    ).rejects.toMatchObject({ code: 'authenticationFailed', status: 401 })
    await expect(
      listProviderModels(
        target,
        signal,
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      ),
    ).rejects.toMatchObject({ code: 'corsBlocked' })
  })
})
