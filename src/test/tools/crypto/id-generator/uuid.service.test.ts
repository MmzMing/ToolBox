import { describe, expect, it } from 'vitest'

import {
  UUID_NAMESPACE_VALUES,
  generateUuid,
  generateUuids,
  isDeterministic,
  resolveNamespace,
  uuidVariantOf,
  uuidVersionOf,
} from '@/tools/crypto/id-generator/uuid.service'

const NS_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

describe('uuidVersionOf / uuidVariantOf', () => {
  it('reads the version nibble', () => {
    expect(uuidVersionOf('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(1)
    expect(uuidVersionOf('00000000-0000-4000-8000-000000000000')).toBe(4)
  })

  it('classifies every variant family', () => {
    expect(uuidVariantOf('00000000-0000-0000-0a00-000000000000')).toBe('ncs')
    expect(uuidVariantOf('00000000-0000-0000-9a00-000000000000')).toBe('rfc4122')
    expect(uuidVariantOf('00000000-0000-0000-c000-000000000000')).toBe('microsoft')
    expect(uuidVariantOf('00000000-0000-0000-e000-000000000000')).toBe('reserved')
  })

  it('rejects anything that is not 32 hex digits', () => {
    expect(() => uuidVersionOf('nope')).toThrow(Error)
    expect(() => uuidVariantOf('00000000-0000-0000-9a00-00000000000')).toThrow(Error)
  })
})

describe('resolveNamespace', () => {
  it('maps the four predefined namespaces', () => {
    expect(resolveNamespace('dns')).toBe(NS_DNS)
    expect(resolveNamespace('url')).toBe('6ba7b811-9dad-11d1-80b4-00c04fd430c8')
    expect(UUID_NAMESPACE_VALUES.oid).toBe('6ba7b812-9dad-11d1-80b4-00c04fd430c8')
    expect(UUID_NAMESPACE_VALUES.x500).toBe('6ba7b814-9dad-11d1-80b4-00c04fd430c8')
  })

  it('accepts a custom namespace that is a valid UUID', () => {
    expect(resolveNamespace('custom', ` ${NS_DNS} `)).toBe(NS_DNS)
  })

  it('throws when the custom namespace is malformed', () => {
    expect(() => resolveNamespace('custom', 'not-a-uuid')).toThrow(Error)
    expect(() => resolveNamespace('custom')).toThrow(Error)
  })
})

describe('generateUuid', () => {
  it('produces a random v4 with the RFC 4122 variant', () => {
    const first = generateUuid('v4')
    const second = generateUuid('v4')
    expect(uuidVersionOf(first)).toBe(4)
    expect(uuidVariantOf(first)).toBe('rfc4122')
    expect(first).not.toBe(second)
  })

  it('returns the Nil UUID', () => {
    expect(generateUuid('nil')).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('embeds the requested millisecond timestamp into v7', () => {
    const msecs = 1_700_000_000_123
    const uuid = generateUuid('v7', { timestamp: msecs })
    const first48 = uuid.slice(0, 8) + uuid.slice(9, 13)
    expect(first48).toBe(msecs.toString(16).padStart(12, '0'))
    expect(uuidVersionOf(uuid)).toBe(7)
  })

  it('keeps v1 and v6 on the same millisecond when given one', () => {
    const msecs = 1_700_000_000_123
    expect(uuidVersionOf(generateUuid('v1', { timestamp: msecs }))).toBe(1)
    expect(uuidVersionOf(generateUuid('v6', { timestamp: msecs }))).toBe(6)
  })

  it('reproduces the named-UUID vectors byte for byte', () => {
    expect(generateUuid('v3', { name: 'www.example.com', namespace: NS_DNS })).toBe(
      '5df41881-3aed-3515-88a7-2f4a814cf09e',
    )
    expect(generateUuid('v5', { name: 'www.example.com', namespace: NS_DNS })).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    )
  })

  it('treats a trailing space as a different name', () => {
    expect(generateUuid('v5', { name: 'www.example.com ', namespace: NS_DNS })).not.toBe(
      generateUuid('v5', { name: 'www.example.com', namespace: NS_DNS }),
    )
  })

  it('throws on an empty name or a malformed namespace', () => {
    expect(() => generateUuid('v5', { name: '', namespace: NS_DNS })).toThrow(Error)
    expect(() => generateUuid('v3', { name: 'a', namespace: 'zz' })).toThrow(Error)
  })

  it('throws on a non-integer or negative timestamp', () => {
    expect(() => generateUuid('v7', { timestamp: 1.5 })).toThrow(Error)
    expect(() => generateUuid('v1', { timestamp: -1 })).toThrow(Error)
  })
})

describe('generateUuids', () => {
  it('clamps the batch size into the supported range', () => {
    expect(generateUuids('v4', {}, 0)).toHaveLength(1)
    expect(generateUuids('v4', {}, 5)).toHaveLength(5)
    expect(generateUuids('v4', {}, Number.NaN)).toHaveLength(1)
    expect(generateUuids('v4', {}, 99_999)).toHaveLength(1_000)
  })

  it('emits unique millisecond-spaced batches', () => {
    for (const version of ['v1', 'v6', 'v7'] as const) {
      const batch = generateUuids(version, { timestamp: 1_700_000_000_000 }, 4)
      expect(batch).toHaveLength(4)
      expect(new Set(batch).size).toBe(4)
    }
  })

  it('orders v6 and v7 lexicographically', () => {
    // v1 把 time_low 排在最前，字符串序≠时间序——这正是 RFC 9562 造出 v6 的理由
    for (const version of ['v6', 'v7'] as const) {
      const batch = generateUuids(version, { timestamp: 1_700_000_000_000 }, 4)
      expect([...batch].sort()).toEqual(batch)
    }
  })

  it('collapses deterministic versions to a single result', () => {
    expect(isDeterministic('v5')).toBe(true)
    expect(generateUuids('v5', { name: 'x', namespace: NS_DNS }, 10)).toEqual([
      generateUuid('v5', { name: 'x', namespace: NS_DNS }),
    ])
    expect(generateUuids('nil', {}, 10)).toHaveLength(1)
  })

  it('surfaces invalid named-UUID input instead of returning a batch', () => {
    expect(() => generateUuids('v5', { name: '', namespace: NS_DNS }, 3)).toThrow(Error)
  })
})
