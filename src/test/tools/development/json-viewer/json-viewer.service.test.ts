import { describe, expect, it } from 'vitest'

import {
  formatJson,
  jsonIndents,
  minifyJson,
} from '@/tools/development/json-viewer/json-viewer.service'

describe('formatJson', () => {
  it('beautifies json with 2 spaces by default', () => {
    expect(formatJson('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
  })

  it('supports 4 spaces and tab indentation', () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}')
    expect(formatJson('{"a":1}', 'tab')).toBe('{\n\t"a": 1\n}')
  })

  it('preserves nested and unicode values', () => {
    const output = formatJson('{"名字":"值","n":null}')
    expect(JSON.parse(output)).toEqual({ 名字: '值', n: null })
  })

  it('throws with position info on invalid input', () => {
    expect(() => formatJson('{"a":1,}')).toThrow(/Invalid JSON.*position/i)
    expect(() => formatJson('not json')).toThrow(Error)
  })

  it('handles empty input', () => {
    expect(() => formatJson('')).toThrow(/Invalid JSON/)
  })
})

describe('minifyJson', () => {
  it('removes all insignificant whitespace', () => {
    expect(minifyJson('{\n  "a": 1,\n  "b": "x y"\n}')).toBe('{"a":1,"b":"x y"}')
  })

  it('keeps whitespace inside strings', () => {
    expect(minifyJson('["a b","c\\nd"]')).toBe('["a b","c\\nd"]')
  })

  it('handles top-level scalars', () => {
    expect(minifyJson('  42 ')).toBe('42')
  })

  it('throws on empty and invalid input', () => {
    expect(() => minifyJson('')).toThrow(/Invalid JSON/)
    expect(() => minifyJson('[1,2')).toThrow(Error)
  })
})

describe('roundtrip', () => {
  it('minify then format restores an equivalent value for every indent', () => {
    const source = '{"a":[1,{"b":true}],"c":"x"}'
    const compact = minifyJson(formatJson(source, 4))
    expect(compact).toBe(source)
    for (const indent of jsonIndents) {
      expect(JSON.parse(formatJson(compact, indent))).toEqual(JSON.parse(source))
    }
  })
})
