import { describe, expect, it } from 'vitest'

import { migrateAISettings, readLegacyAISettings } from '@/tools/resume/ai/legacy-ai-import'

const storageOf = (value: unknown) => ({
  getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)),
})

describe('migrateAISettings', () => {
  it('folds the oldest flat keys into per-provider credentials', () => {
    const settings = migrateAISettings({
      doubaoApiKey: 'sk-doubao',
      deepseekApiKey: 'sk-deep',
      selectedModel: 'deepseek',
      openaiApiKey: 'sk-open',
      openaiApiEndpoint: 'https://relay.example.com/v1',
      pdfImportProvider: 'openai',
      pdfImportProfiles: { openai: { model: 'gpt-4o' } },
    })
    expect(settings.credentials.deepseek).toMatchObject({ apiKey: 'sk-deep' })
    expect(settings.credentials.openai.baseUrl).toBe('https://relay.example.com/v1')
    // 旧的 deepseek 文本路由固定在 deepseek-chat 上
    expect(settings.picks.deepseek.text).toBe('deepseek-chat')
    expect(settings.picks.openai.pdf).toBe('gpt-4o')
    expect(settings.activeProvider).toBe('deepseek')
  })

  it('keeps the current shape as-is and fills gaps with defaults', () => {
    const settings = migrateAISettings({
      credentials: { deepseek: { apiKey: 'sk-x' } },
      modelLists: { deepseek: ['deepseek-chat', ' deepseek-chat ', '', 42] },
      picks: { deepseek: { text: 'deepseek-chat' } },
      activeProvider: 'deepseek',
    })
    expect(settings.credentials.deepseek).toEqual({
      apiKey: 'sk-x',
      baseUrl: 'https://api.deepseek.com/v1',
    })
    expect(settings.credentials.qwen).toEqual({
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    })
    expect(settings.modelLists.deepseek).toEqual(['deepseek-chat'])
    expect(settings.picks.deepseek).toEqual({ text: 'deepseek-chat', pdf: null })
    expect(settings.activeProvider).toBe('deepseek')
  })

  it('keeps every provider picks so switching the active one loses nothing', () => {
    const settings = migrateAISettings({
      credentials: { qwen: { apiKey: 'sk-q' }, deepseek: { apiKey: 'sk-d' } },
      picks: {
        qwen: { text: 'qwen3-vl-plus', pdf: 'qwen3-vl-plus' },
        deepseek: { text: 'deepseek-chat' },
      },
      activeProvider: 'qwen',
    })
    expect(settings.picks.qwen).toEqual({ text: 'qwen3-vl-plus', pdf: 'qwen3-vl-plus' })
    expect(settings.picks.deepseek).toEqual({ text: 'deepseek-chat', pdf: null })
    expect(settings.activeProvider).toBe('qwen')
  })

  it('lets explicit credentials override what the models array implies', () => {
    const settings = migrateAISettings({
      models: [
        { id: 'a', provider: 'qwen', apiKey: 'sk-old', baseUrl: '', model: 'qwen3-vl-plus' },
      ],
      credentials: { qwen: { apiKey: 'sk-new', baseUrl: 'https://relay.example.com/v1' } },
      textModelId: 'a',
    })
    expect(settings.credentials.qwen.apiKey).toBe('sk-new')
    expect(settings.credentials.qwen.baseUrl).toBe('https://relay.example.com/v1')
    expect(settings.modelLists.qwen).toEqual(['qwen3-vl-plus'])
    expect(settings.picks.qwen.text).toBe('qwen3-vl-plus')
  })

  it('keeps whatever pdf pick was stored; the vision check happens at use time', () => {
    expect(
      migrateAISettings({ picks: { deepseek: { pdf: 'deepseek-chat' } } }).picks.deepseek.pdf,
    ).toBe('deepseek-chat')
    expect(
      migrateAISettings({ pdfModel: { provider: 'qwen', model: 'qwen3-vl-plus' } }).picks.qwen.pdf,
    ).toBe('qwen3-vl-plus')
  })

  it('ignores records with an unknown provider and duplicate ids', () => {
    const settings = migrateAISettings({
      models: [
        { id: 'a', provider: 'evil', apiKey: 'k', model: 'm' },
        { id: 'b', provider: 'qwen', apiKey: 'k', model: 'm1' },
        { id: 'b', provider: 'qwen', apiKey: 'k', model: 'm2' },
      ],
    })
    expect(settings.modelLists.qwen).toEqual(['m1'])
    expect(settings.modelLists.gemini).toBeUndefined()
  })

  it('survives garbage input', () => {
    for (const value of [undefined, null, 'nope', 42, [], {}]) {
      expect(migrateAISettings(value).credentials.deepseek.apiKey).toBe('')
    }
  })
})

describe('readLegacyAISettings', () => {
  it('unwraps the zustand persist envelope', () => {
    const settings = readLegacyAISettings(
      storageOf({ state: { doubaoApiKey: 'sk-legacy', selectedModel: 'doubao' }, version: 0 }),
    )
    expect(settings?.credentials.doubao.apiKey).toBe('sk-legacy')
  })

  it('returns null when the key is absent, unparseable or holds no credential', () => {
    expect(readLegacyAISettings({ getItem: () => null })).toBeNull()
    expect(readLegacyAISettings(storageOf('{ broken json'))).toBeNull()
    expect(readLegacyAISettings(storageOf({ models: [] }))).toBeNull()
  })
})
