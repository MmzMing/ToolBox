import { describe, expect, it } from 'vitest'

import {
  htmlToMarkdown,
  markdownToEditorHtml,
  markdownToPreviewHtml,
} from '@/tools/resume/ai/polish'

describe('htmlToMarkdown', () => {
  it('keeps the structure turndown already handles', () => {
    const md = htmlToMarkdown(
      '<h2>技能</h2><ul><li>Java</li><li>Go</li></ul><p><strong>主导</strong>重构</p>',
    )
    expect(md).toContain('## 技能')
    expect(md).toMatch(/-\s+Java/)
    expect(md).toMatch(/-\s+Go/)
    expect(md).toContain('**主导**')
  })

  it('preserves color, highlight, underline and alignment that turndown drops by default', () => {
    const md = htmlToMarkdown(
      '<p><span style="color: rgb(255, 0, 0)">红字</span></p>' +
        '<p><mark data-color="#ffe58f" style="background-color: rgb(255, 229, 143);">高亮</mark></p>' +
        '<p><u>下划线</u></p>' +
        '<p style="text-align: center;">居中</p>',
    )
    expect(md).toContain('<span style="color: rgb(255, 0, 0)">红字</span>')
    expect(md).toContain('<mark data-color="#ffe58f"')
    expect(md).toContain('<u>下划线</u>')
    expect(md).toContain('text-align: center')
    expect(md).toContain('居中')
  })

  it('returns an empty string for blank input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })
})

describe('markdown round trip', () => {
  it('restores inline styles so a polish pass does not lose them', () => {
    const html =
      '<p><span style="color: rgb(255, 0, 0)">红字</span>和<strong>粗体</strong></p>' +
      '<p style="text-align: center;">居中段落</p>'
    const back = markdownToEditorHtml(htmlToMarkdown(html))
    expect(back).toContain('color: rgb(255, 0, 0)')
    expect(back).toContain('<strong>粗体</strong>')
    expect(back).toContain('text-align: center')
  })

  it('renders line breaks as the editor expects', () => {
    expect(markdownToEditorHtml('a\nb')).toContain('<br')
  })
})

describe('markdownToPreviewHtml', () => {
  it('escapes raw HTML coming back from the model', () => {
    const preview = markdownToPreviewHtml('<img src=x onerror=alert(1)>')
    expect(preview).not.toContain('<img')
    expect(preview).toContain('&lt;img')
  })

  it('drops unsafe link protocols but keeps the label', () => {
    const preview = markdownToPreviewHtml('[点我](javascript:alert(1))')
    expect(preview).not.toContain('javascript:')
    expect(preview).toContain('点我')
  })

  it('keeps http, mailto and tel links', () => {
    expect(markdownToPreviewHtml('[a](https://x.com)')).toContain('href="https://x.com"')
    expect(markdownToPreviewHtml('[b](mailto:x@y.z)')).toContain('href="mailto:x@y.z"')
  })
})
