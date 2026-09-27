import { describe, expect, it } from 'vitest'

import {
  ID_COUNT_RANGE,
  applyFormat,
  clampCount,
  joinIds,
  renderIds,
} from '@/tools/crypto/id-generator/id-format.service'

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

describe('clampCount', () => {
  it('keeps values inside the range', () => {
    expect(clampCount(5)).toBe(5)
    expect(clampCount(ID_COUNT_RANGE.max)).toBe(1000)
  })

  it('clamps below the minimum', () => {
    expect(clampCount(0)).toBe(ID_COUNT_RANGE.min)
    expect(clampCount(-42)).toBe(ID_COUNT_RANGE.min)
  })

  it('clamps above the maximum', () => {
    expect(clampCount(9999)).toBe(ID_COUNT_RANGE.max)
  })

  it('floors fractions and rejects non-finite input', () => {
    expect(clampCount(7.9)).toBe(7)
    expect(clampCount(Number.NaN)).toBe(ID_COUNT_RANGE.min)
    expect(clampCount(Number.POSITIVE_INFINITY)).toBe(ID_COUNT_RANGE.min)
  })
})

describe('applyFormat', () => {
  it('leaves the value untouched for the default format', () => {
    expect(applyFormat(UUID, 'default')).toBe(UUID)
    expect(applyFormat('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'default')).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('switches case', () => {
    expect(applyFormat(UUID, 'upper')).toBe(UUID.toUpperCase())
    expect(applyFormat('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'lower')).toBe('01arz3ndektsv4rrffq69g5fav')
  })

  it('strips hyphens for the raw format', () => {
    expect(applyFormat(UUID, 'raw')).toBe('3f2504e04f8911d39a0c0305e82c3301')
  })

  it('wraps in braces or a URN prefix', () => {
    expect(applyFormat(UUID, 'braces')).toBe(`{${UUID}}`)
    expect(applyFormat(UUID, 'urn')).toBe(`urn:uuid:${UUID}`)
  })
})

describe('joinIds', () => {
  const items = ['a', 'b']

  it('joins by newline and comma', () => {
    expect(joinIds(items, 'newline')).toBe('a\nb')
    expect(joinIds(items, 'comma')).toBe('a, b')
  })

  it('quotes every item', () => {
    expect(joinIds(items, 'quoted')).toBe('"a", "b"')
  })

  it('emits an indented JSON array', () => {
    expect(joinIds(items, 'jsonArray')).toBe('[\n  "a",\n  "b"\n]')
  })

  it('handles an empty batch', () => {
    expect(joinIds([], 'newline')).toBe('')
    expect(joinIds([], 'jsonArray')).toBe('[]')
  })
})

describe('renderIds', () => {
  it('applies the format before joining', () => {
    expect(renderIds([UUID, UUID], 'upper', 'newline')).toBe(
      `${UUID.toUpperCase()}\n${UUID.toUpperCase()}`,
    )
  })

  it('returns an empty string for no values', () => {
    expect(renderIds([], 'default', 'newline')).toBe('')
  })
})
