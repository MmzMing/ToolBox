import { describe, expect, it } from 'vitest'

import {
  deviceInfoFields,
  getDeviceInfo,
  toDisplayValue,
  UNKNOWN_VALUE,
} from './device-information.service'

describe('deviceInfoFields', () => {
  it('exposes a fixed field order', () => {
    expect(deviceInfoFields).toEqual([
      'userAgent',
      'platform',
      'language',
      'screenResolution',
      'screenColorDepth',
      'viewport',
      'pixelRatio',
      'cpuCores',
      'memory',
      'online',
      'timezone',
    ])
  })
})

describe('toDisplayValue', () => {
  it('falls back to unknown for missing values', () => {
    expect(toDisplayValue(null)).toBe(UNKNOWN_VALUE)
    expect(toDisplayValue(undefined)).toBe(UNKNOWN_VALUE)
    expect(toDisplayValue('')).toBe(UNKNOWN_VALUE)
  })

  it('stringifies available values', () => {
    expect(toDisplayValue(24)).toBe('24')
    expect(toDisplayValue(0)).toBe('0')
    expect(toDisplayValue('online')).toBe('online')
  })
})

describe('getDeviceInfo', () => {
  it('returns every fixed field (unavailable ones become unknown in node)', () => {
    const info = getDeviceInfo()
    expect(Object.keys(info)).toEqual([...deviceInfoFields])
    for (const field of deviceInfoFields) {
      expect(typeof info[field]).toBe('string')
      expect(info[field].length).toBeGreaterThan(0)
    }
  })
})
