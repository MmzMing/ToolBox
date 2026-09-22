// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  hasMeaningfulRichTextContent,
  normalizeLinkHref,
  normalizeRichTextContent,
} from '@/tools/resume/resume/rich-text'

describe('normalizeLinkHref', () => {
  it('keeps https, mailto and tel urls', () => {
    expect(normalizeLinkHref('https://example.com/a')).toBe('https://example.com/a')
    expect(normalizeLinkHref('mailto:me@example.com')).toBe('mailto:me@example.com')
    expect(normalizeLinkHref('tel:+8613800000000')).toBe('tel:+8613800000000')
  })

  it('upgrades protocol-less hosts and protocol-relative urls to https', () => {
    expect(normalizeLinkHref('example.com')).toBe('https://example.com')
    expect(normalizeLinkHref('//example.com')).toBe('https://example.com')
  })

  it('rejects scriptable and unknown protocols', () => {
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull()
    expect(normalizeLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(normalizeLinkHref('vbscript:msgbox(1)')).toBeNull()
    expect(normalizeLinkHref('')).toBeNull()
  })
})

/** 简历正文的四个入口（导入 JSON、同步目录、旧 localStorage、AI 返回）都不可信，这里断言兜底 */
describe('normalizeRichTextContent as the single render-time sanitizer', () => {
  it('escapes plain text and turns newlines into breaks', () => {
    expect(normalizeRichTextContent('a\nb')).toBe('a<br>b')
    expect(normalizeRichTextContent('a < b')).toBe('a &lt; b')
  })

  it('drops event handler payloads carried by imported rich text', () => {
    const out = normalizeRichTextContent('<p>x</p><img src=x onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('<img')
    expect(out).toContain('<p>x</p>')
  })

  it('drops script, iframe and svg markup', () => {
    const out = normalizeRichTextContent(
      '<script>alert(1)</script><iframe src="https://evil"></iframe><svg onload="alert(2)">t</svg><p>keep</p>',
    )
    expect(out).not.toMatch(/script|iframe|onload|svg/i)
    expect(out).toBe('<p>keep</p>')
  })

  it('strips inline event handlers from allowed tags', () => {
    const out = normalizeRichTextContent('<p onclick="alert(1)" style="color: red">keep</p>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('color: red')
    expect(out).toContain('keep')
  })

  it('removes javascript hrefs from anchors instead of rendering them clickable', () => {
    const out = normalizeRichTextContent('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('rich-text-link')
    expect(out).toContain('click')
  })

  it('adds rel=noopener to external anchors and keeps safe protocols', () => {
    const out = normalizeRichTextContent('<a href="example.com">x</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('class="rich-text-link"')
  })

  it('preserves the styles the editor can actually produce', () => {
    const out = normalizeRichTextContent(
      '<p style="text-align: center">t</p><span style="color: rgb(0, 71, 171)">c</span>' +
        '<mark data-color="#fef08a" style="background-color: #fef08a">h</mark><ul><li>i</li></ul>',
    )
    expect(out).toContain('text-align: center')
    expect(out).toContain('color: rgb(0, 71, 171)')
    expect(out).toContain('data-color="#fef08a"')
    expect(out).toContain('<li>i</li>')
  })

  it('fixes empty paragraphs and strips legacy list classes', () => {
    const out = normalizeRichTextContent('<p class="custom-list"><br></p>')
    expect(out).toContain('<p><br></p>')
    expect(out).not.toContain('custom-list')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeRichTextContent(undefined)).toBe('')
    expect(normalizeRichTextContent('')).toBe('')
  })
})

describe('hasMeaningfulRichTextContent', () => {
  it('treats markup-only and invisible whitespace as empty', () => {
    expect(hasMeaningfulRichTextContent('<p><br /></p>')).toBe(false)
    expect(hasMeaningfulRichTextContent('​​')).toBe(false)
    expect(hasMeaningfulRichTextContent('text')).toBe(true)
  })
})
