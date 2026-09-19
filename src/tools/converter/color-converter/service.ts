export type RgbColor = { r: number; g: number; b: number }

export type HslColor = { h: number; s: number; l: number }

export type ParsedColor = { hex: string; rgb: RgbColor; hsl: HslColor }

/** 支持的颜色名子集（小写） */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  blue: '#0000ff',
  brown: '#a52a2a',
  cyan: '#00ffff',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  magenta: '#ff00ff',
  orange: '#ffa500',
  pink: '#ffc0cb',
  purple: '#800080',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string): RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const delta = max - min
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case rn: {
        h = (gn - bn) / delta + (gn < bn ? 6 : 0)
        break
      }
      case gn: {
        h = (bn - rn) / delta + 2
        break
      }
      default: {
        h = (rn - gn) / delta + 4
      }
    }
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hn = (((h % 360) + 360) % 360) / 360
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  if (sn === 0) {
    const value = Math.round(ln * 255)
    return { r: value, g: value, b: value }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const channel = (t: number) => {
    let shifted = t
    if (shifted < 0) shifted += 1
    if (shifted > 1) shifted -= 1
    if (shifted < 1 / 6) return p + (q - p) * 6 * shifted
    if (shifted < 1 / 2) return q
    if (shifted < 2 / 3) return p + (q - p) * (2 / 3 - shifted) * 6
    return p
  }
  return {
    r: Math.round(channel(hn + 1 / 3) * 255),
    g: Math.round(channel(hn) * 255),
    b: Math.round(channel(hn - 1 / 3) * 255),
  }
}

/** '#abc' / '#aabbcc'（可省略 #）→ '#aabbcc'；非法返回 null */
function parseHexColor(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(input)
  if (!match) {
    return null
  }
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((char) => char + char)
          .join('')
      : match[1]
  return `#${digits}`
}

/** 0-255 数字或百分比 → 字节值；越界抛 Error */
function parseRgbChannel(raw: string, input: string): number {
  if (raw.endsWith('%')) {
    const percent = Number.parseFloat(raw)
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error(`Invalid rgb() channel: "${raw}" in "${input}"`)
    }
    return Math.round((percent / 100) * 255)
  }
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new Error(`Invalid rgb() channel: "${raw}" in "${input}"`)
  }
  return value
}

function parseRgbColor(input: string): string | null {
  const match = /^rgba?\(([^)]*)\)$/.exec(input)
  if (!match) {
    return null
  }
  const parts = match[1].split(/[\s,]+/).filter(Boolean)
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error(`Invalid rgb() color: "${input}"`)
  }
  const { r, g, b } = {
    r: parseRgbChannel(parts[0], input),
    g: parseRgbChannel(parts[1], input),
    b: parseRgbChannel(parts[2], input),
  }
  return rgbToHex({ r, g, b })
}

/** 0-100 数字或百分比 → 通道值；越界抛 Error */
function parseHslChannel(raw: string, input: string): number {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Invalid hsl() channel: "${raw}" in "${input}"`)
  }
  return value
}

function parseHslColor(input: string): string | null {
  const match = /^hsla?\(([^)]*)\)$/.exec(input)
  if (!match) {
    return null
  }
  const parts = match[1].split(/[\s,]+/).filter(Boolean)
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error(`Invalid hsl() color: "${input}"`)
  }
  const hue = Number.parseFloat(parts[0])
  if (!Number.isFinite(hue) || hue < 0 || hue > 360) {
    throw new Error(`Invalid hsl() hue: "${parts[0]}" in "${input}"`)
  }
  const s = parseHslChannel(parts[1], input)
  const l = parseHslChannel(parts[2], input)
  return rgbToHex(hslToRgb({ h: hue, s, l }))
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toPair = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toPair(r)}${toPair(g)}${toPair(b)}`
}

/**
 * 解析任意颜色格式：#RGB / #RRGGBB / rgb() / rgba() / hsl() / hsla() / 颜色名子集。
 * 输入大小写不敏感；rgba/hsla 的 alpha 被忽略。非法输入抛 Error。
 */
export function parseColor(input: string): ParsedColor {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') {
    throw new Error('Color input is empty')
  }
  const hex =
    parseHexColor(trimmed) ??
    parseRgbColor(trimmed) ??
    parseHslColor(trimmed) ??
    NAMED_COLORS[trimmed]
  if (!hex) {
    throw new Error(`Invalid color: "${input}"`)
  }
  const rgb = hexToRgb(hex)
  return { hex, rgb, hsl: rgbToHsl(rgb) }
}
