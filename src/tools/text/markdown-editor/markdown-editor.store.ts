import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

import { i18n } from '@/modules/i18n'

import type { EditorUi, ViewMode } from './markdown-editor.types'

const VIEW_MODES: readonly ViewMode[] = ['edit', 'split', 'preview']

const DEFAULT_UI: EditorUi = {
  viewMode: 'split',
  syncScroll: true,
  renderMermaid: true,
  renderMath: true,
  // 默认不折行：编辑区保持"一行源码 = 一行显示"，长行靠编辑区底部的横向滚动条看全
  lineWrap: false,
}

type PersistedState = {
  title: string
  content: string
  updatedAt: number
  /** 首访灌示例正文；置真后即使被清空也不复活 */
  seeded: boolean
  ui: EditorUi
}

export type MarkdownEditorState = PersistedState & {
  setTitle: (title: string) => void
  setContent: (content: string) => void
  /** 导入 .md：正文与标题一起换 */
  loadDocument: (title: string, content: string) => void
  setUi: (patch: Partial<EditorUi>) => void
  seedIfEmpty: (content: string, title: string) => void
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const boolFlag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

function normalizeUi(value: unknown): EditorUi {
  const raw = (value ?? {}) as Partial<EditorUi>
  const viewMode = raw.viewMode
  return {
    viewMode:
      viewMode !== undefined && VIEW_MODES.includes(viewMode) ? viewMode : DEFAULT_UI.viewMode,
    syncScroll: boolFlag(raw.syncScroll, DEFAULT_UI.syncScroll),
    renderMermaid: boolFlag(raw.renderMermaid, DEFAULT_UI.renderMermaid),
    renderMath: boolFlag(raw.renderMath, DEFAULT_UI.renderMath),
    lineWrap: boolFlag(raw.lineWrap, DEFAULT_UI.lineWrap),
  }
}

/**
 * v2 及更早存的是文档数组，v3 起只有一份草稿。
 *
 * 迁移取「当前打开的那份」，取不到就退到最近修改的那份——用户手上的稿子不能因为
 * 砍掉多文档功能而消失。
 */
function legacyDraft(raw: Record<string, unknown>): {
  title: string
  content: string
  updatedAt: number
} {
  const docs = Array.isArray(raw.docs) ? (raw.docs as Record<string, unknown>[]) : []
  const wanted =
    docs.find((doc) => str(doc.id) === str(raw.activeDocId)) ??
    [...docs].sort((a, b) => num(b.updatedAt, 0) - num(a.updatedAt, 0))[0]
  return {
    title: str(wanted?.title),
    content: str(wanted?.content),
    updatedAt: num(wanted?.updatedAt, Date.now()),
  }
}

function normalizeState(value: unknown): PersistedState {
  const raw = (value ?? {}) as Record<string, unknown>
  const draft = Array.isArray(raw.docs) ? legacyDraft(raw) : null
  return {
    title: draft ? draft.title : str(raw.title),
    content: draft ? draft.content : str(raw.content),
    updatedAt: draft ? draft.updatedAt : num(raw.updatedAt, Date.now()),
    seeded: raw.seeded === true,
    ui: normalizeUi(raw.ui),
  }
}

const warnedQuota = new Set<string>()

/**
 * 写满配额是可预期的失败（长文档 + 内联 base64 图片），必须让用户看见：只 toast 一次、
 * 保留内存态、不打断编辑。静默失败会让人以为已保存，刷新即全丢。
 */
const safeLocalStorage = (): StateStorage => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch (error) {
      console.warn(`[markdown-editor-store] persist "${name}" failed; edits stay in memory.`, error)
      if (!warnedQuota.has(name)) {
        warnedQuota.add(name)
        toast.error(i18n.t('markdown-editor.storageFull', { ns: 'tools-text' }), {
          duration: 12_000,
        })
      }
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
})

export const useMarkdownEditorStore = create<MarkdownEditorState>()(
  persist(
    (set, get) => ({
      title: '',
      content: '',
      updatedAt: Date.now(),
      seeded: false,
      ui: DEFAULT_UI,

      setTitle: (title) => set({ title, updatedAt: Date.now() }),

      setContent: (content) => set({ content, updatedAt: Date.now() }),

      loadDocument: (title, content) => set({ title, content, updatedAt: Date.now() }),

      setUi: (patch) => set((state) => ({ ui: { ...state.ui, ...patch } })),

      seedIfEmpty: (content, title) => {
        const state = get()
        if (state.seeded || state.content !== '') {
          return
        }
        set({ seeded: true, title, content, updatedAt: Date.now() })
      },
    }),
    {
      name: 'toolbox.markdown-editor',
      version: 3,
      // v2 -> v3：砍掉多文档列表，只留一份草稿（见 legacyDraft）
      migrate: (persisted) => normalizeState(persisted),
      // 同版本的水合同样要过校验：localStorage 可能被同页脚本或扩展改坏（AGENTS.md §8）
      merge: (persisted, current) => ({ ...current, ...normalizeState(persisted) }),
      partialize: (state) => ({
        title: state.title,
        content: state.content,
        updatedAt: state.updatedAt,
        seeded: state.seeded,
        ui: state.ui,
      }),
      storage: createJSONStorage(() => safeLocalStorage()),
    },
  ),
)
