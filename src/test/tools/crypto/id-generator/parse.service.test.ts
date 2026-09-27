import { describe, expect, it } from 'vitest'

import { generateUuid } from '@/tools/crypto/id-generator/uuid.service'
import {
  analyzeIds,
  identifyId,
  parseId,
  type ParsedUlid,
  type ParsedUuid,
} from '@/tools/crypto/id-generator/parse.service'

/** RFC 9562 附录 A 记录的 v7 样例，反解应为 2022-02-22T18:21:11.984Z */
const RFC_V7 = '017F22AA-79B0-7CC3-91C4-1566B4E8ADA5'
const SAMPLE_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const BASE = 1_700_000_000_123

function uuidOf(raw: string): ParsedUuid {
  const outcome = parseId(raw)
  if (!outcome.ok || outcome.value.kind !== 'uuid') {
    throw new Error(`expected a UUID, got ${JSON.stringify(outcome)}`)
  }
  return outcome.value
}

function ulidOf(raw: string): ParsedUlid {
  const outcome = parseId(raw)
  if (!outcome.ok || outcome.value.kind !== 'ulid') {
    throw new Error(`expected a ULID, got ${JSON.stringify(outcome)}`)
  }
  return outcome.value
}

describe('identifyId', () => {
  it('recognises every UUID decoration', () => {
    for (const raw of [
      RFC_V7,
      RFC_V7.toLowerCase(),
      RFC_V7.replaceAll('-', ''),
      `{${RFC_V7}}`,
      `urn:uuid:${RFC_V7}`,
      `  ${RFC_V7}  `,
    ]) {
      expect(identifyId(raw)).toBe('uuid')
    }
  })

  it('recognises ULIDs in either case', () => {
    expect(identifyId(SAMPLE_ULID)).toBe('ulid')
    expect(identifyId(SAMPLE_ULID.toLowerCase())).toBe('ulid')
  })

  it('rejects junk', () => {
    expect(identifyId('')).toBe('unknown')
    expect(identifyId('hello-world')).toBe('unknown')
    expect(identifyId(SAMPLE_ULID.replace('A', 'U'))).toBe('unknown')
  })
})

describe('parseId for UUIDs', () => {
  it('matches the RFC 9562 sample down to the field boundaries', () => {
    const parsed = uuidOf(RFC_V7)
    expect(parsed.canonical).toBe(RFC_V7.toLowerCase())
    expect(parsed.version).toBe(7)
    expect(parsed.variant).toBe('rfc4122')
    expect(parsed.timestamp).toBe(1_645_554_071_984)
    expect(parsed.fields).toEqual({
      timeLow: '017f22aa',
      timeMid: '79b0',
      timeHiAndVersion: '7cc3',
      clockSeq: '91c4',
      node: '1566b4e8ada5',
    })
  })

  it('normalises every decorated input to the same canonical form', () => {
    expect(uuidOf(`urn:uuid:${RFC_V7}`).canonical).toBe(uuidOf(`{${RFC_V7}}`).canonical)
  })

  it('exposes 128 bits of binary and a padding-free Base64URL', () => {
    const parsed = uuidOf(RFC_V7)
    expect(parsed.binary.replaceAll(' ', '')).toHaveLength(128)
    expect(parsed.base64url).toHaveLength(22)
    expect(parsed.base64url).not.toMatch(/[+/=]/)
  })

  it('offers the byte-equivalent ULID', () => {
    expect(uuidOf('01563e3a-b5d3-d676-4c61-efb99302bd5b').ulidForm).toBe(SAMPLE_ULID)
  })

  it('reads back the timestamp of generated v1 and v6 ids', () => {
    expect(uuidOf(generateUuid('v1', { timestamp: BASE })).timestamp).toBe(BASE)
    expect(uuidOf(generateUuid('v6', { timestamp: BASE })).timestamp).toBe(BASE)
    expect(uuidOf(generateUuid('v7', { timestamp: BASE })).timestamp).toBe(BASE)
  })

  it('decodes a published v1 sample without a generation roundtrip', () => {
    // 公开文档里的 v1 样例，1999-08-11T01:08:21.238Z，用来锚定 60bit 位运算本身
    expect(uuidOf('3f2504e0-4f89-11d3-9a0c-0305e82c3301').timestamp).toBe(934_333_701_238)
  })

  it('has no timestamp for random and named versions', () => {
    expect(uuidOf(generateUuid('v4')).timestamp).toBeNull()
    expect(uuidOf(generateUuid('v4')).version).toBe(4)
    expect(
      uuidOf(generateUuid('v5', { name: 'x', namespace: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }))
        .version,
    ).toBe(5)
  })

  it('classifies the Nil UUID', () => {
    const parsed = uuidOf('00000000-0000-0000-0000-000000000000')
    expect(parsed.version).toBe(0)
    expect(parsed.variant).toBe('ncs')
    expect(parsed.timestamp).toBeNull()
  })
})

describe('parseId for ULIDs', () => {
  it('decodes the documented sample', () => {
    const parsed = ulidOf(SAMPLE_ULID)
    expect(parsed.timestamp).toBe(1_469_922_850_259)
    expect(parsed.uuidForm).toBe('01563e3a-b5d3-d676-4c61-efb99302bd5b')
    expect(parsed.hex).toBe('01563e3ab5d3d6764c61efb99302bd5b')
  })

  it('uppercases a lowercase input', () => {
    expect(ulidOf(SAMPLE_ULID.toLowerCase()).value).toBe(SAMPLE_ULID)
  })
})

describe('parseId failures', () => {
  it('reports an empty input', () => {
    expect(parseId('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('reports a wrong length', () => {
    expect(parseId('3f2504e0')).toEqual({ ok: false, reason: 'length' })
    expect(parseId('0'.repeat(31))).toEqual({ ok: false, reason: 'length' })
  })

  it('reports an illegal character', () => {
    expect(parseId('3f2504e0-4f89-11d3-9a0c-0305e82c330z')).toEqual({
      ok: false,
      reason: 'character',
    })
    expect(parseId('urn:uuid:3f2504e0-4f89-11d3-9a0c-0305e82c3301;')).toEqual({
      ok: false,
      reason: 'character',
    })
    // Crockford 表里没有 I，26 个字符却仍是非法
    expect(parseId(`${SAMPLE_ULID.slice(0, 25)}I`)).toEqual({ ok: false, reason: 'character' })
  })

  it('never throws, whatever is pasted', () => {
    for (const raw of ['\n\t', '🙂', '{}', 'x'.repeat(500), 'null']) {
      expect(() => parseId(raw)).not.toThrow()
    }
  })
})

describe('analyzeIds', () => {
  it('counts valid, invalid and duplicate lines', () => {
    const report = analyzeIds(
      [RFC_V7, RFC_V7.toLowerCase(), SAMPLE_ULID, 'oops', '', '   '].join('\r\n'),
    )
    expect(report.total).toBe(4)
    expect(report.valid).toBe(3)
    expect(report.invalid).toBe(1)
    expect(report.duplicates).toBe(1)
  })

  it('ignores blank lines and keeps per-line verdicts', () => {
    const report = analyzeIds(`\n  ${SAMPLE_ULID}  \nnot-an-id\n`)
    expect(report.total).toBe(2)
    expect(report.lines[0]).toMatchObject({ kind: 'ulid', valid: true, version: null })
    expect(report.lines[1].kind).toBe('unknown')
    expect(report.lines[1].timestamp).toBeNull()
  })

  it('carries the decoded timestamp per line', () => {
    expect(analyzeIds(generateUuid('v7', { timestamp: BASE })).lines[0].timestamp).toBe(BASE)
  })

  it('handles an empty paste', () => {
    expect(analyzeIds('')).toEqual({ lines: [], total: 0, valid: 0, invalid: 0, duplicates: 0 })
  })
})
