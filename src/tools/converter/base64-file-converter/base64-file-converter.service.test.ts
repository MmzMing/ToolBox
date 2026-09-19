import { describe, expect, it } from 'vitest'

import {
  base64ToFile,
  buildDataUrl,
  fileToBase64,
  formatFileSize,
  guessFileName,
  parseDataUrl,
  parseDataUrlName,
} from './service'

describe('parseDataUrl', () => {
  it('parses mime, base64 payload and bytes', () => {
    const parts = parseDataUrl('data:text/plain;base64,aGVsbG8=')
    expect(parts.mime).toBe('text/plain')
    expect(parts.base64).toBe('aGVsbG8=')
    expect(Array.from(parts.bytes)).toEqual(Array.from(Buffer.from('hello')))
  })

  it('defaults mime to text/plain when missing', () => {
    const parts = parseDataUrl('data:;base64,QQ==')
    expect(parts.mime).toBe('text/plain')
    expect(Array.from(parts.bytes)).toEqual([0x41])
  })

  it('tolerates whitespace inside the payload', () => {
    const parts = parseDataUrl('data:text/plain;base64,aGVs\nbG8=')
    expect(new TextDecoder().decode(parts.bytes)).toBe('hello')
  })

  it('throws on empty input', () => {
    expect(() => parseDataUrl('')).toThrow()
  })

  it('throws when the data: prefix or comma is missing', () => {
    expect(() => parseDataUrl('text/plain;base64,aGVsbG8=')).toThrow()
  })

  it('throws when encoding is not base64', () => {
    expect(() => parseDataUrl('data:text/plain,hello')).toThrow()
  })

  it('throws on malformed base64 payload', () => {
    expect(() => parseDataUrl('data:text/plain;base64,####')).toThrow()
  })
})

describe('buildDataUrl', () => {
  it('builds a canonical data URL from bytes', () => {
    expect(buildDataUrl('text/plain', Uint8Array.from(Buffer.from('hello')))).toBe(
      'data:text/plain;base64,aGVsbG8=',
    )
  })

  it('handles empty bytes and empty mime', () => {
    expect(buildDataUrl('', new Uint8Array(0))).toBe('data:text/plain;base64,')
  })
})

describe('data url roundtrip', () => {
  it('roundtrips arbitrary bytes through build + parse', () => {
    const bytes = Uint8Array.from(Buffer.from('中文 🚀 bytes'))
    const parts = parseDataUrl(buildDataUrl('application/octet-stream', bytes))
    expect(parts.mime).toBe('application/octet-stream')
    expect(Array.from(parts.bytes)).toEqual(Array.from(bytes))
  })
})

describe('file helpers', () => {
  it('fileToBase64 encodes file content with its mime type', async () => {
    const file = new File([Buffer.from('hello')], 'a.txt', { type: 'text/plain' })
    await expect(fileToBase64(file)).resolves.toBe('data:text/plain;base64,aGVsbG8=')
  })

  it('fileToBase64 falls back to application/octet-stream', async () => {
    const file = new File([Buffer.from('x')], 'blob')
    await expect(fileToBase64(file)).resolves.toBe('data:application/octet-stream;base64,eA==')
  })

  it('base64ToFile rebuilds a File with name, type and size', () => {
    const file = base64ToFile('data:application/json;base64,e30=', 'x.json')
    expect(file.name).toBe('x.json')
    expect(file.type).toBe('application/json')
    expect(file.size).toBe(2)
  })

  it('base64ToFile throws on invalid data URL', () => {
    expect(() => base64ToFile('not-a-data-url', 'x.json')).toThrow()
  })

  it('parseDataUrlName extracts the name parameter', () => {
    expect(parseDataUrlName('data:text/plain;name=hello.txt;base64,QQ==')).toBe('hello.txt')
    expect(parseDataUrlName('data:;name=report%20v1.csv;base64,QQ==')).toBe('report v1.csv')
    expect(parseDataUrlName('data:text/plain;base64,QQ==')).toBeNull()
  })

  it('guessFileName prefers the name parameter then the mime extension', () => {
    expect(guessFileName('data:text/plain;name=hi.txt;base64,QQ==')).toBe('hi.txt')
    expect(guessFileName('data:image/png;base64,QQ==')).toBe('download.png')
    expect(guessFileName('data:weird/mime;base64,QQ==')).toBe('download.bin')
  })
})

describe('formatFileSize', () => {
  it('formats bytes below 1 KB without decimals', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(999)).toBe('999 B')
  })

  it('formats KB/MB with one decimal', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
  })

  it('clamps negative or non-finite input to zero bytes', () => {
    expect(formatFileSize(-5)).toBe('0 B')
    expect(formatFileSize(Number.NaN)).toBe('0 B')
  })
})
