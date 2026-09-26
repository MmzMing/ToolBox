import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  normalizeModel,
  type HttpRequestModel,
} from '@/tools/development/curl-generator/request-model'

export interface HistoryEntry {
  readonly id: string
  readonly at: number
  readonly summary: string
  /** 存入时的 curl 命令，兼作去重键与菜单里的预览文本 */
  readonly command: string
  readonly model: unknown
}

interface CurlHistoryState {
  entries: HistoryEntry[]
  /** 同一命令重复生成只保留最新一条 */
  remember: (model: HttpRequestModel, command: string, summary: string) => void
  remove: (id: string) => void
  clear: () => void
}

const MAX_ENTRIES = 20

let seed = 0
function nextId(): string {
  seed += 1
  return `h${Date.now()}-${seed}`
}

function normalizeEntry(value: unknown): HistoryEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const source = value as Record<string, unknown>
  const model = normalizeModel(source.model)
  if (model === null) return null
  return {
    id: typeof source.id === 'string' ? source.id : nextId(),
    at: typeof source.at === 'number' ? source.at : Date.now(),
    summary: typeof source.summary === 'string' ? source.summary : '',
    command: typeof source.command === 'string' ? source.command : '',
    model,
  }
}

/**
 * cURL 工具的最近请求历史。localStorage 可能被扩展或手工改坏，
 * 读取时统一走 normalizeEntry 兜底（AGENTS.md §8）。
 */
export const useCurlHistoryStore = create<CurlHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      remember: (model, command, summary) => {
        if (command.trim() === '') return
        const entry: HistoryEntry = { id: nextId(), at: Date.now(), summary, command, model }
        set({
          entries: [entry, ...get().entries.filter((item) => item.command !== command)].slice(
            0,
            MAX_ENTRIES,
          ),
        })
      },
      remove: (id) => set({ entries: get().entries.filter((entry) => entry.id !== id) }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'toolbox.curl-history',
      version: 1,
      migrate: (persisted) => (persisted ?? {}) as Partial<CurlHistoryState>,
      merge: (persisted, current) => {
        const source = (persisted ?? {}) as { entries?: unknown }
        const entries = Array.isArray(source.entries)
          ? source.entries
              .map(normalizeEntry)
              .filter((entry): entry is HistoryEntry => entry !== null)
              .slice(0, MAX_ENTRIES)
          : []
        return { ...current, entries }
      },
    },
  ),
)
