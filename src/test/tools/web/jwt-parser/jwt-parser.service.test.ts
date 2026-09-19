import { describe, expect, it } from 'vitest'

import {
  analyseJwtClaims,
  decodeJwt,
  getJwtAlgorithm,
  isJwtExpired,
} from '@/tools/web/jwt-parser/jwt-parser.service'

const demoToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('decodeJwt', () => {
  it('decodes header and payload of a valid token', () => {
    const parts = decodeJwt(demoToken)
    expect(parts.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(parts.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
  })

  it('keeps the raw signature segment', () => {
    const parts = decodeJwt(demoToken)
    expect(parts.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })

  it('trims surrounding whitespace', () => {
    expect(decodeJwt(`  ${demoToken}  `).payload).toEqual({
      sub: '1234567890',
      name: 'John Doe',
      iat: 1516239022,
    })
  })

  it('rejects tokens without three parts', () => {
    expect(() => decodeJwt('abc')).toThrow(/Invalid JWT/)
    expect(() => decodeJwt('a.b')).toThrow(/Invalid JWT/)
  })

  it('rejects tokens with empty segments', () => {
    expect(() => decodeJwt('.payload.sig')).toThrow(/Invalid JWT/)
    expect(() => decodeJwt('header..sig')).toThrow(/Invalid JWT/)
  })

  it('rejects malformed base64 payloads', () => {
    expect(() => decodeJwt('!!!.!!!.sig')).toThrow(/Invalid JWT/)
  })

  it('rejects empty input', () => {
    expect(() => decodeJwt('')).toThrow(/Invalid JWT/)
  })
})

describe('analyseJwtClaims', () => {
  it('marks exp, iat and nbf as dates converted to ISO strings', () => {
    const claims = analyseJwtClaims({ exp: 1700000000, iat: 1516239022, nbf: 1600000000 })
    expect(claims).toEqual([
      { key: 'exp', value: new Date(1700000000 * 1000).toISOString(), kind: 'date' },
      { key: 'iat', value: new Date(1516239022 * 1000).toISOString(), kind: 'date' },
      { key: 'nbf', value: new Date(1600000000 * 1000).toISOString(), kind: 'date' },
    ])
  })

  it('keeps plain claims untouched', () => {
    const claims = analyseJwtClaims({ sub: 'user-1', admin: true, aud: ['a', 'b'] })
    expect(claims).toEqual([
      { key: 'sub', value: 'user-1', kind: 'plain' },
      { key: 'admin', value: 'true', kind: 'plain' },
      { key: 'aud', value: '["a","b"]', kind: 'plain' },
    ])
  })

  it('treats non-numeric date claims as plain values', () => {
    expect(analyseJwtClaims({ exp: 'soon' })).toEqual([
      { key: 'exp', value: 'soon', kind: 'plain' },
    ])
  })

  it('returns an empty list for an empty payload', () => {
    expect(analyseJwtClaims({})).toEqual([])
  })
})

describe('isJwtExpired', () => {
  it('returns null when there is no exp claim', () => {
    expect(isJwtExpired({ sub: 'x' }, 0)).toBeNull()
    expect(isJwtExpired({ exp: 'not-a-number' }, 0)).toBeNull()
  })

  it('reports expired tokens', () => {
    expect(isJwtExpired({ exp: 1000 }, 1000 * 1000)).toBe(true)
    expect(isJwtExpired({ exp: 1001 }, 1000 * 1000)).toBe(false)
  })

  it('treats now exactly at exp as expired', () => {
    expect(isJwtExpired({ exp: 1000 }, 999_999)).toBe(false)
    expect(isJwtExpired({ exp: 1000 }, 1_000_000)).toBe(true)
  })
})

describe('getJwtAlgorithm', () => {
  it('reads the alg claim from the header', () => {
    expect(getJwtAlgorithm({ alg: 'HS256', typ: 'JWT' })).toBe('HS256')
  })

  it('returns null for missing or non-string alg', () => {
    expect(getJwtAlgorithm({ typ: 'JWT' })).toBeNull()
    expect(getJwtAlgorithm({ alg: 123 })).toBeNull()
  })
})
