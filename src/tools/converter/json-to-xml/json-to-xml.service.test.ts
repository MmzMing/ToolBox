import { describe, expect, it } from 'vitest'

import { jsonToXml } from './json-to-xml.service'

describe('jsonToXml', () => {
  it('builds xml directly from the json object', () => {
    expect(jsonToXml('{"a":1}')).toBe('<a>1</a>\n')
  })

  it('indents nested elements with 2 spaces', () => {
    expect(jsonToXml('{"root":{"a":1,"b":{"c":2}}}')).toBe(
      '<root>\n  <a>1</a>\n  <b>\n    <c>2</c>\n  </b>\n</root>\n',
    )
  })

  it('renders arrays as repeated tags', () => {
    expect(jsonToXml('{"root":{"item":[1,2]}}')).toBe(
      '<root>\n  <item>1</item>\n  <item>2</item>\n</root>\n',
    )
  })

  it('renders @_ prefixed keys as attributes', () => {
    expect(jsonToXml('{"root":{"@_id":"x","a":1}}')).toBe('<root id="x">\n  <a>1</a>\n</root>\n')
  })

  it('renders booleans and null values', () => {
    expect(jsonToXml('{"enabled":true,"none":null}')).toBe('<enabled>true</enabled>\n<none/>\n')
  })

  it('returns empty string for empty input', () => {
    expect(jsonToXml('')).toBe('')
    expect(jsonToXml(' \n')).toBe('')
  })

  it('throws on invalid json', () => {
    expect(() => jsonToXml('{invalid')).toThrow(/Invalid JSON/)
  })

  it('throws when the json root is not an object', () => {
    expect(() => jsonToXml('[1,2]')).toThrow(/root must be an object/)
    expect(() => jsonToXml('"text"')).toThrow(/root must be an object/)
    expect(() => jsonToXml('null')).toThrow(/root must be an object/)
  })
})
