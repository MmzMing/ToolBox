import { describe, expect, it } from 'vitest'

import { decodeUrl, encodeUrl, urlEncodeModes } from '@/tools/web/url-encoder/url-encoder.service'

describe('encodeUrl', () => {
  it('encodes reserved characters in component mode', () => {
    expect(encodeUrl('https://example.com/a b?q=中文', 'component')).toBe(
      'https%3A%2F%2Fexample.com%2Fa%20b%3Fq%3D%E4%B8%AD%E6%96%87',
    )
  })

  it('keeps URL structure characters in uri mode', () => {
    expect(encodeUrl('https://example.com/a b?q=中文', 'uri')).toBe(
      'https://example.com/a%20b?q=%E4%B8%AD%E6%96%87',
    )
  })

  it('leaves ascii alphanumerics untouched', () => {
    expect(encodeUrl('abc123-_.~', 'component')).toBe('abc123-_.~')
  })

  it('handles empty input', () => {
    for (const mode of urlEncodeModes) {
      expect(encodeUrl('', mode)).toBe('')
    }
  })
})

describe('decodeUrl', () => {
  it('decodes percent-encoded utf-8 sequences', () => {
    expect(decodeUrl('%E4%B8%AD%E6%96%87')).toBe('中文')
    expect(decodeUrl('a%20b+c')).toBe('a b+c')
  })

  it('decodes plain text unchanged', () => {
    expect(decodeUrl('abc123')).toBe('abc123')
  })

  it('handles empty input', () => {
    expect(decodeUrl('')).toBe('')
  })

  it('throws on invalid percent sequences', () => {
    expect(() => decodeUrl('%E0%A4%A')).toThrow(Error)
    expect(() => decodeUrl('%ZZ')).toThrow(/Invalid URL-encoded input/)
  })
})

describe('roundtrip', () => {
  it('encode then decode restores the original text', () => {
    const text = 'https://example.com/路径?a=1&b=中文#锚点'
    expect(decodeUrl(encodeUrl(text, 'component'))).toBe(text)
  })
})
