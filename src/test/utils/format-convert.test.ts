import { describe, expect, it } from 'vitest'

import {
  collapseToSingleLine,
  convert,
  csvRowsToRecords,
  defaultTargetOf,
  escapeCsvCell,
  languageOf,
  parseCsvRows,
  recordsToCsv,
  sourceFormats,
  targetFormatsOf,
  type FormatId,
} from '@/utils/format-convert'

describe('sourceFormats', () => {
  it('lists the eight readable formats and excludes the minify variant', () => {
    expect([...sourceFormats]).toEqual([
      'json',
      'yaml',
      'toml',
      'xml',
      'csv',
      'markdown',
      'html',
      'sql',
    ])
    expect(sourceFormats).not.toContain('json-min')
  })
})

describe('targetFormatsOf', () => {
  it('lets every data format reach all six data outputs', () => {
    const expected: readonly FormatId[] = ['json', 'json-min', 'yaml', 'toml', 'xml', 'csv']
    for (const format of ['json', 'yaml', 'toml', 'xml', 'csv'] as const) {
      expect(targetFormatsOf(format)).toEqual(expected)
    }
  })

  it('pairs markdown with html and keeps sql self-contained', () => {
    expect(targetFormatsOf('markdown')).toEqual(['markdown', 'html'])
    expect(targetFormatsOf('html')).toEqual(['html', 'markdown'])
    expect(targetFormatsOf('sql')).toEqual(['sql'])
  })
})

describe('defaultTargetOf', () => {
  it('prefers a different format over a minified variant', () => {
    expect(defaultTargetOf('json')).toBe('yaml')
    expect(defaultTargetOf('yaml')).toBe('json')
    expect(defaultTargetOf('csv')).toBe('json')
    expect(defaultTargetOf('xml')).toBe('json')
  })

  it('falls back to itself when nothing else is reachable', () => {
    expect(defaultTargetOf('sql')).toBe('sql')
  })

  it('swaps the markup pair', () => {
    expect(defaultTargetOf('markdown')).toBe('html')
    expect(defaultTargetOf('html')).toBe('markdown')
  })
})

describe('languageOf', () => {
  it('maps formats to highlight.js languages', () => {
    expect(languageOf('json')).toBe('json')
    expect(languageOf('json-min')).toBe('json')
    expect(languageOf('yaml')).toBe('yaml')
    expect(languageOf('csv')).toBe('plaintext')
    expect(languageOf('sql')).toBe('sql')
  })
})

describe('csv primitives', () => {
  it('escapes quotes, delimiters and newlines per RFC 4180', () => {
    expect(escapeCsvCell('plain')).toBe('plain')
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell({ a: 1 })).toBe('"{""a"":1}"')
  })

  it('parses quoted cells, embedded newlines and doubled quotes', () => {
    expect(parseCsvRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCsvRows('')).toEqual([])
    expect(parseCsvRows('a,b\n1,"x,y"')).toEqual([
      ['a', 'b'],
      ['1', 'x,y'],
    ])
    expect(parseCsvRows('a\n"multi\nline"')).toEqual([['a'], ['multi\nline']])
    expect(parseCsvRows('a\n"""q"""')).toEqual([['a'], ['"q"']])
  })

  it('turns rows into records using the first row as header', () => {
    expect(
      csvRowsToRecords([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toEqual([{ a: '1', b: '2' }])
    expect(csvRowsToRecords([])).toEqual([])
    // 行短于表头时补空串，长于表头时忽略多余列
    expect(csvRowsToRecords([['a', 'b'], ['1']])).toEqual([{ a: '1', b: '' }])
  })

  it('collects the union of keys so late columns are not dropped', () => {
    expect(recordsToCsv([{ a: 1 }, { b: 'x,y' }])).toBe('a,b\n1,\n,"x,y"')
    expect(recordsToCsv([])).toBe('')
  })
})

describe('convert - data formats', () => {
  it('converts json to yaml and back', () => {
    expect(convert('json', 'yaml', '{"name":"ToolBox"}')).toBe('name: ToolBox')
    expect(convert('yaml', 'json', 'name: ToolBox')).toBe(
      JSON.stringify({ name: 'ToolBox' }, null, 2),
    )
  })

  it('normalizes json in place and minifies on demand', () => {
    expect(convert('json', 'json', '{ "a": 1 }')).toBe('{\n  "a": 1\n}')
    expect(convert('json', 'json-min', '{ "a": 1 }')).toBe('{"a":1}')
  })

  it('roundtrips yaml through toml', () => {
    const toml = convert('yaml', 'toml', 'name: ToolBox\nver: 1')
    expect(toml).toContain('name = "ToolBox"')
    expect(convert('toml', 'yaml', toml)).toContain('name: ToolBox')
  })

  it('converts toml to json', () => {
    expect(convert('toml', 'json', 'name = "ToolBox"')).toBe(
      JSON.stringify({ name: 'ToolBox' }, null, 2),
    )
  })

  it('converts xml to json and back, and beautifies xml in place', () => {
    const json = convert('xml', 'json', '<root><name>ToolBox</name></root>')
    expect(JSON.parse(json)).toEqual({ root: { name: 'ToolBox' } })
    expect(convert('json', 'xml', json)).toContain('<name>ToolBox</name>')
    expect(convert('xml', 'xml', '<root><a>1</a></root>')).toContain('<a>1</a>')
  })

  it('keeps xml attributes through a json roundtrip', () => {
    const json = convert('xml', 'json', '<root id="7"><name>x</name></root>')
    expect(convert('json', 'xml', json)).toContain('id="7"')
  })

  it('converts between json records and csv', () => {
    const csv = convert('json', 'csv', '[{"a":1,"b":"x,y"},{"a":2,"b":"he said \\"hi\\""}]')
    expect(csv.split('\n')).toEqual(['a,b', '1,"x,y"', '2,"he said ""hi"""'])
    expect(convert('csv', 'json', csv)).toBe(
      JSON.stringify(
        [
          { a: '1', b: 'x,y' },
          { a: '2', b: 'he said "hi"' },
        ],
        null,
        2,
      ),
    )
  })
})

describe('convert - text formats', () => {
  it('renders markdown to html', () => {
    expect(convert('markdown', 'html', '# ToolBox')).toContain('<h1>ToolBox</h1>')
  })

  it('turns html back into markdown', () => {
    const markdown = convert(
      'html',
      'markdown',
      '<h1>ToolBox</h1><p>hello <strong>world</strong></p>',
    )
    expect(markdown).toContain('# ToolBox')
    expect(markdown).toContain('**world**')
  })

  it('returns markdown unchanged when source and target match', () => {
    expect(convert('markdown', 'markdown', '# ToolBox')).toBe('# ToolBox')
  })

  it('formats sql with upper-cased keywords', () => {
    expect(convert('sql', 'sql', 'select a from t')).toMatch(/SELECT/)
  })
})

describe('convert - edge cases', () => {
  it('returns an empty string for blank input in every reachable pair', () => {
    for (const from of sourceFormats) {
      for (const to of targetFormatsOf(from)) {
        expect(convert(from, to, '')).toBe('')
        expect(convert(from, to, '   \n  ')).toBe('')
      }
    }
  })

  it('throws a readable error on invalid source content', () => {
    expect(() => convert('json', 'yaml', '{broken')).toThrowError(/Invalid JSON/)
    expect(() => convert('yaml', 'json', 'name: [unbalanced')).toThrowError(/Invalid YAML/)
    expect(() => convert('xml', 'json', '<root>')).toThrowError(/Invalid XML/)
    expect(() => convert('toml', 'json', 'a = = 1')).toThrowError(/Invalid TOML/)
  })

  it('rejects conversions that no target list exposes', () => {
    expect(() => convert('json', 'sql', '{"a":1}')).toThrowError(/Unsupported conversion/)
    expect(() => convert('json', 'markdown', '{"a":1}')).toThrowError(/Unsupported conversion/)
    expect(() => convert('markdown', 'json', '# hi')).toThrowError(/Unsupported conversion/)
    expect(() => convert('html', 'sql', '<p>hi</p>')).toThrowError(/Unsupported conversion/)
  })

  it('rejects non-object roots for object-only outputs', () => {
    expect(() => convert('json', 'toml', '[1,2]')).toThrowError(/root must be an object/)
    expect(() => convert('json', 'xml', '[1,2]')).toThrowError(/root must be an object/)
  })

  it('requires an array of objects for csv output', () => {
    expect(() => convert('json', 'csv', '{"a":1}')).toThrowError(/array of objects/)
    expect(() => convert('json', 'csv', '[1,2]')).toThrowError(/must be an object/)
  })
})

describe('collapseToSingleLine', () => {
  it('folds newlines, indentation and tabs into single spaces', () => {
    expect(collapseToSingleLine('a\n  b\tc')).toBe('a b c')
    expect(collapseToSingleLine('  \n\n  ')).toBe('')
    expect(collapseToSingleLine('')).toBe('')
  })

  it('keeps quoted content untouched', () => {
    expect(collapseToSingleLine('"a\n  b"   c')).toBe('"a\n  b" c')
    expect(collapseToSingleLine("'x  y'")).toBe("'x  y'")
  })

  it('does not mistake an escaped quote for the closing one', () => {
    expect(collapseToSingleLine('"a\\"b"   c')).toBe('"a\\"b" c')
  })

  it('preserves meaningful spaces inside text content', () => {
    expect(collapseToSingleLine('<p>text (note)</p>')).toBe('<p>text (note)</p>')
    expect(collapseToSingleLine('hello   <b>x</b>')).toBe('hello <b>x</b>')
  })
})

describe('convert - compact style', () => {
  it('folds json into its minimal single-line form', () => {
    expect(convert('yaml', 'json', 'name: ToolBox', { style: 'compact' })).toBe(
      '{"name":"ToolBox"}',
    )
  })

  it('folds yaml into flow style on one line', () => {
    expect(convert('json', 'yaml', '{"name":"ToolBox","n":1}', { style: 'compact' })).toBe(
      '{name: ToolBox, n: 1}',
    )
  })

  it('folds xml without indentation', () => {
    expect(convert('json', 'xml', '{"root":{"a":"1"}}', { style: 'compact' })).toBe(
      '<root><a>1</a></root>',
    )
  })

  it('folds toml and csv by squeezing whitespace', () => {
    expect(convert('json', 'toml', '{"name":"ToolBox"}', { style: 'compact' })).toBe(
      'name = "ToolBox"',
    )
    expect(convert('json', 'csv', '[{"a":1},{"a":2}]', { style: 'compact' })).toBe('a 1 2')
  })

  it('folds sql and markdown-rendered html', () => {
    expect(convert('sql', 'sql', 'select a\nfrom t', { style: 'compact' })).toBe('SELECT a FROM t')
    expect(convert('markdown', 'html', '# Title\n\nbody', { style: 'compact' })).toBe(
      '<h1>Title</h1> <p>body</p>',
    )
  })

  it('keeps pretty output when no style is given', () => {
    expect(convert('json', 'json', '{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(convert('json', 'json', '{"a":1}', { style: 'pretty' })).toBe('{\n  "a": 1\n}')
  })

  it('round-trips between the two styles without losing content', () => {
    const source = '{"name":"ToolBox","list":[1,2],"nested":{"a":true}}'
    const compact = convert('json', 'json', source, { style: 'compact' })
    expect(JSON.parse(compact)).toEqual(JSON.parse(source))
    expect(JSON.parse(convert('json', 'json', source))).toEqual(JSON.parse(source))
  })
})
