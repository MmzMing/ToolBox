import { describe, expect, it } from 'vitest'

import { escapeCsvCell, jsonToCsv } from '@/tools/development/json-to-csv/json-to-csv.service'

describe('escapeCsvCell', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('abc', ',')).toBe('abc')
    expect(escapeCsvCell(42, ',')).toBe('42')
    expect(escapeCsvCell(true, ',')).toBe('true')
  })

  it('quotes cells containing the delimiter, quotes or line breaks', () => {
    expect(escapeCsvCell('a,b', ',')).toBe('"a,b"')
    expect(escapeCsvCell('say "hi"', ',')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line1\nline2', ',')).toBe('"line1\nline2"')
  })

  it('supports custom delimiters', () => {
    expect(escapeCsvCell('a,b', ';')).toBe('a,b')
    expect(escapeCsvCell('a;b', ';')).toBe('"a;b"')
  })

  it('maps null, undefined and nested objects', () => {
    expect(escapeCsvCell(null, ',')).toBe('')
    expect(escapeCsvCell(undefined, ',')).toBe('')
    expect(escapeCsvCell({ x: 1 }, ',')).toBe('"{""x"":1}"')
    expect(escapeCsvCell([1, 2], ',')).toBe('"[1,2]"')
  })
})

describe('jsonToCsv', () => {
  it('converts an array of objects with a header row', () => {
    const input = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ])
    expect(jsonToCsv(input, { delimiter: ',' })).toBe('name,age\nAlice,30\nBob,25')
  })

  it('unions columns from all rows in first-seen order', () => {
    const input = JSON.stringify([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }])
    expect(jsonToCsv(input, { delimiter: ',' })).toBe('a,b,c\n1,,\n,2,\n3,,4')
  })

  it('escapes quotes, commas and newlines per RFC 4180', () => {
    const input = JSON.stringify([{ text: 'a,"b"', note: 'x\ny' }])
    expect(jsonToCsv(input, { delimiter: ',' })).toBe('text,note\n"a,""b""","x\ny"')
  })

  it('stringifies nested objects', () => {
    const input = JSON.stringify([{ id: 1, meta: { tags: ['a'], nested: true } }])
    expect(jsonToCsv(input, { delimiter: ',' })).toBe(
      'id,meta\n1,"{""tags"":[""a""],""nested"":true}"',
    )
  })

  it('supports a custom delimiter', () => {
    const input = JSON.stringify([{ a: 'x,y', b: 2 }])
    expect(jsonToCsv(input, { delimiter: ';' })).toBe('a;b\nx,y;2')
  })

  it('handles an empty array', () => {
    expect(jsonToCsv('[]', { delimiter: ',' })).toBe('')
  })

  it('handles empty input', () => {
    expect(() => jsonToCsv('', { delimiter: ',' })).toThrow(/Invalid JSON/)
  })

  it('throws on non-array input and non-object elements', () => {
    expect(() => jsonToCsv('{"a":1}', { delimiter: ',' })).toThrow(/array of objects/)
    expect(() => jsonToCsv('[1,2]', { delimiter: ',' })).toThrow(/must be a JSON object/)
    expect(() => jsonToCsv('[[1]]', { delimiter: ',' })).toThrow(/must be a JSON object/)
    expect(() => jsonToCsv('[null]', { delimiter: ',' })).toThrow(/must be a JSON object/)
  })

  it('throws on an empty delimiter', () => {
    expect(() => jsonToCsv('[{"a":1}]', { delimiter: '' })).toThrow(/Delimiter/)
  })
})
