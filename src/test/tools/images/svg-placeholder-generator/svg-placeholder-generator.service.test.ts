import { describe, expect, it } from 'vitest'

import {
  buildSvgPlaceholder,
  escapeXml,
  svgToDataUri,
} from '@/tools/images/svg-placeholder-generator/svg-placeholder-generator.service'

const baseOptions = {
  width: 800,
  height: 600,
  bgColor: '#e2e8f0',
  fgColor: '#334155',
  text: '800×600',
  fontSize: 24,
}

describe('buildSvgPlaceholder', () => {
  it('returns an svg string with the requested dimensions', () => {
    const svg = buildSvgPlaceholder(baseOptions)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('width="800"')
    expect(svg).toContain('height="600"')
  })

  it('centers the text with middle anchors', () => {
    const svg = buildSvgPlaceholder(baseOptions)
    expect(svg).toContain('text-anchor="middle"')
    expect(svg).toContain('dominant-baseline="middle"')
    expect(svg).toContain('x="50%"')
    expect(svg).toContain('y="50%"')
  })

  it('applies background and foreground colors', () => {
    const svg = buildSvgPlaceholder(baseOptions)
    expect(svg).toContain('fill="#e2e8f0"')
    expect(svg).toContain('fill="#334155"')
  })

  it('escapes xml special characters in the text', () => {
    const svg = buildSvgPlaceholder({ ...baseOptions, text: '<a & "b">' })
    expect(svg).toContain('&lt;a &amp; &quot;b&quot;&gt;')
  })

  it('throws on non-positive dimensions', () => {
    expect(() => buildSvgPlaceholder({ ...baseOptions, width: 0 })).toThrow(Error)
    expect(() => buildSvgPlaceholder({ ...baseOptions, height: -10 })).toThrow(Error)
  })
})

describe('escapeXml', () => {
  it('escapes all five special characters', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('hello 800×600')).toBe('hello 800×600')
  })
})

describe('svgToDataUri', () => {
  it('returns a utf-8 svg data uri', () => {
    expect(svgToDataUri('<svg></svg>')).toBe(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    )
  })

  it('keeps non-ascii text decodable', () => {
    const svg = buildSvgPlaceholder({ ...baseOptions, text: '中文' })
    const dataUri = svgToDataUri(svg)
    expect(dataUri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(dataUri.replace('data:image/svg+xml;charset=utf-8,', ''))).toBe(svg)
  })
})
