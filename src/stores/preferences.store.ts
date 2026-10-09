import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { normalizeActiveCategory } from '@/layouts/app-shell/dock-logic'
import { categoryKeys, type CategoryKey } from '@/tools/categories'

export const supportedLocales = ['zh', 'en'] as const
export type Locale = (typeof supportedLocales)[number]

interface PreferencesState {
  /** 界面语言（i18next 由此驱动，见 modules/i18n） */
  locale: Locale
  /** 上次在 dock 里打开的分类：只用于图标条高亮，刷新后不自动弹面板 */
  activeCategory: CategoryKey | null
  /** GitHub 加速工具的自定义节点前缀（内置节点见 config/github-accelerator.ts，不入库） */
  customAcceleratorNodes: string[]
  /** GitHub 加速工具当前选中的节点前缀；null 表示用列表第一个 */
  acceleratorNode: string | null
  setLocale: (locale: Locale) => void
  setActiveCategory: (category: CategoryKey | null) => void
  setCustomAcceleratorNodes: (nodes: string[]) => void
  setAcceleratorNode: (prefix: string | null) => void
}

function normalizeLocale(value: unknown, fallback: Locale): Locale {
  return supportedLocales.includes(value as Locale) ? (value as Locale) : fallback
}

/**
 * 自定义节点前缀的水合门槛：只认无凭证的 https 主机。
 *
 * 权威校验在工具的 normalizeNodePrefix / buildAcceleratedUrl，这里只负责不把明显垃圾
 * 留在状态里——localStorage 可能被同页脚本或浏览器扩展改坏（AGENTS.md §8）。
 */
function isHttpsNodePrefix(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname.includes('.') &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

/** 自定义节点：只保留合法 https 前缀并去重，脏数据回退为空数组 */
function normalizeNodeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [
    ...new Set(
      value.filter((item): item is string => typeof item === 'string' && isHttpsNodePrefix(item)),
    ),
  ]
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: 'zh',
      activeCategory: null,
      customAcceleratorNodes: [],
      acceleratorNode: null,
      setLocale: (locale) => set({ locale }),
      setActiveCategory: (activeCategory) => set({ activeCategory }),
      setCustomAcceleratorNodes: (customAcceleratorNodes) => set({ customAcceleratorNodes }),
      setAcceleratorNode: (acceleratorNode) => set({ acceleratorNode }),
    }),
    {
      name: 'toolbox.preferences',
      version: 5,
      // v1 -> v2：手风琴改为默认收起，丢弃旧会话遗留的展开状态（语言与侧栏折叠偏好保留）
      // v2 -> v3：新增自定义加速节点，旧数据缺字段时由 merge 兜底为空数组
      // v3 -> v4：新增当前选中的加速节点，旧数据缺字段时由 merge 兜底为 null
      // v4 -> v5：侧栏换成悬浮 dock 后不再有折叠态与多分类同时展开，两个旧字段一并丢弃
      migrate: (persisted) => {
        const {
          expandedCategories: _expandedCategories,
          sidebarCollapsed: _sidebarCollapsed,
          ...saved
        } = (persisted ?? {}) as Partial<PreferencesState> & {
          expandedCategories?: unknown
          sidebarCollapsed?: unknown
        }
        return { ...saved, activeCategory: null }
      },
      // localStorage 可能被手工改坏：读取时逐字段校验兜底（agent.md §8）
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PreferencesState>
        return {
          ...current,
          locale: normalizeLocale(saved.locale, current.locale),
          activeCategory: normalizeActiveCategory(saved.activeCategory, categoryKeys),
          customAcceleratorNodes: normalizeNodeList(saved.customAcceleratorNodes),
          acceleratorNode:
            typeof saved.acceleratorNode === 'string' && isHttpsNodePrefix(saved.acceleratorNode)
              ? saved.acceleratorNode
              : null,
        }
      },
    },
  ),
)
