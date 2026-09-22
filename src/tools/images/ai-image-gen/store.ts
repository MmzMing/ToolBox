import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  AI_PROVIDER_DEFINITIONS,
  AI_PROVIDERS,
  isValidBaseUrl,
  type AIProvider,
} from '@/modules/ai/providers'
import type { ImageUsage } from '@/modules/ai/transport'

import type { GenParams } from './ai-image-gen.service'
import type { ImageRecord, PromptEntry } from './idb'
import { BUILTIN_SKILLS, mergeSkills, type Skill } from './skills'

export type JobSlotStatus = 'pending' | 'generating' | 'done' | 'failed' | 'cancelled'

export type JobSlot = {
  id: string
  status: JobSlotStatus
  imageId?: string
  errorCode?: string
}

export type JobStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled'

export type Job = {
  id: string
  kind: 'gen' | 'reverse'
  prompt: string
  provider: string
  model: string
  params: GenParams
  referenceCount: number
  skillId?: string
  slots: JobSlot[]
  status: JobStatus
  errorCode?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  usage?: ImageUsage
  revisedPrompt?: string
  candidates?: string[]
}

/** 生图与识图各一份独立 API 配置：key、地址、模型互不牵连 */
export type ApiConfig = {
  provider: AIProvider
  apiKey: string
  baseUrl: string
  model: string
}

const IMAGE_PROVIDERS: readonly AIProvider[] = ['openai', 'gemini']

const defaultApi = (provider: AIProvider): ApiConfig => ({
  provider,
  apiKey: '',
  baseUrl: AI_PROVIDER_DEFINITIONS[provider].baseUrl,
  model: '',
})

const readApi = (value: unknown, fallback: ApiConfig): ApiConfig => {
  const raw = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const provider = AI_PROVIDERS.find((item) => item === raw.provider) ?? fallback.provider
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : ''
  const baseUrl =
    typeof raw.baseUrl === 'string' && isValidBaseUrl(raw.baseUrl)
      ? raw.baseUrl
      : AI_PROVIDER_DEFINITIONS[provider].baseUrl
  const model = typeof raw.model === 'string' ? raw.model.slice(0, 256) : ''
  return { provider, apiKey, baseUrl, model }
}

type AiImageGenState = {
  jobs: Job[]
  history: ImageRecord[]
  historyLoaded: boolean
  hasMoreHistory: boolean
  prompts: PromptEntry[]
  skills: Skill[]
  genApi: ApiConfig
  visionApi: ApiConfig
  modelLists: Partial<Record<AIProvider, string[]>>
  tested: { gen: string; vision: string }
  selectionMode: boolean
  selectedImageIds: string[]

  setGenApi: (patch: Partial<ApiConfig>) => void
  setVisionApi: (patch: Partial<ApiConfig>) => void
  setTested: (slot: 'gen' | 'vision', signature: string) => void
  setModelList: (provider: AIProvider, models: string[]) => void
  addJob: (job: Job) => void
  patchJob: (id: string, patch: Partial<Job>) => void
  patchSlot: (jobId: string, slotId: string, patch: Partial<JobSlot>) => void
  removeJob: (id: string) => void

  setHistory: (records: ImageRecord[], hasMore: boolean) => void
  appendHistory: (records: ImageRecord[]) => void
  removeFromHistory: (id: string) => void
  setHasMoreHistory: (hasMore: boolean) => void

  setPrompts: (entries: PromptEntry[]) => void
  upsertPrompt: (entry: PromptEntry) => void
  removePrompt: (id: string) => void

  setSkills: (skills: Skill[]) => void
  toggleSelectionMode: () => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
}

export const useAiImageGenStore = create<AiImageGenState>()(
  persist(
    (set) => ({
      jobs: [],
      history: [],
      historyLoaded: false,
      hasMoreHistory: false,
      prompts: [],
      skills: [...BUILTIN_SKILLS],
      genApi: defaultApi('openai'),
      visionApi: defaultApi('openai'),
      modelLists: {},
      tested: { gen: '', vision: '' },
      selectionMode: false,
      selectedImageIds: [],

      setGenApi: (patch) =>
        set((state) => {
          const provider =
            patch.provider && IMAGE_PROVIDERS.includes(patch.provider)
              ? patch.provider
              : state.genApi.provider
          const next = { ...state.genApi, ...patch, provider }
          if (patch.provider && patch.provider !== state.genApi.provider) {
            next.baseUrl = AI_PROVIDER_DEFINITIONS[provider].baseUrl
          }
          return { genApi: next }
        }),
      setVisionApi: (patch) =>
        set((state) => {
          const provider =
            patch.provider && AI_PROVIDERS.includes(patch.provider)
              ? patch.provider
              : state.visionApi.provider
          const next = { ...state.visionApi, ...patch, provider }
          if (patch.provider && patch.provider !== state.visionApi.provider) {
            next.baseUrl = AI_PROVIDER_DEFINITIONS[provider].baseUrl
            next.model = ''
          }
          return { visionApi: next }
        }),
      setTested: (slot, signature) =>
        set((state) => ({ tested: { ...state.tested, [slot]: signature } })),
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

      addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
      patchJob: (id, patch) =>
        set((state) => ({
          jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
        })),
      patchSlot: (jobId, slotId, patch) =>
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  slots: job.slots.map((slot) =>
                    slot.id === slotId ? { ...slot, ...patch } : slot,
                  ),
                }
              : job,
          ),
        })),
      removeJob: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),

      setHistory: (records, hasMore) =>
        set({ history: records, historyLoaded: true, hasMoreHistory: hasMore }),
      appendHistory: (records) => set((state) => ({ history: [...records, ...state.history] })),
      removeFromHistory: (id) =>
        set((state) => ({
          history: state.history.filter((record) => record.id !== id),
          selectedImageIds: state.selectedImageIds.filter((selected) => selected !== id),
        })),
      setHasMoreHistory: (hasMore) => set({ hasMoreHistory: hasMore }),

      setPrompts: (entries) => set({ prompts: entries }),
      upsertPrompt: (entry) =>
        set((state) => ({
          prompts: [entry, ...state.prompts.filter((item) => item.text !== entry.text)],
        })),
      removePrompt: (id) =>
        set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id) })),

      setSkills: (skills) => set({ skills }),
      toggleSelectionMode: () =>
        set((state) => ({ selectionMode: !state.selectionMode, selectedImageIds: [] })),
      toggleSelected: (id) =>
        set((state) => ({
          selectedImageIds: state.selectedImageIds.includes(id)
            ? state.selectedImageIds.filter((selected) => selected !== id)
            : [...state.selectedImageIds, id],
        })),
      clearSelection: () => set({ selectedImageIds: [] }),
    }),
    {
      name: 'toolbox.ai-image-gen',
      version: 4,
      partialize: ({ skills, genApi, visionApi, modelLists, tested }) => ({
        customs: skills.filter((skill) => !skill.builtin),
        skillFlags: Object.fromEntries(
          skills.filter((skill) => skill.builtin).map((skill) => [skill.id, skill.enabled]),
        ),
        genApi,
        visionApi,
        modelLists,
        tested,
      }),
      merge: (persisted, current) => {
        const saved = persisted as
          | {
              customs?: unknown[]
              skillFlags?: Record<string, boolean>
              skills?: Skill[]
              genApi?: unknown
              visionApi?: unknown
              modelLists?: Partial<Record<AIProvider, string[]>>
              tested?: { gen?: string; vision?: string }
            }
          | undefined
        return {
          ...current,
          skills: mergeSkills(saved?.customs ?? saved?.skills ?? [], saved?.skillFlags ?? {}),
          genApi: readApi(saved?.genApi, defaultApi('openai')),
          visionApi: readApi(saved?.visionApi, defaultApi('openai')),
          modelLists: saved?.modelLists ?? {},
          tested: { gen: saved?.tested?.gen ?? '', vision: saved?.tested?.vision ?? '' },
        }
      },
    },
  ),
)
