import { describe, expect, it } from 'vitest'

import { transformList, type ListTransformOptions } from './service'

const baseOptions: ListTransformOptions = {
  separator: ',',
  dedupe: false,
  sort: false,
  reverse: false,
  lowercase: false,
  uppercase: false,
  removeEmpty: false,
  trim: false,
}

describe('transformList', () => {
  it('splits by newline and joins with the separator', () => {
    const result = transformList('a\nb\nc', baseOptions)
    expect(result.lines).toEqual(['a', 'b', 'c'])
    expect(result.joined).toBe('a,b,c')
  })

  it('supports custom separators', () => {
    expect(transformList('a\nb', { ...baseOptions, separator: ' | ' }).joined).toBe('a | b')
  })

  it('trims items when enabled', () => {
    expect(transformList(' a \nb', { ...baseOptions, trim: true }).lines).toEqual(['a', 'b'])
    expect(transformList(' a ', baseOptions).lines).toEqual([' a '])
  })

  it('removes empty lines when enabled', () => {
    const options = { ...baseOptions, removeEmpty: true }
    expect(transformList('a\n\nb\n  \n', options).lines).toEqual(['a', 'b', '  '])
    expect(transformList('a\n\nb\n  \n', { ...options, trim: true }).lines).toEqual(['a', 'b'])
  })

  it('deduplicates while keeping the first occurrence', () => {
    const result = transformList('a\nb\na\nA', { ...baseOptions, dedupe: true })
    expect(result.lines).toEqual(['a', 'b', 'A'])
    const lowered = transformList('a\nb\na\nA', { ...baseOptions, dedupe: true, lowercase: true })
    expect(lowered.lines).toEqual(['a', 'b'])
  })

  it('sorts and reverses', () => {
    expect(transformList('c\na\nb', { ...baseOptions, sort: true }).lines).toEqual(['a', 'b', 'c'])
    expect(transformList('a\nb\nc', { ...baseOptions, reverse: true }).lines).toEqual([
      'c',
      'b',
      'a',
    ])
    expect(transformList('c\na\nb', { ...baseOptions, sort: true, reverse: true }).lines).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('applies case conversion', () => {
    expect(transformList('AbC\nDEf', { ...baseOptions, lowercase: true }).lines).toEqual([
      'abc',
      'def',
    ])
    expect(transformList('AbC\nDEf', { ...baseOptions, uppercase: true }).lines).toEqual([
      'ABC',
      'DEF',
    ])
    expect(
      transformList('AbC', { ...baseOptions, lowercase: true, uppercase: true }).lines,
    ).toEqual(['ABC'])
  })

  it('handles empty input', () => {
    expect(transformList('', baseOptions)).toEqual({ lines: [''], joined: '' })
    expect(transformList('', { ...baseOptions, removeEmpty: true })).toEqual({
      lines: [],
      joined: '',
    })
    expect(transformList('\n\n', { ...baseOptions, removeEmpty: true })).toEqual({
      lines: [],
      joined: '',
    })
  })
})
