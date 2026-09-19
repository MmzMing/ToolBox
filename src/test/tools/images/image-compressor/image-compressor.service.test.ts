import { describe, expect, it } from 'vitest'

import {
  formatFileSize,
  outputFileName,
  percentSaved,
} from '@/tools/images/image-compressor/service'
import {
  DefaultCompressOption,
  normalizeCompressOption,
} from '@/tools/images/image-compressor/options'

describe('formatFileSize', () => {
  it('formats bytes into human readable text', () => {
    expect(formatFileSize(0)).toBeTruthy()
    expect(formatFileSize(512)).toMatch(/B$/)
    expect(formatFileSize(1024 * 1024)).toMatch(/MiB$/)
  })
})

describe('percentSaved', () => {
  it('computes positive savings', () => {
    expect(percentSaved(1000, 250)).toBe(75)
  })

  it('returns negative when output is larger', () => {
    expect(percentSaved(100, 150)).toBe(-50)
  })

  it('guards against zero origin', () => {
    expect(percentSaved(0, 100)).toBe(0)
  })
})

describe('outputFileName', () => {
  it('keeps the name when target is undefined', () => {
    expect(outputFileName('photo.heic')).toBe('photo.heic')
  })

  it('swaps the extension for the target format', () => {
    expect(outputFileName('photo.heic', 'jpg')).toBe('photo.jpg')
    expect(outputFileName('archive.tar.gz', 'webp')).toBe('archive.tar.webp')
  })
})

describe('normalizeCompressOption', () => {
  it('returns defaults for garbage input', () => {
    const option = normalizeCompressOption('not-an-object')
    expect(option).toEqual(DefaultCompressOption)
  })

  it('clamps quality and colors into valid ranges', () => {
    const option = normalizeCompressOption({
      jpeg: { quality: 5, extreme: 'yes' },
      png: { colors: 9999, dithering: -3 },
      avif: { quality: 0, speed: 99 },
    })
    expect(option.jpeg.quality).toBe(1)
    expect(option.jpeg.extreme).toBe(false)
    expect(option.png.colors).toBe(256)
    expect(option.png.dithering).toBe(0)
    expect(option.avif.quality).toBe(1)
    expect(option.avif.speed).toBe(10)
  })

  it('keeps a valid hex transparent fill and drops invalid ones', () => {
    const option = normalizeCompressOption({ format: { transparentFill: '#00ff00' } })
    expect(option.format.transparentFill).toBe('#00FF00')
    const bad = normalizeCompressOption({ format: { transparentFill: 'red' } })
    expect(bad.format.transparentFill).toBe('#FFFFFF')
  })

  it('rejects unknown resize methods and paper sizes', () => {
    const option = normalizeCompressOption({
      resize: { method: 'hack', presetCrop: { paperSize: 'X' } },
    })
    expect(option.resize.method).toBeUndefined()
    expect(option.resize.presetCrop?.paperSize).toBe('a4')
  })
})
