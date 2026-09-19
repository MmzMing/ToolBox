import { describe, expect, it } from 'vitest'

import { xmlToJson } from './xml-to-json.service'

describe('xmlToJson', () => {
  it('converts a basic xml document to pretty json', () => {
    expect(xmlToJson('<root><a>1</a><b>t</b></root>')).toBe(
      JSON.stringify({ root: { a: 1, b: 't' } }, null, 2),
    )
  })

  it('ignores the xml declaration', () => {
    expect(JSON.parse(xmlToJson('<?xml version="1.0"?><root><a>1</a></root>'))).toEqual({
      root: { a: 1 },
    })
  })

  it('converts repeated tags to arrays', () => {
    expect(JSON.parse(xmlToJson('<root><item>1</item><item>2</item></root>'))).toEqual({
      root: { item: [1, 2] },
    })
  })

  it('returns empty string for empty input', () => {
    expect(xmlToJson('')).toBe('')
    expect(xmlToJson('  \n')).toBe('')
  })

  it('throws on mismatched closing tags', () => {
    expect(() => xmlToJson('<a></b>')).toThrow()
  })

  it('throws on unclosed tags', () => {
    expect(() => xmlToJson('<root><a>1</root>')).toThrow()
  })
})
