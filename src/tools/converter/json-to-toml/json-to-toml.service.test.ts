import { describe, expect, it } from 'vitest'

import { jsonToToml } from './json-to-toml.service'

describe('jsonToToml', () => {
  it('converts a flat json object to toml', () => {
    expect(jsonToToml('{"name":"ToolBox","count":3}')).toBe('name = "ToolBox"\ncount = 3\n')
  })

  it('converts nested objects to toml tables', () => {
    expect(jsonToToml('{"server":{"port":8080}}')).toBe('[server]\nport = 8080\n')
  })

  it('converts arrays to toml arrays', () => {
    expect(jsonToToml('{"tags":["a","b"]}')).toBe('tags = [ "a", "b" ]\n')
  })

  it('returns empty string for empty input', () => {
    expect(jsonToToml('')).toBe('')
    expect(jsonToToml(' \n')).toBe('')
  })

  it('throws on invalid json', () => {
    expect(() => jsonToToml('{invalid')).toThrow(/Invalid JSON/)
  })

  it('throws when the json root is not an object', () => {
    expect(() => jsonToToml('[1,2]')).toThrow(/root must be an object/)
    expect(() => jsonToToml('42')).toThrow(/root must be an object/)
    expect(() => jsonToToml('null')).toThrow(/root must be an object/)
  })
})
