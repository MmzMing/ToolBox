import { describe, expect, it, vi } from 'vitest'

import {
  fetchPublicIp,
  ipInfoRows,
  isPlausibleIp,
  lookupIp,
} from '@/tools/network/ip-lookup/ip-lookup.service'

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
  const fixture = {
    success: true,
    ip: '8.8.8.8',
    country: 'United States',
    region: 'California',
    city: 'Mountain View',
    connection: { isp: 'Google LLC' },
    latitude: 37.386,
    longitude: -122.084,
    timezone: { id: 'America/Los_Angeles' },
  }

  it('maps the ipwho.is payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }))
    const info = await lookupIp('8.8.8.8')
    expect(info).toEqual({
      ip: '8.8.8.8',
      country: 'United States',
      region: 'California',
      city: 'Mountain View',
      isp: 'Google LLC',
      latitude: 37.386,
      longitude: -122.084,
      timezone: 'America/Los_Angeles',
    })
    vi.unstubAllGlobals()
  })

  it('throws on service failure flag and invalid input', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
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
  it('produces ordered rows and skips empty values', () => {
    const rows = ipInfoRows({
      ip: '1.1.1.1',
      country: 'Australia',
      region: '',
      city: 'Sydney',
      isp: '',
      latitude: null,
      longitude: null,
      timezone: null,
    })
    expect(rows.map((r) => r.label)).toEqual(['ip', 'country', 'city'])
  })
})
