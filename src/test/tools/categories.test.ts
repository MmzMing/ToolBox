import { describe, expect, it } from 'vitest'

import { CATEGORY_PARAM, resolveCategoryParam } from '@/tools/categories'

describe('resolveCategoryParam', () => {
  it('resolves a registered category key', () => {
    expect(resolveCategoryParam('crypto')).toBe('crypto')
    expect(resolveCategoryParam('cheatsheet')).toBe('cheatsheet')
  })

  it('returns null for an absent or malformed value', () => {
    expect(resolveCategoryParam(null)).toBeNull()
    expect(resolveCategoryParam(undefined)).toBeNull()
    expect(resolveCategoryParam('')).toBeNull()
  })

  it('never resolves a near miss', () => {
    expect(resolveCategoryParam('Crypto')).toBeNull()
    expect(resolveCategoryParam('no-such-category')).toBeNull()
    expect(resolveCategoryParam('../crypto')).toBeNull()
  })

  it('exposes the query parameter name used by footer links', () => {
    expect(CATEGORY_PARAM).toBe('category')
  })
})
