import { describe, expect, it } from 'vitest'

import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFINITIONS,
  activeSlot,
  canModelParsePdf,
  defaultCredentials,
  emptyAISettings,
  isModelConfigured,
  isValidBaseUrl,
  modelSupportsPdf,
  resolveSlot,
  toAIConnection,
} from '@/tools/resume/ai/providers'
import type { AIModelProfile } from '@/tools/resume/ai/providers'

const profile = (overrides: Partial<AIModelProfile> = {}): AIModelProfile => ({
  id: 'slot:text',
  provider: 'deepseek',
  protocol: 'chat-completions',
  apiKey: 'sk-test',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com/v1',
  name: 'deepseek-v4-flash',
  supportsPdf: false,
  ...overrides,
})

describe('provider presets', () => {
  it('ships six providers, each allowing its own protocol and a usable default endpoint', () => {
    expect(AI_PROVIDERS).toHaveLength(6)
    for (const provider of AI_PROVIDERS) {
      const definition = AI_PROVIDER_DEFINITIONS[provider]
      expect(definition.protocols).toContain(definition.protocol)
      expect(isValidBaseUrl(definition.baseUrl)).toBe(true)
      expect(defaultCredentials(provider)).toEqual({ apiKey: '', baseUrl: definition.baseUrl })
    }
  })

  it('starts from empty settings with a credential slot per provider', () => {
    const settings = emptyAISettings()
    expect(Object.keys(settings.credentials)).toHaveLength(AI_PROVIDERS.length)
    expect(Object.keys(settings.picks)).toHaveLength(AI_PROVIDERS.length)
    expect(settings.modelLists).toEqual({})
    expect(settings.picks.deepseek).toEqual({ text: null, pdf: null })
    expect(settings.activeProvider).toBe('deepseek')
  })
})

describe('model capability inference', () => {
  it('reads vision support off the model name', () => {
    expect(modelSupportsPdf('deepseek', 'deepseek-v4-flash-vision-exp')).toBe(true)
    expect(modelSupportsPdf('deepseek', 'deepseek-v4-flash')).toBe(false)
    expect(modelSupportsPdf('qwen', 'qwen3-vl-plus')).toBe(true)
    expect(modelSupportsPdf('openai', 'gpt-4o-mini')).toBe(true)
    expect(modelSupportsPdf('anthropic', 'claude-3-5-sonnet')).toBe(true)
    expect(modelSupportsPdf('gemini', 'text-embedding-004')).toBe(false)
    expect(modelSupportsPdf('deepseek', 'some-random-text-model')).toBe(false)
  })

  it('treats an empty model name as text-only', () => {
    expect(modelSupportsPdf('qwen', '   ')).toBe(false)
  })

  it('canModelParsePdf recomputes from the model name, not the stored flag', () => {
    expect(
      canModelParsePdf(profile({ model: 'deepseek-v4-flash-vision-exp', supportsPdf: false })),
    ).toBe(true)
  })
})

describe('baseUrl validation', () => {
  it('accepts https origins and loopback http only', () => {
    expect(isValidBaseUrl('https://api.deepseek.com/v1')).toBe(true)
    expect(isValidBaseUrl(' http://127.0.0.1:8000/v1 ')).toBe(true)
    expect(isValidBaseUrl('http://localhost:1234/v1')).toBe(true)
  })

  it('rejects cleartext http to remote hosts because the key would travel unencrypted', () => {
    expect(isValidBaseUrl('http://api.example.com/v1')).toBe(false)
    expect(isValidBaseUrl('http://10.0.0.7:8000/v1')).toBe(false)
  })

  it('rejects credentials, queries, hashes and other protocols', () => {
    expect(isValidBaseUrl('https://user:pw@api.example.com')).toBe(false)
    expect(isValidBaseUrl('https://api.example.com/v1?key=1')).toBe(false)
    expect(isValidBaseUrl('https://api.example.com/v1#frag')).toBe(false)
    expect(isValidBaseUrl('file:///etc/passwd')).toBe(false)
    expect(isValidBaseUrl('javascript:alert(1)')).toBe(false)
    expect(isValidBaseUrl('not a url')).toBe(false)
  })
})

describe('connection readiness', () => {
  it('requires key, model, valid endpoint and a protocol the provider allows', () => {
    expect(isModelConfigured(profile())).toBe(true)
    expect(isModelConfigured(profile({ apiKey: '  ' }))).toBe(false)
    expect(isModelConfigured(profile({ model: '' }))).toBe(false)
    expect(isModelConfigured(profile({ baseUrl: 'javascript:alert(1)' }))).toBe(false)
    expect(isModelConfigured(profile({ protocol: 'responses' }))).toBe(false)
    expect(isModelConfigured(profile({ provider: 'openai', protocol: 'responses' }))).toBe(true)
  })

  it('trims credentials and strips a trailing slash from the endpoint', () => {
    expect(
      toAIConnection(profile({ apiKey: ' sk-x ', model: ' m ', baseUrl: 'https://a.b/v1//' })),
    ).toMatchObject({ apiKey: 'sk-x', model: 'm', baseUrl: 'https://a.b/v1' })
  })
})

describe('resolveSlot', () => {
  const credentials = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1' }

  it('builds a usable connection from a typed model name', () => {
    const profile = resolveSlot(
      { provider: 'deepseek', model: ' deepseek-chat ' },
      credentials,
      'text',
    )
    expect(profile).toMatchObject({
      provider: 'deepseek',
      protocol: 'chat-completions',
      model: 'deepseek-chat',
      apiKey: 'sk-test',
    })
    expect(profile?.supportsPdf).toBe(false)
  })

  it('returns null for an empty slot or a blank model name', () => {
    expect(resolveSlot(null, credentials, 'text')).toBeNull()
    expect(resolveSlot({ provider: 'deepseek', model: '   ' }, credentials, 'text')).toBeNull()
  })

  it('needs a key and a valid endpoint to count as configured', () => {
    expect(
      resolveSlot({ provider: 'deepseek', model: 'm' }, { ...credentials, apiKey: '' }, 'text'),
    ).toBeNull()
    expect(
      resolveSlot(
        { provider: 'deepseek', model: 'm' },
        { ...credentials, baseUrl: 'javascript:alert(1)' },
        'text',
      ),
    ).toBeNull()
  })

  it('accepts any model name in the vision slot and just records what the name hints at', () => {
    const plain = resolveSlot({ provider: 'deepseek', model: 'deepseek-chat' }, credentials, 'pdf')
    expect(plain?.supportsPdf).toBe(false)
    const vision = resolveSlot(
      { provider: 'deepseek', model: 'deepseek-v4-vision' },
      credentials,
      'pdf',
    )
    expect(vision?.supportsPdf).toBe(true)
  })
})

describe('activeSlot', () => {
  const settings = {
    ...emptyAISettings(),
    picks: {
      ...emptyAISettings().picks,
      qwen: { text: 'qwen3-vl-plus', pdf: null },
      deepseek: { text: 'deepseek-chat', pdf: 'deepseek-v4-vision' },
    },
    activeProvider: 'qwen' as const,
  }

  it('reads only the active provider pick', () => {
    expect(activeSlot(settings, 'text')).toEqual({ provider: 'qwen', model: 'qwen3-vl-plus' })
    expect(activeSlot(settings, 'pdf')).toBeNull()
  })

  it('follows the active provider when it changes', () => {
    expect(activeSlot({ ...settings, activeProvider: 'deepseek' }, 'pdf')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-vision',
    })
  })
})
