import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'

import { formatXml } from './xml-formatter.service'

const parse = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml)

describe('formatXml', () => {
  it('indents nested elements with 2 spaces and keeps attributes', () => {
    const output = formatXml('<root a="1"><item>hello</item><item>x</item></root>')
    expect(output).toBe('<root a="1">\n  <item>hello</item>\n  <item>x</item>\n</root>')
  })

  it('parses to the same data as the original (roundtrip)', () => {
    const source =
      '<config version="2"><name>ToolBox</name><tags><t>a</t><t>b</t></tags><empty/></config>'
    expect(parse(formatXml(source))).toEqual(parse(source))
  })

  it('is idempotent', () => {
    const source = '<root><a x="1">text</a><b><c/></b></root>'
    expect(formatXml(formatXml(source))).toBe(formatXml(source))
  })

  it('returns empty string for empty input', () => {
    expect(formatXml('')).toBe('')
    expect(formatXml('   ')).toBe('')
  })

  it('throws on invalid xml with position info', () => {
    expect(() => formatXml('<root><unclosed>')).toThrow(/Invalid XML/)
    expect(() => formatXml('<root></root2>')).toThrow(Error)
  })

  it('throws on non-xml garbage', () => {
    expect(() => formatXml('just text')).toThrow(/Invalid XML/)
  })
})
