import { describe, expect, it } from 'vitest'

import { assertPdfImportable, buildResumeFromAI } from '@/tools/resume/ai/pdf-import'
import {
  MAX_PDF_FILE_BYTES,
  MAX_PDF_IMPORT_PAGES,
  MAX_PDF_REQUEST_BYTES,
} from '@/tools/resume/ai/pdf-import'
import { blankResumeZh } from '@/tools/resume/resume/initial-resume-data'

const options = {
  id: 'resume-1',
  fileName: 'my-resume',
  templateId: 'classic',
  now: '2026-09-20T00:00:00.000Z',
}

describe('assertPdfImportable', () => {
  it('accepts a payload inside every limit', () => {
    expect(() =>
      assertPdfImportable({ fileBytes: 1024, pages: MAX_PDF_IMPORT_PAGES, requestBytes: 4096 }),
    ).not.toThrow()
  })

  it('rejects an oversized file, too many pages and an oversized request body', () => {
    expect(() =>
      assertPdfImportable({ fileBytes: MAX_PDF_FILE_BYTES + 1, pages: 1, requestBytes: 1 }),
    ).toThrow('fileTooLarge')
    expect(() =>
      assertPdfImportable({ fileBytes: 1, pages: MAX_PDF_IMPORT_PAGES + 1, requestBytes: 1 }),
    ).toThrow('tooManyPages')
    expect(() =>
      assertPdfImportable({
        fileBytes: 1,
        pages: 1,
        requestBytes: MAX_PDF_REQUEST_BYTES + 1,
      }),
    ).toThrow('requestTooLarge')
  })

  it('rejects a PDF that yielded no pages', () => {
    expect(() => assertPdfImportable({ fileBytes: 1, pages: 0, requestBytes: 1 })).toThrow(
      'emptyOutput',
    )
  })
})

describe('buildResumeFromAI', () => {
  it('maps basic fields, drops empty entries and turns lists into HTML', () => {
    const { resume, warnings } = buildResumeFromAI(
      blankResumeZh,
      {
        title: '后端工程师简历',
        basic: { name: '张三', email: 'a@b.com', phone: '138' },
        education: [
          { school: '北大', major: '计算机', description: ['主修数据结构', ''] },
          { school: '', major: '', degree: '' },
        ],
        experience: [
          {
            company: '字节',
            position: '后端',
            date: '2021/07 - 2024/12',
            details: ['重构下单服务'],
          },
        ],
        projects: [],
        skills: ['Java', 'Go'],
      },
      options,
    )

    expect(warnings).toEqual([])
    expect(resume.title).toBe('后端工程师简历')
    expect(resume.basic.name).toBe('张三')
    expect(resume.basic.email).toBe('a@b.com')
    expect(resume.education).toHaveLength(1)
    expect(resume.education[0].description).toBe('<ul><li>主修数据结构</li></ul>')
    expect(resume.experience[0].details).toContain('重构下单服务')
    expect(resume.skillContent).toBe('<ul><li>Java</li><li>Go</li></ul>')
    expect(resume.id).toBe('resume-1')
    expect(resume.templateId).toBe('classic')
  })

  it('warns when no name was read and clears photo and custom fields', () => {
    const seed = {
      ...blankResumeZh,
      basic: {
        ...blankResumeZh.basic,
        photo: 'data:image/png;base64,x',
        customFields: [{ id: '1', label: 'a', value: 'b' }],
      },
    }
    const { resume, warnings } = buildResumeFromAI(seed, { basic: { title: 'x' } }, options)
    expect(warnings).toEqual(['missingName'])
    expect(resume.basic.photo).toBe('')
    expect(resume.basic.customFields).toEqual([])
  })

  it('escapes model text so it cannot inject markup', () => {
    const { resume } = buildResumeFromAI(
      blankResumeZh,
      { basic: { name: 'a' }, skills: ['<img onerror=alert(1)>'] },
      options,
    )
    expect(resume.skillContent).toBe('<ul><li>&lt;img onerror=alert(1)&gt;</li></ul>')
  })

  it('falls back to the file name then a generated title', () => {
    expect(
      buildResumeFromAI(blankResumeZh, { basic: { name: 'a' } }, { ...options, fileName: '' })
        .resume.title,
    ).toBe('Imported Resume resume')
    expect(
      buildResumeFromAI(blankResumeZh, { basic: { name: 'a' }, title: 'T' }, options).resume.title,
    ).toBe('T')
  })

  it('rejects a syntactically valid but empty object', () => {
    expect(() =>
      buildResumeFromAI(blankResumeZh, { title: 'only a title', basic: {} }, options),
    ).toThrow('emptyOutput')
    expect(() => buildResumeFromAI(blankResumeZh, {}, options)).toThrow('emptyOutput')
  })

  it('accepts a string block instead of an array of bullets', () => {
    const { resume } = buildResumeFromAI(
      blankResumeZh,
      { basic: { name: 'a' }, experience: [{ company: 'x', details: '- 第一项\n- 第二项' }] },
      options,
    )
    expect(resume.experience[0].details).toBe('<ul><li>第一项</li><li>第二项</li></ul>')
  })
})
