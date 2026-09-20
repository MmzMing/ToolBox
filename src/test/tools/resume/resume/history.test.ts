import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearHistoryGroup,
  getHistoryKey,
  pushHistory,
  restoreResumeSnapshot,
  shouldPushHistoryEntry,
} from '@/tools/resume/resume/history'
import { HISTORY_LIMIT } from '@/tools/resume/resume/constants'
import { DEFAULT_TEMPLATES } from '@/tools/resume/resume/templates/registry'
import type { ResumeData } from '@/tools/resume/resume/types'

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    id: 'r1',
    title: '简历',
    templateId: 'classic',
    activeSection: 'basic',
    draggingProjectId: null,
    menuSections: [
      { id: 'basic', title: '基本信息', icon: '👤', enabled: true, order: 0 },
      { id: 'skills', title: '技能', icon: '⚡', enabled: true, order: 1 },
    ],
    ...overrides,
  } as ResumeData
}

describe('getHistoryKey', () => {
  it('returns null when the caller opts out of history', () => {
    expect(getHistoryKey({ title: 'x' }, { recordHistory: false })).toBeNull()
  })

  it('ignores bookkeeping and pure UI fields', () => {
    expect(getHistoryKey({ updatedAt: 'now' })).toBeNull()
    expect(getHistoryKey({ activeSection: 'skills' })).toBeNull()
    expect(getHistoryKey({ draggingProjectId: 'p1' })).toBeNull()
  })

  it('names the group by its sorted field set', () => {
    expect(getHistoryKey({ title: 'x', skillContent: 's', templateId: 'modern' })).toBe(
      'skillContent|templateId|title',
    )
  })
})

describe('shouldPushHistoryEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    clearHistoryGroup('r1')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records the first change of a group', () => {
    expect(shouldPushHistoryEntry('r1', 'title')).toBe(true)
  })

  it('coalesces the same group inside the window', () => {
    shouldPushHistoryEntry('r1', 'title')
    vi.advanceTimersByTime(200)

    expect(shouldPushHistoryEntry('r1', 'title')).toBe(false)
  })

  it('splits groups that touch different fields', () => {
    shouldPushHistoryEntry('r1', 'title')

    expect(shouldPushHistoryEntry('r1', 'education')).toBe(true)
  })

  it('starts a new group once the window has elapsed', () => {
    shouldPushHistoryEntry('r1', 'title')
    vi.advanceTimersByTime(1001)

    expect(shouldPushHistoryEntry('r1', 'title')).toBe(true)
  })

  it('tracks resumes independently', () => {
    shouldPushHistoryEntry('r1', 'title')

    expect(shouldPushHistoryEntry('r2', 'title')).toBe(true)
  })
})

describe('pushHistory', () => {
  it('appends a detached snapshot', () => {
    const resume = makeResume()
    const history = pushHistory({}, 'r1', resume)

    expect(history.r1).toHaveLength(1)

    resume.title = '改了'

    expect(history.r1[0].title).toBe('简历')
  })

  it('drops the oldest entries past the limit', () => {
    let history = {} as Record<string, ResumeData[]>

    for (let index = 0; index < HISTORY_LIMIT + 25; index += 1) {
      history = pushHistory(history, 'r1', makeResume({ title: `t${index}` }))
    }

    expect(history.r1).toHaveLength(HISTORY_LIMIT)
    expect(history.r1[0].title).toBe(`t${25}`)
    expect(history.r1[HISTORY_LIMIT - 1].title).toBe(`t${HISTORY_LIMIT + 24}`)
  })

  it('keeps other resumes untouched', () => {
    const first = pushHistory({}, 'r1', makeResume())
    const second = pushHistory(first, 'r2', makeResume({ id: 'r2' }))

    expect(second.r1).toHaveLength(1)
    expect(second.r2).toHaveLength(1)
  })
})

describe('restoreResumeSnapshot', () => {
  it('keeps the snapshot template while it still exists', () => {
    const snapshot = makeResume({ templateId: 'swiss' })

    expect(restoreResumeSnapshot(snapshot, makeResume()).templateId).toBe('swiss')
  })

  it('falls back to the live template once the snapshot one is gone', () => {
    const snapshot = makeResume({ templateId: 'retired' })
    const current = makeResume({ templateId: 'modern' })

    expect(restoreResumeSnapshot(snapshot, current).templateId).toBe('modern')
  })

  it('falls back to the first registered template when both are gone', () => {
    const snapshot = makeResume({ templateId: 'retired-a' })
    const current = makeResume({ templateId: 'retired-b' })

    expect(restoreResumeSnapshot(snapshot, current).templateId).toBe(DEFAULT_TEMPLATES[0].id)
  })

  it('keeps the current section when the snapshot still has it', () => {
    const snapshot = makeResume()
    const current = makeResume({ activeSection: 'skills' })

    expect(restoreResumeSnapshot(snapshot, current).activeSection).toBe('skills')
  })

  it('falls back to the snapshot section once the current one was deleted', () => {
    const snapshot = makeResume({ activeSection: 'skills' })
    const current = makeResume({
      activeSection: 'gone',
      menuSections: [{ id: 'basic', title: '', icon: '', enabled: true, order: 0 }],
    })

    expect(restoreResumeSnapshot(snapshot, current).activeSection).toBe('skills')
  })

  it('falls back to the first section when neither matches', () => {
    const snapshot = makeResume({ activeSection: 'also-gone' })
    const current = makeResume({ activeSection: 'gone' })

    expect(restoreResumeSnapshot(snapshot, current).activeSection).toBe('basic')
  })

  it('leaves an empty resume with no section id at all', () => {
    const snapshot = makeResume({ menuSections: [], activeSection: 'gone' })
    const current = makeResume({ menuSections: [], activeSection: 'gone' })

    expect(restoreResumeSnapshot(snapshot, current).activeSection).toBe('basic')
  })

  it('carries the live drag state and stamps a fresh updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-02T00:00:00.000Z'))

    const snapshot = makeResume({ updatedAt: '2026-01-01T00:00:00.000Z' })
    const current = makeResume({ draggingProjectId: 'p9' })
    const restored = restoreResumeSnapshot(snapshot, current)

    expect(restored.draggingProjectId).toBe('p9')
    expect(restored.updatedAt).toBe('2026-02-02T00:00:00.000Z')

    vi.useRealTimers()
  })

  it('does not alias the snapshot arrays', () => {
    const snapshot = makeResume()
    const restored = restoreResumeSnapshot(snapshot, makeResume())

    restored.menuSections.push({ id: 'custom-1', title: '', icon: '', enabled: true, order: 9 })

    expect(snapshot.menuSections).toHaveLength(2)
  })
})
