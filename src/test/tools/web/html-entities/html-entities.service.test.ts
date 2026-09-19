import { describe, expect, it } from 'vitest'

import {
  decodeHtmlEntities,
  encodeHtmlEntities,
} from '@/tools/web/html-entities/html-entities.service'

describe('encodeHtmlEntities', () => {
  it('encodes the five xml reserved characters with named entities', () => {
    expect(encodeHtmlEntities(`< > & " '`)).toBe('&lt; &gt; &amp; &quot; &apos;')
  })

  it('encodes common symbols with named entities', () => {
    expect(encodeHtmlEntities('©®™…')).toBe('&copy;&reg;&trade;&hellip;')
  })

  it('encodes non-ascii characters as decimal numeric entities', () => {
    expect(encodeHtmlEntities('中文')).toBe('&#20013;&#25991;')
  })

  it('leaves ascii alphanumerics untouched', () => {
    expect(encodeHtmlEntities('abc 123')).toBe('abc 123')
  })

  it('handles empty input', () => {
    expect(encodeHtmlEntities('')).toBe('')
  })

  it('keeps newlines and tabs untouched', () => {
    expect(encodeHtmlEntities('a\nb\tc')).toBe('a\nb\tc')
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&lt; &gt; &amp; &quot; &apos;')).toBe(`< > & " '`)
    expect(decodeHtmlEntities('&copy;&reg;')).toBe('©®')
  })

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeHtmlEntities('&#20013;&#25991;')).toBe('中文')
    expect(decodeHtmlEntities('&#x4E2D;')).toBe('中')
  })

  it('decodes astral-plane code points', () => {
    expect(decodeHtmlEntities('&#128512;')).toBe('😀')
    expect(decodeHtmlEntities('&#x1F600;')).toBe('😀')
  })

  it('handles empty input', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('throws on unknown named entities', () => {
    expect(() => decodeHtmlEntities('&nosuchentity;')).toThrow(/Unknown HTML entity/)
  })
})

describe('roundtrip', () => {
  it('encode then decode restores the original text', () => {
    const text = `<a href="/路径?q=1&x=2" title="中文 "quoted" © 2026">link</a>`
    expect(decodeHtmlEntities(encodeHtmlEntities(text))).toBe(text)
  })
})
