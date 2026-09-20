import { HISTORY_GROUP_WINDOW_MS, HISTORY_LIMIT } from './constants'
import { DEFAULT_TEMPLATE_ID, getTemplateById } from './templates/registry'
import type { ResumeData } from './types'

export type UpdateResumeOptions = {
  /** 传 false 表示这次写入不进撤销栈（用于纯 UI 态） */
  recordHistory?: boolean
}

type HistoryMap = Record<string, ResumeData[]>

type HistoryGroup = { key: string; timestamp: number }

/** 按简历 id 记住上一次入栈的字段组，用于合并同一输入框的连续击键 */
const lastHistoryGroups = new Map<string, HistoryGroup>()

export function cloneResume(resume: ResumeData): ResumeData {
  return structuredClone(resume)
}

/**
 * 以 patch 的字段名集合充当历史分组键。
 *
 * `updatedAt` 与两个 UI 态字段不算"用户改动"，否则每次写入都会因时间戳变化而断开合并窗口。
 */
export function getHistoryKey(
  data: Partial<ResumeData>,
  options?: UpdateResumeOptions,
): string | null {
  if (options?.recordHistory === false) {
    return null
  }

  const recordableKeys = Object.keys(data).filter(
    (key) => key !== 'updatedAt' && key !== 'activeSection' && key !== 'draggingProjectId',
  )

  return recordableKeys.length > 0 ? recordableKeys.sort().join('|') : null
}

export function shouldPushHistoryEntry(resumeId: string, historyKey: string): boolean {
  const now = Date.now()
  const lastGroup = lastHistoryGroups.get(resumeId)
  const shouldPush =
    !lastGroup ||
    lastGroup.key !== historyKey ||
    now - lastGroup.timestamp > HISTORY_GROUP_WINDOW_MS

  if (shouldPush) {
    lastHistoryGroups.set(resumeId, { key: historyKey, timestamp: now })
  }

  return shouldPush
}

export function pushHistory(history: HistoryMap, resumeId: string, resume: ResumeData): HistoryMap {
  return {
    ...history,
    [resumeId]: [...(history[resumeId] ?? []), cloneResume(resume)].slice(-HISTORY_LIMIT),
  }
}

/** 快照里的模板可能已被移除，回退到当前模板，再退到默认模板 */
function restoredTemplateId(snapshot: ResumeData, currentResume: ResumeData): string {
  return (
    getTemplateById(snapshot.templateId)?.id ??
    getTemplateById(currentResume.templateId)?.id ??
    DEFAULT_TEMPLATE_ID
  )
}

/** 快照里的章节可能已被删除，按"当前 → 快照 → 首个章节"逐级回落 */
function restoredActiveSection(snapshot: ResumeData, currentResume: ResumeData): string {
  const sectionIds = new Set(snapshot.menuSections.map((section) => section.id))

  if (sectionIds.has(currentResume.activeSection)) {
    return currentResume.activeSection
  }
  if (sectionIds.has(snapshot.activeSection)) {
    return snapshot.activeSection
  }

  return snapshot.menuSections[0]?.id ?? 'basic'
}

export function restoreResumeSnapshot(snapshot: ResumeData, currentResume: ResumeData): ResumeData {
  return {
    ...cloneResume(snapshot),
    templateId: restoredTemplateId(snapshot, currentResume),
    updatedAt: new Date().toISOString(),
    activeSection: restoredActiveSection(snapshot, currentResume),
    draggingProjectId: currentResume.draggingProjectId,
  }
}

export function clearHistoryGroup(resumeId: string): void {
  lastHistoryGroups.delete(resumeId)
}
