import { describe, expect, it } from 'vitest'

import {
  parseUserAgent,
  UNKNOWN_VALUE,
  userAgentFields,
} from '@/tools/web/user-agent-parser/user-agent-parser.service'

const desktopChrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const iphoneSafari =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

describe('parseUserAgent', () => {
  it('parses a desktop Chrome user agent', () => {
    const parsed = parseUserAgent(desktopChrome)
    expect(parsed.browserName).toBe('Chrome')
    expect(parsed.browserVersion).toBe('125.0.0.0')
    expect(parsed.engineName).toBe('Blink')
    expect(parsed.osName).toBe('Windows')
    expect(parsed.osVersion).toBe('10')
    expect(parsed.cpuArchitecture).toBe('amd64')
  })

  it('parses a mobile Safari user agent with device info', () => {
    const parsed = parseUserAgent(iphoneSafari)
    expect(parsed.browserName).toBe('Mobile Safari')
    expect(parsed.osName).toBe('iOS')
    expect(parsed.osVersion).toBe('17.0')
    expect(parsed.deviceType).toBe('mobile')
    expect(parsed.deviceVendor).toBe('Apple')
    expect(parsed.deviceModel).toBe('iPhone')
  })

  it('fills missing fields with the unknown placeholder', () => {
    const parsed = parseUserAgent(desktopChrome)
    expect(parsed.deviceType).toBe(UNKNOWN_VALUE)
    expect(parsed.deviceVendor).toBe(UNKNOWN_VALUE)
    expect(parsed.deviceModel).toBe(UNKNOWN_VALUE)
  })

  it('returns placeholders for an empty user agent', () => {
    const parsed = parseUserAgent('')
    for (const field of userAgentFields) {
      expect(parsed[field]).toBe(UNKNOWN_VALUE)
    }
  })

  it('never throws on arbitrary garbage input', () => {
    expect(() => parseUserAgent('not a real user agent !!!')).not.toThrow()
    expect(parseUserAgent('not a real user agent !!!').browserName).toBe(UNKNOWN_VALUE)
  })
})

describe('userAgentFields', () => {
  it('defines a fixed unique ordered list', () => {
    expect(userAgentFields.length).toBe(10)
    expect(new Set(userAgentFields).size).toBe(userAgentFields.length)
    expect(userAgentFields[0]).toBe('browserName')
    expect(userAgentFields[userAgentFields.length - 1]).toBe('deviceModel')
  })
})
