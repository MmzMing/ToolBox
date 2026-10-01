/**
 * 部件包 horror（3/3）：恐怖背景图形、装饰、镜头运动、画面效果与镜头衔接。
 *
 * 源自 JIZURA 的 src/11p_horror3.js（MIT）：数值常量、缓动曲线、hash 种子、坐标、时长保持一致，
 * 同一组参数渲出同一支视频。key 与注册顺序由 registry 锁定，不要改名、不要增删；
 * 集合归属（set）由 engine/sets.ts 按包名写入，这里不手写。
 */
import type { ParamValue } from '../types'
import type {
  PackParts,
  Cut,
  Env,
  PlanEvent,
  Scheme,
  BBox,
  BgDef,
  FxDef,
  FxInfo,
  Params,
  Rng,
  TransDef,
  TransInfo,
  DecorParam,
  StylePack,
} from '../types'
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
import { fontCSS } from '../fonts'
import { makeCanvas, ctxOf } from '../canvas'
import { packOf } from '../define'

/**
 * 转场包的一层包装：只负责 save/restore 与 p=0/1 的边界，P 是该件 plan 产物的类型，
 * 于是部件自己的 draw(..., P) 里读参数就是原生类型。
 */
type TransPartDef<P extends Params> = Omit<TransDef, 'draw' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  draw: (
    ctx: CanvasRenderingContext2D,
    a: HTMLCanvasElement,
    b: HTMLCanvasElement,
    p: number,
    info: TransInfo,
    P: P,
  ) => void
}

const out: PackParts = {}
const reg = packOf(out)

/** 部件参数可能是字符串/布尔，算术语境里统一取数字 */
const pn = (v: ParamValue, d = 0): number => (typeof v === 'number' ? v : d)

/** 版式/装饰只在画 cut 时被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

const TAGS: string[] = ['horror']
/* ------------------------------------------------------------------ helpers */
const U = (env: Env) => Math.min(env.W, env.H)
const isDark = (c: string) => lum(c) < 0.45
const lightOf = (sc: Scheme) => (lum(sc.fg) > lum(sc.bg) ? sc.fg : sc.bg)
const nightC = (sc: Scheme) => mix(sc.bg, '#000000', isDark(sc.bg) ? 0.72 : 0.9)
const layC = (sc: Scheme, k: number) => mix(sc.bg, sc.fg, k)
const center = (env: Env, bb: BBox | null) =>
  bb || {
    x0: env.W * 0.35,
    x1: env.W * 0.65,
    y0: env.H * 0.4,
    y1: env.H * 0.6,
    cx: env.W / 2,
    cy: env.H / 2,
  }
const inOut = (env: Env, d = 0.35) => E.outCubic(clamp(env.lt / d)) * (1 - E.inCubic(env.pOut))
const wrap = (v: number, m: number) => ((v % m) + m) % m
const overlaps = (
  bb: { x0: number; x1: number; y0: number; y1: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pad = 0,
) => !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad)
/* static noise tiles (built once, deterministic) */
const NOISE: HTMLCanvasElement[] = []
const noiseCv = (k: number) => {
  k = ((k % 4) + 4) % 4
  if (NOISE[k]) return NOISE[k]
  const w = 128,
    h = 96,
    c = makeCanvas()
  c.width = w
  c.height = h
  const x = ctxOf(c),
    id = x.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const v = Math.pow(rnd(i, k, 5511), 1.3) * 255
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  x.putImageData(id, 0, 0)
  NOISE[k] = c
  return c
}
/* time since this background started (consecutive cuts with the same bg + seed count as one run) */
const bgRun = new WeakMap()
const bgT = (env: Env) => {
  const c = cutOf(env)
  if (!c) return env.t
  let s = bgRun.get(c)
  if (s == null) {
    s = c.start
    const cs = (env.plan && env.plan.cuts) || [],
      P0 = c.bgP || {}
    for (let i = ((c.index ?? 0) | 0) - 1; i >= 0 && i < cs.length; i--) {
      const p = cs[i]
      if (p.bg === c.bg && (p.bgP || {}).seed === P0.seed && Math.abs(p.end - s) < 0.06) s = p.start
      else break
    }
    bgRun.set(c, s)
  }
  return env.t - s
}
type BgPartDef<P extends Params> = Omit<BgDef, 'draw' | 'plan'> & {
  plan?: (rng: Rng, st: StylePack) => P
  draw: (env: Env, p: P, ctx: CanvasRenderingContext2D) => void
}
const bgReg = <P extends Params>(k: string, d: BgPartDef<P>) =>
  reg(
    'bg',
    k,
    Object.assign({}, d, {
      draw(env: Env, Pm: Params) {
        const ctx = env.ctx
        ctx.save()
        try {
          d.draw(env, (Pm || {}) as unknown as P, ctx)
        } finally {
          ctx.restore()
        }
      },
    }) as unknown as BgDef,
  )
/* failing-light level 0..1 on a ≤24 Hz clock (mostly on, stutters now and then) */
const lamp = (t: number, seed: number, rate = 1) => {
  const st = Math.floor(t * 24),
    run = st >> 2
  if (rnd(seed, run, 7) < 0.1 * rate) return rnd(seed, st, 8) < 0.5 ? 0.15 : 0.55
  return 0.88 + 0.12 * rnd(seed, st, 9)
}

/* ================================================================== DECOR */

/* claw scratches: parallel jagged gouges scraped in around the words */
reg('decor', 'hrScratches', {
  tags: TAGS.concat(['glitch']),
  w: 0.9,
  layer: 'front',
  ae: 'slash',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { W, H, sc } = env,
      s = Pd.seed | 0,
      u = U(env),
      out = 1 - E.inCubic(env.pOut)
    const n = Pd.n || 2
    for (let g = 0; g < n; g++) {
      const e = E.outExpo(clamp((env.lt - 0.08 - g * 0.18) / 0.16)) * out
      if (e <= 0) continue
      const corner = (g + (Pd.v | 0)) % 4,
        right = corner % 2 === 1,
        low = corner >= 2
      const L = u * rr(0.28, 0.42, s, g, 1),
        ang = (right ? -1 : 1) * rr(55, 75, s, g, 2) * DEG * (low ? -1 : 1)
      const cx = right ? rr(W * 0.72, W * 0.9, s, g, 3) : rr(W * 0.1, W * 0.28, s, g, 3)
      let cy = low ? rr(H * 0.72, H * 0.88, s, g, 4) : rr(H * 0.12, H * 0.28, s, g, 4)
      if (overlaps(bb, cx - L / 2, cy - L / 2, cx + L / 2, cy + L / 2, u * 0.02))
        cy = low ? Math.max(cy, bb.y1 + L * 0.6) : Math.min(cy, bb.y0 - L * 0.6)
      const dx = Math.sin(ang),
        dy = -Math.cos(ang),
        px = Math.cos(ang),
        py = Math.sin(ang)
      const col = g % 2 && contrast(sc.accent, sc.bg) > 1.8 ? sc.accent : sc.fg
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * u * 0.042,
          len = L * (0.75 + 0.3 * rnd(s, g, k, 5)) * e,
          st = rnd(s, g, k, 6) * L * 0.1
        const x0 = cx + px * off - (dx * L) / 2 + dx * st,
          y0 = cy + py * off - (dy * L) / 2 + dy * st
        const m = 10,
          pts: (readonly [number, number])[] = []
        for (let i = 0; i <= m; i++) {
          const f = i / m,
            j = rs(s, g, k, i) * u * 0.004
          pts.push([x0 + dx * len * f + px * j, y0 + dy * len * f + py * j])
        }
        // tapered: thick in the middle, thin at the ends
        const lw = u * 0.011
        for (let i = 0; i < m; i++)
          env.line(
            [pts[i], pts[i + 1]] as const,
            col,
            Math.max(1, lw * Math.sin((Math.PI * (i + 0.5)) / m)),
            0.85,
            false,
          )
      }
    }
  },
})

/* sigil: a slow-turning ring of marks and a seven-pointed star drawn in faint lines behind the words */
reg('decor', 'hrSigil', {
  tags: TAGS.concat(['graphic']),
  w: 0.7,
  layer: 'back',
  subtle: true,
  ae: 'rings',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { sc } = env,
      s = Pd.seed | 0,
      u = U(env)
    const e = E.inOutSine(clamp(env.lt / 1.2)),
      out = 1 - E.inCubic(env.pOut)
    if (out <= 0) return
    const cx = (bb.x0 + bb.x1) / 2,
      cy = (bb.y0 + bb.y1) / 2,
      R = Math.min(u * 0.46, Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.62 + u * 0.08)
    const col = isDark(sc.bg) ? layC(sc, 0.3) : layC(sc, 0.28),
      lw = Math.max(1.2, u * 0.0022),
      rot = env.ltb * 4 * (Pd.right ? -1 : 1) * DEG
    const a = out
    env.arc(cx, cy, R, -90, -90 + 360 * e, col, lw * 1.4, a, false)
    env.arc(cx, cy, R * 0.9, 90, 90 + 360 * e, col, lw, a, false)
    env.arc(cx, cy, R * 0.62, -90, -90 + 360 * e, col, lw, a * 0.8, false)
    // heptagram {7/3}
    const pts: (readonly [number, number])[] = []
    for (let i = 0; i <= 7; i++) {
      const an = rot - Math.PI / 2 + (((i * 3) % 7) / 7) * TAU
      pts.push([cx + Math.cos(an) * R * 0.9, cy + Math.sin(an) * R * 0.9])
    }
    env.polyPartial(pts, clamp((env.lt - 0.3) / 1.2), col, lw, a, false)
    // ring of marks between the circles
    const m = 42
    for (let i = 0; i < m * e; i++) {
      const an = rot * -0.6 + (i / m) * TAU,
        t = hash(s, i, 3) % 4,
        r0 = R * 0.915,
        r1 = R * 0.985,
        c = Math.cos(an),
        sn = Math.sin(an)
      if (t === 0)
        env.line(
          [
            [cx + c * r0, cy + sn * r0],
            [cx + c * r1, cy + sn * r1],
          ],
          col,
          lw,
          a,
          false,
        )
      else if (t === 1)
        env.circle(
          cx + (c * (r0 + r1)) / 2,
          cy + (sn * (r0 + r1)) / 2,
          R * 0.012,
          null,
          col,
          lw,
          a,
          false,
        )
      else if (t === 2) {
        const q = (r0 + r1) / 2,
          d = R * 0.018
        env.line(
          [
            [cx + c * q - sn * d, cy + sn * q + c * d],
            [cx + c * q + sn * d, cy + sn * q - c * d],
          ],
          col,
          lw,
          a,
          false,
        )
      }
    }
  },
})

/* the eye: a simple outline eye in a corner that opens, follows the words and blinks at the wrong moments */
reg('decor', 'hrWatchEye', {
  tags: TAGS.concat(['graphic']),
  w: 0.8,
  layer: 'front',
  ae: 'reticle',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { W, H, sc } = env,
      s = Pd.seed | 0,
      u = U(env)
    const ew = u * (Pd.big ? 0.22 : 0.16),
      eh = ew * 0.26
    const x = Pd.right ? W - u * 0.07 - ew / 2 : u * 0.07 + ew / 2
    let y = Pd.low ? H - u * 0.08 - eh : u * 0.08 + eh
    if (overlaps(bb, x - ew / 2, y - eh, x + ew / 2, y + eh, u * 0.02))
      y = Pd.low
        ? Math.max(y, Math.min(H - eh * 1.2, bb.y1 + eh * 1.6))
        : Math.min(y, Math.max(eh * 1.2, bb.y0 - eh * 1.6))
    let open = E.outCubic(clamp((env.lt - 0.2) / 0.6)) * (1 - E.inCubic(env.pOut))
    // blinks at irregular moments
    const bt = env.ltb
    for (let k = 0; k < 3; k++) {
      const at = 0.9 + rnd(s, k, 5) * 3 + k * 1.3,
        d = Math.abs(bt - at)
      if (d < 0.08) open *= d / 0.08
    }
    if (open <= 0.01) {
      env.line(
        [
          [x - ew / 2, y],
          [x + ew / 2, y],
        ],
        sc.fg,
        Math.max(1.2, u * 0.003),
        0.8 * (1 - E.inCubic(env.pOut)) * clamp(env.lt / 0.2),
        false,
      )
      return
    }
    const col = sc.fg,
      lw = Math.max(1.2, u * 0.003),
      ctx = env.ctx
    const lid = (sgn: number) => {
      const pts: (readonly [number, number])[] = []
      for (let i = 0; i <= 16; i++) {
        const f = i / 16,
          xx = x - ew / 2 + ew * f
        pts.push([xx, y + sgn * Math.sin(Math.PI * f) * eh * open])
      }
      return pts
    }
    const top = lid(-1),
      bot = lid(1)
    // iris + pupil clipped to the eye opening, looking at the words
    const tx = (bb.x0 + bb.x1) / 2,
      ty = (bb.y0 + bb.y1) / 2,
      an = Math.atan2(ty - y, tx - x),
      look = Math.min(1, Math.hypot(tx - x, ty - y) / u)
    const ix = x + Math.cos(an) * ew * 0.18 * look + noise1(bt * 0.8, s) * ew * 0.03,
      iy = y + Math.sin(an) * eh * 0.3 * look
    ctx.save()
    ctx.beginPath()
    top.forEach((p, i: number) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1])
    ctx.closePath()
    ctx.clip()
    env.circle(ix, iy, eh * 0.78, null, col, lw, 1, false)
    env.circle(ix, iy, eh * 0.34, isDark(sc.bg) ? sc.accent : sc.fg, null, 0, 1, false)
    ctx.restore()
    env.line(top, col, lw * 1.3, 1, false)
    env.line(bot, col, lw, 1, false)
    for (let k = 0; k < 5; k++) {
      const f = 0.2 + k * 0.15,
        p = top[Math.round(f * 16)]
      env.line(
        [p, [p[0] + (f - 0.5) * ew * 0.12, p[1] - eh * 0.35 * open]],
        col,
        lw * 0.8,
        0.8,
        false,
      )
    }
  },
})

/* static patches: small rectangles of TV snow flicker at the edges of the frame */
reg('decor', 'hrStaticPatch', {
  tags: TAGS.concat(['glitch']),
  w: 0.8,
  layer: 'front',
  ae: 'glitchRects',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { W, H } = env,
      s = Pd.seed | 0,
      st = env.step,
      u = U(env),
      ctx = env.ctx
    const a0 = inOut(env, 0.2)
    if (a0 <= 0) return
    const n = 3 + (Pd.n || 2) * 2
    ctx.save()
    ctx.imageSmoothingEnabled = false
    for (let k = 0; k < n; k++) {
      if (rnd(s, k, st, 1) < 0.35) continue
      const w = u * rr(0.06, 0.2, s, k, 2),
        h = u * rr(0.02, 0.07, s, k, 3)
      const edge = hash(s, k, 4) % 4
      let x = rnd(s, k, 5) * (W - w),
        y = rnd(s, k, 6) * (H - h)
      if (edge === 0) y = rr(0.02, 0.18, s, k, 7) * H
      else if (edge === 1) y = H - h - rr(0.02, 0.18, s, k, 7) * H
      else if (edge === 2) x = rr(0.01, 0.1, s, k, 7) * W
      else x = W - w - rr(0.01, 0.1, s, k, 7) * W
      x += rs(s, k, st >> 1, 8) * u * 0.02
      if (overlaps(bb, x, y, x + w, y + h, u * 0.02)) continue
      const N = noiseCv(st + k),
        sx = Math.floor(rnd(s, k, st, 9) * 64),
        sy = Math.floor(rnd(s, k, st, 10) * 48)
      ctx.globalAlpha = a0 * rr(0.45, 0.85, s, k, st, 11)
      ctx.drawImage(N, sx, sy, 48, 24, x, y, w, h)
    }
    ctx.restore()
  },
})

/* light shaft: a slanted beam from a high window with dust hanging in it */
reg('decor', 'hrDustBeam', {
  tags: TAGS.concat(['calm', 'emotional']),
  w: 0.8,
  layer: 'back',
  subtle: true,
  ae: 'sparks',
  draw(env: Env, _bb: BBox | null, Pd: DecorParam) {
    if (env.pass !== 'main') return
    const { W, H, sc, ctx } = env,
      s = Pd.seed | 0,
      u = U(env)
    const a = inOut(env, 0.8)
    if (a <= 0) return
    const L = lightOf(sc),
      right = !!Pd.right,
      x0 = right ? W * 0.78 : W * 0.22,
      w0 = W * 0.12,
      w1 = W * 0.34,
      sl = (right ? -1 : 1) * W * 0.28
    const poly = [
      [x0 - w0 / 2, -2],
      [x0 + w0 / 2, -2],
      [x0 + sl + w1 / 2, H + 2],
      [x0 + sl - w1 / 2, H + 2],
    ]
    const g = ctx.createLinearGradient(0, 0, 0, H)
    const k = isDark(sc.bg) ? 0.1 : 0.22
    g.addColorStop(0, rgba(L, (k * a).toFixed(3)))
    g.addColorStop(1, rgba(L, 0))
    ctx.save()
    if (!isDark(sc.bg)) {
      // on light paper the room around the beam is dimmed instead
      ctx.fillStyle = rgba(nightC(sc), (0.12 * a).toFixed(3))
      ctx.beginPath()
      ctx.rect(-10, -10, W + 20, H + 20)
      poly.forEach((p, i: number) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.fill('evenodd')
    }
    ctx.fillStyle = g
    ctx.beginPath()
    poly.forEach((p, i: number) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.closePath()
    ctx.fill()
    ctx.clip()
    const dustC = isDark(sc.bg) ? L : sc.sub
    const t = env.ltb
    for (let i = 0; i < 46; i++) {
      const fy = wrap(rnd(s, i, 1) + t * rr(0.004, 0.02, s, i, 2), 1),
        y = fy * H,
        f = rnd(s, i, 3)
      const cx = x0 + sl * fy,
        ww = w0 + (w1 - w0) * fy,
        x = cx + (f - 0.5) * ww + Math.sin(t * 0.7 + i) * u * 0.01
      env.circle(
        x,
        y,
        u * rr(0.0012, 0.0035, s, i, 4),
        dustC,
        null,
        0,
        a * (0.35 + 0.35 * Math.sin(t * 1.5 + i)) * (1 - fy * 0.6),
        false,
      )
    }
    ctx.restore()
  },
})

/* drips: dark ink running down from the top edge of the frame, slowly */
reg('decor', 'hrDrips', {
  tags: TAGS.concat(['emotional']),
  w: 0.8,
  layer: 'front',
  ae: 'blobs',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { W, sc } = env,
      s = Pd.seed | 0,
      u = U(env)
    const out = 1 - E.inCubic(env.pOut)
    if (out <= 0) return
    const col = isDark(sc.bg) ? mix(sc.accent, sc.bg, 0.35) : nightC(sc)
    const band = u * 0.03 * E.outCubic(clamp(env.lt / 0.4))
    const pts: (readonly [number, number])[] = [
      [-4, -4],
      [W + 4, -4],
    ]
    for (let i = 40; i >= 0; i--) pts.push([(W * i) / 40, band * (0.6 + 0.6 * rnd(s, i, 1))])
    env.poly(pts, col, 0.9 * out, false)
    const n = 7 + (Pd.n | 0) * 3,
      lim = Math.max(band * 2, bb.y0 - u * 0.05)
    for (let k = 0; k < n; k++) {
      const x = W * (0.03 + 0.94 * rnd(s, k, 2)),
        g = E.outCubic(clamp((env.lt - rnd(s, k, 3) * 0.8) / (2.5 + rnd(s, k, 4) * 3)))
      let L = u * rr(0.06, 0.3, s, k, 5) * g
      if (x > bb.x0 - u * 0.03 && x < bb.x1 + u * 0.03) L = Math.min(L, lim - band)
      if (L <= 1) continue
      const w = u * rr(0.004, 0.012, s, k, 6)
      env.poly(
        [
          [x - w, band * 0.5],
          [x + w, band * 0.5],
          [x + w * 0.7, band + L],
          [x - w * 0.7, band + L],
        ],
        col,
        0.9 * out,
        false,
      )
      env.circle(x, band + L, w * 1.35, col, null, 0, 0.9 * out, false)
    }
  },
})

/* cracks: fine fractures creep out of a corner of the frame */
reg('decor', 'hrCracks', {
  tags: TAGS.concat(['graphic', 'glitch']),
  w: 0.7,
  layer: 'front',
  ae: 'lineBurst',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return
    const bb = center(env, bb0),
      { W, H, sc } = env,
      s = Pd.seed | 0,
      u = U(env)
    const out = 1 - E.inCubic(env.pOut)
    if (out <= 0) return
    const e = E.outCubic(clamp(env.lt / 1.6))
    const ox = Pd.right ? W : 0,
      oy = Pd.low ? H : 0,
      col = sc.fg,
      lw = Math.max(1, u * 0.0018)
    const base = Math.atan2(H / 2 - oy, W / 2 - ox)
    const branch = (x: number, y: number, an: number, len: number, depth: number, id: number) => {
      const pts: (readonly [number, number])[] = [[x, y]]
      let cx = x,
        cy = y
      const m = 7
      for (let i = 1; i <= m; i++) {
        const a = an + rs(s, id, i, 1) * 0.5
        cx += (Math.cos(a) * len) / m
        cy += (Math.sin(a) * len) / m
        if (overlaps(bb, cx, cy, cx, cy, u * 0.03)) break
        pts.push([cx, cy])
      }
      env.polyPartial(
        pts,
        clamp(e * (1 + depth * 0.2) - depth * 0.25),
        col,
        lw * (1.4 - depth * 0.35),
        0.75 * out,
        false,
      )
      if (depth < 2)
        for (let k = 0; k < 2; k++) {
          const j = 2 + (hash(s, id, k, 3) % (pts.length - 1 || 1))
          const p = pts[Math.min(j, pts.length - 1)]
          branch(
            p[0],
            p[1],
            an + (k ? 0.6 : -0.6) * rr(0.6, 1.2, s, id, k, 4),
            len * 0.5,
            depth + 1,
            id * 3 + k + 1,
          )
        }
    }
    for (let r = 0; r < 3; r++)
      branch(
        ox,
        oy,
        base + (r - 1) * 0.35 + rs(s, r, 9) * 0.15,
        u * rr(0.28, 0.42, s, r, 10),
        0,
        r + 1,
      )
  },
})

/* ================================================================== BACKGROUNDS */

bgReg('hrFailingLamp', {
  ae: 'vignettePulse',
  tags: TAGS.concat(['emotional']),
  w: 0.9,
  subtle: true,
  plan: (rng: Rng) => ({
    seed: rng.int(1, 1e9),
    x: rng.range(0.35, 0.65),
    rate: rng.range(0.7, 1.3),
  }),
  draw(env: Env, Pm, ctx: CanvasRenderingContext2D) {
    const { W, H, sc } = env,
      t = env.t,
      u = U(env),
      lv = lamp(t, Pm.seed | 0, Pm.rate || 1),
      fi = E.outCubic(clamp(bgT(env) / 0.6))
    const L = lightOf(sc),
      dk = nightC(sc),
      cx = W * (Pm.x || 0.5),
      cy = -u * 0.1
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.9)
    g.addColorStop(0, rgba(L, ((isDark(sc.bg) ? 0.16 : 0.3) * lv * fi).toFixed(3)))
    g.addColorStop(0.5, rgba(L, ((isDark(sc.bg) ? 0.04 : 0.08) * lv * fi).toFixed(3)))
    g.addColorStop(1, rgba(L, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    const v = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.3,
      W / 2,
      H / 2,
      Math.hypot(W, H) * 0.6,
    )
    v.addColorStop(0, rgba(dk, 0))
    v.addColorStop(1, rgba(dk, ((0.75 - 0.25 * lv) * fi).toFixed(3)))
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)
    // the tube itself
    ctx.globalAlpha = (0.25 + 0.5 * lv) * fi
    ctx.fillStyle = layC(sc, isDark(sc.bg) ? 0.35 : 0.15)
    ctx.fillRect(cx - u * 0.12, u * 0.012, u * 0.24, Math.max(2, u * 0.006))
  },
})

bgReg('hrCorridor', {
  ae: 'squareTunnel',
  tags: TAGS.concat(['graphic']),
  w: 0.8,
  plan: (rng: Rng) => ({
    seed: rng.int(1, 1e9),
    vx: rng.range(0.44, 0.56),
    vy: rng.range(0.44, 0.54),
    spd: rng.range(0.25, 0.45),
    doors: rng.chance(0.75),
  }),
  draw(env: Env, Pm: Params, ctx: CanvasRenderingContext2D) {
    const { W, H, sc } = env,
      t = bgT(env),
      u = U(env),
      fi = E.outCubic(clamp(t / 0.6))
    const vx = W * (pn(Pm.vx) || 0.5),
      vy = H * (pn(Pm.vy) || 0.5),
      bw = W * 0.08,
      bh = H * 0.1
    const col = layC(sc, isDark(sc.bg) ? 0.28 : 0.22),
      lw = Math.max(1.2, u * 0.0026)
    // depth map: z in (0,1], 1 = at the screen edge, small = far away
    const back = [
      [vx - bw, vy - bh],
      [vx + bw, vy - bh],
      [vx + bw, vy + bh],
      [vx - bw, vy + bh],
    ]
    const corners = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ]
    // the light at the far end (flickers)
    const lv = lamp(env.t, (pn(Pm.seed) | 0) + 1, 1)
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, Math.max(bw, bh) * 3)
    g.addColorStop(0, rgba(lightOf(sc), ((isDark(sc.bg) ? 0.22 : 0.3) * lv * fi).toFixed(3)))
    g.addColorStop(1, rgba(lightOf(sc), 0))
    ctx.fillStyle = g
    ctx.fillRect(vx - bw * 4, vy - bh * 4, bw * 8, bh * 8)
    ctx.strokeStyle = col
    ctx.lineWidth = lw
    ctx.globalAlpha = fi
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(corners[i][0], corners[i][1])
      ctx.lineTo(back[i][0], back[i][1])
    }
    ctx.rect(vx - bw, vy - bh, bw * 2, bh * 2)
    // frames sliding towards the camera
    const n = 7,
      sp = pn(Pm.spd) || 0.35
    for (let k = 0; k < n; k++) {
      const f = wrap(k / n + t * sp * 0.12, 1),
        z = Math.pow(f, 2.2)
      const x0 = lerp(vx - bw, 0, z),
        x1 = lerp(vx + bw, W, z),
        y0 = lerp(vy - bh, 0, z),
        y1 = lerp(vy + bh, H, z)
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y0)
      ctx.moveTo(x0, y1)
      ctx.lineTo(x1, y1)
      if (Pm.doors && k % 2 === 0) {
        // a door on each wall: two verticals between the ceiling and floor edges
        const z2 = Math.pow(wrap(f + 0.05, 1), 2.2)
        if (z2 > z)
          for (const side of [0, 1]) {
            const xa = side ? x1 : x0,
              xb = side ? lerp(vx + bw, W, z2) : lerp(vx - bw, 0, z2)
            const ya = lerp(y0, y1, 0.25),
              yb = lerp(lerp(vy - bh, 0, z2), lerp(vy + bh, H, z2), 0.25)
            ctx.moveTo(xa, y1)
            ctx.lineTo(xa, ya)
            ctx.lineTo(xb, yb)
            ctx.lineTo(xb, lerp(vy + bh, H, z2))
          }
      }
    }
    ctx.stroke()
    const v = ctx.createRadialGradient(
      vx,
      vy,
      Math.min(W, H) * 0.2,
      vx,
      vy,
      Math.hypot(W, H) * 0.65,
    )
    v.addColorStop(0, rgba(nightC(sc), 0))
    v.addColorStop(1, rgba(nightC(sc), (0.55 * fi).toFixed(3)))
    ctx.globalAlpha = 1
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)
  },
})

bgReg('hrMold', {
  ae: 'meshBlobs',
  tags: TAGS.concat(['emotional']),
  w: 0.7,
  subtle: true,
  plan: (rng: Rng) => ({ seed: rng.int(1, 1e9), n: rng.int(3, 5), k: rng.range(0.08, 0.14) }),
  draw(env: Env, Pm: Params, ctx: CanvasRenderingContext2D) {
    const { W, H, sc } = env,
      t = bgT(env),
      u = U(env),
      s = pn(Pm.seed) | 0,
      k = pn(Pm.k) || 0.1
    const stain = isDark(sc.bg)
      ? mix(sc.bg, mix(sc.fg, sc.accent2 || sc.sub, 0.5), k)
      : mix(sc.bg, mix(sc.sub, '#000000', 0.3), k * 1.4)
    const rim = isDark(sc.bg) ? mix(sc.bg, sc.fg, k * 1.6) : mix(sc.bg, '#000000', k * 1.3)
    for (let i = 0; i < (pn(Pm.n) || 4); i++) {
      const edge = hash(s, i, 1) % 4,
        f = rnd(s, i, 2)
      const cx = edge === 0 ? f * W : edge === 1 ? W : edge === 2 ? f * W : 0,
        cy = edge === 0 ? 0 : edge === 1 ? f * H : edge === 2 ? H : f * H
      const R =
        u *
        rr(0.25, 0.5, s, i, 3) *
        (0.35 + 0.65 * E.outCubic(clamp(t / rr(8, 14, s, i, 4)))) *
        E.outCubic(clamp(t / 0.8))
      const m = 36,
        pts: (readonly [number, number])[] = []
      for (let j = 0; j < m; j++) {
        const a = (j / m) * TAU,
          r = R * (0.7 + 0.45 * noise1(j * 0.45, s + i) + 0.04 * Math.sin(t * 0.3 + j))
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      env.blob(pts, stain, 0.9, false)
      ctx.save()
      ctx.strokeStyle = rim
      ctx.lineWidth = Math.max(1, u * 0.003)
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      pts.forEach((p, j: number) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
      // speckles around the edge of the stain
      for (let j = 0; j < 14; j++) {
        const a = rnd(s, i, j, 5) * TAU,
          r = R * rr(1.02, 1.25, s, i, j, 6)
        env.circle(
          cx + Math.cos(a) * r,
          cy + Math.sin(a) * r,
          u * rr(0.002, 0.008, s, i, j, 7),
          stain,
          null,
          0,
          0.9,
          false,
        )
      }
    }
  },
})

bgReg('hrDeadTrees', {
  ae: 'mountains',
  tags: TAGS.concat(['calm', 'emotional']),
  w: 0.7,
  plan: (rng: Rng) => ({ seed: rng.int(1, 1e9), n: rng.int(5, 8), fog: rng.range(0.1, 0.2) }),
  draw(env: Env, Pm: Params, ctx: CanvasRenderingContext2D) {
    const { W, H, sc } = env,
      t = env.t,
      u = U(env),
      s = pn(Pm.seed) | 0,
      fi = E.outCubic(clamp(bgT(env) / 0.8))
    const layers = [
      [0.07, 0.75, 0.8],
      [0.13, 1, 1.15],
    ]
    layers.forEach(([k, hk, sk], l) => {
      const col = isDark(sc.bg) ? layC(sc, k * 0.9) : mix(sc.bg, '#000000', k * 1.6)
      ctx.strokeStyle = col
      ctx.lineCap = 'round'
      ctx.globalAlpha = fi
      const n = (pn(Pm.n) || 6) + l * 2
      for (let i = 0; i < n; i++) {
        const x = (W * (i + 0.5 + rs(s, l, i, 1) * 0.35)) / n,
          h = H * rr(0.7, 1.05, s, l, i, 2) * hk,
          sw = Math.sin(t * 0.4 + i + l) * 0.012
        const seg = (x0: number, y0: number, an: number, len: number, d: number, id: number) => {
          const x1 = x0 + Math.cos(an) * len,
            y1 = y0 + Math.sin(an) * len
          ctx.lineWidth = Math.max(1, u * 0.02 * sk * Math.pow(0.55, d))
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
          if (d >= 4) return
          const nb = 2
          for (let b = 0; b < nb; b++)
            seg(
              x1,
              y1,
              an + (b ? 1 : -1) * rr(0.25, 0.7, s, id, b, 3) + sw * (d + 1),
              len * rr(0.55, 0.78, s, id, b, 4),
              d + 1,
              id * 2 + b + 1,
            )
        }
        seg(x, H + 2, -Math.PI / 2 + rs(s, l, i, 5) * 0.08, h * 0.42, 0, (l * 50 + i) * 64 + 1)
      }
    })
    const f = ctx.createLinearGradient(0, H * 0.45, 0, H)
    f.addColorStop(0, rgba(lightOf(sc), 0))
    f.addColorStop(
      1,
      rgba(isDark(sc.bg) ? layC(sc, 0.5) : sc.bg, ((pn(Pm.fog) || 0.15) * fi).toFixed(3)),
    )
    ctx.globalAlpha = 1
    ctx.fillStyle = f
    ctx.fillRect(0, H * 0.45, W, H * 0.55)
  },
})

/* ================================================================== CAMERA */
const KM = (env: Env) => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25)

reg('cam', 'hrNervous', {
  ae: 'handheld',
  tags: TAGS.concat(['glitch', 'emotional']),
  w: 0.9,
  plan: (rng: Rng) => ({ f: rng.range(0.9, 1.3), jerk: rng.range(0.6, 1) }),
  get: (env: Env, Pm) => {
    const K = KM(env),
      f = Pm.f || 1,
      t = env.lt,
      sd = cutOf(env).seed | 0
    let x = (noise1(t * f * 1.7, sd) * 0.6 + noise1(t * f * 5.3, sd + 1) * 0.4) * env.W * 0.009 * K
    let y =
      (noise1(t * f * 1.4, sd + 2) * 0.6 + noise1(t * f * 4.7, sd + 3) * 0.4) * env.H * 0.011 * K +
      Math.sin(t * 2.2) * env.H * 0.004 * K
    let rot = noise1(t * f * 1.1, sd + 4) * 1.2 * K
    // a sudden flinch now and then, settling fast
    const per = 1.6,
      cyc = Math.floor(t / per),
      since = t - cyc * per - rnd(sd, cyc, 5) * per * 0.6
    if (since > 0 && rnd(sd, cyc, 6) < 0.65 * (Pm.jerk || 0.8)) {
      const d = Math.exp(-since * 9) * K
      x += rs(sd, cyc, 7) * env.W * 0.025 * d
      y += rs(sd, cyc, 8) * env.H * 0.03 * d
      rot += rs(sd, cyc, 9) * 3 * d
    }
    return { x, y, rot, s: 1.03, blur: 0 }
  },
})

reg('cam', 'hrDutchSnap', {
  ae: 'dutch',
  tags: TAGS.concat(['emotional', 'graphic']),
  w: 0.7,
  strong: true,
  plan: (rng: Rng) => ({ at: rng.range(0.45, 0.65), a: rng.range(3, 4.8) * rng.pick([1, -1]) }),
  get: (env: Env, Pm) => {
    const K = KM(env),
      d = cutOf(env).dur,
      u = clamp(env.lt / Math.max(0.3, d))
    const q = clamp((env.lt - d * (Pm.at || 0.55)) / 0.1),
      e = E.outBack(q, 2.5)
    return {
      s: 1 + 0.045 * K * E.inOutSine(u) + 0.02 * K * e,
      rot: (Pm.a || 4) * Math.min(1, K) * e,
      y: -env.H * 0.006 * K * e,
    }
  },
})

/* ================================================================== SCREEN EFFECTS */
const evS = (ev: PlanEvent) => hash(Math.round(ev.t * 1000), 9127)
const fx = (k: string, d: FxDef & { draw: NonNullable<FxDef['draw']> }) =>
  reg(
    'fx',
    k,
    Object.assign({}, d, {
      draw(ctx: CanvasRenderingContext2D, ev: PlanEvent, k2: number, I: FxInfo) {
        ctx.save()
        try {
          d.draw(ctx, ev, clamp(k2), I)
        } finally {
          ctx.restore()
        }
      },
    }),
  )

/* one frame of a zoomed, red-stained negative */
fx('hrSubliminal', {
  tags: TAGS.concat(['glitch']),
  w: 0.6,
  dur: 2,
  amp: 1,
  glitchy: true,
  mid: true,
  scratch: true,
  ae: 'invert',
  draw(ctx: CanvasRenderingContext2D, ev: PlanEvent, k: number, I: FxInfo) {
    const { cw, ch, S, sc } = I
    if (!S) return
    if (k > 0.55) return
    const s = evS(ev),
      z = 1.25 + 0.2 * rnd(s, 1),
      cx = cw * (0.5 + rs(s, 2) * 0.08),
      cy = ch * (0.5 + rs(s, 3) * 0.08)
    ctx.drawImage(S, cx - cx * z, cy - cy * z, cw * z, ch * z)
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = fitContrast(sc.accent, '#ffffff', 2.5)
    ctx.fillRect(0, 0, cw, ch)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000000'
    ctx.globalAlpha = 0.25
    ctx.fillRect(0, 0, cw, ch)
  },
})

/* the picture tears, drops to black with a signal-lost caption, and rolls back in */
fx('hrSignalLoss', {
  tags: TAGS.concat(['glitch', 'editorial']),
  w: 0.7,
  dur: 9,
  pre: 3,
  amp: 1,
  glitchy: true,
  scratch: true,
  ae: 'blackFrame',
  draw(ctx: CanvasRenderingContext2D, ev: PlanEvent, k: number, I: FxInfo) {
    const { cw, ch, S } = I
    if (!S) return
    const s = evS(ev),
      st = I.step * 7 + s
    if (k < 0.3) {
      const q = k / 0.3,
        n = 10
      for (let i = 0; i < n; i++) {
        const y = Math.floor((ch * i) / n),
          h = Math.ceil(ch / n)
        if (rnd(st, i, 1) < 0.5 * q)
          ctx.drawImage(S, 0, y, cw, h, rs(st, i, 2) * cw * 0.12 * q, y, cw, h)
      }
      ctx.globalAlpha = 0.5 * q
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, cw, ch)
      return
    }
    if (k < 0.78) {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, cw, ch)
      const fs = Math.max(10, Math.round(Math.min(cw, ch) * 0.035))
      ctx.font = fontCSS('mono', fs)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = I.step % 4 < 3 ? 0.85 : 0.3
      ctx.fillText('NO SIGNAL', cw * 0.06, ch * 0.08)
      ctx.globalAlpha = 0.6
      ctx.fillText('CH ' + String(3 + (s % 9)).padStart(2, '0'), cw * 0.06, ch * 0.08 + fs * 1.5)
      return
    }
    const q = (k - 0.78) / 0.22,
      oy = Math.round((1 - q) * ch * 0.5)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, cw, ch)
    ctx.drawImage(S, 0, oy)
    ctx.drawImage(S, 0, oy - ch)
    ctx.fillRect(0, oy - Math.max(3, ch * 0.03), cw, Math.max(3, ch * 0.03))
  },
})

/* something tall and dark crosses the frame in a few frames */
fx('hrPassingShadow', {
  tags: TAGS.concat(['emotional']),
  w: 0.5,
  dur: 5,
  amp: 1,
  mid: true,
  ae: 'flash',
  draw(ctx: CanvasRenderingContext2D, ev: PlanEvent, k: number, I: FxInfo) {
    const { cw, ch } = I,
      s = evS(ev),
      dir = rnd(s, 1) < 0.5 ? 1 : -1,
      M = Math.min(cw, ch)
    const x = dir > 0 ? lerp(-cw * 0.25, cw * 1.25, k) : lerp(cw * 1.25, -cw * 0.25, k)
    const w = M * rr(0.22, 0.32, s, 2),
      h = ch * 1.1,
      top = ch * rr(0.05, 0.2, s, 3)
    // dark on light pictures, a pale figure on dark ones; a wider faint copy stands in for a soft edge
    const dk = isDark(I.sc.bg)
    ctx.fillStyle = dk ? mix(I.sc.fg, I.sc.bg, 0.35) : '#000000'
    const fig = (g: number, a: number) => {
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.ellipse(x, top + w * 0.35, w * 0.3 * g, w * 0.38 * g, 0, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x - w * 0.5 * g, h)
      ctx.quadraticCurveTo(x - w * 0.55 * g, top + w * 0.75, x, top + w * (0.7 - 0.05 * g))
      ctx.quadraticCurveTo(x + w * 0.55 * g, top + w * 0.75, x + w * 0.5 * g, h)
      ctx.closePath()
      ctx.fill()
    }
    fig(1.12, dk ? 0.15 : 0.3)
    fig(1, dk ? 0.3 : 0.65)
    ctx.filter = 'none'
  },
})

/* ================================================================== TRANSITIONS */
const trReg = <P extends Params>(k: string, d: TransPartDef<P>) =>
  reg(
    'trans',
    k,
    Object.assign({}, d, {
      draw(
        ctx: CanvasRenderingContext2D,
        A: HTMLCanvasElement,
        B: HTMLCanvasElement,
        p: number,
        I: TransInfo,
      ) {
        ctx.save()
        try {
          if (!(p > 0)) ctx.drawImage(A, 0, 0)
          else if (p >= 1) ctx.drawImage(B, 0, 0)
          else d.draw(ctx, A, B, p, I, (I.P || {}) as unknown as P)
        } finally {
          ctx.restore()
        }
      },
    }) as unknown as TransDef,
  )

/* static cut: the old shot drowns in snow, the new one surfaces out of it */
trReg('hrStaticCut', {
  tags: TAGS.concat(['glitch']),
  w: 0.9,
  dur: 0.4,
  ae: 'pixelate',
  plan: (rng: Rng) => ({ roll: rng.chance(0.6) }),
  draw(ctx, A, B, p, I, Pm) {
    const { cw, ch } = I,
      st = I.step,
      src = p < 0.5 ? A : B
    const nz = p < 0.5 ? E.inQuad(p / 0.5) : 1 - E.outQuad((p - 0.5) / 0.5)
    const oy = Pm.roll ? Math.round(Math.sin(p * Math.PI) * ch * 0.08 * (p < 0.5 ? 1 : -1)) : 0
    ctx.drawImage(src, 0, oy)
    if (oy) ctx.drawImage(src, 0, oy > 0 ? oy - ch : oy + ch)
    const N = noiseCv(st),
      pat = ctx.createPattern(N, 'repeat')
    const sz = Math.max(1, Math.round(ch / 400))
    if (!pat) return
    try {
      pat.setTransform(
        new DOMMatrix([
          sz * 2,
          0,
          0,
          sz,
          -Math.floor(rnd(st, 1) * 128) * sz * 2,
          -Math.floor(rnd(st, 2) * 96) * sz,
        ]),
      )
    } catch {
      /* plain */
    }
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = Math.min(1, nz * 1.15)
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, cw, ch)
    ctx.globalAlpha = 0.5 * nz
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, rnd(st, 3) * ch, cw, ch * 0.12)
  },
})

/* blink: eyelids close on the old shot and open on the new one */
trReg('hrBlink', {
  tags: TAGS.concat(['emotional']),
  w: 0.8,
  dur: 0.45,
  ae: 'irisOpen',
  plan: (rng: Rng) => ({ half: rng.chance(0.3) }),
  draw(ctx, A, B, p, I, _Pm) {
    const { cw, ch } = I,
      src = p < 0.5 ? A : B
    const c = p < 0.5 ? E.inCubic(p / 0.5) : 1 - E.outCubic((p - 0.5) / 0.5)
    ctx.drawImage(src, 0, 0)
    if (c <= 0) return
    const h = (ch / 2) * c * 1.02,
      bow = ch * 0.18 * (1 - c * 0.6)
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(cw, 0)
    ctx.lineTo(cw, h - bow)
    ctx.quadraticCurveTo(cw / 2, h + bow, 0, h - bow)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, ch)
    ctx.lineTo(cw, ch)
    ctx.lineTo(cw, ch - h + bow)
    ctx.quadraticCurveTo(cw / 2, ch - h - bow, 0, ch - h + bow)
    ctx.closePath()
    ctx.fill()
    // a soft edge around the lids
    const g = ctx.createLinearGradient(0, 0, 0, ch)
    g.addColorStop(0, 'rgba(0,0,0,0.6)')
    g.addColorStop(0.5, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.globalAlpha = c
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cw, ch)
  },
})

export const pack: PackParts = out
