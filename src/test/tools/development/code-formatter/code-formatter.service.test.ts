import { describe, expect, it } from 'vitest'

import {
  escapeCsvCell,
  formatJson,
  formatSql,
  formatXml,
  formatYaml,
  jsonToCsv,
  minifyJson,
  runFormatter,
} from '@/tools/development/code-formatter/code-formatter.service'

describe('json format / minify', () => {
  it('formats with configurable indent', () => {
    expect(formatJson('{"a":1}', 2)).toBe('{\n  "a": 1\n}')
    expect(formatJson('{"a":1}', 4)).toContain('    "a": 1')
    expect(formatJson('{"a":1}', 'tab')).toBe('{\n\t"a": 1\n}')
  })

  it('minifies json', () => {
    expect(minifyJson('{ "a": 1 }')).toBe('{"a":1}')
  })

  it('throws with reason on invalid json', () => {
    expect(() => formatJson('{broken')).toThrowError(/Invalid JSON/)
  })
})

describe('json to csv', () => {
  it('converts array of objects with rfc4180 escaping', () => {
    const csv = jsonToCsv('[{"a":1,"b":"x,y"},{"a":2,"b":"he said \\"hi\\""}]', { delimiter: ',' })
    const lines = csv.split('\n')
    expect(lines[0]).toBe('a,b')
    expect(lines[1]).toBe('1,"x,y"')
    expect(lines[2]).toBe('2,"he said ""hi"""')
  })

  it('throws on non-array input and empty delimiter', () => {
    expect(() => jsonToCsv('{"a":1}', { delimiter: ',' })).toThrowError(/array/)
    expect(() => jsonToCsv('[{"a":1}]', { delimiter: '' })).toThrowError(/Delimiter/)
  })

  it('escapes cells via escapeCsvCell', () => {
    expect(escapeCsvCell('plain', ',')).toBe('plain')
    expect(escapeCsvCell('a,b', ',')).toBe('"a,b"')
    expect(escapeCsvCell(null, ',')).toBe('')
  })
})

describe('sql / xml / yaml formatters', () => {
  it('formats sql keywords', () => {
    expect(formatSql('select a from t')).toMatch(/SELECT/)
  })

  it('formats xml and reports invalid input position', () => {
    expect(formatXml('<root><a>1</a></root>')).toContain('<a>1</a>')
    expect(() => formatXml('<root>')).toThrowError(/Invalid XML/)
  })

  it('formats yaml with 2-space indent', () => {
    expect(formatYaml('name:   ToolBox')).toBe('name: ToolBox')
    expect(() => formatYaml('name: [unbalanced')).toThrowError(/Invalid YAML/)
  })
})

describe('runFormatter', () => {
  it('dispatches by mode', () => {
    expect(runFormatter('json-minify', '{ "a": 1 }')).toBe('{"a":1}')
    expect(runFormatter('yaml-format', 'a: 1')).toBe('a: 1')
  })

  it('returns empty string for empty input in every mode', () => {
    for (const mode of [
      'json-format',
      'json-minify',
      'json-to-csv',
      'sql-format',
      'xml-format',
      'yaml-format',
    ] as const) {
      expect(runFormatter(mode, '')).toBe('')
    }
  })

  it('throws for unknown mode', () => {
    expect(() => runFormatter('nope' as never, 'x')).toThrow()
  })
})
