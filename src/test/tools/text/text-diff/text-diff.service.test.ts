import { describe, expect, it } from 'vitest'

import { buildDiffRows, diffStats } from '@/tools/text/text-diff/text-diff.service'

describe('buildDiffRows', () => {
  it('marks added and removed lines', () => {
    const rows = buildDiffRows('a\nb\nc', 'a\nd\nc')
    expect(rows).toEqual([
      { type: 'unchanged', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'd' },
      { type: 'unchanged', text: 'c' },
    ])
  })

  it('counts additions and deletions', () => {
    const rows = buildDiffRows('a\nb\nc', 'a\nd\ne')
    const stats = diffStats(rows)
    expect(stats).toEqual({ added: 2, removed: 2 })
  })

  it('returns only unchanged rows for identical texts', () => {
    const rows = buildDiffRows('same\ntext', 'same\ntext')
    expect(rows.map((row) => row.type)).toEqual(['unchanged', 'unchanged'])
    expect(diffStats(rows)).toEqual({ added: 0, removed: 0 })
  })

  it('handles empty inputs', () => {
    expect(buildDiffRows('', '')).toEqual([])
    expect(diffStats([])).toEqual({ added: 0, removed: 0 })
  })

  it('treats everything as added when the original is empty', () => {
    const rows = buildDiffRows('', 'new')
    expect(rows).toEqual([{ type: 'added', text: 'new' }])
  })

  it('treats everything as removed when the modified text is empty', () => {
    const rows = buildDiffRows('old', '')
    expect(rows).toEqual([{ type: 'removed', text: 'old' }])
  })

  it('preserves empty lines inside the diff', () => {
    const rows = buildDiffRows('a\n\nb', 'a\n\nb')
    expect(rows.map((row) => row.text)).toEqual(['a', '', 'b'])
  })
})

describe('diffStats', () => {
  it('ignores unchanged rows', () => {
    expect(
      diffStats([
        { type: 'unchanged', text: 'a' },
        { type: 'added', text: 'b' },
        { type: 'removed', text: 'c' },
      ]),
    ).toEqual({ added: 1, removed: 1 })
  })
})
