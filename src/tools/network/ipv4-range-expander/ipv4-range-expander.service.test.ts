import { describe, expect, it } from 'vitest'

import { ipv4RangeToCidrs } from './ipv4-range-expander.service'

describe('ipv4RangeToCidrs', () => {
  it('returns a single block for an aligned range', () => {
    expect(ipv4RangeToCidrs('192.168.1.0', '192.168.1.255')).toEqual(['192.168.1.0/24'])
    expect(ipv4RangeToCidrs('10.0.0.0', '10.0.0.255')).toEqual(['10.0.0.0/24'])
    expect(ipv4RangeToCidrs('10.0.0.0', '10.0.255.255')).toEqual(['10.0.0.0/16'])
  })

  it('returns a single /32 for a single address', () => {
    expect(ipv4RangeToCidrs('1.2.3.4', '1.2.3.4')).toEqual(['1.2.3.4/32'])
  })

  it('splits unaligned ranges into minimal blocks', () => {
    expect(ipv4RangeToCidrs('192.168.1.1', '192.168.1.10')).toEqual([
      '192.168.1.1/32',
      '192.168.1.2/31',
      '192.168.1.4/30',
      '192.168.1.8/31',
      '192.168.1.10/32',
    ])
    expect(ipv4RangeToCidrs('10.0.0.7', '10.0.0.42')).toEqual([
      '10.0.0.7/32',
      '10.0.0.8/29',
      '10.0.0.16/28',
      '10.0.0.32/29',
      '10.0.0.40/31',
      '10.0.0.42/32',
    ])
  })

  it('handles the whole address space as /0', () => {
    expect(ipv4RangeToCidrs('0.0.0.0', '255.255.255.255')).toEqual(['0.0.0.0/0'])
  })

  it('covers exactly the requested range (contiguous, aligned, no gaps)', () => {
    const start = '172.16.3.19'
    const end = '172.16.9.200'
    const cidrs = ipv4RangeToCidrs(start, end)
    const blocks = cidrs.map((cidr) => {
      const [base, prefix] = cidr.split('/')
      return { base, size: 2 ** (32 - Number(prefix)) }
    })
    // 首块从 start 开始，末块覆盖到 end
    expect(blocks[0]?.base).toBe(start)
    expect(blocks.at(-1)?.base).not.toBeUndefined()
    // 块之间连续且地址对齐
    let expectedBase = 0
    for (const [index, block] of blocks.entries()) {
      const baseValue = block.base.split('.').reduce((acc, part) => acc * 256 + Number(part), 0)
      if (index === 0) {
        expectedBase = baseValue
      } else {
        expect(baseValue).toBe(expectedBase)
      }
      expect(baseValue % block.size).toBe(0)
      expectedBase += block.size
    }
    // 总覆盖数等于范围大小
    const startValue = 172 * 256 ** 3 + 16 * 256 ** 2 + 3 * 256 + 19
    const endValue = 172 * 256 ** 3 + 16 * 256 ** 2 + 9 * 256 + 200
    const covered = blocks.reduce((acc, block) => acc + block.size, 0)
    expect(covered).toBe(endValue - startValue + 1)
  })

  it('throws when start is greater than end', () => {
    expect(() => ipv4RangeToCidrs('192.168.1.10', '192.168.1.1')).toThrow(/greater than end/)
  })

  it('throws on empty or invalid addresses', () => {
    expect(() => ipv4RangeToCidrs('', '1.2.3.4')).toThrow(Error)
    expect(() => ipv4RangeToCidrs('1.2.3.4', '')).toThrow(Error)
    expect(() => ipv4RangeToCidrs('256.0.0.0', '1.2.3.4')).toThrow(Error)
    expect(() => ipv4RangeToCidrs('1.2.3.4', 'not-an-ip')).toThrow(Error)
  })
})
