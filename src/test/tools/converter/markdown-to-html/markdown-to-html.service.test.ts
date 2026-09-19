import { describe, expect, it } from 'vitest'

import { markdownToHtml } from '@/tools/converter/markdown-to-html/markdown-to-html.service'

describe('markdownToHtml', () => {
  it('converts headings and paragraphs', () => {
    expect(markdownToHtml('# Hi')).toBe('<h1>Hi</h1>\n')
    expect(markdownToHtml('**bold** text')).toBe('<p><strong>bold</strong> text</p>\n')
  })

  it('supports gfm tables', () => {
    const html = markdownToHtml('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('keeps single newlines inside paragraphs (breaks disabled)', () => {
    expect(markdownToHtml('a\nb')).toBe('<p>a\nb</p>\n')
  })

  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('')
    expect(markdownToHtml('  \n')).toBe('')
  })
})
