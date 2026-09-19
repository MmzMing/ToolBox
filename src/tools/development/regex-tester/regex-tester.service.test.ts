import { describe, expect, it } from 'vitest'

import { testRegex } from './regex-tester.service'

describe('testRegex', () => {
  it('finds all matches with the g flag', () => {
    const result = testRegex('\\d+', 'g', 'a1 b22 c333')
    expect(result.error).toBeNull()
    expect(result.matches.map((match) => match.value)).toEqual(['1', '22', '333'])
    expect(result.matches.map((match) => match.index)).toEqual([1, 4, 8])
  })

  it('returns only the first match without the g flag', () => {
    const result = testRegex('\\d+', '', 'a1 b22')
    expect(result.matches).toEqual([{ value: '1', index: 1, groups: [] }])
  })

  it('collects capture groups per match', () => {
    const result = testRegex('(\\w)-(\\w)', 'g', 'a-b c-d')
    expect(result.matches.map((match) => match.groups)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('reports non-participating groups as null', () => {
    const result = testRegex('(x)?y', 'g', 'y y')
    expect(result.matches.map((match) => match.groups)).toEqual([[null], [null]])
  })

  it('survives zero-width matches without an infinite loop', () => {
    const result = testRegex('a*', 'g', 'bab')
    expect(result.error).toBeNull()
    expect(result.matches.map((match) => match.value)).toEqual(['', 'a', '', ''])
    const empty = testRegex('x*', 'g', 'abc')
    expect(empty.matches.every((match) => match.value === '')).toBe(true)
  })

  it('returns an error message for invalid patterns', () => {
    expect(testRegex('[a-', 'g', 'abc').error).toBeTruthy()
    expect(testRegex('(', 'g', 'abc').error).toBeTruthy()
    expect(testRegex('[a-', 'g', 'abc').matches).toEqual([])
  })

  it('returns an error message for invalid flags', () => {
    expect(testRegex('a', 'x', 'abc').error).toBeTruthy()
    expect(testRegex('a', 'gg', 'abc').error).toBeTruthy()
  })

  it('handles empty pattern and empty text gracefully', () => {
    expect(testRegex('', 'g', 'abc')).toEqual({ matches: [], error: null })
    expect(testRegex('\\d', 'g', '').matches).toEqual([])
    expect(testRegex('', 'g', '').error).toBeNull()
  })

  it('supports the s flag for multiline matching combinations', () => {
    const result = testRegex('a.b', 'gs', 'a\nb a\nb')
    expect(result.matches.map((match) => match.value)).toEqual(['a\nb', 'a\nb'])
  })
})
