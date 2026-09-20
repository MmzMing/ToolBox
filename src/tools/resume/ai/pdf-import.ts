import { v4 as uuidv4 } from 'uuid'

import { AIRequestError } from './transport'
import type { ResumeSeed } from '../resume/initial-resume-data'
import type { Education, Experience, Project, ResumeData } from '../resume/types'

export const MAX_PDF_IMPORT_PAGES = 10
export const MAX_PDF_FILE_BYTES = 20 * 1024 * 1024
export const MAX_PDF_REQUEST_BYTES = 16 * 1024 * 1024
export const PDF_IMPORT_TIMEOUT_MS = 120_000

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 模型给的字符串数组 → 列表 HTML；给的是整段字符串就按行切 */
function toListHtml(value: unknown): string {
  const items = Array.isArray(value)
    ? value.map(str).filter(Boolean)
    : str(value)
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : ''
}

/** 发送前先卡体积与页数：超了直接失败，别等上游 413 */
export function assertPdfImportable(input: {
  fileBytes: number
  pages: number
  requestBytes: number
}) {
  if (input.fileBytes > MAX_PDF_FILE_BYTES) {
    throw new AIRequestError('fileTooLarge', 413)
  }
  if (input.pages > MAX_PDF_IMPORT_PAGES) {
    throw new AIRequestError('tooManyPages', 413)
  }
  if (input.requestBytes > MAX_PDF_REQUEST_BYTES) {
    throw new AIRequestError('requestTooLarge', 413)
  }
  if (!input.pages) {
    throw new AIRequestError('emptyOutput', 502)
  }
}

export type ImportedResume = {
  resume: ResumeData
  warnings: 'missingName'[]
}

/**
 * 视觉模型的输出 → 一份可入库的简历。
 *
 * 只认字段名不认顺序；空条目直接丢，避免导入一串空壳卡片。
 * `photo` 与 `customFields` 一律置空：模型读出来的图片既不可信也无从对应。
 */
export function buildResumeFromAI(
  seed: ResumeSeed,
  result: unknown,
  options: { id: string; fileName: string; templateId: string | null; now: string },
): ImportedResume {
  const root = (result ?? {}) as Record<string, unknown>
  const basic = (root.basic ?? {}) as Record<string, unknown>
  const { id, fileName, templateId, now } = options

  const education: Education[] = list(root.education)
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      return {
        id: uuidv4(),
        school: str(entry.school),
        major: str(entry.major),
        degree: str(entry.degree),
        startDate: str(entry.startDate),
        endDate: str(entry.endDate),
        gpa: str(entry.gpa),
        description: toListHtml(entry.description),
        visible: true,
      }
    })
    .filter((item) => item.school || item.major || item.degree)

  const experience: Experience[] = list(root.experience)
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      return {
        id: uuidv4(),
        company: str(entry.company),
        position: str(entry.position),
        date: str(entry.date),
        details: toListHtml(entry.details ?? entry.description),
        visible: true,
      }
    })
    .filter((item) => item.company || item.position || item.date || item.details)

  const projects: Project[] = list(root.projects)
    .map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>
      return {
        id: uuidv4(),
        name: str(entry.name),
        role: str(entry.role),
        date: str(entry.date),
        description: toListHtml(entry.description ?? entry.details),
        link: str(entry.link),
        linkLabel: str(
          entry.linkLabel ?? entry.linkText ?? entry.displayText ?? entry.linkDisplayText,
        ),
        visible: true,
      }
    })
    .filter((item) => item.name || item.role || item.date || item.description)

  const name = str(basic.name)
  const skillContent = toListHtml(root.skills ?? root.skillContent)
  const extractedBasic = {
    name,
    title: str(basic.title),
    email: str(basic.email),
    phone: str(basic.phone),
    location: str(basic.location),
    employementStatus: str(basic.employementStatus),
    birthDate: str(basic.birthDate),
  }

  // 语法上合法但内容全空的 JSON 不算导入成功；只有标题也不算
  const hasContent =
    Object.values(extractedBasic).some(Boolean) ||
    !!skillContent ||
    !!education.length ||
    !!experience.length ||
    !!projects.length
  if (!hasContent) {
    throw new AIRequestError('emptyOutput', 502)
  }

  const resume: ResumeData = {
    ...seed,
    id,
    createdAt: now,
    updatedAt: now,
    templateId,
    title: str(root.title) || fileName || `Imported Resume ${id.slice(0, 6)}`,
    basic: {
      ...seed.basic,
      ...extractedBasic,
      photo: '',
      customFields: [],
      githubKey: '',
      githubUseName: '',
      githubContributionsVisible: false,
    },
    education,
    experience,
    projects,
    skillContent,
    customData: {},
    draggingProjectId: null,
  }

  return { resume, warnings: name ? [] : ['missingName'] }
}
