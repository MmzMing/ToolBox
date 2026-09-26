import { describe, expect, it } from 'vitest'

import { caretFromOffset, countLines } from '@/utils/text-caret'

describe('caretFromOffset', () => {
  it('reports 1-based line and column', () => {
    expect(caretFromOffset('abc', 0)).toEqual({ line: 1, column: 1 })
    expect(caretFromOffset('abc', 3)).toEqual({ line: 1, column: 4 })
  })

  it('counts lines from newline characters', () => {
    expect(caretFromOffset('ab\ncd\nef', 3)).toEqual({ line: 2, column: 1 })
    expect(caretFromOffset('ab\ncd\nef', 7)).toEqual({ line: 3, column: 2 })
  })

  it('clamps offsets outside the text', () => {
    expect(caretFromOffset('ab', 99)).toEqual({ line: 1, column: 3 })
    expect(caretFromOffset('ab', -5)).toEqual({ line: 1, column: 1 })
  })

  it('counts a surrogate pair as one column', () => {
    expect(caretFromOffset('😀ab', 2)).toEqual({ line: 1, column: 2 })
  })

  it('handles empty text', () => {
    expect(caretFromOffset('', 0)).toEqual({ line: 1, column: 1 })
  })
})

describe('countLines', () => {
  it('counts an empty string as one line', () => {
    expect(countLines('')).toBe(1)
  })

  it('counts newline separated lines', () => {
    expect(countLines('a')).toBe(1)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('a\n')).toBe(2)
    expect(countLines('\n\n')).toBe(3)
  })

  it('treats CRLF as a single break', () => {
    expect(countLines('a\r\nb')).toBe(2)
  })
})
