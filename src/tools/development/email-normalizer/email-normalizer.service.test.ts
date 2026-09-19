import { describe, expect, it } from 'vitest'

import { normalizeEmail, normalizeEmailList } from './email-normalizer.service'

const OPTIONS = { gmailDots: true, plusTag: true, lowercase: true }

describe('normalizeEmail', () => {
  it('removes dots and plus tags for gmail addresses', () => {
    expect(normalizeEmail('John.Doe+news@gmail.com', OPTIONS)).toBe('johndoe@gmail.com')
    expect(normalizeEmail('a.b.c+x@googlemail.com', OPTIONS)).toBe('abc@googlemail.com')
  })

  it('applies gmail rules per option', () => {
    expect(normalizeEmail('John.Doe@gmail.com', { ...OPTIONS, gmailDots: false })).toBe(
      'john.doe@gmail.com',
    )
    expect(normalizeEmail('John.Doe+tag@gmail.com', { ...OPTIONS, plusTag: false })).toBe(
      'johndoe+tag@gmail.com',
    )
  })

  it('never alters dots or plus tags on non-gmail domains', () => {
    expect(normalizeEmail('First.Last+tag@outlook.com', OPTIONS)).toBe('first.last+tag@outlook.com')
    expect(normalizeEmail('First.Last+tag@yahoo.co.uk', { ...OPTIONS, lowercase: false })).toBe(
      'First.Last+tag@yahoo.co.uk',
    )
  })

  it('lowercases only when enabled', () => {
    expect(normalizeEmail('USER@EXAMPLE.COM', { ...OPTIONS, lowercase: false })).toBe(
      'USER@EXAMPLE.COM',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  user@gmail.com  ', OPTIONS)).toBe('user@gmail.com')
  })

  it('throws on invalid addresses', () => {
    expect(() => normalizeEmail('', OPTIONS)).toThrow(/Invalid email/)
    expect(() => normalizeEmail('not-an-email', OPTIONS)).toThrow(/Invalid email/)
    expect(() => normalizeEmail('a@b', OPTIONS)).toThrow(/Invalid email/)
    expect(() => normalizeEmail('a b@c.com', OPTIONS)).toThrow(/Invalid email/)
  })
})

describe('normalizeEmailList', () => {
  it('normalizes every non-empty line', () => {
    const input = 'User.Name+x@gmail.com\nplain@outlook.com\n\n  A.B@gmail.com  '
    expect(normalizeEmailList(input, OPTIONS, false)).toEqual([
      'username@gmail.com',
      'plain@outlook.com',
      'ab@gmail.com',
    ])
  })

  it('deduplicates when enabled', () => {
    const input = 'john@gmail.com\nJohn@gmail.com\nJ.O.H.N+x@gmail.com'
    expect(normalizeEmailList(input, OPTIONS, true)).toEqual(['john@gmail.com'])
    expect(normalizeEmailList(input, OPTIONS, false)).toHaveLength(3)
  })

  it('returns an empty list for empty input', () => {
    expect(normalizeEmailList('', OPTIONS, false)).toEqual([])
    expect(normalizeEmailList('\n \n', OPTIONS, true)).toEqual([])
  })

  it('throws when any line is invalid', () => {
    expect(() => normalizeEmailList('a@gmail.com\nbad', OPTIONS, false)).toThrow(
      /Invalid email address: bad/,
    )
  })
})
