/**
 * 颜色纯函数：hex / rgb / hsl / oklch 四种写法的解析、互转，以及 WCAG 对比度。
 *
 * 站内唯一实现——取色器（components/color-picker）与任何需要读写颜色字符串的地方都走这里。
 * 不引第三方库：colord 2.10 没有 oklch 插件（只有 lab/lch/hwb/cmyk/names/a11y），
 * 而取色器的面板模型是 HSV、格式行还要显示 oklch，自己实现反而更小更可控。
 *
 * 约定：sRGB 通道与 alpha 一律是 0–1 浮点；色相是角度 0–360。
 */

export type Rgba = { r: number; g: number; b: number; a: number }
export type Hsva = { h: number; s: number; v: number; a: number }
export type Oklch = { l: number; c: number; h: number }
export type Hsla = { h: number; s: number; l: number; a: number }

/** 取色器格式行可以循环的四种写法 */
export const COLOR_FORMATS = ['hex', 'rgb', 'hsl', 'oklch'] as const
export type ColorFormat = (typeof COLOR_FORMATS)[number]

/** 对比度达标档位，i18n 键按此命名 */
export const WCAG_LEVELS = ['aaa', 'aa', 'aaLarge', 'fail'] as const
export type WcagLevel = (typeof WCAG_LEVELS)[number]

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const round = (value: number, digits = 0) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
/** 正则捕获组在可选段上是 `string | undefined`，统一按 0 收，避免非空断言 */
const group = (raw: string | undefined): number => Number(raw ?? 0)
/** alpha 段可以是 `0.5` 也可以是 `50%`，百分号要先摘掉再 Number */
const groupAlpha = (raw: string | undefined): number => {
  if (raw === undefined) return 1
  const isPercent = raw.endsWith('%')
  const value = Number(isPercent ? raw.slice(0, -1) : raw)
  return clamp(isPercent ? value / 100 : value)
}

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return { r: channel(5), g: channel(3), b: channel(1), a }
}

/** `hue` 只在无彩度（黑灰）时兜底，保证拖动灰阶时色相游标不跳走 */
export function rgbToHsv({ r, g, b, a }: Rgba, hue = 0): Hsva {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = hue
  if (delta > 1e-6) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max, a }
}

export function hslToRgb({ h, s, l, a }: Hsla): Rgba {
  const k = (n: number) => (n + h / 30) % 12
  const c = s * Math.min(l, 1 - l)
  const channel = (n: number) => l - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: channel(0), g: channel(8), b: channel(4), a }
}

export function rgbToHsl({ r, g, b, a }: Rgba, hue = 0): Hsla {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  const s = delta < 1e-6 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return { h: delta < 1e-6 ? hue : rgbToHsv({ r, g, b, a: 1 }, hue).h, s, l, a }
}

export function rgbToOklch({ r, g, b }: Rgba, hue = 0): Oklch {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const aAxis = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(aAxis, bAxis)
  let h = (Math.atan2(bAxis, aAxis) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: lightness, c, h: c < 0.0005 ? hue : h }
}

export function oklchToRgb({ l, c, h }: Oklch, a = 1): Rgba {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const lp = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const mp = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const sp = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return {
    r: clamp(fromLinear(4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp)),
    g: clamp(fromLinear(-1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp)),
    b: clamp(fromLinear(-0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp)),
    a,
  }
}

const byte = (channel: number) => Math.round(clamp(channel) * 255)
const hex2 = (channel: number) => byte(channel).toString(16).padStart(2, '0').toUpperCase()

/** 十六进制颜色：不透明时 6 位，带 alpha 时 8 位 */
export function toHex(hsva: Hsva): string {
  const { r, g, b, a } = hsvToRgb(hsva)
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 0.999 ? hex2(a) : ''}`
}

/** 内联 style 用的 rgb() 串（alpha 只在非不透明时写出） */
export function toCssRgb(rgb: Rgba): string {
  const alpha = rgb.a < 0.999 ? ` / ${round(rgb.a, 3)}` : ''
  return `rgb(${byte(rgb.r)} ${byte(rgb.g)} ${byte(rgb.b)}${alpha})`
}

/** 取色器格式行的显示文本，四种写法各自保持浏览器可直接粘贴的语法 */
export function formatColor(hsva: Hsva, format: ColorFormat): string {
  const rgb = hsvToRgb(hsva)
  const alpha = hsva.a < 0.999 ? ` / ${Math.round(hsva.a * 100)}%` : ''
  if (format === 'hex') return toHex(hsva)
  if (format === 'rgb') return `rgb(${byte(rgb.r)} ${byte(rgb.g)} ${byte(rgb.b)}${alpha})`
  if (format === 'hsl') {
    const { h, s, l } = rgbToHsl(rgb, hsva.h)
    return `hsl(${Math.round(h) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${alpha})`
  }
  const { l, c, h } = rgbToOklch(rgb, hsva.h)
  return `oklch(${round(l * 100, 1)}% ${round(c, 3)} ${round(h, 1) % 360}${alpha})`
}

/**
 * 读取 hex / rgb() / hsl() / oklch()，逗号与空格两套语法都收。
 * 读不出来返回 null，由调用方决定怎么提示——不抛错，取色器要边打字边判合法。
 */
export function parseColor(input: string, hue = 0): Hsva | null {
  const text = input.trim().toLowerCase()

  let match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (match) {
    let digits = match[1] ?? ''
    if (digits.length <= 4)
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('')
    const at = (i: number) => parseInt(digits.slice(i, i + 2), 16) / 255
    return rgbToHsv({ r: at(0), g: at(2), b: at(4), a: digits.length === 8 ? at(6) : 1 }, hue)
  }

  match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
    text,
  )
  if (match) {
    return rgbToHsv(
      {
        r: clamp(group(match[1]) / 255),
        g: clamp(group(match[2]) / 255),
        b: clamp(group(match[3]) / 255),
        a: groupAlpha(match[4]),
      },
      hue,
    )
  }

  match =
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
      text,
    )
  if (match) {
    const h = group(match[1]) % 360
    const next = rgbToHsv(
      hslToRgb({
        h,
        s: clamp(group(match[2]) / 100),
        l: clamp(group(match[3]) / 100),
        a: groupAlpha(match[4]),
      }),
      h,
    )
    return { ...next, h }
  }

  match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
    text,
  )
  if (match) {
    const lightness = match[2] ? group(match[1]) / 100 : group(match[1])
    return rgbToHsv(
      oklchToRgb(
        { l: clamp(lightness), c: group(match[3]), h: group(match[4]) },
        groupAlpha(match[5]),
      ),
      hue,
    )
  }

  return null
}

/** 相对亮度（WCAG 定义），alpha 先按压到 `background` 之后的结果算 */
export function relativeLuminance(rgb: Rgba): number {
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
}

/** 前景按自身 alpha 合成到背景上 */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const mix = (fg: number, bg: number) => fg * foreground.a + bg * (1 - foreground.a)
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: clamp(foreground.a + background.a * (1 - foreground.a)),
  }
}

/**
 * 对比度：前景合成到 `background` 之后与该背景的 WCAG 比值（1–21）。
 * 背景由调用方给出——取色器用它将要落在的底色，而不是页面底色。
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const over = composite(foreground, background)
  const a = relativeLuminance(over)
  const b = relativeLuminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return 'aaa'
  if (ratio >= 4.5) return 'aa'
  if (ratio >= 3) return 'aaLarge'
  return 'fail'
}

/** 纯色底上的前景选择：取黑白里对比更高的那个，用于色块上的对勾等 */
export function readableOn(background: Rgba): Rgba {
  const white: Rgba = { r: 1, g: 1, b: 1, a: 1 }
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 }
  return contrastRatio(white, background) >= contrastRatio(black, background) ? white : black
}
