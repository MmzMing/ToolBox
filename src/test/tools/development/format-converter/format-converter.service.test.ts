import { describe, expect, it } from 'vitest'

import {
  conversionLabel,
  conversions,
  getConversion,
  runConversion,
} from '@/tools/development/format-converter/format-converter.service'

describe('runConversion', () => {
  it('converts yaml to json', () => {
    expect(runConversion('yaml-to-json', 'name: ToolBox')).toBe(
      JSON.stringify({ name: 'ToolBox' }, null, 2),
    )
  })

  it('converts json to yaml', () => {
    expect(runConversion('json-to-yaml', '{"name":"ToolBox"}')).toBe('name: ToolBox\n')
  })

  it('roundtrips yaml through toml and back', () => {
    const toml = runConversion('yaml-to-toml', 'name: ToolBox\nver: 1')
    expect(toml).toContain('name = "ToolBox"')
    const yaml = runConversion('toml-to-yaml', toml)
    expect(yaml).toContain('name: ToolBox')
  })

  it('converts toml to json', () => {
    expect(runConversion('toml-to-json', 'name = "ToolBox"')).toBe(
      JSON.stringify({ name: 'ToolBox' }, null, 2),
    )
  })

  it('converts xml to json and back', () => {
    const json = runConversion('xml-to-json', '<root><name>ToolBox</name></root>')
    expect(JSON.parse(json)).toEqual({ root: { name: 'ToolBox' } })
    const xml = runConversion('json-to-xml', json)
    expect(xml).toContain('<name>ToolBox</name>')
  })

  it('converts markdown to html', () => {
    expect(runConversion('markdown-to-html', '# ToolBox')).toContain('<h1>ToolBox</h1>')
  })

  it('returns empty string for empty input', () => {
    for (const def of conversions) {
      expect(def.transform('')).toBe('')
      expect(def.transform('   ')).toBe('')
    }
  })

  it('throws on invalid input', () => {
    expect(() => runConversion('yaml-to-json', 'name: [unbalanced')).toThrow()
    expect(() => runConversion('json-to-yaml', '{broken')).toThrow()
    expect(() => runConversion('xml-to-json', '<root>')).toThrow()
  })

  it('rejects non-object roots for object-only formats', () => {
    expect(() => runConversion('json-to-toml', '[1,2]')).toThrow(/root must be an object/)
    expect(() => runConversion('yaml-to-toml', '- a')).toThrow(/root must be an object/)
  })

  it('throws for unknown conversion id', () => {
    expect(() => runConversion('nope', 'x')).toThrow(/Unknown conversion/)
  })
})

describe('conversions registry', () => {
  it('declares nine conversions with unique ids', () => {
    expect(conversions).toHaveLength(9)
    expect(new Set(conversions.map((c) => c.id)).size).toBe(9)
  })

  it('assigns every conversion a declared group', () => {
    const groups = ['YAML', 'JSON', 'TOML', 'XML', 'Markdown']
    for (const def of conversions) {
      expect(groups).toContain(def.group)
    }
    // JSON→XML 归入 XML 分组（与 XML→JSON 相邻展示）
    expect(getConversion('json-to-xml').group).toBe('XML')
  })

  it('labels conversions as from → to', () => {
    expect(conversionLabel(getConversion('yaml-to-json'))).toBe('YAML → JSON')
  })
})
