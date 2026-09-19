import { describe, expect, it } from 'vitest'

import { minify } from '@/tools/development/json-minify/json-minify.service'

describe('minify', () => {
  it('removes whitespace and newlines', () => {
    expect(minify('{\n  "a": 1,\n  "b": [1, 2]\n}')).toBe('{"a":1,"b":[1,2]}')
  })

  it('keeps whitespace inside string values', () => {
    expect(minify('{"msg":"hello world"}')).toBe('{"msg":"hello world"}')
  })

  it('handles nested structures and scalars', () => {
    expect(minify('[true, null, 1.5, {"x": {"y": "z"}}]')).toBe('[true,null,1.5,{"x":{"y":"z"}}]')
  })

  it('returns empty string for empty input', () => {
    expect(minify('')).toBe('')
    expect(minify('   \n\t ')).toBe('')
  })

  it('throws on invalid json', () => {
    expect(() => minify('{a:1}')).toThrow(/Invalid JSON/)
    expect(() => minify('[1,2')).toThrow(Error)
  })
})
