/**
 * 引擎数学基元：clamp/插值、缓动、确定性哈希随机、值噪声、颜色工具。
 *
 * 所有随机都走 hash 或 mulberry32 流，不依赖 Math.random，
 * 因此同一 seed + 同一歌词必然渲染出同一支视频（可复现，也便于逐帧导出）。
 */
import type { Rng } from './types'

export const TAU = Math.PI * 2
export const DEG = Math.PI / 180

export function clamp(x: number, a = 0, b = 1): number {
  return x < a ? a : x > b ? b : x
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
export function inv(a: number, b: number, x: number): number {
  return b === a ? 0 : (x - a) / (b - a)
}
export function smooth(a: number, b: number, x: number): number {
  const t = clamp(inv(a, b, x))
  return t * t * (3 - 2 * t)
}

/** 缓动函数表（部件库里按名字取用） */
export const E = {
  lin: (x: number) => clamp(x),
  inQuad: (x: number) => {
    const v = clamp(x)
    return v * v
  },
  outQuad: (x: number) => {
    const v = clamp(x)
    return 1 - (1 - v) * (1 - v)
  },
  inCubic: (x: number) => {
    const v = clamp(x)
    return v * v * v
  },
  outCubic: (x: number) => {
    const v = clamp(x)
    return 1 - (1 - v) ** 3
  },
  inOutCubic: (x: number) => {
    const v = clamp(x)
    return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2
  },
  outExpo: (x: number) => {
    const v = clamp(x)
    return v >= 1 ? 1 : 1 - 2 ** (-10 * v)
  },
  inExpo: (x: number) => {
    const v = clamp(x)
    return v <= 0 ? 0 : 2 ** (10 * v - 10)
  },
  inOutExpo: (x: number) => {
    const v = clamp(x)
    if (v <= 0 || v >= 1) return v
    return v < 0.5 ? 2 ** (20 * v - 10) / 2 : (2 - 2 ** (-20 * v + 10)) / 2
  },
  outBack: (x: number, s = 1.9) => {
    const v = clamp(x)
    const c = s + 1
    return 1 + c * (v - 1) ** 3 + s * (v - 1) ** 2
  },
  outElastic: (x: number) => {
    const v = clamp(x)
    if (v === 0 || v === 1) return v
    return 2 ** (-10 * v) * Math.sin((v * 10 - 0.75) * (TAU / 3)) + 1
  },
  inOutSine: (x: number) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2,
}

export function bounce(x: number): number {
  const n1 = 7.5625
  const d1 = 2.75
  let v = x
  if (v < 1 / d1) return n1 * v * v
  if (v < 2 / d1) {
    v -= 1.5 / d1
    return n1 * v * v + 0.75
  }
  if (v < 2.5 / d1) {
    v -= 2.25 / d1
    return n1 * v * v + 0.9375
  }
  v -= 2.625 / d1
  return n1 * v * v + 0.984375
}

/* ---------------- 确定性哈希 ---------------- */

const sidCache = new Map<string, number>()

/** 字符串 -> uint32（缓存，热路径上只算一次） */
export function sid(s: string): number {
  const hit = sidCache.get(s)
  if (hit !== undefined) return hit
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const v = h >>> 0
  sidCache.set(s, v)
  return v
}

/** 至多 5 个数字 key 混合成 uint32 */
export function hash(a: number, b = 0, c = 0, d = 0, e = 0): number {
  let h = 0x9e3779b9 ^ (a | 0)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = (h + Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35)) | 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h = (h + Math.imul((c | 0) + 0x5bd1e995, 0x27d4eb2f)) | 0
  h = Math.imul(h ^ (h >>> 15), 0x165667b1)
  h = (h + Math.imul((d | 0) + 0x1b873593, 0x85ebca6b)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f)
  h = (h + Math.imul((e | 0) + 0x68e31da4, 0x9e3779b1)) | 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}

/** 0..1 */
export function r(a: number, b = 0, c = 0, d = 0, e = 0): number {
  return hash(a, b, c, d, e) / 4294967296
}
/** -1..1 */
export function rs(a: number, b = 0, c = 0, d = 0, e = 0): number {
  return r(a, b, c, d, e) * 2 - 1
}
export function rr(lo: number, hi: number, a: number, b = 0, c = 0, d = 0, e = 0): number {
  return lo + (hi - lo) * r(a, b, c, d, e)
}
export function pick<T>(arr: readonly T[], a: number, b = 0, c = 0, d = 0): T {
  return arr[Math.floor(r(a, b, c, d) * arr.length) % arr.length]
}

/** mulberry32 随机流 */
export function rng(seed: number): Rng {
  let s = seed >>> 0
  const f = (() => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  f.range = (lo, hi) => lo + (hi - lo) * f()
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f())
  f.pick = <T>(arr: readonly T[]) => arr[Math.floor(f() * arr.length) % arr.length]
  f.chance = (p) => f() < p
  f.wpick = <T>(list: readonly (readonly [T, number])[]) => {
    let total = 0
    for (const [, w] of list) total += w
    let x = f() * total
    for (const [v, w] of list) {
      x -= w
      if (x <= 0) return v
    }
    return list[list.length - 1][0]
  }
  return f
}

/** 平滑 1D 值噪声（漂移、摆动） */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const frac = x - i
  const u = frac * frac * (3 - 2 * frac)
  return lerp(rs(seed, i), rs(seed, i + 1), u)
}

/* ---------------- 颜色 ---------------- */

/** #rgb / #rrggbb -> [r,g,b] */
export function hexToRgb(h: string): [number, number, number] {
  let s = String(h || '#000').replace('#', '')
  if (s.length === 3)
    s = s
      .split('')
      .map((c) => c + c)
      .join('')
  const n = Number.parseInt(s.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgba(h: string, a = 1): string {
  const [cr, cg, cb] = hexToRgb(h)
  return `rgba(${cr},${cg},${cb},${a})`
}

export function mix(h1: string, h2: string, t: number): string {
  const a = hexToRgb(h1)
  const b = hexToRgb(h2)
  return toHex(
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  )
}

/** 感知亮度 0..1 */
export function lum(h: string): number {
  const [cr, cg, cb] = hexToRgb(h)
  return (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255
}

export function toHex(r0: number, g0: number, b0: number): string {
  return (
    '#' +
    [r0, g0, b0]
      .map((v) =>
        Math.round(clamp(v, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  )
}

/** hsl -> hex（h 0..360，s/l 0..1） */
export function hsl(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    const x = (t + 1) % 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return toHex(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255)
}

/** hex -> [h(0..360), s, l] */
export function toHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255)
  const mx = Math.max(r0, g0, b0)
  const mn = Math.min(r0, g0, b0)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h =
    mx === r0
      ? (g0 - b0) / d + (g0 < b0 ? 6 : 0)
      : mx === g0
        ? (b0 - r0) / d + 2
        : (r0 - g0) / d + 4
  return [h * 60, s, l]
}

/** WCAG 对比度 */
export function contrast(a: string, b: string): number {
  const L = (h: string) => {
    const c = hexToRgb(h).map((v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const x = L(a)
  const y = L(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** 微调明度直到在背景上读得清 */
export function fitContrast(hex: string, bg: string, min = 3): string {
  if (contrast(hex, bg) >= min) return hex.toUpperCase()
  const [h, s, l0] = toHsl(hex)
  let l = l0
  const dark = lum(bg) < 0.5
  for (let i = 0; i < 24; i++) {
    l = dark ? Math.min(0.96, l + 0.035) : Math.max(0.04, l - 0.035)
    const c = hsl(h, s, l)
    if (contrast(c, bg) >= min) return c
  }
  return dark ? '#FFFFFF' : '#111111'
}

/** 在给定背景上随机一对可读的主色 + 色散残影色 */
export const GHOST_PAIRS: readonly (readonly [string, string])[] = [
  ['#16F4D4', '#F5A50C'],
  ['#FF2A2A', '#2AA8FF'],
  ['#FF2BD6', '#2BFF88'],
  ['#FFE600', '#7B2BFF'],
  ['#FF6A00', '#00C2B8'],
  ['#FF6FAE', '#B6FF3B'],
  ['#00E0FF', '#FF3D6E'],
  ['#C8FF00', '#FF00A8'],
  ['#4D6BFF', '#FFB000'],
  ['#FF4B2B', '#2BD9FF'],
]

export type Palette = { accent: string; ghostA: string; ghostB: string }

export function randomPalette(bg: string, rnd: () => number = Math.random): Palette {
  const dark = lum(bg) < 0.5
  let a: string
  let b: string
  if (rnd() < 0.4) {
    const pair = GHOST_PAIRS[Math.floor(rnd() * GHOST_PAIRS.length)]
    ;[a, b] = rnd() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]]
    if (!dark) {
      a = hsl(toHsl(a)[0], 0.95, 0.47)
      b = hsl(toHsl(b)[0], 0.95, 0.47)
    }
  } else {
    const h = rnd() * 360
    const gap = [180, 165, 150, 135][Math.floor(rnd() * 4)] * (rnd() < 0.5 ? 1 : -1)
    const s = 0.82 + rnd() * 0.18
    const l = dark ? 0.52 + rnd() * 0.1 : 0.44 + rnd() * 0.08
    a = hsl(h, s, l)
    b = hsl(h + gap, s, l)
  }
  const ra = rnd()
  const [ha] = toHsl(a)
  const [hb] = toHsl(b)
  let acc =
    ra < 0.35
      ? a
      : ra < 0.6
        ? b
        : hsl((ha + hb) / 2 + (rnd() < 0.5 ? 0 : 180), 0.9, dark ? 0.6 : 0.45)
  acc = fitContrast(acc, bg, 3)
  return { accent: acc, ghostA: a, ghostB: b }
}

/* ---------------- 时间 ---------------- */

/** mm:ss.ff */
export function fmtTime(t: number, fps?: number): string {
  const v = Math.max(0, t)
  const m = Math.floor(v / 60)
  const s = Math.floor(v % 60)
  const f = Math.floor((v % 1) * (fps || 100))
  const sep = fps ? ':' : '.'
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(2, '0')}`
}
