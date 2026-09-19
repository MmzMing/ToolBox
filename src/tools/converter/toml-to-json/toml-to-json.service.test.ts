import { describe, expect, it } from 'vitest'

import { tomlToJson } from './toml-to-json.service'

describe('tomlToJson', () => {
  it('converts a basic toml document to pretty json', () => {
    expect(tomlToJson('name = "ToolBox"\ncount = 3')).toBe(
      JSON.stringify({ name: 'ToolBox', count: 3 }, null, 2),
    )
  })

  it('converts toml tables to nested json objects', () => {
    expect(JSON.parse(tomlToJson('[server]\nport = 8080'))).toEqual({ server: { port: 8080 } })
  })

  it('keeps value types', () => {
    expect(JSON.parse(tomlToJson('enabled = true\nratio = 1.5'))).toEqual({
      enabled: true,
      ratio: 1.5,
    })
  })

  it('returns empty string for empty input', () => {
    expect(tomlToJson('')).toBe('')
    expect(tomlToJson(' \n ')).toBe('')
  })

  it('throws on invalid toml', () => {
    expect(() => tomlToJson('a = ')).toThrow()
  })
})
