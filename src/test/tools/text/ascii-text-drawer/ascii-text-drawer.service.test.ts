import { describe, expect, it } from 'vitest'

import { availableFonts, drawAscii } from '@/tools/text/ascii-text-drawer/ascii-text-drawer.service'

describe('drawAscii', () => {
  it('draws multi-line ASCII art for HI with the Standard font', async () => {
    const result = await drawAscii('HI', 'Standard')
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(result).toMatch(/_/)
    expect(result).toMatch(/\|/)
  })

  it('supports every available font', async () => {
    for (const font of availableFonts) {
      const result = await drawAscii('OK', font)
      expect(result.split('\n').length).toBeGreaterThan(1)
    }
  })

  it('is deterministic for the same input', async () => {
    expect(await drawAscii('HI', 'Small')).toBe(await drawAscii('HI', 'Small'))
  })

  it('rejects empty text', async () => {
    await expect(drawAscii('', 'Standard')).rejects.toThrow(/empty/)
    await expect(drawAscii('   ', 'Standard')).rejects.toThrow(/empty/)
  })

  it('rejects unknown fonts', async () => {
    await expect(drawAscii('HI', 'Ghost')).rejects.toThrow(/Unsupported font/)
  })

  it('rejects non-printable or non-ASCII characters', async () => {
    await expect(drawAscii('中文', 'Standard')).rejects.toThrow(/printable/)
    await expect(drawAscii('a\tb', 'Standard')).rejects.toThrow(/printable/)
  })
})
