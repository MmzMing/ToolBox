import { describe, expect, it } from 'vitest'

import {
  buildDiffRows,
  buildPaneCells,
  cellText as joinCell,
  summarizeDiff,
  type DiffCell,
  type PaneSide,
} from '@/tools/text/text-diff/text-diff.service'

/** 文本按 \n 切出的行数，与 textarea / 正文的口径一致 */
function lineCount(text: string): number {
  return text.split('\n').length
}

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

/** 一栏摊平后的纯文本，与 textarea 的取值口径一致 */
function paneText(side: PaneSide, a: string, b: string) {
  return buildPaneCells(buildDiffRows(a, b), side, lineCount(side === 'original' ? a : b))
    .map(joinCell)
    .join('\n')
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

describe('buildPaneCells', () => {
  it('lists only this side of every row, numbered from one', () => {
    const rows = buildDiffRows('a\nb\nc\nd', 'a\nX\nc\nY')
    const cells = buildPaneCells(rows, 'original', lineCount('a\nb\nc\nd'))

    expect(cells.map(joinCell)).toEqual(['a', 'b', 'c', 'd'])
    expect(cells.map((cell) => cell.lineNumber)).toEqual([1, 2, 3, 4])
    expect(cells.map((cell) => cell.type)).toEqual(['unchanged', 'removed', 'unchanged', 'removed'])
    expect(cells.map((cell) => cell.changeIndex)).toEqual([null, 0, null, 1])
  })

  it('gives the modified pane the other side of the same rows', () => {
    const rows = buildDiffRows('a\nb\nc\nd', 'a\nX\nc\nY')
    const cells = buildPaneCells(rows, 'modified', lineCount('a\nX\nc\nY'))

    expect(cells.map(joinCell)).toEqual(['a', 'X', 'c', 'Y'])
    expect(cells.map((cell) => cell.lineNumber)).toEqual([1, 2, 3, 4])
    expect(cells.map((cell) => cell.type)).toEqual(['unchanged', 'added', 'unchanged', 'added'])
  })

  it('skips lines that only exist on the other side', () => {
    const cells = buildPaneCells(buildDiffRows('a\nc', 'a\nb1\nb2\nc'), 'original', 2)

    // 纯新增的两行不属于原文，插进来会让行号与 textarea 对不齐
    expect(cells.map(joinCell)).toEqual(['a', 'c'])
    expect(cells.map((cell) => cell.changeIndex)).toEqual([null, null])
  })

  it('carries the word level highlight into the pane', () => {
    const cells = buildPaneCells(buildDiffRows('a\nhello world', 'a\nhello there'), 'modified', 2)

    expect(splitByChanged(cells[1])).toEqual({
      plain: 'hello ',
      changed: 'there',
      text: 'hello there',
    })
  })

  it('pads the trailing newline into a blank line of its own', () => {
    const cells = buildPaneCells(buildDiffRows('a\nb\n', 'a\nc\n'), 'original', 3)

    expect(cells.map(joinCell)).toEqual(['a', 'b', ''])
    expect(cells.at(-1)?.changeIndex).toBeNull()
  })

  it('always yields one blank line for empty text', () => {
    for (const side of ['original', 'modified'] as const) {
      const cells = buildPaneCells(buildDiffRows('', ''), side, 1)

      expect(cells).toHaveLength(1)
      expect(joinCell(cells[0])).toBe('')
      expect(cells[0].type).toBe('unchanged')
    }
  })

  it('round-trips both panes back into their own text', () => {
    const pairs: [string, string][] = [
      ['a\nb\nc', 'a\nd\nc'],
      ['a\nb\nc\nd', 'a\nX\nc\nY'],
      ['', 'x\ny'],
      ['x\ny', ''],
      ['line\n', 'line\nline2\n'],
      ['1\n2\n3\n4', '1\n9'],
      ['keep\n\nold', 'keep\n\nnew\nextra'],
    ]

    for (const [a, b] of pairs) {
      expect(paneText('original', a, b)).toBe(a)
      expect(paneText('modified', a, b)).toBe(b)
    }
  })
})
