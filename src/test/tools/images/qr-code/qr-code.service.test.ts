import { describe, expect, it } from 'vitest'

import QRCode from 'qrcode'

import {
  decodeQrFromPixels,
  generateQrDataUrl,
  generateQrSvg,
  qrErrorCorrectionLevels,
  type QrCodeStyleOptions,
} from '@/tools/images/qr-code/qr-code.service'

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

/**
 * 把二维码位矩阵铺成 RGBA 像素（模块放大 scale 倍 + 静区），
 * 让解码可以在没有 canvas 的 node 环境里跑真实数据。
 */
function renderQrPixels(text: string, scale = 4, quietZone = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const side = (modules.size + quietZone * 2) * scale
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255)
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.data[row * modules.size + col] !== 1) {
        continue
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const offset =
            ((row + quietZone) * scale + dy) * side * 4 + ((col + quietZone) * scale + dx) * 4
          pixels[offset] = 0
          pixels[offset + 1] = 0
          pixels[offset + 2] = 0
        }
      }
    }
  }
  return { pixels, side }
}

describe('decodeQrFromPixels', () => {
  it('reads back the text encoded in a generated QR code', () => {
    const { pixels, side } = renderQrPixels('https://example.com')
    expect(decodeQrFromPixels(pixels, side, side)).toBe('https://example.com')
  })

  it('reads back non-ascii payloads', () => {
    const { pixels, side } = renderQrPixels('二维码工具')
    expect(decodeQrFromPixels(pixels, side, side)).toBe('二维码工具')
  })

  it('returns null when the image holds no QR code', () => {
    const side = 120
    expect(decodeQrFromPixels(new Uint8ClampedArray(side * side * 4).fill(255), side, side)).toBe(
      null,
    )
  })

  it('throws when the pixel buffer does not match the dimensions', () => {
    expect(() => decodeQrFromPixels(new Uint8ClampedArray(4 * 4 * 3), 4, 4)).toThrow(Error)
  })
})
