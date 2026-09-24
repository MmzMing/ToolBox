/**
 * 部件包 bgcamB：37 个整屏背景（渐变 / 纹样 / 场景 / 质感）+ 12 个镜头运动。
 *
 * 逐条移植自 JIZURA 的 src/11p_bgcamB.js（MIT）：hash 种子、数值常量、缓动曲线、
 * 图块尺寸与随机抽样顺序一律照搬，保证同 seed + 同歌词渲染出同一支视频。
 * key 与注册顺序由 registry 锁定，不要改名、不要增删。
 *
 * 与旧项目的对应关系：
 * - 旧 bgReg() 外壳里的 ctx.save/restore 由 renderer 统一负责，这里只写画什么；
 * - 旧 def 的 name 字段不进定义（界面文案走名字表 bgcam-b.names.json）；
 * - J.hex → hexToRgb、J.h → hash；个别与 ../util 导入同名的局部变量（r / rr）
 *   改名以避免遮蔽，取值不变；
 * - 青海波、麻叶纹、千鸟格等纹样形状照搬，只换名字。
 */
import type { Cut, Env, PackParts, Rng, Scheme } from '../types'
import { ctxOf, makeCanvas } from '../canvas'
import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  hash,
  hexToRgb,
  lerp,
  lum,
  mix,
  noise1,
  r,
  rr,
  rgba,
  rs,
  smooth,
} from '../util'

type Ctx = CanvasRenderingContext2D
type Pt = readonly [number, number]

/* ---------------------------------------------------------------- 部件参数 */

type AuroraRibbonsParams = { seed: number; n: number; y: number; k: number; c0: number }
type MeshBlobsParams = { seed: number; n: number; k: number }
type DuotoneSweepParams = {
  seed: number
  pos: readonly [number, number]
  spd: number
  k: number
  a0: number
}
type HorizonGlowParams = { seed: number; cx: number; R: number; top: number; k: number }
type SeigaihaParams = {
  seed: number
  R: number
  rings: number
  k: number
  dir: number
  acc: boolean
}
type AsanohaParams = { seed: number; a: number; k: number; dx: number; sweep: number }
type HoundstoothParams = { seed: number; c: number; k: number; dx: number; acc: boolean }
type HerringboneParams = { seed: number; u: number; k: number; dir: number; rot: number }
type ArgyleParams = { seed: number; dw: number; asp: number; k: number; up: number }
type TartanParams = { seed: number; S: number; w1: number; w2: number; k: number; acc: boolean }
type ChevronParams = { seed: number; p: number; amp: number; k: number; dir: number; acc: boolean }
type IsoCubesParams = { seed: number; s: number; k: number; spd: number; l0: number }
type HexGridParams = { seed: number; s: number; k: number; mode: string }
type TriTessParams = { seed: number; a: number; k: number; acc: boolean }
type MoireParams = { seed: number; gap: number; k: number; amp: number }
type SquareTunnelParams = { seed: number; r: number; twist: number; spd: number; k: number }
type SpiralArmsParams = { seed: number; n: number; b: number; spd: number; k: number; cy: number }
type TopoLinesParams = { seed: number; n: number; fs: number; k: number; acc: boolean }
type RidgePlotParams = {
  seed: number
  n: number
  k: number
  amp: number
  mode: string
  spd: number
}
type StarfieldParams = { seed: number; ang: number; spd: number; shoot: boolean }
type NightMoonParams = { seed: number; side: number; R: number; phase: string; k: number }
type SkylineParams = { seed: number; k: number; dir: number; win: number }
type SunsetSunParams = { seed: number; hz: number; R: number; cx: number; k: number }
type OceanWavesParams = { seed: number; n: number; hz: number; k: number; dir: number }
type RainWindowParams = { seed: number; ang: number; n: number; k: number; drops: number }
type SnowLayersParams = { seed: number; wind: number; dens: number }
type FireworksParams = { seed: number; per: number; k: number }
type CloudLayersParams = { seed: number; dir: number; k: number }
type MountainsParams = { seed: number; n: number; k: number; dir: number; mist: boolean }
type FilmStripParams = { seed: number; dir: number; spd: number; scratch: boolean }
type VhsBandParams = { seed: number; h: number; spd: number; k: number }
type TornPaperParams = { seed: number; v: string; k: number }
type GodRaysParams = {
  seed: number
  x: number
  n: number
  spread: number
  k: number
  dust: boolean
}
type VignettePulseParams = { seed: number; k: number; two: boolean; rate: number }
type KaleidoscopeParams = { seed: number; n: number; m: number; k: number; spd: number }
type MarbleParams = {
  seed: number
  ang: number
  freq: number
  turb: number
  k: number
  acc: boolean
  dir: number
}
type PaperCutParams = { seed: number; L: number; lobes: number; k: number; acc: boolean; p: number }
type OrbitDriftParams = { dir: number; a0: number; sp: number }
type BarrelRollParams = { dir: number; a: number; d: number }
type PendulumSwayParams = { a: number; per: number; side: number }
type FocusInParams = { d: number; b: number }
type RackFocusParams = { b: number; at: number }
type EarthquakeParams = { per: number; a: number }
type FloatNoiseParams = { f: number }
type VertigoParams = { dir: number; a: number }
type TiltDownParams = { a: number }
type SpiralInParams = { dir: number; a0: number; d: number }
type SnapPanParams = { dir: number; a: number; at: number }
type JellyParams = { a: number; f: number }

/* ---------------------------------------------------------------- 共用助手 */

const isDark = (c: string) => lum(c) < 0.45
/** 与底色混出的淡层色（k ≈ 0.04..0.15） */
const layC = (sc: Scheme, k: number) => mix(sc.bg, sc.fg, k)
const tintC = (sc: Scheme, k: number) => mix(sc.bg, sc.accent, k)
const Umin = (env: Env) => Math.min(env.W, env.H)
const bs = (rng: Rng) => rng.int(1, 1e9)
const wrap = (v: number, m: number) => ((v % m) + m) % m
const fract = (v: number) => v - Math.floor(v)

/** 与底色分得开的鲜色（accent 优先，去重） */
const hues = (sc: Scheme) => {
  const out: string[] = []
  for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg]) {
    if (!c || contrast(c, sc.bg) < 1.25) continue
    const k = c.toLowerCase()
    if (!out.some((o) => o.toLowerCase() === k)) out.push(c)
  }
  return out.length ? out : [sc.fg]
}

/** 在深底上仍然显亮的浅色（发光效果用） */
const glowOf = (sc: Scheme) => {
  const L = lum(sc.bg)
  for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg])
    if (c && lum(c) > L + 0.25) return c
  return sc.fg
}

/** 浅底上也能看见的光：中亮度底用白，接近纯白的纸底用淡 accent */
const lightOn = (sc: Scheme) =>
  isDark(sc.bg) ? glowOf(sc) : lum(sc.bg) < 0.78 ? '#FFFFFF' : mix(sc.accent, '#FFFFFF', 0.2)

/** 版式只在渲染管线的镜头循环里被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

/** 本段背景的起算时间：共用同一 bg + seed 的连续 cut 算同一段 */
const bgRun = new WeakMap<Cut, number>()
const bgT = (env: Env): number => {
  const c = env.cut
  if (!c) return env.t
  let s = bgRun.get(c)
  if (s == null) {
    s = c.start
    const cs = env.plan.cuts
    const P0 = c.bgP
    for (let i = (c.index ?? 0) - 1; i >= 0 && i < cs.length; i--) {
      const p = cs[i]
      if (p.bg === c.bg && p.bgP.seed === P0.seed && Math.abs(p.end - s) < 0.06) s = p.start
      else break
    }
    bgRun.set(c, s)
  }
  return env.t - s
}
const fadeIn = (env: Env, d = 0.6) => E.outCubic(clamp(bgT(env) / d))

const mkCv = (w: number, h: number) =>
  makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)))

/** 预渲染缓存（图块、精灵、纹理）——按参数 + 尺寸 + 颜色为键的小容量 LRU */
const CV = new Map<string, HTMLCanvasElement>()
const oldestKey = <T>(m: Map<string, T>) => {
  const it = m.keys().next()
  return it.done ? undefined : it.value
}
const cached = (key: string, make: () => HTMLCanvasElement) => {
  let c = CV.get(key)
  if (c) {
    CV.delete(key)
    CV.set(key, c)
    return c
  }
  while (CV.size >= 40) {
    const k0 = oldestKey(CV)
    if (k0 === undefined) break
    CV.delete(k0)
  }
  c = make()
  CV.set(key, c)
  return c
}

const resQ = (env: Env) => Math.min(2, Math.max(0.1, env.scale || 1))

/** 周期为 pw × ph（设计像素）的图块，按输出分辨率预渲染 */
const tileCv = (
  key: string,
  env: Env,
  pw: number,
  ph: number,
  paint: (x: Ctx, w: number, h: number) => void,
) => {
  const q = resQ(env)
  const w = Math.max(2, Math.round(pw * q))
  const h = Math.max(2, Math.round(ph * q))
  return cached(`${key}|${w}x${h}`, () => {
    const c = mkCv(w, h)
    const x = ctxOf(c)
    x.scale(w / pw, h / ph)
    paint(x, pw, ph)
    return c
  })
}

/** 用图块铺满当前坐标系里的矩形 (x0,y0,w,h)，图案原点偏移 (ox,oy) */
const fillTile = (
  ctx: Ctx,
  cv: HTMLCanvasElement,
  pw: number,
  ph: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  ox = 0,
  oy = 0,
) => {
  const pat = ctx.createPattern(cv, 'repeat')
  if (!pat) return
  const m = ctx.getTransform()
  const kx = (m.a * pw) / cv.width
  const ky = (m.d * ph) / cv.height
  ctx.save()
  ctx.fillStyle = pat
  if (!m.b && !m.c && Math.abs(kx - 1) < 0.05 && Math.abs(ky - 1) < 0.05) {
    // 图块像素与设备像素近乎 1:1：在设备空间填充，让每次重复都落在整像素上（无重采样接缝）
    const ex = Math.round(m.e + ox * m.a)
    const fy = Math.round(m.f + oy * m.d)
    ctx.setTransform(1, 0, 0, 1, ex, fy)
    ctx.fillRect(m.e + x0 * m.a - ex, m.f + y0 * m.d - fy, w * m.a, h * m.d)
  } else {
    const sx = pw / cv.width
    const sy = ph / cv.height
    ctx.translate(ox, oy)
    ctx.scale(sx, sy)
    ctx.fillRect((x0 - ox) / sx, (y0 - oy) / sy, w / sx, h / sy)
  }
  ctx.restore()
}

/** 快速二维值噪声（0..1），用于预渲染与逐帧场 */
const hash2 = (x: number, y: number, s: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 144665)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const noise2 = (x: number, y: number, s: number) => {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy, s)
  const b = hash2(ix + 1, iy, s)
  const c = hash2(ix, iy + 1, s)
  const d = hash2(ix + 1, iy + 1, s)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm2 = (x: number, y: number, s: number, oct = 3) => {
  let v = 0
  let a = 0.5
  let f = 1
  let n = 0
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f, s + i * 101) * a
    n += a
    a *= 0.5
    f *= 2.03
  }
  return v / n
}
/** -1..1 */
const fbm1 = (x: number, s: number, oct = 3) => {
  let v = 0
  let a = 0.5
  let f = 1
  let n = 0
  for (let i = 0; i < oct; i++) {
    v += noise1(x * f, s + i * 53) * a
    n += a
    a *= 0.5
    f *= 2.1
  }
  return v / n
}
const conic = (ctx: Ctx, a: number, x: number, y: number) =>
  ctx.createConicGradient ? ctx.createConicGradient(a, x, y) : null
const pathPoly = (ctx: Ctx, pts: readonly Pt[]) => {
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
}

/** marching squares：16 种角点组合各自的线段端点（边：0 上、1 右、2 下、3 左） */
const MS: readonly Pt[][] = [
  [],
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[0, 1]],
  [
    [0, 1],
    [3, 2],
  ],
  [[0, 2]],
  [[3, 0]],
  [[3, 0]],
  [[0, 2]],
  [
    [3, 0],
    [2, 1],
  ],
  [[0, 1]],
  [[3, 1]],
  [[2, 1]],
  [[3, 2]],
  [],
]

/** 整幅画布大小的底板：昂贵的填充（平铺纹样、同心环、纹理）只在输出分辨率上画一次
    （含一个滚动周期的余量），之后每帧按整设备像素贴回来——canvas 最便宜的路径 */
const PL = new Map<string, HTMLCanvasElement>()
const plate = (
  key: string,
  env: Env,
  mx: number,
  my: number,
  paint: (x: Ctx, w: number, h: number) => void,
) => {
  const q = resQ(env)
  const w = Math.ceil((env.W + mx) * q) + 2
  const h = Math.ceil((env.H + my) * q) + 2
  const k = `${key}|${w}x${h}`
  let c = PL.get(k)
  if (c) {
    PL.delete(k)
    PL.set(k, c)
    return c
  }
  let px = w * h
  for (const v of PL.values()) px += v.width * v.height
  const budget = Math.max(30e6, w * h * 3.2) // ≈120 MB，但一定要给一张背景可能用到的 3 块底板留出空间
  while (PL.size && (PL.size >= 12 || px > budget)) {
    const k0 = oldestKey(PL)
    if (k0 === undefined) break
    const v = PL.get(k0)
    if (v) px -= v.width * v.height
    PL.delete(k0)
  }
  c = mkCv(w, h)
  const x = ctxOf(c)
  x.scale(q, q)
  paint(x, w / q, h / q)
  PL.set(k, c)
  return c
}

/** 贴底板：让它的 (ox,oy)（设计像素）落在画面左上角，并对齐到设备像素 */
const blit = (ctx: Ctx, env: Env, cv: HTMLCanvasElement, ox: number, oy: number) => {
  const m = ctx.getTransform()
  const s = m.a / resQ(env)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, m.e, m.f)
  const dx = -Math.round(ox * m.a)
  const dy = -Math.round(oy * m.a)
  if (Math.abs(s - 1) < 1e-3) ctx.drawImage(cv, dx, dy)
  else ctx.drawImage(cv, dx, dy, cv.width * s, cv.height * s)
  ctx.restore()
}

/** 大面积柔效果（渐变、辉光）画进复用的低分辨率画布，再一次性放大 */
const LOWC = new Map<string, HTMLCanvasElement>()
const drawLow = (ctx: Ctx, env: Env, div: number, fn: (x: Ctx, q: number) => void) => {
  const q = env.scale || 1
  const w = Math.max(8, Math.ceil((env.W * q) / div))
  const h = Math.max(8, Math.ceil((env.H * q) / div))
  const k = w + 'x' + h
  let c = LOWC.get(k)
  if (!c) {
    if (LOWC.size > 3) LOWC.clear()
    c = mkCv(w, h)
    LOWC.set(k, c)
  }
  const x = ctxOf(c)
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.globalAlpha = 1
  x.globalCompositeOperation = 'source-over'
  x.clearRect(0, 0, w, h)
  x.setTransform(w / env.W, 0, 0, h / env.H, 0, 0)
  fn(x, w / env.W)
  x.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(c, 0, 0, env.W, env.H)
}

/* ---------------------------------------------------------------- 精灵与纹理 */

/** 柔和的圆点精灵（雪、尘埃一类） */
const softDot = (col: string) =>
  cached('dot|' + col, () => {
    const c = mkCv(64, 64)
    const x = ctxOf(c)
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, rgba(col, 1))
    g.addColorStop(0.45, rgba(col, 0.75))
    g.addColorStop(1, rgba(col, 0))
    x.fillStyle = g
    x.fillRect(0, 0, 64, 64)
    return c
  })

/** VHS 斑点噪声：每种颜色/尺寸只预渲染一次（3 个变体按绘制时钟轮换） */
const vhsNoise = (col: string, w: number, h: number, v: number) =>
  cached(`vhs|${col}|${w}x${h}|${v}`, () => {
    const c = mkCv(w, h)
    const x = ctxOf(c)
    const id = x.createImageData(w, h)
    const d = id.data
    const [cr, cg, cb] = hexToRgb(col)
    for (let y = 0; y < h; y++) {
      const row = 0.35 + 0.65 * hash2(3, y, v * 13 + 1)
      for (let i = 0; i < w; i++) {
        let n = hash2(i >> 1, y, v * 7 + 2)
        n = n * n * n
        if (hash2(i >> 4, y, v * 5 + 3) > 0.94) n = Math.max(n, 0.55 + 0.45 * hash2(i, y, v + 9))
        const o = (y * w + i) * 4
        d[o] = cr
        d[o + 1] = cg
        d[o + 2] = cb
        d[o + 3] = Math.round(255 * clamp(n * row))
      }
    }
    x.putImageData(id, 0, 0)
    return c
  })

/** 大理石纹：每个 seed / 尺寸 / 配色只按低分辨率算一次，之后缓慢转动 */
const marbleCv = (P: MarbleParams, px: number, c1: string, c2: string) =>
  cached(`marb|${P.seed}|${px}|${c1}|${c2}|${P.acc ? 1 : 0}`, () => {
    const c = mkCv(px, px)
    const x = ctxOf(c)
    const id = x.createImageData(px, px)
    const d = id.data
    const sd = P.seed || 1
    const a = P.ang || 0.7
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const cb = Math.cos(a + 1.1)
    const sb = Math.sin(a + 1.1)
    const fq = (P.freq || 3) * TAU
    const tb = P.turb || 5
    const A = hexToRgb(c1)
    const B = hexToRgb(c2)
    for (let j = 0; j < px; j++)
      for (let i = 0; i < px; i++) {
        const u = i / px
        const v = j / px
        const X = u * 3
        const Y = v * 3
        const s1 = Math.sin((u * ca + v * sa) * fq + fbm2(X, Y, sd, 4) * tb)
        const w1 = 1 - Math.abs(s1)
        const cloud = clamp((fbm2(X * 0.9 + 11, Y * 0.9, sd + 21, 2) - 0.42) * 1.6)
        const a1 =
          Math.pow(w1, 14) * (0.45 + 0.55 * noise2(X * 2.2 + 3, Y * 2.2, sd + 3)) +
          Math.pow(w1, 4) * 0.08 +
          cloud * 0.22
        let a2 = 0
        if (P.acc) {
          const s2 = Math.sin(
            (u * cb + v * sb) * fq * 1.6 + fbm2(X * 1.4 + 5, Y * 1.4, sd + 9, 3) * tb * 1.3,
          )
          a2 = Math.pow(1 - Math.abs(s2), 12) * 0.5
        }
        const al = a1 + a2 * (1 - a1)
        const o = (j * px + i) * 4
        if (al <= 0.003) {
          d[o + 3] = 0
          continue
        }
        const f = (a2 * (1 - a1)) / al
        d[o] = A[0] + (B[0] - A[0]) * f
        d[o + 1] = A[1] + (B[1] - A[1]) * f
        d[o + 2] = A[2] + (B[2] - A[2]) * f
        d[o + 3] = Math.round(255 * clamp(al))
      }
    x.putImageData(id, 0, 0)
    return c
  })

/* ------------------------------------------------------------------ 相机助手 */

const KM = (env: Env) => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25)
const cuOf = (env: Env) => clamp(env.lt / Math.max(0.3, cutOf(env).dur))
const lagOf = (env: Env) => Math.max(0, (env.ltb ?? env.lt) - env.lt)
const seedOf = (env: Env) => cutOf(env).seed | 0
/** 本（带时间延迟的）通道距上次节拍的时间；没有节拍时按 cut 时钟取固定周期 */
const beatSince = (env: Env, per: number) => {
  const bt = env.beat
  if (bt && bt.len > 0.15) {
    let s = bt.since - lagOf(env)
    if (s < 0) s += bt.len
    return s
  }
  return wrap(env.lt, per)
}
/** 甩镜的对焦点：cut 中段（38%..72%）上的第一个节拍，没有就落在 at 比例处 */
const snapCache = new WeakMap<Cut, number>()
const snapTime = (env: Env, at: number) => {
  const c = cutOf(env)
  let v = snapCache.get(c)
  if (v != null) return v
  v = c.dur * at
  for (const b of env.plan.beats) {
    const r0 = b - c.start
    if (r0 >= c.dur * 0.38 && r0 <= c.dur * 0.72) {
      v = r0
      break
    }
  }
  snapCache.set(c, v)
  return v
}

/* ================================================================ 渐变 GRADIENT */

/** 每条彩色帷幕竖条：顶部透明 → 下缘发亮 */
const auroraStrip = (col: string) =>
  cached('aurS|' + col, () => {
    const c = mkCv(4, 256)
    const x = ctxOf(c)
    const g = x.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, rgba(col, 0))
    g.addColorStop(0.5, rgba(col, 0.22))
    g.addColorStop(0.88, rgba(col, 0.85))
    g.addColorStop(0.94, rgba(col, 1))
    g.addColorStop(1, rgba(col, 0))
    x.fillStyle = g
    x.fillRect(0, 0, 4, 256)
    return c
  })

export const pack: PackParts = {
  bg: {
    auroraRibbons: {
      tags: ['emotional', 'calm'],
      w: 0.9,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(2, 3),
        y: rng.range(0.36, 0.48),
        k: rng.range(0.2, 0.28),
        c0: rng.int(0, 3),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as AuroraRibbonsParams
        const { W, H, sc } = env
        const s = P.seed || 1
        const t = env.t
        const dk = isDark(sc.bg)
        const cols = hues(sc)
        const e = fadeIn(env, 1.2)
        const N = clamp(Math.round(W / 18), 50, 120)
        const cw = W / N
        const k = (P.k || 0.24) * e * (dk ? 1.25 : 0.8)
        const lite = cols.filter((c) => lum(c) > lum(sc.bg) + 0.12)
        const lc = dk ? (lite.length ? lite : [lightOn(sc)]) : [lightOn(sc), sc.accent]
        drawLow(ctx, env, 4, (x, q) => {
          x.imageSmoothingEnabled = true
          for (let rw = 0; rw < (P.n || 2); rw++) {
            const col = lc[((P.c0 || 0) + rw) % lc.length]
            const strip = auroraStrip(col)
            const base = H * ((P.y || 0.42) + rw * 0.1 - 0.05)
            const dir = rw % 2 ? -1 : 1
            const ph = (s % 97) * 0.13 + rw * 2.1
            for (let i = 0; i <= N; i++) {
              const u = i / N
              const xx = i * cw - cw / 2
              const y =
                base +
                H * 0.07 * Math.sin(u * TAU * 0.75 + t * 0.3 * dir + ph) +
                H * 0.045 * noise1(u * 3.5 + t * 0.22 * dir, s + rw * 7)
              const hd =
                Math.max(W, H) *
                (0.24 + 0.12 * noise1(u * 2.6 - t * 0.15, s + rw * 13 + 5)) *
                (1 - (0.3 * rw) / 3) *
                (0.8 + 0.2 * e)
              const ray =
                Math.pow(0.5 + 0.5 * noise1(u * 34 + t * 0.9 * dir, s + rw * 31), 1.4) *
                (0.7 + 0.3 * noise1(u * 13 - t * 0.4, s + rw * 3))
              const a =
                k *
                (0.2 + 1.1 * ray) *
                smooth(0, 0.18, u) *
                smooth(1, 0.82, u) *
                (0.75 + 0.25 * noise1(u * 1.5 + t * 0.1, s + rw))
              if (a <= 0.004) continue
              // 竖条对齐到（低分辨率）像素，相邻条之间才不会露缝
              const x0 = Math.round(xx * q) / q
              const x1 = Math.round((xx + cw) * q) / q
              if (x1 <= x0) continue
              x.globalAlpha = a
              x.drawImage(strip, 0, 0, 4, 256, x0, y - hd, x1 - x0, hd * 1.07)
            }
          }
        })
      },
    },

    meshBlobs: {
      tags: ['calm', 'emotional', 'pop'],
      w: 1,
      subtle: true,
      plan: (rng) => ({ seed: bs(rng), n: rng.int(3, 4), k: rng.range(0.2, 0.3) }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as MeshBlobsParams
        const { W, H, sc } = env
        const s = P.seed || 1
        const t = env.t
        const cols = hues(sc)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 1)
        const R0 = Math.max(W, H) * 0.5
        const n = P.n || 3
        drawLow(ctx, env, 6, (x) => {
          for (let i = 0; i < n; i++) {
            const w1 = rr(0.16, 0.3, s, i, 1)
            const w2 = rr(0.14, 0.26, s, i, 2)
            const cx = W * (0.5 + 0.42 * Math.sin(t * w1 + r(s, i, 3) * TAU))
            const cy = H * (0.5 + 0.4 * Math.cos(t * w2 + r(s, i, 4) * TAU))
            const R = R0 * rr(0.75, 1.1, s, i, 5) * (1 + 0.08 * Math.sin(t * 0.45 + i * 1.7))
            const c = mix(sc.bg, cols[i % cols.length], (P.k || 0.25) * (dk ? 1 : 0.75))
            const g = x.createRadialGradient(cx, cy, 0, cx, cy, R)
            g.addColorStop(0, rgba(c, 0.95 * e))
            g.addColorStop(0.45, rgba(c, 0.5 * e))
            g.addColorStop(1, rgba(c, 0))
            x.fillStyle = g
            const x0 = Math.max(0, cx - R)
            const y0 = Math.max(0, cy - R)
            const x1 = Math.min(W, cx + R)
            const y1 = Math.min(H, cy + R)
            if (x1 > x0 && y1 > y0) x.fillRect(x0, y0, x1 - x0, y1 - y0)
          }
        })
      },
    },

    duotoneSweep: {
      tags: ['calm', 'pop', 'graphic', 'emotional'],
      w: 0.9,
      subtle: true,
      plan: (rng) => ({
        seed: bs(rng),
        pos: rng.pick([
          [0.5, 1.2],
          [-0.15, 1.1],
          [1.15, 1.1],
          [0.5, -0.2],
          [-0.1, -0.1],
        ]),
        spd: rng.range(0.08, 0.14) * rng.pick([1, -1]),
        k: rng.range(0.14, 0.2),
        a0: rng.range(0, 6.28),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as DuotoneSweepParams
        const { W, H, sc } = env
        const cols = hues(sc)
        const e = fadeIn(env, 0.8)
        const k = P.k || 0.16
        const cA = mix(sc.bg, cols[0], k)
        const cB = mix(sc.bg, cols[1] || sc.fg, k)
        const pos = P.pos || [0.5, 1.2]
        const cx = W * pos[0]
        const cy = H * pos[1]
        const a = (P.a0 || 0) + env.t * (P.spd || 0.1)
        drawLow(ctx, env, 6, (x) => {
          let g = conic(x, a, cx, cy)
          if (g) {
            g.addColorStop(0, cA)
            g.addColorStop(0.25, cB)
            g.addColorStop(0.5, cA)
            g.addColorStop(0.75, cB)
            g.addColorStop(1, cA)
          } else {
            g = x.createLinearGradient(0, 0, W, H)
            g.addColorStop(0, cA)
            g.addColorStop(1, cB)
          }
          x.globalAlpha = 0.9 * e
          x.fillStyle = g
          x.fillRect(0, 0, W, H)
          // 随扫描一起游走的柔光
          const g2 = conic(x, a * 1.6 + 1, cx, cy)
          if (g2) {
            const hl = rgba(lightOn(sc), 0.07 * e)
            const z = 'rgba(0,0,0,0)'
            g2.addColorStop(0, z)
            g2.addColorStop(0.06, hl)
            g2.addColorStop(0.12, z)
            g2.addColorStop(0.56, z)
            g2.addColorStop(0.62, hl)
            g2.addColorStop(0.68, z)
            g2.addColorStop(1, z)
            x.globalAlpha = 1
            x.fillStyle = g2
            x.fillRect(0, 0, W, H)
          }
        })
      },
    },

    horizonGlow: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        cx: rng.range(0.3, 0.7),
        R: rng.range(1.3, 2.1),
        top: rng.range(0.7, 0.8),
        k: rng.range(0.28, 0.4),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as HorizonGlowParams
        const { W, H, sc } = env
        const t = env.t
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 1.1)
        const U = Umin(env)
        const R = Math.max(W, H) * (P.R || 1.6)
        const cx = W * (P.cx || 0.5) + W * 0.03 * Math.sin(t * 0.08 + ((P.seed || 1) % 9))
        const cy = H * (P.top || 0.75) + R + (1 - e) * H * 0.25 + H * 0.008 * Math.sin(t * 0.25)
        const gc = dk ? glowOf(sc) : tintC(sc, 0.8)
        const k = (P.k || 0.32) * (dk ? 1 : 0.55)
        ctx.fillStyle = dk ? mix(sc.bg, '#000000', 0.42) : mix(sc.bg, sc.fg, 0.05)
        ctx.globalAlpha = e
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU)
        ctx.fill()
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.7)
        const top = Math.max(0, cy - R * 1.22)
        if (top < H) {
          const g = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.22)
          g.addColorStop(0, rgba(gc, 0))
          g.addColorStop(0.1, rgba(gc, k * 0.25 * breathe))
          g.addColorStop(0.123, rgba(gc, k * breathe))
          g.addColorStop(0.2, rgba(gc, k * 0.45 * breathe))
          g.addColorStop(0.5, rgba(gc, k * 0.12))
          g.addColorStop(1, rgba(gc, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.rect(0, top, W, H - top)
          ctx.arc(cx, cy, R * 0.97, 0, TAU)
          ctx.fill('evenodd')
        }
        ctx.strokeStyle = rgba(gc, Math.min(0.8, k * 1.6))
        ctx.lineWidth = Math.max(1, U * 0.0022)
        ctx.beginPath()
        ctx.arc(cx, cy, R, Math.PI, TAU)
        ctx.stroke()
        // 一道亮光沿行星边缘缓慢滑动
        const fa = -Math.PI / 2 + 0.22 * Math.sin(t * 0.12 + ((P.seed || 1) % 13))
        const fx = cx + Math.cos(fa) * R
        const fy = cy + Math.sin(fa) * R
        const fr = U * 0.3
        const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr)
        g2.addColorStop(0, rgba(dk ? gc : lightOn(sc), k * 0.9 * breathe))
        g2.addColorStop(0.3, rgba(gc, k * 0.25))
        g2.addColorStop(1, rgba(gc, 0))
        ctx.fillStyle = g2
        ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
      },
    },
    /* ========================================================== 纹样 PATTERN */

    seigaiha: {
      tags: ['calm', 'editorial', 'graphic'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        R: rng.range(0.07, 0.1),
        rings: rng.int(3, 4),
        k: rng.range(0.075, 0.1),
        dir: rng.pick([1, -1]),
        acc: rng.chance(0.3),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SeigaihaParams
        const { sc } = env
        const t = env.t
        const R = Umin(env) * (P.R || 0.08)
        const rings = P.rings || 4
        const e = fadeIn(env, 0.7)
        const col = P.acc ? tintC(sc, (P.k || 0.09) * 1.6) : layC(sc, P.k || 0.09)
        const fillCol = layC(sc, (P.k || 0.09) * 0.35)
        const key = `sgh|${col}|${rings}|${R.toFixed(2)}`
        const pl = plate(key, env, 2 * R, R, (x, w, h) => {
          const tile = tileCv(key, env, 2 * R, R, (y) => {
            const lw = R * 0.075
            for (let j = -3; j <= 4; j++)
              for (let i = -1; i <= 2; i++) {
                const cx = i * 2 * R + (j & 1 ? R : 0)
                const cy = (j * R) / 2
                y.globalCompositeOperation = 'destination-out'
                y.fillStyle = '#000'
                y.beginPath()
                y.arc(cx, cy, R, 0, TAU)
                y.fill()
                y.globalCompositeOperation = 'source-over'
                y.fillStyle = fillCol
                y.beginPath()
                y.arc(cx, cy, (R / rings) * 0.62, 0, TAU)
                y.fill()
                y.strokeStyle = col
                y.lineWidth = lw
                y.beginPath()
                for (let m = 0; m < rings; m++) {
                  const rad = R * (1 - m / rings) - lw * 0.6
                  if (rad > lw) {
                    y.moveTo(cx + rad, cy)
                    y.arc(cx, cy, rad, 0, TAU)
                  }
                }
                y.stroke()
              }
          })
          fillTile(x, tile, 2 * R, R, 0, 0, w, h)
        })
        ctx.globalAlpha = e
        blit(
          ctx,
          env,
          pl,
          wrap(t * R * 0.22 * (P.dir || 1), 2 * R),
          wrap(R * 0.5 + Math.sin(t * 0.5) * R * 0.08 - (1 - e) * R * 0.5, R),
        )
      },
    },

    asanoha: {
      tags: ['calm', 'editorial', 'graphic', 'emotional'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        a: rng.range(0.1, 0.14),
        k: rng.range(0.09, 0.12),
        dx: rng.pick([1, -1]),
        sweep: rng.range(0.07, 0.12),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as AsanohaParams
        const { W, H, sc } = env
        const t = env.t
        const a = Umin(env) * (P.a || 0.12)
        const h = (a * Math.sqrt(3)) / 2
        const e = fadeIn(env, 0.8)
        const col = layC(sc, P.k || 0.09)
        const key = `asa|${col}|${a.toFixed(2)}`
        const pl = plate(key, env, a, 2 * h, (x, w, hh) => {
          const tile = tileCv(key, env, a, 2 * h, (y) => {
            const pt = (row: number, i: number): Pt => [i * a + (row & 1 ? a / 2 : 0), row * h]
            y.strokeStyle = col
            y.lineWidth = Math.max(0.8, a * 0.018)
            y.lineCap = 'round'
            y.beginPath()
            const tri = (A: Pt, B: Pt, C: Pt) => {
              const gx = (A[0] + B[0] + C[0]) / 3
              const gy = (A[1] + B[1] + C[1]) / 3
              y.moveTo(A[0], A[1])
              y.lineTo(B[0], B[1])
              y.lineTo(C[0], C[1])
              y.closePath()
              for (const Q of [A, B, C]) {
                y.moveTo(gx, gy)
                y.lineTo(Q[0], Q[1])
              }
            }
            for (let row = -2; row <= 3; row++)
              for (let i = -2; i <= 2; i++) {
                if (!(row & 1)) {
                  tri(pt(row, i), pt(row, i + 1), pt(row + 1, i))
                  tri(pt(row + 1, i), pt(row + 1, i + 1), pt(row, i + 1))
                } else {
                  tri(pt(row, i), pt(row, i + 1), pt(row + 1, i + 1))
                  tri(pt(row + 1, i), pt(row + 1, i + 1), pt(row, i))
                }
              }
            y.stroke()
          })
          fillTile(x, tile, a, 2 * h, 0, 0, w, hh)
        })
        const ox = wrap(t * a * 0.08 * (P.dx || 1), a)
        const oy = wrap(t * h * 0.05 + (1 - e) * h, 2 * h)
        ctx.globalAlpha = e
        blit(ctx, env, pl, ox, oy)
        // 一道缓慢的对角光带把纹样重画得更亮（嵌套带 → 软边缘）
        const D = W + H
        const c = (wrap(bgT(env) * (P.sweep || 0.09) + 0.4, 1.5) - 0.25) * D
        const bw = Umin(env) * 0.22
        for (const [f, al] of [
          [1, 0.4],
          [0.6, 0.4],
          [0.3, 0.45],
        ]) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(c - bw * f, 0)
          ctx.lineTo(c + bw * f, 0)
          ctx.lineTo(c + bw * f - H, H)
          ctx.lineTo(c - bw * f - H, H)
          ctx.closePath()
          ctx.clip()
          ctx.globalAlpha = e * al
          blit(ctx, env, pl, ox, oy)
          ctx.restore()
        }
      },
    },

    houndstooth: {
      tags: ['graphic', 'editorial', 'pop'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        c: rng.range(0.04, 0.055),
        k: rng.range(0.055, 0.075),
        dx: rng.pick([1, -1]),
        acc: rng.chance(0.25),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as HoundstoothParams
        const { sc } = env
        const t = env.t
        const c = Umin(env) * (P.c || 0.045)
        const e = fadeIn(env, 0.6)
        const col = P.acc ? tintC(sc, (P.k || 0.065) * 1.7) : layC(sc, P.k || 0.065)
        const key = `hnd|${col}|${c.toFixed(2)}`
        const pl = plate(key, env, 2 * c, 2 * c, (x, w, h) => {
          const tile = tileCv(key, env, 2 * c, 2 * c, (y) => {
            y.fillStyle = col
            y.beginPath()
            for (const [ox, oy] of [
              [0, 0],
              [2 * c, 0],
              [0, 2 * c],
              [2 * c, 2 * c],
              [-2 * c, 0],
              [0, -2 * c],
            ]) {
              y.rect(ox, oy, c, c)
              for (const [bx, by] of [
                [ox + c, oy],
                [ox, oy + c],
              ]) {
                pathPoly(y, [
                  [bx, by],
                  [bx + c / 2, by],
                  [bx, by + c / 2],
                ])
                pathPoly(y, [
                  [bx + c, by],
                  [bx + c, by + c / 2],
                  [bx + c / 2, by + c],
                  [bx, by + c],
                ])
              }
            }
            y.fill()
          })
          fillTile(x, tile, 2 * c, 2 * c, 0, 0, w, h)
        })
        const d = t * c * 0.35
        ctx.globalAlpha = e
        blit(ctx, env, pl, wrap(d * (P.dx || 1), 2 * c), wrap(d * 0.6, 2 * c))
      },
    },

    herringbone: {
      tags: ['editorial', 'calm', 'graphic'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        u: rng.range(0.032, 0.045),
        k: rng.range(0.07, 0.1),
        dir: rng.pick([1, -1]),
        rot: rng.pick([45, 45, -45]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as HerringboneParams
        const { W, H, sc } = env
        const t = env.t
        const u = Umin(env) * (P.u || 0.038)
        const e = fadeIn(env, 0.7)
        const k = P.k || 0.08
        const rot = P.rot || 45
        const cA = layC(sc, k)
        const cB = layC(sc, k * 0.45)
        const key = `hrb|${cA}|${cB}|${u.toFixed(2)}`
        const Pd = 4 * u * Math.SQRT2 // 45° 编织在屏幕空间里的周期
        const pl = plate(key + '|' + rot, env, Pd, Pd, (x, w, h) => {
          const tile = tileCv(key, env, 4 * u, 4 * u, (y) => {
            const g = u * 0.1
            const brick = (x0: number, y0: number, bwidth: number, bheight: number, c: string) => {
              y.fillStyle = c
              y.fillRect(x0 * u + g, y0 * u + g, bwidth * u - 2 * g, bheight * u - 2 * g)
            }
            for (let kk = -8; kk <= 8; kk++)
              for (let m = -4; m <= 4; m++) {
                const bx = kk + 2 * m
                const by = kk - 2 * m
                if (bx > 6 || bx < -3 || by > 6 || by < -3) continue
                brick(bx, by, 2, 1, cA)
                brick(bx + 2, by - 1, 1, 2, cB)
              }
          })
          const D = Math.hypot(w, h) / 2 + 4 * u
          x.translate(w / 2, h / 2)
          x.rotate(rot * DEG)
          fillTile(x, tile, 4 * u, 4 * u, -D, -D, 2 * D, 2 * D)
        })
        const sp = t * u * 0.6 * (P.dir || 1) // 沿锯齿列行进
        ctx.globalAlpha = e
        blit(ctx, env, pl, rot > 0 ? Pd / 2 : wrap(sp, Pd), rot > 0 ? wrap(sp, Pd) : Pd / 2)
        // 缓慢掠过织面的光带
        const L = W + H
        const bx = (wrap(t * 0.1, 1.6) - 0.3) * L
        const bw = Umin(env) * 0.35
        const hc = lightOn(sc)
        const gl = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0)
        gl.addColorStop(0, rgba(hc, 0))
        gl.addColorStop(0.5, rgba(hc, isDark(sc.bg) ? 0.035 : 0.08))
        gl.addColorStop(1, rgba(hc, 0))
        ctx.globalAlpha = e
        ctx.fillStyle = gl
        ctx.save()
        ctx.transform(1, 0, -0.6, 1, 0, 0)
        ctx.fillRect(bx - bw, 0, bw * 2, H)
        ctx.restore()
      },
    },

    argyle: {
      tags: ['pop', 'graphic', 'editorial'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        dw: rng.range(0.16, 0.22),
        asp: rng.range(1.3, 1.5),
        k: rng.range(0.06, 0.085),
        up: rng.pick([1, -1]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as ArgyleParams
        const { W, sc } = env
        const t = env.t
        const dw = Umin(env) * (P.dw || 0.18)
        const dh = dw * (P.asp || 1.4)
        const k = P.k || 0.07
        const e = fadeIn(env, 0.6)
        const cA = layC(sc, k)
        const cB = tintC(sc, k * 1.6)
        const cL = layC(sc, k * 3)
        const kd = `arg|${cA}|${cB}|${dw.toFixed(2)}|${dh.toFixed(2)}`
        const kl = `argL|${cL}|${dw.toFixed(2)}|${dh.toFixed(2)}`
        const dia = plate(kd, env, 2 * dw, 2 * dh, (x, w, h) =>
          fillTile(
            x,
            tileCv(kd, env, 2 * dw, 2 * dh, (y) => {
              for (let j = -1; j <= 2; j++)
                for (let i = -1; i <= 2; i++) {
                  y.fillStyle = (i + j) & 1 ? cB : cA
                  y.beginPath()
                  const cx = i * dw
                  const cy = j * dh
                  pathPoly(y, [
                    [cx, cy - dh / 2],
                    [cx + dw / 2, cy],
                    [cx, cy + dh / 2],
                    [cx - dw / 2, cy],
                  ])
                  y.fill()
                }
            }),
            2 * dw,
            2 * dh,
            0,
            0,
            w,
            h,
          ),
        )
        const lines = plate(kl, env, dw, dh, (x, w, h) =>
          fillTile(
            x,
            tileCv(kl, env, dw, dh, (y) => {
              const L = Math.hypot(dw, dh)
              y.strokeStyle = cL
              y.lineWidth = Math.max(0.8, dw * 0.012)
              y.setLineDash([L / 12, L / 12])
              for (const [ox, oy] of [
                [0, 0],
                [dw, 0],
                [0, dh],
                [-dw, 0],
                [0, -dh],
              ]) {
                y.beginPath()
                y.moveTo(ox - dw / 2, oy)
                y.lineTo(ox + dw / 2, oy + dh)
                y.stroke()
                y.beginPath()
                y.moveTo(ox + dw / 2, oy)
                y.lineTo(ox - dw / 2, oy + dh)
                y.stroke()
              }
            }),
            dw,
            dh,
            0,
            0,
            w,
            h,
          ),
        )
        const d = t * dh * 0.1 * (P.up || 1)
        ctx.globalAlpha = e
        blit(ctx, env, dia, wrap(dw - W / 2, 2 * dw), wrap(d - (1 - e) * dh * 0.3, 2 * dh))
        ctx.globalAlpha = e * 0.9
        blit(ctx, env, lines, wrap(dw / 2 - W / 2 - d * 0.6, dw), wrap(-d, dh))
      },
    },
    tartan: {
      tags: ['pop', 'calm', 'editorial'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        S: rng.range(0.34, 0.5),
        w1: rng.range(0.18, 0.28),
        w2: rng.range(0.08, 0.13),
        k: rng.range(0.085, 0.115),
        acc: rng.chance(0.6),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as TartanParams
        const { sc } = env
        const t = env.t
        const S = Umin(env) * (P.S || 0.42)
        const k = P.k || 0.1
        const e = fadeIn(env, 0.8)
        const cA = layC(sc, k)
        const cB = P.acc ? tintC(sc, k * 1.5) : layC(sc, k * 0.6)
        const cL = layC(sc, k * 1.6)
        const cT = tintC(sc, k * 2.4)
        const w1 = P.w1 || 0.22
        const w2 = P.w2 || 0.1
        const key = `tart|${cA}|${cB}|${cL}|${cT}|${w1.toFixed(3)}|${w2.toFixed(3)}|${S.toFixed(1)}`
        // 一组镜像的条纹 sett：宽带 / 细线 / 中带 / 发丝线
        const sett: [number, number, string, number][] = [
          [0, w1, cA, 0.6],
          [w1 + 0.04, 0.012, cL, 0.9],
          [w1 + 0.1, w2, cB, 0.55],
          [0.72, 0.008, cT, 0.9],
          [0.84, 0.02, cL, 0.7],
        ]
        const stripe = (x: Ctx, len: number, span: number) => {
          for (const [ph, w, c, a] of sett) {
            x.globalAlpha = a
            x.fillStyle = c
            for (let o = 0; o < len + S; o += S) {
              x.fillRect(o + ph * S, 0, w * S, span)
              x.fillRect(o + S - (ph + w) * S, 0, w * S, span)
            }
          }
          x.globalAlpha = 1
        }
        const vert = plate(key + '|v', env, S, 0, (x, w, h) => stripe(x, w, h))
        const hor = plate(key + '|h', env, 0, S, (x, w, h) => {
          x.transform(0, 1, 1, 0, 0, 0)
          stripe(x, h, w)
        })
        ctx.globalAlpha = e
        blit(ctx, env, vert, wrap(-t * S * 0.035, S), 0)
        blit(ctx, env, hor, 0, wrap(t * S * 0.025 + S * 0.37, S))
      },
    },

    chevron: {
      tags: ['pop', 'graphic'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        p: rng.range(0.13, 0.19),
        amp: rng.range(0.28, 0.42),
        k: rng.range(0.055, 0.075),
        dir: rng.pick([1, -1]),
        acc: rng.chance(0.3),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as ChevronParams
        const { W, sc } = env
        const t = env.t
        const pitch = Umin(env) * (P.p || 0.16)
        const D = pitch * 0.5
        const A = pitch * (P.amp || 0.35)
        const e = fadeIn(env, 0.6)
        const col = P.acc ? tintC(sc, (P.k || 0.065) * 1.7) : layC(sc, P.k || 0.065)
        const key = `chev|${col}|${pitch.toFixed(2)}|${A.toFixed(2)}`
        const pl = plate(key, env, pitch, D, (x, w, h) =>
          fillTile(
            x,
            tileCv(key, env, pitch, D, (y) => {
              y.fillStyle = col
              y.beginPath()
              for (let j = -2; j <= 3; j++) {
                const y0 = j * D + A / 2
                pathPoly(y, [
                  [-1, y0],
                  [pitch / 2, y0 - A],
                  [pitch + 1, y0],
                  [pitch + 1, y0 + D / 2],
                  [pitch / 2, y0 - A + D / 2],
                  [-1, y0 + D / 2],
                ])
              }
              y.fill()
            }),
            pitch,
            D,
            0,
            0,
            w,
            h,
          ),
        )
        ctx.globalAlpha = e
        blit(
          ctx,
          env,
          pl,
          wrap(pitch / 2 - W / 2 + Math.sin(t * 0.3) * pitch * 0.1, pitch),
          wrap(-t * D * 0.4 * (P.dir || 1) + (1 - e) * D, D),
        )
      },
    },

    isoCubes: {
      tags: ['graphic', 'pop', 'calm'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        s: rng.range(0.055, 0.075),
        k: rng.range(0.08, 0.11),
        spd: rng.range(0.2, 0.35) * rng.pick([1, -1]),
        l0: rng.range(0, 6.28),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as IsoCubesParams
        const { sc } = env
        const t = env.t
        const s = Umin(env) * (P.s || 0.065)
        const r3 = Math.sqrt(3)
        const pw = r3 * s
        const ph = 3 * s
        const e = fadeIn(env, 0.6)
        const col = layC(sc, P.k || 0.09)
        const faces = ['top', 'left', 'right'].map((f, fi) => {
          const key = `iso|${f}|${col}|${s.toFixed(2)}`
          return plate(key, env, pw, ph, (x, w, h) =>
            fillTile(
              x,
              tileCv(key, env, pw, ph, (y) => {
                y.fillStyle = col
                y.beginPath()
                for (let n2 = -2; n2 <= 3; n2++)
                  for (let n1 = -3; n1 <= 3; n1++) {
                    const cx = n1 * pw + (n2 * pw) / 2
                    const cy = n2 * 1.5 * s
                    const T: Pt = [cx, cy - s]
                    const UR: Pt = [cx + pw / 2, cy - s / 2]
                    const LR: Pt = [cx + pw / 2, cy + s / 2]
                    const B: Pt = [cx, cy + s]
                    const LL: Pt = [cx - pw / 2, cy + s / 2]
                    const UL: Pt = [cx - pw / 2, cy - s / 2]
                    const C: Pt = [cx, cy]
                    pathPoly(
                      y,
                      fi === 0 ? [T, UR, C, UL] : fi === 1 ? [UL, C, B, LL] : [UR, LR, B, C],
                    )
                  }
                y.fill()
              }),
              pw,
              ph,
              0,
              0,
              w,
              h,
            ),
          )
        })
        // 光照方向缓慢转动，三组面轮流变亮
        const L = (P.l0 || 0) + t * (P.spd || 0.25)
        const dirs = [-Math.PI / 2, (Math.PI * 5) / 6, Math.PI / 6]
        const ox = wrap(t * s * 0.25, pw)
        const oy = wrap(((t * s * 0.25) / r3) * 1.5, ph)
        faces.forEach((cv, fi) => {
          ctx.globalAlpha = e * (0.25 + 0.75 * (0.5 + 0.5 * Math.cos(L - dirs[fi])))
          blit(ctx, env, cv, ox, oy)
        })
      },
    },

    hexGrid: {
      tags: ['graphic', 'glitch', 'calm'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        s: rng.range(0.05, 0.07),
        k: rng.range(0.09, 0.12),
        mode: rng.pick(['ring', 'ring', 'sparkle']),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as HexGridParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const s = U * (P.s || 0.06)
        const r3 = Math.sqrt(3)
        const e = fadeIn(env, 0.7)
        const cols = Math.ceil(W / (r3 * s)) + 2
        const rows = Math.ceil(H / (1.5 * s)) + 2
        const hr = s * 0.9
        const cx0 = W / 2
        const cy0 = H / 2
        const lines = new Path2D()
        const lit = [new Path2D(), new Path2D(), new Path2D()]
        const R = Math.hypot(W, H) / 2
        const hex = (path: Path2D, x: number, y: number, rad: number) => {
          for (let m = 0; m < 6; m++) {
            const a = (m * 60 - 30) * DEG
            const px = x + Math.cos(a) * rad
            const py = y + Math.sin(a) * rad
            if (m) path.lineTo(px, py)
            else path.moveTo(px, py)
          }
          path.closePath()
        }
        const tw = Math.floor(t * 3)
        for (let j = -1; j < rows; j++)
          for (let i = -1; i < cols; i++) {
            const x = (i + (j & 1 ? 0.5 : 0)) * r3 * s
            const y = j * 1.5 * s
            const d = Math.hypot(x - cx0, y - cy0) / R
            if (d > e * 1.2) continue
            hex(lines, x, y, hr)
            let v: number
            if (P.mode === 'sparkle') v = r(sd, i, j, tw) < 0.05 ? 1 - fract(t * 3) * 0.6 : 0
            else
              v =
                Math.pow(0.5 + 0.5 * Math.cos((d * 3.2 - t * 0.55) * TAU), 6) *
                (0.6 + 0.4 * r(sd, i, j))
            if (v > 0.2) hex(lit[v > 0.75 ? 2 : v > 0.45 ? 1 : 0], x, y, hr * 0.86)
          }
        const k = P.k || 0.1
        ctx.strokeStyle = layC(sc, k)
        ctx.lineWidth = Math.max(1, U * 0.0022)
        ctx.stroke(lines)
        ;[0.5, 1, 1.6].forEach((m, l) => {
          ctx.fillStyle = tintC(sc, k * m)
          ctx.fill(lit[l])
        })
      },
    },

    triTess: {
      tags: ['graphic', 'calm', 'emotional'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        a: rng.range(0.1, 0.15),
        k: rng.range(0.07, 0.1),
        acc: rng.chance(0.35),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as TriTessParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const a = U * (P.a || 0.12)
        const h = (a * Math.sqrt(3)) / 2
        const e = fadeIn(env, 0.8)
        const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
        const cols = Math.ceil(W / a) + 2
        const rows = Math.ceil(H / h) + 1
        const sweep = (wrap(t * 0.07, 1.6) - 0.3) * (W + H)
        for (let row = 0; row < rows; row++)
          for (let i = -1; i < cols; i++) {
            const y0 = row * h
            const y1 = y0 + h
            const off = row & 1 ? a / 2 : 0
            for (let up = 0; up < 2; up++) {
              const x0 = i * a + off + (up ? a / 2 : 0)
              const tri: Pt[] = up
                ? [
                    [x0, y1],
                    [x0 + a, y1],
                    [x0 + a / 2, y0],
                  ]
                : [
                    [x0, y0],
                    [x0 + a, y0],
                    [x0 + a / 2, y1],
                  ]
              const gx = x0 + a / 2
              const gy = up ? y0 + h * 0.66 : y0 + h * 0.33
              let v = fbm2((gx / U) * 1.6 + t * 0.12, (gy / U) * 1.6 - t * 0.07, sd, 2)
              v += 0.35 * Math.exp(-Math.pow((gx + gy - sweep) / (U * 0.35), 2))
              v = v * e + (r(sd, row, i, up) - 0.5) * 0.12
              const lv = v > 0.78 ? 3 : v > 0.62 ? 2 : v > 0.46 ? 1 : v > 0.3 ? 0 : -1
              if (lv < 0) continue
              const pth = paths[lv]
              pth.moveTo(tri[0][0], tri[0][1])
              pth.lineTo(tri[1][0], tri[1][1])
              pth.lineTo(tri[2][0], tri[2][1])
              pth.closePath()
            }
          }
        const k = P.k || 0.085
        const cf = P.acc ? tintC : layC
        ;[0.35, 0.65, 1, 1.45].forEach((m, l) => {
          ctx.fillStyle = l === 3 && P.acc ? tintC(sc, k * m * 1.4) : cf(sc, k * m)
          ctx.fill(paths[l])
        })
      },
    },
    moire: {
      tags: ['glitch', 'graphic', 'calm'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        gap: rng.range(0.016, 0.022),
        k: rng.range(0.08, 0.11),
        amp: rng.range(0.05, 0.09),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as MoireParams
        const { sc } = env
        const t = env.t
        const U = Umin(env)
        const gap = U * (P.gap || 0.018)
        const amp = U * (P.amp || 0.07)
        const e = fadeIn(env, 0.8)
        const s = (P.seed || 1) % 17
        const col = layC(sc, P.k || 0.1)
        const M = amp * 2.2
        // 一套同心环只画一次（含余量），两缕干涉的副本都来自同一块底板
        const pl = plate(
          `moi|${col}|${gap.toFixed(2)}|${M.toFixed(1)}`,
          env,
          M * 2,
          M * 2,
          (x, w, h) => {
            const cx = w / 2
            const cy = h / 2
            const Rm = Math.hypot(w, h) / 2
            x.lineWidth = gap * 0.42
            x.strokeStyle = col
            x.beginPath()
            for (let rad = gap; rad < Rm; rad += gap) {
              x.moveTo(cx + rad, cy)
              x.arc(cx, cy, rad, 0, TAU)
            }
            x.stroke()
          },
        )
        const cs = [
          [amp * Math.sin(t * 0.33 + s), amp * 0.7 * Math.cos(t * 0.27 + s)],
          [-amp * Math.sin(t * 0.29 + s + 1), -amp * 0.7 * Math.cos(t * 0.37 + s + 2)],
        ]
        ctx.globalAlpha = e
        for (const [dx, dy] of cs) blit(ctx, env, pl, M - dx, M - dy)
      },
    },

    squareTunnel: {
      tags: ['glitch', 'graphic', 'pop'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        r: rng.range(1.22, 1.32),
        twist: rng.range(3, 7) * rng.pick([1, -1]),
        spd: rng.range(0.35, 0.6),
        k: rng.range(0.05, 0.07),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SquareTunnelParams
        const { W, H, sc } = env
        const t = env.t
        const U = Umin(env)
        const ratio = P.r || 1.26
        const lr = Math.log(ratio)
        const e = fadeIn(env, 0.5)
        const z = t * (P.spd || 0.45) + (1 - e) * 1.5
        const S0 = U * 0.08
        const maxS = Math.hypot(W, H) * 1.05
        // 第 n 个正方形的半边长是 S0 * r^(z-n)：z 前进时它越来越大（向前飞行）
        let nLo = Math.floor(z - Math.log(maxS / S0) / lr) - 2
        nLo -= ((nLo % 2) + 2) % 2 // 保持最外层正方形的奇偶性不变
        const nHi = Math.ceil(z - Math.log((U * 0.035) / S0) / lr)
        ctx.translate(W / 2, H / 2)
        ctx.beginPath()
        for (let n = nLo; n <= nHi && n - nLo < 60; n++) {
          const hs = S0 * Math.pow(ratio, z - n)
          const a = ((z - n) * (P.twist || 5) + t * 4) * DEG
          const c = Math.cos(a) * hs
          const s = Math.sin(a) * hs
          ctx.moveTo(c - s, s + c)
          ctx.lineTo(-c - s, -s + c)
          ctx.lineTo(-c + s, -s - c)
          ctx.lineTo(c + s, s - c)
          ctx.closePath()
        }
        ctx.fillStyle = layC(sc, P.k || 0.06)
        ctx.fill('evenodd')
      },
    },

    spiralArms: {
      tags: ['glitch', 'pop', 'graphic'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(3, 6),
        b: rng.range(0.26, 0.38),
        spd: rng.range(0.14, 0.24) * rng.pick([1, -1]),
        k: rng.range(0.055, 0.075),
        cy: rng.pick([0.5, 0.5, 0.56]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SpiralArmsParams
        const { W, H, sc } = env
        const t = env.t
        const U = Umin(env)
        const n = P.n || 4
        const b = P.b || 0.32
        const e = fadeIn(env, 0.7)
        const cx = W / 2
        const cy = H * (P.cy || 0.5)
        const r0 = U * 0.09
        const Rm = Math.hypot(W, H) * 0.62
        const thMax = Math.log(Rm / r0) / b
        const w = Math.PI / n
        const steps = 72
        const rot = t * (P.spd || 0.18) + (1 - e) * 1.2 * Math.sign(P.spd || 1)
        ctx.fillStyle = layC(sc, P.k || 0.065)
        ctx.beginPath()
        for (let k = 0; k < n; k++) {
          const base = rot + (k * TAU) / n
          for (let i = 0; i <= steps; i++) {
            const th = (thMax * i) / steps
            const rad = r0 * Math.exp(b * th) * (0.4 + 0.6 * e)
            const a = base + th
            if (i) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
            else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
          }
          for (let i = steps; i >= 0; i--) {
            const th = (thMax * i) / steps
            const rad = r0 * Math.exp(b * th) * (0.4 + 0.6 * e)
            const a = base + th + w
            ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
          }
          ctx.closePath()
        }
        ctx.fill()
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.42)
        g.addColorStop(0, rgba(sc.bg, 0.8))
        g.addColorStop(1, rgba(sc.bg, 0))
        ctx.fillStyle = g
        ctx.fillRect(cx - U * 0.42, cy - U * 0.42, U * 0.84, U * 0.84)
      },
    },

    topoLines: {
      tags: ['calm', 'editorial', 'graphic'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(10, 14),
        fs: rng.range(1.2, 1.7),
        k: rng.range(0.11, 0.15),
        acc: rng.chance(0.3),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as TopoLinesParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const cell = U / 24
        const e = fadeIn(env, 0.9)
        const nx = Math.ceil(W / cell) + 1
        const ny = Math.ceil(H / cell) + 1
        const fs = (P.fs || 1.4) / U
        const f = new Float32Array(nx * ny)
        for (let j = 0; j < ny; j++)
          for (let i = 0; i < nx; i++) {
            const X = i * cell * fs
            const Y = j * cell * fs
            const rx = X * 0.8 - Y * 0.6
            const ry = X * 0.6 + Y * 0.8
            const v = fbm2(
              rx + t * 0.035 + 0.35 * noise2(ry * 0.7, rx * 0.7, sd + 5),
              ry - t * 0.025,
              sd,
              3,
            )
            f[j * nx + i] = clamp((v - 0.5) * 2.1 + 0.5, -0.2, 1.2)
          }
        const n = P.n || 12
        const d = 1 / n
        const z = t * 0.06 + (1 - e) * 2
        const lines = new Path2D()
        const major = new Path2D()
        for (let m = -1; m <= n + 1; m++) {
          const L = (m + fract(z)) * d
          const g = m - Math.floor(z)
          const pth = ((g % 4) + 4) % 4 === 0 ? major : lines
          for (let j = 0; j < ny - 1; j++)
            for (let i = 0; i < nx - 1; i++) {
              const a = f[j * nx + i]
              const b = f[j * nx + i + 1]
              const c = f[(j + 1) * nx + i + 1]
              const dd = f[(j + 1) * nx + i]
              const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (dd > L ? 1 : 0)
              if (idx === 0 || idx === 15) continue
              const pt = (ed: number): Pt =>
                ed === 0
                  ? [i + (L - a) / (b - a), j]
                  : ed === 1
                    ? [i + 1, j + (L - b) / (c - b)]
                    : ed === 2
                      ? [i + (L - dd) / (c - dd), j + 1]
                      : [i, j + (L - a) / (dd - a)]
              for (const [e0, e1] of MS[idx]) {
                const p0 = pt(e0)
                const p1 = pt(e1)
                pth.moveTo(p0[0] * cell, p0[1] * cell)
                pth.lineTo(p1[0] * cell, p1[1] * cell)
              }
            }
        }
        const k = P.k || 0.13
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = e
        ctx.strokeStyle = layC(sc, k)
        ctx.lineWidth = Math.max(1, U * 0.0018)
        ctx.stroke(lines)
        ctx.strokeStyle = P.acc ? tintC(sc, k * 2.2) : layC(sc, k * 1.6)
        ctx.lineWidth = Math.max(1.5, U * 0.0036)
        ctx.stroke(major)
      },
    },

    ridgePlot: {
      tags: ['editorial', 'emotional', 'calm'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(18, 26),
        k: rng.range(0.15, 0.2),
        amp: rng.range(0.07, 0.1),
        mode: rng.pick(['center', 'center', 'wide']),
        spd: rng.range(0.18, 0.3),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as RidgePlotParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const n = P.n || 22
        const e = fadeIn(env, 1)
        const x0 = W * 0.06
        const x1 = W * 0.94
        const y0 = H * 0.2
        const y1 = H * 0.94
        const gap = (y1 - y0) / (n - 1)
        const m = clamp(Math.round((x1 - x0) / (U * 0.012)), 60, 170)
        const amp = H * (P.amp || 0.085) * (W < H ? 0.6 : 1)
        const lc = layC(sc, P.k || 0.17)
        const fillC = rgba(
          sc.bg,
          sc.paper || (env.st.texture && env.st.texture.paper > 0.5) ? 0.72 : 0.9,
        )
        ctx.lineWidth = Math.max(1, U * 0.0022)
        ctx.lineJoin = 'round'
        ctx.strokeStyle = lc
        for (let i = 0; i < n; i++) {
          const base = y0 + i * gap
          const grow = E.outCubic(clamp(e * 1.6 - (i / n) * 0.6))
          const pts: Pt[] = []
          for (let j = 0; j <= m; j++) {
            const u = j / m
            const x = lerp(x0, x1, u)
            const env1 =
              P.mode === 'wide'
                ? 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 2)
                : 0.08 + 0.92 * Math.exp(-Math.pow((u - 0.5) / 0.16, 2))
            const v = Math.pow(
              0.5 + 0.5 * fbm1(u * 7 + t * (P.spd || 0.24) + i * 0.41, sd + i * 7, 3),
              2.4,
            )
            pts.push([x, base - amp * env1 * v * 2.2 * grow - H * 0.002 * noise1(u * 40 + i, sd)])
          }
          ctx.fillStyle = fillC
          ctx.beginPath()
          ctx.moveTo(x0, base + 1)
          for (const q of pts) ctx.lineTo(q[0], q[1])
          ctx.lineTo(x1, base + 1)
          ctx.closePath()
          ctx.fill()
          ctx.beginPath()
          pts.forEach((pt, q) => {
            if (q) ctx.lineTo(pt[0], pt[1])
            else ctx.moveTo(pt[0], pt[1])
          })
          ctx.stroke()
        }
      },
    },
    /* ============================================================ 场景 SCENE */

    starfield: {
      tags: ['emotional', 'calm'],
      w: 0.9,
      plan: (rng) => ({
        seed: bs(rng),
        ang: rng.range(-0.3, 0.3) + (rng.chance(0.5) ? Math.PI : 0),
        spd: rng.range(0.8, 1.3),
        shoot: rng.chance(0.75),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as StarfieldParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 0.9)
        const col = dk ? mix(sc.bg, sc.fg, 0.92) : lum(sc.bg) < 0.78 ? '#FFFFFF' : layC(sc, 0.5)
        const area = Math.sqrt((W * H) / (1920 * 1080))
        const vx = Math.cos(P.ang || 0)
        const vy = Math.sin(P.ang || 0)
        const spd = P.spd || 1
        const layers = [
          [90, 0.0013, 0.006, 0.45],
          [46, 0.002, 0.018, 0.65],
          [18, 0.0032, 0.045, 0.85],
        ]
        ctx.fillStyle = col
        layers.forEach(([cnt, rad, sp, aB], l) => {
          const n = Math.round(cnt * area)
          const v = U * sp * spd
          for (let i = 0; i < n; i++) {
            const x = wrap(r(sd, l, i, 1) * W * 1.1 + t * v * vx, W * 1.1) - W * 0.05
            const y = wrap(r(sd, l, i, 2) * H * 1.1 + t * v * vy, H * 1.1) - H * 0.05
            const sr = U * rad * (0.6 + 0.8 * r(sd, l, i, 3))
            const tw = 0.5 + 0.5 * Math.sin(t * (1.1 + 2.6 * r(sd, l, i, 4)) + i * 1.7)
            const a = aB * (0.45 + 0.55 * tw) * e * (dk ? 1 : 0.65)
            ctx.globalAlpha = a
            if (l < 2) ctx.fillRect(x - sr, y - sr, sr * 2, sr * 2)
            else {
              ctx.beginPath()
              ctx.arc(x, y, sr, 0, TAU)
              ctx.fill()
              if (r(sd, l, i, 5) < 0.5) {
                ctx.globalAlpha = a * 0.5
                const L = sr * (4 + 3 * tw)
                const th = Math.max(0.6, sr * 0.25)
                ctx.fillRect(x - L, y - th / 2, L * 2, th)
                ctx.fillRect(x - th / 2, y - L, th, L * 2)
              }
            }
          }
        })
        if (P.shoot !== false) {
          const per = 3.4
          const idx = Math.floor(t / per)
          const age = t - idx * per - r(sd, idx, 8) * 1.5
          if (age > 0 && age < 0.75 && r(sd, idx, 9) < 0.85) {
            const q = age / 0.75
            const sx = W * rr(0.15, 0.7, sd, idx, 1)
            const sy = H * rr(0.05, 0.35, sd, idx, 2)
            const ang = rr(20, 38, sd, idx, 3) * DEG * (r(sd, idx, 4) < 0.5 ? 1 : -1)
            const dx = Math.cos(ang) * (ang < 0 ? -1 : 1)
            const dy = Math.abs(Math.sin(ang))
            const L = U * 0.55
            const hx = sx + dx * L * E.outQuad(q)
            const hy = sy + dy * L * E.outQuad(q)
            const tl = U * 0.16 * Math.sin(Math.PI * q)
            const g = ctx.createLinearGradient(hx, hy, hx - dx * tl, hy - dy * tl)
            g.addColorStop(0, rgba(col, 0.8 * e * (1 - q * 0.6)))
            g.addColorStop(1, rgba(col, 0))
            ctx.globalAlpha = 1
            ctx.strokeStyle = g
            ctx.lineWidth = Math.max(1, U * 0.002)
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(hx, hy)
            ctx.lineTo(hx - dx * tl, hy - dy * tl)
            ctx.stroke()
          }
        }
      },
    },

    nightMoon: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        side: rng.pick([1, -1]),
        R: rng.range(0.11, 0.15),
        phase: rng.pick(['full', 'crescent', 'crescent']),
        k: rng.range(0.18, 0.26),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as NightMoonParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 1.2)
        const side = P.side || 1
        const port = H > W
        const R = U * (P.R || 0.13)
        const mx = W * (0.5 + side * (port ? 0.2 : 0.3))
        const my = H * (port ? 0.2 : 0.27) + (1 - e) * H * 0.06
        const moonC = dk
          ? mix(sc.bg, glowOf(sc) === sc.fg ? sc.fg : mix(sc.fg, glowOf(sc), 0.3), P.k || 0.22)
          : mix(sc.bg, '#FFFFFF', 0.55)
        const haloC = dk ? moonC : mix(sc.bg, '#FFFFFF', 0.7)
        // 星点（稀疏、闪烁）
        const nS = Math.round(28 * Math.sqrt((W * H) / (1920 * 1080)))
        ctx.fillStyle = dk ? layC(sc, 0.55) : layC(sc, 0.2)
        for (let i = 0; i < nS; i++) {
          const x = r(sd, i, 1) * W
          const y = r(sd, i, 2) * H * 0.62
          const sr = U * rr(0.001, 0.0024, sd, i, 3)
          if (Math.hypot(x - mx, y - my) < R * 2.2) continue
          ctx.globalAlpha = e * (0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * rr(0.8, 2.4, sd, i, 4) + i)))
          ctx.fillRect(x - sr, y - sr, sr * 2, sr * 2)
        }
        ctx.globalAlpha = e
        const br = 0.9 + 0.1 * Math.sin(t * 0.7)
        const g = ctx.createRadialGradient(mx, my, R * 0.9, mx, my, R * 3.4)
        g.addColorStop(0, rgba(haloC, (dk ? 0.35 : 0.5) * br))
        g.addColorStop(0.3, rgba(haloC, (dk ? 0.1 : 0.18) * br))
        g.addColorStop(1, rgba(haloC, 0))
        ctx.fillStyle = g
        ctx.fillRect(mx - R * 3.4, my - R * 3.4, R * 6.8, R * 6.8)
        ctx.save()
        if (P.phase === 'crescent') {
          ctx.beginPath()
          ctx.rect(mx - R * 2, my - R * 2, R * 4, R * 4)
          ctx.arc(mx + side * R * 0.42, my - R * 0.22, R * 0.9, 0, TAU)
          ctx.clip('evenodd')
        }
        ctx.fillStyle = moonC
        ctx.beginPath()
        ctx.arc(mx, my, R, 0, TAU)
        ctx.fill()
        if (P.phase !== 'crescent') {
          ctx.fillStyle = mix(moonC, sc.bg, 0.22)
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const a = r(sd, i, 11) * TAU
            const d = R * Math.sqrt(r(sd, i, 12)) * 0.7
            const cr = R * rr(0.08, 0.2, sd, i, 13)
            ctx.moveTo(mx + Math.cos(a) * d + cr, my + Math.sin(a) * d)
            ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, cr, 0, TAU)
          }
          ctx.fill()
        }
        ctx.restore()
        // 细云丝飘过月面
        const cloudC = dk ? mix(sc.bg, sc.fg, 0.07) : mix(sc.bg, sc.fg, 0.05)
        const cap = (x: number, y: number, w: number, h: number) => {
          ctx.moveTo(x + h / 2, y)
          ctx.lineTo(x + w - h / 2, y)
          ctx.arc(x + w - h / 2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2)
          ctx.lineTo(x + h / 2, y + h)
          ctx.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5)
          ctx.closePath()
        }
        ctx.fillStyle = cloudC
        for (let i = 0; i < 3; i++) {
          const w = U * rr(0.4, 0.7, sd, i, 21)
          const h = U * rr(0.02, 0.03, sd, i, 22)
          const L = W + w * 2
          const x =
            wrap(((i + r(sd, i, 23) * 0.5) / 3) * L + t * U * rr(0.025, 0.045, sd, i, 24), L) - w
          const y = my + R * (i - 1) * 0.8 + R * rr(-0.2, 0.3, sd, i, 25)
          ctx.globalAlpha = e * 0.7
          ctx.beginPath()
          cap(x, y, w, h)
          cap(x + w * rr(0.15, 0.4, sd, i, 26), y - h * 0.75, w * 0.45, h * 0.9)
          cap(x + w * rr(0.35, 0.6, sd, i, 27), y + h * 0.7, w * 0.5, h * 0.8)
          ctx.fill()
        }
      },
    },

    skyline: {
      tags: ['emotional', 'editorial', 'pop'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        k: rng.range(0.08, 0.11),
        dir: rng.pick([1, -1]),
        win: rng.range(0.22, 0.34),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SkylineParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 0.9)
        const k = P.k || 0.09
        const Lp = Math.max(W, H) * 1.5
        const rise = (1 - e) * H * 0.25
        // 城市背后的地平线辉光
        const gc = dk ? glowOf(sc) : sc.accent
        const g = ctx.createLinearGradient(0, H * 0.5, 0, H)
        g.addColorStop(0, rgba(gc, 0))
        g.addColorStop(1, rgba(gc, (dk ? 0.1 : 0.08) * e))
        ctx.fillStyle = g
        ctx.fillRect(0, H * 0.5, W, H * 0.5)
        const winLit = dk ? mix(sc.bg, glowOf(sc), 0.4) : mix(layC(sc, k * 1.1), '#FFFFFF', 0.55)
        const bands = [
          [0.6, 0.12, 0.34, 0.012],
          [1.1, 0.06, 0.2, 0.03],
        ]
        bands.forEach(([km, h0, h1, v], l) => {
          const col = layC(sc, k * km)
          const off = wrap(t * U * v * (P.dir || 1), Lp)
          const body = new Path2D()
          const wins = new Path2D()
          let x = 0
          let b = 0
          while (x < Lp && b < 80) {
            const w = U * rr(0.05, 0.12, sd, l, b, 1)
            const gapW = U * rr(0, 0.012, sd, l, b, 2)
            const h = H * rr(h0, h1, sd, l, b, 3) * (W < H ? 0.75 : 1)
            const tier = r(sd, l, b, 4) < 0.35
            const ant = r(sd, l, b, 5) < 0.25
            for (const X0 of [x - off, x - off + Lp]) {
              if (X0 > W || X0 + w < 0) continue
              const top = H - h + rise
              body.rect(X0, top, w, h + 2)
              if (tier) body.rect(X0 + w * 0.2, top - h * 0.12, w * 0.6, h * 0.12 + 1)
              if (ant)
                body.rect(
                  X0 + w * 0.5 - 1,
                  top - h * (tier ? 0.32 : 0.2),
                  Math.max(1.5, U * 0.002),
                  h * 0.2,
                )
              const cw = U * 0.022
              const ch = U * 0.03
              const nx = Math.floor((w - cw * 0.4) / cw)
              const ny = Math.floor((h - ch) / ch)
              for (let wy = 0; wy < ny && wy < 30; wy++)
                for (let wx = 0; wx < nx; wx++) {
                  const ph = Math.floor(t * 0.25 + r(sd, l, b, wx, wy) * 7)
                  if (r(sd + ph, l * 97 + b, wx, wy) > (P.win || 0.28)) continue
                  wins.rect(
                    X0 + (w - nx * cw) / 2 + wx * cw + cw * 0.3,
                    top + ch * 0.7 + wy * ch,
                    cw * 0.4,
                    ch * 0.45,
                  )
                }
            }
            x += w + gapW
            b++
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = col
          ctx.fill(body)
          ctx.globalAlpha = l ? 0.8 : 0.5
          ctx.fillStyle = winLit
          ctx.fill(wins)
        })
      },
    },

    sunsetSun: {
      tags: ['emotional', 'calm', 'pop'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        hz: rng.range(0.7, 0.76),
        R: rng.range(0.12, 0.16),
        cx: rng.pick([rng.range(0.22, 0.34), rng.range(0.66, 0.78)]),
        k: rng.range(0.28, 0.36),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SunsetSunParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 1.2)
        const k = P.k || 0.35
        const hz = H * (P.hz || 0.72) * (W < H ? 0.97 : 1)
        const R = U * (P.R || 0.14)
        const cx = W * (W < H ? 0.5 + ((P.cx || 0.3) - 0.5) * 0.6 : P.cx || 0.3)
        const bt = bgT(env)
        const cy = hz - R * 0.5 + R * 0.35 * clamp(bt / 14) + (1 - e) * R * 0.9
        const sunBase = dk ? glowOf(sc) : sc.accent
        const sunC = mix(sc.bg, sunBase, k * (dk ? 1 : 0.7))
        const sky = ctx.createLinearGradient(0, hz - H * 0.5, 0, hz)
        sky.addColorStop(0, rgba(sunBase, 0))
        sky.addColorStop(1, rgba(sunBase, (dk ? 0.12 : 0.1) * e))
        ctx.fillStyle = sky
        ctx.fillRect(0, hz - H * 0.5, W, H * 0.5)
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, W, hz)
        ctx.clip()
        const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 3)
        halo.addColorStop(0, rgba(sunC, 0.45 * e))
        halo.addColorStop(1, rgba(sunC, 0))
        ctx.fillStyle = halo
        ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6)
        ctx.globalAlpha = e
        ctx.fillStyle = sunC
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, TAU)
        ctx.fill()
        ctx.restore()
        ctx.globalAlpha = e
        ctx.fillStyle = layC(sc, 0.14)
        ctx.fillRect(0, hz - 0.5, W, Math.max(1, U * 0.0016))
        // 水面：日轮下方的闪烁倒影 + 淡淡的涌浪线
        ctx.fillStyle = sunC
        for (let j = 0; j < 18; j++) {
          const y = hz + U * 0.012 * Math.pow(j + 1, 1.3)
          if (y > H) break
          const q = j / 18
          const hh = Math.max(1.2, U * 0.0035 * (1 + j * 0.1))
          const wv = R * (1.25 - q * 0.6) * (0.55 + 0.45 * noise1(t * 1.3 + j * 1.9, sd))
          const xo = R * 0.18 * noise1(t * 0.9 + j * 2.7, sd + 3)
          ctx.globalAlpha = e * 0.75 * (1 - q) * (0.6 + 0.4 * noise1(t * 2 + j, sd + 5))
          const split = 0.2 + 0.15 * noise1(t * 1.7 + j * 3.3, sd + 9)
          ctx.fillRect(cx + xo - wv, y, wv * (1 - split), hh)
          ctx.fillRect(cx + xo - wv + wv * (1 + split), y, wv * (1 - split), hh)
        }
        ctx.fillStyle = layC(sc, 0.08)
        for (let j = 0; j < 7; j++) {
          const y = hz + (H - hz) * (0.12 + j * 0.13)
          const x = wrap(t * U * 0.03 * (j % 2 ? 1 : -1) + r(sd, j, 31) * W, W * 1.4) - W * 0.2
          ctx.globalAlpha = e * 0.8
          ctx.fillRect(x, y, U * rr(0.15, 0.4, sd, j, 32), Math.max(1, U * 0.0018))
        }
      },
    },
    oceanWaves: {
      tags: ['calm', 'emotional', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(9, 13),
        hz: rng.range(0.48, 0.58),
        k: rng.range(0.12, 0.17),
        dir: rng.pick([1, -1]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as OceanWavesParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const n = P.n || 11
        const hz = P.hz || 0.52
        const e = fadeIn(env, 0.9)
        const dir = P.dir || 1
        const m = clamp(Math.round(W / (U * 0.012)), 60, 200)
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        for (let i = 0; i < n; i++) {
          const q = (i + 1) / n
          const y0 = H * (hz + (1 - hz) * Math.pow(q, 1.55)) + (1 - e) * H * 0.15 * q
          const A = U * (0.004 + 0.028 * Math.pow(q, 1.4))
          const lam = W * (0.07 + 0.3 * q)
          const w = 0.9 + 0.5 * r(sd, i, 1)
          const ph = r(sd, i, 2) * TAU
          ctx.beginPath()
          for (let j = 0; j <= m; j++) {
            const x = (W * j) / m
            const u = (x / lam) * TAU
            const y =
              y0 +
              A *
                (Math.sin(u - t * w * dir + ph) +
                  0.35 * Math.sin(u * 2.3 + t * w * 1.3 * dir + ph * 2) +
                  0.2 * noise1((x / U) * 3 + t * 0.4, sd + i))
            if (j) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
          ctx.globalAlpha = e
          ctx.strokeStyle = layC(sc, (P.k || 0.14) * (0.45 + 0.75 * q))
          ctx.lineWidth = Math.max(1, U * (0.0014 + 0.0035 * q))
          ctx.stroke()
        }
      },
    },

    rainWindow: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        ang: rng.range(4, 13) * rng.pick([1, -1]),
        n: rng.int(100, 140),
        k: rng.range(0.15, 0.2),
        drops: rng.int(16, 24),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as RainWindowParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const e = fadeIn(env, 0.6)
        const k = P.k || 0.15
        const dk = isDark(sc.bg)
        const area = Math.sqrt((W * H) / (1920 * 1080))
        const n = Math.round((P.n || 70) * area)
        const tn = Math.tan((P.ang || 8) * DEG)
        const span = W + H * Math.abs(tn)
        ctx.strokeStyle = layC(sc, k)
        ctx.lineWidth = Math.max(1, U * 0.0016)
        ctx.lineCap = 'round'
        ctx.globalAlpha = e * 0.85
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const v = H * rr(1.3, 2.1, sd, i, 1)
          const L = H * rr(0.03, 0.09, sd, i, 2)
          const y = wrap(r(sd, i, 4) * (H + L) + t * v, H + L) - L
          const x = r(sd, i, 3) * span - (tn > 0 ? H * tn : 0) + y * tn
          ctx.moveTo(x, y)
          ctx.lineTo(x + L * tn, y + L)
        }
        ctx.stroke()
        const fog = ctx.createLinearGradient(0, H * 0.62, 0, H)
        fog.addColorStop(0, rgba(sc.fg, 0))
        fog.addColorStop(1, rgba(sc.fg, 0.05 * e))
        ctx.globalAlpha = 1
        ctx.fillStyle = fog
        ctx.fillRect(0, H * 0.62, W, H * 0.38)
        // 玻璃上的水珠：停住、长大，然后滑下去留下一道痕
        const dc = layC(sc, k * 1.5)
        const hc = dk ? layC(sc, k * 3.5) : mix(sc.bg, '#FFFFFF', 0.7)
        for (let i = 0; i < (P.drops || 12); i++) {
          const per = rr(3.5, 6.5, sd, i, 11)
          const u = wrap(t + r(sd, i, 12) * per, per) / per
          const u0 = 0.6
          const cyc = Math.floor((t + r(sd, i, 12) * per) / per)
          const x0 = rr(0.03, 0.97, sd, i, cyc, 13) * W
          const y0 = rr(0.04, 0.7, sd, i, cyc, 14) * H
          let dr = U * rr(0.008, 0.019, sd, i, 15)
          let x = x0
          let y = y0
          const a = e * clamp(u / 0.08)
          if (u < u0) {
            dr *= 0.65 + (0.35 * u) / u0
          } else {
            const q = (u - u0) / (1 - u0)
            y = y0 + E.inQuad(q) * H * 1.15
            x = x0 + U * 0.006 * Math.sin(q * 18 + i)
            ctx.globalAlpha = e * 0.55 * (1 - q * 0.5)
            ctx.strokeStyle = dc
            ctx.lineWidth = dr * 0.45
            ctx.beginPath()
            ctx.moveTo(x0, y0)
            ctx.quadraticCurveTo(x0 + U * 0.004 * Math.sin(i), (y0 + y) / 2, x, y - dr * 0.8)
            ctx.stroke()
          }
          if (y - dr > H) continue
          ctx.globalAlpha = a * 0.9
          ctx.fillStyle = dc
          ctx.beginPath()
          ctx.ellipse(x, y, dr * 0.9, dr, 0, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = a * 0.7
          ctx.fillStyle = hc
          ctx.beginPath()
          ctx.arc(x - dr * 0.3, y - dr * 0.35, dr * 0.28, 0, TAU)
          ctx.fill()
        }
      },
    },

    snowLayers: {
      tags: ['calm', 'emotional'],
      w: 0.9,
      plan: (rng) => ({
        seed: bs(rng),
        wind: rng.range(-0.45, 0.45),
        dens: rng.range(0.85, 1.2),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as SnowLayersParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const e = fadeIn(env, 1)
        const col = lum(sc.bg) < 0.88 ? mix(sc.bg, '#FFFFFF', 0.92) : layC(sc, 0.35)
        const spr = softDot(col)
        const area = Math.sqrt((W * H) / (1920 * 1080)) * (P.dens || 1)
        const layers = [
          [70, 0.0045, 0.05, 0.012, 0.5],
          [36, 0.009, 0.09, 0.02, 0.6],
          [11, 0.02, 0.16, 0.035, 0.32],
        ]
        layers.forEach(([cnt, sz, v, sw, aB], l) => {
          const n = Math.round(cnt * area)
          const vy = H * v
          const vx = vy * (P.wind || 0)
          for (let i = 0; i < n; i++) {
            const s = U * sz * (0.7 + 0.6 * r(sd, l, i, 1))
            const f = rr(0.5, 1.3, sd, l, i, 2)
            const y =
              wrap(r(sd, l, i, 3) * H * 1.2 + t * vy * (0.8 + 0.4 * r(sd, l, i, 4)), H * 1.2) -
              H * 0.1
            const x =
              wrap(r(sd, l, i, 5) * W * 1.1 + t * vx + Math.sin(t * f + i) * U * sw, W * 1.1) -
              W * 0.05
            ctx.globalAlpha = aB * e * (0.6 + 0.4 * r(sd, l, i, 6))
            ctx.drawImage(spr, x - s, y - s, s * 2, s * 2)
          }
        })
      },
    },

    fireworks: {
      tags: ['pop', 'emotional'],
      w: 0.7,
      plan: (rng) => ({ seed: bs(rng), per: rng.range(0.55, 0.8), k: rng.range(0.42, 0.55) }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as FireworksParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 0.3)
        const cols = hues(sc)
        const per = P.per || 0.65
        const idx = Math.floor(t / per)
        const launch = 0.45
        const life = 2
        const K = (P.k || 0.48) * e * (dk ? 1 : 0.6)
        const g = U * 0.11
        if (dk) ctx.globalCompositeOperation = 'screen'
        ctx.lineCap = 'round'
        for (let b = idx - 5; b <= idx; b++) {
          const t0 = b * per + r(sd, b, 1) * per * 0.5
          const age = t - t0
          if (age < 0 || age > launch + life) continue
          const ox = W * rr(0.1, 0.9, sd, b, 2)
          const oy = H * rr(0.1, 0.48, sd, b, 3)
          const base = cols[hash(sd, b, 4) % cols.length]
          const c = dk ? base : mix(base, sc.bg, 0.2)
          if (age < launch) {
            const q = E.outQuad(age / launch)
            const y = lerp(H * 1.02, oy, q)
            const y2 = lerp(H * 1.02, oy, E.outQuad(Math.max(0, age - 0.12) / launch))
            ctx.globalAlpha = K * 0.6
            ctx.strokeStyle = c
            ctx.lineWidth = Math.max(1, U * 0.0022)
            ctx.beginPath()
            ctx.moveTo(ox + Math.sin(age * 30) * U * 0.002, y)
            ctx.lineTo(ox, y2)
            ctx.stroke()
            continue
          }
          const a = age - launch
          const n0 = 28 + (hash(sd, b, 5) % 14)
          const n = n0 * 2
          const V = U * rr(0.7, 1.05, sd, b, 6)
          const fade = Math.pow(1 - a / life, 1.6)
          const pos = (_j: number, tt: number, sp: number, th: number): Pt => {
            const d = (sp * (1 - Math.exp(-2.6 * tt))) / 2.6
            return [ox + Math.cos(th) * d, oy + Math.sin(th) * d + 0.5 * g * tt * tt]
          }
          ctx.strokeStyle = c
          ctx.lineWidth = Math.max(1, U * 0.0024)
          ctx.globalAlpha = K * fade
          ctx.beginPath()
          const heads: Pt[] = []
          for (let j = 0; j < n; j++) {
            const ring = j >= n0
            const th = ((j % n0) / n0) * TAU + (ring ? Math.PI / n0 : 0) + rs(sd, b, j) * 0.1
            const sp = V * (ring ? 0.55 : 1) * (0.85 + 0.15 * r(sd, b, j, 7))
            const p1 = pos(j, a, sp, th)
            const p0 = pos(j, Math.max(0, a - 0.16), sp, th)
            ctx.moveTo(p0[0], p0[1])
            ctx.lineTo(p1[0], p1[1])
            heads.push(p1)
          }
          ctx.stroke()
          ctx.fillStyle = dk ? mix(c, '#FFFFFF', 0.5) : c
          for (let j = 0; j < heads.length; j++) {
            if (a > 0.9 && r(sd, b, j, env.step) < 0.35) continue // 收尾的爆裂
            ctx.globalAlpha = K * fade
            const pr = U * 0.0028
            ctx.fillRect(heads[j][0] - pr, heads[j][1] - pr, pr * 2, pr * 2)
          }
          if (a < 0.25) {
            const fr = U * 0.12
            const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, fr)
            gg.addColorStop(0, rgba(c, K * 0.6 * (1 - a / 0.25)))
            gg.addColorStop(1, rgba(c, 0))
            ctx.globalAlpha = 1
            ctx.fillStyle = gg
            ctx.fillRect(ox - fr, oy - fr, fr * 2, fr * 2)
          }
        }
      },
    },

    cloudLayers: {
      tags: ['calm', 'emotional', 'pop'],
      w: 0.8,
      plan: (rng) => ({ seed: bs(rng), dir: rng.pick([1, -1]), k: rng.range(0.06, 0.09) }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as CloudLayersParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const e = fadeIn(env, 1)
        const k = P.k || 0.075
        const dir = P.dir || 1
        const layers = [
          [0.1, 0.3, 0.55, 0.012, 0.55],
          [0.3, 0.55, 0.8, 0.026, 0.8],
          [0.72, 0.98, 1.15, 0.05, 1.1],
        ]
        layers.forEach(([ya, yb, scl, v, km], l) => {
          const cw0 = U * 0.5 * scl
          const Lp = W + cw0 * 2.4
          const path = new Path2D()
          for (let c = 0; c < 4; c++) {
            const cw = cw0 * rr(0.75, 1.2, sd, l, c, 1)
            const x = wrap(((c + r(sd, l, c, 2) * 0.6) / 4) * Lp + t * U * v * dir, Lp) - cw * 1.2
            const y = H * rr(ya, yb, sd, l, c, 3) + (1 - e) * H * 0.05 * (l + 1)
            const np = 5 + (hash(sd, l, c) % 3)
            let rmin = 1e9
            for (let pp = 0; pp < np; pp++) {
              const f = (pp + 0.5) / np
              const pr =
                (cw / np) *
                (0.75 + 1.05 * Math.sin(Math.PI * f)) *
                (0.85 + 0.3 * r(sd, l, c, pp, 4)) *
                (1 + 0.04 * Math.sin(t * 0.6 + pp + c))
              const px = x + cw * f + rs(sd, l, c, pp, 5) * cw * 0.03
              path.moveTo(px + pr, y - pr)
              path.arc(px, y - pr, pr, 0, TAU)
              rmin = Math.min(rmin, pr)
            }
            path.rect(x + (cw * 0.5) / np, y - rmin, cw * (1 - 1 / np), rmin)
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = layC(sc, k * km)
          ctx.fill(path)
        })
      },
    },

    mountains: {
      tags: ['calm', 'emotional', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.int(3, 4),
        k: rng.range(0.07, 0.1),
        dir: rng.pick([1, -1]),
        mist: rng.chance(0.7),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as MountainsParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const e = fadeIn(env, 1.1)
        const n = P.n || 3
        const k = P.k || 0.085
        const m = clamp(Math.round(W / (U * 0.01)), 60, 220)
        const port = H > W
        for (let l = 0; l < n; l++) {
          const q = n > 1 ? l / (n - 1) : 1
          const base = H * ((port ? 0.68 : 0.64) + 0.14 * q) + (1 - e) * H * 0.3 * (1 - q * 0.4)
          const A = H * (port ? 0.17 : 0.3) * (1 - 0.35 * q)
          const off = t * 0.012 * (l + 1) * (P.dir || 1) + l * 7.3
          const sc2 = U * (0.42 + 0.2 * (1 - q))
          ctx.beginPath()
          ctx.moveTo(-2, H + 2)
          for (let j = 0; j <= m; j++) {
            const x = (W * j) / m
            const X = x / sc2 + off
            let v = 0
            let amp = 1
            let f = 1
            let nrm = 0
            for (let o = 0; o < 4; o++) {
              v += (1 - Math.abs(noise1(X * f, sd + l * 31 + o * 7))) * amp
              nrm += amp
              amp *= 0.48
              f *= 2.2
            }
            v = clamp((v / nrm - 0.4) * 1.8)
            ctx.lineTo(x, base - A * Math.pow(v, 2))
          }
          ctx.lineTo(W + 2, H + 2)
          ctx.closePath()
          ctx.fillStyle = layC(sc, k * (0.45 + 0.75 * q))
          ctx.globalAlpha = 1
          ctx.fill()
          if (P.mist !== false && l < n - 1) {
            const g = ctx.createLinearGradient(0, base - A * 0.25, 0, base + H * 0.06)
            g.addColorStop(0, rgba(sc.bg, 0))
            g.addColorStop(1, rgba(sc.bg, 0.55))
            ctx.fillStyle = g
            ctx.fillRect(0, base - A * 0.25, W, A * 0.25 + H * 0.06)
            ctx.fillStyle = rgba(sc.bg, 0.55)
            ctx.fillRect(0, base + H * 0.06, W, H)
          }
        }
      },
    },
    /* ==================================================== 质感 / 效果 TEXTURE */

    filmStrip: {
      tags: ['editorial', 'emotional', 'glitch'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        dir: rng.pick([1, -1]),
        spd: rng.range(0.6, 1.2),
        scratch: rng.chance(0.7),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as FilmStripParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = E.outExpo(clamp(bgT(env) / 0.55))
        const vert = H > W
        const b = U * 0.085
        const L = vert ? H : W
        const slide = (1 - e) * b * 1.3
        const band = dk ? layC(sc, 0.05) : layC(sc, 0.13)
        const hole = dk ? layC(sc, 0.17) : mix(sc.bg, '#FFFFFF', 0.55)
        const edge = dk ? layC(sc, 0.12) : layC(sc, 0.22)
        const pitch = b * 0.62
        const hw = b * 0.3
        const hh = b * 0.38
        const off = wrap(t * pitch * (P.spd || 0.9) * (P.dir || 1), pitch)
        const put = (a: number, c: number, w: number, h: number) =>
          vert ? ctx.rect(c, a, h, w) : ctx.rect(a, c, w, h)
        for (const side of [0, 1]) {
          const c0 = side ? (vert ? W : H) - b + slide : -slide
          ctx.fillStyle = band
          ctx.beginPath()
          put(0, c0, L, b)
          ctx.fill()
          ctx.fillStyle = edge
          ctx.beginPath()
          put(0, side ? c0 : c0 + b - Math.max(1, U * 0.002), L, Math.max(1, U * 0.002))
          ctx.fill()
          ctx.fillStyle = hole
          ctx.beginPath()
          for (let a = off - pitch; a < L + pitch; a += pitch) {
            const x = a + (pitch - hw) / 2
            const y = c0 + (b - hh) / 2 + (side ? b * 0.12 : -b * 0.12)
            const rd = b * 0.06
            if (vert) {
              if (ctx.roundRect) ctx.roundRect(y, x, hh, hw, rd)
              else ctx.rect(y, x, hh, hw)
            } else {
              if (ctx.roundRect) ctx.roundRect(x, y, hw, hh, rd)
              else ctx.rect(x, y, hw, hh)
            }
          }
          ctx.fill()
          // 每 4 个齿孔一道画格分隔线
          ctx.fillStyle = edge
          ctx.beginPath()
          for (let a = wrap(off, pitch * 4) - pitch * 4; a < L + pitch; a += pitch * 4)
            put(a, c0 + b * (side ? 0.72 : 0.08), Math.max(1, U * 0.002), b * 0.2)
          ctx.fill()
        }
        if (P.scratch !== false) {
          // 闪动的划痕与灰尘（在绘制时钟上变化）
          const st = env.step
          ctx.fillStyle = dk ? layC(sc, 0.35) : layC(sc, 0.3)
          for (let i = 0; i < 3; i++) {
            if (r(sd, st, i, 1) > 0.55) continue
            const x = r(sd, st >> 2, i, 2) * (vert ? H : W) + rs(sd, st, i, 3) * U * 0.004
            const w = Math.max(1, U * rr(0.0008, 0.002, sd, st, i, 4))
            ctx.globalAlpha = e * rr(0.1, 0.22, sd, st, i, 5)
            if (vert) ctx.fillRect(0, x, W, w)
            else ctx.fillRect(x, 0, w, H)
          }
          for (let i = 0; i < 6; i++) {
            if (r(sd, st, i, 6) > 0.5) continue
            const rd = U * rr(0.001, 0.003, sd, st, i, 7)
            ctx.globalAlpha = e * 0.25
            ctx.fillRect(r(sd, st, i, 8) * W, r(sd, st, i, 9) * H, rd * 2, rd * 1.4)
          }
        }
      },
    },

    vhsBand: {
      tags: ['glitch', 'emotional'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        h: rng.range(0.07, 0.12),
        spd: rng.range(0.08, 0.16) * rng.pick([1, -1]),
        k: rng.range(0.22, 0.32),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as VhsBandParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 0.3)
        const st = env.step
        const q = Math.min(1, env.scale || 1) * 0.5
        const nw = Math.max(64, Math.ceil(W * q))
        const nh = Math.max(32, Math.ceil(H * 0.2 * q))
        const col = dk ? sc.fg : mix(sc.fg, sc.bg, 0.2)
        const k = (P.k || 0.26) * e * (dk ? 1 : 0.75)
        const nz = vhsNoise(col, nw, nh, ((st % 3) + 3) % 3)
        const bh = H * (P.h || 0.09)
        const y = wrap(t * H * (P.spd || 0.12) + r(sd, 1) * H, H * 1.3) - H * 0.15
        ctx.imageSmoothingEnabled = false
        // 滚动带：噪声 + 软拖影 + 几条跟踪线
        const sh = Math.min(nh, Math.ceil(bh * q))
        const sy = Math.floor(r(sd, st, 2) * Math.max(1, nh - sh))
        ctx.globalAlpha = k
        ctx.drawImage(nz, 0, sy, nw, sh, rs(sd, st, 3) * U * 0.01, y, W, bh)
        const g = ctx.createLinearGradient(0, y - bh * 0.6, 0, y + bh * 1.4)
        const lc = lightOn(sc)
        g.addColorStop(0, rgba(lc, 0))
        g.addColorStop(0.4, rgba(lc, dk ? 0.05 : 0.1))
        g.addColorStop(1, rgba(lc, 0))
        ctx.globalAlpha = e
        ctx.fillStyle = g
        ctx.fillRect(0, y - bh * 0.6, W, bh * 2)
        ctx.fillStyle = layC(sc, dk ? 0.3 : 0.2)
        for (let i = 0; i < 3; i++) {
          const ly = y + bh * r(sd, st >> 1, i, 4)
          const lx = r(sd, st, i, 5) * W * 0.6
          ctx.globalAlpha = e * 0.5
          ctx.fillRect(lx, ly, W * rr(0.2, 0.6, sd, st, i, 6), Math.max(1, U * 0.0016))
        }
        // 底部的换头带：撕裂、横向错位的噪声
        const hb = H * 0.028
        const rows = 4
        for (let row = 0; row < rows; row++) {
          const ry = H - hb + (hb * row) / rows
          const dx = rs(sd, st, row, 7) * U * 0.03 + (U * 0.02 * (rows - row)) / rows
          ctx.globalAlpha = k * 0.9
          ctx.drawImage(
            nz,
            0,
            (sy + row * 3) % Math.max(1, nh - 2),
            nw,
            2,
            dx,
            ry,
            W,
            hb / rows + 0.5,
          )
        }
      },
    },

    tornPaper: {
      tags: ['editorial', 'emotional', 'pop'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        v: rng.pick(['tb', 'tb', 'diag', 'side']),
        k: rng.range(0.05, 0.08),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as TornPaperParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const bt = bgT(env)
        const k = P.k || 0.065
        let v = P.v || 'tb'
        if (v === 'side' && H > W) v = 'tb'
        // [A, B, n] = 从 A 到 B 的边，纸面盖在法线 n 所指的一侧
        const S: [Pt, Pt, Pt][] =
          v === 'diag'
            ? [
                [
                  [-W * 0.05, H * 0.58],
                  [W * 0.5, H * 1.05],
                  [-0.7, 0.7],
                ],
                [
                  [W * 0.55, -H * 0.05],
                  [W * 1.05, H * 0.48],
                  [0.7, -0.7],
                ],
              ]
            : v === 'side'
              ? [
                  [
                    [W * 0.13, -H * 0.05],
                    [W * 0.1, H * 1.05],
                    [-1, 0],
                  ],
                  [
                    [W * 0.9, -H * 0.05],
                    [W * 0.87, H * 1.05],
                    [1, 0],
                  ],
                ]
              : [
                  [
                    [-W * 0.05, H * 0.83],
                    [W * 1.05, H * 0.79],
                    [0, 1],
                  ],
                  [
                    [-W * 0.05, H * 0.13],
                    [W * 1.05, H * 0.17],
                    [0, -1],
                  ],
                ]
        const tones = dk
          ? [layC(sc, k), mix(sc.bg, sc.accent, k * 1.6)]
          : [mix(sc.bg, '#FFFFFF', 0.5), layC(sc, k)]
        S.forEach(([A, B, nrm], i) => {
          const inP = E.outCubic(clamp((bt - i * 0.12) / 0.6))
          const push = (1 - inP) * U * 0.35 + Math.sin(t * 0.5 + i * 2) * U * 0.004
          const ox = nrm[0] * push
          const oy = nrm[1] * push
          const len = Math.hypot(B[0] - A[0], B[1] - A[1])
          const N = Math.min(260, Math.ceil(len / (U * 0.009)))
          const tx = (B[0] - A[0]) / len
          const ty = (B[1] - A[1]) / len
          const pts: Pt[] = []
          for (let j = 0; j <= N; j++) {
            const u = j / N
            const o =
              U *
              (0.018 * noise1(u * 9, sd + i * 17) +
                0.007 * noise1(u * 45, sd + i * 5) +
                0.0035 * rs(sd, i, j))
            pts.push([
              A[0] + (B[0] - A[0]) * u + nrm[0] * o + ox,
              A[1] + (B[1] - A[1]) * u + nrm[1] * o + oy,
            ])
          }
          const far = Math.hypot(W, H)
          const poly: Pt[] = [
            ...pts,
            [B[0] + nrm[0] * far + ox + tx * far * 0.2, B[1] + nrm[1] * far + oy + ty * far * 0.2],
            [A[0] + nrm[0] * far + ox - tx * far * 0.2, A[1] + nrm[1] * far + oy - ty * far * 0.2],
          ]
          const sd2 = U * 0.008
          ctx.save()
          ctx.translate(-nrm[0] * sd2 * 0.5, -nrm[1] * sd2 * 0.5 + sd2 * 0.6)
          ctx.fillStyle = `rgba(0,0,0,${dk ? 0.35 : 0.1})`
          ctx.beginPath()
          pathPoly(ctx, poly)
          ctx.fill()
          ctx.restore()
          ctx.fillStyle = tones[i % 2]
          ctx.beginPath()
          pathPoly(ctx, poly)
          ctx.fill()
          // 纤维状的撕口（裂口处露出更亮的纸芯）
          ctx.strokeStyle = dk ? layC(sc, k * 2.4) : mix(tones[i % 2], '#FFFFFF', 0.75)
          ctx.lineWidth = Math.max(1, U * 0.004)
          ctx.lineJoin = 'round'
          ctx.beginPath()
          pts.forEach((pt, q) => {
            if (q) ctx.lineTo(pt[0] - nrm[0] * U * 0.002, pt[1] - nrm[1] * U * 0.002)
            else ctx.moveTo(pt[0], pt[1])
          })
          ctx.stroke()
        })
      },
    },

    godRays: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.8,
      plan: (rng) => ({
        seed: bs(rng),
        x: rng.pick([rng.range(0.12, 0.35), rng.range(0.65, 0.88), 0.5]),
        n: rng.int(7, 11),
        spread: rng.range(45, 75),
        k: rng.range(0.11, 0.16),
        dust: rng.chance(0.75),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as GodRaysParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 1)
        const rc = dk ? lightOn(sc) : lum(sc.bg) < 0.8 ? '#FFFFFF' : mix(sc.accent, sc.bg, 0.3)
        const k = (P.k || 0.13) * e * (dk ? 1.35 : 1.4)
        const sx = W * (P.x ?? 0.5) + W * 0.04 * Math.sin(t * 0.1 + (sd % 7))
        const sy = -H * 0.12
        const L = Math.hypot(W, H) * 1.25
        const n = P.n || 9
        const base = Math.atan2(H * 0.55 - sy, W * 0.5 - sx)
        drawLow(ctx, env, 4, (x) => {
          const paths = [new Path2D(), new Path2D(), new Path2D()]
          for (let i = 0; i < n; i++) {
            const a =
              base +
              ((P.spread || 60) * (i / (n - 1) - 0.5) +
                rs(sd, i, 1) * 4 +
                3 * noise1(t * 0.15 + i * 1.3, sd)) *
                DEG
            const w = (1.2 + 3.6 * r(sd, i, 2)) * DEG * (0.75 + 0.25 * noise1(t * 0.4 + i, sd + 7))
            const lv = 0.5 + 0.5 * noise1(t * 0.35 + i * 2.1, sd + 3)
            const dim = lv > 0.66 ? 0 : lv > 0.33 ? 1 : 2
            ;[0.45, 1, 1.8].forEach((f, q) => {
              // 嵌套楔形 → 光束横截面上的柔和衰减
              const pth = paths[Math.min(2, q + dim)]
              const ww = w * f
              pth.moveTo(sx, sy)
              pth.lineTo(sx + Math.cos(a - ww / 2) * L, sy + Math.sin(a - ww / 2) * L)
              pth.lineTo(sx + Math.cos(a + ww / 2) * L, sy + Math.sin(a + ww / 2) * L)
              pth.closePath()
            })
          }
          const g = x.createRadialGradient(sx, sy, 0, sx, sy, L)
          g.addColorStop(0, rgba(rc, Math.min(1, k * 1.3)))
          g.addColorStop(0.3, rgba(rc, k * 0.6))
          g.addColorStop(0.7, rgba(rc, k * 0.12))
          g.addColorStop(1, rgba(rc, 0))
          x.fillStyle = g
          ;[0.55, 0.3, 0.16].forEach((m, l) => {
            x.globalAlpha = m
            x.fill(paths[l])
          })
        })
        if (P.dust !== false) {
          // 光柱里浮动的尘埃
          ctx.fillStyle = rc
          for (let i = 0; i < 26; i++) {
            const x = wrap(
              r(sd, i, 11) * W + t * U * rs(sd, i, 12) * 0.02 + Math.sin(t * 0.5 + i) * U * 0.01,
              W,
            )
            const y = wrap(r(sd, i, 13) * H + t * U * rr(-0.02, 0.01, sd, i, 14), H)
            const rd = U * rr(0.0012, 0.003, sd, i, 15)
            const near = clamp(1 - Math.hypot(x - sx, y - sy) / L)
            ctx.globalAlpha =
              e * (0.15 + 0.35 * near) * (0.5 + 0.5 * Math.sin(t * rr(0.8, 2, sd, i, 16) + i))
            ctx.fillRect(x - rd, y - rd, rd * 2, rd * 2)
          }
        }
      },
    },

    vignettePulse: {
      tags: ['emotional', 'calm', 'pop'],
      w: 0.9,
      subtle: true,
      plan: (rng) => ({
        seed: bs(rng),
        k: rng.range(0.3, 0.42),
        two: rng.chance(0.6),
        rate: rng.range(0.35, 0.55),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as VignettePulseParams
        const { W, H, sc } = env
        const t = env.t
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const e = fadeIn(env, 0.8)
        const cols = hues(sc)
        const pulse = env.beat
          ? 0.62 + 0.38 * Math.exp(-env.beat.since * 4)
          : 0.75 + 0.25 * Math.sin(t * TAU * (P.rate || 0.45))
        const k = (P.k || 0.35) * e * pulse * (dk ? 1 : 0.8)
        const cA = mix(sc.bg, cols[0], 0.7)
        const cB = mix(sc.bg, cols[1] || cols[0], 0.7)
        const R = Math.hypot(W, H) / 2
        drawLow(ctx, env, 6, (x) => {
          if (P.two !== false) {
            const rings: [number, number, string, number][] = [
              [0, 0, cA, 0],
              [W, H, cB, 1.7],
            ]
            for (const [cx, cy, c, ph] of rings) {
              const rr0 = R * (1.25 + 0.08 * Math.sin(t * 0.6 + ph))
              const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr0)
              g.addColorStop(0, rgba(c, k))
              g.addColorStop(0.45, rgba(c, k * 0.35))
              g.addColorStop(1, rgba(c, 0))
              x.fillStyle = g
              x.fillRect(0, 0, W, H)
            }
          } else {
            const g = x.createRadialGradient(
              W / 2,
              H / 2,
              U * 0.32 * (1.08 - 0.12 * pulse),
              W / 2,
              H / 2,
              R * 1.05,
            )
            g.addColorStop(0, rgba(cA, 0))
            g.addColorStop(0.6, rgba(cA, k * 0.45))
            g.addColorStop(1, rgba(cA, k * 1.1))
            x.fillStyle = g
            x.fillRect(0, 0, W, H)
          }
        })
      },
    },
    kaleidoscope: {
      tags: ['pop', 'glitch', 'emotional'],
      w: 0.6,
      plan: (rng) => ({
        seed: bs(rng),
        n: rng.pick([6, 8, 8, 10]),
        m: rng.int(6, 9),
        k: rng.range(0.075, 0.1),
        spd: rng.range(0.05, 0.1) * rng.pick([1, -1]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as KaleidoscopeParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const e = fadeIn(env, 0.8)
        const n = P.n || 8
        const m = P.m || 7
        const k = P.k || 0.085
        const cx = W / 2
        const cy = H / 2
        const R = Math.hypot(W, H) * 0.58
        const seg = Math.PI / n
        const r0 = U * 0.13
        const rot = t * (P.spd || 0.07)
        const fillP = new Path2D()
        const lineP = new Path2D()
        const put = (
          pth: Path2D,
          type: number,
          x: number,
          y: number,
          s: number,
          a: number,
          flip: number,
        ) => {
          const c = Math.cos(a)
          const si = Math.sin(a)
          const T = (px: number, py: number): Pt => [
            x + px * c - py * flip * si,
            y + px * si + py * flip * c,
          ]
          if (type === 2) {
            pth.moveTo(x + s * 0.55, y)
            pth.arc(x, y, s * 0.55, 0, TAU)
            return
          }
          const pts: Pt[] =
            type === 0
              ? [
                  [s, 0],
                  [-s / 2, s * 0.8],
                  [-s / 2, -s * 0.3],
                ]
              : [
                  [s, 0],
                  [0, s * 0.42],
                  [-s * 0.7, 0],
                  [0, -s * 0.42],
                ]
          const q = pts.map(([u, v]) => T(u, v))
          pth.moveTo(q[0][0], q[0][1])
          for (let i = 1; i < q.length; i++) pth.lineTo(q[i][0], q[i][1])
          pth.closePath()
        }
        for (let j = 0; j < m; j++) {
          const type = hash(sd, j) % 3
          const v = 0.6 + 0.8 * r(sd, j, 2)
          const rad = r0 + wrap(r(sd, j, 1) * (R - r0) + t * U * 0.05 * v, R - r0)
          const fade = clamp((rad - r0) / (U * 0.15)) * clamp((R - rad) / (U * 0.2)) * e
          if (fade <= 0.02) continue
          const phi = seg * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.35 * v + j * 1.9)))
          const s = rad * (0.09 + 0.1 * r(sd, j, 3)) * fade
          const own = t * rs(sd, j, 4) * 1.2 + j
          const pth = r(sd, j, 5) < 0.35 ? lineP : fillP
          for (let q = 0; q < n; q++) {
            const b = rot + q * 2 * seg
            put(
              pth,
              type,
              cx + Math.cos(b + phi) * rad,
              cy + Math.sin(b + phi) * rad,
              s,
              b + phi + own,
              1,
            )
            put(
              pth,
              type,
              cx + Math.cos(b - phi) * rad,
              cy + Math.sin(b - phi) * rad,
              s,
              b - phi - own,
              -1,
            )
          }
        }
        ctx.fillStyle = layC(sc, k)
        ctx.fill(fillP)
        ctx.strokeStyle = tintC(sc, k * 2.4)
        ctx.lineWidth = Math.max(1, U * 0.0028)
        ctx.stroke(lineP)
        // 锚定对称轴的多边形环
        ctx.strokeStyle = layC(sc, k * 0.9)
        ctx.lineWidth = Math.max(1, U * 0.002)
        ctx.globalAlpha = e
        ctx.beginPath()
        for (const [rad, dir] of [
          [U * 0.46, -1],
          [U * 0.82, 1],
        ])
          for (let q = 0; q <= 2 * n; q++) {
            const a = -rot * dir * 1.5 + q * seg
            const x = cx + Math.cos(a) * rad
            const y = cy + Math.sin(a) * rad
            if (q) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
        ctx.stroke()
      },
    },

    marble: {
      tags: ['calm', 'editorial', 'emotional'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        ang: rng.range(0, 3.14),
        freq: rng.range(1.4, 2.2),
        turb: rng.range(7, 10),
        k: rng.range(0.17, 0.22),
        acc: rng.chance(0.5),
        dir: rng.pick([1, -1]),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as MarbleParams
        const { sc } = env
        const t = env.t
        const e = fadeIn(env, 1)
        const U = Umin(env)
        const M = U * 0.12
        const s = (P.seed || 1) % 13
        const c2 = contrast(sc.accent, sc.bg) > 1.3 ? sc.accent : sc.accent2 || sc.fg
        // 低分辨率纹理 → 带余量放大成整幅底板 → 每帧整像素贴图
        const key = `marbP|${P.seed}|${(P.ang || 0).toFixed(3)}|${(P.freq || 0).toFixed(3)}|${(P.turb || 0).toFixed(3)}|${P.acc ? 1 : 0}|${sc.fg}|${c2}`
        const pl = plate(key, env, M * 2, M * 2, (x, w, h) => {
          const D = Math.max(w, h)
          const px = clamp(Math.round(D * Math.min(0.2, resQ(env) * 0.28)), 96, 440)
          x.imageSmoothingEnabled = true
          x.imageSmoothingQuality = 'high'
          x.drawImage(marbleCv(P, px, sc.fg, c2), (w - D) / 2, (h - D) / 2, D, D)
        })
        ctx.globalAlpha = (P.k || 0.23) * e * (isDark(sc.bg) ? 1 : 0.8)
        blit(
          ctx,
          env,
          pl,
          M + M * 0.9 * Math.sin(t * 0.06 * (P.dir || 1) + s),
          M + M * 0.9 * Math.cos(t * 0.045 + s * 2),
        )
      },
    },

    paperCut: {
      tags: ['pop', 'emotional', 'calm'],
      w: 0.7,
      plan: (rng) => ({
        seed: bs(rng),
        L: rng.int(3, 4),
        lobes: rng.int(5, 9),
        k: rng.range(0.06, 0.09),
        acc: rng.chance(0.5),
        p: rng.range(2.4, 3.2),
      }),
      draw(env, p) {
        const ctx = env.ctx
        const P = p as unknown as PaperCutParams
        const { W, H, sc } = env
        const t = env.t
        const sd = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const bt = bgT(env)
        const L = P.L || 3
        const k = P.k || 0.075
        const pe = 2 / (P.p || 2.8)
        const cx = W / 2
        const cy = H / 2
        const N = 144
        const lobes = P.lobes || 6
        for (let i = 0; i < L; i++) {
          const d = L > 1 ? (L - 1 - i) / (L - 1) : 0 // 1 = 最后一层（开口最小）
          const inP = E.outCubic(clamp((bt - i * 0.1) / 0.8))
          const grow = 1 + (1 - inP) * 0.7
          const rx = W * (0.41 + 0.17 * (1 - d)) * grow
          const ry = H * (0.38 + 0.17 * (1 - d)) * grow
          const ph = r(sd, i, 1) * TAU
          const sw = t * 0.25 * (i % 2 ? 1 : -1)
          const ox = Math.sin(t * 0.35 + i) * U * 0.006 * (i + 1)
          const oy = Math.cos(t * 0.3 + i) * U * 0.004 * (i + 1)
          const path = new Path2D()
          path.rect(-W, -H, W * 3, H * 3)
          for (let j = 0; j < N; j++) {
            const th = (j / N) * TAU
            const c = Math.cos(th)
            const s = Math.sin(th)
            const wv =
              1 +
              0.035 * Math.sin((lobes + i) * th + ph + sw) +
              0.014 * Math.sin((lobes * 2 + 3) * th - ph * 1.3 - sw * 0.7)
            const x = cx + ox + rx * Math.sign(c) * Math.pow(Math.abs(c), pe) * wv
            const y = cy + oy + ry * Math.sign(s) * Math.pow(Math.abs(s), pe) * wv
            if (j) path.lineTo(x, y)
            else path.moveTo(x, y)
          }
          path.closePath()
          const sh = U * 0.009
          ctx.save()
          ctx.translate(sh * 0.4, sh)
          ctx.fillStyle = `rgba(0,0,0,${dk ? 0.32 : 0.12})`
          ctx.fill(path, 'evenodd')
          ctx.restore()
          const hue = P.acc && i % 2 ? sc.accent : sc.fg
          ctx.fillStyle = dk
            ? mix(sc.bg, hue, k * (0.5 + (0.7 * (i + 1)) / L))
            : mix(sc.bg, i % 2 ? hue : '#FFFFFF', (i % 2 ? k : 0.35) * (0.6 + (0.5 * (i + 1)) / L))
          ctx.fill(path, 'evenodd')
        }
      },
    },
  },

  /* ============================================================== 相机 CAMERA */

  cam: {
    orbitDrift: {
      tags: ['calm', 'emotional', 'graphic'],
      w: 0.8,
      plan: (rng) => ({ dir: rng.pick([1, -1]), a0: rng.range(0, 6.28), sp: rng.range(1.1, 1.6) }),
      get(env, p) {
        const P = p as unknown as OrbitDriftParams
        const K = KM(env)
        const d = P.dir || 1
        const th = (P.a0 || 0) + d * env.lt * (P.sp || 1.3)
        const ap = E.outCubic(clamp(env.lt / 0.7))
        return {
          x: Math.cos(th) * env.W * 0.016 * K * ap,
          y: Math.sin(th) * env.H * 0.02 * K * ap,
          rot: Math.sin(th) * 0.9 * K * ap * d,
          s: 1.02,
        }
      },
    },

    barrelRoll: {
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.5,
      strong: true,
      plan: (rng) => ({ dir: rng.pick([1, -1]), a: rng.range(70, 110), d: rng.range(0.42, 0.55) }),
      get(env, p) {
        const P = p as unknown as BarrelRollParams
        const K = Math.min(1, KM(env))
        const q = clamp(env.lt / (P.d || 0.5))
        if (q >= 1) return {}
        const rp = 1 - E.outBack(q, 1.3) // 快速翻滚，略微过冲后回到水平
        return {
          rot: (P.dir || 1) * (P.a || 90) * K * rp,
          s: 1 - 0.12 * K * Math.sin(Math.PI * Math.min(1, q * 1.25)),
          blur: 9 * K * clamp(1 - q * 2.2),
        }
      },
    },

    pendulumSway: {
      tags: ['emotional', 'pop', 'calm'],
      w: 0.7,
      plan: (rng) => ({ a: rng.range(1.8, 2.6), per: rng.range(2, 3), side: rng.pick([1, -1]) }),
      get(env, p) {
        const P = p as unknown as PendulumSwayParams
        // 画面挂在屏幕上方的支点上：转动与横移是耦合的
        const K = KM(env)
        const damp = 0.75 + 0.25 * Math.exp(-env.lt * 0.6)
        const L = env.W * 0.62 // 任何画幅下横移都约等于宽度的 3%
        const phi =
          (P.a || 2.2) * K * (P.side || 1) * Math.cos((env.lt / (P.per || 2.4)) * TAU) * damp * DEG
        return { x: -L * Math.sin(phi), y: -L * (1 - Math.cos(phi)), rot: phi / DEG, s: 1.02 }
      },
    },

    focusIn: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.9,
      plan: (rng) => ({ d: rng.range(0.5, 0.8), b: rng.range(10, 15) }),
      get(env, p) {
        const P = p as unknown as FocusInParams
        const K = KM(env)
        const q = E.outCubic(clamp(env.lt / (P.d || 0.65)))
        return {
          blur: (1 - q) * (P.b || 12) * Math.min(1, K),
          s: 1 + 0.03 * (1 - q) + 0.012 * K * cuOf(env),
        } // 合焦时的镜头呼吸
      },
    },

    rackFocus: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.6,
      plan: (rng) => ({ b: rng.range(5, 8), at: rng.range(0.6, 0.7) }),
      get(env, p) {
        const P = p as unknown as RackFocusParams
        const K = KM(env)
        const dur = cutOf(env).dur
        const st = Math.max(dur * (P.at || 0.65), dur - 0.9)
        const q = E.inOutSine(clamp((env.lt - st) / Math.max(0.2, dur - st)))
        return {
          blur: q * (P.b || 6.5) * Math.min(1, K),
          s: 1.01 - 0.02 * q * K,
          y: env.H * 0.004 * q,
        }
      },
    },

    earthquake: {
      tags: ['glitch', 'pop', 'emotional'],
      w: 0.5,
      strong: true,
      plan: (rng) => ({ per: rng.range(0.55, 0.8), a: rng.range(0.85, 1.1) }),
      get(env, p) {
        const P = p as unknown as EarthquakeParams
        // 常态低频轰鸣 + 每个节拍一记重击（偏竖直，走 ≤24Hz 的随机时钟）
        const K = KM(env) * (P.a || 1)
        const hit = Math.exp(-beatSince(env, P.per || 0.65) * 7)
        const amp = K * (0.14 + hit)
        const sd = seedOf(env)
        const st = env.step
        return {
          x: rs(sd, st, 11) * env.W * 0.005 * amp,
          y: rs(sd, st, 12) * env.H * 0.014 * amp,
          rot: rs(sd, st, 13) * 0.45 * amp,
          s: 1.02 + 0.012 * hit * K,
          blur: 1.5 * hit * K,
        }
      },
    },

    floatNoise: {
      tags: ['calm', 'emotional'],
      w: 0.9,
      plan: (rng) => ({ f: rng.range(0.8, 1.2) }),
      get(env, p) {
        const P = p as unknown as FloatNoiseParams
        const K = KM(env)
        const t = env.lt * (P.f || 1)
        const sd = seedOf(env) + 7
        return {
          x: noise1(t * 0.6, sd) * env.W * 0.02 * K,
          y: (noise1(t * 0.5 + 5, sd + 1) * 0.7 + 0.3 * Math.sin(t * 1.3)) * env.H * 0.024 * K,
          rot: noise1(t * 0.3 + 9, sd + 2) * 1.3 * K,
          s: 1.025 + 0.012 * Math.sin(t * 0.8),
        }
      },
    },
    vertigo: {
      tags: ['emotional', 'glitch'],
      w: 0.6,
      plan: (rng) => ({ dir: rng.pick([1, -1]), a: rng.range(0.05, 0.07) }),
      get(env, p) {
        const P = p as unknown as VertigoParams
        // 缓行的推镜，透视持续扭曲：拉伸 / 切变的摆动随变焦增大
        const K = KM(env)
        const z = E.inOutSine(cuOf(env))
        const w = Math.sin(env.lt * 2.3)
        const d = P.dir || 1
        return {
          s: 1 + (P.a || 0.06) * K * z,
          sx: 1 + 0.03 * K * z * w,
          sy: 1 - 0.026 * K * z * w,
          skx: 2.2 * K * z * Math.sin(env.lt * 1.7) * d,
          rot: 0.8 * K * z * Math.sin(env.lt * 1.1 + 1) * d,
        }
      },
    },

    tiltDown: {
      tags: ['calm', 'editorial', 'emotional'],
      w: 0.8,
      plan: (rng) => ({ a: rng.range(0.024, 0.032) }),
      get(env, p) {
        const P = p as unknown as TiltDownParams
        // 镜头下摇落到这一行：画面从下方升起、落定，同时 ease out 掉轻微变焦
        const K = KM(env)
        const q = E.outCubic(cuOf(env))
        const a = env.H * (P.a || 0.028) * K
        return { y: a * (1.2 - 1.6 * q), s: 1.035 - 0.02 * q }
      },
    },

    spiralIn: {
      tags: ['pop', 'graphic', 'emotional'],
      w: 0.6,
      plan: (rng) => ({ dir: rng.pick([1, -1]), a0: rng.range(0, 6.28), d: rng.range(0.9, 1.3) }),
      get(env, p) {
        const P = p as unknown as SpiralInParams
        const K = KM(env)
        const d = P.dir || 1
        const eo = E.outCubic(clamp(env.lt / (P.d || 1.1)))
        const rp = 1 - eo
        const th = (P.a0 || 0) + d * eo * TAU * 0.8
        return {
          x: Math.cos(th) * env.W * 0.03 * K * rp,
          y: Math.sin(th) * env.H * 0.035 * K * rp,
          rot: -d * 7 * K * rp,
          s: 1 - 0.08 * K * rp + 0.015 * K * cuOf(env),
        }
      },
    },

    snapPan: {
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.7,
      plan: (rng) => ({
        dir: rng.pick([1, -1]),
        a: rng.range(0.024, 0.032),
        at: rng.range(0.45, 0.6),
      }),
      get(env, p) {
        const P = p as unknown as SnapPanParams
        // 先定住一个取景，cut 中段（有节拍就踩拍）甩到另一个取景再定住
        const K = KM(env)
        const dur = cutOf(env).dur
        const d = P.dir || 1
        const A = env.W * (P.a || 0.028) * K * d
        const drift = env.W * 0.005 * K * d * (cuOf(env) - 0.5)
        if (dur < 1.1) return { x: A * 0.5 * (1 - 2 * cuOf(env)), s: 1.02 }
        const dt = env.lt - snapTime(env, P.at || 0.5)
        const q = E.inOutCubic(clamp(dt / 0.16))
        const bell = dt > 0 && dt < 0.16 ? Math.sin((Math.PI * dt) / 0.16) : 0
        return {
          x: A * (1 - 2 * q) - drift,
          s: 1.02 + 0.015 * bell,
          skx: -d * 5 * K * bell,
          blur: 14 * K * bell,
        }
      },
    },

    jelly: {
      tags: ['pop', 'graphic'],
      w: 0.7,
      plan: (rng) => ({ a: rng.range(0.045, 0.065), f: rng.range(18, 24) }),
      get(env, p) {
        const P = p as unknown as JellyParams
        // 压扁—拉伸的弹性抖动：切换瞬间压扁，节拍上再抖一次
        const K = KM(env)
        const t = env.lt
        const f = P.f || 21
        let w = Math.exp(-t * 5) * Math.cos(t * f)
        const bt = env.beat
        if (bt && bt.len > 0.2 && t > 0.6) {
          const s = beatSince(env, 0.6)
          w += 0.45 * Math.exp(-s * 7) * Math.cos(s * f)
        }
        const A = (P.a || 0.055) * K
        return { sx: 1 + A * w, sy: 1 - A * w * 0.9, y: env.H * 0.008 * K * w, s: 1.01 }
      },
    },
  },
}
