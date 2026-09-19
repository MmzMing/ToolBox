import { describe, expect, it } from 'vitest'

import { jsonToYaml } from './json-to-yaml-converter.service'

describe('jsonToYaml', () => {
  it('converts a json object to yaml with 2-space indent', () => {
    expect(jsonToYaml('{"name":"ToolBox","nested":{"a":1}}')).toBe(
      'name: ToolBox\nnested:\n  a: 1\n',
    )
  })

  it('converts arrays to block sequence', () => {
    expect(jsonToYaml('{"items":[1,2]}')).toBe('items:\n  - 1\n  - 2\n')
  })

  it('keeps value types', () => {
    expect(jsonToYaml('{"enabled":true,"ratio":1.5,"none":null}')).toBe(
      'enabled: true\nratio: 1.5\nnone: null\n',
    )
  })

  it('returns empty string for empty input', () => {
    expect(jsonToYaml('')).toBe('')
    expect(jsonToYaml('  \n')).toBe('')
  })

  it('throws on invalid json', () => {
    expect(() => jsonToYaml('{invalid')).toThrow(/Invalid JSON/)
  })
})
