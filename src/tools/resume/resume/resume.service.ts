import { v4 as uuidv4 } from 'uuid'

import {
  A4_HEIGHT_PX,
  DEFAULT_FIELD_ORDER,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PHOTO_CONFIG,
  DEFAULT_SECTION_ICONS,
  LEGACY_SECTION_EMOJI_ICONS,
  MAX_PAGE_BREAK_LINES,
  RESUME_MAX_ITEMS_PER_LIST,
} from './constants'
import type {
  BasicField,
  Certificate,
  CustomField,
  CustomItem,
  Education,
  Experience,
  GlobalSettings,
  MenuSection,
  PhotoConfig,
  Project,
  ResumeData,
} from './types'

export const DATE_RANGE_SEPARATOR = ' - '

/** 「至今」在不同语言下的字面量，历史数据里三种都出现过 */
export const PRESENT_TOKENS = ['至今', 'Present', 'Now'] as const

export function generateResumeId(): string {
  return uuidv4()
}

export function isPresentValue(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  return PRESENT_TOKENS.some((token) => value.includes(token))
}

/** 把 `"2021/07 - 至今"` 拆成起止两段，不解读内容 */
export function splitDateRange(value: string | undefined): { start: string; end: string } {
  if (!value) {
    return { start: '', end: '' }
  }

  if (value.includes(DATE_RANGE_SEPARATOR)) {
    const [start = '', end = ''] = value.split(DATE_RANGE_SEPARATOR)
    return { start: start.trim(), end: end.trim() }
  }

  const matched = value.match(/^(\S+)\s*(?:-|–|—)\s*(\S+)$/)
  if (matched) {
    return { start: matched[1], end: matched[2] }
  }

  return { start: value, end: '' }
}

/** 起止任一为空时不补分隔符，避免渲染出孤零零的 `" - "` */
export function joinDateRange(start: string, end: string): string {
  if (start && end) {
    return `${start}${DATE_RANGE_SEPARATOR}${end}`
  }
  return start || end
}

/**
 * 解析简历里的日期显示串。
 *
 * 只认 `YYYY-MM`、`YYYY-MM-DD`、`YYYY.MM`、`YYYY/MM` 与裸 `YYYY` 五种形状，
 * 其余（含「至今」）返回 null 由调用方原样输出——这些串是用户手输的，不能强行改写。
 */
export function parseDisplayDate(value: string): Date | null {
  // 分隔符统一成 '-' 后一次匹配：年必填，月/日选填（日仅用于通过格式校验，不参与取值）
  const normalized = value.trim().replace(/[./]/g, '-')
  const matched = /^(\d{4})(?:-(\d{1,2}))?(?:-\d{1,2})?$/.exec(normalized)
  if (!matched) {
    return null
  }

  const year = Number(matched[1])
  const month = matched[2] ? Number(matched[2]) : 1

  if (month < 1 || month > 12) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, 1))
}

/** 编辑器写回存储的规范形状：`YYYY/MM`，粒度到月 */
export function toStoredMonth(date: Date): string {
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function formatDisplayDate(value: string | undefined, locale = 'zh'): string {
  if (!value) {
    return ''
  }

  if (value.includes(DATE_RANGE_SEPARATOR)) {
    const { start, end } = splitDateRange(value)
    return joinDateRange(formatDisplayDate(start, locale), formatDisplayDate(end, locale))
  }

  const date = parseDisplayDate(value)
  if (!date) {
    return value
  }

  if (locale === 'zh') {
    return toStoredMonth(date)
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      timeZone: 'UTC',
    }).format(date)
  } catch {
    return value
  }
}

export function formatDisplayDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  locale = 'zh',
): string {
  return joinDateRange(
    formatDisplayDate(startDate, locale).trim(),
    formatDisplayDate(endDate, locale).trim(),
  )
}

/** 姓名、职位固定在首两位：不可拖动、不可删除、不可隐藏 */
export function isFixedBasicField(field: Pick<BasicField, 'key'>): boolean {
  return field.key === 'name' || field.key === 'title'
}

export function ratioMultiplier(ratio: PhotoConfig['aspectRatio']): number {
  switch (ratio) {
    case '4:3':
      return 3 / 4
    case '3:4':
      return 4 / 3
    case '16:9':
      return 9 / 16
    default:
      return 1
  }
}

export function photoBorderRadiusValue(config?: PhotoConfig): string {
  if (!config) {
    return '0'
  }

  switch (config.borderRadius) {
    case 'medium':
      return '0.5rem'
    case 'full':
      return '9999px'
    case 'custom':
      return `${config.customBorderRadius}px`
    default:
      return '0'
  }
}

/**
 * 分页参考线的纵向偏移（px）。
 *
 * 纸张内容可用高度为整页高减去上下页边距，因此第一条线在 `pagePadding + 一页内容高`；
 * `scaleFactor` 是自动一页纸施加的缩放，本地坐标系里同一屏像素对应更多内容，故按它放大每页高度。
 * 上限防止长简历渲出几十条线拖慢预览。
 */
export function pageBreakOffsets(
  pagePadding: number,
  contentHeight: number,
  scaleFactor = 1,
): number[] {
  const usable = a4ContentHeight(pagePadding)
  if (usable <= 0 || contentHeight <= 0 || scaleFactor <= 0) {
    return []
  }

  const perPage = usable / scaleFactor
  const pageCount = Math.ceil((contentHeight - pagePadding * 2) / perPage)
  const offsets: number[] = []

  for (
    let pageNumber = 1;
    pageNumber < Math.min(pageCount, MAX_PAGE_BREAK_LINES);
    pageNumber += 1
  ) {
    const top = pagePadding + pageNumber * perPage
    if (top <= contentHeight) {
      offsets.push(top)
    }
  }

  return offsets
}

/**
 * 把几何分页线吸附到"安全断点"（空白行或块元素底边）。
 *
 * 固定像素行切刀会把一行字上下劈开，导出后就是一行被撕成两截。
 * 只允许把切刀往上挪到最近的安全点，且不能挤掉太多内容（minPageHeight 兜底），
 * 找不到可用安全点时保留几何位置，至少分页数量是对的。
 */
export function snapBreakOffsets(
  idealOffsets: number[],
  safePoints: number[],
  minPageHeight: number,
): number[] {
  const sorted = safePoints
    .filter((point) => Number.isFinite(point) && point > 0)
    .sort((a, b) => a - b)
  const snapped: number[] = []
  let previous = 0

  for (const ideal of idealOffsets) {
    let chosen = ideal

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index]
      if (point > ideal || point <= previous) {
        continue
      }
      // 挪完还剩足够的页面高度才允许吸附
      if (point - previous >= minPageHeight) {
        chosen = point
        break
      }
    }

    snapped.push(chosen)
    previous = chosen
  }

  return snapped
}

/** 单页可用内容高度：纸张高减去上下页边距 */
export function a4ContentHeight(pagePadding: number): number {
  return A4_HEIGHT_PX - pagePadding * 2
}

/** 自动一页纸：内容超出时按比例缩小，且不超过 1 */
export function onePageScale(contentHeight: number, pagePadding: number): number {
  const usable = a4ContentHeight(pagePadding)
  if (usable <= 0 || contentHeight <= 0) {
    return 1
  }
  return Math.min(1, usable / contentHeight)
}

/** 章节顺序重排：`basic` 恒被钉回首位，其余按传入顺序重编号 */
export function reorderMenuSections(
  sections: MenuSection[],
  nextOrder: MenuSection[],
): MenuSection[] {
  const basic = sections.find((section) => section.id === 'basic')
  const rest = nextOrder.filter((section) => section.id !== 'basic')
  const ordered = [...(basic ? [basic] : []), ...rest]

  return ordered.map((section, index) => ({ ...section, order: index }))
}

export function nextCustomSectionId(sections: MenuSection[]): string {
  let index = sections.length + 1

  while (sections.some((section) => section.id === `custom-${index}`)) {
    index += 1
  }

  return `custom-${index}`
}

export function createDefaultCustomItem(title: string): CustomItem {
  return {
    id: uuidv4(),
    title,
    subtitle: '',
    dateRange: '',
    description: '',
    visible: true,
  }
}

export function createDefaultExperience(): Experience {
  return {
    id: uuidv4(),
    company: '',
    position: '',
    date: '',
    details: '',
    visible: true,
  }
}

export function createDefaultEducation(): Education {
  return {
    id: uuidv4(),
    school: '',
    major: '',
    degree: '',
    startDate: '',
    endDate: '',
    gpa: '',
    description: '',
    visible: true,
  }
}

export function createDefaultProject(): Project {
  return {
    id: uuidv4(),
    name: '',
    role: '',
    date: '',
    description: '',
    visible: true,
  }
}

/** 下载文件名：去掉文件系统保留字符，避免标题带 `/` `:` 时导出失败 */
export function sanitizeFileName(title: string, fallback = 'resume'): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return cleaned || fallback
}

export function resumeFileName(title: string): string {
  return `${sanitizeFileName(title)}.json`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 不能当作普通键名直接赋值的字符串：`obj['__proto__'] = ...` 会给容器换原型，
 * 之后读出来的字段就像凭空冒出来，某些形状下还会让模板崩掉。
 */
export const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const arr = <T>(value: unknown, map: (item: unknown) => T | null): T[] =>
  Array.isArray(value)
    ? value
        .slice(0, RESUME_MAX_ITEMS_PER_LIST)
        .map(map)
        .filter((item): item is T => item !== null)
    : []

function normalizePhotoConfig(value: unknown): PhotoConfig {
  if (!isRecord(value)) {
    return { ...DEFAULT_PHOTO_CONFIG }
  }

  return {
    width: num(value.width, DEFAULT_PHOTO_CONFIG.width),
    height: num(value.height, DEFAULT_PHOTO_CONFIG.height),
    aspectRatio: (['1:1', '4:3', '3:4', '16:9', 'custom'] as const).includes(
      value.aspectRatio as '1:1',
    )
      ? (value.aspectRatio as PhotoConfig['aspectRatio'])
      : DEFAULT_PHOTO_CONFIG.aspectRatio,
    borderRadius: (['none', 'medium', 'full', 'custom'] as const).includes(
      value.borderRadius as 'none',
    )
      ? (value.borderRadius as PhotoConfig['borderRadius'])
      : DEFAULT_PHOTO_CONFIG.borderRadius,
    customBorderRadius: num(value.customBorderRadius, 0),
    visible: bool(value.visible, true),
  }
}

function normalizeBasicField(value: unknown): BasicField | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    id: str(value.id, uuidv4()),
    key: str(value.key, 'name') as BasicField['key'],
    label: str(value.label),
    type:
      value.type === 'date' || value.type === 'textarea' || value.type === 'editor'
        ? value.type
        : 'text',
    visible: bool(value.visible, true),
    custom: bool(value.custom, false),
  }
}

function normalizeCustomField(value: unknown): CustomField | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    id: str(value.id, uuidv4()),
    label: str(value.label),
    value: str(value.value),
    icon: typeof value.icon === 'string' ? value.icon : undefined,
    visible: bool(value.visible, true),
    custom: bool(value.custom, true),
    displayLabel: bool(value.displayLabel, true),
  }
}

function normalizeSectionIcon(icon: unknown, sectionId: string): string {
  const value = str(icon)
  if (!value) {
    return DEFAULT_SECTION_ICONS[sectionId] ?? 'FileText'
  }
  return LEGACY_SECTION_EMOJI_ICONS[value] ?? value
}

function normalizeMenuSection(value: unknown): MenuSection | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  return {
    id: value.id,
    title: str(value.title),
    icon: normalizeSectionIcon(value.icon, value.id),
    enabled: bool(value.enabled, true),
    order: num(value.order, 0),
  }
}

function normalizeEducation(value: unknown): Education | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    id: str(value.id, uuidv4()),
    school: str(value.school),
    major: str(value.major),
    degree: str(value.degree),
    startDate: str(value.startDate),
    endDate: str(value.endDate),
    gpa: str(value.gpa),
    description: str(value.description),
    visible: bool(value.visible, true),
  }
}

function normalizeExperience(value: unknown): Experience | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    id: str(value.id, uuidv4()),
    company: str(value.company),
    position: str(value.position),
    date: str(value.date),
    details: str(value.details),
    visible: bool(value.visible, true),
  }
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    id: str(value.id, uuidv4()),
    name: str(value.name),
    role: str(value.role),
    date: str(value.date),
    description: str(value.description),
    visible: bool(value.visible, true),
    link: typeof value.link === 'string' ? value.link : undefined,
    linkLabel: typeof value.linkLabel === 'string' ? value.linkLabel : undefined,
  }
}

function normalizeCertificate(value: unknown): Certificate | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    id: str(value.id, uuidv4()),
    url: str(value.url),
    width: num(value.width, 100),
  }
}

function normalizeGlobalSettings(value: unknown): GlobalSettings {
  if (!isRecord(value)) {
    return { ...DEFAULT_GLOBAL_SETTINGS }
  }

  const settings: GlobalSettings = { ...DEFAULT_GLOBAL_SETTINGS }
  const numberKeys = [
    'baseFontSize',
    'pagePadding',
    'paragraphSpacing',
    'lineHeight',
    'sectionSpacing',
    'headerSize',
    'subheaderSize',
  ] as const
  const booleanKeys = [
    'useIconMode',
    'centerSubtitle',
    'flexibleHeaderLayout',
    'autoOnePage',
    'pageBreakLinesVisible',
  ] as const

  for (const key of numberKeys) {
    if (typeof value[key] === 'number') {
      settings[key] = value[key] as number
    }
  }
  for (const key of booleanKeys) {
    if (typeof value[key] === 'boolean') {
      settings[key] = value[key] as boolean
    }
  }
  if (typeof value.themeColor === 'string') {
    settings.themeColor = value.themeColor
  }
  if (typeof value.fontFamily === 'string') {
    settings.fontFamily = value.fontFamily
  }

  return settings
}

/**
 * 把任何来源（localStorage 手改、旧项目迁移、用户上传 JSON）的简历收敛成可用结构。
 *
 * 缺字段补默认、类型不符弃用该字段、数组元素不合法则整条丢弃：
 * 宁可少一条记录也不能让页面崩（AGENTS.md §12）。
 */
export function normalizeResume(input: unknown): ResumeData | null {
  if (!isRecord(input)) {
    return null
  }

  const basic = isRecord(input.basic) ? input.basic : {}
  const fieldOrder = arr(basic.fieldOrder, normalizeBasicField)
  const customData: Record<string, CustomItem[]> = {}

  if (isRecord(input.customData)) {
    const customSections = Object.entries(input.customData).slice(0, RESUME_MAX_ITEMS_PER_LIST)
    for (const [sectionId, items] of customSections) {
      if (UNSAFE_OBJECT_KEYS.has(sectionId)) {
        continue
      }
      customData[sectionId] = arr(items, (item) => {
        if (!isRecord(item)) {
          return null
        }
        return {
          id: str(item.id, uuidv4()),
          title: str(item.title),
          subtitle: str(item.subtitle),
          dateRange: str(item.dateRange),
          description: str(item.description),
          visible: bool(item.visible, true),
        }
      })
    }
  }

  const menuSections = arr(input.menuSections, normalizeMenuSection).sort(
    (left, right) => left.order - right.order,
  )

  if (!menuSections.some((section) => section.id === 'basic')) {
    menuSections.unshift({
      id: 'basic',
      title: '',
      icon: DEFAULT_SECTION_ICONS.basic,
      enabled: true,
      order: -1,
    })
  }

  return {
    id: str(input.id, uuidv4()),
    title: str(input.title, '未命名简历'),
    createdAt: str(input.createdAt, new Date(0).toISOString()),
    updatedAt: str(input.updatedAt, new Date(0).toISOString()),
    templateId: typeof input.templateId === 'string' ? input.templateId : null,
    basic: {
      birthDate: str(basic.birthDate),
      name: str(basic.name),
      title: str(basic.title),
      email: str(basic.email),
      phone: str(basic.phone),
      location: str(basic.location),
      icons: isRecord(basic.icons)
        ? Object.fromEntries(
            Object.entries(basic.icons).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {},
      employementStatus: str(basic.employementStatus),
      photo: str(basic.photo),
      photoConfig: normalizePhotoConfig(basic.photoConfig),
      fieldOrder: fieldOrder.length > 0 ? fieldOrder : [...DEFAULT_FIELD_ORDER],
      customFields: arr(basic.customFields, normalizeCustomField),
      githubKey: str(basic.githubKey),
      githubUseName: str(basic.githubUseName),
      githubContributionsVisible: bool(basic.githubContributionsVisible, false),
      layout: basic.layout === 'center' || basic.layout === 'right' ? basic.layout : 'left',
    },
    education: arr(input.education, normalizeEducation),
    experience: arr(input.experience, normalizeExperience),
    projects: arr(input.projects, normalizeProject),
    certificates: arr(input.certificates, normalizeCertificate),
    customData,
    skillContent: str(input.skillContent),
    selfEvaluationContent: str(input.selfEvaluationContent),
    activeSection: str(input.activeSection, 'basic'),
    draggingProjectId: typeof input.draggingProjectId === 'string' ? input.draggingProjectId : null,
    menuSections: menuSections.map((section, index) => ({ ...section, order: index })),
    globalSettings: normalizeGlobalSettings(input.globalSettings),
  }
}

/** 解析用户上传或旧项目导出的 JSON 文件内容 */
export function parseResumeJson(text: string): ResumeData {
  if (!text.trim()) {
    throw new Error('Resume file is empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Resume file is not valid JSON')
  }

  // 旧项目支持导出单份对象或一份数组，两种都吃
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed
  const normalized = normalizeResume(candidate)

  if (!normalized) {
    throw new Error('Resume file does not contain a valid resume object')
  }

  return normalized
}

/** 导入的简历必须换新 id 与新时间戳，否则会覆盖掉来源 */
export function reissueResume(resume: ResumeData): ResumeData {
  const now = new Date().toISOString()
  return {
    ...structuredClone(resume),
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  }
}

export function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * 本地文件与浏览器内数据谁更新。
 *
 * 两侧时间戳等值时再加 1s 容差：文件系统 mtime 常比 `updatedAt` 晚若干毫秒，
 * 严格比较会让同一份内容反复覆盖本地编辑。
 */
export function shouldImportFromFile(
  fileResume: Pick<ResumeData, 'updatedAt'>,
  localResume?: Pick<ResumeData, 'updatedAt'>,
  sourceModifiedAt?: number,
): boolean {
  if (!localResume) {
    return true
  }

  const fileUpdatedAt = parseTimestamp(fileResume.updatedAt)
  const localUpdatedAt = parseTimestamp(localResume.updatedAt)
  const fileModifiedAt =
    typeof sourceModifiedAt === 'number' && Number.isFinite(sourceModifiedAt)
      ? sourceModifiedAt
      : null

  if (fileUpdatedAt !== null && localUpdatedAt !== null) {
    if (fileUpdatedAt !== localUpdatedAt) {
      return fileUpdatedAt > localUpdatedAt
    }
    return fileModifiedAt !== null && fileModifiedAt > localUpdatedAt + 1000
  }

  if (fileUpdatedAt !== null) {
    return true
  }

  if (localUpdatedAt !== null) {
    return fileModifiedAt !== null && fileModifiedAt > localUpdatedAt + 1000
  }

  return fileModifiedAt !== null
}

/** 文件 mtime 比内容时间戳更新时，以 mtime 为准，避免启动同步把同一条记录判成"更旧" */
export function alignResumeTimestampWithFile<T extends Pick<ResumeData, 'updatedAt'>>(
  resume: T,
  sourceModifiedAt?: number,
): T {
  if (typeof sourceModifiedAt !== 'number' || !Number.isFinite(sourceModifiedAt)) {
    return resume
  }

  const fileUpdatedAt = parseTimestamp(resume.updatedAt)
  if (fileUpdatedAt !== null && fileUpdatedAt >= sourceModifiedAt) {
    return resume
  }

  return { ...resume, updatedAt: new Date(sourceModifiedAt).toISOString() }
}
