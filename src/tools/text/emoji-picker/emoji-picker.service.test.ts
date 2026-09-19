import { describe, expect, it } from 'vitest'

import { loadEmojiGroups, searchEmojis } from './emoji-picker.service'

describe('loadEmojiGroups', () => {
  it('returns all non-empty groups', () => {
    const groups = loadEmojiGroups()
    expect(groups.length).toBeGreaterThanOrEqual(9)
    for (const group of groups) {
      expect(group.id).not.toBe('')
      expect(group.labelKey.startsWith('emoji-picker.group-')).toBe(true)
      expect(group.emojis.length).toBeGreaterThan(0)
      for (const emoji of group.emojis) {
        expect(emoji.char).not.toBe('')
        expect(emoji.name).not.toBe('')
      }
    }
  })

  it('keeps emoji clusters intact', () => {
    const all = loadEmojiGroups().flatMap((group) => group.emojis)
    const family = all.find((emoji) => emoji.char.includes('\u200d'))
    expect(family).toBeDefined()
  })
})

describe('searchEmojis', () => {
  it('finds emojis by name across groups', () => {
    const results = searchEmojis('grinning')
    expect(results.length).toBeGreaterThan(0)
    for (const emoji of results) {
      expect(emoji.name.toLowerCase()).toContain('grinning')
    }
  })

  it('matches case-insensitively', () => {
    expect(searchEmojis('GRINNING').length).toBe(searchEmojis('grinning').length)
  })

  it('returns empty array for blank queries', () => {
    expect(searchEmojis('')).toEqual([])
    expect(searchEmojis('   ')).toEqual([])
  })

  it('returns empty array when nothing matches', () => {
    expect(searchEmojis('no-such-emoji-keyword-xyz')).toEqual([])
  })
})
