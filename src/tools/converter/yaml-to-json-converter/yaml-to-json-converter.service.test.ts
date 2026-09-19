import { describe, expect, it } from 'vitest'

import { yamlToJson } from './yaml-to-json-converter.service'

describe('yamlToJson', () => {
  it('converts a basic yaml object to pretty json', () => {
    const result = yamlToJson('name: ToolBox\ncount: 3\nnested:\n  a: true')
    expect(result).toBe(JSON.stringify({ name: 'ToolBox', count: 3, nested: { a: true } }, null, 2))
  })

  it('keeps value types', () => {
    expect(JSON.parse(yamlToJson('enabled: true\nratio: 1.5\nnone: null'))).toEqual({
      enabled: true,
      ratio: 1.5,
      none: null,
    })
  })

  it('takes the first document of a multi-document yaml', () => {
    expect(JSON.parse(yamlToJson('a: 1\n---\nb: 2'))).toEqual({ a: 1 })
  })

  it('returns empty string for empty input', () => {
    expect(yamlToJson('')).toBe('')
    expect(yamlToJson('   \n\t')).toBe('')
  })

  it('throws on invalid yaml', () => {
    expect(() => yamlToJson('key: [unclosed')).toThrow()
  })
})
