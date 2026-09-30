import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  AI_PROVIDER_DEFINITIONS,
  AI_PROVIDERS,
  isValidBaseUrl,
  type AIProvider,
} from '@/modules/ai/providers'
import type { ImageUsage } from '@/modules/ai/transport'

import {
  HISTORY_LIMIT,
  type CanvasMapRect,
  type CanvasNodeRecord,
  type GenParams,
} from './ai-image-gen.service'
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

/** 参考线：axis 是它自己的坐标轴，x = 竖线（按 x 定位），y = 横线（按 y 定位） */
export type Guide = { id: string; axis: 'x' | 'y'; pos: number }

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
  /** 识图留空指令时用的那个 skill；空串表示取第一个已启用的 */
  visionSkillId: string
  genApi: ApiConfig
  visionApi: ApiConfig
  /** 润色默认复用识图那套凭证；关掉才看 polishApi */
  polishApi: ApiConfig
  polishUsesVision: boolean
  modelLists: Partial<Record<AIProvider, string[]>>
  tested: { gen: string; vision: string; polish: string }
  /** 画布 overlay 的内存镜像，真相在 IDB canvasNodes */
  overlays: CanvasNodeRecord[]
  /** 工作区列表，真相在 IDB workspaces；顺序即列表顺序 */
  workspaces: WorkspaceRecord[]
  /** 全部图片的工作区归属（含未加载进 history 的其他工作区），供列表统计 */
  imageOwners: { workspaceId?: string; jobId: string }[]
  activeWorkspaceId: string | null
  viewport: Viewport | null
  selectedImageIds: string[]
  /** 正下方那个上下文对话框归哪个节点：同一时刻只开一个，刷新即清，不进 persist */
  dialogNodeId: string | null
  /** 参考线与两把开关：都只活在本次会话，刷新即清，不进 persist */
  guides: Guide[]
  rulersOn: boolean
  guidesOn: boolean
  /** 拖节点时的对齐辅助线：只管画不画，不参与落位 */
  alignOn: boolean
  /** 节点图快照栈：撤销/重做只走它，生成产出与图片删除不进栈 */
  past: CanvasNodeRecord[][]
  future: CanvasNodeRecord[][]
  /** 出图完成提示：音效 + 页面在后台时的标题计数 */
  sound: boolean
  /** AI 生图设置弹窗：节点工具条上的润色也要拉它，所以不能只留在页面 state 里 */
  settingsOpen: boolean

  setGenApi: (patch: Partial<ApiConfig>) => void
  /** 抹掉三个槽里存的密钥：服务地址与模型名留着，重填 key 即可继续用 */
  clearApiKeys: () => void
  setVisionApi: (patch: Partial<ApiConfig>) => void
  setPolishApi: (patch: Partial<ApiConfig>) => void
  setPolishUsesVision: (on: boolean) => void
  setTested: (slot: 'gen' | 'vision' | 'polish', signature: string) => void
  setModelList: (provider: AIProvider, models: string[]) => void
  setSound: (on: boolean) => void
  setSettingsOpen: (open: boolean) => void
  addJob: (job: Job) => void
  patchJob: (id: string, patch: Partial<Job>) => void
  patchSlot: (jobId: string, slotId: string, patch: Partial<JobSlot>) => void
  removeJob: (id: string) => void

  setWorkspaces: (records: WorkspaceRecord[]) => void
  setImageOwners: (owners: { workspaceId?: string; jobId: string }[]) => void
  upsertWorkspace: (record: WorkspaceRecord) => void
  patchWorkspaceMap: (id: string, map: CanvasMapRect[]) => void
  dropWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void

  setHistory: (records: ImageRecord[]) => void
  appendHistory: (records: ImageRecord[]) => void
  removeFromHistory: (id: string) => void

  setPrompts: (entries: PromptEntry[]) => void
  upsertPrompt: (entry: PromptEntry) => void
  removePrompt: (id: string) => void

  setSkills: (skills: Skill[]) => void
  setVisionSkillId: (id: string) => void
  setOverlays: (records: CanvasNodeRecord[]) => void
  upsertOverlay: (record: CanvasNodeRecord) => void
  dropOverlay: (nodeId: string) => void
  setViewport: (viewport: Viewport | null) => void
  toggleSelected: (id: string) => void
  setSelected: (ids: string[]) => void
  /** 工具条那颗按钮的开关：再点同一个节点即收起 */
  toggleDialogNode: (id: string) => void
  setDialogNode: (id: string | null) => void
  setGuides: (guides: Guide[]) => void
  toggleRulers: () => void
  toggleGuides: () => void
  toggleAlign: () => void
  /** 动节点图之前先叫它；一次连续操作（拖完一批节点）算一步 */
  pushHistory: () => void
  /**
   * 换栈并交出要落回去的那份快照；没有可换即 null。
   * 只动栈不动 overlays：写库由 orchestrator 做完再 setOverlays，免得界面比 IDB 先走一步。
   */
  stepHistory: (dir: 'undo' | 'redo') => CanvasNodeRecord[] | null
  clearSelection: () => void
}

export const useAiImageGenStore = create<AiImageGenState>()(
  persist(
    (set, get) => ({
      jobs: [],
      history: [],
      historyLoaded: false,
      prompts: [],
      skills: [...BUILTIN_SKILLS],
      visionSkillId: '',
      genApi: defaultApi('openai'),
      visionApi: defaultApi('openai'),
      polishApi: defaultApi('openai'),
      polishUsesVision: true,
      modelLists: {},
      tested: { gen: '', vision: '', polish: '' },
      overlays: [],
      workspaces: [],
      imageOwners: [],
      activeWorkspaceId: null,
      viewport: null,
      selectedImageIds: [],
      dialogNodeId: null,
      guides: [],
      rulersOn: false,
      guidesOn: false,
      alignOn: false,
      past: [],
      future: [],
      sound: false,
      settingsOpen: false,

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
      clearApiKeys: () =>
        set((state) => ({
          genApi: { ...state.genApi, apiKey: '' },
          visionApi: { ...state.visionApi, apiKey: '' },
          polishApi: { ...state.polishApi, apiKey: '' },
        })),
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
      setPolishApi: (patch) =>
        set((state) => {
          const provider =
            patch.provider && AI_PROVIDERS.includes(patch.provider)
              ? patch.provider
              : state.polishApi.provider
          const next = { ...state.polishApi, ...patch, provider }
          if (patch.provider && patch.provider !== state.polishApi.provider) {
            next.baseUrl = AI_PROVIDER_DEFINITIONS[provider].baseUrl
            next.model = ''
          }
          return { polishApi: next }
        }),
      setPolishUsesVision: (on) => set({ polishUsesVision: on }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
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
      setVisionSkillId: (id) => set({ visionSkillId: id }),
      setWorkspaces: (records) => set({ workspaces: records }),
      setImageOwners: (owners) => set({ imageOwners: owners }),
      upsertWorkspace: (record) =>
        set((state) => ({
          workspaces: [record, ...state.workspaces.filter((item) => item.id !== record.id)],
        })),
      /** 只换地图快照，顺序与原地位都不动：快照落库不代表用户又动过这个工作区 */
      patchWorkspaceMap: (id, map) =>
        set((state) => ({
          workspaces: state.workspaces.map((item) => (item.id === id ? { ...item, map } : item)),
        })),
      dropWorkspace: (id) =>
        set((state) => ({
          workspaces: state.workspaces.filter((item) => item.id !== id),
          activeWorkspaceId: state.activeWorkspaceId === id ? null : state.activeWorkspaceId,
          selectedImageIds: state.activeWorkspaceId === id ? [] : state.selectedImageIds,
          past: [],
          future: [],
        })),
      /** 切区即清视口与历史：视口是全局一份，历史快照又只装着本区的节点 */
      setActiveWorkspace: (id) =>
        set({
          activeWorkspaceId: id,
          selectedImageIds: [],
          dialogNodeId: null,
          viewport: null,
          past: [],
          future: [],
        }),
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
      toggleDialogNode: (id) =>
        set((state) => ({ dialogNodeId: state.dialogNodeId === id ? null : id })),
      setDialogNode: (id) => set({ dialogNodeId: id }),
      setGuides: (guides) => set({ guides }),
      toggleRulers: () => set((state) => ({ rulersOn: !state.rulersOn })),
      toggleGuides: () => set((state) => ({ guidesOn: !state.guidesOn })),
      toggleAlign: () => set((state) => ({ alignOn: !state.alignOn })),
      pushHistory: () =>
        set((state) => ({
          past: [...state.past, state.overlays].slice(-HISTORY_LIMIT),
          future: [],
        })),
      stepHistory: (dir) => {
        const { past, future, overlays } = get()
        const from = dir === 'undo' ? past : future
        const target = from[from.length - 1]
        if (!target) {
          return null
        }
        const rest = from.slice(0, -1)
        const keep = [...(dir === 'undo' ? future : past), overlays].slice(-HISTORY_LIMIT)
        set(dir === 'undo' ? { past: rest, future: keep } : { future: rest, past: keep })
        return target
      },
      clearSelection: () => set({ selectedImageIds: [] }),
    }),
    {
      name: 'toolbox.ai-image-gen',
      version: 9,
      /** 8 及更早没有 visionSkillId：原样交给 merge 的逐字段校验兜底 */
      migrate: (persisted) => persisted,
      partialize: ({
        skills,
        visionSkillId,
        genApi,
        visionApi,
        polishApi,
        polishUsesVision,
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
        visionSkillId,
        genApi,
        visionApi,
        polishApi,
        polishUsesVision,
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
              visionSkillId?: unknown
              genApi?: unknown
              visionApi?: unknown
              polishApi?: unknown
              polishUsesVision?: unknown
              modelLists?: Partial<Record<AIProvider, string[]>>
              tested?: { gen?: string; vision?: string; polish?: string }
              viewport?: unknown
              activeWorkspaceId?: unknown
              sound?: unknown
            }
          | undefined
        return {
          ...current,
          skills: mergeSkills(saved?.customs ?? saved?.skills ?? [], saved?.skillFlags ?? {}),
          visionSkillId: typeof saved?.visionSkillId === 'string' ? saved.visionSkillId : '',
          genApi: readApi(saved?.genApi, defaultApi('openai')),
          visionApi: readApi(saved?.visionApi, defaultApi('openai')),
          polishApi: readApi(saved?.polishApi, defaultApi('openai')),
          polishUsesVision: saved?.polishUsesVision !== false,
          modelLists: saved?.modelLists ?? {},
          tested: {
            gen: saved?.tested?.gen ?? '',
            vision: saved?.tested?.vision ?? '',
            polish: saved?.tested?.polish ?? '',
          },
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
