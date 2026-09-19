import { describe, expect, it, vi } from 'vitest'

import {
  fetchPublicIp,
  formatUtcOffset,
  ipInfoRows,
  isPlausibleIp,
  locationSummary,
  lookupIp,
  mapMarkerUrl,
  type IpInfo,
} from '@/tools/web/ip-lookup/ip-lookup.service'

const baseInfo: IpInfo = {
  ip: '',
  continent: '',
  country: '',
  countryCode: '',
  region: '',
  city: '',
  postcode: '',
  latitude: null,
  longitude: null,
  capital: '',
  callingCode: '',
  isp: '',
  org: '',
  asn: '',
  domain: '',
  timezoneId: '',
  utcOffset: '',
  abbreviation: '',
  localTime: '',
}

describe('isPlausibleIp', () => {
  it('accepts ipv4 and ipv6 shapes', () => {
    expect(isPlausibleIp('8.8.8.8')).toBe(true)
    expect(isPlausibleIp('2001:db8::1')).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isPlausibleIp('not-an-ip')).toBe(false)
    expect(isPlausibleIp('')).toBe(false)
  })
})

describe('formatUtcOffset', () => {
  it('formats seconds as signed HH:MM', () => {
    expect(formatUtcOffset(28800)).toBe('+08:00')
    expect(formatUtcOffset(-25200)).toBe('-07:00')
    expect(formatUtcOffset(19800)).toBe('+05:30')
    expect(formatUtcOffset(0)).toBe('+00:00')
  })

  it('returns empty for missing or non-finite offsets', () => {
    expect(formatUtcOffset(undefined)).toBe('')
    expect(formatUtcOffset(Number.NaN)).toBe('')
  })
})

describe('fetchPublicIp', () => {
  it('returns the ip from ipify', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ip: '1.2.3.4' }) }),
    )
    expect(await fetchPublicIp()).toBe('1.2.3.4')
    vi.unstubAllGlobals()
  })

  it('throws when service responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(fetchPublicIp()).rejects.toThrowError(/503/)
    vi.unstubAllGlobals()
  })
})

describe('lookupIp', () => {
  const payload = {
    success: true,
    ip: '8.8.8.8',
    continent: 'North America',
    country: 'United States',
    country_code: 'US',
    region: 'California',
    city: 'Mountain View',
    postal_code: '94043',
    latitude: 37.386,
    longitude: -122.084,
    capital: 'Washington D.C.',
    calling_code: '1',
    connection: { isp: 'Google LLC', org: 'Google', asn: 15169, domain: 'google.com' },
    timezone: { id: 'America/Los_Angeles', abbr: 'PDT', utc: '-07:00', offset: -25200 },
  }

  it('maps the full ipwho.is payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
    expect(await lookupIp('8.8.8.8')).toEqual({
      ...baseInfo,
      ip: '8.8.8.8',
      continent: 'North America',
      country: 'United States',
      countryCode: 'US',
      region: 'California',
      city: 'Mountain View',
      postcode: '94043',
      latitude: 37.386,
      longitude: -122.084,
      capital: 'Washington D.C.',
      callingCode: '1',
      isp: 'Google LLC',
      org: 'Google',
      asn: 'AS15169',
      domain: 'google.com',
      timezoneId: 'America/Los_Angeles',
      utcOffset: '-07:00',
      abbreviation: 'PDT',
    })
    vi.unstubAllGlobals()
  })

  it('falls back to numeric offset and keeps the queried ip when response omits it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, timezone: { offset: 28800 } }),
      }),
    )
    const info = await lookupIp('1.1.1.1')
    expect(info.ip).toBe('1.1.1.1')
    expect(info.utcOffset).toBe('+08:00')
    vi.unstubAllGlobals()
  })

  it('throws on service failure flag and invalid input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, message: 'reserved range' }),
      }),
    )
    await expect(lookupIp('8.8.8.8')).rejects.toThrowError(/reserved range/)
    vi.unstubAllGlobals()
    await expect(lookupIp('nope')).rejects.toThrowError(/Invalid IP/)
  })
})

describe('ipInfoRows', () => {
  it('orders rows like the result grid and skips empty values', () => {
    const rows = ipInfoRows({
      ...baseInfo,
      country: 'Australia',
      city: 'Sydney',
      latitude: -33.87,
      longitude: 151.21,
    })
    expect(rows.map((row) => row.label)).toEqual(['country', 'city', 'coordinates'])
    expect(rows[2]?.value).toBe('-33.87, 151.21')
  })
})

describe('locationSummary', () => {
  it('joins the available location parts', () => {
    expect(locationSummary({ ...baseInfo, country: '中国', city: '广州' })).toBe('中国 · 广州')
    expect(locationSummary(baseInfo)).toBe('')
  })
})

describe('mapMarkerUrl', () => {
  it('builds an amap marker uri with longitude first', () => {
    const url = mapMarkerUrl({ ...baseInfo, country: 'China', latitude: 23.1, longitude: 113.2 })
    expect(url).toBe(
      'https://uri.amap.com/marker?position=113.2%2C23.1&name=China&coordinate=wgs84',
    )
  })

  it('returns null without coordinates', () => {
    expect(mapMarkerUrl({ ...baseInfo, latitude: 1 })).toBeNull()
  })
})
