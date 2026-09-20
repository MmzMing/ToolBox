import { LEGACY_RESUME_STORAGE_KEY, RESUME_STORAGE_KEY } from './constants'
import { normalizeResume } from './resume.service'
import { useResumeStore } from './store'
import type { ResumeData } from './types'

/**
 * 旧项目（Magic Resume）的 localStorage 键一次性搬入。
 *
 * 迁移成功后把旧键改名而不是删除：出错时用户还能自己捞回，且第二次进入不再触发。
 */

type LegacyEnvelope = {
  state?: {
    resumes?: unknown
    activeResumeId?: string | null
  }
}

function collectLegacyResumes(raw: string): ResumeData[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const envelope = (parsed ?? {}) as LegacyEnvelope
  const stored = envelope.state?.resumes
  // 早期版本把 resumes 存成数组，新版是 Record，两种都吃
  const candidates = Array.isArray(stored)
    ? stored
    : stored && typeof stored === 'object'
      ? Object.values(stored)
      : []

  return candidates
    .map((item) => normalizeResume(item))
    .filter((item): item is ResumeData => item !== null)
}

export type LegacyImportResult = {
  found: boolean
  imported: number
  skipped: number
}

export function migrateLegacyResumes(): LegacyImportResult {
  const empty: LegacyImportResult = { found: false, imported: 0, skipped: 0 }
  const target = useResumeStore.getState()

  if (typeof localStorage === 'undefined' || !target) {
    return empty
  }

  const raw = localStorage.getItem(RESUME_STORAGE_KEY)
  if (!raw) {
    return empty
  }

  const resumes = collectLegacyResumes(raw)
  let imported = 0
  let skipped = 0

  const merged: Record<string, ResumeData> = { ...useResumeStore.getState().resumes }
  for (const resume of resumes) {
    if (merged[resume.id]) {
      skipped += 1
      continue
    }
    merged[resume.id] = resume
    imported += 1
  }

  useResumeStore.setState((state) => ({
    resumes: merged,
    activeResumeId: state.activeResumeId ?? (imported > 0 ? Object.keys(merged)[0] : null),
  }))

  try {
    localStorage.setItem(LEGACY_RESUME_STORAGE_KEY, raw)
    localStorage.removeItem(RESUME_STORAGE_KEY)
  } catch (error) {
    console.warn('[resume-legacy] failed to archive the old storage key', error)
  }

  return { found: true, imported, skipped }
}
