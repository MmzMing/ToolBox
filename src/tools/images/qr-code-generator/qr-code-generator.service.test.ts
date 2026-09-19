import { describe, expect, it } from 'vitest'

import {
  generateQrDataUrl,
  generateQrSvg,
  qrErrorCorrectionLevels,
  type QrCodeStyleOptions,
} from './qr-code-generator.service'

const baseOptions: QrCodeStyleOptions = {
  errorCorrectionLevel: 'M',
  width: 256,
  margin: 2,
  darkColor: '#000000',
  lightColor: '#ffffff',
}

describe('generateQrDataUrl', () => {
  it('returns a png data url', async () => {
    const dataUrl = await generateQrDataUrl('https://example.com', baseOptions)
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('produces different output for different error correction levels', async () => {
    const low = await generateQrDataUrl('hello', { ...baseOptions, errorCorrectionLevel: 'L' })
    const high = await generateQrDataUrl('hello', { ...baseOptions, errorCorrectionLevel: 'H' })
    expect(low).not.toBe(high)
  })

  it('supports custom colors', async () => {
    const dataUrl = await generateQrDataUrl('hello', {
      ...baseOptions,
      darkColor: '#ff0000',
      lightColor: '#0000ff',
    })
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('throws on empty text', async () => {
    await expect(generateQrDataUrl('', baseOptions)).rejects.toThrow(Error)
  })

  it('accepts every error correction level', async () => {
    for (const level of qrErrorCorrectionLevels) {
      const dataUrl = await generateQrDataUrl('hello', {
        ...baseOptions,
        errorCorrectionLevel: level,
      })
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    }
  })
})

describe('generateQrSvg', () => {
  it('returns an svg string', async () => {
    const svg = await generateQrSvg('https://example.com', baseOptions)
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })

  it('throws on empty text', async () => {
    await expect(generateQrSvg('', baseOptions)).rejects.toThrow(Error)
  })
})
