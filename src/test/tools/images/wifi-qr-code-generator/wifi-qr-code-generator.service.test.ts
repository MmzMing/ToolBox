import { describe, expect, it } from 'vitest'

import {
  buildWifiString,
  escapeWifiValue,
  generateWifiQrDataUrl,
} from '@/tools/images/wifi-qr-code-generator/wifi-qr-code-generator.service'

describe('escapeWifiValue', () => {
  it('escapes backslash first and keeps order stable', () => {
    expect(escapeWifiValue('a\\b')).toBe('a\\\\b')
  })

  it('escapes ; , : and double quote', () => {
    expect(escapeWifiValue('a;b,c:d"e')).toBe('a\\;b\\,c\\:d\\"e')
  })

  it('leaves ordinary characters untouched', () => {
    expect(escapeWifiValue('My Network-01')).toBe('My Network-01')
  })

  it('handles empty input', () => {
    expect(escapeWifiValue('')).toBe('')
  })
})

describe('buildWifiString', () => {
  it('builds a WPA string with password', () => {
    expect(
      buildWifiString({ ssid: 'home', password: 'pass123', encryption: 'WPA', hidden: false }),
    ).toBe('WIFI:T:WPA;S:home;P:pass123;;')
  })

  it('builds a WEP string', () => {
    expect(
      buildWifiString({ ssid: 'office', password: 'abcde', encryption: 'WEP', hidden: false }),
    ).toBe('WIFI:T:WEP;S:office;P:abcde;;')
  })

  it('omits the P field for nopass networks', () => {
    expect(
      buildWifiString({ ssid: 'cafe', password: '', encryption: 'nopass', hidden: false }),
    ).toBe('WIFI:T:nopass;S:cafe;;')
  })

  it('appends H:true for hidden networks', () => {
    expect(
      buildWifiString({ ssid: 'home', password: 'pass123', encryption: 'WPA', hidden: true }),
    ).toBe('WIFI:T:WPA;S:home;P:pass123;H:true;;')
  })

  it('escapes special characters in ssid and password', () => {
    expect(
      buildWifiString({ ssid: 'a;b,c:d"e\\f', password: 'p;1', encryption: 'WPA', hidden: false }),
    ).toBe('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;1;;')
  })

  it('throws on empty ssid', () => {
    expect(() =>
      buildWifiString({ ssid: '', password: '', encryption: 'WPA', hidden: false }),
    ).toThrow(Error)
  })
})

describe('generateWifiQrDataUrl', () => {
  it('returns a png data url', async () => {
    const dataUrl = await generateWifiQrDataUrl('WIFI:T:WPA;S:home;P:pass123;;')
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('throws on empty text', async () => {
    await expect(generateWifiQrDataUrl('')).rejects.toThrow(Error)
  })
})
