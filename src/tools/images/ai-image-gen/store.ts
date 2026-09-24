import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  AI_PROVIDER_DEFINITIONS,
  AI_PROVIDERS,
  isValidBaseUrl,
  type AIProvider,
} from '@/modules/ai/providers'
import type { ImageUsage } from '@/modules/ai/transport'

import { type CanvasNodeRecord, type GenParams } from './ai-image-gen.service'
import type { ImageRecord, PromptEntry, WorkspaceRecord } from './idb'
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
  /** 所属工作区；画布只渲染当前工作区的任务 */
  workspaceId: string
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

export type Viewport = { x: number; y: number; zoom: number }

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

/** null = 从未移动过视口，交给首屏 fitView；只兜住「值被改坏」 */
const readViewport = (value: unknown): Viewport | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as Record<string, unknown>
  return {
    x: finite(raw.x, DEFAULT_VIEWPORT.x),
    y: finite(raw.y, DEFAULT_VIEWPORT.y),
    zoom: Math.min(4, Math.max(0.1, finite(raw.zoom, DEFAULT_VIEWPORT.zoom))),
  }
}

type AiImageGenState = {
  jobs: Job[]
  history: ImageRecord[]
  historyLoaded: boolean
  prompts: PromptEntry[]
  skills: Skill[]
  genApi: ApiConfig
  visionApi: ApiConfig
  modelLists: Partial<Record<AIProvider, string[]>>
  tested: { gen: string; vision: string }
  /** 画布 overlay 的内存镜像，真相在 IDB canvasNodes */
  overlays: CanvasNodeRecord[]
  /** 工作区列表，真相在 IDB workspaces；顺序即列表顺序 */
  workspaces: WorkspaceRecord[]
  /** 全部图片的工作区归属（含未加载进 history 的其他工作区），供列表统计 */
  imageOwners: { workspaceId?: string; jobId: string }[]
  activeWorkspaceId: string | null
  viewport: Viewport | null
  selectedImageIds: string[]
  /** 出图完成提示：音效 + 页面在后台时的标题计数 */
  sound: boolean

  setGenApi: (patch: Partial<ApiConfig>) => void
  setVisionApi: (patch: Partial<ApiConfig>) => void
  setTested: (slot: 'gen' | 'vision', signature: string) => void
  setModelList: (provider: AIProvider, models: string[]) => void
  setSound: (on: boolean) => void
  addJob: (job: Job) => void
  patchJob: (id: string, patch: Partial<Job>) => void
  patchSlot: (jobId: string, slotId: string, patch: Partial<JobSlot>) => void
  removeJob: (id: string) => void

  setWorkspaces: (records: WorkspaceRecord[]) => void
  setImageOwners: (owners: { workspaceId?: string; jobId: string }[]) => void
  upsertWorkspace: (record: WorkspaceRecord) => void
  dropWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void

  setHistory: (records: ImageRecord[]) => void
  appendHistory: (records: ImageRecord[]) => void
  removeFromHistory: (id: string) => void

  setPrompts: (entries: PromptEntry[]) => void
  upsertPrompt: (entry: PromptEntry) => void
  removePrompt: (id: string) => void

  setSkills: (skills: Skill[]) => void
  setOverlays: (records: CanvasNodeRecord[]) => void
  upsertOverlay: (record: CanvasNodeRecord) => void
  dropOverlay: (nodeId: string) => void
  setViewport: (viewport: Viewport | null) => void
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  clearSelection: () => void
}

export const useAiImageGenStore = create<AiImageGenState>()(
  persist(
    (set) => ({
      jobs: [],
      history: [],
      historyLoaded: false,
      prompts: [],
      skills: [...BUILTIN_SKILLS],
      genApi: defaultApi('openai'),
      visionApi: defaultApi('openai'),
      modelLists: {},
      tested: { gen: '', vision: '' },
      overlays: [],
      workspaces: [],
      imageOwners: [],
      activeWorkspaceId: null,
      viewport: null,
      selectedImageIds: [],
      sound: false,

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
      setSound: (on) => set({ sound: on }),
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

      setHistory: (records) => set({ history: records, historyLoaded: true }),
      appendHistory: (records) => set((state) => ({ history: [...records, ...state.history] })),
      removeFromHistory: (id) =>
        set((state) => ({
          history: state.history.filter((record) => record.id !== id),
          selectedImageIds: state.selectedImageIds.filter((selected) => selected !== id),
        })),

      setPrompts: (entries) => set({ prompts: entries }),
      upsertPrompt: (entry) =>
        set((state) => ({
          prompts: [entry, ...state.prompts.filter((item) => item.text !== entry.text)],
        })),
      removePrompt: (id) =>
        set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id) })),

      setSkills: (skills) => set({ skills }),
      setWorkspaces: (records) => set({ workspaces: records }),
      setImageOwners: (owners) => set({ imageOwners: owners }),
      upsertWorkspace: (record) =>
        set((state) => ({
          workspaces: [record, ...state.workspaces.filter((item) => item.id !== record.id)],
        })),
      dropWorkspace: (id) =>
        set((state) => ({
          workspaces: state.workspaces.filter((item) => item.id !== id),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
          selectedImageIds: state.activeWorkspaceId === id ? [] : state.selectedImageIds,
        })),
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id, selectedImageIds: [] }),
      setOverlays: (records) => set({ overlays: records }),
      upsertOverlay: (record) =>
        set((state) => ({
          overlays: [...state.overlays.filter((item) => item.nodeId !== record.nodeId), record],
        })),
      dropOverlay: (nodeId) =>
        set((state) => ({ overlays: state.overlays.filter((item) => item.nodeId !== nodeId) })),
      setViewport: (viewport) => set({ viewport }),
      toggleSelected: (id) =>
        set((state) => ({
          selectedImageIds: state.selectedImageIds.includes(id)
            ? state.selectedImageIds.filter((selected) => selected !== id)
            : [...state.selectedImageIds, id],
        })),
      setSelected: (ids) => set({ selectedImageIds: ids }),
      clearSelection: () => set({ selectedImageIds: [] }),
    }),
    {
      name: 'toolbox.ai-image-gen',
      version: 7,
      /** 6 及更早版本没有 sound：原样交给 merge 的逐字段校验兜底 */
      migrate: (persisted) => persisted,
      partialize: ({
        skills,
        genApi,
        visionApi,
        modelLists,
        tested,
        viewport,
        activeWorkspaceId,
        sound,
      }) => ({
        customs: skills.filter((skill) => !skill.builtin),
        skillFlags: Object.fromEntries(
          skills.filter((skill) => skill.builtin).map((skill) => [skill.id, skill.enabled]),
        ),
        genApi,
        visionApi,
        modelLists,
        tested,
        viewport,
        activeWorkspaceId,
        sound,
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
              viewport?: unknown
              activeWorkspaceId?: unknown
              sound?: unknown
            }
          | undefined
        return {
          ...current,
          skills: mergeSkills(saved?.customs ?? saved?.skills ?? [], saved?.skillFlags ?? {}),
          genApi: readApi(saved?.genApi, defaultApi('openai')),
          visionApi: readApi(saved?.visionApi, defaultApi('openai')),
          modelLists: saved?.modelLists ?? {},
          tested: { gen: saved?.tested?.gen ?? '', vision: saved?.tested?.vision ?? '' },
          viewport: readViewport(saved?.viewport),
          activeWorkspaceId:
            typeof saved?.activeWorkspaceId === 'string' && saved.activeWorkspaceId
              ? saved.activeWorkspaceId
              : null,
          sound: saved?.sound === true,
        }
      },
    },
  ),
)
