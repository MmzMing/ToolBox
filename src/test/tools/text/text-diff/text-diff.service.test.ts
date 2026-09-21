import { describe, expect, it } from 'vitest'

import {
  buildDiffRows,
  summarizeDiff,
  type DiffCell,
} from '@/tools/text/text-diff/text-diff.service'

/** 把一格的行内片段拆成「相同部分」和「变化部分」两段文本，便于断言词级高亮 */
function splitByChanged(cell: DiffCell | null) {
  const changed = (cell?.segments ?? [])
    .filter((segment) => segment.changed)
    .map((segment) => segment.text)
    .join('')
  const plain = (cell?.segments ?? [])
    .filter((segment) => !segment.changed)
    .map((segment) => segment.text)
    .join('')
  return { changed, plain, text: (cell?.segments ?? []).map((s) => s.text).join('') }
}

function cellText(cell: DiffCell | null) {
  return cell ? splitByChanged(cell).text : null
}

describe('buildDiffRows', () => {
  it('pairs unchanged lines on both sides with their own line numbers', () => {
    const rows = buildDiffRows('a\nb\nc', 'a\nd\nc')

    expect(rows.map((row) => [row.left?.lineNumber, row.right?.lineNumber])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    expect(rows.map((row) => [row.left?.type, row.right?.type])).toEqual([
      ['unchanged', 'unchanged'],
      ['removed', 'added'],
      ['unchanged', 'unchanged'],
    ])
    expect(rows.map((row) => row.changeIndex)).toEqual([null, 0, null])
  })

  it('marks the changed words inside a paired line', () => {
    const [, row] = buildDiffRows('a\nhello world\nc', 'a\nhello there\nc')

    expect(splitByChanged(row.left)).toEqual({
      plain: 'hello ',
      changed: 'world',
      text: 'hello world',
    })
    expect(splitByChanged(row.right)).toEqual({
      plain: 'hello ',
      changed: 'there',
      text: 'hello there',
    })
  })

  it('leaves the other side empty for a pure insertion', () => {
    const rows = buildDiffRows('a\nb', 'a\nX\nb')

    expect(rows.slice(1).map((row) => [cellText(row.left), cellText(row.right)])).toEqual([
      [null, 'X'],
      ['b', 'b'],
    ])
    expect(rows[1].left).toBeNull()
    expect(rows[1].right?.lineNumber).toBe(2)
    // 整行都是新的，不需要再做词级高亮
    expect(splitByChanged(rows[1].right).changed).toBe('')
    // 空位不占行号：左栏第二行仍是 b
    expect(rows[2].left?.lineNumber).toBe(2)
    expect(rows[2].right?.lineNumber).toBe(3)
  })

  it('leaves the other side empty for a pure deletion', () => {
    const rows = buildDiffRows('a\nX\nb', 'a\nb')

    expect(rows[1].right).toBeNull()
    expect(cellText(rows[1].left)).toBe('X')
    expect(rows[1].left?.lineNumber).toBe(2)
    expect(rows[2].left?.lineNumber).toBe(3)
    expect(rows[2].right?.lineNumber).toBe(2)
  })

  it('numbers each change block once for navigation', () => {
    const rows = buildDiffRows('a\nb\nc\nd', 'a\nX\nc\nY')

    expect(rows.map((row) => row.changeIndex)).toEqual([null, 0, null, 1])
  })

  it('returns only unchanged rows for identical texts', () => {
    const rows = buildDiffRows('same\ntext', 'same\ntext')

    expect(rows.map((row) => row.left?.type)).toEqual(['unchanged', 'unchanged'])
    expect(rows.every((row) => row.changeIndex === null)).toBe(true)
  })

  it('handles empty inputs', () => {
    expect(buildDiffRows('', '')).toEqual([])
  })

  it('treats everything as added when the original is empty', () => {
    const rows = buildDiffRows('', 'new')

    expect(rows).toHaveLength(1)
    expect(rows[0].left).toBeNull()
    expect(splitByChanged(rows[0].right).text).toBe('new')
  })

  it('treats everything as removed when the modified text is empty', () => {
    const rows = buildDiffRows('old', '')

    expect(rows).toHaveLength(1)
    expect(rows[0].right).toBeNull()
    expect(splitByChanged(rows[0].left).text).toBe('old')
  })

  it('preserves empty lines inside the diff', () => {
    const rows = buildDiffRows('a\n\nb', 'a\n\nb')

    expect(rows.map((row) => row.left?.segments[0]?.text)).toEqual(['a', '', 'b'])
  })

  it('pads a replaced block whose two sides differ in length', () => {
    const rows = buildDiffRows('a\nb\nc', 'a\n1\n2\n3')
    const block = rows.filter((row) => row.changeIndex === 0)

    expect(block.map((row) => [cellText(row.left), cellText(row.right)])).toEqual([
      ['b', '1'],
      ['c', '2'],
      [null, '3'],
    ])
    expect(block.map((row) => [row.left?.lineNumber ?? null, row.right?.lineNumber])).toEqual([
      [2, 2],
      [3, 3],
      [null, 4],
    ])
  })
})

describe('summarizeDiff', () => {
  it('counts added lines, removed lines and change blocks', () => {
    expect(summarizeDiff(buildDiffRows('a\nb\nc\nd', 'a\nX\nc\nY'))).toEqual({
      added: 2,
      removed: 2,
      changes: 2,
    })
  })

  it('reports no changes for identical texts', () => {
    expect(summarizeDiff(buildDiffRows('same', 'same'))).toEqual({
      added: 0,
      removed: 0,
      changes: 0,
    })
  })

  it('handles an empty diff', () => {
    expect(summarizeDiff([])).toEqual({ added: 0, removed: 0, changes: 0 })
  })
})
