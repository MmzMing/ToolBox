import { describe, expect, it } from 'vitest'

import {
  SHARE_LENGTH_WARN,
  decodeSharePayload,
  encodeSharePayload,
  fromBase64Url,
  payloadLooksSensitive,
  toBase64Url,
} from '@/utils/share-codec'

describe('base64url', () => {
  it('round-trips unicode and url-hostile characters', () => {
    for (const value of ['', 'a+b/c=d', '中文 🎉', '{"k":"v"}']) {
      const encoded = toBase64Url(value)
      expect(encoded).not.toMatch(/[+/=]/)
      expect(fromBase64Url(encoded)).toBe(value)
    }
  })

  it('returns null instead of throwing on garbage', () => {
    expect(fromBase64Url('not!!base64')).toBeNull()
  })
})

describe('share payload', () => {
  it('encodes a model and reads it back', () => {
    const payload = encodeSharePayload({ url: 'https://x.com', method: 'POST' })
    expect(decodeSharePayload(payload)).toMatchObject({ url: 'https://x.com' })
  })

  it('returns null for a missing param and for unknown versions', () => {
    expect(decodeSharePayload(undefined)).toBeNull()
    expect(decodeSharePayload('')).toBeNull()
    expect(decodeSharePayload(toBase64Url(JSON.stringify({ v: 99, d: {} })))).toBeNull()
  })

  it('returns null for corrupted input rather than throwing', () => {
    expect(decodeSharePayload('%%%')).toBeNull()
    expect(decodeSharePayload(toBase64Url('not json'))).toBeNull()
  })

  it('exposes the length threshold the UI warns about', () => {
    expect(SHARE_LENGTH_WARN).toBeGreaterThan(0)
  })

  it('spots credentials in the payload', () => {
    expect(payloadLooksSensitive({ headers: [{ name: 'Authorization', value: 'Bearer x' }] })).toBe(
      true,
    )
    expect(payloadLooksSensitive({ options: [{ flag: '-u', value: 'a:b' }] })).toBe(true)
    expect(payloadLooksSensitive({ url: 'https://x.com', headers: [] })).toBe(false)
    expect(payloadLooksSensitive(null)).toBe(false)
  })
})
