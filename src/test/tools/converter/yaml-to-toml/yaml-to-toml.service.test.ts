import { describe, expect, it } from 'vitest'

import { yamlToToml } from '@/tools/converter/yaml-to-toml/yaml-to-toml.service'

describe('yamlToToml', () => {
  it('converts a basic yaml object to toml', () => {
    expect(yamlToToml('name: ToolBox\ncount: 3')).toBe('name = "ToolBox"\ncount = 3\n')
  })

  it('converts nested mappings to toml tables', () => {
    expect(yamlToToml('server:\n  host: localhost\n  port: 8080')).toBe(
      '[server]\nhost = "localhost"\nport = 8080\n',
    )
  })

  it('converts arrays to toml arrays', () => {
    expect(yamlToToml('tags:\n  - a\n  - b')).toBe('tags = [ "a", "b" ]\n')
  })

  it('treats a comment-only document as an empty table', () => {
    expect(yamlToToml('# just a comment')).toBe('\n')
  })

  it('returns empty string for empty input', () => {
    expect(yamlToToml('')).toBe('')
    expect(yamlToToml(' \n ')).toBe('')
  })

  it('throws when the yaml root is an array', () => {
    expect(() => yamlToToml('- 1\n- 2')).toThrow(/root must be an object/)
  })

  it('throws when the yaml root is a scalar', () => {
    expect(() => yamlToToml('just a string')).toThrow(/root must be an object/)
  })

  it('throws on invalid yaml', () => {
    expect(() => yamlToToml('key: [unclosed')).toThrow()
  })
})
