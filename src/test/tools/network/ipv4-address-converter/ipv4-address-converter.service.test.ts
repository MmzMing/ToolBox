import { describe, expect, it } from 'vitest'

import {
  convertIpv4,
  formatIpv4,
  parseIpv4,
} from '@/tools/network/ipv4-address-converter/ipv4-address-converter.service'

describe('parseIpv4', () => {
  it('converts dotted decimal to uint32', () => {
    expect(parseIpv4('192.168.1.10')).toBe(3232235786)
    expect(parseIpv4('0.0.0.0')).toBe(0)
    expect(parseIpv4('255.255.255.255')).toBe(4294967295)
  })

  it('rejects empty and invalid input', () => {
    expect(() => parseIpv4('')).toThrow(Error)
    expect(() => parseIpv4('1.2.3')).toThrow(Error)
    expect(() => parseIpv4('256.0.0.0')).toThrow(Error)
    expect(() => parseIpv4('x.y.z.w')).toThrow(Error)
  })
})

describe('formatIpv4', () => {
  it('converts uint32 back to dotted decimal', () => {
    expect(formatIpv4(3232235786)).toBe('192.168.1.10')
    expect(() => formatIpv4(-1)).toThrow(Error)
    expect(() => formatIpv4(2 ** 32)).toThrow(Error)
  })
})

describe('convertIpv4', () => {
  it('produces all representations for a common address', () => {
    expect(convertIpv4('192.168.1.10')).toEqual({
      decimal: '3232235786',
      hexadecimal: '0xC0A8010A',
      binary: '11000000.10101000.00000001.00001010',
      octal: '300.250.001.012',
      dottedHexadecimal: '0xC0.0xA8.0x01.0x0A',
    })
  })

  it('pads zero segments correctly', () => {
    const result = convertIpv4('0.0.0.1')
    expect(result.decimal).toBe('1')
    expect(result.hexadecimal).toBe('0x00000001')
    expect(result.binary).toBe('00000000.00000000.00000000.00000001')
    expect(result.octal).toBe('000.000.000.001')
    expect(result.dottedHexadecimal).toBe('0x00.0x00.0x00.0x01')
  })

  it('converts the maximum address', () => {
    const result = convertIpv4('255.255.255.255')
    expect(result.decimal).toBe('4294967295')
    expect(result.hexadecimal).toBe('0xFFFFFFFF')
    expect(result.binary).toBe('11111111.11111111.11111111.11111111')
    expect(result.octal).toBe('377.377.377.377')
    expect(result.dottedHexadecimal).toBe('0xFF.0xFF.0xFF.0xFF')
  })

  it('roundtrips decimal representation through formatIpv4', () => {
    const original = '10.0.0.138'
    expect(formatIpv4(Number(convertIpv4(original).decimal))).toBe(original)
  })

  it('rejects empty and invalid input', () => {
    expect(() => convertIpv4('')).toThrow(Error)
    expect(() => convertIpv4('999.1.1.1')).toThrow(Error)
    expect(() => convertIpv4('1.2.3')).toThrow(Error)
  })
})
