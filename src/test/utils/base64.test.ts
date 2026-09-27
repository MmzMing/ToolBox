import { describe, expect, it } from 'vitest'

import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToDataUrl,
  dataUrlByteLength,
  dataUrlToBytes,
} from '@/utils/base64'

const encode = (text: string) => new TextEncoder().encode(text)

describe('bytesToBase64 / base64ToBytes', () => {
  it('matches the RFC 4648 standard alphabet vectors', () => {
    expect(bytesToBase64(encode('Man'))).toBe('TWFu')
    expect(bytesToBase64(encode('Ma'))).toBe('TWE=')
    expect(bytesToBase64(encode('M'))).toBe('TQ==')
    expect(bytesToBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })

  it('round-trips every byte value across the btoa chunk boundary', () => {
    const bytes = new Uint8Array(Array.from({ length: 0x8001 }, (_, i) => i % 256))
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('ignores wrapping whitespace on decode', () => {
    const bytes = encode('The quick brown fox jumps over the lazy dog')
    const wrapped = bytesToBase64(bytes).replace(/(.{20})/g, '$1\r\n')
    expect(base64ToBytes(wrapped)).toEqual(bytes)
  })

  it('rejects foreign characters and unpaddable lengths', () => {
    expect(() => base64ToBytes('aGVsb$G8=')).toThrowError(/outside the base64 alphabet/)
    expect(() => base64ToBytes('aGVsbG8')).toThrowError(/multiple of 4/)
  })
})

describe('bytesToBase64Url / base64UrlToBytes', () => {
  it('emits the JWK flavour: no padding, no + or /', () => {
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(bytesToBase64Url(new Uint8Array([]))).toBe('')
  })

  it('round-trips every padding remainder', () => {
    for (const length of [1, 2, 3, 32]) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37 + 200) % 256))
      const encoded = bytesToBase64Url(bytes)
      expect(encoded).not.toMatch(/[+/=]/)
      expect(base64UrlToBytes(encoded)).toEqual(bytes)
    }
  })

  it('rejects standard-alphabet characters', () => {
    expect(() => base64UrlToBytes('a+_8')).toThrowError(/base64url/)
  })
})

describe('data url helpers', () => {
  it('encodes and decodes payloads with their mime type', () => {
    const bytes = new Uint8Array([1, 2, 3, 254])
    const url = bytesToDataUrl(bytes, 'image/png')
    expect(url).toBe('data:image/png;base64,AQID/g==')
    expect(dataUrlToBytes(url)).toEqual({ bytes, mimeType: 'image/png' })
  })

  it('estimates decoded size and returns 0 for a payload-less url', () => {
    expect(dataUrlByteLength('data:image/png;base64,AQID/g==')).toBe(4)
    expect(dataUrlByteLength('not-a-data-url')).toBe(0)
  })
})
