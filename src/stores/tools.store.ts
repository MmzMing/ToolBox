import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 最近使用记录上限，防止 localStorage 无限增长 */
const MAX_RECENT_ENTRIES = 50

export interface RecentToolEntry {
  path: string
  count: number
  lastUsedAt: number
}

interface ToolsState {
  /** 收藏的工具路径（顺序即展示顺序，支持拖拽排序） */
  favorites: string[]
  recent: RecentToolEntry[]
  toggleFavorite: (path: string) => void
  /** 进入工具页时调用：累计使用次数并刷新时间戳 */
  recordVisit: (path: string) => void
  removeRecent: (path: string) => void
  clearRecent: () => void
  /** 拖拽排序后整体重写收藏顺序 */
  reorderFavorites: (paths: string[]) => void
}

function normalizeFavorites(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.startsWith('/'))
    : []
}

function normalizeRecent(value: unknown): RecentToolEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(
      (item): item is RecentToolEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentToolEntry).path === 'string' &&
        typeof (item as RecentToolEntry).count === 'number' &&
        Number.isFinite((item as RecentToolEntry).lastUsedAt),
    )
    .slice(0, MAX_RECENT_ENTRIES)
}

export const useToolsStore = create<ToolsState>()(
  persist(
    (set) => ({
      favorites: [],
      recent: [],

      toggleFavorite: (path) =>
        set((state) => ({
          favorites: state.favorites.includes(path)
            ? state.favorites.filter((item) => item !== path)
            : [...state.favorites, path],
        })),

      recordVisit: (path) =>
        set((state) => {
          const existing = state.recent.find((entry) => entry.path === path)
          const next = existing
            ? state.recent.map((entry) =>
                entry.path === path
                  ? { ...entry, count: entry.count + 1, lastUsedAt: Date.now() }
                  : entry,
              )
            : [...state.recent, { path, count: 1, lastUsedAt: Date.now() }]
          const trimmed = next
            .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
            .slice(0, MAX_RECENT_ENTRIES)
          return { recent: trimmed }
        }),

      removeRecent: (path) =>
        set((state) => ({ recent: state.recent.filter((entry) => entry.path !== path) })),

      clearRecent: () => set({ recent: [] }),

      reorderFavorites: (paths) => set({ favorites: paths }),
    }),
    {
      name: 'toolbox.tools',
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ToolsState>
        return {
          ...current,
          favorites: normalizeFavorites(saved.favorites),
          recent: normalizeRecent(saved.recent),
        }
      },
    },
  ),
)
