import { describe, expect, it } from 'vitest'

import {
  getReasonPhrase,
  getStatusGroup,
  statusCategories,
  statusGroupKeys,
  statusesByGroup,
} from '@/tools/cheatsheet/http-status-codes/http-status-codes.service'

describe('getReasonPhrase', () => {
  it('returns the standard reason phrases', () => {
    expect(getReasonPhrase(200)).toBe('OK')
    expect(getReasonPhrase(301)).toBe('Moved Permanently')
    expect(getReasonPhrase(404)).toBe('Not Found')
    expect(getReasonPhrase(500)).toBe('Internal Server Error')
  })

  it('returns null for unknown or out-of-range codes', () => {
    expect(getReasonPhrase(999)).toBeNull()
    expect(getReasonPhrase(42)).toBeNull()
    expect(getReasonPhrase(-1)).toBeNull()
  })
})

describe('getStatusGroup', () => {
  it('groups codes by their first digit', () => {
    expect(getStatusGroup(100)).toBe('informational')
    expect(getStatusGroup(204)).toBe('success')
    expect(getStatusGroup(302)).toBe('redirect')
    expect(getStatusGroup(404)).toBe('clientError')
    expect(getStatusGroup(503)).toBe('serverError')
  })

  it('returns null for invalid codes', () => {
    expect(getStatusGroup(99)).toBeNull()
    expect(getStatusGroup(600)).toBeNull()
    expect(getStatusGroup(-200)).toBeNull()
    expect(getStatusGroup(404.5)).toBeNull()
    expect(getStatusGroup(Number.NaN)).toBeNull()
  })
})

describe('statusesByGroup', () => {
  it('returns only entries within the group range', () => {
    const success = statusesByGroup('success')
    expect(success.every((entry) => entry.code >= 200 && entry.code <= 299)).toBe(true)
    expect(success.map((entry) => entry.code)).toContain(200)
    expect(success.map((entry) => entry.code)).toContain(206)
  })

  it('partitions the whole catalog without overlaps', () => {
    const grouped = statusGroupKeys.flatMap((group) => statusesByGroup(group))
    expect(grouped.length).toBe(statusCategories.length)
    const codes = grouped.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('keeps codes sorted inside every group', () => {
    for (const group of statusGroupKeys) {
      const codes = statusesByGroup(group).map((entry) => entry.code)
      expect(codes).toEqual([...codes].sort((a, b) => a - b))
    }
  })
})

describe('statusCategories', () => {
  it('contains about 50 well-formed unique entries', () => {
    expect(statusCategories.length).toBeGreaterThanOrEqual(45)
    expect(statusCategories.length).toBeLessThanOrEqual(60)
    const codes = statusCategories.map((entry) => entry.code)
    const nameKeys = statusCategories.map((entry) => entry.nameKey)
    expect(new Set(codes).size).toBe(codes.length)
    expect(new Set(nameKeys).size).toBe(nameKeys.length)
    for (const entry of statusCategories) {
      expect(entry.nameKey).toMatch(/^[a-z][A-Za-z]+$/)
      expect(getStatusGroup(entry.code)).not.toBeNull()
    }
  })

  it('has a lib reason phrase for every entry', () => {
    for (const entry of statusCategories) {
      expect(getReasonPhrase(entry.code)).not.toBeNull()
    }
  })

  it('is sorted by code', () => {
    const codes = statusCategories.map((entry) => entry.code)
    expect(codes).toEqual([...codes].sort((a, b) => a - b))
  })
})
