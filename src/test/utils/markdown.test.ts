// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  renderMarkdown,
  sanitizeMarkdownHtml,
  sanitizeSvg,
  slugifyHeading,
  stripInlineMarkdown,
} from '@/utils/markdown'

const render = (source: string) => renderMarkdown(source).html
const result = (source: string) => renderMarkdown(source)

describe('slugifyHeading', () => {
  it('lowercases and dashes the text', () => {
    expect(slugifyHeading('Hello World!')).toBe('hello-world')
  })

  it('keeps CJK characters', () => {
    expect(slugifyHeading('2026 计划 一览')).toBe('2026-计划-一览')
  })

  it('drops the inline markup before slugging', () => {
    expect(slugifyHeading('**Bold** _Title_')).toBe('bold-title')
  })

  it('falls back to a stable word for punctuation-only headings', () => {
    expect(slugifyHeading('!!!')).toBe('section')
  })
})

describe('stripInlineMarkdown', () => {
  it('keeps the label of a link', () => {
    expect(stripInlineMarkdown('[ToolBox](https://a.dev)')).toBe('ToolBox')
  })
})

describe('outline and source lines', () => {
  it('collects headings with their depth and source line', () => {
    const { headings } = result('# Title\n\ntext\n\n## Second\n')
    expect(headings).toEqual([
      { id: 'title', text: 'Title', depth: 1, line: 1 },
      { id: 'second', text: 'Second', depth: 2, line: 5 },
    ])
  })

  it('stamps data-line on the rendered heading for sync scrolling', () => {
    expect(render('## Two\n')).toContain('<h2 id="two" data-line="1">Two</h2>')
  })

  it('disambiguates repeated headings', () => {
    const { headings } = result('# A\n\n# A\n\n# A\n')
    expect(headings.map((heading) => heading.id)).toEqual(['a', 'a-1', 'a-2'])
  })

  it('does not treat a setext underline as markup noise', () => {
    const { headings } = result('Title\n=====\n')
    expect(headings[0]?.depth).toBe(1)
  })
})

describe('github flavoured markdown', () => {
  it('renders tables with alignment', () => {
    const html = render('| a | b |\n| --: | :-: |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).toContain('align="right"')
  })

  it('renders task list checkboxes', () => {
    expect(render('- [x] done\n- [ ] todo\n')).toContain('type="checkbox"')
  })

  it('renders strikethrough', () => {
    expect(render('~~gone~~')).toContain('<del>gone</del>')
  })

  it('marks external links to open safely in a new tab', () => {
    expect(render('[a](https://example.com)')).toContain('rel="noopener noreferrer"')
  })

  it('highlights a labelled code fence', () => {
    expect(render('```js\nconst x = 1\n```')).toContain('hljs-keyword')
  })

  it('stamps the language onto the pre for the corner chip', () => {
    expect(render('```ts\nconst x = 1\n```')).toContain('<pre data-language="ts">')
  })

  it('omits the language attribute for a bare fence', () => {
    expect(render('```\nplain\n```')).toContain('<pre><code class="hljs">')
  })

  it('keeps an unknown language out of the highlighter without failing', () => {
    const html = render('```notalanguage\nplain text\n```')
    expect(html).toContain('<pre data-language="notalanguage">')
    // 未知语言走 highlightAuto，会被猜成某种语言而拆成 token：只要求内容不丢
    expect(html.replace(/<[^>]+>/g, '')).toContain('plain text')
  })
})

describe('mermaid fences', () => {
  it('leaves the escaped source as readable fallback content and flags the render', () => {
    const { html, needsMermaid } = result('```mermaid\nflowchart LR\n  A["<b>"] --> B\n```\n')
    expect(needsMermaid).toBe(true)
    expect(html).toContain('<div class="md-mermaid"><pre><code>')
    expect(html).toContain('A[&quot;&lt;b&gt;&quot;] --&gt; B')
  })

  it('keeps the diagram source through sanitising so it can still be rendered', () => {
    const { html } = result('```mermaid\nflowchart LR\n  A --> B\n```\n')
    expect(sanitizeMarkdownHtml(html)).toContain('A --&gt; B')
  })

  it('does not flag documents without a diagram', () => {
    expect(result('# Just text\n').needsMermaid).toBe(false)
  })
})

describe('math', () => {
  it('renders inline math and flags it', () => {
    const { html, needsMath } = result('energy $E = mc^2$ here\n')
    expect(needsMath).toBe(true)
    expect(html).toContain('<span class="md-math">E = mc^2</span>')
  })

  it('survives sanitising even when the formula contains a greater-than', () => {
    const { html } = result('rule $a > b$ holds\n')
    const clean = sanitizeMarkdownHtml(html)
    expect(clean).toContain('md-math')
    expect(clean).toContain('a &gt; b')
  })

  it('renders a block formula', () => {
    const { html } = result('$$\n\\frac{1}{2}\n$$\n')
    expect(html).toContain('md-math-block')
    expect(html).toContain('\\frac{1}{2}')
  })

  it('treats a math fence like a block formula', () => {
    expect(render('```math\nx^2\n```\n')).toContain('md-math-block')
  })

  it('ignores lone dollar amounts so prose is not eaten', () => {
    const { html, needsMath } = result('价格 $5 和 $10 元\n')
    expect(needsMath).toBe(false)
    expect(html).toContain('$5')
    expect(html).toContain('$10')
  })

  it('ignores space-adjacent dollars', () => {
    const { needsMath } = result('cost is $ 100 $\n')
    expect(needsMath).toBe(false)
  })

  it('leaves dollars inside code spans alone', () => {
    const { needsMath } = result('use `$x$` in code\n')
    expect(needsMath).toBe(false)
  })
})

describe('block cards', () => {
  const labelled = (source: string) =>
    renderMarkdown(source, { labels: { math: 'LaTeX 公式', diagram: 'Mermaid 图表' } }).html

  it('wraps a block formula in a titled card', () => {
    const html = labelled('$$\nx^2\n$$\n')
    expect(html).toContain('<div class="md-card">')
    expect(html).toContain('md-card-title">LaTeX 公式<')
    expect(html).toContain('md-card-body')
    expect(html).toContain('md-math-block')
  })

  it('wraps a diagram in a titled card around the source fallback', () => {
    const html = labelled('```mermaid\nflowchart LR\n  A --> B\n```\n')
    expect(html).toContain('md-card-title">Mermaid 图表<')
    expect(html).toContain('<div class="md-mermaid"><pre><code>')
  })

  it('leaves inline math unframed', () => {
    const html = labelled('inline $x^2$ here\n')
    expect(html).not.toContain('md-card')
  })

  it('escapes a label that contains markup', () => {
    const html = renderMarkdown('$$\nx\n$$\n', {
      labels: { math: '<b>公式</b>', diagram: 'd' },
    }).html
    expect(html).toContain('&lt;b&gt;公式&lt;/b&gt;')
  })

  it('falls back to neutral labels when none are given', () => {
    expect(render('$$\nx\n$$\n')).toContain('md-card-title">LaTeX<')
  })
})

describe('sanitizeMarkdownHtml', () => {
  it('drops script elements entirely', () => {
    expect(sanitizeMarkdownHtml('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>')
  })

  it('strips event handlers', () => {
    expect(sanitizeMarkdownHtml('<img src="x" onerror="alert(1)">')).not.toContain('onerror')
  })

  it('neutralises javascript urls', () => {
    expect(sanitizeMarkdownHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('keeps markdown tables, images and task inputs', () => {
    const html = sanitizeMarkdownHtml(
      '<table><tbody><tr><td>a</td></tr></tbody></table><img src="https://a.dev/i.png" alt="i"><input type="checkbox" checked disabled>',
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<img')
    expect(html).toContain('<input')
  })

  it('keeps data attributes used by the outline', () => {
    expect(sanitizeMarkdownHtml('<h2 id="a" data-line="3">x</h2>')).toContain('data-line="3"')
  })

  it('escapes instead of trusting the dom when purify is unavailable', () => {
    const html = render('<script>alert(1)</script>\n')
    expect(sanitizeMarkdownHtml(html)).not.toContain('<script>')
  })
})

describe('sanitizeSvg', () => {
  it('keeps vector content but drops script', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g><text>x</text></g></svg>'
    expect(sanitizeSvg(svg)).toContain('<text>x</text>')
    expect(sanitizeSvg('<svg><script>alert(1)</script></svg>')).not.toContain('alert')
  })
})
