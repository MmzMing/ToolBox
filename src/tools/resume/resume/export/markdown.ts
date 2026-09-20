import TurndownService from 'turndown'

import type { ResumeData } from '../types'

/**
 * 简历 → Markdown。
 *
 * 章节顺序沿用 menuSections（用户自己排的顺序），富文本字段交给 turndown 转。
 */

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

function toMarkdown(html: string): string {
  if (!html) {
    return ''
  }
  return turndown.turndown(html).trim()
}

function fieldLines(resume: ResumeData, label: (key: string) => string): string[] {
  const { basic } = resume
  const labels: Array<[string, string]> = [
    ['name', basic.name],
    ['title', basic.title],
    ['employementStatus', basic.employementStatus],
    ['birthDate', basic.birthDate],
    ['email', basic.email],
    ['phone', basic.phone],
    ['location', basic.location],
  ]

  const lines = labels
    .filter(([, value]) => value)
    .map(([key, value]) => `- **${label(`resume.basicFields.${key}`)}**：${value}`)

  for (const field of basic.customFields ?? []) {
    if (field.value) {
      lines.push(`- **${field.label}**：${field.value}`)
    }
  }

  return lines
}

export function resumeToMarkdown(resume: ResumeData, label: (key: string) => string): string {
  const parts: string[] = [`# ${resume.title}`, '']

  const basic = fieldLines(resume, label)
  if (basic.length > 0) {
    parts.push(...basic, '')
  }

  const ordered = [...resume.menuSections].sort((a, b) => a.order - b.order)

  for (const section of ordered) {
    if (!section.enabled || section.id === 'basic') {
      continue
    }

    const body = sectionBody(resume, section.id)
    if (!body.trim()) {
      continue
    }

    parts.push(`## ${section.title || section.id}`, '', body, '')
  }

  return parts.join('\n').trim()
}

function sectionBody(resume: ResumeData, sectionId: string): string {
  switch (sectionId) {
    case 'skills':
      return toMarkdown(resume.skillContent)
    case 'selfEvaluation':
      return toMarkdown(resume.selfEvaluationContent)
    case 'experience':
      return resume.experience
        .filter((item) => item.visible !== false)
        .map((item) =>
          [
            `### ${[item.company, item.position].filter(Boolean).join(' · ')}`,
            item.date,
            toMarkdown(item.details),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')
    case 'education':
      return resume.education
        .filter((item) => item.visible !== false)
        .map((item) =>
          [
            `### ${[item.school, item.major, item.degree].filter(Boolean).join(' · ')}`,
            [item.startDate, item.endDate].filter(Boolean).join(' - '),
            item.gpa ? `GPA ${item.gpa}` : '',
            toMarkdown(item.description ?? ''),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')
    case 'projects':
      return resume.projects
        .filter((item) => item.visible !== false)
        .map((item) =>
          [
            `### ${[item.name, item.role].filter(Boolean).join(' · ')}`,
            item.date,
            item.link ? `链接：${item.link}` : '',
            toMarkdown(item.description),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')
    case 'certificates':
      return resume.certificates.map(() => '![](证书图片，请从简历中另存)').join('\n\n')
    default:
      return (resume.customData[sectionId] ?? [])
        .filter((item) => item.visible !== false)
        .map((item) =>
          [
            `### ${[item.title, item.subtitle].filter(Boolean).join(' · ')}`,
            item.dateRange,
            toMarkdown(item.description),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')
  }
}
