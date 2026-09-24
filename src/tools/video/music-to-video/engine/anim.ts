/**
 * 动效配方库：入场（enter）/ 保持（hold）/ 出场（exit）。
 *
 * 配方不画图，只改写传进来的 TextItem：整体属性走 it.size/sx/sy/alpha/blur/
 * track/clip/bands/streak，逐字走 it.charFns，笔画碎片走 it.pieceFns
 * （配合 pieces / shatter 标记，碎片本身由 glyphs + draw 生成）。
 * layouts 每帧先清空 charFns/pieceFns，再按 enter→hold→exit 依次调用，
 * 最后 combineChar / combinePiece 合并成单项函数。
 *
 * p 的语义：enter/exit 是 0..1 进度；hold 的 p 是振幅（出场时衰减过）。
 * 所有随机都来自 seed 的 hash，同一 seed 必然同一动画（可复现）。
 */
import type { AnimDef, CharFn, CharT, Env, PieceFn, PieceT, TextItem } from './types'
import { PIECE_IDLE } from './types'
import { DEG, E, TAU, bounce, clamp, lerp, r, rs, smooth } from './util'
import { measure } from './text-layout'

/** 乱码入场用的汉字/符号池（解码时随机抽取） */
const SCRAMBLE_POOL =
  '光影星雨梦碎虚妄时空缘念火冰风雷声泪心夜晨花★◆▲●■※＃＄％＆ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** 一条切片：[起点, 终点, 位移] */
type Band = readonly [number, number, number]
type BandFn = (i: number, n: number) => number

/** seed 由 planner 注入，装饰项可能缺省；|0 与 hash 内部的 int32 收敛一致 */
const seedOf = (it: TextItem): number => (it.seed ?? 0) | 0

/** 度量缓存：同一帧里多个配方共用一次 layoutText */
const measureOf = (it: TextItem) => it._m ?? (it._m = measure(it))

const pushChar = (it: TextItem, fn: CharFn): void => {
  ;(it.charFns ??= []).push(fn)
}
const pushPiece = (it: TextItem, fn: PieceFn): void => {
  ;(it.pieceFns ??= []).push(fn)
}

/** PieceT 构造器，缺省即"静止"（与 PIECE_IDLE 同形，但必须是可累加的新对象） */
const pt = (dx = 0, dy = 0, rot = 0, s = 1, st = 1, sdir = 0, a = 1): PieceT => ({
  dx,
  dy,
  rot,
  s,
  st,
  sdir,
  a,
})

/** 横向切片，覆盖项目的竖向范围；上下各留余量以免裁掉升部降部 */
export function itemBands(_env: Env, it: TextItem, n: number, dxFn: BandFn): Band[] {
  const m = measureOf(it)
  const h = Math.max(m.h, it.size) * 1.25 + 20
  const y0 = it.y - h / 2
  const cuts = [0]
  for (let i = 1; i < n; i++) cuts.push(r(seedOf(it), n, i, 3))
  cuts.push(1)
  cuts.sort((a, b) => a - b)
  const out: Band[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    out.push([y0 + cuts[i] * h, y0 + cuts[i + 1] * h, dxFn(i, cuts.length - 1)])
  }
  return out
}

/** 纵向切片，覆盖项目的横向范围：[[x0, x1, dy], ...] */
export function itemVBands(_env: Env, it: TextItem, n: number, dyFn: BandFn): Band[] {
  const m = measureOf(it)
  const w = Math.max(m.w, it.size) * 1.1 + 20
  const x0 = it.align === 'left' ? it.x - 10 : it.align === 'right' ? it.x - w + 10 : it.x - w / 2
  const out: Band[] = []
  for (let i = 0; i < n; i++) {
    out.push([x0 + (i * w) / n, x0 + ((i + 1) * w) / n + 0.5, dyFn(i, n)])
  }
  return out
}

/* ---------------- 入场 ---------------- */

export const ENTER: Record<string, AnimDef> = {
  /** 硬切：直接出现（无入场，layouts 会提前返回 false 省一次合成） */
  cut: {
    apply() {
      /* 不做处理 */
    },
  },

  /** 分解→集合：笔画碎片从四周汇聚成字 */
  assemble: {
    pieces: true,
    apply(env, it, _p, ctx) {
      const dur = ctx.inDur
      const lt = env.lt - (it.delay || 0)
      const spread = it.size * 3.2 * (0.6 + env.fx.motion * 0.7)
      const seed = seedOf(it)
      pushPiece(it, (ci, pj, _pc, _ox, _oy) => {
        const d = r(seed, ci, pj, 1) * dur * 0.45
        const x = (lt - d) / (dur * 0.62)
        if (x < 0) return null
        const e = E.outExpo(x)
        const k = 1 - e
        if (k <= 0.0005) return PIECE_IDLE
        const ang = r(seed, ci, pj, 2) * TAU
        const dist = spread * (0.35 + 0.65 * r(seed, ci, pj, 3))
        // 速度（用于碎片沿运动方向拉伸）：本帧与上一帧的位移差
        const sp = (e - E.outExpo(x - 1 / (env.fps * dur * 0.62))) * dist
        return pt(
          Math.cos(ang) * dist * k,
          Math.sin(ang) * dist * k,
          rs(seed, ci, pj, 4) * 190 * k,
          1 + (lerp(0.4, 2.1, r(seed, ci, pj, 5)) - 1) * k,
          1 + Math.min(2.0, sp * 0.02),
          ang / DEG,
          1,
        )
      })
    },
  },

  /** 横向切成 7 条，交错滑入 */
  slice: {
    apply(env, it, p) {
      const W = env.W
      it.bands = itemBands(
        env,
        it,
        7,
        (i) => (1 - E.outExpo(p * 1.2 - 0.05 * i)) * (i % 2 ? 1 : -1) * W * 0.9,
      )
    },
  },

  /** 打字机：逐字浮现 + 光标 */
  type: {
    cursor: true,
    apply(_env, it, p) {
      const n = measureOf(it).lay.N
      const k = Math.floor(p * (n + 0.999))
      pushChar(it, (i) => (i >= k ? { hide: true } : null))
      it.cursorAt = p < 1 ? k : -1
    },
  },

  /** 逐字弹出（回弹缩放 + 落位去旋） */
  pop: {
    apply(_env, it, p) {
      const seed = seedOf(it)
      pushChar(it, (i, _g, n) => {
        const d = n > 1 ? (i / (n - 1)) * 0.45 : 0
        const q = clamp((p - d) / 0.55)
        if (q <= 0) return { hide: true }
        return { s: E.outBack(q, 2.6), rot: (1 - E.outCubic(q)) * rs(seed, i, 9) * 28 }
      })
    },
  },

  /** 逐字落下并弹两下，落地前纵向压扁 */
  drop: {
    apply(_env, it, p) {
      const size = it.size
      const seed = seedOf(it)
      pushChar(it, (i, _g, n) => {
        const d = n > 1 ? r(seed, i, 4) * 0.5 : 0
        const q = clamp((p - d) / 0.5)
        if (q <= 0) return { hide: true }
        const b = bounce(q)
        return { dy: -(1 - b) * size * 2.4, sy: 1 + (1 - q) * 0.5, sx: 1 - (1 - q) * 0.2 }
      })
    },
  },

  /** 横向拉伸回弹，配速度残影 */
  stretch: {
    apply(_env, it, p) {
      const e = E.outExpo(p)
      it.sx = (it.sx || 1) * lerp(4.2, 1, e)
      it.streak = { n: 4, dx: it.size * 0.55 * (1 - e), a: 0.3 * (1 - e) }
    },
  },

  /** 擦除揭示：亮条扫过，条后留下文字 */
  wipe: {
    bar: true,
    apply(_env, it, p) {
      const e = E.inOutExpo(p)
      const m = measureOf(it)
      const x0 = it.x - m.w / 2 - it.size * 0.2
      const x1 = it.x + m.w / 2 + it.size * 0.2
      const dir = seedOf(it) % 2 ? 1 : -1
      const edge = dir > 0 ? lerp(x0, x1, e) : lerp(x1, x0, e)
      it.clip = dir > 0 ? [x0 - 4000, edge] : [edge, x1 + 4000]
      it.wipeBar = p < 1 ? { x: edge, h: m.h * 1.3 + it.size * 0.2 } : null
    },
  },

  /** 失焦聚实：模糊 + 透明度 + 字距一起收敛 */
  blur: {
    apply(_env, it, p) {
      const e = E.outCubic(p)
      it.blur = (it.blur || 0) + (1 - e) * 26
      it.alpha = (it.alpha ?? 1) * Math.pow(e, 0.7)
      it.size *= 1 + 0.18 * (1 - e)
      it.track = (it.track || 0) + (1 - e) * 0.5
    },
  },

  /** 逐字旋转飞入 */
  spin: {
    apply(_env, it, p) {
      const seed = seedOf(it)
      pushChar(it, (i, _g, n) => {
        const d = n > 1 ? (i / (n - 1)) * 0.4 : 0
        const q = clamp((p - d) / 0.6)
        if (q <= 0) return { hide: true }
        const e = E.outExpo(q)
        return {
          rot: (1 - e) * (r(seed, i) > 0.5 ? 1 : -1) * 200,
          s: lerp(0.15, 1, e),
          a: Math.min(1, q * 3),
        }
      })
    },
  },

  /** 逐字随机闪现（同一帧格内稳定，避免高频抖动） */
  flicker: {
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      pushChar(it, (i) => (p >= 1 ? null : r(seed, step, i) < p * 1.25 ? null : { hide: true }))
    },
  },

  /** 乱码解码：先滚中文/符号池，再按位置依次定字 */
  scramble: {
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      pushChar(it, (i, _g, n) => {
        const settle = 0.25 + 0.75 * (n > 1 ? i / (n - 1) : 1)
        if (p >= settle) return null
        if (p < settle * 0.25 && r(seed, i, step, 2) < 0.5) return { hide: true }
        const ch = SCRAMBLE_POOL[Math.floor(r(seed, i, step) * SCRAMBLE_POOL.length)]
        return { ch, a: 0.85 }
      })
    },
  },

  /** 放大压稳 */
  zoom: {
    apply(_env, it, p) {
      const e = E.outExpo(p)
      it.size *= lerp(1.7, 1, e)
      it.blur = (it.blur || 0) + (1 - e) * 14
      it.alpha = (it.alpha ?? 1) * Math.min(1, p * 4)
    },
  },
}
export const ENTER_ORDER = [
  'cut',
  'assemble',
  'slice',
  'type',
  'pop',
  'drop',
  'stretch',
  'wipe',
  'blur',
  'spin',
  'flicker',
  'scramble',
  'zoom',
]

/* ---------------- 保持（整段生效，振幅由 layouts 缓入缓出） ---------------- */

export const HOLD: Record<string, AnimDef> = {
  /** 静止 */
  still: {
    apply() {
      /* 不做处理 */
    },
  },

  /** 逐字微抖 + 微旋 */
  jitter: {
    apply(env, it, amt) {
      const seed = seedOf(it)
      const step = env.step
      const a = it.size * 0.025 * amt * env.fx.motion
      if (a < 0.2) return
      pushChar(it, (i) => ({
        dx: rs(seed, step, i, 1) * a,
        dy: rs(seed, step, i, 2) * a,
        rot: rs(seed, step, i, 3) * 4 * amt,
      }))
    },
  },

  /** 横向漂移 + 持续微放大 */
  drift: {
    apply(env, it, _amt, ctx) {
      const u = env.lt / Math.max(0.3, ctx.dur)
      const dir = seedOf(it) % 2 ? 1 : -1
      it.x += dir * (u - 0.5) * env.W * 0.035 * env.fx.motion
      it.size *= 1 + 0.05 * u * env.fx.motion
    },
  },

  /** 呼吸：字号与字距同频起伏 */
  breathe: {
    apply(env, it, amt) {
      it.size *= 1 + 0.035 * Math.sin(env.lt * TAU * 0.9) * amt
      it.track = (it.track || 0) + 0.03 * Math.sin(env.lt * TAU * 0.6) * amt
    },
  },

  /** 逐字正弦波 */
  wave: {
    apply(env, it, amt) {
      const size = it.size
      const t = env.lt
      pushChar(it, (i) => ({
        dy: Math.sin(t * 7 + i * 0.75) * size * 0.07 * amt,
        rot: Math.cos(t * 7 + i * 0.75) * 5 * amt,
      }))
    },
  },

  /** 故障脉冲：偶发一次横向错位切片 */
  glitchtick: {
    apply(env, it, amt) {
      const seed = seedOf(it)
      const step = env.step
      if (r(seed, step, 77) < 0.22 * env.fx.glitch * amt + 0.02) {
        it.bands = itemBands(env, it, 6, (i) =>
          r(seed, step, i, 5) < 0.6 ? rs(seed, step, i, 6) * it.size * 0.35 : 0,
        )
      }
    },
  },
}
export const HOLD_ORDER = ['still', 'jitter', 'drift', 'breathe', 'wave', 'glitchtick']

/* ---------------- 出场 ---------------- */

export const EXIT: Record<string, AnimDef> = {
  /** 硬切：直接消失 */
  cut: {
    apply() {
      /* 不做处理 */
    },
  },

  /** 爆散：碎片沿各自方向炸开，带速度拉伸 */
  explode: {
    pieces: true,
    shatter: true,
    apply(env, it, _p, ctx) {
      const seed = seedOf(it)
      const dur = ctx.outDur
      const lt = env.lt - (ctx.dur - ctx.outDur)
      const spread = Math.max(env.W, env.H) * 0.9 * (0.5 + env.fx.motion * 0.6)
      it.shatter = true
      pushPiece(it, (ci, pj, _pc, ox, oy) => {
        const d = r(seed, ci, pj, 11) * dur * 0.3
        const x = (lt - d) / (dur * 0.7)
        if (x <= 0) return PIECE_IDLE
        if (x >= 1) return null
        const e = E.inCubic(x)
        // 出散方向：碎片质心方向 + 抖动，避免整体像一次均匀缩放
        const ang = Math.atan2(oy + 0.01, ox + 0.01) + rs(seed, ci, pj, 12) * 1.1
        const dist = spread * (0.35 + 0.65 * r(seed, ci, pj, 13))
        const sp = (e - E.inCubic(x - 1 / (env.fps * dur * 0.7))) * dist
        return pt(
          Math.cos(ang) * dist * e,
          Math.sin(ang) * dist * e,
          rs(seed, ci, pj, 14) * 260 * e,
          1 + rs(seed, ci, pj, 15) * 0.6 * e,
          1 + Math.min(2.4, sp * 0.012),
          ang / DEG,
          1 - x * x * x,
        )
      })
    },
  },

  /** 崩落：碎片受重力下坠，落地前一刻整体微颤 */
  fall: {
    pieces: true,
    shatter: true,
    apply(env, it, _p, ctx) {
      const seed = seedOf(it)
      const lt = env.lt - (ctx.dur - ctx.outDur)
      const g = env.H * 5.5
      it.shatter = true
      pushChar(it, () => null)
      pushPiece(it, (ci, pj) => {
        const x = lt - r(seed, ci, pj, 21) * ctx.outDur * 0.4
        if (x <= 0)
          return lt > -0.25 ? pt(rs(seed, env.step, ci, pj) * it.size * 0.012, 0) : PIECE_IDLE
        const v = g * x
        return pt(
          rs(seed, ci, pj, 22) * env.W * 0.03 * x,
          0.5 * g * x * x,
          rs(seed, ci, pj, 23) * 200 * x,
          1,
          1 + Math.min(2.2, v * 0.0012),
          90,
          1,
        )
      })
    },
  },

  /** 雾散：碎片上浮、放大、变淡 */
  drift: {
    pieces: true,
    shatter: true,
    apply(env, it, _p, ctx) {
      const seed = seedOf(it)
      const dur = ctx.outDur
      const lt = env.lt - (ctx.dur - ctx.outDur)
      const dist0 = it.size * 1.6
      it.shatter = true
      pushPiece(it, (ci, pj) => {
        const x = (lt - r(seed, ci, pj, 31) * dur * 0.3) / (dur * 0.7)
        if (x <= 0) return PIECE_IDLE
        if (x >= 1) return null
        const e = E.inQuad(x)
        const ang = r(seed, ci, pj, 32) * TAU
        const dd = dist0 * (0.3 + 0.7 * r(seed, ci, pj, 33))
        return pt(
          Math.cos(ang) * dd * e,
          Math.sin(ang) * dd * e - it.size * 0.3 * e,
          rs(seed, ci, pj, 34) * 80 * e,
          1 - 0.35 * e,
          1 + e * 0.8,
          ang / DEG,
          1 - e * e,
        )
      })
    },
  },

  /** 横向切片被甩出画面 */
  slice: {
    apply(env, it, p) {
      const e = E.inExpo(p)
      it.bands = itemBands(
        env,
        it,
        7,
        (i) => e * (i % 2 ? -1 : 1) * env.W * 1.1 * (0.6 + 0.4 * r(seedOf(it), i, 41)),
      )
    },
  },

  /** 擦除收尾：亮条扫过把字带走 */
  wipe: {
    bar: true,
    apply(_env, it, p) {
      const e = E.inOutExpo(p)
      const m = measureOf(it)
      const x0 = it.x - m.w / 2 - it.size * 0.2
      const x1 = it.x + m.w / 2 + it.size * 0.2
      const edge = lerp(x0, x1, e)
      it.clip = [edge, x1 + 4000]
      it.wipeBar = p > 0 && p < 1 ? { x: edge, h: m.h * 1.3 + it.size * 0.2 } : null
    },
  },

  /** 收缩至无形 */
  shrink: {
    apply(_env, it, p) {
      const e = E.inCubic(p)
      it.size *= 1 - e * 0.96
      it.alpha = (it.alpha ?? 1) * (1 - e * e)
      it.track = (it.track || 0) - e * 0.2
    },
  },

  /** 虚化淡出 */
  blur: {
    apply(_env, it, p) {
      const e = E.inQuad(p)
      it.blur = (it.blur || 0) + e * 30
      it.alpha = (it.alpha ?? 1) * (1 - e)
      it.size *= 1 + e * 0.2
    },
  },

  /** 横向抽走：拉成一条线后消失 */
  stretch: {
    apply(_env, it, p) {
      const e = E.inExpo(p)
      it.sx = (it.sx || 1) * lerp(1, 6, e)
      it.sy = (it.sy || 1) * lerp(1, 0.6, e)
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.7, 1, p))
      it.streak = { n: 3, dx: -it.size * 0.8 * e, a: 0.25 * e }
    },
  },

  /** 逐字飞散 */
  scatter: {
    apply(env, it, p) {
      const seed = seedOf(it)
      const W = env.W
      pushChar(it, (i) => {
        const d = r(seed, i, 51) * 0.35
        const q = clamp((p - d) / 0.65)
        if (q <= 0) return null
        const e = E.inCubic(q)
        const ang = r(seed, i, 52) * TAU
        return {
          dx: Math.cos(ang) * W * 0.7 * e,
          dy: Math.sin(ang) * W * 0.45 * e,
          rot: rs(seed, i, 53) * 540 * e,
          s: 1 + e * 0.8,
          a: 1 - q * q,
        }
      })
    },
  },

  /** 故障退场：切片错位越来越猛，尾段整项闪烁 */
  glitch: {
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      const amp = it.size * (0.3 + p * 2.2)
      it.bands = itemBands(env, it, 9, (i) =>
        r(seed, step, i, 61) < 0.75 ? rs(seed, step, i, 62) * amp : 0,
      )
      if (p > 0.55) {
        it.alpha = (it.alpha ?? 1) * (r(seed, step, 63) < 0.5 ? 0.15 : 1) * (1 - smooth(0.8, 1, p))
      }
    },
  },
}
export const EXIT_ORDER = [
  'cut',
  'explode',
  'fall',
  'drift',
  'slice',
  'wipe',
  'shrink',
  'blur',
  'stretch',
  'scatter',
  'glitch',
]

/* ---------------- 合并逐字 / 碎片函数 ---------------- */

/** 位移与角度相加、缩放与透明度相乘；hide 优先短路 */
export function combineChar(fns: CharFn[]): CharFn | null {
  if (!fns.length) return null
  if (fns.length === 1) return fns[0]
  return (i, g, n) => {
    let o: CharT | null = null
    for (const f of fns) {
      const t = f(i, g, n)
      if (!t) continue
      if (t.hide) return t
      if (!o) o = { dx: 0, dy: 0, rot: 0, s: 1, a: 1 }
      o.dx = (o.dx || 0) + (t.dx || 0)
      o.dy = (o.dy || 0) + (t.dy || 0)
      o.rot = (o.rot || 0) + (t.rot || 0)
      if (t.s != null) o.s = (o.s ?? 1) * t.s
      if (t.a != null) o.a = (o.a ?? 1) * t.a
      if (t.sx) o.sx = (o.sx || 1) * t.sx
      if (t.sy) o.sy = (o.sy || 1) * t.sy
      if (t.ch) o.ch = t.ch
      if (t.color) o.color = t.color
      if (t.skew) o.skew = (o.skew || 0) + t.skew
      if (t.blur) o.blur = (o.blur || 0) + t.blur
      if (t.outline) o.outline = true
      if (t.clipX)
        o.clipX = o.clipX
          ? [Math.max(o.clipX[0], t.clipX[0]), Math.min(o.clipX[1], t.clipX[1])]
          : t.clipX
      if (t.clipY)
        o.clipY = o.clipY
          ? [Math.max(o.clipY[0], t.clipY[0]), Math.min(o.clipY[1], t.clipY[1])]
          : t.clipY
    }
    return o
  }
}

/** 碎片变换同样叠加；任一函数返回 null 表示该碎片此帧不画 */
export function combinePiece(fns: PieceFn[]): PieceFn | null {
  if (!fns.length) return null
  if (fns.length === 1) return fns[0]
  return (ci, pj, pc, ox, oy, g) => {
    let o: PieceT | null = null
    for (const f of fns) {
      const t = f(ci, pj, pc, ox, oy, g)
      if (t === null || t === undefined) return null
      if (t === PIECE_IDLE) continue
      if (!o) o = pt()
      o.dx += t.dx
      o.dy += t.dy
      o.rot += t.rot
      o.s *= t.s
      o.a *= t.a
      // 拉伸取最强的一条，方向跟随它
      if (t.st > o.st) {
        o.st = t.st
        o.sdir = t.sdir
      }
    }
    return o ?? PIECE_IDLE
  }
}
