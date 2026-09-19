import { describe, expect, it } from 'vitest'

import {
  decodeSafelink,
  maxDecodeDepth,
  redirectParamNames,
} from '@/tools/web/safelink-decoder/safelink-decoder.service'

function wrap(url: string, param = 'url'): string {
  return `https://go.example.com/?${param}=${encodeURIComponent(url)}`
}

describe('decodeSafelink', () => {
  it('returns the original url when there are no redirect params', () => {
    const input = 'https://example.com/page?x=1'
    expect(decodeSafelink(input)).toEqual({ steps: [], target: input })
  })

  it('unwraps a single redirect layer', () => {
    const result = decodeSafelink(wrap('https://example.com/page'))
    expect(result).toEqual({
      steps: ['https://example.com/page'],
      target: 'https://example.com/page',
    })
  })

  it('follows nested wrappers through several params', () => {
    const inner = 'https://example.com/final'
    const mid = `https://tracker.example.com/r?u=${encodeURIComponent(inner)}`
    const outer = wrap(mid)
    const result = decodeSafelink(outer)
    expect(result.steps).toEqual([mid, inner])
    expect(result.target).toBe(inner)
  })

  it('peels a doubly encoded target inside one param', () => {
    const doubly = wrap(encodeURIComponent('https://example.com/page'))
    const result = decodeSafelink(doubly)
    expect(result.steps).toEqual(['https://example.com/page'])
    expect(result.target).toBe('https://example.com/page')
  })

  it('peels a triply encoded target inside one param', () => {
    const triply = wrap(encodeURIComponent(encodeURIComponent('https://example.com/final')))
    const result = decodeSafelink(triply)
    expect(result.target).toBe('https://example.com/final')
    expect(result.steps).toEqual(['https://example.com/final'])
  })

  it('recognizes every documented redirect param name', () => {
    for (const param of redirectParamNames) {
      const result = decodeSafelink(wrap('https://example.com/landing', param))
      expect(result.target).toBe('https://example.com/landing')
    }
  })

  it('ignores params without an http(s) value', () => {
    const input = 'https://example.com/?url=hello%20world'
    expect(decodeSafelink(input)).toEqual({ steps: [], target: input })
  })

  it('ignores unknown param names', () => {
    const input = `https://example.com/?dest=${encodeURIComponent('https://evil.example')}`
    expect(decodeSafelink(input)).toEqual({ steps: [], target: input })
  })

  it('stops after the maximum depth to avoid loops', () => {
    let url = 'https://example.com/final'
    for (let index = 0; index < 8; index += 1) {
      url = wrap(url)
    }
    const result = decodeSafelink(url)
    expect(result.steps.length).toBe(maxDecodeDepth)
  })

  it('keeps a self-referencing param from looping forever', () => {
    const input = 'https://example.com/?url=https%3A%2F%2Fexample.com%2F'
    const result = decodeSafelink(input)
    expect(result.target).toBe('https://example.com/')
  })

  it('throws on invalid urls', () => {
    expect(() => decodeSafelink('')).toThrow(/Invalid URL/)
    expect(() => decodeSafelink('not a url')).toThrow(/Invalid URL/)
    expect(() => decodeSafelink('https://')).toThrow(/Invalid URL/)
  })

  it('survives broken percent encoding inside params', () => {
    const input = 'https://example.com/?u=%E0%A4%A'
    expect(decodeSafelink(input)).toEqual({ steps: [], target: input })
  })
})
