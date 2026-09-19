import { describe, expect, it } from 'vitest'

import { regexMemoGroups } from '@/tools/cheatsheet/regex-memo/regex-memo.service'

describe('regexMemoGroups', () => {
  it('contains the six expected groups', () => {
    expect(regexMemoGroups.map((group) => group.id)).toEqual([
      'anchors',
      'classes',
      'quantifiers',
      'groups',
      'assertions',
      'examples',
    ])
  })

  it('has a non-empty item list in every group', () => {
    for (const group of regexMemoGroups) {
      expect(group.items.length).toBeGreaterThan(0)
      for (const item of group.items) {
        expect(item.pattern).not.toBe('')
        expect(item.descriptionKey).toMatch(/^item-/)
      }
    }
  })

  it('has no duplicate patterns across all groups', () => {
    const patterns = regexMemoGroups.flatMap((group) => group.items.map((item) => item.pattern))
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('has no duplicate description keys', () => {
    const keys = regexMemoGroups.flatMap((group) => group.items.map((item) => item.descriptionKey))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps example patterns valid as regexes', () => {
    const examples = regexMemoGroups.find((group) => group.id === 'examples')
    for (const item of examples?.items ?? []) {
      expect(() => new RegExp(item.pattern)).not.toThrow()
    }
  })
})
