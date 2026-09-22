import { describe, expect, it } from 'vitest'

import {
  a4ContentHeight,
  alignResumeTimestampWithFile,
  createDefaultCustomItem,
  formatDisplayDate,
  isFixedBasicField,
  isPresentValue,
  joinDateRange,
  nextCustomSectionId,
  normalizeResume,
  onePageScale,
  pageBreakOffsets,
  parseDisplayDate,
  parseResumeJson,
  photoBorderRadiusValue,
  ratioMultiplier,
  reissueResume,
  snapBreakOffsets,
  reorderMenuSections,
  resumeFileName,
  sanitizeFileName,
  shouldImportFromFile,
  splitDateRange,
  toStoredMonth,
} from '@/tools/resume/resume/resume.service'
import {
  A4_HEIGHT_PX,
  MAX_PAGE_BREAK_LINES,
  RESUME_MAX_ITEMS_PER_LIST,
} from '@/tools/resume/resume/constants'
import type { MenuSection, PhotoConfig, ResumeData } from '@/tools/resume/resume/types'

function makeResume(overrides: Partial<ResumeData> = {}): ResumeData {
  return {
    id: 'r1',
    title: '简历',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    templateId: 'classic',
    draggingProjectId: null,
    ...overrides,
  } as ResumeData
}

function makeSection(id: string, order = 0): MenuSection {
  return { id, title: id, icon: '', enabled: true, order }
}

describe('splitDateRange', () => {
  it('splits on the canonical separator', () => {
    expect(splitDateRange('2021/07 - 2024/12')).toEqual({ start: '2021/07', end: '2024/12' })
  })

  it.each(['-', '–', '—'])('splits on a bare %s dash', (separator) => {
    expect(splitDateRange(`2021/07${separator}至今`)).toEqual({ start: '2021/07', end: '至今' })
  })

  it('treats a lone value as the start', () => {
    expect(splitDateRange('2021/07')).toEqual({ start: '2021/07', end: '' })
  })

  it('returns empties for empty input', () => {
    expect(splitDateRange(undefined)).toEqual({ start: '', end: '' })
  })
})

describe('joinDateRange', () => {
  it('only inserts the separator when both ends exist', () => {
    expect(joinDateRange('2021/07', '2024/12')).toBe('2021/07 - 2024/12')
    expect(joinDateRange('2021/07', '')).toBe('2021/07')
    expect(joinDateRange('', '')).toBe('')
  })
})

describe('isPresentValue', () => {
  it.each(['至今', 'Present', 'Now', '2021/07 - 至今'])('recognises %s', (value) => {
    expect(isPresentValue(value)).toBe(true)
  })

  it('rejects ordinary dates and blanks', () => {
    expect(isPresentValue('2021/07')).toBe(false)
    expect(isPresentValue(undefined)).toBe(false)
  })
})

describe('parseDisplayDate', () => {
  it.each([
    ['2021-07', '2021-07-01T00:00:00.000Z'],
    ['2021.07', '2021-07-01T00:00:00.000Z'],
    ['2021/07', '2021-07-01T00:00:00.000Z'],
    ['2021-07-15', '2021-07-01T00:00:00.000Z'],
    ['2021', '2021-01-01T00:00:00.000Z'],
  ])('reads %s as the first of its month', (input, expected) => {
    expect(parseDisplayDate(input)?.toISOString()).toBe(expected)
  })

  it.each(['', '至今', '2021-13', '21-07', 'abc'])('returns null for %s', (input) => {
    expect(parseDisplayDate(input)).toBeNull()
  })
})

describe('toStoredMonth', () => {
  it('pads the month and keeps the granularity at month', () => {
    expect(toStoredMonth(new Date(Date.UTC(2021, 6, 1)))).toBe('2021/07')
    expect(toStoredMonth(new Date(Date.UTC(2021, 0, 1)))).toBe('2021/01')
  })
})

describe('formatDisplayDate', () => {
  it('renders zh as YYYY/MM', () => {
    expect(formatDisplayDate('2021-7', 'zh')).toBe('2021/07')
  })

  it('renders other locales through Intl', () => {
    expect(formatDisplayDate('2021/07', 'en')).toContain('2021')
  })

  it('passes unparseable user text through untouched', () => {
    expect(formatDisplayDate('至今', 'zh')).toBe('至今')
  })

  it('formats both ends of a range', () => {
    expect(formatDisplayDate('2021-07 - 2024-12', 'zh')).toBe('2021/07 - 2024/12')
  })

  it('returns empty for empty input', () => {
    expect(formatDisplayDate(undefined, 'zh')).toBe('')
  })
})

describe('basic field guards', () => {
  it('pins name and title as non-draggable, non-deletable', () => {
    expect(isFixedBasicField({ key: 'name' })).toBe(true)
    expect(isFixedBasicField({ key: 'title' })).toBe(true)
    expect(isFixedBasicField({ key: 'email' })).toBe(false)
  })
})

describe('photo config helpers', () => {
  it.each([
    ['1:1', 1],
    ['4:3', 3 / 4],
    ['3:4', 4 / 3],
    ['16:9', 9 / 16],
    ['custom', 1],
  ] as [PhotoConfig['aspectRatio'], number][])('maps %s to its multiplier', (ratio, expected) => {
    expect(ratioMultiplier(ratio)).toBeCloseTo(expected)
  })

  it('resolves border radius presets', () => {
    const config = (
      borderRadius: PhotoConfig['borderRadius'],
      customBorderRadius = 0,
    ): PhotoConfig => ({
      width: 90,
      height: 120,
      aspectRatio: '1:1',
      borderRadius,
      customBorderRadius,
      visible: true,
    })

    expect(photoBorderRadiusValue(config('none'))).toBe('0')
    expect(photoBorderRadiusValue(config('medium'))).toBe('0.5rem')
    expect(photoBorderRadiusValue(config('full'))).toBe('9999px')
    expect(photoBorderRadiusValue(config('custom', 17))).toBe('17px')
    expect(photoBorderRadiusValue(undefined)).toBe('0')
  })
})

describe('page geometry', () => {
  it('subtracts both paddings from the sheet height', () => {
    expect(a4ContentHeight(32)).toBeCloseTo(A4_HEIGHT_PX - 64)
  })

  it('places break lines one usable page apart', () => {
    expect(pageBreakOffsets(0, A4_HEIGHT_PX * 3)).toEqual([A4_HEIGHT_PX, A4_HEIGHT_PX * 2])
  })

  it('produces no lines for a single page', () => {
    expect(pageBreakOffsets(32, 500)).toEqual([])
  })

  it('ignores a padding so large that no page fits', () => {
    expect(pageBreakOffsets(800, 1000)).toEqual([])
  })

  it('caps the number of lines on very long resumes', () => {
    expect(pageBreakOffsets(0, A4_HEIGHT_PX * 100).length).toBe(MAX_PAGE_BREAK_LINES - 1)
  })

  it('stretches each page in local coordinates when the sheet is scaled down', () => {
    const unscaled = pageBreakOffsets(32, 2400)
    const scaled = pageBreakOffsets(32, 2400, 0.5)

    expect(scaled.length).toBeLessThan(unscaled.length)
    expect(scaled[0]).toBeCloseTo(32 + (A4_HEIGHT_PX - 64) * 2)
  })

  it('rejects a non-positive scale', () => {
    expect(pageBreakOffsets(32, 3000, 0)).toEqual([])
    expect(pageBreakOffsets(32, 3000, -1)).toEqual([])
  })

  it('scales content down only when it overflows', () => {
    expect(onePageScale(500, 32)).toBe(1)
    expect(onePageScale(a4ContentHeight(32) * 2, 32)).toBeCloseTo(0.5)
  })

  it('falls back to no scaling on degenerate measurements', () => {
    expect(onePageScale(0, 32)).toBe(1)
    expect(onePageScale(-5, 32)).toBe(1)
    expect(onePageScale(100, 800)).toBe(1)
  })
})

describe('snapBreakOffsets', () => {
  it('moves a cut up to the nearest safe point', () => {
    expect(snapBreakOffsets([1000], [940, 960, 980, 1200], 600)).toEqual([980])
  })

  it('keeps the geometric position when no safe point is available above', () => {
    expect(snapBreakOffsets([1000], [200, 400], 600)).toEqual([1000])
  })

  it('refuses a safe point that would leave too little content on the page', () => {
    // 620 与 1500 都在理想线之下，但离上一刀分别只剩 620 与 700，均小于 800 的最小页高，都应跳过
    expect(snapBreakOffsets([800, 1600], [620, 1500], 800)).toEqual([800, 1600])
    // 同样的安全点，放宽最小页高后就能吸附
    expect(snapBreakOffsets([800, 1600], [620, 1500], 600)).toEqual([620, 1500])
  })

  it('never lets two cuts collapse onto the same point', () => {
    const result = snapBreakOffsets([1000, 1100], [990], 100)

    expect(result[0]).toBe(990)
    expect(result[1]).toBe(1100)
  })

  it('ignores non-finite and non-positive safe points', () => {
    expect(snapBreakOffsets([1000], [0, -5, Number.NaN, 900], 400)).toEqual([900])
  })

  it('returns nothing for no ideal offsets', () => {
    expect(snapBreakOffsets([], [900], 400)).toEqual([])
  })
})

describe('reorderMenuSections', () => {
  it('keeps basic first and reindexes the rest', () => {
    const current = [makeSection('basic'), makeSection('skills'), makeSection('projects')]
    const result = reorderMenuSections(current, [makeSection('projects'), makeSection('skills')])

    expect(result.map((item) => item.id)).toEqual(['basic', 'projects', 'skills'])
    expect(result.map((item) => item.order)).toEqual([0, 1, 2])
  })

  it('drops a duplicated basic entry coming from the drag source', () => {
    const current = [makeSection('basic'), makeSection('skills')]
    const result = reorderMenuSections(current, [makeSection('basic'), makeSection('skills')])

    expect(result.map((item) => item.id)).toEqual(['basic', 'skills'])
  })

  it('still returns a usable order when basic is missing', () => {
    const result = reorderMenuSections([], [makeSection('skills'), makeSection('projects')])

    expect(result.map((item) => item.id)).toEqual(['skills', 'projects'])
    expect(result.every((item) => item.title.length > 0)).toBe(true)
  })
})

describe('nextCustomSectionId', () => {
  it('uses the length when free', () => {
    expect(nextCustomSectionId([])).toBe('custom-1')
  })

  it('climbs past ids that are already taken', () => {
    const sections = [makeSection('basic'), makeSection('custom-2'), makeSection('custom-3')]

    expect(nextCustomSectionId(sections)).toBe('custom-4')
  })

  it('does not collide with standard section names', () => {
    const sections = [
      'basic',
      'skills',
      'experience',
      'projects',
      'education',
      'selfEvaluation',
    ].map((id) => makeSection(id))

    expect(nextCustomSectionId(sections)).toBe('custom-7')
  })
})

describe('createDefaultCustomItem', () => {
  it('starts visible with an empty body and a unique id', () => {
    const first = createDefaultCustomItem('语言')
    const second = createDefaultCustomItem('语言')

    expect(first).toMatchObject({ title: '语言', subtitle: '', dateRange: '', visible: true })
    expect(first.id).not.toBe(second.id)
  })
})

describe('file naming', () => {
  it('replaces characters that filesystems reject', () => {
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeFileName('  前端   简历  ')).toBe('前端 简历')
  })

  it('falls back when nothing survives', () => {
    expect(sanitizeFileName('   ')).toBe('resume')
    expect(sanitizeFileName('', 'x')).toBe('x')
  })

  it('caps the length so long titles stay writable', () => {
    expect(sanitizeFileName('x'.repeat(200)).length).toBe(80)
  })

  it('appends the json extension', () => {
    expect(resumeFileName('我的简历')).toBe('我的简历.json')
  })
})

describe('normalizeResume', () => {
  it('rejects non-objects', () => {
    for (const input of [null, undefined, 'x', 42, [], true]) {
      expect(normalizeResume(input)).toBeNull()
    }
  })

  it('fills every missing collection with an empty one', () => {
    const result = normalizeResume({})

    expect(result).not.toBeNull()
    expect(result?.education).toEqual([])
    expect(result?.projects).toEqual([])
    expect(result?.certificates).toEqual([])
    expect(result?.customData).toEqual({})
    expect(result?.templateId).toBeNull()
    expect(result?.draggingProjectId).toBeNull()
  })

  it('always exposes a basic section first', () => {
    const result = normalizeResume({
      menuSections: [{ id: 'skills', title: '技能', icon: '⚡', enabled: true, order: 0 }],
    })

    expect(result?.menuSections.map((item) => item.id)).toEqual(['basic', 'skills'])
    expect(result?.menuSections.map((item) => item.order)).toEqual([0, 1])
  })

  it('migrates legacy emoji section icons to lucide names', () => {
    const result = normalizeResume({
      menuSections: [
        { id: 'skills', title: '技能', icon: '⚡', enabled: true, order: 0 },
        { id: 'custom-1', title: '其他', icon: '➕', enabled: true, order: 1 },
        { id: 'education', title: '教育', icon: '', enabled: true, order: 2 },
        { id: 'projects', title: '项目', icon: 'Rocket', enabled: true, order: 3 },
      ],
    })

    expect(result?.menuSections.map((item) => item.icon)).toEqual([
      'User',
      'Zap',
      'Plus',
      'GraduationCap',
      'Rocket',
    ])
  })

  it('keeps the legacy employementStatus spelling as the data key', () => {
    const result = normalizeResume({ basic: { employementStatus: '离职' } })

    expect(result?.basic.employementStatus).toBe('离职')
  })

  it('drops malformed array entries instead of throwing', () => {
    const result = normalizeResume({
      education: [{ id: 'e1', school: 'A' }, null, 7, 'nope'],
      experience: [{ company: 'B' }],
    })

    expect(result?.education).toHaveLength(1)
    expect(result?.education[0]).toMatchObject({ school: 'A' })
    expect(result?.experience).toHaveLength(1)
  })

  it('coerces wrong scalar types back to defaults', () => {
    const result = normalizeResume({
      title: 123,
      basic: { name: null, photoConfig: 'broken' },
      globalSettings: { pagePadding: 'lots', autoOnePage: 'yes', themeColor: 7 },
    })

    expect(result?.title).toBe('未命名简历')
    expect(result?.basic.name).toBe('')
    expect(result?.basic.photoConfig.width).toBe(90)
    expect(result?.globalSettings.pagePadding).toBe(32)
    expect(result?.globalSettings.autoOnePage).toBe(false)
    expect(result?.globalSettings.themeColor).toBe('#000000')
  })

  it('rejects out-of-range enum-ish strings', () => {
    const result = normalizeResume({
      basic: { photoConfig: { aspectRatio: '9:16', borderRadius: 'huge' } },
    })

    expect(result?.basic.photoConfig.aspectRatio).toBe('1:1')
    expect(result?.basic.photoConfig.borderRadius).toBe('none')
  })

  it('filters non-string icon entries', () => {
    const result = normalizeResume({ basic: { icons: { email: 'Mail', phone: 5 } } })

    expect(result?.basic.icons).toEqual({ email: 'Mail' })
  })

  it('assigns fresh ids to records that lack them', () => {
    const result = normalizeResume({ education: [{ school: 'A' }], customData: {} })

    expect(result?.education[0]?.id).toBeTruthy()
  })

  it('caps list length so a hostile export cannot freeze the tab', () => {
    const experience = Array.from({ length: RESUME_MAX_ITEMS_PER_LIST + 200 }, (_, i) => ({
      company: `c${i}`,
    }))
    const result = normalizeResume({ experience })

    expect(result?.experience).toHaveLength(RESUME_MAX_ITEMS_PER_LIST)
    expect(result?.experience[0]?.company).toBe('c0')
  })

  it('drops dangerous customData keys instead of re-pointing the container prototype', () => {
    const payload = JSON.parse('{"customData":{"__proto__":[{"id":"x","title":"evil"}]}}')
    const result = normalizeResume(payload)
    const customData = result?.customData ?? {}

    expect(Object.keys(customData)).toHaveLength(0)
    expect(Object.getPrototypeOf(customData)).toBe(Object.prototype)
  })

  /* 水合每次都会跑 normalizeResume，所以这里不能有偏小的字符上限：证书 base64 会被削掉 */
  it('keeps multi-megabyte base64 attachments intact', () => {
    const photo = `data:image/jpeg;base64,${'A'.repeat(3 * 1024 * 1024)}`
    const result = normalizeResume({ basic: { photo } })

    expect(result?.basic.photo).toHaveLength(photo.length)
  })

  /* zustand 只在水合版本与 version 不一致时才调 migrate，版本相同则坏数据直接进 merge */
  it('recovers a blob whose sections carry the wrong types', () => {
    const result = normalizeResume({
      id: 'bad1',
      basic: null,
      experience: 'not-an-array',
      menuSections: 5,
      customData: 'x',
    })

    expect(result?.basic).toBeTruthy()
    expect(result?.experience).toEqual([])
    expect(Array.isArray(result?.menuSections)).toBe(true)
    expect(result?.customData).toEqual({})
  })
})

describe('parseResumeJson', () => {
  it('rejects empty and malformed payloads with distinct errors', () => {
    expect(() => parseResumeJson('   ')).toThrow('empty')
    expect(() => parseResumeJson('{oops')).toThrow('not valid JSON')
    expect(() => parseResumeJson('"just a string"')).toThrow('valid resume object')
  })

  it('accepts the legacy array export', () => {
    const result = parseResumeJson(JSON.stringify([{ id: 'a', title: 'T' }, { id: 'b' }]))

    expect(result.id).toBe('a')
    expect(result.title).toBe('T')
  })
})

describe('reissueResume', () => {
  it('gives the imported copy a new identity and timestamps', () => {
    const source = makeResume()
    const copy = reissueResume(source)

    expect(copy.id).not.toBe(source.id)
    expect(copy.title).toBe(source.title)
    expect(Date.parse(copy.createdAt)).toBeGreaterThan(0)
    expect(source.updatedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('deep-copies nested collections so editing the copy cannot mutate the source', () => {
    const source = makeResume({ education: [{ id: 'e1', school: 'A' }] as ResumeData['education'] })
    const copy = reissueResume(source)

    copy.education[0].school = 'B'

    expect(source.education[0].school).toBe('A')
  })
})

describe('shouldImportFromFile', () => {
  it('imports when the id is unknown locally', () => {
    expect(shouldImportFromFile(makeResume())).toBe(true)
  })

  it('prefers whichever updatedAt is newer', () => {
    const older = { updatedAt: '2026-01-01T00:00:00.000Z' }
    const newer = { updatedAt: '2026-01-03T00:00:00.000Z' }

    expect(shouldImportFromFile(newer, older)).toBe(true)
    expect(shouldImportFromFile(older, newer)).toBe(false)
  })

  it('breaks an updatedAt tie using the file mtime plus one second', () => {
    const same = { updatedAt: '2026-01-02T00:00:00.000Z' }
    const modifiedAt = Date.parse(same.updatedAt)

    expect(shouldImportFromFile(same, same, modifiedAt)).toBe(false)
    expect(shouldImportFromFile(same, same, modifiedAt + 1001)).toBe(true)
  })

  it('ignores a malformed local timestamp', () => {
    expect(
      shouldImportFromFile({ updatedAt: '2026-01-03T00:00:00.000Z' }, { updatedAt: 'zzz' }),
    ).toBe(true)
  })

  it('falls back to the mtime when neither side has a readable timestamp', () => {
    expect(shouldImportFromFile({ updatedAt: 'x' }, { updatedAt: 'y' }, 1)).toBe(true)
    expect(shouldImportFromFile({ updatedAt: 'x' }, { updatedAt: 'y' })).toBe(false)
  })
})

describe('alignResumeTimestampWithFile', () => {
  it('leaves content that is already newer than the mtime alone', () => {
    const resume = makeResume()
    const unchanged = Date.parse(resume.updatedAt) - 1000

    expect(alignResumeTimestampWithFile(resume, unchanged)).toBe(resume)
  })

  it('bumps updatedAt up to the file mtime', () => {
    const later = Date.parse('2026-01-02T00:00:00.000Z') + 5000
    const result = alignResumeTimestampWithFile(makeResume(), later)

    expect(result).not.toBe(makeResume())
    expect(Date.parse(result.updatedAt)).toBe(later)
  })

  it('is a no-op without a usable mtime', () => {
    const resume = makeResume()

    expect(alignResumeTimestampWithFile(resume, undefined)).toBe(resume)
    expect(alignResumeTimestampWithFile(resume, Number.NaN)).toBe(resume)
  })
})
