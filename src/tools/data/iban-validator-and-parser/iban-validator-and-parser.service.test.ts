import { describe, expect, it } from 'vitest'

import { parseIban } from './iban-validator-and-parser.service'

describe('parseIban', () => {
  it('validates and splits a German IBAN', () => {
    expect(parseIban('DE89370400440532013000')).toEqual({
      valid: true,
      countryCode: 'DE',
      checkDigits: '89',
      bban: '370400440532013000',
      formatted: 'DE89 3704 0044 0532 0130 00',
    })
  })

  it('validates a French IBAN with alphanumeric BBAN', () => {
    const result = parseIban('FR1420041010050500013M02606')
    expect(result.valid).toBe(true)
    expect(result.countryCode).toBe('FR')
    expect(result.checkDigits).toBe('14')
  })

  it('normalizes lowercase and spaced input', () => {
    const result = parseIban('de89 3704 0044 0532 0130 00')
    expect(result.valid).toBe(true)
    expect(result.formatted).toBe('DE89 3704 0044 0532 0130 00')
  })

  it('rejects a wrong check digit but keeps the structure fields', () => {
    const result = parseIban('DE89370400440532013001')
    expect(result.valid).toBe(false)
    expect(result.countryCode).toBe('DE')
    expect(result.checkDigits).toBe('89')
    expect(result.bban).toBe('370400440532013001')
  })

  it('returns all-null fields for empty input', () => {
    expect(parseIban('')).toEqual({
      valid: false,
      countryCode: null,
      checkDigits: null,
      bban: null,
      formatted: null,
    })
  })

  it('returns all-null fields for garbage input', () => {
    expect(parseIban('hello world')).toEqual({
      valid: false,
      countryCode: null,
      checkDigits: null,
      bban: null,
      formatted: null,
    })
  })
})
