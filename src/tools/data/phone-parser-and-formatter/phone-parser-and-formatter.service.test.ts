import { describe, expect, it } from 'vitest'

import { parsePhone } from './phone-parser-and-formatter.service'

describe('parsePhone', () => {
  it('parses a Chinese mobile number in E.164 form', () => {
    const result = parsePhone('+86 138 1234 5678', 'CN')
    expect(result.valid).toBe(true)
    expect(result.e164).toBe('+8613812345678')
    expect(result.international).toBe('+86 138 1234 5678')
    expect(result.national).toBe('138 1234 5678')
    expect(result.countryCode).toBe(86)
  })

  it('parses a US number using the default country', () => {
    const result = parsePhone('(201) 555-1234', 'US')
    expect(result.valid).toBe(true)
    expect(result.e164).toBe('+12015551234')
    expect(result.countryCode).toBe(1)
    expect(result.type).toBe('FIXED_LINE_OR_MOBILE')
  })

  it('marks impossible numbers as invalid without throwing', () => {
    const result = parsePhone('12345', 'US')
    expect(result.valid).toBe(false)
    expect(result.error).toBeNull()
  })

  it('reports an error code for non-number input', () => {
    const result = parsePhone('abc', 'CN')
    expect(result.valid).toBe(false)
    expect(result.e164).toBeNull()
    expect(result.error).toBe('NOT_A_NUMBER')
  })

  it('reports an error code for mismatched country', () => {
    const result = parsePhone('+9991234567', 'CN')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('INVALID_COUNTRY')
  })

  it('returns an idle result for empty input', () => {
    expect(parsePhone('', 'CN')).toEqual({
      valid: false,
      e164: null,
      international: null,
      national: null,
      countryCode: null,
      type: null,
      error: null,
    })
  })
})
