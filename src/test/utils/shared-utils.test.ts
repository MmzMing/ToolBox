import { describe, expect, it } from 'vitest'

import { buildImageFileName, sanitizeFileName } from '@/utils/file-name'
import { selectEvictIds } from '@/utils/lru'
import { insertPngTextChunks, isPng } from '@/utils/png-text'

describe('sanitizeFileName', () => {
  it('strips path separators, quotes and control characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
  })

  it('collapses whitespace, caps length and falls back', () => {
    expect(sanitizeFileName('  a   b  ')).toBe('a b')
    expect(sanitizeFileName('x'.repeat(100))).toHaveLength(60)
    expect(sanitizeFileName('///')).toBe('file')
  })
})

describe('buildImageFileName', () => {
  it('picks extensions from mime and prefixes a timestamp', () => {
    const at = Date.UTC(2026, 8, 22, 1, 2, 3)
    expect(buildImageFileName('cat', at, 'image/png')).toMatch(/^2026-09-22T01-02-03-cat\.png$/)
    expect(buildImageFileName('cat', at, 'image/jpeg').endsWith('.jpg')).toBe(true)
    expect(buildImageFileName('cat', at, 'image/webp').endsWith('.webp')).toBe(true)
  })
})

describe('selectEvictIds', () => {
  const stats = [
    { id: 'old', createdAt: 1, bytes: 10 },
    { id: 'mid', createdAt: 2, bytes: 10 },
    { id: 'new', createdAt: 3, bytes: 10 },
  ]

  it('evicts oldest first until count fits', () => {
    expect(selectEvictIds(stats, 2, 1000)).toEqual(['old'])
  })

  it('evicts oldest first until bytes fit', () => {
    expect(selectEvictIds(stats, 10, 25)).toEqual(['old'])
  })

  it('evicts nothing within limits', () => {
    expect(selectEvictIds(stats, 3, 30)).toEqual([])
  })
})

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function fakePng(): Uint8Array {
  // signature + one 13-byte chunk standing in for IHDR + tail byte
  const bytes = new Uint8Array(8 + 12 + 13 + 1)
  bytes.set(PNG_SIGNATURE, 0)
  bytes[11] = 13
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  bytes[bytes.length - 1] = 0xff
  return bytes
}

describe('insertPngTextChunks', () => {
  it('passes non-PNG bytes through untouched', () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(insertPngTextChunks(bytes, [['a', 'b']])).toBe(bytes)
  })

  it('inserts an iTXt chunk right after IHDR and keeps the tail', () => {
    const png = fakePng()
    const out = insertPngTextChunks(png, [['Description', '一只猫']])
    expect(isPng(out)).toBe(true)
    expect(out.length).toBeGreaterThan(png.length)
    const type = String.fromCharCode(out[37], out[38], out[39], out[40])
    expect(type).toBe('iTXt')
    const text = new TextDecoder().decode(out.subarray(33 + 8 + 12, out.length - 1))
    expect(text).toContain('一只猫')
    expect(out[out.length - 1]).toBe(0xff)
  })
})
