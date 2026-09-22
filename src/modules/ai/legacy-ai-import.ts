import {
  AI_PROVIDERS,
  AI_PROVIDER_DEFINITIONS,
  defaultCredentials,
  emptyAISettings,
  type AIProvider,
  type AISettingsData,
  type SlotModel,
} from './providers'

/** 旧应用留在同 origin 的 persist 键 */
export const LEGACY_AI_STORAGE_KEY = 'ai-config-storage'

/**
 * 早期版本的一条模型记录：同厂商共享 key 与 baseUrl，
 * 折叠到「凭证按厂商存一份」时取该厂商第一条带 key 的。
 */
type LegacyRecord = {
  id: string
  provider: AIProvider
  apiKey: string
  baseUrl: string
  model: string
}

type LegacyRead = {
  list: LegacyRecord[]
  textId: string
  pdfId: string
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const isProvider = (value: unknown): value is AIProvider =>
  AI_PROVIDERS.some((provider) => provider === value)

/** 初版的 `{ models: [...] }` 数组：逐字段兜底、丢弃非法厂商 */
function readRecords(old: Record<string, unknown>): LegacyRead {
  const list: LegacyRecord[] = []
  for (const item of Array.isArray(old.models) ? old.models : []) {
    const entry = record(item)
    if (!isProvider(entry.provider) || !text(entry.id)) {
      continue
    }
    if (list.some((model) => model.id === entry.id)) {
      continue
    }
    list.push({
      id: text(entry.id),
      provider: entry.provider,
      apiKey: text(entry.apiKey),
      baseUrl: text(entry.baseUrl) || AI_PROVIDER_DEFINITIONS[entry.provider].baseUrl,
      model: text(entry.model).trim(),
    })
  }
  return { list, textId: text(old.textModelId), pdfId: text(old.pdfModelId) }
}

/** 上上代的扁平键（`doubaoApiKey` 等）与 pdfImport 覆盖项 */
function readFlatKeys(old: Record<string, unknown>): LegacyRead {
  const list: LegacyRecord[] = []
  let textId = ''
  let pdfId = ''

  for (const provider of ['doubao', 'deepseek', 'openai', 'gemini'] as const) {
    const apiKey = text(old[`${provider}ApiKey`])
    const model = text(old[`${provider}ModelId`])
    const baseUrl = provider === 'openai' ? text(old.openaiApiEndpoint) : ''
    if (!apiKey && !baseUrl && !model) {
      continue
    }
    list.push({
      id: `migrated-${provider}`,
      provider,
      apiKey,
      baseUrl: baseUrl || AI_PROVIDER_DEFINITIONS[provider].baseUrl,
      // 保住旧文本路由实际在用的那个模型名
      model: provider === 'deepseek' ? 'deepseek-chat' : model,
    })
    if (old.selectedModel === provider) {
      textId = `migrated-${provider}`
    }
  }

  const overrides = record(old.pdfImportProfiles)
  for (const provider of AI_PROVIDERS) {
    const saved = record(overrides[provider])
    const inherited = list.find((item) => item.provider === provider)
    const selected = (old.pdfImportProvider ?? 'gemini') === provider
    if (!Object.keys(saved).length && !(selected && inherited)) {
      continue
    }
    const model = text(saved.model) || inherited?.model || ''
    const id = `migrated-pdf-${provider}`
    const twin = list.find((item) => item.model === model && item.apiKey === text(saved.apiKey))
    if (twin) {
      if (selected) {
        pdfId = twin.id
      }
      continue
    }
    list.push({
      id,
      provider,
      apiKey: text(saved.apiKey) || inherited?.apiKey || '',
      baseUrl:
        text(saved.baseUrl) || inherited?.baseUrl || AI_PROVIDER_DEFINITIONS[provider].baseUrl,
      model,
    })
    if (selected) {
      pdfId = id
    }
  }
  return { list, textId, pdfId }
}

/** 当前版本的 `credentials` 字段，优先级高于从 models[] 折叠出来的值 */
function applyCredentials(settings: AISettingsData, value: unknown) {
  const source = record(value)
  for (const provider of AI_PROVIDERS) {
    const entry = record(source[provider])
    const apiKey = text(entry.apiKey)
    const baseUrl = text(entry.baseUrl)
    if (apiKey) {
      settings.credentials[provider].apiKey = apiKey
    }
    // 只保留用户真填过的地址，空串留给他们自己的默认端点
    if (baseUrl) {
      settings.credentials[provider].baseUrl = baseUrl
    }
  }
}

function applyModelLists(settings: AISettingsData, value: unknown) {
  const source = record(value)
  for (const provider of AI_PROVIDERS) {
    const entries = Array.isArray(source[provider]) ? source[provider] : []
    const models = [
      ...new Set(
        entries
          .filter((item): item is string => typeof item === 'string' && !!item.trim())
          .map((item) => item.trim()),
      ),
    ]
    if (models.length) {
      settings.modelLists[provider] = models
    }
  }
}

/** 当前版本的 `picks`：每厂商各自记住选过的型号，原样保留（是否支持图片由使用时判） */
function applyPicks(settings: AISettingsData, value: unknown) {
  const source = record(value)
  for (const provider of AI_PROVIDERS) {
    const entry = record(source[provider])
    const pick = settings.picks[provider]
    for (const task of ['text', 'pdf', 'image', 'vision'] as const) {
      const model = text(entry[task]).trim()
      if (model) {
        pick[task] = model
      }
    }
  }
}

const readSlot = (value: unknown): SlotModel | null => {
  const entry = record(value)
  const model = text(entry.model).trim()
  return isProvider(entry.provider) && model ? { provider: entry.provider, model } : null
}

/**
 * 把任意年代的 AI 数据折成当前形状。
 *
 * 四代共存于同一个入口：旧应用的扁平 key、本项目的 models[] 数组、
 * 「全局两个槽」的 v3，以及当前形状（只是补全缺失字段）。
 * 缺什么留默认值，多余的字段一律忽略。
 */
export function migrateAISettings(value: unknown): AISettingsData {
  const old = record(value)
  const { list, textId, pdfId } = Array.isArray(old.models) ? readRecords(old) : readFlatKeys(old)
  const settings = emptyAISettings()

  for (const item of list) {
    const credentials = settings.credentials[item.provider]
    if (!credentials.apiKey && item.apiKey) {
      credentials.apiKey = item.apiKey
    }
    if (item.baseUrl && credentials.baseUrl === defaultCredentials(item.provider).baseUrl) {
      credentials.baseUrl = item.baseUrl
    }
    if (item.model) {
      const seen = (settings.modelLists[item.provider] ??= [])
      if (!seen.includes(item.model)) {
        seen.push(item.model)
      }
    }
  }

  applyCredentials(settings, old.credentials)
  applyModelLists(settings, old.modelLists)
  applyPicks(settings, old.picks)

  // v3 及更早只有一个全局槽，落到对应厂商头上并把那家设为使用中
  const slotById = (id: string): SlotModel | null => {
    const item = id ? list.find((entry) => entry.id === id) : undefined
    return item && item.model ? { provider: item.provider, model: item.model } : null
  }
  const textSlot = readSlot(old.textModel) ?? slotById(textId)
  const pdfSlot = readSlot(old.pdfModel) ?? slotById(pdfId)
  if (textSlot && !settings.picks[textSlot.provider].text) {
    settings.picks[textSlot.provider].text = textSlot.model
  }
  if (pdfSlot && !settings.picks[pdfSlot.provider].pdf) {
    settings.picks[pdfSlot.provider].pdf = pdfSlot.model
  }
  if (isProvider(old.activeProvider)) {
    settings.activeProvider = old.activeProvider
  } else if (textSlot) {
    settings.activeProvider = textSlot.provider
  } else if (pdfSlot) {
    settings.activeProvider = pdfSlot.provider
  }
  return settings
}

/**
 * 读旧应用留在同 origin 的 AI 配置。
 *
 * zustand persist 存的是 `{ state, version }` 信封，也可能被手改成裸对象，两种都要吃。
 * 返回 null 表示没有旧数据可搬。
 */
export function readLegacyAISettings(storage?: Pick<Storage, 'getItem'>): AISettingsData | null {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (!target) {
    return null
  }
  let raw: string | null
  try {
    raw = target.getItem(LEGACY_AI_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) {
    return null
  }
  try {
    const envelope = JSON.parse(raw)
    const settings = migrateAISettings(record(envelope).state ?? envelope)
    return AI_PROVIDERS.some((provider) => settings.credentials[provider].apiKey) ? settings : null
  } catch {
    return null
  }
}

/** 连接层上移 modules/ai 之前的 persist 键；改名时一次性折入，不删旧键 */
export const PREVIOUS_AI_STORAGE_KEY = 'toolbox.resume-ai'

export function readPreviousAISettings(
  storage?: Pick<Storage, 'getItem'>,
): { settings: AISettingsData; enabled: boolean; consentSeen: boolean } | null {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (!target) {
    return null
  }
  let raw: string | null
  try {
    raw = target.getItem(PREVIOUS_AI_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) {
    return null
  }
  try {
    const envelope = record(JSON.parse(raw))
    const state = record(envelope.state ?? envelope)
    return {
      settings: migrateAISettings(state),
      enabled: state.enabled === true,
      consentSeen: state.consentSeen === true,
    }
  } catch {
    return null
  }
}
