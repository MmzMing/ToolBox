import { describe, expect, it } from 'vitest'

import type { AIConnection } from '@/modules/ai/providers'
import {
  AIRequestError,
  buildImageRequest,
  readImageOutput,
  requestAIImages,
} from '@/modules/ai/transport'

const openai: AIConnection = {
  provider: 'openai',
  protocol: 'images-openai',
  apiKey: 'sk-test',
  model: 'gpt-image-2',
  baseUrl: 'https://api.openai.com/v1',
}

const gemini: AIConnection = {
  provider: 'gemini',
  protocol: 'images-gemini',
  apiKey: 'goog-test',
  model: 'gemini-2.5-flash-image',
  baseUrl: 'https://generativelanguage.googleapis.com',
}

const params = { count: 2, size: '1024x1024', quality: 'auto' }

const pixel = 'data:image/png;base64,iVBORw0KGgo='

describe('buildImageRequest', () => {
  it('posts JSON to images/generations without references', () => {
    const request = buildImageRequest(openai, { prompt: 'a cat', params })
    expect(request.url).toBe('https://api.openai.com/v1/images/generations')
    expect(request.headers.Authorization).toBe('Bearer sk-test')
    expect(request.body).toMatchObject({ model: 'gpt-image-2', prompt: 'a cat', n: 2 })
  })

  it('switches to multipart images/edits with references and no Content-Type', () => {
    const request = buildImageRequest(openai, {
      prompt: 'edit',
      images: [pixel],
      params: { ...params, inputFidelity: 'high' },
    })
    expect(request.url).toBe('https://api.openai.com/v1/images/edits')
    expect(request.headers['Content-Type']).toBeUndefined()
    const form = request.body as FormData
    expect(form.getAll('image[]')).toHaveLength(1)
    expect(form.get('prompt')).toBe('edit')
    expect(form.get('input_fidelity')).toBe('high')
  })

  it('builds Gemini generateContent with IMAGE modality and imageConfig', () => {
    const request = buildImageRequest(gemini, {
      prompt: 'a cat',
      params: { count: 1, aspectRatio: '16:9', imageSize: '2K', seed: 7 },
    })
    expect(request.url).toContain('/v1beta/models/gemini-2.5-flash-image:generateContent')
    expect(request.headers['x-goog-api-key']).toBe('goog-test')
    const body = request.body as {
      generationConfig: {
        responseModalities: string[]
        imageConfig: Record<string, unknown>
        seed: number
      }
    }
    expect(body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE'])
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' })
    expect(body.generationConfig.seed).toBe(7)
  })
})

describe('readImageOutput', () => {
  it('extracts b64 images, revised prompt and usage from OpenAI', () => {
    const result = readImageOutput(
      'images-openai',
      {
        data: [{ b64_json: 'QUJD', revised_prompt: 'a fluffy cat' }],
        usage: { total_tokens: 12 },
      },
      'image/png',
    )
    expect(result.images).toEqual([{ mimeType: 'image/png', base64: 'QUJD' }])
    expect(result.revisedPrompt).toBe('a fluffy cat')
    expect(result.usage?.totalTokens).toBe(12)
  })

  it('throws noImageInResponse when OpenAI returns nothing', () => {
    expect(() => readImageOutput('images-openai', { data: [] })).toThrow(AIRequestError)
  })

  it('extracts inlineData from Gemini and maps safety refusal', () => {
    const result = readImageOutput('images-gemini', {
      candidates: [
        {
          content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] },
        },
      ],
      usageMetadata: { totalTokenCount: 9 },
    })
    expect(result.images[0].base64).toBe('QUJD')
    expect(result.usage?.totalTokens).toBe(9)
    expect(() =>
      readImageOutput('images-gemini', {
        candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
      }),
    ).toThrow(AIRequestError)
  })
})

describe('requestAIImages', () => {
  it('rejects non-image protocols before touching the network', async () => {
    const text = { ...openai, protocol: 'chat-completions' as const }
    await expect(
      requestAIImages(text, { prompt: 'x', params }, new AbortController().signal),
    ).rejects.toThrow(AIRequestError)
  })
})
