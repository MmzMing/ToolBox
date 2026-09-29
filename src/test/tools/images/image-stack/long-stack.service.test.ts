import { describe, expect, it } from 'vitest'

import {
  blurRadiusOf,
  buildLongFileName,
  buildLongSegmentName,
  buildLongZipName,
  captionAnchor,
  captionText,
  DEFAULT_LONG_CAPTION,
  DEFAULT_LONG_CROP,
  DEFAULT_LONG_STYLE,
  isLongPreset,
  longCropOfPreset,
  longFillBox,
  LONG_ZOOM_MAX,
  LONG_ZOOM_MIN,
  MAX_LONG_ITEMS,
  MAX_LONG_WIDTH,
  MAX_SHADOW_OFFSET,
  MAX_SHADOW_OPACITY,
  MAX_STACK_OVERLAP,
  MIN_KEEP_BOTTOM_PERCENT,
  normalizeLongCrop,
  normalizeLongStyle,
  normalizeLongZoom,
  resolveLongCrop,
  resolveLongLayout,
  resolveTargetWidth,
  segmentHeightOf,
  shadowAlpha,
  type LongBand,
  type LongCrop,
  type LongSource,
  type LongStyle,
} from '@/tools/images/image-stack/long-stack.service'
import { MAX_CANVAS_AREA } from '@/tools/images/image-stack/image-stack.service'

function style(patch: Partial<LongStyle> = {}): LongStyle {
  return { ...DEFAULT_LONG_STYLE, ...patch }
}

function crop(patch: Partial<LongCrop> = {}): LongCrop {
  return { ...DEFAULT_LONG_CROP, ...patch }
}

function source(
  imageId: string,
  width: number,
  height: number,
  override: LongCrop | null = null,
): LongSource {
  return { imageId, width, height, crop: override }
}

const TALL = source('a', 1080, 1000)
const TALLER = source('b', 1080, 2000)

describe('resolveTargetWidth', () => {
  it('takes the narrowest source by default so nothing gets upscaled', () => {
    const sources = [source('a', 1080, 1920), source('b', 320, 2000)]
    expect(resolveTargetWidth(sources, style({ widthMode: 'narrowest' }))).toBe(320)
    expect(resolveTargetWidth(sources, style({ widthMode: 'widest' }))).toBe(1080)
    expect(resolveTargetWidth(sources, style({ widthMode: 'first' }))).toBe(1080)
  })

  it('uses the custom width but keeps it inside the legal band', () => {
    expect(resolveTargetWidth([], style({ widthMode: 'custom', targetWidth: 900 }))).toBe(900)
    expect(resolveTargetWidth([], style({ widthMode: 'custom', targetWidth: 1e9 }))).toBe(
      MAX_LONG_WIDTH,
    )
  })

  it('has no width to derive from when there are no usable sources', () => {
    expect(resolveTargetWidth([], style())).toBeNull()
    expect(resolveTargetWidth([source('a', 0, 100)], style())).toBeNull()
  })
})

describe('resolveLongCrop', () => {
  it('inherits both channels when the item has no override', () => {
    const defaults = crop({ keepBottomPercent: 12, trimTopPx: 30 })
    expect(resolveLongCrop(null, defaults)).toEqual(defaults)
  })

  it('keeps the default for whichever channel the override leaves unusable', () => {
    const defaults = crop({ keepBottomPercent: 12, trimTopPx: 30 })
    const merged = resolveLongCrop({ keepBottomPercent: 40, trimTopPx: Number.NaN }, defaults)
    expect(merged).toEqual({ keepBottomPercent: 40, trimTopPx: 30 })
  })

  it('never returns a percent outside zero to one hundred', () => {
    const defaults = crop()
    expect(resolveLongCrop(crop({ keepBottomPercent: 150 }), defaults).keepBottomPercent).toBe(100)
    expect(resolveLongCrop(crop({ keepBottomPercent: -20 }), defaults).keepBottomPercent).toBe(0)
  })

  it('does not mutate the defaults it inherits from', () => {
    const defaults = crop({ keepBottomPercent: 12 })
    const merged = resolveLongCrop(crop({ keepBottomPercent: 40 }), defaults)
    merged.keepBottomPercent = 80
    expect(defaults.keepBottomPercent).toBe(12)
  })
})

describe('resolveLongLayout', () => {
  it('stacks two same-width images end to end', () => {
    const layout = resolveLongLayout([TALL, TALLER], style(), crop())
    expect(layout.width).toBe(1080)
    expect(layout.height).toBe(3000)
    expect(layout.bands[0]?.rect).toEqual({ x: 0, y: 0, width: 1080, height: 1000 })
    expect(layout.bands[1]?.rect).toEqual({ x: 0, y: 1000, width: 1080, height: 2000 })
  })

  it('leaves no hole and no overlap between neighbouring bands', () => {
    const layout = resolveLongLayout(
      [source('a', 1080, 1000), source('b', 1080, 1337), source('c', 1080, 777)],
      style(),
      crop(),
    )
    layout.bands.forEach((band, index) => {
      if (index === 0) {
        return
      }
      const previous = layout.bands[index - 1]
      expect(band.rect.y).toBe(previous.rect.y + previous.rect.height)
    })
    const last = layout.bands[layout.bands.length - 1]
    expect(last.rect.y + last.rect.height).toBe(layout.height)
  })

  it('adds the gap between bands but not around them', () => {
    const layout = resolveLongLayout([TALL, TALLER], style({ gap: 10 }), crop())
    expect(layout.bands[1]?.rect.y).toBe(1010)
    expect(layout.height).toBe(3010)
  })

  it('anchors a subtitle band on the bottom of its source', () => {
    const layout = resolveLongLayout([TALL, TALLER], style(), crop({ keepBottomPercent: 12 }))
    expect(layout.bands[0]).toMatchObject({ sourceTop: 0, sourceHeight: 1000 })
    expect(layout.bands[1]).toMatchObject({ sourceTop: 1760, sourceHeight: 240 })
    expect(layout.height).toBe(1240)
  })

  it('always shows the first image whole even when subtitles ask for a sliver', () => {
    const layout = resolveLongLayout(
      [source('a', 1080, 1000), source('b', 1080, 1000)],
      style(),
      crop({ keepBottomPercent: MIN_KEEP_BOTTOM_PERCENT }),
    )
    expect(layout.bands[0]).toMatchObject({ sourceTop: 0, sourceHeight: 1000 })
    expect(layout.bands[1]).toMatchObject({ sourceTop: 950, sourceHeight: 50 })
  })

  it('lets overlap trimming cut deeper but never shallower than the creative crop', () => {
    const trimmed = resolveLongLayout([TALL, TALLER], style(), crop({ trimTopPx: 150 }))
    expect(trimmed.bands[1]).toMatchObject({ sourceTop: 150, sourceHeight: 1850 })

    const both = resolveLongLayout(
      [TALL, TALLER],
      style(),
      crop({ keepBottomPercent: 12, trimTopPx: 150 }),
    )
    expect(both.bands[1]).toMatchObject({ sourceTop: 1910, sourceHeight: 90 })
  })

  it('clamps trimming that would eat the whole band', () => {
    const layout = resolveLongLayout(
      [TALL, TALLER],
      style(),
      crop({ keepBottomPercent: 12, trimTopPx: 99_999 }),
    )
    const band = layout.bands[1]
    expect(band.sourceHeight).toBeGreaterThan(0)
    expect(band.sourceTop + band.sourceHeight).toBe(2000)
  })

  it('scales to the target width and never enlarges a narrow source', () => {
    const sources = [source('a', 1080, 1920), source('b', 320, 2000)]
    const widest = resolveLongLayout(sources, style({ widthMode: 'widest' }), crop())
    expect(widest.width).toBe(1080)
    expect(widest.bands[1]).toMatchObject({ scale: 1, rect: { x: 380, width: 320, height: 2000 } })
    expect(widest.height).toBe(3920)

    const narrowest = resolveLongLayout(sources, style({ widthMode: 'narrowest' }), crop())
    expect(narrowest.width).toBe(320)
    expect(narrowest.bands[0]?.rect).toMatchObject({ width: 320, height: 569 })
    expect(narrowest.height).toBe(2569)
  })

  it('honours the alignment choice for a band narrower than the canvas', () => {
    const sources = [source('a', 1080, 100), source('b', 320, 100)]
    const offset = style({ widthMode: 'widest' })
    expect(resolveLongLayout(sources, { ...offset, align: 'left' }, crop()).bands[1]?.rect.x).toBe(
      0,
    )
    expect(resolveLongLayout(sources, { ...offset, align: 'right' }, crop()).bands[1]?.rect.x).toBe(
      760,
    )
    expect(
      resolveLongLayout(sources, { ...offset, align: 'center' }, crop()).bands[1]?.rect.x,
    ).toBe(380)
  })

  it('refuses to let padding eat the canvas width', () => {
    const layout = resolveLongLayout(
      [source('a', 1080, 1000)],
      style({ widthMode: 'custom', targetWidth: 64, padding: 400 }),
      crop(),
    )
    const band = layout.bands[0]
    expect(band.rect.x).toBe(24)
    expect(band.rect.width).toBe(16)
    expect(band.rect.x + band.rect.width).toBeLessThanOrEqual(layout.width)
  })

  it('produces an empty layout instead of throwing when there is nothing to stack', () => {
    const layout = resolveLongLayout([], style(), crop())
    expect(layout).toMatchObject({ width: 0, height: 0, bands: [], segments: [] })
    expect(resolveLongLayout([TALL], style(), crop()).height).toBe(1000)
  })

  it('stops at the item cap and says so through the layout length', () => {
    const many = Array.from({ length: MAX_LONG_ITEMS + 5 }, (_, index) =>
      source(`i${index}`, 100, 100),
    )
    expect(resolveLongLayout(many, style(), crop()).bands).toHaveLength(MAX_LONG_ITEMS)
  })
})

describe('segmentHeightOf', () => {
  it('is bounded by the total area long before the side cap at phone widths', () => {
    expect(segmentHeightOf(1080)).toBe(Math.floor(16_777_216 / 1080))
    expect(segmentHeightOf(MAX_LONG_WIDTH)).toBe(16_777_216 / MAX_LONG_WIDTH)
  })

  it('survives garbage widths without going zero or NaN', () => {
    expect(segmentHeightOf(0)).toBeGreaterThan(0)
    expect(segmentHeightOf(Number.NaN)).toBeGreaterThan(0)
    expect(segmentHeightOf(-500)).toBeGreaterThan(0)
  })

  it('falls back to the grid limits when none are given', () => {
    expect(segmentHeightOf(1024, { side: 8192, area: MAX_CANVAS_AREA })).toBe(8192)
  })
})

describe('resolveLongLayout segments', () => {
  const limits = { side: 5000, area: 1_000_000_000 }

  function stack(count: number) {
    return resolveLongLayout(
      Array.from({ length: count }, (_, index) => source(`i${index}`, 200, 1000)),
      style({ widthMode: 'custom', targetWidth: 200 }),
      crop(),
      limits,
    )
  }

  it('keeps a single segment while the stack still fits', () => {
    const layout = stack(5)
    expect(layout.maxSegmentHeight).toBe(5000)
    expect(layout.segments).toHaveLength(1)
    expect(layout.segments[0]).toEqual({ x: 0, y: 0, width: 200, height: 5000 })
    expect(layout.unsplittable).toEqual([])
  })

  it('cuts on a band boundary and keeps the segment heights summing to the whole', () => {
    const layout = stack(6)
    expect(layout.segments).toHaveLength(2)
    expect(layout.segments.map((segment) => segment.height)).toEqual([5000, 1000])
    expect(layout.segments.reduce((sum, segment) => sum + segment.height, 0)).toBe(layout.height)
    const bandTops = new Set(layout.bands.map((band) => band.rect.y))
    layout.segments.slice(1).forEach((segment) => {
      expect(bandTops.has(segment.y)).toBe(true)
    })
  })

  it('reports a band that no cut can save', () => {
    const layout = resolveLongLayout(
      [source('huge', 200, 9000), source('small', 200, 100)],
      style({ widthMode: 'custom', targetWidth: 200 }),
      crop(),
      limits,
    )
    expect(layout.unsplittable).toEqual(['huge'])
    expect(layout.segments.reduce((sum, segment) => sum + segment.height, 0)).toBe(layout.height)
  })

  it('segments the empty layout as nothing rather than one zero-height piece', () => {
    expect(resolveLongLayout([], style(), crop(), limits).segments).toEqual([])
  })
})

describe('presets', () => {
  it('maps the subtitle preset onto a bottom band and nothing else', () => {
    expect(longCropOfPreset('subtitle').keepBottomPercent).toBe(12)
    expect(longCropOfPreset('subtitle').trimTopPx).toBe(0)
    expect(longCropOfPreset('seamless').keepBottomPercent).toBe(100)
  })

  it('rejects preset ids that are not in the table', () => {
    expect(isLongPreset('subtitle')).toBe(true)
    expect(isLongPreset('nope')).toBe(false)
  })
})

describe('naming', () => {
  it('numbers segments against their total so the order survives a download folder', () => {
    expect(buildLongSegmentName(0, 3, 'png')).toBe('long-image-01-of-03.png')
    expect(buildLongSegmentName(11, 12, 'jpeg')).toBe('long-image-12-of-12.jpg')
    expect(buildLongSegmentName(0, 1, 'webp')).toBe('long-image-01-of-01.webp')
  })

  it('stamps the single export and falls back when the zip prefix is unusable', () => {
    expect(buildLongFileName('png', Date.UTC(2026, 8, 29))).toBe(
      'image-stack-long-2026-09-29T00-00-00.png',
    )
    expect(buildLongZipName('///')).toBe('long-image-segments.zip')
    expect(buildLongZipName('chat log')).toBe('chat log-segments.zip')
    expect(buildLongZipName()).toBe('long-image-segments.zip')
  })
})

describe('normalizeLongZoom', () => {
  it('keeps the zoom inside its band and falls back for garbage', () => {
    expect(normalizeLongZoom(2.5)).toBe(2.5)
    expect(normalizeLongZoom(0.2)).toBe(LONG_ZOOM_MIN)
    expect(normalizeLongZoom(99)).toBe(LONG_ZOOM_MAX)
    expect(normalizeLongZoom('2')).toBe(LONG_ZOOM_MIN)
    expect(normalizeLongZoom(undefined)).toBe(LONG_ZOOM_MIN)
  })
})

describe('stackOverlap', () => {
  it('pulls each band up over the previous one and shortens the canvas', () => {
    const plain = resolveLongLayout([TALL, TALLER], style(), crop())
    const stacked = resolveLongLayout([TALL, TALLER], style({ stackOverlap: 300 }), crop())
    expect(plain.bands[1]?.rect.y).toBe(1000)
    expect(stacked.bands[1]?.rect.y).toBe(700)
    expect(stacked.height).toBe(plain.height - 300)
  })

  it('never lets a band bury the one before it', () => {
    // 上叠再大也只推到上一条上沿的下一行：再多一条带就完全白画了，
    // 而且 y 一旦反向，分段与导出都会算错
    const layout = resolveLongLayout(
      [source('a', 1080, 200), source('b', 1080, 2000)],
      style({ stackOverlap: 1000 }),
      crop(),
    )
    expect(layout.bands[1]?.rect.y).toBe(1)
    expect(layout.bands[1]?.rect.height).toBe(2000)
    expect(layout.height).toBe(2001)
    layout.bands.forEach((band, index) => {
      if (index === 0) {
        return
      }
      const previous = layout.bands[index - 1]
      expect(band.rect.y).toBeGreaterThan(previous.rect.y)
    })
  })

  it('still keeps the segments summing to the whole canvas', () => {
    const layout = resolveLongLayout(
      Array.from({ length: 6 }, (_, index) => source(`i${index}`, 200, 1000)),
      style({ widthMode: 'custom', targetWidth: 200, stackOverlap: 250 }),
      crop(),
      { side: 5000, area: 1_000_000_000 },
    )
    expect(layout.segments.reduce((sum, s) => sum + s.height, 0)).toBe(layout.height)
  })
})

describe('longFillBox', () => {
  it('appears only when the band is narrower than the content area', () => {
    const layout = resolveLongLayout(
      [source('wide', 1588, 1000), source('narrow', 320, 1000)],
      style({ widthMode: 'widest' }),
      crop(),
    )
    expect(longFillBox(layout.bands[0], layout)).toBeNull()
    expect(longFillBox(layout.bands[1], layout)).toMatchObject({ x: 0, width: 1588 })
  })

  it('spans the content area, not the whole canvas, when there is padding', () => {
    const layout = resolveLongLayout(
      [source('wide', 1588, 1000), source('narrow', 320, 1000)],
      style({ widthMode: 'widest', padding: 40 }),
      crop(),
    )
    expect(longFillBox(layout.bands[1], layout)).toMatchObject({ x: 40, width: 1588 - 80 })
  })
})

describe('caption helpers', () => {
  it('fills the three placeholders and drops the file extension', () => {
    expect(captionText('{n}/{total}', 0, 8, 'a.png')).toBe('1/8')
    expect(captionText('{name}', 2, 3, 'shot-b.jpeg')).toBe('shot-b')
    expect(captionText('© {name} {n}', 4, 5, 'x.webp')).toBe('© x 5')
  })

  it('anchors each corner from the band rect and the inset', () => {
    const band: LongBand = {
      imageId: 'a',
      rect: { x: 0, y: 100, width: 1080, height: 500 },
      sourceTop: 0,
      sourceHeight: 500,
      sourceImageHeight: 500,
      scale: 1,
    }
    const base = DEFAULT_LONG_CAPTION
    expect(captionAnchor(band, { ...base, place: 'tl', inset: 20 })).toEqual({
      x: 20,
      y: 120,
      align: 'left',
      baseline: 'top',
    })
    expect(captionAnchor(band, { ...base, place: 'br', inset: 20 })).toEqual({
      x: 1060,
      y: 580,
      align: 'right',
      baseline: 'bottom',
    })
  })
})

describe('blurRadiusOf and shadowAlpha', () => {
  it('keeps the blur proportional but inside a usable band', () => {
    expect(blurRadiusOf(1080)).toBe(22)
    expect(blurRadiusOf(100)).toBe(6)
    expect(blurRadiusOf(9999)).toBe(48)
  })

  it('turns the percent into an alpha and clamps it', () => {
    expect(shadowAlpha({ blur: 20, offsetY: 10, opacity: 28 })).toBeCloseTo(0.28, 10)
    expect(shadowAlpha({ blur: 20, offsetY: 10, opacity: 500 })).toBe(1)
  })
})

describe('normalizeLongStyle with the card and caption fields', () => {
  it('keeps the nested objects inside their bounds and survives a round trip', () => {
    const once = normalizeLongStyle({
      bandRadius: -5,
      narrowFill: 'glass',
      stackOverlap: 1e9,
      shadow: { blur: '20', offsetY: 9999, opacity: 130 },
      caption: { enabled: 'yes', text: 12, size: 1e6, color: 'red', place: 'middle', inset: -3 },
    })
    expect(once.bandRadius).toBe(0)
    expect(once.narrowFill).toBe('background')
    expect(once.stackOverlap).toBe(MAX_STACK_OVERLAP)
    expect(once.shadow).toEqual({
      blur: 0,
      offsetY: MAX_SHADOW_OFFSET,
      opacity: MAX_SHADOW_OPACITY,
    })
    expect(once.caption.enabled).toBe(false)
    expect(once.caption.text).toBe(DEFAULT_LONG_CAPTION.text)
    expect(once.caption.color).toBe(DEFAULT_LONG_CAPTION.color)
    expect(once.caption.place).toBe(DEFAULT_LONG_CAPTION.place)
    expect(normalizeLongStyle(once)).toEqual(once)
  })

  it('accepts a usable caption and a real hex colour', () => {
    const style2 = normalizeLongStyle({
      caption: { enabled: true, text: '{n} / {total}', size: 42, color: '#0f172a', place: 'bl' },
    })
    expect(style2.caption).toMatchObject({ enabled: true, size: 42, color: '#0f172a', place: 'bl' })
  })

  it('defaults leave the output untouched: no shadow, no caption, no fill', () => {
    expect(DEFAULT_LONG_STYLE.shadow.blur).toBe(0)
    expect(DEFAULT_LONG_STYLE.caption.enabled).toBe(false)
    expect(DEFAULT_LONG_STYLE.narrowFill).toBe('background')
    expect(DEFAULT_LONG_STYLE.stackOverlap).toBe(0)
  })
})

describe('normalizeLongStyle', () => {
  it('falls back field by field instead of rejecting the whole payload', () => {
    const normalized = normalizeLongStyle({
      widthMode: 'nope',
      align: 'middle',
      targetWidth: '700',
      padding: -8,
      gap: Number.NaN,
    })
    expect(normalized).toEqual(DEFAULT_LONG_STYLE)
  })

  it('is idempotent across a persistence round trip', () => {
    const once = normalizeLongStyle({
      widthMode: 'custom',
      targetWidth: 720,
      align: 'left',
      padding: 24,
      gap: 6,
      canvasRadius: 12,
      background: { type: 'transparent' },
    })
    expect(normalizeLongStyle(once)).toEqual(once)
    expect(normalizeLongStyle(once)).not.toBe(once)
  })

  it('treats a hand-edited huge width as the cap', () => {
    expect(normalizeLongStyle({ targetWidth: 1e9 }).targetWidth).toBe(MAX_LONG_WIDTH)
  })
})

describe('normalizeLongCrop', () => {
  it('ignores garbage and clamps the percent into the adjustable band', () => {
    expect(normalizeLongCrop({ keepBottomPercent: '12' })).toEqual(DEFAULT_LONG_CROP)
    expect(normalizeLongCrop({ keepBottomPercent: 1e9 }).keepBottomPercent).toBe(100)
    expect(normalizeLongCrop({ keepBottomPercent: -30 }).keepBottomPercent).toBe(
      MIN_KEEP_BOTTOM_PERCENT,
    )
    expect(normalizeLongCrop({ trimTopPx: -10 }).trimTopPx).toBe(0)
  })

  it('is idempotent', () => {
    const once = normalizeLongCrop({ keepBottomPercent: 33, trimTopPx: 41 })
    expect(normalizeLongCrop(once)).toEqual(once)
  })
})
