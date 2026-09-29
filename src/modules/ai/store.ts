import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  AI_PROVIDERS,
  emptyAISettings,
  type AIModelTask,
  type AIProvider,
  type AISettingsData,
  type ProviderCredentials,
  type ProviderPicks,
} from './providers'
import { migrateAISettings, readLegacyAISettings, readPreviousAISettings } from './legacy-ai-import'

export type { AIModelTask }

export type PersistedAISettings = AISettingsData & {
  /** AI 总开关：关闭时所有 AI 入口不渲染 */
  enabled: boolean
  /** 首次开启时的一次性数据流向确认是否已看过 */
  consentSeen: boolean
}

type AIConfigState = PersistedAISettings & {
  setProviderApiKey: (provider: AIProvider, apiKey: string) => void
  setProviderBaseUrl: (provider: AIProvider, baseUrl: string) => void
  setModelList: (provider: AIProvider, models: string[]) => void
  setPick: (provider: AIProvider, task: AIModelTask, model: string | null) => void
  setActiveProvider: (provider: AIProvider) => void
  setEnabled: (enabled: boolean) => void
  markConsentSeen: () => void
  /** 抹掉本机所有厂商的 key：服务地址与型号选择留着，重填 key 时不必再配一遍 */
  clearCredentials: () => void
}

/**
 * 只补全形状，不评判内容。
 *
 * 型号名是否支持图片由 resolveSlot 在使用时判断：这里若按名字猜着把用户的输入清空，
 * 手输框就会出现「打了个字符立刻被吞掉」的现象，而且名字里不带 vision 的真实视觉模型会被误杀。
 */
function normalize(state: PersistedAISettings): PersistedAISettings {
  const picks = Object.fromEntries(
    AI_PROVIDERS.map((provider) => {
      const pick = state.picks?.[provider]
      return [
        provider,
        {
          text: pick?.text || null,
          pdf: pick?.pdf || null,
          image: pick?.image || null,
          vision: pick?.vision || null,
        },
      ]
    }),
  ) as Record<AIProvider, ProviderPicks>
  return { ...state, picks }
}

/** 把任意来源、任意版本的持久化数据规整成当前 schema */
function toSettings(value: unknown): PersistedAISettings {
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return normalize({
    ...migrateAISettings(raw),
    enabled: raw.enabled === true,
    consentSeen: raw.consentSeen === true,
  })
}

/** 首装数据来源优先级：改名前旧键下的设置 > 旧应用遗留 > 空设置 */
const previous = readPreviousAISettings()
const legacy = readLegacyAISettings()

const initial: PersistedAISettings = previous
  ? normalize({
      ...previous.settings,
      enabled: previous.enabled,
      consentSeen: previous.consentSeen,
    })
  : normalize({
      ...(legacy ?? emptyAISettings()),
      enabled: false,
      consentSeen: false,
    })

export const useAIConfigStore = create<AIConfigState>()(
  persist<AIConfigState, [], [], PersistedAISettings>(
    (set) => ({
      ...initial,

      setProviderApiKey: (provider, apiKey) =>
        set((state) => ({
          credentials: {
            ...state.credentials,
            [provider]: { ...state.credentials[provider], apiKey },
          },
        })),

      setProviderBaseUrl: (provider, baseUrl) =>
        set((state) => ({
          credentials: {
            ...state.credentials,
            [provider]: { ...state.credentials[provider], baseUrl },
          },
        })),

      setModelList: (provider, models) =>
        set((state) => ({
          modelLists: {
            ...state.modelLists,
            [provider]: [
              ...new Set(
                models
                  .map((model) => model.trim())
                  .filter((model) => !!model && model.length <= 256),
              ),
            ],
          },
        })),

      setPick: (provider, task, model) =>
        set((state) =>
          normalize({
            ...state,
            picks: {
              ...state.picks,
              [provider]: { ...state.picks[provider], [task]: model },
            },
          }),
        ),

      setActiveProvider: (activeProvider) => set({ activeProvider }),

      setEnabled: (enabled) => set({ enabled }),

      markConsentSeen: () => set({ consentSeen: true }),

      clearCredentials: () =>
        set((state) => ({
          credentials: Object.fromEntries(
            AI_PROVIDERS.map((provider) => [
              provider,
              { ...state.credentials[provider], apiKey: '' },
            ]),
          ) as Record<AIProvider, ProviderCredentials>,
        })),
    }),
    {
      name: 'toolbox.ai',
      version: 5,
      storage: createJSONStorage<PersistedAISettings>(() => localStorage),
      partialize: ({ credentials, modelLists, picks, activeProvider, enabled, consentSeen }) => ({
        credentials,
        modelLists,
        picks,
        activeProvider,
        enabled,
        consentSeen,
      }),
      migrate: toSettings,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...toSettings(persistedState),
      }),
    },
  ),
)
