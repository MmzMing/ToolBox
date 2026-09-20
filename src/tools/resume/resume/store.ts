import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

import { DEFAULT_GLOBAL_SETTINGS, FILE_SYNC_DEBOUNCE_MS, HISTORY_LIMIT } from './constants'
import {
  clearSyncDirectoryHandle,
  deleteResumeFile,
  readResumesFromDirectory,
  writeResumeToFile,
} from './file-sync'
import {
  clearHistoryGroup,
  getHistoryKey,
  pushHistory,
  restoreResumeSnapshot,
  shouldPushHistoryEntry,
} from './history'
import { blankResumeEn, blankResumeZh, sampleResumeEn, sampleResumeZh } from './initial-resume-data'
import type { ResumeSeed } from './initial-resume-data'
import {
  alignResumeTimestampWithFile,
  createDefaultCustomItem,
  generateResumeId,
  normalizeResume,
  reorderMenuSections,
  shouldImportFromFile,
} from './resume.service'
import { DEFAULT_TEMPLATE_ID, getTemplateById, getTemplateForResume } from './templates/registry'
import type {
  BasicInfo,
  Certificate,
  CustomItem,
  Education,
  Experience,
  GlobalSettings,
  MenuSection,
  Project,
  ResumeData,
} from './types'
import type { UpdateResumeOptions } from './history'

export type ResumeLocale = 'zh' | 'en'

type HistoryMap = Record<string, ResumeData[]>

interface ResumeState {
  resumes: Record<string, ResumeData>
  activeResumeId: string | null
  activeResume: ResumeData | null
  /** 撤销/重做栈，按简历 id 分桶；不持久化，故刷新后撤销历史清零 */
  history: HistoryMap
  future: HistoryMap
  /** 本地文件夹同步的最近一次成功时间，供顶栏徽标显示状态 */
  lastSyncedAt: number | null
  syncPending: boolean

  createResume: (
    templateId: string | null,
    options?: { blank?: boolean; locale?: ResumeLocale },
  ) => string
  addResume: (resume: ResumeData) => string
  deleteResume: (resume: ResumeData) => void
  duplicateResume: (resumeId: string, locale?: ResumeLocale) => string
  updateResume: (resumeId: string, data: Partial<ResumeData>, options?: UpdateResumeOptions) => void
  updateResumeFromFile: (resume: ResumeData, sourceModifiedAt?: number) => boolean
  setActiveResume: (resumeId: string) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  updateResumeTitle: (title: string) => void
  updateBasicInfo: (data: Partial<BasicInfo>) => void
  updateEducation: (education: Education) => void
  updateEducationBatch: (educations: Education[]) => void
  deleteEducation: (id: string) => void
  updateExperience: (experience: Experience) => void
  updateExperienceBatch: (experiences: Experience[]) => void
  deleteExperience: (id: string) => void
  updateProjects: (project: Project) => void
  updateProjectsBatch: (projects: Project[]) => void
  deleteProject: (id: string) => void
  setDraggingProjectId: (id: string | null) => void
  updateSkillContent: (skillContent: string) => void
  updateSelfEvaluationContent: (content: string) => void
  reorderSections: (nextOrder: MenuSection[]) => void
  toggleSectionVisibility: (sectionId: string) => void
  setActiveSection: (sectionId: string) => void
  updateMenuSections: (sections: MenuSection[]) => void
  createCustomSection: (section: MenuSection) => void
  updateCustomData: (sectionId: string, items: CustomItem[]) => void
  removeCustomData: (sectionId: string) => void
  addCustomItem: (sectionId: string, title: string) => void
  updateCustomItem: (sectionId: string, itemId: string, updates: Partial<CustomItem>) => void
  removeCustomItem: (sectionId: string, itemId: string) => void
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void
  setThemeColor: (color: string) => void
  setTemplate: (templateId: string) => void
  addCertificate: (certificate: Certificate) => void
  updateCertificate: (id: string, updates: Partial<Certificate>) => void
  updateCertificatesBatch: (certificates: Certificate[]) => void
  removeCertificate: (id: string) => void
  forgetSyncDirectory: () => Promise<void>
  /** 手动把当前所有简历写进已授权目录，返回成功份数 */
  syncAllResumes: () => Promise<number>
  /** 从已授权目录读回简历，只有更新的那份会落地 */
  importFromDirectory: () => Promise<{ imported: number; skipped: number }>
}

/** 只持久化数据本身：撤销栈与同步状态属于会话内 UI 态 */
type PersistedResumeState = Pick<ResumeState, 'resumes' | 'activeResumeId'>

const warnedPersistFailures = new Set<string>()

/**
 * 头像与证书图以 base64 存在同一个 blob 里，写满配额是常态而非异常。
 * 失败只提示一次并保留内存态，不能打断编辑。
 */
const safeLocalStorage = (): StateStorage => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch (error) {
      if (!warnedPersistFailures.has(name)) {
        warnedPersistFailures.add(name)
        console.warn(`[resume-store] persist "${name}" failed; edits stay in memory.`, error)
      }
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
})

type PendingSync = { timer: ReturnType<typeof setTimeout>; previous?: ResumeData }

/** 按简历 id 合并高频写入，避免两份简历互相取消对方的落盘 */
const pendingSyncs = new Map<string, PendingSync>()

function cancelPendingSync(resumeId: string): void {
  const pending = pendingSyncs.get(resumeId)
  if (!pending) {
    return
  }
  clearTimeout(pending.timer)
  pendingSyncs.delete(resumeId)
}

let inFlightSyncs = 0

function setSyncPending(delta: number): void {
  inFlightSyncs = Math.max(0, inFlightSyncs + delta)
  useResumeStore.setState({ syncPending: inFlightSyncs > 0 })
}

function scheduleSync(resume: ResumeData, previous?: ResumeData): void {
  const pending = pendingSyncs.get(resume.id)
  if (pending) {
    clearTimeout(pending.timer)
  } else {
    setSyncPending(1)
  }

  const previousForSync = pending?.previous ?? previous

  const timer = setTimeout(() => {
    pendingSyncs.delete(resume.id)
    void writeResumeToFile(resume, previousForSync).then((ok) => {
      setSyncPending(-1)
      if (ok) {
        useResumeStore.setState({ lastSyncedAt: Date.now() })
      }
    })
  }, FILE_SYNC_DEBOUNCE_MS)

  pendingSyncs.set(resume.id, { timer, previous: previousForSync })
}

function seedFor(locale: ResumeLocale, blank: boolean): ResumeSeed {
  if (blank) {
    return locale === 'en' ? blankResumeEn : blankResumeZh
  }
  return locale === 'en' ? sampleResumeEn : sampleResumeZh
}

export const useResumeStore = create<ResumeState>()(
  persist<ResumeState, [], [], PersistedResumeState>(
    (set, get) => ({
      resumes: {},
      activeResumeId: null,
      activeResume: null,
      history: {},
      future: {},
      lastSyncedAt: null,
      syncPending: false,

      createResume: (templateId = null, options = {}) => {
        const locale = options.locale ?? 'zh'
        const id = generateResumeId()
        const template = getTemplateForResume(templateId ?? DEFAULT_TEMPLATE_ID)
        const now = new Date().toISOString()
        const seed = seedFor(locale, options.blank ?? false)

        const resume: ResumeData = {
          ...seed,
          id,
          createdAt: now,
          updatedAt: now,
          templateId: template.id,
          draggingProjectId: null,
          // 种子只写了它关心的几项设置，整体覆盖会让 fontFamily / autoOnePage 等缺省为 undefined
          globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, ...seed.globalSettings },
          title: `${locale === 'en' ? 'New Resume' : '新建简历'} ${id.slice(0, 6)}`,
        }

        set((state) => ({
          resumes: { ...state.resumes, [id]: resume },
          activeResumeId: id,
          activeResume: resume,
          history: { ...state.history, [id]: [] },
          future: { ...state.future, [id]: [] },
        }))

        void writeResumeToFile(resume)

        return id
      },

      addResume: (resume) => {
        set((state) => ({
          resumes: { ...state.resumes, [resume.id]: resume },
          activeResumeId: resume.id,
          activeResume: resume,
          history: { ...state.history, [resume.id]: [] },
          future: { ...state.future, [resume.id]: [] },
        }))

        void writeResumeToFile(resume)

        return resume.id
      },

      /** 所有写操作唯一的入口：打时间戳、入撤销栈、排程落盘 */
      updateResume: (resumeId, data, options) => {
        set((state) => {
          const current = state.resumes[resumeId]
          if (!current) {
            return state
          }

          const historyKey = getHistoryKey(data, options)
          const shouldPush = !!historyKey && shouldPushHistoryEntry(resumeId, historyKey)
          const updated: ResumeData = {
            ...current,
            ...data,
            updatedAt: new Date().toISOString(),
          }

          scheduleSync(updated, current)

          return {
            resumes: { ...state.resumes, [resumeId]: updated },
            activeResume: state.activeResumeId === resumeId ? updated : state.activeResume,
            // 入栈的是改动前的快照，撤销即回到上一步
            history: shouldPush ? pushHistory(state.history, resumeId, current) : state.history,
            future: historyKey ? { ...state.future, [resumeId]: [] } : state.future,
          }
        })
      },

      /** 供启动时的目录扫描调用：只有更新的那份才落地 */
      updateResumeFromFile: (resume, sourceModifiedAt) => {
        const local = get().resumes[resume.id]
        if (!shouldImportFromFile(resume, local, sourceModifiedAt)) {
          return false
        }

        const imported = alignResumeTimestampWithFile(resume, sourceModifiedAt)
        clearHistoryGroup(imported.id)
        cancelPendingSync(imported.id)

        set((state) => ({
          resumes: { ...state.resumes, [imported.id]: imported },
          activeResume: state.activeResumeId === imported.id ? imported : state.activeResume,
          history: { ...state.history, [imported.id]: [] },
          future: { ...state.future, [imported.id]: [] },
        }))

        return true
      },

      setActiveResume: (resumeId) => {
        const { resumes, activeResumeId, activeResume } = get()
        const next = resumes[resumeId] ?? null

        if (activeResumeId === resumeId && activeResume === next) {
          return
        }

        set({ activeResume: next, activeResumeId: resumeId })
      },

      undo: () => {
        const { activeResumeId } = get()
        if (!activeResumeId) {
          return
        }

        set((state) => {
          const current = state.resumes[activeResumeId]
          const stack = state.history[activeResumeId] ?? []
          const previous = stack[stack.length - 1]
          if (!current || !previous) {
            return state
          }

          const restored = restoreResumeSnapshot(previous, current)
          clearHistoryGroup(activeResumeId)
          scheduleSync(restored, current)

          return {
            resumes: { ...state.resumes, [activeResumeId]: restored },
            activeResume: restored,
            history: { ...state.history, [activeResumeId]: stack.slice(0, -1) },
            future: {
              ...state.future,
              [activeResumeId]: [
                structuredClone(current),
                ...(state.future[activeResumeId] ?? []),
              ].slice(0, HISTORY_LIMIT),
            },
          }
        })
      },

      redo: () => {
        const { activeResumeId } = get()
        if (!activeResumeId) {
          return
        }

        set((state) => {
          const current = state.resumes[activeResumeId]
          const stack = state.future[activeResumeId] ?? []
          const next = stack[0]
          if (!current || !next) {
            return state
          }

          const restored = restoreResumeSnapshot(next, current)
          clearHistoryGroup(activeResumeId)
          scheduleSync(restored, current)

          return {
            resumes: { ...state.resumes, [activeResumeId]: restored },
            activeResume: restored,
            history: pushHistory(state.history, activeResumeId, current),
            future: { ...state.future, [activeResumeId]: stack.slice(1) },
          }
        })
      },

      canUndo: () => {
        const { activeResumeId, history } = get()
        return !!activeResumeId && (history[activeResumeId]?.length ?? 0) > 0
      },

      canRedo: () => {
        const { activeResumeId, future } = get()
        return !!activeResumeId && (future[activeResumeId]?.length ?? 0) > 0
      },

      updateResumeTitle: (title) => {
        const { activeResumeId } = get()
        if (activeResumeId) {
          get().updateResume(activeResumeId, { title })
        }
      },

      deleteResume: (resume) => {
        const resumeId = resume.id
        clearHistoryGroup(resumeId)
        cancelPendingSync(resumeId)

        set((state) => {
          const { [resumeId]: _removed, ...rest } = state.resumes
          const { [resumeId]: _history, ...historyRest } = state.history
          const { [resumeId]: _future, ...futureRest } = state.future

          return {
            resumes: rest,
            history: historyRest,
            future: futureRest,
            activeResumeId: state.activeResumeId === resumeId ? null : state.activeResumeId,
            activeResume: state.activeResumeId === resumeId ? null : state.activeResume,
          }
        })

        void deleteResumeFile(resume)
      },

      duplicateResume: (resumeId, locale = 'zh') => {
        const original = get().resumes[resumeId]
        if (!original) {
          return ''
        }

        const id = generateResumeId()
        const now = new Date().toISOString()
        const copy: ResumeData = {
          ...structuredClone(original),
          id,
          title: `${original.title} (${locale === 'en' ? 'Copy' : '复制'})`,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          resumes: { ...state.resumes, [id]: copy },
          activeResumeId: id,
          activeResume: copy,
          history: { ...state.history, [id]: [] },
          future: { ...state.future, [id]: [] },
        }))

        void writeResumeToFile(copy)

        return id
      },

      updateBasicInfo: (data) => {
        const { activeResumeId, activeResume } = get()
        if (activeResumeId && activeResume) {
          get().updateResume(activeResumeId, { basic: { ...activeResume.basic, ...data } })
        }
      },

      /** 条目写入统一为 upsert：新增与编辑共用一个 action */
      updateEducation: (education) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        const exists = current.education.some((item) => item.id === education.id)
        get().updateResume(current.id, {
          education: exists
            ? current.education.map((item) => (item.id === education.id ? education : item))
            : [...current.education, education],
        })
      },

      updateEducationBatch: (educations) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { education: educations })
        }
      },

      deleteEducation: (id) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            education: current.education.filter((item) => item.id !== id),
          })
        }
      },

      updateExperience: (experience) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        const exists = current.experience.some((item) => item.id === experience.id)
        get().updateResume(current.id, {
          experience: exists
            ? current.experience.map((item) => (item.id === experience.id ? experience : item))
            : [...current.experience, experience],
        })
      },

      updateExperienceBatch: (experiences) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { experience: experiences })
        }
      },

      deleteExperience: (id) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            experience: current.experience.filter((item) => item.id !== id),
          })
        }
      },

      updateProjects: (project) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        const exists = current.projects.some((item) => item.id === project.id)
        get().updateResume(current.id, {
          projects: exists
            ? current.projects.map((item) => (item.id === project.id ? project : item))
            : [...current.projects, project],
        })
      },

      updateProjectsBatch: (projects) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { projects })
        }
      },

      deleteProject: (id) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            projects: current.projects.filter((item) => item.id !== id),
          })
        }
      },

      setDraggingProjectId: (id) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { draggingProjectId: id }, { recordHistory: false })
        }
      },

      updateSkillContent: (skillContent) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { skillContent })
        }
      },

      updateSelfEvaluationContent: (selfEvaluationContent) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { selfEvaluationContent })
        }
      },

      reorderSections: (nextOrder) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            menuSections: reorderMenuSections(current.menuSections, nextOrder),
          })
        }
      },

      toggleSectionVisibility: (sectionId) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            menuSections: current.menuSections.map((section) =>
              section.id === sectionId ? { ...section, enabled: !section.enabled } : section,
            ),
          })
        }
      },

      setActiveSection: (sectionId) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { activeSection: sectionId }, { recordHistory: false })
        }
      },

      updateMenuSections: (sections) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { menuSections: sections })
        }
      },

      createCustomSection: (section) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        get().updateResume(current.id, {
          menuSections: [...current.menuSections, section],
          customData: { ...current.customData, [section.id]: [] },
          activeSection: section.id,
        })
      },

      updateCustomData: (sectionId, items) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            customData: { ...current.customData, [sectionId]: items },
          })
        }
      },

      removeCustomData: (sectionId) => {
        const current = get().activeResume
        if (current) {
          const { [sectionId]: _removed, ...rest } = current.customData
          get().updateResume(current.id, { customData: rest })
        }
      },

      addCustomItem: (sectionId, title) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        get().updateResume(current.id, {
          customData: {
            ...current.customData,
            [sectionId]: [...(current.customData[sectionId] ?? []), createDefaultCustomItem(title)],
          },
        })
      },

      updateCustomItem: (sectionId, itemId, updates) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            customData: {
              ...current.customData,
              [sectionId]: (current.customData[sectionId] ?? []).map((item) =>
                item.id === itemId ? { ...item, ...updates } : item,
              ),
            },
          })
        }
      },

      removeCustomItem: (sectionId, itemId) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            customData: {
              ...current.customData,
              [sectionId]: (current.customData[sectionId] ?? []).filter(
                (item) => item.id !== itemId,
              ),
            },
          })
        }
      },

      updateGlobalSettings: (settings) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            globalSettings: { ...current.globalSettings, ...settings },
          })
        }
      },

      setThemeColor: (color) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            globalSettings: { ...current.globalSettings, themeColor: color },
          })
        }
      },

      /**
       * 切模板会连带覆盖主题色与三档间距：模板自带的设计参数就是它要还原的效果，
       * 与旧项目行为一致，用户在 SidePanel 上的自定义会被这一步冲掉。
       */
      setTemplate: (templateId) => {
        const current = get().activeResume
        const template = getTemplateById(templateId)
        if (!current || !template) {
          return
        }

        get().updateResume(current.id, {
          templateId,
          globalSettings: {
            ...current.globalSettings,
            themeColor: template.colorScheme.primary,
            sectionSpacing: template.spacing.sectionGap,
            paragraphSpacing: template.spacing.itemGap,
            pagePadding: template.spacing.contentPadding,
          },
          basic: { ...current.basic, layout: template.basic.layout },
        })
      },

      addCertificate: (certificate) => {
        const current = get().activeResume
        if (!current) {
          return
        }
        const exists = current.certificates.some((item) => item.id === certificate.id)
        get().updateResume(current.id, {
          certificates: exists
            ? current.certificates.map((item) => (item.id === certificate.id ? certificate : item))
            : [...current.certificates, certificate],
        })
      },

      updateCertificate: (id, updates) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            certificates: current.certificates.map((item) =>
              item.id === id ? { ...item, ...updates } : item,
            ),
          })
        }
      },

      updateCertificatesBatch: (certificates) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, { certificates })
        }
      },

      removeCertificate: (id) => {
        const current = get().activeResume
        if (current) {
          get().updateResume(current.id, {
            certificates: current.certificates.filter((item) => item.id !== id),
          })
        }
      },

      forgetSyncDirectory: async () => {
        await clearSyncDirectoryHandle()
        set({ lastSyncedAt: null })
      },

      syncAllResumes: async () => {
        const resumes = Object.values(get().resumes)
        const results = await Promise.all(resumes.map((resume) => writeResumeToFile(resume)))
        const synced = results.filter(Boolean).length
        if (synced > 0) {
          set({ lastSyncedAt: Date.now() })
        }
        return synced
      },

      importFromDirectory: async () => {
        const entries = await readResumesFromDirectory()
        let imported = 0
        let skipped = 0

        for (const entry of entries) {
          const normalized = normalizeResume(entry.resume)
          if (!normalized) {
            skipped += 1
            continue
          }
          if (get().updateResumeFromFile(normalized, entry.sourceModifiedAt)) {
            imported += 1
          } else {
            skipped += 1
          }
        }

        return { imported, skipped }
      },
    }),
    {
      name: 'toolbox.resume',
      storage: createJSONStorage<PersistedResumeState>(() => safeLocalStorage()),
      // 2：章节图标从 emoji 换成 lucide 导出名，水合时要重跑 normalizeResume 换算
      version: 2,
      /** 撤销栈不持久化，因此水合后要按新的 resumes 重算 activeResume */
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<PersistedResumeState>
        const resumes: Record<string, ResumeData> = {}

        for (const [id, value] of Object.entries(state.resumes ?? {})) {
          const normalized = normalizeResume({ ...value, id })
          if (normalized) {
            resumes[id] = normalized
          }
        }

        const activeResumeId =
          state.activeResumeId && resumes[state.activeResumeId] ? state.activeResumeId : null

        return { resumes, activeResumeId }
      },
      partialize: (state): PersistedResumeState => ({
        resumes: state.resumes,
        activeResumeId: state.activeResumeId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedResumeState>
        const resumes = persisted.resumes ?? currentState.resumes
        const activeResumeId = persisted.activeResumeId ?? null

        return {
          ...currentState,
          resumes,
          activeResumeId,
          activeResume: activeResumeId ? (resumes[activeResumeId] ?? null) : null,
        }
      },
    },
  ),
)
