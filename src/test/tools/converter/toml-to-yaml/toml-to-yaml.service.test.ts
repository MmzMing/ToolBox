import { describe, expect, it } from 'vitest'

import { tomlToYaml } from '@/tools/converter/toml-to-yaml/toml-to-yaml.service'

describe('tomlToYaml', () => {
  it('converts a basic toml document to yaml', () => {
    expect(tomlToYaml('name = "ToolBox"\ncount = 3')).toBe('name: ToolBox\ncount: 3\n')
  })

  it('converts toml tables to nested yaml mappings', () => {
    expect(tomlToYaml('[server]\nport = 8080')).toBe('server:\n  port: 8080\n')
  })

  it('converts toml arrays to yaml sequences', () => {
    expect(tomlToYaml('tags = [ "a", "b" ]')).toBe('tags:\n  - a\n  - b\n')
  })

  it('returns empty string for empty input', () => {
    expect(tomlToYaml('')).toBe('')
    expect(tomlToYaml('  \n')).toBe('')
  })

  it('throws on invalid toml', () => {
    expect(() => tomlToYaml('a = ')).toThrow()
  })
})
