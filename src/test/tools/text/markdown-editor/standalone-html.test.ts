import { describe, expect, it } from 'vitest'

import {
  EXPORT_CSS,
  buildStandaloneHtml,
  resolveCssAssetUrls,
} from '@/tools/text/markdown-editor/export/standalone-html'

describe('resolveCssAssetUrls', () => {
  it('makes relative font references absolute', () => {
    expect(
      resolveCssAssetUrls('@font-face{src:url(fonts/KaTeX_Main.woff2)}', 'https://tool.dev/x/'),
    ).toBe('@font-face{src:url(https://tool.dev/x/fonts/KaTeX_Main.woff2)}')
  })

  it('leaves data uris and absolute urls untouched', () => {
    const css =
      'a{background:url(data:image/png;base64,AA)} b{background:url("https://a.dev/i.png")}'
    expect(resolveCssAssetUrls(css, 'https://tool.dev/')).toBe(css)
  })

  it('keeps the original text when the base is unusable', () => {
    expect(resolveCssAssetUrls('a{background:url(x.png)}', 'not a url')).toBe(
      'a{background:url(x.png)}',
    )
  })
})

describe('buildStandaloneHtml', () => {
  it('escapes the title into the document head', () => {
    const html = buildStandaloneHtml({ title: '</title><script>x', bodyHtml: '<p>a</p>' })
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;x')
    expect(html).not.toContain('</title><script>')
  })

  it('wraps the body in the preview container', () => {
    const html = buildStandaloneHtml({ title: 'a', bodyHtml: '<h1 id="a">A</h1>' })
    expect(html).toContain('<div class="md-preview"><h1 id="a">A</h1></div>')
    expect(html).toContain(EXPORT_CSS)
  })

  it('carries print rules so the PDF path shares the same document', () => {
    expect(EXPORT_CSS).toContain('@media print')
    expect(EXPORT_CSS).toContain('break-inside:avoid')
  })

  it('only embeds katex css when the caller passes it', () => {
    const withMath = buildStandaloneHtml({
      title: 'a',
      bodyHtml: '<p>x</p>',
      katexCss: '.katex{font-family:"KaTeX_Main"}',
      baseUrl: 'https://tool.dev/',
    })
    expect(withMath).toContain('.katex')
    expect(buildStandaloneHtml({ title: 'a', bodyHtml: '<p>x</p>' })).not.toContain('.katex')
  })
})
