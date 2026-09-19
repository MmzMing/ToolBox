import { describe, expect, it } from 'vitest'

import { buildKeyInfo, commonKeys, modifierKeys } from './keycode-info.service'

describe('buildKeyInfo', () => {
  it('maps a plain key event', () => {
    expect(buildKeyInfo({ key: 'a', code: 'KeyA', keyCode: 65 })).toEqual({
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      modifiers: [],
    })
  })

  it('collects pressed modifiers in a stable order', () => {
    const info = buildKeyInfo({
      key: 'A',
      code: 'KeyA',
      keyCode: 65,
      shiftKey: true,
      ctrlKey: true,
      altKey: true,
      metaKey: true,
    })
    expect(info.modifiers).toEqual(['alt', 'ctrl', 'meta', 'shift'])
    expect(info.key).toBe('A')
  })

  it('keeps modifier order stable regardless of input order', () => {
    const info = buildKeyInfo({ key: 'Tab', code: 'Tab', shiftKey: true, metaKey: true })
    expect(info.modifiers).toEqual(['meta', 'shift'])
  })

  it('falls back to -1 when keyCode is missing', () => {
    expect(buildKeyInfo({ key: 'Enter', code: 'Enter' }).keyCode).toBe(-1)
  })

  it('treats falsy flags as not pressed', () => {
    const info = buildKeyInfo({ key: 'x', code: 'KeyX', ctrlKey: false, shiftKey: false })
    expect(info.modifiers).toEqual([])
  })
})

describe('commonKeys', () => {
  it('contains at least 20 well-formed rows', () => {
    expect(commonKeys.length).toBeGreaterThanOrEqual(20)
    for (const entry of commonKeys) {
      expect(typeof entry.key).toBe('string')
      expect(entry.code).toMatch(/^[A-Za-z0-9]+$/)
      expect(Number.isInteger(entry.keyCode)).toBe(true)
      expect(entry.keyCode).toBeGreaterThan(0)
    }
  })

  it('has unique codes', () => {
    const codes = commonKeys.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('matches the traditional keyCode values', () => {
    const byCode = new Map(commonKeys.map((entry) => [entry.code, entry.keyCode]))
    expect(byCode.get('Enter')).toBe(13)
    expect(byCode.get('Space')).toBe(32)
    expect(byCode.get('Escape')).toBe(27)
    expect(byCode.get('ArrowUp')).toBe(38)
    expect(byCode.get('KeyA')).toBe(65)
    expect(byCode.get('Digit1')).toBe(49)
    expect(byCode.get('ShiftLeft')).toBe(16)
    expect(byCode.get('F5')).toBe(116)
  })

  it('exposes a stable modifier key list', () => {
    expect(modifierKeys).toEqual(['alt', 'ctrl', 'meta', 'shift'])
  })
})
