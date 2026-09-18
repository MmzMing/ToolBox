import { describe, expect, it } from 'vitest'

import { hashAlgorithms, hashText, hashTextAll } from './service'

describe('hashText', () => {
  it('computes known empty-string digests', () => {
    expect(hashText('MD5', '')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hashText('SHA256', '')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('computes known digests for "abc"', () => {
    expect(hashText('MD5', 'abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(hashText('SHA1', 'abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(hashText('SHA512', 'abc')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    )
  })

  it('supports utf-8 input', () => {
    expect(hashText('MD5', '中文')).toBe('a7bac2239fcdcb3a067903d8077c4a07')
  })

  it('produces lowercase hex output for every algorithm', () => {
    for (const algorithm of hashAlgorithms) {
      const digest = hashText(algorithm, 'toolbox')
      expect(digest).toMatch(/^[0-9a-f]+$/)
    }
  })
})

describe('hashTextAll', () => {
  it('returns every algorithm at once', () => {
    const all = hashTextAll('abc')
    expect(Object.keys(all)).toEqual([...hashAlgorithms])
    expect(all.MD5).toBe(hashText('MD5', 'abc'))
  })
})
