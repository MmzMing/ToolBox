import { describe, expect, it } from 'vitest'

import {
  toNumeronym,
  toNumeronyms,
} from '@/tools/text/numeronym-generator/numeronym-generator.service'

describe('toNumeronym', () => {
  it('converts classic examples', () => {
    expect(toNumeronym('internationalization')).toBe('i18n')
    expect(toNumeronym('localization')).toBe('l10n')
    expect(toNumeronym('accessibility')).toBe('a11y')
    expect(toNumeronym('Kubernetes')).toBe('K8s')
  })

  it('keeps short words as-is', () => {
    expect(toNumeronym('go')).toBe('go')
    expect(toNumeronym('abc')).toBe('abc')
    expect(toNumeronym('abcd')).toBe('a2d')
  })

  it('trims surrounding whitespace', () => {
    expect(toNumeronym('  internationalization ')).toBe('i18n')
  })

  it('handles empty input', () => {
    expect(toNumeronym('')).toBe('')
  })
})

describe('toNumeronyms', () => {
  it('splits on spaces and newlines and keeps order', () => {
    expect(toNumeronyms('internationalization\nlocalization go')).toEqual([
      { word: 'internationalization', numeronym: 'i18n' },
      { word: 'localization', numeronym: 'l10n' },
      { word: 'go', numeronym: 'go' },
    ])
  })

  it('returns empty list for blank input', () => {
    expect(toNumeronyms('')).toEqual([])
    expect(toNumeronyms('  \n\t ')).toEqual([])
  })
})
