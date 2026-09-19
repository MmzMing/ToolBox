import { describe, expect, it } from 'vitest'

import {
  calculateSubnet,
  formatIpv4,
  parseIpv4,
  parseNetmaskOrPrefix,
  prefixToNetmask,
} from '@/tools/network/ipv4-subnet-calculator/ipv4-subnet-calculator.service'

describe('parseIpv4', () => {
  it('converts dotted decimal to uint32', () => {
    expect(parseIpv4('192.168.1.10')).toBe(3232235786)
    expect(parseIpv4('0.0.0.0')).toBe(0)
    expect(parseIpv4('255.255.255.255')).toBe(4294967295)
    expect(parseIpv4('8.8.8.8')).toBe(0x08080808)
  })

  it('accepts leading zeros in octets', () => {
    expect(parseIpv4('001.002.003.004')).toBe(0x01020304)
  })

  it('trims surrounding whitespace', () => {
    expect(parseIpv4('  1.2.3.4  ')).toBe(0x01020304)
  })

  it('rejects wrong octet count and empty input', () => {
    expect(() => parseIpv4('')).toThrow(Error)
    expect(() => parseIpv4('1.2.3')).toThrow(/Invalid IPv4 address/)
    expect(() => parseIpv4('1.2.3.4.5')).toThrow(/Invalid IPv4 address/)
    expect(() => parseIpv4('1..3.4')).toThrow(/Invalid IPv4 octet/)
  })

  it('rejects non-numeric and out-of-range octets', () => {
    expect(() => parseIpv4('a.b.c.d')).toThrow(Error)
    expect(() => parseIpv4('256.1.1.1')).toThrow(/out of range/)
    expect(() => parseIpv4('1.2.3.-4')).toThrow(Error)
    expect(() => parseIpv4('1.2.3.9999')).toThrow(Error)
  })
})

describe('formatIpv4', () => {
  it('converts uint32 to dotted decimal', () => {
    expect(formatIpv4(3232235786)).toBe('192.168.1.10')
    expect(formatIpv4(0)).toBe('0.0.0.0')
    expect(formatIpv4(4294967295)).toBe('255.255.255.255')
  })

  it('rejects non-uint32 values', () => {
    expect(() => formatIpv4(-1)).toThrow(Error)
    expect(() => formatIpv4(4294967296)).toThrow(Error)
    expect(() => formatIpv4(1.5)).toThrow(Error)
  })
})

describe('roundtrip parse → format', () => {
  it('restores the original address', () => {
    expect(formatIpv4(parseIpv4('172.16.254.1'))).toBe('172.16.254.1')
  })
})

describe('prefixToNetmask', () => {
  it('builds contiguous masks', () => {
    expect(prefixToNetmask(0)).toBe(0)
    expect(prefixToNetmask(8)).toBe(0xff000000)
    expect(prefixToNetmask(24)).toBe(0xffffff00)
    expect(prefixToNetmask(32)).toBe(0xffffffff)
  })

  it('rejects out-of-range prefixes', () => {
    expect(() => prefixToNetmask(-1)).toThrow(Error)
    expect(() => prefixToNetmask(33)).toThrow(Error)
    expect(() => prefixToNetmask(1.5)).toThrow(Error)
  })
})

describe('parseNetmaskOrPrefix', () => {
  it('parses CIDR notation', () => {
    expect(parseNetmaskOrPrefix('192.168.1.10/24')).toEqual({ ip: 3232235786, prefix: 24 })
    expect(parseNetmaskOrPrefix('10.0.0.1/8')).toEqual({ ip: 0x0a000001, prefix: 8 })
  })

  it('parses dotted netmask notation', () => {
    expect(parseNetmaskOrPrefix('192.168.1.10/255.255.0.0')).toEqual({
      ip: 3232235786,
      prefix: 16,
    })
    expect(parseNetmaskOrPrefix('1.2.3.4/255.255.255.255')).toEqual({ ip: 0x01020304, prefix: 32 })
    expect(parseNetmaskOrPrefix('1.2.3.4/0.0.0.0')).toEqual({ ip: 0x01020304, prefix: 0 })
  })

  it('treats a bare IP as /32', () => {
    expect(parseNetmaskOrPrefix('1.2.3.4')).toEqual({ ip: 0x01020304, prefix: 32 })
  })

  it('rejects invalid notations', () => {
    expect(() => parseNetmaskOrPrefix('')).toThrow(Error)
    expect(() => parseNetmaskOrPrefix('1.2.3.4/33')).toThrow(/out of range/)
    expect(() => parseNetmaskOrPrefix('1.2.3.4/255.0.255.0')).toThrow(/not contiguous/)
    expect(() => parseNetmaskOrPrefix('1.2.3.4/abc')).toThrow(Error)
    expect(() => parseNetmaskOrPrefix('/24')).toThrow(Error)
  })
})

describe('calculateSubnet', () => {
  it('computes a standard /24 network', () => {
    const result = calculateSubnet(parseIpv4('192.168.1.10'), 24)
    expect(result.ip).toBe('192.168.1.10')
    expect(result.networkAddress).toBe('192.168.1.0')
    expect(result.broadcastAddress).toBe('192.168.1.255')
    expect(result.netmask).toBe('255.255.255.0')
    expect(result.wildcardMask).toBe('0.0.0.255')
    expect(result.totalHosts).toBe(256)
    expect(result.usableHosts).toBe(254)
    expect(result.firstUsableHost).toBe('192.168.1.1')
    expect(result.lastUsableHost).toBe('192.168.1.254')
    expect(result.addressClass).toBe('C')
    expect(result.isPrivate).toBe(true)
  })

  it('handles /32 as a single host', () => {
    const result = calculateSubnet(parseIpv4('1.2.3.4'), 32)
    expect(result.networkAddress).toBe('1.2.3.4')
    expect(result.broadcastAddress).toBe('1.2.3.4')
    expect(result.netmask).toBe('255.255.255.255')
    expect(result.wildcardMask).toBe('0.0.0.0')
    expect(result.totalHosts).toBe(1)
    expect(result.usableHosts).toBe(1)
    expect(result.firstUsableHost).toBe('1.2.3.4')
    expect(result.lastUsableHost).toBe('1.2.3.4')
  })

  it('handles /31 as an RFC 3021 point-to-point link', () => {
    const result = calculateSubnet(parseIpv4('10.0.0.0'), 31)
    expect(result.totalHosts).toBe(2)
    expect(result.usableHosts).toBe(2)
    expect(result.firstUsableHost).toBe('10.0.0.0')
    expect(result.lastUsableHost).toBe('10.0.0.1')
    expect(result.isPrivate).toBe(true)
  })

  it('handles /0 as the whole address space', () => {
    const result = calculateSubnet(parseIpv4('8.8.8.8'), 0)
    expect(result.networkAddress).toBe('0.0.0.0')
    expect(result.broadcastAddress).toBe('255.255.255.255')
    expect(result.netmask).toBe('0.0.0.0')
    expect(result.wildcardMask).toBe('255.255.255.255')
    expect(result.totalHosts).toBe(4294967296)
    expect(result.usableHosts).toBe(4294967294)
    expect(result.firstUsableHost).toBe('0.0.0.1')
    expect(result.lastUsableHost).toBe('255.255.255.254')
    expect(result.isPrivate).toBe(false)
  })

  it('classifies address classes by first octet', () => {
    expect(calculateSubnet(parseIpv4('10.0.0.1'), 8).addressClass).toBe('A')
    expect(calculateSubnet(parseIpv4('127.0.0.1'), 32).addressClass).toBe('A')
    expect(calculateSubnet(parseIpv4('128.0.0.1'), 32).addressClass).toBe('B')
    expect(calculateSubnet(parseIpv4('191.255.0.1'), 32).addressClass).toBe('B')
    expect(calculateSubnet(parseIpv4('192.0.2.1'), 32).addressClass).toBe('C')
    expect(calculateSubnet(parseIpv4('223.255.255.1'), 32).addressClass).toBe('C')
    expect(calculateSubnet(parseIpv4('224.0.0.1'), 32).addressClass).toBe('D')
    expect(calculateSubnet(parseIpv4('240.0.0.1'), 32).addressClass).toBe('E')
  })

  it('detects RFC 1918 private ranges only', () => {
    expect(calculateSubnet(parseIpv4('10.1.2.3'), 8).isPrivate).toBe(true)
    expect(calculateSubnet(parseIpv4('172.16.5.5'), 32).isPrivate).toBe(true)
    expect(calculateSubnet(parseIpv4('172.31.255.255'), 32).isPrivate).toBe(true)
    expect(calculateSubnet(parseIpv4('192.168.0.1'), 32).isPrivate).toBe(true)
    expect(calculateSubnet(parseIpv4('172.32.0.1'), 32).isPrivate).toBe(false)
    expect(calculateSubnet(parseIpv4('11.0.0.1'), 32).isPrivate).toBe(false)
    expect(calculateSubnet(parseIpv4('8.8.8.8'), 32).isPrivate).toBe(false)
  })

  it('rejects invalid inputs', () => {
    expect(() => calculateSubnet(-1, 24)).toThrow(Error)
    expect(() => calculateSubnet(4294967296, 24)).toThrow(Error)
    expect(() => calculateSubnet(1.5, 24)).toThrow(Error)
    expect(() => calculateSubnet(0x01020304, 33)).toThrow(Error)
    expect(() => calculateSubnet(0x01020304, -1)).toThrow(Error)
  })
})
