export const AI_PROVIDERS = [
  'openai',
  'gemini',
  'deepseek',
  'anthropic',
  'qwen',
  'doubao',
  'tokenrhythm',
] as const

export type AIProvider = (typeof AI_PROVIDERS)[number]

export type AIProtocol =
  'chat-completions' | 'responses' | 'gemini' | 'anthropic' | 'images-openai' | 'images-gemini'

/** 任务槽类型：文本润色/校对、PDF 视觉导入、生图出图、视觉反推提示词 */
export type AIModelTask = 'text' | 'pdf' | 'image' | 'vision'

export type AIConnection = {
  provider: AIProvider
  protocol: AIProtocol
  apiKey: string
  model: string
  baseUrl: string
}

export type AIModelProfile = AIConnection & {
  id: string
  name: string
  supportsPdf: boolean
}

/** 每个厂商一份凭证：key 与服务地址被该厂商下的所有模型共用 */
export type ProviderCredentials = { apiKey: string; baseUrl: string }

/** 任务槽：厂商 + 模型名。模型名来自「获取模型列表」，也允许手输 */
export type SlotModel = { provider: AIProvider; model: string }

/** 每个厂商记住自己选过的型号，切换使用厂商时不会互相覆盖 */
export type ProviderPicks = {
  text: string | null
  pdf: string | null
  image: string | null
  vision: string | null
}

/** 持久化的 AI 设置：凭证与型号选择都按厂商存一份，activeProvider 决定实际用哪家 */
export type AISettingsData = {
  credentials: Record<AIProvider, ProviderCredentials>
  modelLists: Partial<Record<AIProvider, string[]>>
  picks: Record<AIProvider, ProviderPicks>
  activeProvider: AIProvider
}

/** 浏览器直连可行性提示：来自实测采样，只用于界面提示，不作为可用性判定 */
export type BrowserDirectHint = 'reachable' | 'unknown' | 'blocked'

type ProviderDefinition = {
  name: string
  baseUrl: string
  protocol: AIProtocol
  protocols: readonly AIProtocol[]
  keyUrl: string
  browserDirect: BrowserDirectHint
}

export const AI_PROVIDER_DEFINITIONS: Record<AIProvider, ProviderDefinition> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'chat-completions',
    protocols: ['chat-completions', 'responses', 'images-openai'],
    keyUrl: 'https://platform.openai.com/api-keys',
    // 官方端点不对任意浏览器源返回 CORS 头
    browserDirect: 'blocked',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'chat-completions',
    protocols: ['chat-completions'],
    keyUrl: 'https://bailian.console.aliyun.com',
    browserDirect: 'reachable',
  },
  doubao: {
    name: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'chat-completions',
    protocols: ['chat-completions'],
    keyUrl: 'https://console.volcengine.com/ark',
    browserDirect: 'blocked',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'chat-completions',
    protocols: ['chat-completions'],
    keyUrl: 'https://platform.deepseek.com',
    browserDirect: 'reachable',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    protocol: 'gemini',
    protocols: ['gemini', 'images-gemini'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    browserDirect: 'blocked',
  },
  anthropic: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    protocols: ['anthropic'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    browserDirect: 'blocked',
  },
  tokenrhythm: {
    name: '基元 TokenRhythm',
    baseUrl: 'https://tokenrhythm.studio/v1',
    protocol: 'chat-completions',
    protocols: ['chat-completions'],
    keyUrl: 'https://tokenrhythm.studio/account/keys',
    // 实测预检请求返回 404 且不带任何 Access-Control-* 头，浏览器直连会被 CORS 拦下
    browserDirect: 'blocked',
  },
}

export const defaultCredentials = (provider: AIProvider): ProviderCredentials => ({
  apiKey: '',
  baseUrl: AI_PROVIDER_DEFINITIONS[provider].baseUrl,
})

export const emptyPicks = (): ProviderPicks => ({
  text: null,
  pdf: null,
  image: null,
  vision: null,
})

/** 出图模型目录：只作下拉候选，界面始终允许手输；dall-e-3 已退役，gpt-image-1-mini/1.5 于 2026-12 下线 */
export const IMAGE_MODEL_CATALOG: Record<'openai' | 'gemini', readonly string[]> = {
  openai: ['gpt-image-2', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-1'],
  gemini: ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
}

export const DEFAULT_IMAGE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-image-2',
  gemini: 'gemini-2.5-flash-image',
}

export const emptyAISettings = (): AISettingsData => ({
  credentials: Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider, defaultCredentials(provider)]),
  ) as Record<AIProvider, ProviderCredentials>,
  modelLists: {},
  picks: Object.fromEntries(AI_PROVIDERS.map((provider) => [provider, emptyPicks()])) as Record<
    AIProvider,
    ProviderPicks
  >,
  activeProvider: 'deepseek',
})

/**
 * 从模型名推断能否吃图片。
 *
 * 各家 /models 端点不返回能力字段，只能靠命名惯例。认不出来就当纯文本：
 * 宁可让用户在视觉槽位上换个带 vision 的型号，也不要把图片发给读不了图的模型。
 */
export function modelSupportsPdf(provider: AIProvider, model: string): boolean {
  const id = model.trim().toLowerCase()
  if (!id) {
    return false
  }
  if (provider === 'gemini') {
    return !id.includes('embedding')
  }
  if (provider === 'anthropic') {
    return /claude-(?:3|4|sonnet-4|opus-4|haiku-4)/.test(id)
  }
  if (provider === 'qwen') {
    return /(?:qwen.*(?:vl|omni)|(?:vl|omni).*qwen)/.test(id)
  }
  if (provider === 'openai') {
    return /gpt-4o|gpt-4\.1|gpt-5|(?:^|[-_.])o[134](?:[-_.]|$)|vision|\bvl\b|multimodal/.test(id)
  }
  if (provider === 'doubao') {
    return /vision|\bvl\b|doubao.*seed-1[.-][68]/.test(id)
  }
  return /vision|\bvl\b|multimodal/.test(id)
}

export function canModelParsePdf(model: AIModelProfile): boolean {
  return modelSupportsPdf(model.provider, model.model)
}

/** 本地推理服务（ollama / lmstudio 等）只监听回环地址，允许明文 http */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isValidBaseUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    if (url.username || url.password || url.search || url.hash) {
      return false
    }
    if (url.protocol === 'https:') {
      return true
    }
    /* 明文 http 会把 Authorization 头里的 API key 裸奔在链路上，只放行回环地址 */
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export function isModelConfigured(
  connection: AIConnection | null | undefined,
): connection is AIConnection {
  return (
    !!connection &&
    !!connection.apiKey.trim() &&
    !!connection.model.trim() &&
    isValidBaseUrl(connection.baseUrl) &&
    AI_PROVIDER_DEFINITIONS[connection.provider].protocols.includes(connection.protocol)
  )
}

export function toAIConnection(profile: AIConnection): AIConnection {
  return {
    provider: profile.provider,
    protocol: profile.protocol,
    apiKey: profile.apiKey.trim(),
    model: profile.model.trim(),
    baseUrl: profile.baseUrl.trim().replace(/\/+$/, ''),
  }
}

/**
 * 把任务槽解析成可用连接：厂商与模型名取自槽，key 与 baseUrl 由调用方按厂商传进来。
 *
 * 返回 AIModelProfile 而不是 AIConnection，是为了让润色弹窗、校对与 PDF 导入
 * 沿用同一套 toAIConnection / canModelParsePdf 判定。
 *
 * 不按型号名拦视觉任务：能不能读图只有服务商自己知道，名字里没写 vision 的型号多得很。
 */
export function resolveSlot(
  slot: SlotModel | null | undefined,
  credentials: ProviderCredentials,
  task: AIModelTask,
): AIModelProfile | null {
  if (!slot || !slot.model.trim()) {
    return null
  }
  const preset = AI_PROVIDER_DEFINITIONS[slot.provider]
  const profile: AIModelProfile = {
    id: `slot:${task}`,
    provider: slot.provider,
    protocol: preset.protocol,
    apiKey: credentials.apiKey,
    model: slot.model.trim(),
    baseUrl: credentials.baseUrl,
    name: slot.model.trim(),
    supportsPdf: modelSupportsPdf(slot.provider, slot.model),
  }
  return isModelConfigured(profile) ? profile : null
}

/** 当前生效的任务槽：只认 activeProvider 那一家 */
export function activeSlot(settings: AISettingsData, task: AIModelTask): SlotModel | null {
  const model = settings.picks[settings.activeProvider]?.[task]
  return model ? { provider: settings.activeProvider, model } : null
}
