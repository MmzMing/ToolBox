import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

import { formatYaml } from './yaml-viewer.service'

describe('formatYaml', () => {
  it('normalizes indentation to 2 spaces', () => {
    expect(formatYaml('a: 1\nb:\n    - x\n    - y')).toBe('a: 1\nb:\n  - x\n  - y')
  })

  it('parses to the same data as the original (roundtrip)', () => {
    const source = 'name: toolbox\nitems:\n  - id: 1\n    ok: true\nnested:\n  deep:\n    v: 2'
    expect(parse(formatYaml(source))).toEqual(parse(source))
  })

  it('is idempotent', () => {
    const source = 'a:\n  b: [1, 2]\n  c: "x y"'
    expect(formatYaml(formatYaml(source))).toBe(formatYaml(source))
  })

  it('returns empty string for empty input', () => {
    expect(formatYaml('')).toBe('')
    expect(formatYaml('  \n')).toBe('')
  })

  it('throws on invalid yaml with position info', () => {
    expect(() => formatYaml('a: [unclosed')).toThrow(/Invalid YAML.*line 1/i)
    expect(() => formatYaml('a: b\n- c: [')).toThrow(Error)
  })
})
