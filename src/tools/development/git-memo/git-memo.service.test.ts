import { describe, expect, it } from 'vitest'

import { gitMemoGroups } from './git-memo.service'

describe('gitMemoGroups', () => {
  it('contains the eight expected groups', () => {
    expect(gitMemoGroups.map((group) => group.id)).toEqual([
      'create',
      'snapshot',
      'branch',
      'remote',
      'undo',
      'history',
      'tags',
      'stash',
    ])
  })

  it('has 5-10 commands per group', () => {
    for (const group of gitMemoGroups) {
      expect(group.items.length).toBeGreaterThanOrEqual(5)
      expect(group.items.length).toBeLessThanOrEqual(10)
    }
  })

  it('starts every command with git and has unique description keys', () => {
    const keys = gitMemoGroups.flatMap((group) => group.items.map((item) => item.descriptionKey))
    for (const group of gitMemoGroups) {
      for (const item of group.items) {
        expect(item.command.startsWith('git ')).toBe(true)
      }
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
})
