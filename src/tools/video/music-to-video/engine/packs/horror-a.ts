/**
 * 部件包 horror（1/3）：恐怖构图——手电筒、门缝、监控、通灵板、灵异照片…
 *
 * 源自 JIZURA 的 src/11p_horror1.js（MIT）：数值常量、缓动曲线、hash 种子、坐标、时长保持一致，
 * 同一组参数渲出同一支视频。key 与注册顺序由 registry 锁定，不要改名、不要增删；
 * 集合归属（set）由 engine/sets.ts 按包名写入，这里不手写。
 */
import type { BBox, PackParts, Cut, Env, Scheme, TextItem, Rng, StylePack } from '../types'
import {
  E,
  TAU,
  DEG,
  clamp,
  lerp,
  hash,
  r as rnd,
  rs,
  rr,
  noise1,
  rgba,
  mix,
  lum,
  contrast,
  fitContrast,
} from '../util'
import { isHan, isKana, isPunct, glyphCount } from '../script'
import { splitLines, layoutText, measure, fitSize } from '../text-layout'
import { mainDraw, unionBB, fontsOf as styleFonts } from '../layouts'

import { FONTS } from '../fonts'
import { makeCanvas, ctxOf } from '../canvas'
import { layoutsOf } from '../define'

type Cell = { ch: string; x: number; y: number; rot: number }
type Slot = { x: number; y: number; sz: number; r: number; k: number }

const out: PackParts = {}
const reg = layoutsOf(out)

/** 版式/装饰只在画 cut 时被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

const TAGS: string[] = ['horror']
/* ------------------------------------------------------------------ helpers */
const U = (env: Env) => Math.min(env.W, env.H)
const isPort = (env: Env) => env.H > env.W * 1.08
const strip = (t: string) => String(t || '').replace(/\s+/g, '')
const hasLatin = (t: string) => /[A-Za-z]/.test(t)
const flat = (t: string) =>
  hasLatin(t)
    ? String(t || '')
        .trim()
        .replace(/\s+/g, ' ')
    : strip(t)
const fontsOf = (st: StylePack, roles: readonly string[]) => styleFonts(st, roles)
const bodyF = (env: Env) => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med'
const monoF = (env: Env) => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono'
const handOf = (rng: Rng, st: StylePack) =>
  FONTS.klee && rng.chance(0.75) ? 'klee' : rng.pick(fontsOf(st, ['body', 'serif']))
const tin = (env: Env, d = 0, len = 0.4, ease = E.outCubic) =>
  ease(clamp((env.lt - d) / Math.max(0.01, len)))
const tout = (env: Env) => 1 - E.inCubic(env.pOut)
const box = (x0: number, y0: number, x1: number, y1: number) => ({
  x0,
  y0,
  x1,
  y1,
  cx: (x0 + x1) / 2,
  cy: (y0 + y1) / 2,
  boxes: [],
})
const UB = unionBB
const pad2 = (n: number) => String(n).padStart(2, '0')
const miAt = (env: Env, t: number) => Math.max(0, t) / Math.max(0.005, cutOf(env).stagger || 0.04)
const isDark = (c: string) => lum(c) < 0.45
const lightOf = (sc: Scheme) => (lum(sc.fg) > lum(sc.bg) ? sc.fg : sc.bg)
const darkOf = (sc: Scheme) => (lum(sc.fg) > lum(sc.bg) ? sc.bg : sc.fg)
/* the colour of darkness over this scheme */
const nightC = (sc: Scheme) => mix(sc.bg, '#000000', isDark(sc.bg) ? 0.72 : 0.9)
/* best readable scheme colour on a plate */
const onCol = (sc: Scheme, fill: string) => {
  let best = null,
    bv = 0
  for (const c of [sc.bg, sc.fg, sc.ink, sc.sub, sc.accent]) {
    if (!c || c === fill) continue
    const k = contrast(c, fill)
    if (k > bv) {
      bv = k
      best = c
    }
  }
  return best && bv >= 2.6 ? best : lum(fill) > 0.5 ? '#111111' : '#FFFFFF'
}
const redOn = (sc: Scheme, fill: string) => fitContrast(sc.accent, fill, 2.4)
/* date / time strings from the cut seed (ASCII only) */
const fakeDate = (seed: number, sep = '/') => {
  const y = 1987 + (hash(seed, 1) % 19),
    m = 1 + (hash(seed, 2) % 12),
    d = 1 + (hash(seed, 3) % 28)
  return `${y}${sep}${pad2(m)}${sep}${pad2(d)}`
}
const fakeTime = (seed: number, t: number) => {
  const s0 = 2 * 3600 + (hash(seed, 4) % 7200) + Math.floor(Math.max(0, t))
  return `${pad2(Math.floor(s0 / 3600) % 24)}:${pad2(Math.floor(s0 / 60) % 60)}:${pad2(s0 % 60)}`
}
/* glyph centres of a laid-out text item (spaces left out) */
const slots = (it: TextItem) => {
  const lay = layoutText(it),
    sx = it.sx || 1,
    sy = it.sy || 1,
    out = []
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue
    out.push({
      ch: g.ch,
      x: it.x + g.x * sx,
      y: it.y + g.y * sy,
      w: g.w * sx,
      h: g.h * sy,
      li: g.li,
    })
  }
  return out
}
/* a full-screen veil with a soft hole: main pass only (it also hides the ghost passes' text) */
const veilHole = (
  env: Env,
  cx: number,
  cy: number,
  R: number,
  a: number,
  col: string,
  inner = 0.35,
  ry = 1,
) => {
  if (env.pass !== 'main' || a <= 0.002) return
  const ctx = env.ctx,
    W = env.W,
    H = env.H
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry)
  const g = ctx.createRadialGradient(0, 0, Math.max(0.1, R * inner), 0, 0, Math.max(1, R))
  g.addColorStop(0, rgba(col, 0))
  g.addColorStop(0.55, rgba(col, (0.3 * a).toFixed(3)))
  g.addColorStop(1, rgba(col, a.toFixed(3)))
  ctx.fillStyle = g
  ctx.fillRect(-W * 2 - cx, -(H * 2 + cy) / ry, W * 5, (H * 5) / ry)
  ctx.restore()
}
/* static noise tiles (built once, small, deterministic) */
const NOISE: HTMLCanvasElement[] = []
const noiseCv = (k: number) => {
  k = ((k % 4) + 4) % 4
  if (NOISE[k]) return NOISE[k]
  const w = 96,
    h = 72,
    c = makeCanvas()
  c.width = w
  c.height = h
  const x = ctxOf(c),
    id = x.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const v = Math.pow(rnd(i, k, 4411), 1.4) * 255
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  x.putImageData(id, 0, 0)
  NOISE[k] = c
  return c
}
const drawNoise = (
  env: Env,
  x: number,
  y: number,
  w: number,
  h: number,
  a: number,
  step: number,
  seed: number,
) => {
  if (env.pass !== 'main' || a <= 0.003 || w < 1 || h < 1) return
  const ctx = env.ctx,
    N = noiseCv(step + seed)
  ctx.save()
  ctx.globalAlpha = a
  ctx.imageSmoothingEnabled = false
  const sx = Math.floor(rnd(seed, step, 1) * 32),
    sy = Math.floor(rnd(seed, step, 2) * 24)
  ctx.drawImage(N, sx, sy, N.width - sx, N.height - sy, x, y, w, h)
  ctx.restore()
}

/* ================================================================== 1. flashlight */
/** hrFlashlight 的 plan 产物 */
type HrFlashlightParams = {
  font: string
  path: string
  rk: number
  dark: number
  dust: boolean
  sx: number
  sy: number
}

reg('hrFlashlight', {
  tags: TAGS.concat(['emotional']),
  w: 1,
  busy: true,
  ae: 'circle',
  fits: (n: number) => n >= 1 && n <= 18,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, rng.chance(0.6) ? ['serif', 'display'] : ['display'])),
      path: rng.pick(['read', 'read', 'search']),
      rk: rng.range(0.85, 1.1),
      dark: rng.range(0.9, 0.96),
      dust: rng.chance(0.7),
      sx: rng.range(-0.3, 0.3),
      sy: rng.range(-0.3, 0.3),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrFlashlightParams,
      lt = env.lt,
      s = cut.seed | 0
    const text = splitLines(flat(cut.text), isPort(env) ? 5 : 10)
    const size = Math.min(
      fitSize(text, Pm.font, W * 0.8, H * 0.42, { track: 0.06, lead: 1.25 }),
      H * 0.24,
    )
    const it: TextItem = {
      text,
      font: Pm.font,
      size,
      x: W / 2,
      y: H / 2,
      track: 0.06,
      lead: 1.25,
      color: sc.fg,
    }
    const bb = mainDraw(env, it)
    // the beam visits the glyphs in reading order, then opens up on the whole line
    const sl = slots(Object.assign({}, it))
    const m = measure(it)
    const R0 = Math.max(size * 0.9 * Pm.rk, U(env) * 0.1),
      Rall = Math.hypot(m.w, m.h) * 0.55 + size * 0.5
    const dur = cut.dur,
      t0 = Pm.path === 'search' ? dur * 0.22 : 0.1,
      t1 = dur * 0.72
    const u = clamp((lt - t0) / Math.max(0.2, t1 - t0))
    let bx, by
    if (!sl.length) {
      bx = W / 2
      by = H / 2
    } else {
      const f = u * (sl.length - 1),
        i = Math.min(sl.length - 2, Math.floor(f)),
        k = E.inOutSine(f - Math.max(0, i))
      const a = sl[Math.max(0, i)],
        b = sl[Math.min(sl.length - 1, i + 1)]
      bx = sl.length === 1 ? a.x : lerp(a.x, b.x, k)
      by = sl.length === 1 ? a.y : lerp(a.y, b.y, k)
    }
    if (Pm.path === 'search' && lt < t0) {
      // hunting around the dark before it finds the words
      const q = E.inOutSine(clamp(lt / t0)),
        sx = W * (0.5 + Pm.sx) + noise1(lt * 1.3, s) * W * 0.25,
        sy = H * (0.5 + Pm.sy) + noise1(lt * 1.1, s + 3) * H * 0.2
      bx = lerp(sx, bx, q * q)
      by = lerp(sy, by, q * q)
    }
    const tr = env.ltb
    bx += (noise1(tr * 2.2, s + 5) * 0.7 + noise1(tr * 7, s + 6) * 0.3) * size * 0.18
    by += (noise1(tr * 1.9, s + 7) * 0.7 + noise1(tr * 6.3, s + 8) * 0.3) * size * 0.14
    const open = E.inOutCubic(clamp((lt - t1) / 0.7))
    bx = lerp(bx, W / 2, open)
    by = lerp(by, H / 2, open)
    const R = lerp(R0, Math.max(R0, Rall), open) * (0.3 + 0.7 * tin(env, 0, 0.35))
    // a weak battery: rare dips
    const dip = rnd(s, env.step, 31) < 0.05 ? 0.55 : 1
    const dark = Pm.dark * tin(env, 0, 0.25) * (1 - E.inCubic(env.pOut) * 0.6)
    veilHole(env, bx, by, R * dip, dark, nightC(sc), 0.32, 0.86)
    if (Pm.dust && env.pass === 'main') {
      for (let k = 0; k < 14; k++) {
        const ph = rnd(s, k, 41) * 10,
          px = bx + noise1(tr * 0.3 + ph, s + k) * R * 0.8,
          py = by + noise1(tr * 0.25 + ph + 4, s + k + 50) * R * 0.7
        const r = U(env) * rr(0.0012, 0.003, s, k, 42)
        env.circle(
          px,
          py,
          r,
          sc.fg,
          null,
          0,
          0.35 * dark * (0.5 + 0.5 * Math.sin(tr * 2 + ph)),
          false,
        )
      }
    }
    return bb
  },
})

/* ================================================================== 2. door gap */
/** hrDoorGap 的 plan 产物 */
type HrDoorGapParams = {
  font: string
  vert: number
  side: number
  pause: number
  wedge: boolean
}

reg('hrDoorGap', {
  tags: TAGS.concat(['editorial']),
  w: 0.9,
  busy: true,
  ae: 'vcols',
  fits: (n: number) => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    const n = glyphCount(cut.text)
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      vert: n <= 7 && !hasLatin(cut.text) && rng.chance(0.75),
      side: rng.pick([-1, 1]),
      pause: rng.range(0.16, 0.26),
      wedge: rng.chance(0.8),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrDoorGapParams,
      lt = env.lt,
      s = cut.seed | 0,
      ctx = env.ctx
    const vert = !!Pm.vert
    const text = vert ? strip(cut.text) : splitLines(flat(cut.text), isPort(env) ? 5 : 11)
    const o = { track: 0.08, lead: 1.2, vertical: vert }
    const size = vert
      ? Math.min(fitSize(text, Pm.font, W * 0.3, H * 0.74, o), W * 0.2, H * 0.2)
      : Math.min(fitSize(text, Pm.font, W * 0.78, H * 0.36, o), H * 0.2)
    const it = Object.assign({ text, font: Pm.font, size, x: W / 2, y: H / 2, color: sc.fg }, o)
    const m = measure(it)
    // opening: a first crack, an uneasy pause, then wide enough to read; slams shut on the exit
    const full = (vert ? m.w : m.h) + size * 0.9
    const d = cut.dur,
      a1 = clamp(lt / 0.5),
      a2 = clamp((lt - Math.max(0.35, d * Pm.pause)) / 0.6)
    let open = 0.18 * E.outCubic(a1) + 0.82 * E.inOutCubic(a2)
    open += rs(s, env.step, 11) * 0.015 * (a2 > 0 && a2 < 1 ? 1 : 0)
    open *= 1 - E.inExpo(env.pOut)
    const g = Math.max(0, full * open)
    const bb = mainDraw(env, it)
    if (env.pass !== 'main') return bb
    const dk = nightC(sc),
      L = lightOf(sc)
    const cx = W / 2,
      cy = H / 2
    ctx.save()
    ctx.globalAlpha = 0.97 * tin(env, 0, 0.2)
    ctx.fillStyle = dk
    ctx.beginPath()
    ctx.rect(-W, -H, W * 3, H * 3)
    if (vert) {
      const h = m.h + size * 1.6
      ctx.rect(cx - g / 2, cy - h / 2, g, h)
    } else {
      const w = m.w + size * 1.6
      ctx.rect(cx - w / 2, cy - g / 2, w, g)
    }
    ctx.fill('evenodd')
    ctx.restore()
    if (g > 1) {
      // light rim on the gap edges + light spilling onto the floor
      const rimA = 0.55 * Math.min(1, g / (size * 0.3))
      if (vert) {
        const h = m.h + size * 1.6,
          y0 = cy - h / 2,
          y1 = cy + h / 2
        env.line(
          [
            [cx - g / 2, y0],
            [cx - g / 2, y1],
          ],
          L,
          Math.max(1, size * 0.02),
          rimA,
          false,
        )
        env.line(
          [
            [cx + g / 2, y0],
            [cx + g / 2, y1],
          ],
          L,
          Math.max(1, size * 0.02),
          rimA * 0.6,
          false,
        )
        if (Pm.wedge)
          env.poly(
            [
              [cx - g / 2, y1],
              [cx + g / 2, y1],
              [cx + g * 2.4 + W * 0.08 * Pm.side, H * 1.05],
              [cx - g * 1.6 + W * 0.08 * Pm.side, H * 1.05],
            ],
            L,
            0.07 * Math.min(1, g / size),
            false,
          )
      } else {
        const w = m.w + size * 1.6,
          x0 = cx - w / 2,
          x1 = cx + w / 2
        env.line(
          [
            [x0, cy - g / 2],
            [x1, cy - g / 2],
          ],
          L,
          Math.max(1, size * 0.02),
          rimA * 0.6,
          false,
        )
        env.line(
          [
            [x0, cy + g / 2],
            [x1, cy + g / 2],
          ],
          L,
          Math.max(1, size * 0.02),
          rimA,
          false,
        )
      }
    }
    return bb
  },
})

/* ================================================================== 3. obsessive wall writing */
/** hrWallScrawl 的 plan 产物 */
type HrWallScrawlParams = {
  font: string
  hand: string
  rows: number
  mainHand: boolean
  red: number
  rise: number
}

reg('hrWallScrawl', {
  tags: TAGS.concat(['glitch']),
  w: 0.9,
  busy: true,
  ae: 'tile',
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      hand: handOf(rng, st),
      rows: rng.int(7, 10),
      mainHand: rng.chance(0.4),
      red: rng.range(0.06, 0.16),
      rise: rng.range(0.55, 0.8),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrWallScrawlParams,
      s = cut.seed | 0
    const unit = flat(cut.text)
    const mainFont = Pm.mainHand ? Pm.hand : Pm.font
    const mt = splitLines(unit, isPort(env) ? 5 : 10)
    const size = Math.min(
      fitSize(mt, mainFont, W * 0.8, H * 0.3, { track: 0.04, lead: 1.1 }),
      H * 0.2,
    )
    const mm = measure({ text: mt, font: mainFont, size, track: 0.04, lead: 1.1 })
    const clear = {
      x0: W / 2 - mm.w / 2 - size * 0.4,
      x1: W / 2 + mm.w / 2 + size * 0.4,
      y0: H / 2 - mm.h / 2 - size * 0.35,
      y1: H / 2 + mm.h / 2 + size * 0.35,
    }
    // copies written line after line, faster and faster
    const rows = Pm.rows,
      rh = H / rows,
      fs = rh * 0.58
    const cw = measure({ text: unit, font: Pm.hand, size: fs, track: 0.02 }).w
    let slotsL: Slot[] = []
    const gN = Math.max(1, glyphCount(unit))
    for (let r = 0; r < rows && slotsL.length < 240; r++) {
      const y = (r + 0.5) * rh + rs(s, r, 1) * rh * 0.12
      let x = W * 0.03 + rnd(s, r, 2) * fs * 2
      for (let k = 0; k < 16 && x < W * 0.97; k++) {
        const sz = fs * rr(0.75, 1.3, s, r, k, 3),
          w = (cw * sz) / fs
        const cxk = x + w / 2
        if (
          !(
            y + sz * 0.6 > clear.y0 &&
            y - sz * 0.6 < clear.y1 &&
            x + w > clear.x0 &&
            x < clear.x1
          ) &&
          x + w < W * 1.02
        )
          slotsL.push({ x: cxk, y, sz, r, k })
        x += w + fs * rr(0.4, 1.4, s, r, k, 4)
      }
    }
    const lim = Math.max(8, Math.min(64, Math.floor(420 / gN)))
    if (slotsL.length > lim) {
      const st2 = slotsL.length / lim
      slotsL = Array.from({ length: lim }, (_, i: number) => slotsL[Math.floor(i * st2)])
    }
    const K = slotsL.length,
      T = Math.max(0.6, cut.dur * Pm.rise),
      out = tout(env)
    let glyphBudget = 420
    for (let q = 0; q < K; q++) {
      const S = slotsL[q],
        ta = T * Math.pow(q / Math.max(1, K), 0.62)
      const e = clamp((env.ltb - ta) / 0.3)
      if (e <= 0) break
      if ((glyphBudget -= gN) < 0) break
      const shown = Math.ceil(e * gN),
        seed = hash(s, q, 9)
      const red = rnd(seed, 5) < Pm.red
      env.draw({
        text: unit,
        font: Pm.hand,
        size: S.sz,
        x: S.x,
        y: S.y,
        track: 0.02,
        rot: rs(seed, 6) * 5,
        color: red ? sc.accent : sc.sub,
        alpha: (red ? 0.7 : 0.42) * out,
        ghost: false,
        charFn: (i: number) =>
          i >= shown
            ? { hide: true }
            : {
                dy: rs(seed, i, 7) * S.sz * 0.12,
                rot: rs(seed, i, 8) * 9,
                s: 1 + rs(seed, i, 10) * 0.12,
              },
      })
    }
    return mainDraw(env, {
      text: mt,
      font: mainFont,
      size,
      x: W / 2,
      y: H / 2,
      track: 0.04,
      lead: 1.1,
      color: sc.fg,
    })
  },
})

/* ================================================================== 4. CCTV monitor */
/** hrCctv 的 plan 产物 */
type HrCctvParams = {
  font: string
  v: string
  act: number
  cam0: number
  box: boolean
}

reg('hrCctv', {
  tags: TAGS.concat(['glitch', 'editorial']),
  w: 1,
  busy: true,
  treat: 'safe',
  ae: 'type',
  fits: (n: number) => n >= 1 && n <= 18,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])),
      v: rng.pick(['quad', 'quad', 'single']),
      act: rng.int(0, 3),
      cam0: rng.int(1, 12),
      box: rng.chance(0.7),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrCctvParams,
      s = cut.seed | 0,
      lt = env.lt,
      st = env.step
    const mono = monoF(env),
      port = isPort(env),
      out = tout(env),
      inA = tin(env, 0, 0.2)
    const fs = clamp(U(env) * 0.022, 11, 28),
      m = U(env) * 0.03,
      lw = Math.max(1, U(env) * 0.0016)
    const feedBg = mix(darkOf(sc), '#000000', 0.35),
      LC = lightOf(sc),
      frameC = mix(feedBg, LC, 0.5)
    const date = fakeDate(s),
      time = fakeTime(s, lt)
    const osd = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      n: number,
      live: boolean,
      bigFs = 0,
    ) => {
      const f = bigFs || fs
      env.draw({
        text: 'CAM ' + pad2(n),
        font: mono,
        size: f,
        align: 'left',
        x: x0 + f * 0.8,
        y: y0 + f * 1.2,
        color: LC,
        alpha: 0.85 * out * inA,
        ghost: false,
        track: 0.1,
      })
      env.draw({
        text: date + ' ' + time,
        font: mono,
        size: f * 0.9,
        align: 'right',
        x: x1 - f * 0.8,
        y: y1 - f * 1.1,
        color: LC,
        alpha: 0.75 * out * inA,
        ghost: false,
        track: 0.06,
      })
      if (live) {
        if (st % 4 < 2)
          env.circle(
            x1 - f * 3.9,
            y0 + f * 1.2,
            f * 0.32,
            fitContrast(sc.accent, feedBg, 3),
            null,
            0,
            out * inA,
            false,
          )
        env.draw({
          text: 'REC',
          font: mono,
          size: f,
          align: 'left',
          x: x1 - f * 3.3,
          y: y0 + f * 1.2,
          color: LC,
          alpha: 0.85 * out * inA,
          ghost: false,
        })
      }
    }
    const emptyFeed = (x0: number, y0: number, x1: number, y1: number, k: number) => {
      env.rect(x0, y0, x1 - x0, y1 - y0, feedBg, inA, false)
      const cx = (x0 + x1) / 2 + rs(s, k, 3) * (x1 - x0) * 0.12,
        cy = (y0 + y1) / 2 + rs(s, k, 4) * (y1 - y0) * 0.08,
        w = (x1 - x0) * 0.16,
        h = (y1 - y0) * 0.2
      // a corridor seen from above a doorway
      const c = mix(feedBg, LC, 0.25),
        a = 0.8 * inA * out
      env.line(
        [
          [x0, y0],
          [cx - w, cy - h],
        ],
        c,
        lw,
        a,
        false,
      )
      env.line(
        [
          [x1, y0],
          [cx + w, cy - h],
        ],
        c,
        lw,
        a,
        false,
      )
      env.line(
        [
          [x0, y1],
          [cx - w, cy + h],
        ],
        c,
        lw,
        a,
        false,
      )
      env.line(
        [
          [x1, y1],
          [cx + w, cy + h],
        ],
        c,
        lw,
        a,
        false,
      )
      env.line(
        [
          [cx - w, cy - h],
          [cx + w, cy - h],
          [cx + w, cy + h],
          [cx - w, cy + h],
          [cx - w, cy - h],
        ],
        c,
        lw,
        a,
        false,
      )
      drawNoise(env, x0, y0, x1 - x0, y1 - y0, 0.07 * inA * out, st, s + k)
      if (rnd(s, k, 5) < 0.35)
        env.draw({
          text: 'NO SIGNAL',
          font: mono,
          size: fs * 1.1,
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          color: mix(feedBg, LC, 0.6),
          alpha: (st % 6 < 4 ? 0.8 : 0.3) * inA * out,
          ghost: false,
          track: 0.2,
        })
    }
    // 实时画面的文字 bbox（下面给出）
    let fx0 = m,
      fy0 = m,
      fx1 = W - m,
      fy1 = H - m
    if (Pm.v === 'quad') {
      const g = lw * 3,
        cols = 2,
        rows = 2,
        cw = (W - m * 2 - g) / cols,
        chh = (H - m * 2 - g) / rows
      for (let k = 0; k < 4; k++) {
        const c = k % 2,
          r = Math.floor(k / 2),
          x0 = m + c * (cw + g),
          y0 = m + r * (chh + g)
        if (k === Pm.act % 4) {
          fx0 = x0
          fy0 = y0
          fx1 = x0 + cw
          fy1 = y0 + chh
          env.rect(x0, y0, cw, chh, feedBg, inA, false)
          continue
        }
        emptyFeed(x0, y0, x0 + cw, y0 + chh, k)
        osd(x0, y0, x0 + cw, y0 + chh, Pm.cam0 + k, false, fs * 0.8)
      }
    } else env.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, feedBg, inA, false)
    // the live feed with the lyric
    const fw = fx1 - fx0,
      fh = fy1 - fy0
    const text = splitLines(flat(cut.text), Pm.v === 'quad' ? (port ? 4 : 7) : port ? 5 : 11)
    const size = Math.min(
      fitSize(text, Pm.font, fw * 0.82, fh * 0.46, { track: 0.05, lead: 1.2 }),
      fh * 0.3,
    )
    drawNoise(env, fx0, fy0, fw, fh, 0.05 * inA * out, st, s + 7)
    const bb = mainDraw(env, {
      text,
      font: Pm.font,
      size,
      x: fx0 + fw / 2,
      y: fy0 + fh / 2,
      track: 0.05,
      lead: 1.2,
      color: LC,
    })
    // scanlines over the live feed
    if (env.pass === 'main') {
      const sp = Math.max(3, fh / 90)
      for (let y = fy0; y < fy1; y += sp * 2)
        env.rect(fx0, y, fw, sp * 0.6, '#000000', 0.12 * inA, false)
      const ry = fy0 + ((env.t * 0.13 + rnd(s, 9)) % 1) * fh
      env.rect(fx0, ry, fw, fh * 0.05, LC, 0.03 * inA * out, false)
    }
    if (Pm.box && bb) {
      // motion detection box hunting the words
      const e = tin(env, cut.inDur * 0.6, 0.25) * out,
        jx = rs(s, st >> 1, 21) * size * 0.08,
        jy = rs(s, st >> 1, 22) * size * 0.08,
        pd = size * 0.25
      if (e > 0) {
        const x0 = bb.x0 - pd + jx,
          y0 = bb.y0 - pd + jy,
          x1 = bb.x1 + pd + jx,
          y1 = bb.y1 + pd + jy,
          L = size * 0.3
        const c = fitContrast(sc.accent, feedBg, 3),
          lw2 = Math.max(1.2, lw * 1.4)
        env.line(
          [
            [x0, y0 + L],
            [x0, y0],
            [x0 + L, y0],
          ],
          c,
          lw2,
          e,
          false,
        )
        env.line(
          [
            [x1 - L, y0],
            [x1, y0],
            [x1, y0 + L],
          ],
          c,
          lw2,
          e,
          false,
        )
        env.line(
          [
            [x0, y1 - L],
            [x0, y1],
            [x0 + L, y1],
          ],
          c,
          lw2,
          e,
          false,
        )
        env.line(
          [
            [x1 - L, y1],
            [x1, y1],
            [x1, y1 - L],
          ],
          c,
          lw2,
          e,
          false,
        )
        env.draw({
          text: 'MOTION ' + pad2(1 + (hash(s, 23) % 9)),
          font: mono,
          size: fs * 0.75,
          align: 'left',
          x: x0,
          y: y0 - fs * 0.7,
          color: c,
          alpha: e * (st % 3 ? 1 : 0.4),
          ghost: false,
          track: 0.1,
        })
      }
    }
    osd(fx0, fy0, fx1, fy1, Pm.cam0 + (Pm.act % 4), true)
    env.line(
      [
        [fx0, fy0],
        [fx1, fy0],
        [fx1, fy1],
        [fx0, fy1],
        [fx0, fy0],
      ],
      Pm.v === 'quad' ? fitContrast(sc.accent, feedBg, 3) : frameC,
      lw * (Pm.v === 'quad' ? 1.6 : 1),
      (Pm.v === 'quad' ? 0.85 : 0.5) * inA * out,
      false,
    )
    return bb
  },
})

/* ================================================================== 5. spirit board */
const KANA =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** hrOuija 的 plan 产物 */
type HrOuijaParams = {
  font: string
  fontB: string
  jit: number
  latin: number
}

reg('hrOuija', {
  tags: TAGS,
  w: 0.7,
  portrait: 0.8,
  ae: 'type',
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      fontB: rng.pick(fontsOf(st, ['serif'])),
      jit: rng.range(0.45, 0.9),
      latin: hasLatin(cut.text),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrOuijaParams,
      s = cut.seed | 0,
      port = isPort(env)
    const out = tout(env),
      inA = tin(env, 0, 0.35),
      u = U(env),
      lw = Math.max(1, u * 0.0018)
    // board
    const bw = Math.min(W * 0.88, H * (port ? 0.62 : 1.2)),
      bh = bw * (port ? 0.72 : 0.52),
      bx = W / 2,
      by = port ? H * 0.34 : H * 0.36
    const plate = mix(sc.bg, sc.fg, isDark(sc.bg) ? 0.07 : 0.06)
    env.rrect(
      bx - bw / 2,
      by - bh / 2,
      bw,
      bh,
      bh * 0.14,
      plate,
      inA * out,
      false,
      mix(sc.bg, sc.sub, 0.6),
      lw,
    )
    const rowsSrc = Pm.latin
      ? [ABC.slice(0, 13), ABC.slice(13), '1234567890']
      : [KANA.slice(0, 16), KANA.slice(16, 32), KANA.slice(32)]
    const cells: Cell[] = [],
      bf = bh * (Pm.latin ? 0.1 : 0.085)
    rowsSrc.forEach((row, r) => {
      const arr = [...row],
        n = arr.length,
        R = bw * (0.64 - r * 0.17),
        cy = by + bh * (0.52 + r * 0.04),
        span = (r ? 96 : 112) * (port ? 0.95 : 1)
      if (r === 2) {
        arr.forEach((ch, i: number) =>
          cells.push({
            ch,
            x: bx + ((i - (n - 1) / 2) * bw * 0.6) / Math.max(1, n - 1),
            y: by + bh * 0.3,
            rot: 0,
          }),
        )
        return
      }
      arr.forEach((ch, i: number) => {
        const a = (-90 - span / 2 + span * (n > 1 ? i / (n - 1) : 0.5)) * DEG
        const x = bx + Math.cos(a) * R * 0.78,
          y = cy + Math.sin(a) * R * 0.62
        cells.push({ ch, x, y, rot: (a / DEG + 90) * 0.7 })
      })
    })
    const col = mix(plate, sc.fg, 0.55)
    for (const c of cells)
      env.draw({
        text: c.ch,
        font: Pm.fontB,
        size: bf,
        x: c.x,
        y: c.y,
        rot: c.rot,
        color: col,
        alpha: inA * out,
        ghost: false,
      })
    const mono = Pm.fontB,
      cs = bf * 0.9
    env.draw({
      text: 'YES',
      font: mono,
      size: cs,
      x: bx - bw * 0.36,
      y: by - bh * 0.36,
      color: col,
      alpha: inA * out,
      ghost: false,
      track: 0.2,
    })
    env.draw({
      text: 'NO',
      font: mono,
      size: cs,
      x: bx + bw * 0.36,
      y: by - bh * 0.36,
      color: col,
      alpha: inA * out,
      ghost: false,
      track: 0.2,
    })
    env.draw({
      text: 'GOOD BYE',
      font: mono,
      size: cs,
      x: bx,
      y: by + bh * 0.42,
      color: col,
      alpha: inA * out,
      ghost: false,
      track: 0.3,
    })
    // lyric row + when each glyph is spelled out
    const text = flat(cut.text),
      chars = [...text].filter((c) => c !== ' ')
    const n = chars.length
    const rowY = port ? H * 0.74 : H * 0.8
    const lines = n > (port ? 6 : 12) ? splitLines(text, Math.ceil(n / 2)) : text
    const size = Math.min(
      fitSize(lines, Pm.font, W * 0.86, H * (port ? 0.26 : 0.2), { track: 0.18, lead: 1.2 }),
      H * 0.13,
    )
    const sl = slots({
      text: lines,
      font: Pm.font,
      size,
      x: W / 2,
      y: rowY,
      track: 0.18,
      lead: 1.2,
    })
    const span = cut.dur * 0.5,
      times: number[] = []
    let acc = 0
    const ws = []
    for (let i = 0; i < n; i++) {
      const w = 0.35 + Pm.jit * rnd(s, i, 51) * 2
      ws.push(w)
      acc += w
    }
    let c0 = 0.25
    for (let i = 0; i < n; i++) {
      c0 += (ws[i] / acc) * (span - 0.25)
      times.push(c0)
    }
    const target = (i: number) => {
      let ch = chars[i] || ''
      if (/[ァ-ヶ]/.test(ch)) ch = String.fromCharCode(ch.charCodeAt(0) - 0x60)
      ch = ch.toUpperCase()
      let c = cells.find((q: Cell) => q.ch === ch)
      if (!c) c = cells[hash(s, i, 52) % cells.length]
      return c
    }
    // planchette position
    let px = bx,
      py = by + bh * 0.1,
      cur = -1
    for (let i = 0; i < n; i++)
      if (env.ltb >= times[i] - Math.min(0.4, (times[i] - (i ? times[i - 1] : 0)) * 0.75)) cur = i
    if (cur >= 0) {
      const tA = cur ? times[cur - 1] : 0,
        tB = times[cur],
        mv = Math.min(0.4, (tB - tA) * 0.75)
      const A = cur ? target(cur - 1) : { x: px, y: py },
        B = target(cur)
      const k = E.inOutCubic(clamp((env.ltb - (tB - mv)) / mv))
      px = lerp(A.x, B.x, k) + Math.sin(k * Math.PI) * bh * 0.06
      py = lerp(A.y, B.y, k) + bf * 1.2
    } else py += bf * 1.2
    // idle circling
    px += Math.sin(env.ltb * 2.1 + s) * bf * 0.12
    py += Math.cos(env.ltb * 1.7 + s) * bf * 0.1
    const pr = bf * 1.2,
      pc = sc.fg,
      pa = inA * out
    env.poly(
      [
        [px, py - pr * 2.3],
        [px + pr * 1.5, py + pr * 0.4],
        [px + pr * 0.9, py + pr * 1.3],
        [px - pr * 0.9, py + pr * 1.3],
        [px - pr * 1.5, py + pr * 0.4],
      ],
      mix(plate, sc.fg, 0.12),
      pa * 0.85,
      false,
    )
    env.line(
      [
        [px, py - pr * 2.3],
        [px + pr * 1.5, py + pr * 0.4],
        [px + pr * 0.9, py + pr * 1.3],
        [px - pr * 0.9, py + pr * 1.3],
        [px - pr * 1.5, py + pr * 0.4],
        [px, py - pr * 2.3],
      ],
      pc,
      lw * 1.4,
      pa,
      false,
    )
    env.circle(px, py - pr * 0.75, pr * 0.62, null, pc, lw * 1.4, pa, false)
    if (cur >= 0) {
      const B = target(cur)
      if (Math.hypot(B.x - px, B.y - (py - bf * 1.2)) < bf * 0.8)
        env.draw({
          text: B.ch,
          font: Pm.fontB,
          size: bf * 1.25,
          x: B.x,
          y: B.y,
          rot: B.rot,
          color: sc.accent,
          alpha: pa,
          ghost: false,
        })
    }
    let bb: BBox | null = null
    sl.forEach((g, i: number) => {
      bb = UB(
        bb,
        mainDraw(env, {
          text: g.ch,
          font: Pm.font,
          size,
          x: g.x,
          y: g.y,
          color: sc.fg,
          mi: miAt(env, times[i] || 0),
        }),
      )
    })
    return bb || box(W * 0.2, rowY - size, W * 0.8, rowY + size)
  },
})

/* ================================================================== 6. missing poster */
/** hrMissing 的 plan 产物 */
type HrMissingParams = {
  font: string
  fontH: string
  ang: number
  off: number
  torn: number
  stains: number
}

reg('hrMissing', {
  tags: TAGS.concat(['editorial']),
  w: 0.8,
  treat: 'safe',
  ae: 'labels',
  fits: (n: number) => n >= 1 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      fontH: rng.pick(fontsOf(st, ['display'])),
      ang: rng.range(-3.5, 3.5),
      off: rng.range(-0.06, 0.06),
      torn: rng.int(1, 3),
      stains: rng.int(1, 3),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrMissingParams,
      s = cut.seed | 0,
      port = isPort(env),
      u = U(env)
    const out = tout(env),
      q = E.outBack(clamp(env.lt / 0.3), 1.3)
    if (q <= 0) return null
    const ph = H * 0.9,
      pw = Math.min(W * (port ? 0.86 : 0.5), ph * 0.72)
    const cx = W / 2 + Pm.off * W * (port ? 0.3 : 1),
      cy = H / 2
    const paper = isDark(sc.bg) ? mix(lightOf(sc), sc.sub, 0.12) : mix(sc.bg, '#FFFFFF', 0.62),
      ink = onCol(sc, paper),
      red = redOn(sc, paper)
    const ang = Pm.ang,
      rad = ang * DEG,
      cs = Math.cos(rad),
      sn = Math.sin(rad)
    const P2 = (lx: number, ly: number) => [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs]
    const sq = 1.06 - 0.06 * q
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rad)
    ctx.scale(sq, sq)
    const x0 = -pw / 2,
      y0 = -ph / 2
    env.rect(x0 + u * 0.012, y0 + u * 0.016, pw, ph, '#000000', 0.25 * out, false)
    env.rect(x0, y0, pw, ph, paper, out, false)
    // stains
    for (let k = 0; k < Pm.stains; k++) {
      const sx = x0 + pw * rr(0.22, 0.78, s, k, 1),
        sy = y0 + ph * rr(0.2, 0.8, s, k, 2),
        R = pw * rr(0.05, 0.12, s, k, 3),
        pts: (readonly [number, number])[] = []
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU,
          r = R * (0.7 + 0.5 * rnd(s, k, i, 4))
        pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.8])
      }
      env.blob(pts, mix(paper, sc.sub, 0.35), 0.35 * out, false)
    }
    const hs = pw * 0.15
    env.draw({
      text: 'MISSING',
      font: Pm.fontH,
      size: hs,
      x: 0,
      y: y0 + ph * 0.09,
      track: 0.08,
      color: red,
      alpha: out,
      ghost: false,
      sx: 0.92,
    })
    // photo with a faceless head-and-shoulders silhouette
    const fw = pw * 0.52,
      fh = fw * 1.18,
      fx = -fw / 2,
      fy = y0 + ph * 0.17
    const photo = mix(ink, paper, 0.25)
    env.rect(fx, fy, fw, fh, photo, out, false)
    const sil = mix(ink, paper, 0.05)
    env.circle(0, fy + fh * 0.42, fw * 0.2, sil, null, 0, out, false)
    env.blob(
      [
        [-fw * 0.42, fy + fh],
        [-fw * 0.36, fy + fh * 0.76],
        [-fw * 0.12, fy + fh * 0.66],
        [fw * 0.12, fy + fh * 0.66],
        [fw * 0.36, fy + fh * 0.76],
        [fw * 0.42, fy + fh],
      ],
      sil,
      out,
      false,
    )
    if (env.pass === 'main') {
      const g = ctx.createLinearGradient(0, fy, 0, fy + fh)
      g.addColorStop(0, rgba(paper, 0.28))
      g.addColorStop(0.5, rgba(paper, 0))
      g.addColorStop(1, rgba(paper, 0.18))
      ctx.globalAlpha = out
      ctx.fillStyle = g
      ctx.fillRect(fx, fy, fw, fh)
      ctx.globalAlpha = 1
    }
    // tape
    for (const sgn of [-1, 1]) {
      ctx.save()
      ctx.translate(sgn * pw * 0.4, y0 + ph * 0.005)
      ctx.rotate(sgn * 28 * DEG)
      env.rect(
        -pw * 0.1,
        -pw * 0.03,
        pw * 0.2,
        pw * 0.06,
        mix(paper, sc.sub, 0.25),
        0.7 * out,
        false,
      )
      ctx.restore()
    }
    // info lines
    const mono = monoF(env),
      fs = pw * 0.034,
      ly = fy + fh + ph * 0.24
    env.draw({
      text: 'LAST SEEN ' + fakeDate(s, '.') + '  ' + fakeTime(s, 0).slice(0, 5),
      font: mono,
      size: fs,
      x: 0,
      y: ly,
      color: ink,
      alpha: out * 0.85,
      ghost: false,
      track: 0.06,
    })
    const sub = flat(cut.lineText || cut.text)
    env.draw({
      text: sub.length > 22 ? sub.slice(0, 21) + '…' : sub,
      font: bodyF(env),
      size: fs * 1.05,
      x: 0,
      y: ly + fs * 1.7,
      color: ink,
      alpha: out * 0.7,
      ghost: false,
      track: 0.05,
    })
    // tear-off tabs
    const tabs = 7,
      tw = pw / tabs,
      ty = y0 + ph * 0.86,
      th = ph * 0.14
    for (let k = 0; k < tabs; k++) {
      if (hash(s, k, 61) % 7 < Pm.torn) continue
      const tx = x0 + k * tw
      env.line(
        [
          [tx, ty],
          [tx, ty + th],
        ],
        mix(paper, ink, 0.4),
        Math.max(1, u * 0.001),
        out,
        false,
      )
      ctx.save()
      ctx.translate(tx + tw / 2, ty + th / 2)
      ctx.rotate(-Math.PI / 2)
      env.draw({
        text: 'TEL 0' + ((hash(s, 7) % 90) + 10) + '-' + ((hash(s, 8) % 9000) + 1000),
        font: mono,
        size: Math.min(tw * 0.42, th * 0.1),
        x: 0,
        y: 0,
        color: ink,
        alpha: out * 0.8,
        ghost: false,
      })
      ctx.restore()
    }
    env.line(
      [
        [x0, ty],
        [x0 + pw, ty],
      ],
      mix(paper, ink, 0.4),
      Math.max(1, u * 0.001),
      out,
      false,
    )
    ctx.restore()
    // the lyric as the name
    const text = splitLines(flat(cut.text), port ? 6 : 7)
    const lyY = fy + fh + ph * 0.1
    const size = Math.min(
      fitSize(text, Pm.font, pw * 0.86, ph * 0.13, { track: 0.04, lead: 1.1 }),
      pw * 0.16,
    )
    const [lx, lyy] = P2(0, lyY * sq)
    const bb = mainDraw(env, {
      text,
      font: Pm.font,
      size: size * sq,
      x: lx,
      y: lyy,
      rot: ang,
      track: 0.04,
      lead: 1.1,
      color: ink,
      plain: false,
    })
    return bb || box(cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2)
  },
})

/* ================================================================== 7. the one wrong glyph */
/** hrWrongOne 的 plan 产物 */
type HrWrongOneParams = {
  font: string
  wrong: number
  ang: number
  red: boolean
  nums: boolean
  sink: number
}

reg('hrWrongOne', {
  tags: TAGS.concat(['editorial', 'calm']),
  w: 1,
  ae: 'mixed',
  fits: (n: number) => n >= 2 && n <= 16,
  plan(rng, cut, st) {
    const cs = [...flat(cut.text)]
      .map((c: string, i: number) => [c, i] as [string, number])
      .filter(([c]) => c !== ' ' && !isPunct(c))
    const kan = cs.filter(([c]) => isHan(c) || isKana(c) || /[A-Za-z]/.test(c))
    const pool = kan.length ? kan : cs
    const pick = pool.length ? pool[rng.int(0, pool.length - 1)][1] : 0
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      wrong: pick,
      ang: rng.pick([28, 90, 180, -90, -35]),
      red: rng.chance(0.35),
      nums: rng.chance(0.7),
      sink: rng.range(0.06, 0.2),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrWrongOneParams,
      s = cut.seed | 0,
      lt = env.lt,
      port = isPort(env)
    const text = splitLines(flat(cut.text), port ? 5 : 9)
    const o = { track: 0.22, lead: 1.5 }
    const size = Math.min(fitSize(text, Pm.font, W * 0.82, H * 0.46, o), H * 0.2)
    const all = slots(Object.assign({ text, font: Pm.font, size, x: W / 2, y: H / 2 }, o))
    // index into the flat text (spaces kept) → slot index
    const flatArr = [...flat(cut.text)]
    let wi = 0
    for (let i = 0, k = 0; i < flatArr.length; i++) {
      if (flatArr[i] === ' ') continue
      if (i === Pm.wrong) {
        wi = k
        break
      }
      k++
    }
    wi = Math.min(wi, all.length - 1)
    const d = cut.dur,
      turnAt = d * 0.35
    let bb: BBox | null = null
    all.forEach((g, i: number) => {
      const it: TextItem = { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: sc.fg, mi: i }
      if (i === wi) {
        // it turns slowly while the rest never move — with a sudden twitch now and then
        const q = E.inOutSine(clamp((lt - turnAt) / Math.max(0.5, d * 0.45)))
        const twitch =
          rnd(s, env.step >> 1, 71) < 0.07 && lt > turnAt ? rs(s, env.step, 72) * 14 : 0
        it.rot = Pm.ang * q + twitch
        it.y += size * Pm.sink * q
        it.x += rs(s, env.step >> 2, 73) * size * 0.015 * q
        if (Pm.red) it.color = mix(sc.fg, sc.accent, q)
        it.noHold = true
      }
      bb = UB(bb, mainDraw(env, it))
    })
    if (Pm.nums && all.length) {
      const e = tin(env, cut.inDur * 0.8, 0.3) * tout(env),
        fs = clamp(size * 0.14, 9, 22),
        mono = monoF(env)
      if (e > 0)
        all.forEach((g, i: number) => {
          const wrong = i === wi && lt > turnAt + 0.3
          env.draw({
            text: wrong ? '??' : pad2(i + 1),
            font: mono,
            size: fs,
            x: g.x,
            y: g.y + size * 0.72,
            color: wrong ? sc.accent : sc.sub,
            alpha: e * (wrong ? 1 : 0.7),
            ghost: false,
            track: 0.1,
          })
        })
    }
    return bb
  },
})

/* ================================================================== 8. rising out of the dark */
/** hrRisingDark 的 plan 产物 */
type HrRisingDarkParams = {
  font: string
  pulls: number
  span: number
  rim: boolean
}

reg('hrRisingDark', {
  tags: TAGS.concat(['emotional']),
  w: 0.8,
  ae: 'wave',
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      pulls: rng.int(3, 5),
      span: rng.range(0.45, 0.6),
      rim: rng.chance(0.8),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrRisingDarkParams,
      s = cut.seed | 0,
      port = isPort(env)
    const text = splitLines(flat(cut.text), port ? 5 : 9)
    const o = { track: 0.06, lead: 1.2 }
    const size = Math.min(fitSize(text, Pm.font, W * 0.82, H * 0.34, o), H * 0.2)
    const cy = H * 0.44
    const all = slots(Object.assign({ text, font: Pm.font, size, x: W / 2, y: cy }, o))
    const nl = text.split('\n').length,
      bottom = cy + (nl * size * 1.2) / 2
    const surf = bottom + size * 0.3
    const T = cut.dur * Pm.span
    let bb: BBox | null = null
    all.forEach((g, i: number) => {
      // hand over hand: a few sudden pulls at uneasy moments
      let prog = 0
      for (let k = 0; k < Pm.pulls; k++) {
        const tk =
          (clamp(rnd(s, i, k, 81) * 0.8 + ((k * 0.2) / Pm.pulls) * 1.0) * T * (k + 1)) / Pm.pulls
        prog += E.outCubic(clamp((env.ltb - tk) / 0.14)) / Pm.pulls
      }
      const rest = surf - g.y + size * 0.62,
        dy = (1 - prog) * rest
      const shake = prog < 1 ? rs(s, i, env.step, 82) * size * 0.02 : 0
      bb = UB(
        bb,
        mainDraw(env, {
          text: g.ch,
          font: Pm.font,
          size,
          x: g.x + shake,
          y: g.y + dy,
          rot: (1 - prog) * rs(s, i, 83) * 16,
          color: sc.fg,
          mi: 0,
        }),
      )
    })
    // the dark pool (drawn over the glyphs still under it)
    if (env.pass === 'main') {
      const pc = nightC(sc),
        pts: (readonly [number, number])[] = [],
        n = 48,
        a = tout(env),
        t = env.ltb
      for (let j = 0; j <= n; j++) {
        const x = -W * 0.1 + (W * 1.2 * j) / n
        pts.push([
          x,
          surf +
            (noise1(j * 0.35 + t * 0.6, s) * 0.6 + Math.sin(j * 0.9 + t * 1.4) * 0.15) *
              size *
              0.12,
        ])
      }
      ctx.save()
      ctx.globalAlpha = a
      const g = ctx.createLinearGradient(0, surf - size * 0.1, 0, H)
      g.addColorStop(0, rgba(pc, 0.96))
      g.addColorStop(1, rgba(mix(pc, '#000000', 0.5), 1))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(-W * 0.2, H * 1.2)
      for (const p of pts) ctx.lineTo(p[0], p[1])
      ctx.lineTo(W * 1.2, H * 1.2)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      if (Pm.rim) env.line(pts, sc.sub, Math.max(1, size * 0.012), 0.35 * a, false)
    }
    return bb ? Object.assign(bb, { y1: Math.min((bb as BBox).y1, surf) }) : null
  },
})

/* ================================================================== 9. redacted file */
/** hrRedacted 的 plan 产物 */
type HrRedactedParams = {
  font: string
  row: number
  stamp: boolean
  stampAng: number
  leak: number
}

reg('hrRedacted', {
  tags: TAGS.concat(['editorial']),
  w: 0.8,
  busy: true,
  ae: 'type',
  fits: (n: number) => n >= 1 && n <= 20,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'body', 'mono'])),
      row: rng.range(0.42, 0.58),
      stamp: rng.chance(0.75),
      stampAng: rng.range(-14, -6),
      leak: rng.range(0.1, 0.25),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrRedactedParams,
      s = cut.seed | 0,
      lt = env.lt,
      port = isPort(env),
      u = U(env)
    const out = tout(env),
      inA = tin(env, 0, 0.25)
    const mx = W * (port ? 0.08 : 0.12),
      mw = W - mx * 2,
      mono = monoF(env)
    const fs = clamp(u * 0.028, 12, 34),
      rh = fs * 2.1
    const barC = mix(sc.fg, sc.bg, 0.08),
      txtC = sc.sub
    // header
    env.draw({
      text: 'FILE No. ' + ((hash(s, 1) % 9000) + 1000) + '   ' + fakeDate(s, '.'),
      font: mono,
      size: fs * 0.8,
      align: 'left',
      x: mx,
      y: H * 0.08,
      color: txtC,
      alpha: inA * out,
      ghost: false,
      track: 0.08,
    })
    env.line(
      [
        [mx, H * 0.08 + fs],
        [mx + mw * inA, H * 0.08 + fs],
      ],
      txtC,
      Math.max(1, u * 0.0012),
      0.6 * out,
      false,
    )
    // the lyric line
    const text = splitLines(flat(cut.text), port ? 7 : 16)
    const nl = text.split('\n').length
    const size = Math.min(
      fitSize(text, Pm.font, mw, H * 0.24, { track: 0.06, lead: 1.3 }),
      H * 0.1,
      fs * 3.4,
    )
    const ly = H * Pm.row,
      lh = nl * size * 1.3
    // filler rows: body text blacked out
    const body = flat(cut.lineText || cut.text) + '　'
    const rowsN = Math.floor((H * 0.84 - H * 0.14) / rh)
    for (let r = 0; r < rowsN; r++) {
      const y = H * 0.15 + r * rh
      if (Math.abs(y - ly) < lh / 2 + rh * 0.7) continue
      const e = clamp((env.ltb - r * 0.025) / 0.2) * out
      if (e <= 0) continue
      const len = r % 5 === 4 ? rr(0.3, 0.6, s, r, 2) : rr(0.85, 1, s, r, 2)
      if (env.pass === 'main') {
        ctx.save()
        ctx.beginPath()
        ctx.rect(mx, y - rh / 2, mw * len, rh)
        ctx.clip()
        env.draw({
          text: body.repeat(6),
          font: bodyF(env),
          size: fs,
          align: 'left',
          x: mx,
          y,
          color: txtC,
          alpha: 0.6 * e,
          ghost: false,
          track: 0.05,
        })
        ctx.restore()
      }
      // bars
      let x = mx
      while (x < mx + mw * len) {
        const w = mw * rr(0.08, 0.35, s, r, Math.round(x), 3),
          gap = fs * rr(0.4, 2.4, s, r, Math.round(x), 4)
        if (rnd(s, r, Math.round(x), 5) > Pm.leak)
          env.rect(
            x,
            y - fs * 0.62,
            Math.min(w, mx + mw * len - x) * e,
            fs * 1.24,
            barC,
            out,
            false,
          )
        x += w + gap
      }
    }
    const bb = mainDraw(env, {
      text,
      font: Pm.font,
      size,
      x: mx,
      y: ly,
      align: 'left',
      track: 0.06,
      lead: 1.3,
      color: sc.fg,
    })
    // the bar over the lyric slides off, sticks, then goes
    if (env.pass === 'main') {
      const m = measure({ text, font: Pm.font, size, align: 'left', track: 0.06, lead: 1.3 })
      const d0 = cut.inDur * 0.3,
        k1 = E.inOutCubic(clamp((lt - d0) / 0.25)) * 0.35,
        k2 = E.inOutCubic(clamp((lt - d0 - 0.25 - cut.dur * 0.08) / 0.3)) * 0.65
      const k = k1 + k2,
        bw = (m.w + size * 0.4) * (1 - k)
      if (bw > 0.5)
        env.rect(
          mx - size * 0.2 + (m.w + size * 0.4) * k,
          ly - m.h / 2 - size * 0.12,
          bw,
          m.h + size * 0.24,
          barC,
          inA,
          false,
        )
    }
    if (Pm.stamp) {
      const at = cut.dur * 0.45,
        q = clamp((lt - at) / 0.12)
      if (q > 0) {
        const sc2 = 1.6 - 0.6 * E.outCubic(q),
          a = Math.min(1, q * 2) * out * 0.85,
          ss = fs * 1.6,
          word = 'CLASSIFIED'
        const tw = measure({ text: word, font: mono, size: ss, track: 0.2 }).w
        ctx.save()
        ctx.translate(W - mx - tw * 0.55, H * 0.8)
        ctx.rotate(Pm.stampAng * DEG)
        ctx.scale(sc2, sc2)
        env.rrect(
          -tw / 2 - ss * 0.5,
          -ss * 0.9,
          tw + ss,
          ss * 1.8,
          ss * 0.2,
          null,
          a,
          false,
          sc.accent,
          Math.max(2, ss * 0.1),
        )
        env.draw({
          text: word,
          font: mono,
          size: ss,
          x: 0,
          y: 0,
          color: sc.accent,
          alpha: a,
          ghost: false,
          track: 0.2,
        })
        ctx.restore()
      }
    }
    return bb
  },
})

/* ================================================================== 10. static TV */
/** hrStaticTv 的 plan 产物 */
type HrStaticTvParams = {
  font: string
  off: number
  tune: number
  ant: number
}

reg('hrStaticTv', {
  tags: TAGS.concat(['glitch']),
  w: 0.8,
  treat: 'safe',
  ae: 'circle',
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])),
      off: rng.range(-0.06, 0.06),
      tune: rng.range(0.3, 0.5),
      ant: rng.range(18, 34),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrStaticTvParams,
      s = cut.seed | 0,
      lt = env.lt,
      port = isPort(env),
      u = U(env)
    const out = tout(env),
      inA = tin(env, 0, 0.3)
    const tw = Math.min(W * (port ? 0.86 : 0.62), H * (port ? 0.5 : 0.8) * 1.3),
      th = tw / 1.3
    const cx = W / 2 + Pm.off * W,
      cy = H / 2 + th * 0.06
    const body = mix(sc.bg, sc.fg, isDark(sc.bg) ? 0.13 : 0.22),
      edge = mix(body, sc.fg, 0.3),
      lw = Math.max(1, u * 0.0018)
    // glow of the screen into the room
    if (env.pass === 'main') {
      const g = ctx.createRadialGradient(cx, cy, th * 0.3, cx, cy, Math.max(W, H) * 0.7)
      g.addColorStop(0, rgba(lightOf(sc), (0.1 * inA * out).toFixed(3)))
      g.addColorStop(1, rgba(lightOf(sc), 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
    // antenna, body, knobs
    const top = cy - th / 2
    for (const sg of [-1, 1]) {
      const a = (90 + sg * Pm.ant + Math.sin(env.ltb * 0.7 + sg) * 1.5) * DEG
      env.line(
        [
          [cx, top],
          [cx - Math.cos(a) * th * 0.45, top - Math.sin(a) * th * 0.45],
        ],
        edge,
        lw * 2,
        inA * out,
        false,
      )
    }
    env.rrect(cx - tw / 2, top, tw, th, th * 0.08, body, inA * out, false, edge, lw * 1.5)
    const sw = tw * 0.72,
      sh = th * 0.78,
      sx0 = cx - tw / 2 + tw * 0.05,
      sy0 = top + th * 0.11
    const kx = sx0 + sw + (tw - sw - tw * 0.05) / 2
    for (let k = 0; k < 2; k++)
      env.circle(
        kx,
        top + th * (0.25 + k * 0.2),
        tw * 0.035,
        mix(body, sc.bg, 0.4),
        edge,
        lw,
        inA * out,
        false,
      )
    for (let k = 0; k < 5; k++)
      env.line(
        [
          [kx - tw * 0.04, top + th * (0.62 + k * 0.05)],
          [kx + tw * 0.04, top + th * (0.62 + k * 0.05)],
        ],
        edge,
        lw,
        inA * out * 0.8,
        false,
      )
    env.rect(cx - tw * 0.36, top + th, tw * 0.05, th * 0.06, body, inA * out, false)
    env.rect(cx + tw * 0.31, top + th, tw * 0.05, th * 0.06, body, inA * out, false)
    // screen: static that slowly gives way to the words
    const scr = mix(sc.bg, '#000000', 0.6)
    env.rrect(sx0, sy0, sw, sh, sh * 0.1, scr, inA, false)
    const tune = E.inOutCubic(clamp((lt - 0.15) / (cut.dur * Pm.tune)))
    const burst = rnd(s, env.step, 91) < 0.06 ? 0.35 : 0
    if (env.pass === 'main') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(sx0 + sh * 0.03, sy0 + sh * 0.03, sw - sh * 0.06, sh - sh * 0.06)
      ctx.clip()
      drawNoise(env, sx0, sy0, sw, sh, (0.85 - 0.6 * tune + burst) * inA, env.step, s)
      ctx.restore()
    }
    const tc = lum(sc.fg) > 0.5 ? sc.fg : '#FFFFFF'
    const text = splitLines(flat(cut.text), port ? 5 : 7)
    const size = Math.min(
      fitSize(text, Pm.font, sw * 0.82, sh * 0.6, { track: 0.04, lead: 1.15 }),
      sh * 0.36,
    )
    const roll = (1 - tune) * sh * 0.08 * Math.sin(env.ltb * 23)
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx0, sy0, sw, sh)
    ctx.clip()
    const bb = mainDraw(env, {
      text,
      font: Pm.font,
      size,
      x: sx0 + sw / 2,
      y: sy0 + sh / 2 + roll,
      track: 0.04,
      lead: 1.15,
      color: tc,
      alpha: 0.55 + 0.45 * tune,
    })
    ctx.restore()
    if (env.pass === 'main') {
      // curvature highlight + scanlines
      const sp = Math.max(3, sh / 70)
      for (let y = sy0; y < sy0 + sh; y += sp * 2)
        env.rect(sx0, y, sw, sp * 0.5, '#000000', 0.18 * inA, false)
      env.rrect(
        sx0 + sw * 0.06,
        sy0 + sh * 0.05,
        sw * 0.4,
        sh * 0.12,
        sh * 0.06,
        rgba('#FFFFFF', 0.05),
        inA * out,
        false,
      )
    }
    return bb ? bb : box(sx0, sy0, sx0 + sw, sy0 + sh)
  },
})

/* ================================================================== 11. spirit photo */
/** hrSpiritPhoto 的 plan 产物 */
type HrSpiritPhotoParams = {
  hand: string
  ang: number
  spot: number[]
  win: boolean
  side: number
}

reg('hrSpiritPhoto', {
  tags: TAGS.concat(['emotional']),
  w: 0.8,
  ae: 'gloss',
  fits: (n: number) => n >= 1 && n <= 16,
  plan(rng, _cut, st) {
    return {
      hand: handOf(rng, st),
      ang: rng.range(-5, 5),
      spot: [rng.range(0.25, 0.75), rng.range(0.3, 0.6)],
      win: rng.chance(0.6),
      side: rng.pick([1, -1]),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrSpiritPhotoParams,
      s = cut.seed | 0,
      lt = env.lt,
      port = isPort(env),
      u = U(env)
    const out = tout(env),
      inA = tin(env, 0, 0.3)
    // photo placement: left (landscape) or top (portrait); the note on the other side
    const pw = port ? W * 0.78 : Math.min(W * 0.46, H * 0.86 * 1.25),
      ph = pw / 1.25
    const pcx = port ? W / 2 : Pm.side > 0 ? W * 0.3 : W * 0.7,
      pcy = port ? H * 0.33 : H * 0.5
    const rad = Pm.ang * DEG,
      cs = Math.cos(rad),
      sn = Math.sin(rad)
    const T = (lx: number, ly: number) => [pcx + lx * cs - ly * sn, pcy + lx * sn + ly * cs]
    const border = mix(lightOf(sc), sc.sub, 0.1),
      dark = mix(darkOf(sc), '#000000', 0.35)
    const develop = E.inOutSine(clamp(lt / Math.max(0.6, cut.dur * 0.35)))
    ctx.save()
    ctx.translate(pcx, pcy)
    ctx.rotate(rad)
    const bw = u * 0.018
    env.rect(
      -pw / 2 - bw + u * 0.01,
      -ph / 2 - bw + u * 0.012,
      pw + bw * 2,
      ph + bw * 3,
      '#000000',
      0.25 * inA * out,
      false,
    )
    env.rect(-pw / 2 - bw, -ph / 2 - bw, pw + bw * 2, ph + bw * 3.2, border, inA * out, false)
    env.rect(-pw / 2, -ph / 2, pw, ph, dark, inA * out, false)
    const mid = mix(dark, border, 0.22 * develop)
    if (Pm.win) {
      const wx = -pw * 0.3,
        wy = -ph * 0.32,
        ww = pw * 0.3,
        wh = ph * 0.45,
        lw = Math.max(1, u * 0.004)
      env.rect(wx, wy, ww, wh, mix(dark, border, 0.12 * develop), inA * out, false)
      env.line(
        [
          [wx + ww / 2, wy],
          [wx + ww / 2, wy + wh],
        ],
        dark,
        lw,
        inA * out,
        false,
      )
      env.line(
        [
          [wx, wy + wh / 2],
          [wx + ww, wy + wh / 2],
        ],
        dark,
        lw,
        inA * out,
        false,
      )
    }
    env.rect(-pw / 2, ph * 0.18, pw, ph * 0.32, mid, 0.6 * inA * out, false)
    const spx = -pw / 2 + pw * Pm.spot[0],
      spy = -ph / 2 + ph * Pm.spot[1],
      sr = pw * 0.09
    if (env.pass === 'main') {
      const g = ctx.createRadialGradient(spx, spy, 0, spx, spy, sr * 1.6)
      g.addColorStop(0, rgba(border, (0.55 * develop).toFixed(3)))
      g.addColorStop(1, rgba(border, 0))
      ctx.globalAlpha = inA * out
      ctx.fillStyle = g
      ctx.save()
      ctx.translate(spx, spy)
      ctx.scale(0.75, 1.25)
      ctx.translate(-spx, -spy)
      ctx.fillRect(spx - sr * 2, spy - sr * 2, sr * 4, sr * 4)
      ctx.restore()
      ctx.globalAlpha = 1
    }
    env.draw({
      text: "'" + fakeDate(s, ' ').slice(2),
      font: monoF(env),
      size: ph * 0.055,
      align: 'right',
      x: pw / 2 - ph * 0.05,
      y: ph / 2 - ph * 0.06,
      color: fitContrast(sc.accent, dark, 3),
      alpha: 0.9 * develop * out,
      ghost: false,
      track: 0.1,
    })
    // red marker ring around the smudge
    const ringE = E.outCubic(clamp((lt - cut.dur * 0.3) / 0.5)) * out
    if (ringE > 0) {
      const pts: (readonly [number, number])[] = [],
        n = 40,
        rr = sr * 1.5
      for (let i = 0; i <= n * 1.15; i++) {
        const a = (i / n) * TAU - 1.2,
          w = 1 + 0.12 * noise1(i * 0.3, s) + (i / n) * 0.08
        pts.push([spx + Math.cos(a) * rr * w * 0.8, spy + Math.sin(a) * rr * w])
      }
      env.polyPartial(pts, ringE, sc.accent, Math.max(2, u * 0.005), 0.95, false)
    }
    ctx.restore()
    // arrow to the note and the note itself (the lyric, handwritten)
    const text = splitLines(flat(cut.text), port ? 7 : 6)
    const nx = port ? W / 2 : Pm.side > 0 ? W * 0.76 : W * 0.24,
      ny = port ? H * 0.75 : H * 0.5
    const size = Math.min(
      fitSize(text, Pm.hand, port ? W * 0.84 : W * 0.38, H * (port ? 0.26 : 0.46), {
        track: 0.02,
        lead: 1.2,
      }),
      H * 0.14,
    )
    const [ax, ay] = T(spx + sr * 1.4 * (port ? 0.3 : Pm.side), spy + sr * (port ? 1.6 : 0.3))
    const nm = measure({ text, font: Pm.hand, size, track: 0.02, lead: 1.2 })
    const tx = port ? nx : nx - Pm.side * (nm.w / 2 + size * 0.35),
      ty = port ? ny - nm.h / 2 - size * 0.35 : ny
    const ae = E.outCubic(clamp((lt - cut.dur * 0.3 - 0.35) / 0.35)) * out
    if (ae > 0) {
      const mx = (ax + tx) / 2 + (port ? W * 0.1 : 0),
        my = (ay + ty) / 2 - (port ? 0 : H * 0.1)
      const pts: (readonly [number, number])[] = []
      for (let i = 0; i <= 16; i++) {
        const k = i / 16
        pts.push([
          (1 - k) * (1 - k) * ax + 2 * k * (1 - k) * mx + k * k * tx,
          (1 - k) * (1 - k) * ay + 2 * k * (1 - k) * my + k * k * ty,
        ])
      }
      env.polyPartial(pts.slice().reverse(), ae, sc.accent, Math.max(2, u * 0.004), 0.9, false)
      if (ae > 0.95) {
        const [x1, y1] = pts[0],
          [x2, y2] = pts[2],
          an = Math.atan2(y1 - y2, x1 - x2),
          L = u * 0.03
        env.line(
          [
            [x1 + Math.cos(an + 2.6) * L, y1 + Math.sin(an + 2.6) * L],
            [x1, y1],
            [x1 + Math.cos(an - 2.6) * L, y1 + Math.sin(an - 2.6) * L],
          ],
          sc.accent,
          Math.max(2, u * 0.004),
          0.9,
          false,
        )
      }
    }
    return mainDraw(env, {
      text,
      font: Pm.hand,
      size,
      x: nx,
      y: ny,
      track: 0.02,
      lead: 1.2,
      rot: -Pm.ang * 0.4,
      color: sc.fg,
    })
  },
})

/* ================================================================== 12. the shadow that does not match */
/** hrWrongShadow 的 plan 产物 */
type HrWrongShadowParams = {
  font: string
  k: number
  turn: number
  dir: number
  lean: number
}

reg('hrWrongShadow', {
  tags: TAGS.concat(['emotional', 'graphic']),
  w: 0.9,
  ae: 'stack',
  fits: (n: number) => n >= 1 && n <= 12,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      k: rng.range(1.5, 1.9),
      turn: rng.range(0.45, 0.65),
      dir: rng.pick([1, -1]),
      lean: rng.range(4, 9),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as HrWrongShadowParams,
      s = cut.seed | 0,
      lt = env.lt,
      port = isPort(env)
    const text = splitLines(flat(cut.text), port ? 4 : 7)
    const o = { track: 0.05, lead: 1.1 }
    const size = Math.min(fitSize(text, Pm.font, W * 0.66, H * 0.26, o), H * 0.16)
    const m = measure(Object.assign({ text, font: Pm.font, size }, o))
    const cy = H * 0.66 - m.h * 0.2
    const out = tout(env)
    // the lamp comes on with a stutter
    const on = lt < 0.08 ? 0 : lt < 0.16 ? 1 : lt < 0.24 ? 0.25 : 1
    const flick = rnd(s, env.step, 101) < 0.04 ? 0.5 : 1
    const L = on * flick * out
    const shS = Math.min(size * Pm.k, fitSize(text, Pm.font, W * 0.92, H * 0.42, o))
    const shM = measure(Object.assign({ text, font: Pm.font, size: shS }, o))
    const sy = Math.max(H * 0.06 + shM.h / 2, cy - m.h * 0.5 - shM.h * 0.42)
    if (env.pass === 'main' && L > 0) {
      const pool = isDark(sc.bg) ? mix(sc.bg, sc.fg, 0.16) : mix(sc.bg, '#FFFFFF', 0.5)
      const R = Math.max(shM.w, shS * 2.2) * 0.75
      ctx.save()
      ctx.translate(W / 2, sy)
      ctx.scale(1, 0.72)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R)
      g.addColorStop(0, rgba(pool, L))
      g.addColorStop(1, rgba(pool, 0))
      ctx.fillStyle = g
      ctx.fillRect(-R, -R, R * 2, R * 2)
      ctx.restore()
      // the shadow: bigger, soft, and it moves on its own
      const t = env.ltb,
        d = cut.dur
      const turn = E.inOutCubic(clamp((lt - d * Pm.turn) / 0.5))
      const sxk = 1 - 2 * turn
      const twitch = rnd(s, env.step >> 1, 102) < 0.05 ? rs(s, env.step, 103) * 8 : 0
      const shC = isDark(sc.bg) ? mix(sc.bg, '#000000', 0.55) : mix(sc.bg, sc.fg, 0.28)
      env.draw({
        text,
        font: Pm.font,
        size: shS,
        x: W / 2 + noise1(t * 0.35, s) * size * 0.5,
        y: sy + noise1(t * 0.3, s + 2) * size * 0.1,
        track: 0.05,
        lead: 1.1,
        sx: Math.abs(sxk) < 0.04 ? 0.04 : sxk,
        rot: Pm.dir * Pm.lean * noise1(t * 0.25 + 3, s + 4) + twitch,
        skew: noise1(t * 0.2, s + 5) * 10,
        color: shC,
        alpha: 0.85 * L,
        blur: env.allowFilter ? shS * 0.03 : 0,
        ghost: false,
      })
    }
    const bb = mainDraw(
      env,
      Object.assign({ text, font: Pm.font, size, x: W / 2, y: cy, color: sc.fg }, o),
    )
    // floor line
    const fe = tin(env, 0.1, 0.5) * out
    if (fe > 0)
      env.line(
        [
          [W / 2 - m.w * 0.8 * fe, cy + m.h / 2 + size * 0.2],
          [W / 2 + m.w * 0.8 * fe, cy + m.h / 2 + size * 0.2],
        ],
        sc.sub,
        Math.max(1, size * 0.012),
        0.5,
        false,
      )
    return bb
  },
})

export const pack: PackParts = out
