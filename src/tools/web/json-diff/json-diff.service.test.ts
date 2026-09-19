import { describe, expect, it } from 'vitest'

import { diffJson } from './json-diff.service'

describe('diffJson', () => {
  it('returns no entries for identical documents', () => {
    const json = '{"a":1,"b":[1,2],"c":{"d":"x"}}'
    expect(diffJson(json, json)).toEqual([])
  })

  it('reports a top-level scalar change at the root path', () => {
    expect(diffJson('1', '2')).toEqual([{ path: '(root)', type: 'changed', left: '1', right: '2' }])
  })

  it('reports changed nested values with dot paths', () => {
    const entries = diffJson('{"user":{"name":"Ann","age":30}}', '{"user":{"name":"Bob","age":30}}')
    expect(entries).toEqual([{ path: 'user.name', type: 'changed', left: 'Ann', right: 'Bob' }])
  })

  it('reports added and removed keys', () => {
    const entries = diffJson('{"a":1,"old":true}', '{"a":1,"new":false}')
    expect(entries).toEqual([
      { path: 'old', type: 'removed', left: 'true' },
      { path: 'new', type: 'added', right: 'false' },
    ])
  })

  it('diffs arrays element by element', () => {
    const entries = diffJson('[1, 2, 3]', '[1, 9, 3]')
    expect(entries).toEqual([{ path: '1', type: 'changed', left: '2', right: '9' }])
  })

  it('reports array items that were added or removed by index', () => {
    expect(diffJson('{"items":[1,2]}', '{"items":[1,2,3]}')).toEqual([
      { path: 'items.2', type: 'added', right: '3' },
    ])
    expect(diffJson('{"items":[1,2,3]}', '{"items":[1,2]}')).toEqual([
      { path: 'items.2', type: 'removed', left: '3' },
    ])
  })

  it('handles nested arrays inside objects', () => {
    const entries = diffJson('{"list":[{"id":1,"name":"a"}]}', '{"list":[{"id":1,"name":"b"}]}')
    expect(entries).toEqual([{ path: 'list.0.name', type: 'changed', left: 'a', right: 'b' }])
  })

  it('reports a type change (object vs scalar) as changed', () => {
    const entries = diffJson('{"a":{"b":1}}', '{"a":"text"}')
    expect(entries).toEqual([{ path: 'a', type: 'changed', left: '{"b":1}', right: 'text' }])
  })

  it('reports a type change between object and array at the root', () => {
    const entries = diffJson('{"a":1}', '[1]')
    expect(entries).toEqual([{ path: '(root)', type: 'changed', left: '{"a":1}', right: '[1]' }])
  })

  it('treats null as a value distinct from missing keys', () => {
    const entries = diffJson('{"a":null}', '{}')
    expect(entries).toEqual([{ path: 'a', type: 'removed', left: 'null' }])
  })

  it('keeps a deterministic key order (A keys first, then B additions)', () => {
    const entries = diffJson('{"z":1,"a":1}', '{"a":2,"b":3}')
    expect(entries.map((entry) => entry.path)).toEqual(['z', 'a', 'b'])
  })

  it('throws on invalid JSON in A', () => {
    expect(() => diffJson('{invalid}', '1')).toThrow(/Invalid JSON in A/)
    expect(() => diffJson('', '1')).toThrow(/Invalid JSON in A/)
  })

  it('throws on invalid JSON in B', () => {
    expect(() => diffJson('1', '{invalid}')).toThrow(/Invalid JSON in B/)
    expect(() => diffJson('1', '')).toThrow(/Invalid JSON in B/)
  })
})
