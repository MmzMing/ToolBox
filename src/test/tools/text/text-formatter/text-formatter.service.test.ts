import { describe, expect, it } from 'vitest'

import {
  MAX_HISTORY,
  analyzeText,
  formatterReducer,
  fromLines,
  initialFormatterState,
  mapLines,
  statKeys,
  titleWord,
  toLines,
  upperFirst,
} from '@/tools/text/text-formatter/text-formatter.service'

describe('line primitives', () => {
  it('normalises CRLF and CR when splitting', () => {
    expect(toLines('a\r\nb\rc')).toEqual(['a', 'b', 'c'])
    expect(fromLines(['a', 'b'])).toBe('a\nb')
  })

  it('keeps line structure while mapping', () => {
    expect(mapLines('a\n\nb', (line) => line.toUpperCase())).toBe('A\n\nB')
  })

  it('upperFirst leaves the rest of the word untouched', () => {
    expect(upperFirst('iPhone')).toBe('IPhone')
    expect(upperFirst('')).toBe('')
  })

  it('titleWord lowercases the tail', () => {
    expect(titleWord('WORLD')).toBe('World')
  })
})

describe('analyzeText', () => {
  it('returns zeroes for empty input', () => {
    const stats = analyzeText('')
    for (const key of statKeys) {
      expect(stats[key]).toBe(0)
    }
  })

  it('counts characters, words and bytes of latin text', () => {
    const stats = analyzeText('Hello world')
    expect(stats).toMatchObject({
      chars: 11,
      charsNoSpaces: 10,
      letters: 10,
      words: 2,
      lines: 1,
      sentences: 1,
      paragraphs: 1,
      bytes: 11,
      avgWordLength: 5,
      longestLine: 11,
    })
  })

  it('splits CJK runs into single words and counts utf-8 bytes', () => {
    const stats = analyzeText('你好世界')
    expect(stats).toMatchObject({ chars: 4, words: 4, cjk: 4, bytes: 12, avgWordLength: 1 })
  })

  it('counts lines and unique lines separately', () => {
    const stats = analyzeText('a\nb\na')
    expect(stats).toMatchObject({ lines: 3, uniqueLines: 2 })
  })

  it('counts sentences across both punctuation sets', () => {
    expect(analyzeText('One. Two! Three？四。').sentences).toBe(4)
  })

  it('derives reading time from 200 words per minute', () => {
    expect(analyzeText(Array(200).fill('word').join(' ')).readingMinutes).toBe(1)
  })

  it('ignores pure punctuation when counting words', () => {
    expect(analyzeText('--- *** !!!').words).toBe(0)
  })
})

describe('formatterReducer', () => {
  const state = initialFormatterState('src')

  it('starts with both cards mirroring the source', () => {
    expect(state).toEqual({ base: 'src', past: [], present: 'src', future: [] })
  })

  it('pushes the previous value onto the undo stack', () => {
    const next = formatterReducer(state, { type: 'apply', value: 'UP' })
    expect(next.present).toBe('UP')
    expect(next.past).toEqual(['src'])
    expect(next.future).toEqual([])
  })

  it('ignores an apply that changes nothing', () => {
    expect(formatterReducer(state, { type: 'apply', value: 'src' })).toBe(state)
  })

  it('undoes and redoes symmetrically', () => {
    const twice = formatterReducer(formatterReducer(state, { type: 'apply', value: 'a' }), {
      type: 'apply',
      value: 'b',
    })
    const undone = formatterReducer(twice, { type: 'undo' })
    expect(undone.present).toBe('a')
    expect(undone.future).toEqual(['b'])
    expect(formatterReducer(undone, { type: 'redo' }).present).toBe('b')
  })

  it('does nothing when the stacks are empty', () => {
    expect(formatterReducer(state, { type: 'undo' })).toBe(state)
    expect(formatterReducer(state, { type: 'redo' })).toBe(state)
  })

  it('resets the whole chain when the source is edited', () => {
    const applied = formatterReducer(state, { type: 'apply', value: 'a' })
    expect(formatterReducer(applied, { type: 'edit', value: 'new' })).toEqual(
      initialFormatterState('new'),
    )
  })

  it('keeps the applied chain when an edit reports the source unchanged', () => {
    // 输入框延迟上报，同一份文本可能被重复送上一次；重复上报不能抹掉刚应用的规则
    const applied = formatterReducer(state, { type: 'apply', value: 'a' })
    expect(formatterReducer(applied, { type: 'edit', value: 'src' })).toBe(applied)
  })

  it('commits the result into the source and clears history', () => {
    const applied = formatterReducer(state, { type: 'apply', value: 'a' })
    expect(formatterReducer(applied, { type: 'commitToBase' })).toEqual(initialFormatterState('a'))
  })

  it('resets back to the source but keeps it undoable', () => {
    const applied = formatterReducer(state, { type: 'apply', value: 'a' })
    const reset = formatterReducer(applied, { type: 'reset' })
    expect(reset.present).toBe('src')
    expect(formatterReducer(reset, { type: 'undo' }).present).toBe('a')
  })

  it('caps the undo stack at MAX_HISTORY', () => {
    let current = state
    for (let index = 0; index < MAX_HISTORY + 20; index += 1) {
      current = formatterReducer(current, { type: 'apply', value: `v${index}` })
    }
    expect(current.past.length).toBe(MAX_HISTORY)
  })
})
