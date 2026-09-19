import { describe, expect, it } from 'vitest'

import { parseUrl } from '@/tools/web/url-parser/url-parser.service'

describe('parseUrl', () => {
  it('splits a full url into its components', () => {
    const input =
      'https://user:pass@example.com:8443/a/b/index.html?q=1&tag=%20x%20&r=中文#section-2'
    const parsed = parseUrl(input)
    const expected = new URL(input)

    expect(parsed.href).toBe(expected.href)
    expect(parsed.protocol).toBe(expected.protocol)
    expect(parsed.host).toBe(expected.host)
    expect(parsed.hostname).toBe(expected.hostname)
    expect(parsed.port).toBe(expected.port)
    expect(parsed.pathname).toBe(expected.pathname)
    expect(parsed.search).toBe(expected.search)
    expect(parsed.hash).toBe(expected.hash)
    expect(parsed.origin).toBe(expected.origin)

    expect(parsed.protocol).toBe('https:')
    expect(parsed.port).toBe('8443')
    expect(parsed.pathname).toBe('/a/b/index.html')
    expect(parsed.hash).toBe('#section-2')
  })

  it('extracts search params in order with decoded values', () => {
    const parsed = parseUrl('https://example.com/search?q=中文&page=2&q=dup')
    expect(parsed.searchParams).toEqual([
      { name: 'q', value: '中文' },
      { name: 'page', value: '2' },
      { name: 'q', value: 'dup' },
    ])
  })

  it('normalizes the input like the URL class', () => {
    const parsed = parseUrl('http://Example.COM/a')
    expect(parsed.hostname).toBe(new URL('http://Example.COM/a').hostname)
    expect(parsed.hostname).toBe('example.com')
  })

  it('returns empty strings for absent port and hash', () => {
    const parsed = parseUrl('https://example.com/path')
    expect(parsed.port).toBe('')
    expect(parsed.hash).toBe('')
    expect(parsed.searchParams).toEqual([])
  })

  it('handles empty input', () => {
    expect(() => parseUrl('')).toThrow(/Invalid URL/)
  })

  it('throws on invalid urls', () => {
    expect(() => parseUrl('not a url')).toThrow(/Invalid URL/)
    expect(() => parseUrl('example.com/no-protocol')).toThrow(/Invalid URL/)
    expect(() => parseUrl('https://')).toThrow(/Invalid URL/)
  })
})
