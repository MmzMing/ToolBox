import { describe, expect, it } from 'vitest'

import {
  MAX_EXTRACTED_FIELDS,
  classifyValue,
  detectStructured,
  diffParts,
  extractFromText,
  extractTimeFields,
  isTimeNamedKey,
  serializeFields,
  sortFields,
  spanMs,
} from '@/tools/development/date-time-converter/batch-extract.service'

const SAMPLE_JSON = `{
  "order": {
    "id": "ORD-20240123-001",
    "created_at": 1706000000,
    "paid_at": 1706000180,
    "shipped_at": 1706003600,
    "delivered_at": 1706090400,
    "items": [
      { "name": "A", "added_to_cart": 1705996400 },
      { "name": "B", "added_to_cart": 1705998200 }
    ]
  },
  "user": {
    "registered_at": 1672531200,
    "last_login": 1706000000,
    "email_verified_at": 1672617600
  }
}`

describe('classifyValue', () => {
  it('maps digit counts to units', () => {
    expect(classifyValue('ts', '1706000000')?.unit).toBe('s')
    expect(classifyValue('ts', '1706000000123')?.unit).toBe('ms')
    expect(classifyValue('ts', '1706000000123456')?.unit).toBe('us')
    expect(classifyValue('ts', '1706000000123456789')?.unit).toBe('ns')
  })

  it('normalizes every unit to milliseconds', () => {
    expect(classifyValue('ts', '1706000000')?.ms).toBe(1_706_000_000_000)
    expect(classifyValue('ts', '1706000000123')?.ms).toBe(1_706_000_000_123)
    expect(classifyValue('ts', '1706000000123456')?.ms).toBeCloseTo(1_706_000_000_123.456, 2)
  })

  it('keeps fractional seconds', () => {
    const field = classifyValue('ts', '1706000000.5')
    expect(field?.unit).toBe('s')
    expect(field?.ms).toBe(1_706_000_000_500)
  })

  it('recognizes ISO-8601 strings without a unit', () => {
    const field = classifyValue('created', '2024-01-23T16:53:20Z')
    expect(field?.kind).toBe('iso')
    expect(field?.unit).toBeNull()
    expect(field?.iso).toBe('2024-01-23T16:53:20.000Z')
  })

  it('accepts date-only and space separated date-times', () => {
    expect(classifyValue('d', '2024-01-23')?.kind).toBe('iso')
    expect(classifyValue('d', '2024-01-23 16:53:20')?.kind).toBe('iso')
    expect(classifyValue('d', '2024-01-23T16:53:20+08:00')?.iso).toBe('2024-01-23T08:53:20.000Z')
  })

  it('rejects digit counts that are not timestamps', () => {
    expect(classifyValue('id', '12345')).toBeNull()
    expect(classifyValue('id', '170600000012')).toBeNull()
  })

  it('rejects values outside the plausible window', () => {
    expect(classifyValue('id', '9999999999999')).toBeNull()
    expect(classifyValue('id', '100000000000000')).toBeNull()
  })

  it('rejects non time-shaped text and empty input', () => {
    expect(classifyValue('name', '商品A')).toBeNull()
    expect(classifyValue('name', '2024-13-45')).toBeNull()
    expect(classifyValue('name', '   ')).toBeNull()
  })

  it('exposes the path as time-named or not', () => {
    expect(classifyValue('user.registered_at', '1706000000')?.named).toBe(true)
    expect(classifyValue('user.last_login', '1706000000')?.named).toBe(true)
    expect(classifyValue('order.items[0].sku', '1706000000')?.named).toBe(false)
  })
})

describe('isTimeNamedKey', () => {
  it('matches snake_case and camelCase time words', () => {
    expect(isTimeNamedKey('created_at')).toBe(true)
    expect(isTimeNamedKey('expiresAt')).toBe(true)
    expect(isTimeNamedKey('updateTime')).toBe(true)
    expect(isTimeNamedKey('@_timestamp')).toBe(true)
  })

  it('does not match ordinary keys', () => {
    expect(isTimeNamedKey('id')).toBe(false)
    expect(isTimeNamedKey('added_to_cart')).toBe(false)
    expect(isTimeNamedKey('')).toBe(false)
  })
})

describe('detectStructured', () => {
  it('reads JSON, YAML and XML containers', () => {
    expect(detectStructured('{"a":1}')?.format).toBe('json')
    expect(detectStructured('a:\n  - 1\n  - 2')?.format).toBe('yaml')
    expect(detectStructured('<root><a>1</a></root>')?.format).toBe('xml')
  })

  it('returns null for loose text and scalars', () => {
    expect(detectStructured('just some words here')).toBeNull()
    expect(detectStructured('1706000000')).toBeNull()
    expect(detectStructured('')).toBeNull()
  })
})

describe('extractTimeFields', () => {
  it('auto-detects JSON and walks nested paths', () => {
    const result = extractTimeFields(SAMPLE_JSON)
    expect(result.format).toBe('json')
    expect(result.truncated).toBe(false)
    expect(result.fields.map((field) => field.path).sort()).toEqual(
      [
        'order.created_at',
        'order.delivered_at',
        'order.items[0].added_to_cart',
        'order.items[1].added_to_cart',
        'order.paid_at',
        'order.shipped_at',
        'user.email_verified_at',
        'user.last_login',
        'user.registered_at',
      ].sort(),
    )
  })

  it('ignores non time fields such as order ids', () => {
    const result = extractTimeFields(SAMPLE_JSON)
    expect(result.fields.some((field) => field.path.endsWith('.id'))).toBe(false)
  })

  it('reads YAML timestamps and Date scalars', () => {
    const result = extractTimeFields('job:\n  started_at: 1706000000\n  run_at: 2024-01-23', 'yaml')
    expect(result.format).toBe('yaml')
    expect(result.fields.map((field) => field.kind)).toEqual(['unix', 'iso'])
  })

  it('reads XML elements and attributes', () => {
    const result = extractTimeFields(
      '<log at="1706000000"><event created_at="1706000180">ok</event></log>',
      'xml',
    )
    expect(result.format).toBe('xml')
    expect(result.fields.map((field) => field.path).sort()).toEqual([
      'log.at',
      'log.event.created_at',
    ])
  })

  it('falls back to line scanning when no structure is found', () => {
    const result = extractTimeFields(
      '2024-01-23T16:53:20Z boot\ncreated_at=1706000000 ok\ntime: 1706000180 done',
    )
    expect(result.format).toBe('text')
    expect(result.fields.map((field) => field.path)).toEqual(['', 'created_at', 'time'])
    expect(result.fields.map((field) => field.line)).toEqual([1, 2, 3])
  })

  it('does not split long identifiers into fake timestamps', () => {
    expect(extractFromText('order 170600000012345678901234567890 x')).toHaveLength(0)
    expect(extractFromText('ts=1706000000')).toHaveLength(1)
  })

  it('returns nothing for empty input', () => {
    expect(extractTimeFields('').fields).toEqual([])
    expect(extractTimeFields('   \n  ', 'text').fields).toEqual([])
  })

  it('throws when an explicit format does not match the content', () => {
    expect(() => extractTimeFields('{oops', 'json')).toThrowError(/Invalid JSON/)
    expect(() => extractTimeFields('<<<', 'xml')).toThrowError(/Invalid XML/)
  })

  it('caps the result and reports truncation', () => {
    const input = Array.from(
      { length: MAX_EXTRACTED_FIELDS + 50 },
      (_, index) => `at=${1706000000 + index}`,
    ).join('\n')
    const result = extractTimeFields(input, 'text')
    expect(result.fields).toHaveLength(MAX_EXTRACTED_FIELDS)
    expect(result.truncated).toBe(true)
  })
})

describe('sortFields', () => {
  const fields = extractTimeFields(SAMPLE_JSON).fields

  it('sorts by time ascending', () => {
    const sorted = sortFields(fields, 'time')
    const times = sorted.map((field) => field.ms)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(sorted[0]?.path).toBe('user.registered_at')
  })

  it('sorts by path with numeric segments', () => {
    const sorted = sortFields(fields, 'path')
    expect(sorted[0]?.path).toBe('order.created_at')
    expect(sorted.at(-1)?.path).toBe('user.registered_at')
  })

  it('does not mutate the input', () => {
    const source = [...fields]
    sortFields(source, 'time')
    expect(source.map((field) => field.path)).toEqual(fields.map((field) => field.path))
  })
})

describe('diffParts', () => {
  it('splits into the largest units first', () => {
    expect(diffParts(86_400_000)).toEqual([{ value: 1, unit: 'd' }])
    expect(diffParts(3_600_000 + 60_000)).toEqual([
      { value: 1, unit: 'h' },
      { value: 1, unit: 'm' },
    ])
    expect(diffParts(33_600_000)).toEqual([
      { value: 9, unit: 'h' },
      { value: 20, unit: 'm' },
    ])
  })

  it('keeps sub-second remainders and caps the parts', () => {
    expect(diffParts(1_500)).toEqual([
      { value: 1, unit: 's' },
      { value: 500, unit: 'ms' },
    ])
    expect(diffParts(93_796_000)).toEqual([
      { value: 1, unit: 'd' },
      { value: 2, unit: 'h' },
      { value: 3, unit: 'm' },
    ])
  })

  it('reports zero as 0 milliseconds and ignores the sign', () => {
    expect(diffParts(0)).toEqual([{ value: 0, unit: 'ms' }])
    expect(diffParts(-86_400_000)).toEqual([{ value: 1, unit: 'd' }])
  })
})

describe('spanMs', () => {
  it('is the distance between the extremes', () => {
    const fields = extractTimeFields(SAMPLE_JSON).fields
    expect(spanMs(fields)).toBe(1706090400_000 - 1672531200_000)
  })

  it('is zero for less than two fields', () => {
    expect(spanMs([])).toBe(0)
    expect(spanMs([{ ...extractTimeFields(SAMPLE_JSON).fields[0]! }])).toBe(0)
  })
})

describe('serializeFields', () => {
  const fields = sortFields(extractTimeFields(SAMPLE_JSON).fields, 'time')

  it('writes parseable JSON with the display columns', () => {
    const parsed = JSON.parse(serializeFields(fields, 'json')) as Record<string, unknown>[]
    expect(parsed).toHaveLength(fields.length)
    expect(Object.keys(parsed[0] ?? {})).toEqual(['path', 'value', 'unit', 'local', 'iso'])
  })

  it('writes a TSV table with a header row', () => {
    const lines = serializeFields(fields, 'tsv').split('\n')
    expect(lines[0]).toBe('path\tvalue\tunit\tlocal\tiso')
    expect(lines).toHaveLength(fields.length + 1)
    expect(lines[1]?.split('\t')[2]).toBe('s')
  })

  it('writes only a header for an empty result', () => {
    expect(serializeFields([], 'tsv')).toBe('path\tvalue\tunit\tlocal\tiso')
    expect(serializeFields([], 'json')).toBe('[]')
  })
})
