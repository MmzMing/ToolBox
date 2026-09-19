import { describe, expect, it } from 'vitest'

import {
  commonMimeTypes,
  getExtension,
  getExtensions,
  getMimeType,
} from '@/tools/web/mime-types/mime-types.service'

describe('getMimeType', () => {
  it('resolves common extensions', () => {
    expect(getMimeType('png')).toBe('image/png')
    expect(getMimeType('json')).toBe('application/json')
    expect(getMimeType('html')).toBe('text/html')
  })

  it('accepts a leading dot and is case-insensitive', () => {
    expect(getMimeType('.PNG')).toBe('image/png')
    expect(getMimeType('  JSON ')).toBe('application/json')
  })

  it('falls back to the builtin table for entries missing in the lib', () => {
    expect(getMimeType('yaml')).toBe('text/yaml')
  })

  it('returns null for unknown or empty input', () => {
    expect(getMimeType('xyz123')).toBeNull()
    expect(getMimeType('')).toBeNull()
    expect(getMimeType('   ')).toBeNull()
  })
})

describe('getExtension', () => {
  it('resolves the primary extension for common mimes', () => {
    expect(getExtension('image/png')).toBe('png')
    expect(getExtension('application/json')).toBe('json')
  })

  it('is case-insensitive and trims input', () => {
    expect(getExtension('  IMAGE/PNG ')).toBe('png')
  })

  it('falls back to the builtin table', () => {
    expect(getExtension('text/yaml')).toBe('yaml')
  })

  it('returns null for unknown or empty input', () => {
    expect(getExtension('application/unknown-type')).toBeNull()
    expect(getExtension('')).toBeNull()
  })
})

describe('getExtensions', () => {
  it('returns every known extension for a mime', () => {
    expect(getExtensions('text/plain')).toContain('txt')
    expect(getExtensions('image/jpeg')).toContain('jpg')
    expect(getExtensions('image/jpeg')).toContain('jpeg')
  })

  it('returns an empty array for unknown or empty input', () => {
    expect(getExtensions('application/unknown-type')).toEqual([])
    expect(getExtensions('')).toEqual([])
  })
})

describe('commonMimeTypes', () => {
  it('contains at least 30 well-formed rows', () => {
    expect(commonMimeTypes.length).toBeGreaterThanOrEqual(30)
    for (const { extension, mime } of commonMimeTypes) {
      expect(extension).toMatch(/^[a-z0-9.]+$/)
      expect(mime).toMatch(/^[\w.-]+\/[\w.+*-]+$/)
    }
  })

  it('has unique extensions', () => {
    const extensions = commonMimeTypes.map((mapping) => mapping.extension)
    expect(new Set(extensions).size).toBe(extensions.length)
  })
})
