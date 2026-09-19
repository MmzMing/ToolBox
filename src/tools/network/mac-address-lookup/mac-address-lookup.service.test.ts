import { describe, expect, it } from 'vitest'

import {
  lookupMacVendor,
  macOuiPrefix,
  normalizeMac,
  ouiDatabase,
} from './mac-address-lookup.service'

describe('normalizeMac', () => {
  it('normalizes every supported separator style', () => {
    const expected = '00:1A:2B:3C:4D:5E'
    expect(normalizeMac('00:1A:2B:3C:4D:5E')).toBe(expected)
    expect(normalizeMac('00-1a-2b-3c-4d-5e')).toBe(expected)
    expect(normalizeMac('001A.2B3C.4D5E')).toBe(expected)
    expect(normalizeMac('001a2b3c4d5e')).toBe(expected)
    expect(normalizeMac('00 1a 2b 3c 4d 5e')).toBe(expected)
    expect(normalizeMac('  00:1a-2B.3c4D.5E  ')).toBe(expected)
  })

  it('uppercases hex letters', () => {
    expect(normalizeMac('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF')
  })

  it('rejects empty and malformed input', () => {
    expect(() => normalizeMac('')).toThrow(Error)
    expect(() => normalizeMac('00:1A:2B')).toThrow(/Invalid MAC address/)
    expect(() => normalizeMac('00:1A:2B:3C:4D:5G')).toThrow(Error)
    expect(() => normalizeMac('00:1A:2B:3C:4D:5E:FF')).toThrow(Error)
    expect(() => normalizeMac('hello-world-12')).toThrow(Error)
  })
})

describe('macOuiPrefix', () => {
  it('extracts the first three bytes without separators', () => {
    expect(macOuiPrefix('00:1A:2B:3C:4D:5E')).toBe('001A2B')
    expect(macOuiPrefix('b8-27-eb-11-22-33')).toBe('B827EB')
  })

  it('rejects invalid macs', () => {
    expect(() => macOuiPrefix('')).toThrow(Error)
  })
})

describe('lookupMacVendor', () => {
  it('finds known OUI entries regardless of input format', () => {
    expect(lookupMacVendor('00:00:0C:11:22:33')).toBe('Cisco Systems, Inc')
    expect(lookupMacVendor('00-0C-29-aa-bb-cc')).toBe('VMware, Inc.')
    expect(lookupMacVendor('b827eb123456')).toBe('Raspberry Pi Foundation')
    expect(lookupMacVendor('DC:A6:32:00:00:01')).toBe('Raspberry Pi Trading Ltd')
    expect(lookupMacVendor('0800.270a.b1c2')).toBe('PCS Systemtechnik GmbH (VirtualBox)')
    expect(lookupMacVendor('00:50:56:aa:bb:cc')).toBe('VMware, Inc.')
    expect(lookupMacVendor('00:15:5D:aa:bb:cc')).toBe('Microsoft Corporation')
    expect(lookupMacVendor('3C:5A:B4:aa:bb:cc')).toBe('Google, Inc.')
    expect(lookupMacVendor('F0:18:98:aa:bb:cc')).toBe('Apple, Inc.')
  })

  it('returns null for unknown OUI prefixes', () => {
    expect(lookupMacVendor('DE:AD:BE:EF:00:01')).toBeNull()
    expect(lookupMacVendor('FF:FF:FF:FF:FF:FF')).toBeNull()
  })

  it('throws on invalid input', () => {
    expect(() => lookupMacVendor('')).toThrow(Error)
    expect(() => lookupMacVendor('nope')).toThrow(Error)
  })
})

describe('ouiDatabase', () => {
  it('contains at least 40 real entries with unique keys', () => {
    const keys = Object.keys(ouiDatabase)
    expect(keys.length).toBeGreaterThanOrEqual(40)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[0-9A-F]{6}$/)
      expect(ouiDatabase[key]?.length).toBeGreaterThan(0)
    }
  })
})
