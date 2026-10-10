import { describe, expect, it } from 'vitest'

import { nextTheme, normalizeTheme } from '@/modules/theme/theme-context'

describe('nextTheme', () => {
  it('cycles light → dark → system → light so every mode stays reachable', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })

  it('returns to the same mode after three clicks', () => {
    expect(nextTheme(nextTheme(nextTheme('system')))).toBe('system')
    expect(nextTheme(nextTheme(nextTheme('light')))).toBe('light')
  })
})

describe('normalizeTheme', () => {
  it('accepts the three stored values', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('system')).toBe('system')
  })

  it('falls back to system for a missing or tampered localStorage value', () => {
    expect(normalizeTheme(null)).toBe('system')
    expect(normalizeTheme('')).toBe('system')
    expect(normalizeTheme('neon')).toBe('system')
  })
})
