import { describe, expect, it } from 'vitest'

import {
  analyseJwtClaims,
  binaryToText,
  decodeFromBase64,
  decodeJwt,
  decodeUrl,
  encodeToBase64,
  encodeUrl,
  getJwtAlgorithm,
  hexToText,
  htmlEntitiesToText,
  isJwtExpired,
  textToBinary,
  textToHex,
  textToHtmlEntities,
  textToUnicodeEscapes,
  unicodeEscapesToText,
  urlEncodeModes,
} from '@/tools/development/encoder-decoder/encoder-decoder.service'

describe('base64', () => {
  it('roundtrips ascii', () => {
    const encoded = encodeToBase64('hello world')
    expect(encoded).toBe('aGVsbG8gd29ybGQ=')
    expect(decodeFromBase64(encoded)).toBe('hello world')
  })

  it('roundtrips utf-8 chinese and emoji', () => {
    const plain = '中文测试 🚀'
    expect(decodeFromBase64(encodeToBase64(plain))).toBe(plain)
  })

  it('handles empty string', () => {
    expect(encodeToBase64('')).toBe('')
    expect(decodeFromBase64('')).toBe('')
  })

  it('tolerates whitespace inside base64 input', () => {
    expect(decodeFromBase64('aGVs\nbG8g\td29ybGQ=')).toBe('hello world')
  })

  it('throws on invalid base64', () => {
    expect(() => decodeFromBase64('!!!!')).toThrow()
  })
})

describe('jwt', () => {
  const demoToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

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

  it('returns null from isJwtExpired when there is no exp claim', () => {
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

  it('reads the alg claim from the header', () => {
    expect(getJwtAlgorithm({ alg: 'HS256', typ: 'JWT' })).toBe('HS256')
  })

  it('returns null for missing or non-string alg', () => {
    expect(getJwtAlgorithm({ typ: 'JWT' })).toBeNull()
    expect(getJwtAlgorithm({ alg: 123 })).toBeNull()
  })
})

describe('url', () => {
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

  it('decodes percent-encoded utf-8 sequences', () => {
    expect(decodeUrl('%E4%B8%AD%E6%96%87')).toBe('中文')
    expect(decodeUrl('a%20b+c')).toBe('a b+c')
  })

  it('decodes plain text unchanged', () => {
    expect(decodeUrl('abc123')).toBe('abc123')
  })

  it('returns empty for empty input', () => {
    expect(decodeUrl('')).toBe('')
  })

  it('throws on invalid percent sequences', () => {
    expect(() => decodeUrl('%E0%A4%A')).toThrow(Error)
    expect(() => decodeUrl('%ZZ')).toThrow(/Invalid URL-encoded input/)
  })

  it('encode then decode restores the original text', () => {
    const text = 'https://example.com/路径?a=1&b=中文#锚点'
    expect(decodeUrl(encodeUrl(text, 'component'))).toBe(text)
  })
})

describe('unicode', () => {
  it('encodes BMP characters as \\uXXXX', () => {
    expect(textToUnicodeEscapes('A')).toBe('\\u0041')
    expect(textToUnicodeEscapes('中')).toBe('\\u4E2D')
    expect(textToUnicodeEscapes('A中')).toBe('\\u0041\\u4E2D')
  })

  it('encodes astral characters as \\u{...}', () => {
    expect(textToUnicodeEscapes('🚀')).toBe('\\u{1F680}')
  })

  it('returns an empty string for empty input', () => {
    expect(textToUnicodeEscapes('')).toBe('')
  })

  it('decodes \\uXXXX sequences and passes literals through', () => {
    expect(unicodeEscapesToText('\\u0041\\u4E2D')).toBe('A中')
    expect(unicodeEscapesToText('\\u0041abc')).toBe('Aabc')
    expect(unicodeEscapesToText('plain text')).toBe('plain text')
  })

  it('decodes \\u{...} sequences', () => {
    expect(unicodeEscapesToText('\\u{1F680}')).toBe('🚀')
    expect(unicodeEscapesToText('\\u{1F680}\\u4E2D')).toBe('🚀中')
  })

  it('recombines surrogate pairs written as two \\uXXXX', () => {
    expect(unicodeEscapesToText('\\uD83D\\uDE00')).toBe('😀')
    expect(unicodeEscapesToText('\\uD83D\\uDE80')).toBe('🚀')
  })

  it('roundtrips arbitrary text', () => {
    const text = '中文 English 🚀 mix'
    expect(unicodeEscapesToText(textToUnicodeEscapes(text))).toBe(text)
  })

  it('returns an empty string for empty escapes input', () => {
    expect(unicodeEscapesToText('')).toBe('')
  })

  it('throws on malformed escapes', () => {
    expect(() => unicodeEscapesToText('\\u12')).toThrow()
    expect(() => unicodeEscapesToText('\\u{}')).toThrow()
    expect(() => unicodeEscapesToText('\\')).toThrow()
  })

  it('throws on out-of-range code points', () => {
    expect(() => unicodeEscapesToText('\\u{110000}')).toThrow()
  })

  it('encodes code points as decimal html entities', () => {
    expect(textToHtmlEntities('A')).toBe('&#65;')
    expect(textToHtmlEntities('A中')).toBe('&#65;&#20013;')
    expect(textToHtmlEntities('🚀')).toBe('&#128640;')
    expect(textToHtmlEntities('')).toBe('')
  })

  it('decodes decimal and hex entities', () => {
    expect(htmlEntitiesToText('&#65;&#20013;')).toBe('A中')
    expect(htmlEntitiesToText('&#65;&#x4E2D;')).toBe('A中')
    expect(htmlEntitiesToText('&#128640;')).toBe('🚀')
  })

  it('passes plain text through entities decoder', () => {
    expect(htmlEntitiesToText('plain & text')).toBe('plain & text')
  })

  it('roundtrips arbitrary text through entities', () => {
    const text = '实体 entities 🚀'
    expect(htmlEntitiesToText(textToHtmlEntities(text))).toBe(text)
  })

  it('returns an empty string for empty entities input', () => {
    expect(htmlEntitiesToText('')).toBe('')
  })

  it('throws on malformed or out-of-range entities', () => {
    expect(() => htmlEntitiesToText('&#65')).toThrow()
    expect(() => htmlEntitiesToText('&#zz;')).toThrow()
    expect(() => htmlEntitiesToText('&#99999999;')).toThrow()
  })
})

describe('binary', () => {
  it('encodes ascii as spaced 8-bit groups', () => {
    expect(textToBinary('A')).toBe('01000001')
    expect(textToBinary('AB')).toBe('01000001 01000010')
  })

  it('encodes multibyte utf-8 characters', () => {
    expect(textToBinary('中')).toBe('11100100 10111000 10101101')
  })

  it('returns an empty string for empty input', () => {
    expect(textToBinary('')).toBe('')
  })

  it('decodes spaced groups', () => {
    expect(binaryToText('01000001 01000010')).toBe('AB')
  })

  it('tolerates a continuous 8-bit string without spaces', () => {
    expect(binaryToText('0100000101000010')).toBe('AB')
  })

  it('decodes multibyte utf-8 sequences', () => {
    expect(binaryToText('11100100 10111000 10101101')).toBe('中')
  })

  it('roundtrips arbitrary text', () => {
    const text = 'Hello 世界 🚀'
    expect(binaryToText(textToBinary(text))).toBe(text)
  })

  it('returns an empty string for blank binary input', () => {
    expect(binaryToText('')).toBe('')
    expect(binaryToText('   ')).toBe('')
  })

  it('throws on invalid characters', () => {
    expect(() => binaryToText('01 02')).toThrow()
    expect(() => binaryToText('abc')).toThrow()
  })

  it('throws when bit count is not a multiple of 8', () => {
    expect(() => binaryToText('0100000')).toThrow()
    expect(() => binaryToText('0100000 11')).toThrow()
  })

  it('encodes utf-8 bytes as spaced hex pairs', () => {
    expect(textToHex('A')).toBe('41')
    expect(textToHex('AB')).toBe('41 42')
    expect(textToHex('中')).toBe('e4 b8 ad')
    expect(textToHex('')).toBe('')
  })

  it('decodes spaced and continuous hex', () => {
    expect(hexToText('41 42')).toBe('AB')
    expect(hexToText('4142')).toBe('AB')
    expect(hexToText('E4B8AD')).toBe('中')
  })

  it('roundtrips arbitrary text through hex', () => {
    const text = 'hex 十六进制 ff'
    expect(hexToText(textToHex(text))).toBe(text)
  })

  it('returns an empty string for empty hex input', () => {
    expect(hexToText('')).toBe('')
  })

  it('throws on invalid or odd-length hex', () => {
    expect(() => hexToText('zz')).toThrow()
    expect(() => hexToText('41 4')).toThrow()
    expect(() => hexToText('4')).toThrow()
  })
})
