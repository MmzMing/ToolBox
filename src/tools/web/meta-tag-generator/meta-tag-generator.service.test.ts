import { describe, expect, it } from 'vitest'

import { generateMetaTags, twitterCardTypes } from './meta-tag-generator.service'

describe('generateMetaTags', () => {
  it('generates the full tag block with stable attribute order', () => {
    const output = generateMetaTags({
      title: 'ToolBox',
      description: 'Developer toolbox in your browser',
      siteName: 'ToolBox',
      imageUrl: 'https://example.com/cover.png',
      pageUrl: 'https://example.com/toolbox',
      author: 'Alice',
      twitterCard: 'summary_large_image',
    })

    expect(output).toBe(
      [
        '<meta name="description" content="Developer toolbox in your browser" />',
        '<meta name="author" content="Alice" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:title" content="ToolBox" />',
        '<meta property="og:description" content="Developer toolbox in your browser" />',
        '<meta property="og:site_name" content="ToolBox" />',
        '<meta property="og:image" content="https://example.com/cover.png" />',
        '<meta property="og:url" content="https://example.com/toolbox" />',
        '<meta name="twitter:card" content="summary_large_image" />',
      ].join('\n'),
    )
  })

  it('returns an empty string for empty options', () => {
    expect(generateMetaTags({})).toBe('')
    expect(generateMetaTags({ title: '', description: '' })).toBe('')
  })

  it('skips empty fields but keeps provided ones', () => {
    const output = generateMetaTags({ title: 'Only title' })
    expect(output).toBe(
      [
        '<meta property="og:type" content="website" />',
        '<meta property="og:title" content="Only title" />',
      ].join('\n'),
    )
  })

  it('omits og:type when only non-open-graph fields are set', () => {
    expect(generateMetaTags({ author: 'Alice', twitterCard: 'summary' })).toBe(
      [
        '<meta name="author" content="Alice" />',
        '<meta name="twitter:card" content="summary" />',
      ].join('\n'),
    )
  })

  it('escapes attribute values', () => {
    const output = generateMetaTags({ title: `He said "Hi" & <left>` })
    expect(output).toContain('content="He said &quot;Hi&quot; &amp; &lt;left&gt;"')
  })

  it('emits every supported twitter card type', () => {
    for (const card of twitterCardTypes) {
      expect(generateMetaTags({ twitterCard: card })).toContain(
        `name="twitter:card" content="${card}"`,
      )
    }
  })
})
