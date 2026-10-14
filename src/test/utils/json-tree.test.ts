import { describe, expect, it } from 'vitest'

import {
  isJsonBranch,
  jsonBranchPaths,
  jsonChildPath,
  jsonCopyText,
  jsonEntriesOf,
  jsonPrimitiveText,
  jsonSearch,
  jsonTypeOf,
  jsonWithin,
  tryParseJson,
} from '@/utils/json-tree'

describe('jsonTypeOf', () => {
  it('classifies every JSON value kind', () => {
    expect(jsonTypeOf(null)).toBe('null')
    expect(jsonTypeOf([])).toBe('array')
    expect(jsonTypeOf({})).toBe('object')
    expect(jsonTypeOf('a')).toBe('string')
    expect(jsonTypeOf(1)).toBe('number')
    expect(jsonTypeOf(1n)).toBe('number')
    expect(jsonTypeOf(true)).toBe('boolean')
  })

  it('falls back to other for values JSON cannot hold', () => {
    expect(jsonTypeOf(undefined)).toBe('other')
    expect(jsonTypeOf(() => 1)).toBe('other')
    expect(jsonTypeOf(Symbol('s'))).toBe('other')
  })

  it('treats null as a leaf, not a branch', () => {
    expect(isJsonBranch(jsonTypeOf(null))).toBe(false)
    expect(isJsonBranch(jsonTypeOf([]))).toBe(true)
  })
})

describe('jsonEntriesOf', () => {
  it('gives numeric indices for arrays and keys for objects', () => {
    expect(jsonEntriesOf([7, 8])).toEqual([
      [0, 7],
      [1, 8],
    ])
    expect(jsonEntriesOf({ a: 1 })).toEqual([['a', 1]])
  })

  it('returns no children for leaves and for null', () => {
    expect(jsonEntriesOf('a')).toEqual([])
    expect(jsonEntriesOf(1)).toEqual([])
    expect(jsonEntriesOf(null)).toEqual([])
    expect(jsonEntriesOf(undefined)).toEqual([])
  })
})

describe('jsonChildPath', () => {
  it('uses dot syntax for identifier-like keys', () => {
    expect(jsonChildPath('root', 'users')).toBe('root.users')
    expect(jsonChildPath('root', '_a$b9')).toBe('root._a$b9')
  })

  it('brackets and quotes keys that are not identifiers', () => {
    expect(jsonChildPath('root', 'a-b')).toBe('root["a-b"]')
    expect(jsonChildPath('root', '1st')).toBe('root["1st"]')
    expect(jsonChildPath('root', 'a"b')).toBe('root["a\\"b"]')
    expect(jsonChildPath('root', '中文')).toBe('root["中文"]')
  })

  it('uses index syntax for array positions', () => {
    expect(jsonChildPath('root.list', 12)).toBe('root.list[12]')
  })
})

describe('jsonWithin', () => {
  it('accepts the subtree itself and every descendant', () => {
    expect(jsonWithin('root', 'root')).toBe(true)
    expect(jsonWithin('root.a', 'root.a.b')).toBe(true)
    expect(jsonWithin('root.a', 'root.a[0]')).toBe(true)
  })

  it('does not match a sibling that merely shares a prefix', () => {
    expect(jsonWithin('root.ab', 'root.abc')).toBe(false)
    expect(jsonWithin('root.a', 'root.b')).toBe(false)
  })
})

describe('jsonPrimitiveText and jsonCopyText', () => {
  it('gives strings without quotes and null as a literal', () => {
    expect(jsonPrimitiveText('a', 'string')).toBe('a')
    expect(jsonPrimitiveText(null, 'null')).toBe('null')
    expect(jsonPrimitiveText(12, 'number')).toBe('12')
    expect(jsonPrimitiveText(false, 'boolean')).toBe('false')
    expect(jsonCopyText('a', 'string')).toBe('a')
  })

  it('copies a branch as indented JSON', () => {
    expect(jsonCopyText({ a: [1] }, 'object')).toBe('{\n  "a": [\n    1\n  ]\n}')
    expect(jsonCopyText([], 'array')).toBe('[]')
  })
})

describe('jsonBranchPaths', () => {
  const data = { a: { b: { c: 1 } }, list: [{ x: 1 }, 2] }

  it('collects the root only at depth 1', () => {
    expect(jsonBranchPaths(data, 'root', 1)).toEqual(['root'])
  })

  it('collects every branch when depth is omitted', () => {
    expect(jsonBranchPaths(data, 'root')).toEqual([
      'root',
      'root.a',
      'root.a.b',
      'root.list',
      'root.list[0]',
    ])
  })

  it('names the root the way paths do', () => {
    expect(jsonBranchPaths(data, 'payload', 1)).toEqual(['payload'])
    expect(jsonBranchPaths({ 'a-b': {} }, 'root')).toEqual(['root', 'root["a-b"]'])
  })

  it('returns nothing for a leaf or an empty branch', () => {
    expect(jsonBranchPaths(5, 'root')).toEqual([])
    expect(jsonBranchPaths(null, 'root')).toEqual([])
    expect(jsonBranchPaths({}, 'root')).toEqual(['root'])
    expect(jsonBranchPaths([], 'root')).toEqual(['root'])
  })
})

describe('jsonSearch', () => {
  const data = { list: [{ a: 1 }, { b: 2 }, { target: 3 }], other: 'TARGET hit' }

  it('matches keys case-insensitively and records the ancestors', () => {
    const result = jsonSearch(data, 'root', 'target')
    expect(result.matches).toEqual(['root.list[2].target', 'root.other'])
    expect([...result.ancestors].sort()).toEqual(['root', 'root.list', 'root.list[2]'])
  })

  it('records how far each branch must page to reveal the match', () => {
    expect(jsonSearch(data, 'root', 'target').needed.get('root.list')).toBe(3)
    expect(jsonSearch(data, 'root', 'target').needed.get('root')).toBe(2)
  })

  it('matches primitive values, not branches', () => {
    expect(jsonSearch({ a: 'xyz' }, 'root', 'xyz').matches).toEqual(['root.a'])
    expect(jsonSearch({ a: 123 }, 'root', '12').matches).toEqual(['root.a'])
    expect(jsonSearch({ a: null }, 'root', 'nul').matches).toEqual(['root.a'])
    expect(jsonSearch({ a: { b: 'x' } }, 'root', 'b').matches).toEqual(['root.a.b'])
    expect(jsonSearch({ a: { b: 'x' } }, 'root', 'b').ancestors).toEqual(
      new Set(['root', 'root.a']),
    )
  })

  it('returns no matches when the needle is absent', () => {
    const result = jsonSearch(data, 'root', 'nope')
    expect(result.matches).toEqual([])
    expect(result.ancestors.size).toBe(0)
    expect(result.needed.size).toBe(0)
  })

  it('searches an empty structure without throwing', () => {
    expect(jsonSearch({}, 'root', 'a').matches).toEqual([])
    expect(jsonSearch([], 'root', 'a').matches).toEqual([])
    expect(jsonSearch(null, 'root', 'a').matches).toEqual([])
  })

  it('caps the number of recorded matches', () => {
    const big = Array.from({ length: 3000 }, () => ({ hit: 1 }))
    expect(jsonSearch(big, 'root', 'hit').matches.length).toBe(2000)
  })
})

describe('tryParseJson', () => {
  it('parses valid JSON, including a bare null', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 })
    expect(tryParseJson('[]')).toEqual([])
    expect(tryParseJson('null')).toBeNull()
  })

  it('returns undefined instead of throwing on bad input', () => {
    expect(tryParseJson('')).toBeUndefined()
    expect(tryParseJson('{a:1}')).toBeUndefined()
    expect(tryParseJson('{"a":1,}')).toBeUndefined()
    expect(tryParseJson('not json at all')).toBeUndefined()
  })
})
