import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const supportedLocales = ['zh', 'en'] as const
export type Locale = (typeof supportedLocales)[number]

interface PreferencesState {
  /** 界面语言（i18next 由此驱动，见 modules/i18n） */
  locale: Locale
  /** 侧栏手风琴展开的分类；null 表示默认全部收起 */
  expandedCategories: string[] | null
  /** 桌面端侧栏是否折叠隐藏 */
  sidebarCollapsed: boolean
  setLocale: (locale: Locale) => void
  setExpandedCategories: (keys: string[] | null) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

function normalizeLocale(value: unknown, fallback: Locale): Locale {
  return supportedLocales.includes(value as Locale) ? (value as Locale) : fallback
}

function normalizeStringArray(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : null
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: 'zh',
      expandedCategories: null,
      sidebarCollapsed: false,
      setLocale: (locale) => set({ locale }),
      setExpandedCategories: (expandedCategories) => set({ expandedCategories }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'toolbox.preferences',
      version: 1,
      // localStorage 可能被手工改坏：读取时逐字段校验兜底（agent.md §8）
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PreferencesState>
        return {
          ...current,
          locale: normalizeLocale(saved.locale, current.locale),
          expandedCategories: normalizeStringArray(saved.expandedCategories),
          sidebarCollapsed:
            typeof saved.sidebarCollapsed === 'boolean'
              ? saved.sidebarCollapsed
              : current.sidebarCollapsed,
        }
      },
    },
  ),
)
