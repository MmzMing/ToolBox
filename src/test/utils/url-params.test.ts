import { describe, expect, it } from 'vitest'

import { applyUrlParams, pickUrlParams, urlWithParams } from '@/utils/url-params'

describe('applyUrlParams', () => {
  it('adds missing keys and overwrites existing ones', () => {
    const next = applyUrlParams(new URLSearchParams('?domain=old.com'), {
      domain: 'example.com',
      source: 'alidns',
    })
    expect(next.toString()).toBe('domain=example.com&source=alidns')
  })

  it('keeps unrelated params in place', () => {
    const next = applyUrlParams(new URLSearchParams('?utm=1&domain=old.com&lang=en'), {
      domain: 'example.com',
    })
    expect(next.toString()).toBe('utm=1&domain=example.com&lang=en')
  })

  it('drops the key for null and empty values', () => {
    expect(applyUrlParams(new URLSearchParams('?a=1&b=2'), { a: null, b: '' }).toString()).toBe('')
  })

  it('does not mutate the params it was given', () => {
    const current = new URLSearchParams('?domain=old.com')
    applyUrlParams(current, { domain: 'example.com' })
    expect(current.toString()).toBe('domain=old.com')
  })
})

describe('pickUrlParams', () => {
  it('returns only the requested non-empty keys', () => {
    const picked = pickUrlParams(new URLSearchParams('?domain=example.com&empty=&other=1'), [
      'domain',
      'empty',
      'absent',
    ])
    expect(picked).toEqual({ domain: 'example.com' })
  })

  it('returns an empty record for a bare query', () => {
    expect(pickUrlParams(new URLSearchParams(''), ['domain'])).toEqual({})
  })
})

describe('urlWithParams', () => {
  it('rewrites the query and preserves the pathname and hash', () => {
    expect(urlWithParams('http://localhost/dns-lookup?utm=1#top', { domain: 'example.com' })).toBe(
      'http://localhost/dns-lookup?utm=1&domain=example.com#top',
    )
  })

  it('percent-encodes values so they survive a copy-paste', () => {
    expect(
      urlWithParams('http://localhost/url-parser', { url: 'https://a.test/x?p=1&q=中文' }),
    ).toBe(
      'http://localhost/url-parser?url=https%3A%2F%2Fa.test%2Fx%3Fp%3D1%26q%3D%E4%B8%AD%E6%96%87',
    )
  })
})
