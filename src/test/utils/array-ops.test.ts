import { describe, expect, it } from 'vitest'

import { boomerang, deleteAt, duplicateAt, moveItem, reverseItems } from '@/utils/array-ops'

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('does not mutate the input', () => {
    const source = ['a', 'b']
    moveItem(source, 0, 1)

    expect(source).toEqual(['a', 'b'])
  })

  it('rejects an out-of-range move', () => {
    expect(() => moveItem(['a'], 0, 1)).toThrowError(/out of range/)
    expect(() => moveItem(['a'], -1, 0)).toThrowError(/out of range/)
  })
})

describe('boomerang', () => {
  it('plays forward then back without repeating the pivot frames', () => {
    expect(boomerang([1, 2, 3, 4])).toEqual([1, 2, 3, 4, 3, 2])
  })

  it('leaves a one or two frame list alone rather than duplicating a stall', () => {
    expect(boomerang([1])).toEqual([1])
    expect(boomerang([1, 2])).toEqual([1, 2])
  })
})

describe('deleteAt', () => {
  it('removes several indices at once', () => {
    expect(deleteAt(['a', 'b', 'c', 'd'], [0, 2])).toEqual(['b', 'd'])
  })

  it('keeps everything for an empty selection', () => {
    expect(deleteAt(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('rejects an index outside the list', () => {
    expect(() => deleteAt(['a'], [1])).toThrowError(/out of range/)
    expect(() => deleteAt(['a'], [0.5])).toThrowError(/out of range/)
  })
})

describe('duplicateAt', () => {
  it('inserts the copy right after the source', () => {
    expect(duplicateAt(['a', 'b'], 0)).toEqual(['a', 'a', 'b'])
    expect(duplicateAt(['a', 'b'], 1)).toEqual(['a', 'b', 'b'])
  })

  it('rejects an index outside the list', () => {
    expect(() => duplicateAt(['a'], 1)).toThrowError(/out of range/)
  })
})

describe('reverseItems', () => {
  it('reverses a copy', () => {
    const source = ['a', 'b', 'c']

    expect(reverseItems(source)).toEqual(['c', 'b', 'a'])
    expect(source).toEqual(['a', 'b', 'c'])
  })
})
