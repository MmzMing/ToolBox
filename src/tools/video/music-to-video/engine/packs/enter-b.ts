/**
 * 部件包 enterB：47 个入场动效（物理、纸、光、数码设备、图形遮罩）。
 *
 * 逐条移植自 JIZURA 的 src/11p_enterB.js（MIT）：数值常量、缓动曲线、hash 种子、
 * 坐标、时长一律照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由
 * registry 锁定，不要改名、不要增删。
 *
 * 本包自带的机制（核心只提供了一半，故在包内补齐）：
 * - 旧 `J.PT` / `J.PID` → 本文件的 `pt()` 工厂 + 核心导出的 `PIECE_IDLE`；
 * - 局部坐标：`box()` 取文字项自身的盒（原点在 it.x/it.y、未旋转），`toLocal()` 把
 *   ctx 搬进这个空间，`clipLocal / preLocal / postLocal` 都在其中作画——于是贴纸、
 *   撕裂、翻牌这类"绕着字自己的几何"的配方不必关心版式把字放在哪儿；
 * - `copyDraw()` 画同一文字项的另一份副本（多遍合成的配方用它复用同一套排版），
 *   `STRIP` 负责剥掉副本上会重复起效的钩子与逐帧状态。
 *
 * 中文适配（详见移植契约）：旧包给假名滚动用的字符池 `SIGNS` 换成汉字 + 全角符号池
 * （翻牌 / 码表 / 数据雨三类共用），几何与节奏不变；本包不含 `J.romaji` 的副读行。
 */
import type {
  AnimDef,
  BBox,
  CharFn,
  CharT,
  Cut,
  Env,
  LaidGlyph,
  LaidText,
  PackParts,
  PieceFn,
  PieceT,
  TextItem,
} from '../types'
import { PIECE_IDLE } from '../types'
import { combineChar } from '../anim'
import { drawItem } from '../draw'
import { layoutText, measure } from '../text-layout'
import { DEG, E, TAU, clamp, hash, lerp, lum, mix, r, rgba, rs, smooth } from '../util'

/* ---------------------------------------------------------------- 基础类型 */

type Pt = readonly [number, number]
type Poly = readonly Pt[]

/** 版式只在画 cut 时被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

/** 文字项自身盒（item-local 空间：原点在 it.x/it.y，未旋转） */
type ItemBox = {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  h: number
  cx: number
  cy: number
  lay: LaidText
}

/** 设计空间 AABB（旋转感知） */
type Drange = { x0: number; x1: number; y0: number; y1: number }

/* ---------------------------------------------------------------- 缓动 */

const PI = Math.PI
const oCubic = (x: number): number => 1 - Math.pow(1 - clamp(x), 3)
const oQuart = (x: number): number => 1 - Math.pow(1 - clamp(x), 4)
const oQuint = (x: number): number => 1 - Math.pow(1 - clamp(x), 5)
const ioCubic = (x: number): number => {
  const v = clamp(x)
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2
}
const ioQuart = (x: number): number => {
  const v = clamp(x)
  return v < 0.5 ? 8 * v * v * v * v : 1 - Math.pow(-2 * v + 2, 4) / 2
}
const oBack = (x: number, s: number): number => E.outBack(clamp(x), s)
const sstep = (a: number, b: number, x: number): number => smooth(a, b, x)
/** 阻尼弹簧：t=0 时为 1，t=1 时精确归 0（中途会冲过 0） */
const spring = (t: number, k: number, f: number): number => {
  const v = clamp(t)
  return Math.exp(-k * v) * Math.cos(f * PI * v) * (1 - v * v * v)
}

/* ---------------------------------------------------------------- 错拍 */

const stg = (p: number, k: number, spread: number): number => clamp((p - spread * k) / (1 - spread))
const ordLR = (i: number, n: number): number => (n > 1 ? i / (n - 1) : 0)
const ordRL = (i: number, n: number): number => (n > 1 ? 1 - i / (n - 1) : 0)

/* ---------------------------------------------------------------- 颜色 / 文字 */

const isHex = (c: unknown): c is string =>
  typeof c === 'string' && c[0] === '#' && (c.length === 7 || c.length === 4)
const colOf = (it: TextItem): string => (isHex(it.color) ? it.color : '#ffffff')
/** 取第一个合法色值（旧代码里 sc.xxx 可能缺省） */
const pick = (...cs: unknown[]): string => cs.find(isHex) || '#ffffff'
const dirOf = (env: Env, salt: number): number => (r(cutOf(env).seed | 0, salt, 5) < 0.5 ? -1 : 1)
/** 文字项自己的 seed（planner 注入，装饰项可能缺省）；|0 与 hash 内的 int32 收敛一致 */
const seedOf = (it: TextItem): number => (it.seed ?? 0) | 0
const glyphN = (it: TextItem): number => [...String(it.text || '').replace(/\s/g, '')].length
/** 高光色：暗底用纯白，亮底用强调色 */
const hotOf = (env: Env): string => {
  const bg = pick(env.sc.bg)
  return lum(bg) < 0.5 ? '#ffffff' : pick(env.sc.accent, env.sc.fg)
}
const isBlank = (ch: string): boolean => ch === ' ' || ch === '　'
/** 歌词本体（不是淡色 / 描边副本，也不是多文字项版式里的某一项）：附属图形只画给它 */
const isPrimary = (it: TextItem): boolean =>
  (it.alpha ?? 1) >= 0.85 && it.fill !== false && glyphN(it) > 1
const isMain = (it: TextItem): boolean => (it.alpha ?? 1) >= 0.85 && it.fill !== false

/** 假名滚动池 → 汉字 + 全角符号池（翻牌 / 码表 / 数据雨共用） */
const SIGNS =
  '一二三四五六七八九十百千万时空光影梦境心声风雨夜火光年月日前后内外上下中大小多少东西来去生灭＃＊＋＝／＜＞※◇◆□△○01'

/* ---------------------------------------------------------------- 钩子与逐字函数 */

function addPre(it: TextItem, fn: (env: Env, x: TextItem) => void): void {
  const prev = it.pre
  it.pre = prev ? (env, x) => void (prev(env, x), fn(env, x)) : fn
}
function addPost(it: TextItem, fn: (env: Env, x: TextItem, bb: BBox | null) => void): void {
  const prev = it.post
  it.post = prev
    ? (env, x, bb) => void (prev(env, x, bb), fn(env, x, bb))
    : (env, x, bb) => void fn(env, x, bb)
}
function glyphs(it: TextItem, fn: CharFn): CharFn {
  ;(it.charFns ??= []).push(fn)
  return fn
}
function pushPiece(it: TextItem, fn: PieceFn): void {
  ;(it.pieceFns ??= []).push(fn)
}

/** PieceT 构造器（旧 J.PT）；缺省即"静止" */
const pt = (dx = 0, dy = 0, rot = 0, s = 1, st = 1, sdir = 0, a = 1): PieceT => ({
  dx,
  dy,
  rot,
  s,
  st,
  sdir,
  a,
})

/** 隐藏整字（多处共用同一个冻结对象） */
const HIDE: CharT = Object.freeze({ hide: true })

/** 副本上要清掉的钩子与逐帧状态，否则它们会连着重画一遍 */
const STRIP: Partial<
  Pick<
    TextItem,
    | 'pieceFn'
    | 'streak'
    | 'echo'
    | 'pre'
    | 'post'
    | 'clipFn'
    | 'bands'
    | 'vbands'
    | 'wipeBar'
    | 'cursorAt'
  >
> = {
  pieceFn: null,
  streak: null,
  echo: null,
  pre: undefined,
  post: undefined,
  clipFn: undefined,
  bands: null,
  vbands: null,
  wipeBar: null,
  cursorAt: undefined,
}

/** 画一份额外副本（所有 pass 都画）；`fn` 取代 `main` 成为逐字函数 */
function copyDraw(
  env: Env,
  x: TextItem,
  main: CharFn | null,
  fn: CharFn | null,
  extra?: Partial<TextItem>,
): BBox | null {
  const others = (x.charFns ?? []).filter((f) => f !== main)
  const c: TextItem = {
    ...x,
    ...STRIP,
    charFn: fn ? combineChar([...others, fn]) : others.length ? combineChar(others) : null,
    ...extra,
  }
  return drawItem(env, c)
}

/* ---------------------------------------------------------------- 几何 */

function box(it: TextItem): ItemBox {
  const m = measure(it)
  const x0 = it.vertical
    ? -m.w / 2
    : it.align === 'left'
      ? 0
      : it.align === 'right'
        ? -m.w
        : -m.w / 2
  const y0 = it.vertical && it.align === 'left' ? 0 : -m.h / 2
  return {
    x0,
    y0,
    x1: x0 + m.w,
    y1: y0 + m.h,
    w: m.w,
    h: m.h,
    cx: x0 + m.w / 2,
    cy: y0 + m.h / 2,
    lay: m.lay,
  }
}

/** 把 ctx 搬进文字项自己的局部空间 */
function toLocal(ctx: CanvasRenderingContext2D, it: TextItem): void {
  ctx.translate(it.x, it.y)
  if (it.rot) ctx.rotate(it.rot * DEG)
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0)
}

function clipLocal(
  it: TextItem,
  fn: (ctx: CanvasRenderingContext2D, b: ItemBox, x: TextItem, env: Env) => void,
): void {
  it.clipFn = (ctx, env, x) => {
    const b = box(x)
    ctx.save()
    toLocal(ctx, x)
    fn(ctx, b, x, env)
    ctx.restore()
  }
}

function postLocal(it: TextItem, fn: (env: Env, b: ItemBox, x: TextItem, A: number) => void): void {
  addPost(it, (env, x) => {
    const A = clamp(x.alpha ?? 1)
    if (A <= 0.01) return
    const b = box(x)
    const ctx = env.ctx
    ctx.save()
    toLocal(ctx, x)
    try {
      fn(env, b, x, A)
    } finally {
      ctx.restore()
      ctx.globalAlpha = 1
    }
  })
}

function preLocal(it: TextItem, fn: (env: Env, b: ItemBox, x: TextItem, A: number) => void): void {
  addPre(it, (env, x) => {
    const A = clamp(x.alpha ?? 1)
    if (A <= 0.01) return
    const b = box(x)
    const ctx = env.ctx
    ctx.save()
    toLocal(ctx, x)
    try {
      fn(env, b, x, A)
    } finally {
      ctx.restore()
      ctx.globalAlpha = 1
    }
  })
}

/** 按文字项局部（已旋转）坐标系里的向量搬动它 */
function moveLocal(it: TextItem, dx: number, dy: number): void {
  const th = (it.rot || 0) * DEG
  const c = Math.cos(th)
  const sn = Math.sin(th)
  it.x += c * dx - sn * dy
  it.y += sn * dx + c * dy
}

/** 绕自身盒中心做 x / y 非等比缩放 */
function scaleXY(it: TextItem, kx: number, ky: number, bb?: ItemBox): void {
  const b = bb || box(it)
  it.sx = (it.sx || 1) * kx
  it.sy = (it.sy || 1) * ky
  it._m = undefined
  it._lay = undefined
  moveLocal(it, -b.cx * (kx - 1), -b.cy * (ky - 1))
}

/** 绕自身盒中心等比缩放 */
function scaleAbout(it: TextItem, k: number, bb?: ItemBox): void {
  if (k === 1) return
  const b = bb || box(it)
  it.size *= k
  it._m = undefined
  it._lay = undefined
  moveLocal(it, -b.cx * (k - 1), -b.cy * (k - 1))
}

/** 字形中心（含标点位移与 sx/sy） */
const glyphPos = (g: LaidGlyph, isx: number, isy: number): Pt => [
  (g.x + g.vx) * isx,
  (g.y + g.vy) * isy,
]

/** 局部坐标下的逐行范围：u = 阅读轴，v = 行在垂直方向上的中心 */
type LineSpan = {
  li: number
  u0: number
  u1: number
  v: number
  n: number
  first: number
  last: number
}

function lines(it: TextItem, b: ItemBox): LineSpan[] {
  const vert = !!it.vertical
  const isx = it.sx || 1
  const isy = it.sy || 1
  const map = new Map<number, LineSpan>()
  for (const g of b.lay) {
    if (isBlank(g.ch)) continue
    const [gx, gy] = glyphPos(g, isx, isy)
    const hu = (vert ? g.h * isy : g.w * isx) / 2
    const u = vert ? gy : gx
    const v = vert ? g.x * isx : g.y * isy
    let L = map.get(g.li)
    if (!L) {
      L = { li: g.li, u0: 1e9, u1: -1e9, v, n: 0, first: g.i, last: g.i }
      map.set(g.li, L)
    }
    L.u0 = Math.min(L.u0, u - hu)
    L.u1 = Math.max(L.u1, u + hu)
    L.n++
    L.last = g.i
  }
  return [...map.values()]
}

/** 局部坐标：(阅读轴 u, 垂直轴 v) → (x, y) */
const ptOf = (vert: boolean, u: number, v: number): Pt => (vert ? [v, u] : [u, v])

/** 有序抖动阈值（Bayer 4×4） */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Sutherland–Hodgman：保留多边形中 f(v) >= 0 的那一半（f 为线性） */
function clipHalf(poly: Poly, f: (v: Pt) => number): Pt[] {
  const out: Pt[] = []
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]
    const b = poly[(k + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** 局部盒在设计空间里的 AABB（旋转感知） */
function dRange(it: TextItem, b: ItemBox): Drange
function dRange(it: TextItem, b: { x0: number; y0: number; x1: number; y1: number }): Drange
function dRange(it: TextItem, b: { x0: number; y0: number; x1: number; y1: number }): Drange {
  const th = (it.rot || 0) * DEG
  const c = Math.cos(th)
  const sn = Math.sin(th)
  let x0 = 1e9
  let x1 = -1e9
  let y0 = 1e9
  let y1 = -1e9
  const corners: Poly = [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x0, b.y1],
    [b.x1, b.y1],
  ]
  for (const [u, v] of corners) {
    const X = it.x + c * u - sn * v
    const Y = it.y + sn * u + c * v
    x0 = Math.min(x0, X)
    x1 = Math.max(x1, X)
    y0 = Math.min(y0, Y)
    y1 = Math.max(y1, Y)
  }
  return { x0, x1, y0, y1 }
}

/* ================================================================ 部件定义 */

const DEFS: Record<string, AnimDef> = {
  /* ------------------------- 物理 ------------------------- */

  /** 弹簧：每个字从下方被弹射出来，冲过基线再荡回来落定 */
  springIn: {
    w: 0.9,
    tags: ['pop'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const D = size * 1.7
      glyphs(it, (i, _g, n) => {
        const q = stg(p, ordLR(i, n), 0.45)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const f = spring(q, 4.2, 3)
        const v = (spring(q + 0.01, 4.2, 3) - f) / 0.01
        const st = 1 + Math.min(0.5, Math.abs(v) * 0.075)
        const cp = 1 / Math.sqrt(st)
        return vert
          ? { dx: -f * D, sx: st, sy: cp, a: clamp(q * 6) }
          : { dy: f * D, sy: st, sx: cp, a: clamp(q * 6) }
      })
    },
  },

  /**  Pendulum：每个字吊在上方的一根绳上，像挂牌一样摆进位置 */
  pendulum: {
    w: 0.9,
    tags: ['pop', 'emotional', 'calm'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.5, 0.22, 0.9),
    apply(env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const dir = dirOf(env, 41)
      const size = it.size
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.45)
      const ang = (q: number) => dir * 62 * spring(q, 3.1, 2.4)
      const len = (g: LaidGlyph) => g.h * isy * 0.5 + size * 0.45
      glyphs(it, (i, g, n) => {
        const q = qf(i, n)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const th = ang(q)
        const rr = th * DEG
        const L = len(g)
        return { dx: -L * Math.sin(rr), dy: L * Math.cos(rr) - L, rot: th, a: clamp(q * 5) }
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const lw = Math.max(1.2, size * 0.012)
        const n = b.lay.N
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const q = qf(g.i, n)
          if (q <= 0 || q >= 1) continue
          const a = A * (1 - sstep(0.45, 0.9, q)) * clamp(q * 5)
          if (a <= 0.01) continue
          const [gx, gy] = glyphPos(g, isx, isy)
          const L = len(g)
          const rr = ang(q) * DEG
          const px = gx
          const py = gy - L
          const tx = px - Math.sin(rr) * (L - g.h * isy * 0.5)
          const ty = py + Math.cos(rr) * (L - g.h * isy * 0.5)
          env2.line(
            [
              [px, py],
              [tx, ty],
            ],
            env2.sc.sub,
            lw,
            a * 0.8,
            false,
          )
          env2.circle(px, py, Math.max(2, size * 0.035), env2.sc.accent, null, 1, a, false)
        }
      })
    },
  },

  /** 滚动：每个字像轮子一样沿线滚进来（转角与走过的距离耦合） */
  rollIn: {
    w: 0.9,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const dir = dirOf(env, 43)
      const D = size * 2.3 * (0.75 + 0.4 * env.fx.motion)
      glyphs(it, (i, g, n) => {
        // 排在最前面的字先动，轮子之间才不会互相碾过
        const q = stg(p, dir < 0 ? ordRL(i, n) : ordLR(i, n), 0.22)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const off = dir * D * (1 - oBack(q, 1.25))
        const rr = Math.max(4, Math.min(g.w * isx, g.h * isy) * 0.5)
        const rot = -off / rr / DEG
        const k = lerp(0.72, 1, oCubic(q))
        return vert
          ? { dy: off, rot: -rot, s: k, a: clamp(q * 5) }
          : { dx: off, rot, s: k, a: clamp(q * 5) }
      })
    },
  },

  /** 弹弓：整行被两根皮筋往后拉住，松手后冲过头再稳定 */
  slingshot: {
    w: 0.7,
    tags: ['pop', 'graphic'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const b = box(it)
      const size = it.size
      const tA = 0.36
      const pull = size * 0.7 + (vert ? b.w : b.h) * 0.35
      let f: number
      let along: number
      let across: number
      let a = 1
      let band = 1
      if (p < tA) {
        const t = p / tA
        f = lerp(0.2, 1, E.outCubic(t))
        a = clamp(t * 3)
        along = 1 - 0.14 * E.outCubic(t)
        across = 1 + 0.07 * E.outCubic(t)
      } else {
        const t = (p - tA) / (1 - tA)
        const v = (spring(t + 0.01, 4.6, 2.6) - spring(t, 4.6, 2.6)) / 0.01
        f = spring(t, 4.6, 2.6)
        along = 1 + Math.min(0.4, Math.abs(v) * 0.05)
        across = 1 / Math.sqrt(along)
        band = 1 - sstep(0.03, 0.2, t)
        if (t > 0.9 && Math.abs(f) < 0.002) return
      }
      const R0 = dRange(it, b)
      const prim = isPrimary(it)
      if (vert) scaleXY(it, along, across, b)
      else scaleXY(it, across, along, b)
      if (vert) it.x += f * pull
      else it.y += f * pull
      it.alpha = (it.alpha ?? 1) * a
      if (band <= 0.01 || !prim) return
      addPost(it, (env2, x) => {
        const R = dRange(x, box(x))
        const m = size * 0.35
        const lw = Math.max(1.5, size * 0.03)
        const col = env2.sc.accent
        const A = band * clamp(x.alpha ?? 1)
        const posts: Pt[] = vert
          ? [
              [(R0.x0 + R0.x1) / 2, R0.y0 - m],
              [(R0.x0 + R0.x1) / 2, R0.y1 + m],
            ]
          : [
              [R0.x0 - m, (R0.y0 + R0.y1) / 2],
              [R0.x1 + m, (R0.y0 + R0.y1) / 2],
            ]
        const ends: Pt[] = vert
          ? [
              [R.x1, R.y0 + (R.y1 - R.y0) * 0.15],
              [R.x1, R.y1 - (R.y1 - R.y0) * 0.15],
            ]
          : [
              [R.x0 + (R.x1 - R.x0) * 0.12, R.y1],
              [R.x1 - (R.x1 - R.x0) * 0.12, R.y1],
            ]
        for (let k = 0; k < 2; k++) {
          env2.line([posts[k], ends[k]], col, lw, A, false)
          env2.circle(posts[k][0], posts[k][1], lw * 1.6, col, null, 1, A, false)
        }
      })
    },
  },

  /** 摇晃落地：字歪着掉下来，用一角着地，左右晃几下才放平 */
  rockSettle: {
    w: 0.8,
    tags: ['pop'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.22, 0.9),
    apply(_env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const seed = seedOf(it)
      const tL = 0.3
      glyphs(it, (i, g, n) => {
        const q = stg(p, ordLR(i, n), 0.4)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const hw = (g.w * isx) / 2
        const hh = (g.h * isy) / 2
        const th0 = (r(seed, i, 45) < 0.5 ? -1 : 1) * (16 + 10 * r(seed, i, 46))
        let th: number
        let dy = 0
        if (q < tL) {
          const t = q / tL
          th = th0
          dy = -(1 - t * t) * hh * 4
        } else {
          const t = (q - tL) / (1 - tL)
          th = th0 * Math.pow(1 - t, 1.5) * Math.cos(PI * (1.4 * t + 1.9 * t * t))
        }
        const rr = th * DEG
        const c = Math.cos(rr)
        const sn = Math.sin(rr)
        const cx = th >= 0 ? hw : -hw
        const cy = hh
        return {
          dx: cx - (cx * c - cy * sn),
          dy: dy + cy - (cx * sn + cy * c),
          rot: th,
          a: clamp(q * 8),
        }
      })
    },
  },

  /** 弹跳球：一颗强调色小球逐字跳过去，每次落地把那个字踢进位置 */
  bounceBall: {
    w: 0.8,
    tags: ['pop', 'emotional'],
    minDur: 0.8,
    maxChars: 20,
    inDur: (dur, n) => clamp(0.3 + n * 0.06, 0.45, Math.max(0.45, Math.min(1.25, dur * 0.6))),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const lay = layoutText(it)
      const gl = lay.filter((g) => !isBlank(g.ch))
      const n = gl.length
      if (!n) return
      const hit = (k: number) => (n > 1 ? lerp(0.16, 0.76, k / (n - 1)) : 0.45)
      const hitOf = new Map(gl.map((g, k) => [g.i, hit(k)]))
      glyphs(it, (i, g) => {
        const h = hitOf.get(i)
        if (h == null) return null
        if (p < h) return HIDE
        const u = (p - h) / 0.2
        if (u >= 1) return null
        const sq = lerp(0.55, 1, oBack(u, 2.4))
        const gs = vert ? g.w * isx : g.h * isy
        return vert
          ? { sx: sq, sy: 1 + 0.3 * (1 - oQuint(u)), dx: ((1 - sq) * gs) / 2 }
          : { sy: sq, sx: 1 + 0.3 * (1 - oQuint(u)), dy: ((1 - sq) * gs) / 2 }
      })
      const R = Math.max(3, size * 0.13)
      const solo = n === 1
      // 每个字的接触点（横排是上沿，竖排是右沿）与"上"方向
      const contact = (g: LaidGlyph): Pt => {
        const [gx, gy] = glyphPos(g, isx, isy)
        return vert ? [gx + g.w * isx * 0.5 + R, gy] : [gx, gy - g.h * isy * 0.5 - R]
      }
      const up: Pt = vert ? [1, 0] : [0, -1]
      const fw: Pt = vert ? [0, 1] : [1, 0]
      const HH = size * 0.6
      let P0: Pt
      let P1: Pt
      let s: number
      let alpha = 1
      const c0 = contact(gl[0])
      const cl = contact(gl[n - 1])
      if (p < hit(0)) {
        const back = solo ? 0 : 1.3
        const t0 = solo ? hit(0) * 0.2 : 0
        P0 = solo
          ? c0
          : [
              c0[0] - fw[0] * size * back + up[0] * size * 0.5,
              c0[1] - fw[1] * size * back + up[1] * size * 0.5,
            ]
        P1 = c0
        s = (p - t0) / (hit(0) - t0)
        alpha = clamp(s * 6)
        if (s <= 0) return
      } else if (p >= hit(n - 1)) {
        P0 = cl
        P1 = [
          cl[0] + fw[0] * size * 1.4 - up[0] * size * 0.2,
          cl[1] + fw[1] * size * 1.4 - up[1] * size * 0.2,
        ]
        s = (p - hit(n - 1)) / 0.2
        alpha = 1 - sstep(0.4, 1, s)
      } else {
        let k = 1
        while (k < n - 1 && p >= hit(k)) k++
        P0 = contact(gl[k - 1])
        P1 = contact(gl[k])
        s = (p - hit(k - 1)) / (hit(k) - hit(k - 1))
      }
      if (alpha <= 0.01 || s > 1 || !isMain(it)) return
      const arc = solo && p < hit(0) ? size * 0.85 * (1 - s * s) : 4 * HH * s * (1 - s)
      const bx = lerp(P0[0], P1[0], s) + up[0] * arc
      const by = lerp(P0[1], P1[1], s) + up[1] * arc
      postLocal(it, (env2, _b, _x, A) =>
        env2.circle(bx, by, R, env2.sc.accent, null, 1, A * alpha, false),
      )
    },
  },

  /** 卡入对齐：字先停在高低不齐的位置，一根强调色导轨画过来后全部卡上 */
  snapRail: {
    w: 0.9,
    tags: ['graphic', 'pop', 'editorial'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const seed = seedOf(it)
      glyphs(it, (i, _g) => {
        const d = r(seed, i, 53) * 0.2
        const a = clamp((p - d) / 0.2)
        if (a <= 0) return HIDE
        const ts = 0.46 + r(seed, i, 54) * 0.06
        const sgn = r(seed, i, 51) < 0.5 ? -1 : 1
        const off0 = sgn * size * (0.3 + 0.6 * r(seed, i, 52))
        const rot0 = rs(seed, i, 55) * 16
        let off: number
        let rot: number
        let sq = 1
        if (p < ts) {
          const k = 1 - 0.14 * (p / ts)
          off = off0 * k
          rot = rot0 * k
        } else {
          const t = (p - ts) / 0.13
          if (t < 1) {
            const e = E.inCubic(t)
            off = off0 * 0.86 * (1 - e)
            rot = rot0 * 0.86 * (1 - e)
          } else {
            const u = clamp((t - 1) / 1.6)
            if (u >= 1) return null
            off = -sgn * size * 0.06 * Math.sin(PI * u) * (1 - u)
            rot = 0
            sq = 1 - 0.16 * Math.sin(PI * clamp(u * 2)) * (1 - u)
          }
        }
        const o: CharT = { a, rot }
        if (vert) {
          o.dx = off
          o.sx = sq
          o.sy = 1 / Math.sqrt(sq)
        } else {
          o.dy = off
          o.sy = sq
          o.sx = 1 / Math.sqrt(sq)
        }
        return o
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, b, x, A) => {
        const grow = oQuart(p / 0.4)
        const flash = Math.exp(-Math.pow((p - 0.6) / 0.05, 2))
        const gone = sstep(0.68, 0.95, p)
        if (grow <= 0 || gone >= 1) return
        const t = Math.max(2, size * 0.028) * (1 + flash * 1.2)
        const isx = x.sx || 1
        const isy = x.sy || 1
        for (const L of lines(x, b)) {
          const half = (L.u1 - L.u0) / 2 + size * 0.15
          const c = (L.u0 + L.u1) / 2
          const len = half * grow * (1 - gone)
          const v = L.v + (vert ? -1 : 1) * size * 0.62 * (vert ? isx : isy)
          if (vert) env2.rect(v - t / 2, c - len, t, len * 2, env2.sc.accent, A, false)
          else env2.rect(c - len, v - t / 2, len * 2, t, env2.sc.accent, A, false)
        }
      })
    },
  },

  /** 扇开：字先叠成一束（合拢的折扇的扇骨），再绕一个枢轴 sweep 开 */
  fanOpen: {
    w: 0.9,
    tags: ['emotional', 'graphic', 'calm'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b = box(it)
      // 枢轴在行的起点下方（竖排则在最上字的左侧）：合拢时整串字读作同一根扇骨
      const R0 = size * 0.8 + (vert ? b.w : b.h) / 2
      const pv: Pt = vert ? [b.x0 - R0, b.y0 + size * 0.5] : [b.x0 + size * 0.5, b.y1 + R0]
      let aMin = 1e9
      for (const g of b.lay) {
        const [gx, gy] = glyphPos(g, isx, isy)
        aMin = Math.min(aMin, Math.atan2(gy - pv[1], gx - pv[0]))
      }
      const a0 = aMin - 0.45
      const e = oBack(p, 1.15)
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const vx = gx - pv[0]
        const vy = gy - pv[1]
        const d = (a0 - Math.atan2(vy, vx)) * (1 - e)
        const c = Math.cos(d)
        const sn = Math.sin(d)
        const nx = c * vx - sn * vy
        const ny = sn * vx + c * vy
        return { dx: nx - vx, dy: ny - vy, rot: d / DEG, a: clamp(p * 3.5) }
      })
    },
  },

  /** 圆柱：整行印在转动的滚筒上，从背面绕过来后滚筒展平 */
  cylinder: {
    w: 0.9,
    tags: ['graphic', 'pop', 'editorial'],
    apply(env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b = box(it)
      const U0 = vert ? b.y0 : b.x0
      const U1 = vert ? b.y1 : b.x1
      const uc = (U0 + U1) / 2
      const R = Math.max(size * 0.6, (U1 - U0) / 2) / 1.2
      const dir = dirOf(env, 61)
      const phi = dir * (1 - oQuart(p)) * 2.4
      const flat = sstep(0.5, 1, p)
      const bg = pick(env.sc.bg)
      const col = colOf(it)
      const A = clamp(p * 6)
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const u = (vert ? gy : gx) - uc
        const th = u / R + phi
        const cu = Math.cos(th)
        if (cu <= 0.04 && flat < 0.5) return HIDE
        const nu = lerp(R * Math.sin(th), u, flat)
        const k = lerp(Math.max(0.04, cu), 1, flat)
        const o: CharT = {
          a: A * lerp(clamp(cu * 1.6), 1, flat),
          color: mix(col, bg, (1 - lerp(clamp(cu), 1, flat)) * 0.6),
        }
        if (vert) {
          o.dy = nu - u
          o.sy = k
        } else {
          o.dx = nu - u
          o.sx = k
        }
        return o
      })
    },
  },

  /** 洗牌：字先出现在打乱的格子里，再沿跨过彼此弧线交换位置 */
  shuffle: {
    w: 0.9,
    tags: ['pop', 'glitch', 'graphic'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const seed = seedOf(it)
      const S: { lay: LaidText | null; perm: Map<number, number> | null } = {
        lay: null,
        perm: null,
      }
      addPre(it, (_env2, x) => {
        const lay = layoutText(x)
        const ids = lay.filter((g) => !isBlank(g.ch)).map((g) => g.i)
        const n = ids.length
        const arr = ids.slice()
        for (let k = n - 1; k > 0; k--) {
          const j = Math.floor(r(seed, k, 71) * (k + 1))
          const t = arr[k]
          arr[k] = arr[j]
          arr[j] = t
        }
        if (n > 1 && arr.every((v, k) => v === ids[k])) arr.push(arr.shift() as number)
        const perm = new Map<number, number>()
        ids.forEach((id, k) => perm.set(id, arr[k]))
        S.lay = lay
        S.perm = perm
      })
      const A = clamp(p / 0.12)
      const isx = it.sx || 1
      const isy = it.sy || 1
      glyphs(it, (i, g) => {
        const lay = S.lay
        const perm = S.perm
        if (!lay || !perm) return null
        const src = lay[perm.get(i) ?? i]
        const q = stg(clamp((p - 0.16) / 0.84), r(seed, i, 72), 0.3)
        if (q >= 1) return null
        const [sx0, sy0] = glyphPos(src, isx, isy)
        const [tx, ty] = glyphPos(g, isx, isy)
        const ex = sx0 - tx
        const ey = sy0 - ty
        const d = Math.hypot(ex, ey)
        const e = ioCubic(q)
        if (d < 0.5) return { a: A, s: lerp(0.8, 1, oBack(q, 2)) }
        const sgn = (vert ? ey : ex) > 0 ? 1 : -1
        const h = Math.min(size * 0.85, d * 0.4) * Math.sin(PI * e)
        // 垂直方向：往前走的字拱"过"对方
        const nx = (-ey / d) * sgn
        const ny = (ex / d) * sgn
        return {
          dx: ex * (1 - e) + nx * h * (vert ? -1 : 1),
          dy: ey * (1 - e) + ny * h * (vert ? -1 : 1),
          s: 1 + sgn * 0.14 * Math.sin(PI * e),
          a: A,
        }
      })
    },
  },

  /** 逐格：定格动画手感——几个略微偏离的中间姿势一张张停住，再落位 */
  stopMotion: {
    w: 0.8,
    tags: ['pop', 'emotional'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.45, 0.25, 0.8),
    apply(_env, it, p) {
      const size = it.size
      const seed = seedOf(it)
      const K = 5
      glyphs(it, (i, _g, n) => {
        const q = stg(p, r(seed, i, 81) * 0.5 + ordLR(i, n) * 0.5, 0.45)
        if (q <= 0) return HIDE
        const k = Math.min(K - 1, Math.floor(q * K))
        if (k >= K - 1) return null
        const f = 1 - oCubic(k / (K - 1))
        const ang = r(seed, i, 82) * TAU
        const D = size * (0.7 + 0.5 * r(seed, i, 83))
        return {
          dx: Math.cos(ang) * D * f + rs(seed, i, k, 84) * size * 0.05,
          dy: Math.sin(ang) * D * f + rs(seed, i, k, 85) * size * 0.05,
          rot: rs(seed, i, k, 86) * 22 * f + rs(seed, i, 87) * 6 * f,
          s: 1 + rs(seed, i, k, 88) * 0.14 * f,
        }
      })
    },
  },

  /** 波纹：一圈波从中部扩散，波峰过处字浮起并再点一下头 */
  ripple: {
    w: 1,
    tags: ['emotional', 'calm', 'graphic'],
    apply(_env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b0 = box(it)
      const Rmax = Math.hypot(b0.w, b0.h) / 2 + size * 0.3
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const vx = gx - b0.cx
        const vy = gy - b0.cy
        const d = Math.hypot(vx, vy)
        const pd = (0.68 * d) / Rmax
        const q = clamp((p - pd) / 0.32)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const w = Math.sin(q * PI * 2) * Math.pow(1 - q, 2)
        const push = size * 0.28 * w
        const o: CharT = { s: 1 + 0.4 * Math.sin(q * PI) * (1 - q), a: clamp(q * 5) }
        if (d > 1) {
          o.dx = (vx / d) * push
          o.dy = (vy / d) * push
        }
        return o
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const lw = Math.max(1.5, size * 0.022)
        for (let k = 0; k < 2; k++) {
          const f = clamp(p / 0.68 - k * 0.12)
          if (f <= 0) continue
          const rad = Rmax * f * 1.05
          const a = A * (1 - f) * (k ? 0.5 : 0.85)
          if (a > 0.01 && rad > 1)
            env2.circle(b.cx, b.cy, rad, null, env2.sc.accent, lw * (1 - f * 0.5), a, false)
        }
      })
    },
  },

  /** 拉链：拉头沿行跑过，跑过的地方字像齿一样上下分开 */
  zipper: {
    w: 0.8,
    tags: ['graphic', 'pop'],
    inDur: (dur) => clamp(dur * 0.42, 0.18, 0.75),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b = box(it)
      const U0 = vert ? b.y0 : b.x0
      const U1 = vert ? b.y1 : b.x1
      const Lv = size * 2.4
      const Am = size * 0.8
      const s = lerp(U0 - size * 0.3, U1 + size * 0.4, E.inOutSine(clamp(p / 0.92)))
      const fade = clamp(p * 5)
      const solo = glyphN(it) <= 1
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const u = vert ? gy : gx
        const o = clamp((u - s) / Lv + 0.25)
        if (o <= 0) return null
        const sgn = (g.ci + (solo ? it.mi || 0 : 0)) % 2 ? 1 : -1
        const e = Math.pow(o, 0.8) * Am
        return vert
          ? { dx: sgn * e, rot: -sgn * 14 * o, a: fade }
          : { dy: sgn * e, rot: sgn * 14 * o, a: fade }
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, bb, x, A2) => {
        const a = A2 * fade * (1 - sstep(0.82, 0.98, p))
        if (a <= 0.01) return
        const w = size * 0.3
        const h = size * 0.46
        const col = env2.sc.accent
        for (const L of lines(x, bb)) {
          const [px, py] = ptOf(vert, s, L.v)
          if (vert) env2.rrect(px - h / 2, py - w / 2, h, w, w * 0.2, col, a, false)
          else env2.rrect(px - w / 2, py - h / 2, w, h, w * 0.2, col, a, false)
          const tab = size * 0.2
          if (vert) env2.rect(px + h / 2, py - tab * 0.25, tab, tab * 0.5, col, a, false)
          else env2.rect(px - tab * 0.25, py + h / 2, tab * 0.5, tab, col, a, false)
        }
      })
    },
  },

  /** 交互缩放：奇数字从镜头前扑进来，偶数字从远处放大 */
  zoomAlt: {
    w: 0.9,
    tags: ['pop', 'graphic', 'glitch'],
    apply(_env, it, p) {
      const size = it.size
      const bl = Math.min(30, size * 0.1)
      glyphs(it, (i, g, n) => {
        const q = stg(p, ordLR(i, n), 0.35)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        if ((g.ci + (glyphN(it) <= 1 ? it.mi || 0 : 0)) % 2 === 0) {
          const e = oQuint(q)
          return { s: lerp(2.4, 1, e), blur: bl * (1 - e), a: clamp(q * 2.5) }
        }
        return { s: Math.max(0.02, oBack(q, 2.2)), a: clamp(q * 4) }
      })
    },
  },

  /** 起立：整行平躺在地上，绕底边那根铰链抬起来 */
  tiltUp: {
    w: 0.9,
    tags: ['graphic', 'editorial', 'pop'],
    apply(env, it, p) {
      const th = 86 * spring(p, 3.2, 1.25)
      const k = Math.max(0.03, Math.cos(th * DEG))
      const b = box(it)
      const size = it.size
      const bg = pick(env.sc.bg)
      const col = colOf(it)
      const main = isMain(it)
      it.sy = (it.sy || 1) * k
      it._m = undefined
      it._lay = undefined
      moveLocal(it, 0, b.y1 * (1 - k))
      it.alpha = (it.alpha ?? 1) * clamp(p * 6)
      if (isHex(it.color)) it.color = mix(col, bg, (1 - k) * 0.55)
      if (!main) return
      postLocal(it, (env2, bb, _x, A) => {
        const a = A * (1 - sstep(0.35, 0.8, p))
        if (a <= 0.01) return
        const m = size * 0.2
        const t = Math.max(1.5, size * 0.025)
        env2.rect(bb.x0 - m, bb.y1 + t, bb.w + m * 2, t, env2.sc.accent, a, false)
      })
    },
  },

  /** 贴纸：每个字像模切贴纸一样按上去——贴住的部分从一角长出来，其余还翻卷着 */
  stickerPeel: {
    w: 0.9,
    tags: ['pop', 'graphic', 'editorial'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.85),
    apply(env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const pad = size * 0.12
      const bg = pick(env.sc.bg)
      const col = colOf(it)
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.5)
      type Geo = { gx: number; gy: number; L: number; R: number; T: number; B: number; c: number }
      // 字形盒与沿 45° 对角线（左下 → 右上）的折痕位置
      const geo = (g: LaidGlyph, u: number): Geo => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const hw = (g.w * isx) / 2 + pad
        const hh = (g.h * isy) / 2 + pad
        const L = gx - hw
        const B = gy + hh
        const Sd = hw * 2 + hh * 2
        return { gx, gy, L, R: gx + hw, T: gy - hh, B, c: lerp(-0.02, 1.02, ioCubic(u)) * Sd }
      }
      const quad = (G: Geo): Poly => [
        [G.L, G.T],
        [G.R, G.T],
        [G.R, G.B],
        [G.L, G.B],
      ]
      const side =
        (G: Geo) =>
        (v: Pt): number =>
          G.c - (v[0] - G.L + (G.B - v[1]))
      clipLocal(it, (ctx, b) => {
        const n = b.lay.N
        let any = false
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const u = qf(g.i, n)
          if (u <= 0) continue
          const G = geo(g, u)
          const poly = u >= 1 ? quad(G) : clipHalf(quad(G), side(G))
          if (poly.length < 3) continue
          poly.forEach((v, k) => {
            if (k) ctx.lineTo(v[0], v[1])
            else ctx.moveTo(v[0], v[1])
          })
          ctx.closePath()
          any = true
        }
        if (!any) ctx.rect(0, 0, 0, 0)
      })
      // 还没贴下的那部分仍离面约 62°：正看过去就是字被压扁到折痕上
      // （每个 pass 都画，色散残影才不会和主体脱节）
      addPost(it, (env2, x) => {
        const A = clamp(x.alpha ?? 1)
        if (A <= 0.01) return
        const lay = layoutText(x)
        const n = lay.N
        const ctx = env2.ctx
        const lift = mix(col, bg, 0.3)
        for (const g of lay) {
          if (isBlank(g.ch)) continue
          const u = qf(g.i, n)
          if (u <= 0 || u >= 1) continue
          const G = geo(g, u)
          const sd = side(G)
          const poly = clipHalf(quad(G), (v) => -sd(v))
          if (poly.length < 3) continue
          const px = G.L + G.c / 2
          const py = G.B - G.c / 2
          const kk = 1 - Math.cos(62 * DEG)
          const m11 = 1 - kk / 2
          const m12 = kk / 2
          ctx.save()
          toLocal(ctx, x)
          ctx.translate(px, py)
          ctx.transform(m11, m12, m12, m11, 0, 0)
          ctx.translate(-px, -py)
          ctx.beginPath()
          poly.forEach((v, k) => {
            if (k) ctx.lineTo(v[0], v[1])
            else ctx.moveTo(v[0], v[1])
          })
          ctx.closePath()
          ctx.clip()
          const gi = g.i
          const c: TextItem = {
            ...x,
            ...STRIP,
            x: 0,
            y: 0,
            rot: 0,
            skew: 0,
            charFn: (j) => (j === gi ? null : HIDE),
            shadow: undefined,
            extrude: undefined,
            gradient: undefined,
            pattern: undefined,
            color: lift,
            strokeColor: lift,
            alpha: A * clamp(u * 6),
          }
          drawItem(env2, c)
          ctx.restore()
        }
      })
    },
  },

  /* ------------------------- 纸 ------------------------- */

  /** 揉皱回弹：每个字先揉成一团自己的笔画，再被弹簧撑平 */
  crumple: {
    w: 0.7,
    tags: ['pop', 'graphic', 'emotional'],
    pieces: true,
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.45, 0.22, 0.8),
    apply(_env, it, p) {
      if (p >= 1) return
      const seed = seedOf(it)
      const isx = it.sx || 1
      const isy = it.sy || 1
      const N = Math.max(1, layoutText(it).N)
      // 描边项 / 渐变项没法按碎片画，退化成整字揉挤
      if (it.fill === false || it.gradient) {
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const e = oBack(q, 1.6)
          return { s: lerp(0.35, 1, e), rot: rs(seed, i, 92) * 120 * (1 - e), a: clamp(q * 4) }
        })
        return
      }
      pushPiece(it, (ci, pj, _pc, ox, oy, g) => {
        const q = stg(p, N > 1 ? ci / (N - 1) : 0, 0.45)
        if (q <= 0) return null
        if (q >= 1) return PIECE_IDLE
        const gx = g ? (g.x + g.vx) * isx : ox
        const gy = g ? (g.y + g.vy) * isy : oy
        const vx = ox - gx
        const vy = oy - gy
        const tB = 0.3
        let k: number
        let beta: number
        let s: number
        let rot: number
        let a = 1
        const rot0 = rs(seed, ci, pj, 91) * 160
        const beta0 = rs(seed, ci, 92) * 2.4
        if (q < tB) {
          const t = q / tB
          k = 0.78
          beta = beta0 * (1.3 - 0.3 * t)
          s = 0.72 * oBack(t, 2)
          a = clamp(t * 4)
          rot = rot0
        } else {
          const t = (q - tB) / (1 - tB)
          if (t > 0.95) return PIECE_IDLE
          const e = oBack(t, 1.5)
          k = 0.78 * (1 - e)
          beta = beta0 * (1 - e)
          s = lerp(0.72, 1, e)
          rot = rot0 * (1 - e)
        }
        const c = Math.cos(beta)
        const sn = Math.sin(beta)
        const fx = vx * (1 - k)
        const fy = vy * (1 - k)
        const nx = c * fx - sn * fy
        const ny = sn * fx + c * fy
        return pt(nx - vx, ny - vy, rot + beta / DEG, s, 1, 0, a)
      })
    },
  },

  /** 信纸展开：每个字都是四折的信，先露左上角，右半边绕竖折打开，下半边再绕横折翻下 */
  noteUnfold: {
    w: 0.8,
    tags: ['emotional', 'calm', 'graphic'],
    minDur: 0.6,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      const col = colOf(it)
      const bg = pick(env.sc.bg)
      const size = it.size
      const isx = it.sx || 1
      const isy = it.sy || 1
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.45)
      const T1: readonly [number, number] = [0.14, 0.52]
      const T2: readonly [number, number] = [0.5, 0.94]
      const op = (q: number, T: readonly [number, number]) =>
        oCubic(clamp((q - T[0]) / (T[1] - T[0])))
      const shade = (e: number) => mix(col, bg, (1 - e) * 0.55)
      const main = glyphs(it, (i, g, n) => {
        const q = qf(i, n)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        if (g.r90) return { a: clamp(q * 2) }
        if (q < T1[1])
          return {
            a: clamp(q / T1[0]),
            s: lerp(0.9, 1, oBack(q / T1[0], 2)),
            clipX: [-0.64, 0.004],
            clipY: [-0.66, 0.004],
          }
        return { clipX: [-0.7, 0.7], clipY: [-0.66, 0.004] }
      })
      addPost(it, (env2, x) => {
        copyDraw(
          env2,
          x,
          main,
          (i, g, n) => {
            const q = qf(i, n)
            if (q <= T1[0] || q >= T1[1] || g.r90) return HIDE
            const e = op(q, T1)
            return {
              sx: Math.max(0.03, e),
              clipX: [0, 0.64],
              clipY: [-0.66, 0.004],
              color: shade(e),
            }
          },
          { shadow: undefined, extrude: undefined },
        )
        copyDraw(
          env2,
          x,
          main,
          (i, g, n) => {
            const q = qf(i, n)
            if (q <= T2[0] || q >= 1 || g.r90) return HIDE
            const e = op(q, T2)
            return {
              sy: Math.max(0.03, e),
              clipY: [0, 0.66],
              clipX: [-0.7, 0.7],
              color: shade(e),
            }
          },
          { shadow: undefined, extrude: undefined },
        )
        if (env2.pass !== 'main' || !isMain(x)) return
        const A = clamp(x.alpha ?? 1)
        const lay = layoutText(x)
        const n = lay.N
        const ctx = env2.ctx
        const lw = Math.max(1, size * 0.012)
        const cc = env2.sc.sub
        ctx.save()
        toLocal(ctx, x)
        for (const g of lay) {
          // 信还没展开时的淡折痕
          if (isBlank(g.ch) || g.r90) continue
          const q = qf(g.i, n)
          if (q <= 0 || q >= 1) continue
          const [gx, gy] = glyphPos(g, isx, isy)
          const hw = g.w * isx * 0.55
          const hh = g.h * isy * 0.58
          const a = A * 0.6 * (1 - sstep(0.85, 1, q)) * clamp(q * 6)
          env2.line(
            [
              [gx, gy - hh],
              [gx, q < T1[1] ? gy : gy + hh],
            ],
            cc,
            lw,
            a,
            false,
          )
          env2.line(
            [
              [gx - hw, gy],
              [q < T1[0] ? gx : gx + hw, gy],
            ],
            cc,
            lw,
            a,
            false,
          )
        }
        ctx.restore()
      })
    },
  },

  /** 撕裂对齐：整行沿一条毛边缝撕成两半，从两侧滑进来对齐 */
  tornJoin: {
    w: 0.8,
    tags: ['graphic', 'emotional', 'pop'],
    inDur: (dur) => clamp(dur * 0.42, 0.18, 0.75),
    apply(env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const seed = seedOf(it)
      const b0 = box(it)
      const D = size * 2 + (vert ? b0.h : b0.w) * 0.25
      const e = oQuart(p / 0.72)
      const k = 1 - e
      const hit = sstep(0.62, 0.72, p) * (1 - sstep(0.72, 1, p))
      /** 垂直于阅读轴的毛边缝（局部坐标） */
      const seam = (b: ItemBox): Pt[] => {
        const U = vert ? b.cy : b.cx
        const V0 = (vert ? b.x0 : b.y0) - size * 0.15
        const V1 = (vert ? b.x1 : b.y1) + size * 0.15
        const K = 11
        const out: Pt[] = []
        for (let j = 0; j <= K; j++)
          out.push([
            U + rs(seed, j, 95) * size * 0.1 + (j % 2 ? 1 : -1) * size * 0.03,
            lerp(V0, V1, j / K),
          ])
        return out
      }
      /** 一半的多边形（ov：咬进另一半多少） */
      const half = (b: ItemBox, side: number, ov = 0): Pt[] => {
        const s = seam(b)
        const far = (vert ? b.h : b.w) + size * 6
        const U = vert ? b.cy : b.cx
        const pts = s.map(([u, v]) => ptOf(vert, u - side * ov, v))
        const cap: Pt[] = [
          ptOf(vert, U + side * far, s[s.length - 1][1]),
          ptOf(vert, U + side * far, s[0][1]),
        ]
        return pts.concat(cap)
      }
      const path = (ctx: CanvasRenderingContext2D, poly: Poly): void => {
        poly.forEach((q, j) => {
          if (j) ctx.lineTo(q[0], q[1])
          else ctx.moveTo(q[0], q[1])
        })
        ctx.closePath()
      }
      const fib = pick(env.sc.fg)
      const fa = 1 - sstep(0.7, 0.95, p)
      const prim = isPrimary(it)
      it.alpha = (it.alpha ?? 1) * clamp(p * 5)
      const jolt = hit * size * 0.035 * Math.sin(p * 90)
      if (vert) it.x += jolt
      else it.y += jolt
      /** 撕口上的纸纤维 */
      const fibres = (env2: Env, q: TextItem): void => {
        const ctx = env2.ctx
        ctx.save()
        toLocal(ctx, q)
        env2.line(
          seam(box(q)).map(([u, v]) => ptOf(vert, u, v)),
          mix(fib, pick(env2.sc.bg), 0.35),
          Math.max(1, size * 0.018),
          fa * 0.8 * clamp(q.alpha ?? 1),
          false,
        )
        ctx.restore()
      }
      if (k <= 1e-4) {
        // 两半已经合上：整行照原样画，只留纤维
        if (fa > 0.01 && prim)
          addPost(it, (env2, x) => {
            if (env2.pass === 'main') fibres(env2, x)
          })
        return
      }
      const dX = -(vert ? 0 : D * k)
      const dY = -(vert ? D * k : 0)
      const dR = -5 * k
      it.x += dX
      it.y += dY
      it.rot = (it.rot || 0) + dR
      clipLocal(it, (ctx, b) => path(ctx, half(b, -1)))
      addPre(it, (env2, x) => {
        const o: TextItem = {
          ...x,
          x: x.x - 2 * dX,
          y: x.y - 2 * dY,
          rot: (x.rot || 0) - 2 * dR,
        }
        const ctx = env2.ctx
        ctx.save()
        ctx.beginPath()
        ctx.save()
        toLocal(ctx, o)
        path(ctx, half(box(o), 1, 1.2 / (env2.scale || 1)))
        ctx.restore()
        ctx.clip()
        copyDraw(env2, o, null, null)
        ctx.restore()
        if (fa > 0.01 && env2.pass === 'main' && prim) {
          fibres(env2, x)
          fibres(env2, o)
        }
      })
    },
  },

  /** 翻页牌：每个字在落到自己之前先随机翻过几个字符（机场 split-flap） */
  splitFlap: {
    w: 0.9,
    tags: ['glitch', 'editorial', 'graphic'],
    minDur: 0.75,
    inDur: (dur, n) => clamp(0.35 + n * 0.03, 0.45, Math.max(0.45, Math.min(1.0, dur * 0.55))),
    apply(env, it, p) {
      const seed = seedOf(it)
      const col = colOf(it)
      const bg = pick(env.sc.bg)
      const size = it.size
      const isx = it.sx || 1
      const isy = it.sy || 1
      type Flap = {
        q: number
        F: number
        j?: number
        f?: number
        oldCh?: string | null
        newCh?: string | null
      }
      const st = (i: number, n: number): Flap => {
        const q = stg(p, ordLR(i, n), 0.4)
        const F = 3 + (i % 2)
        if (q <= 0 || q >= 1) return { q, F }
        const x = q * F
        const j = Math.min(F - 1, Math.floor(x))
        const f = x - j
        const chOf = (k: number) =>
          k <= 0 ? null : k >= F ? '' : SIGNS[hash(seed, i, k, 97) % SIGNS.length]
        return { q, F, j, f, oldCh: chOf(j), newCh: chOf(j + 1) }
      }
      const ch = (c: string | null | undefined): CharT => (c ? { ch: c } : {})
      const main = glyphs(it, (i, g, n) => {
        const S = st(i, n)
        if (S.q <= 0) return HIDE
        if (S.q >= 1) return null
        if (g.r90) return { a: S.q }
        const c1 = (S.f || 0) < 0.5 ? Math.cos((S.f || 0) * PI) : 0
        return { clipY: [-0.64, -0.64 * c1], clipX: [-0.7, 0.7], ...ch(S.newCh) }
      })
      addPre(it, (env2, x) => {
        // 旧字符的下半截，直到新叶片把它盖住
        copyDraw(
          env2,
          x,
          main,
          (i, g, n) => {
            const S = st(i, n)
            if (S.q <= 0 || S.q >= 1 || g.r90 || S.oldCh == null) return HIDE
            const f = S.f || 0
            const c2 = f >= 0.5 ? -Math.cos(f * PI) : 0
            return { clipY: [0.64 * c2, 0.66], clipX: [-0.7, 0.7], ...ch(S.oldCh) }
          },
          { shadow: undefined },
        )
      })
      addPost(it, (env2, x) => {
        copyDraw(
          env2,
          x,
          main,
          (i, g, n) => {
            const S = st(i, n)
            if (S.q <= 0 || S.q >= 1 || g.r90) return HIDE
            const f = S.f || 0
            if (f < 0.5) {
              if (S.oldCh == null) return HIDE
              const c = Math.max(0.03, Math.cos(f * PI))
              return {
                sy: c,
                clipY: [-0.64, 0],
                clipX: [-0.7, 0.7],
                color: mix(col, bg, (1 - c) * 0.5),
                ...ch(S.oldCh),
              }
            }
            const c = Math.max(0.03, -Math.cos(f * PI))
            return {
              sy: c,
              clipY: [0, 0.66],
              clipX: [-0.7, 0.7],
              color: mix(col, bg, (1 - c) * 0.5),
              ...ch(S.newCh),
            }
          },
          { shadow: undefined },
        )
        if (env2.pass !== 'main') return
        const A = clamp(x.alpha ?? 1)
        const lay = layoutText(x)
        const n = lay.N
        const ctx = env2.ctx
        ctx.save()
        toLocal(ctx, x)
        for (const g of lay) {
          // 两片叶片之间的那道缝
          if (isBlank(g.ch) || g.r90) continue
          const S = st(g.i, n)
          if (S.q <= 0 || S.q >= 1) continue
          const [gx, gy] = glyphPos(g, isx, isy)
          const w = g.w * isx * 1.04
          const t = Math.max(1, size * 0.018)
          env2.rect(gx - w / 2, gy - t / 2, w, t, bg, A, false)
        }
        ctx.restore()
      })
    },
  },

  /* ------------------------- 光 ------------------------- */

  /** 过曝：整行先以烧白的过曝光（泛光 + 辉光）闪进来，再把曝光压回本来的颜色 */
  overexpose: {
    w: 1,
    tags: ['emotional', 'pop', 'glitch'],
    inDur: (dur) => clamp(dur * 0.42, 0.18, 0.75),
    apply(env, it, p) {
      const hot = hotOf(env)
      const size = it.size
      const tF = 0.12
      const ex = p < tF ? 1 : 1 - E.inOutSine(clamp((p - tF) / (1 - tF)))
      if (p < tF) it.alpha = (it.alpha ?? 1) * E.outCubic(p / tF)
      if (isHex(it.color)) it.color = mix(it.color, hot, ex * 0.96)
      const sc0 = isHex(it.strokeColor) ? it.strokeColor : colOf(it)
      if ((it.stroke || 0) > 0 || it.fill === false) it.strokeColor = mix(sc0, hot, ex * 0.96)
      if (it.fill !== false && ex > 0.02) {
        // 用同色描边当廉价 bloom（真泛光要离屏层，代价太高）
        it.stroke = (it.stroke || 0) + size * 0.045 * ex
        it.strokeColor =
          it.stroke > size * 0.045 * ex + 0.01 ? it.strokeColor : mix(colOf(it), hot, 1)
        it.strokeUnder = false
      }
      it.blur = (it.blur || 0) + Math.min(14, size * 0.04) * ex * ex
      if (!it.shadow && ex > 0.02)
        it.shadow = {
          color: rgba(hot, 0.9 * ex),
          blur: Math.min(90, size * 0.5) * ex,
          dx: 0,
          dy: 0,
        }
      scaleAbout(it, 1 + 0.06 * ex)
    },
  },

  /** 高光扫过：字先以极淡的 ghost 待着，一道斜掠的高光扫过后把它留在点亮状态 */
  glint: {
    w: 1,
    tags: ['editorial', 'emotional', 'graphic'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const kS = 0.45
      const hot =
        lum(colOf(it)) > 0.7 || lum(pick(env.sc.bg)) > 0.5
          ? pick(env.sc.accent, env.sc.fg)
          : '#ffffff'
      type Geo = {
        U0: number
        U1: number
        V0: number
        V1: number
        vc: number
        bw: number
        B: number
        big: number
      }
      const geo = (b: ItemBox): Geo => {
        const U0 = vert ? b.y0 : b.x0
        const U1 = vert ? b.y1 : b.x1
        const V0 = (vert ? b.x0 : b.y0) - size * 0.3
        const V1 = (vert ? b.x1 : b.y1) + size * 0.3
        const vc = (V0 + V1) / 2
        const bw = size * 0.55
        const sl = (kS * (V1 - V0)) / 2
        return {
          U0,
          U1,
          V0,
          V1,
          vc,
          bw,
          B: lerp(U0 - bw - sl, U1 + bw + sl, E.inOutSine(clamp(p / 0.9))),
          big: U1 - U0 + size * 8,
        }
      }
      /** u + kS·(v - vc) 落在 [a, b] 之间的区域 */
      const band = (ctx: CanvasRenderingContext2D, G: Geo, a: number, b: number): void => {
        const q: Poly = [
          [a - kS * (G.V0 - G.vc), G.V0],
          [b - kS * (G.V0 - G.vc), G.V0],
          [b - kS * (G.V1 - G.vc), G.V1],
          [a - kS * (G.V1 - G.vc), G.V1],
        ]
        q.forEach((v, j) => {
          const P2 = ptOf(vert, v[0], v[1])
          if (j) ctx.lineTo(P2[0], P2[1])
          else ctx.moveTo(P2[0], P2[1])
        })
        ctx.closePath()
      }
      clipLocal(it, (ctx, b) => {
        const G = geo(b)
        band(ctx, G, G.U0 - G.big, G.B)
      })
      const ghostA = 0.2 * clamp(p * 6)
      addPre(it, (env2, x) => {
        const ctx = env2.ctx
        const G = geo(box(x))
        ctx.save()
        ctx.beginPath()
        ctx.save()
        toLocal(ctx, x)
        band(ctx, G, G.B, G.U1 + G.big)
        ctx.restore()
        ctx.clip()
        copyDraw(env2, x, null, null, { alpha: (x.alpha ?? 1) * ghostA, shadow: undefined })
        ctx.restore()
      })
      addPost(it, (env2, x) => {
        if (env2.pass !== 'main') return
        const ctx = env2.ctx
        const G = geo(box(x))
        const A = clamp(x.alpha ?? 1) * (1 - sstep(0.85, 1, p))
        const passes: readonly (readonly [number, number, number])[] = [
          [G.B - G.bw, G.B + G.bw * 0.15, 0.45],
          [G.B - G.bw * 0.45, G.B, 1],
        ]
        for (const [a, b, al] of passes) {
          ctx.save()
          ctx.beginPath()
          ctx.save()
          toLocal(ctx, x)
          band(ctx, G, a, b)
          ctx.restore()
          ctx.clip()
          copyDraw(env2, x, null, null, {
            color: hot,
            strokeColor: hot,
            alpha: A * al,
            shadow: undefined,
            gradient: undefined,
            pattern: undefined,
          })
          ctx.restore()
        }
      })
    },
  },

  /** 放大镜：一只镜沿行滑过，镜下的字鼓起，镜过后留下清晰的它 */
  loupe: {
    w: 0.8,
    tags: ['editorial', 'pop', 'calm'],
    minDur: 0.6,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b = box(it)
      const U0 = vert ? b.y0 : b.x0
      const U1 = vert ? b.y1 : b.x1
      const V0 = vert ? b.x0 : b.y0
      const V1 = vert ? b.x1 : b.y1
      const vc = (V0 + V1) / 2
      const rr = Math.max(size * 0.95, (V1 - V0) * 0.62)
      const Lc = lerp(U0 - rr * 0.7, U1 + rr * 1.4, E.inOutSine(clamp(p / 0.9)))
      const pre = 0.14 * clamp(p * 5)
      const fin = clamp(p * 6)
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const u = vert ? gy : gx
        const v = vert ? gx : gy
        const du = u - Lc
        const dv = v - vc
        const d = Math.hypot(du, dv) / rr
        if (d >= 1) return du > 0 ? { a: pre } : null
        const m = 1 - d * d
        const o: CharT = {
          s: 1 + 0.6 * m,
          a: fin * (du > 0 ? lerp(pre, 1, Math.min(1, m * 3)) : 1),
        }
        const push = 0.35 * m
        if (vert) {
          o.dy = du * push
          o.dx = dv * push
        } else {
          o.dx = du * push
          o.dy = dv * push
        }
        return o
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, _b, _x, A) => {
        const a = A * clamp(p * 8) * (1 - sstep(0.8, 0.97, p))
        if (a <= 0.01) return
        const [cx, cy] = ptOf(vert, Lc, vc)
        const lw = Math.max(2, size * 0.05)
        const col = env2.sc.accent
        env2.circle(cx, cy, rr, null, col, lw, a, false)
        env2.arc(cx, cy, rr * 0.8, 200, 250, env2.sc.fg, lw * 0.5, a * 0.5, false)
        const hx = cx + Math.cos(PI / 4) * rr
        const hy = cy + Math.sin(PI / 4) * rr
        env2.line(
          [
            [hx, hy],
            [hx + rr * 0.55, hy + rr * 0.55],
          ],
          col,
          lw * 2,
          a,
          false,
        )
      })
    },
  },

  /** 走片：放映机掉了环——画格带着格线过门、灯闪，最后卡住 */
  filmFeed: {
    w: 0.8,
    tags: ['emotional', 'glitch', 'editorial'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.48, 0.22, 0.85),
    apply(env, it, p) {
      const size = it.size
      const seed = cutOf(env).seed | 0
      const b = box(it)
      const R0 = dRange(it, b)
      const FH = R0.y1 - R0.y0 + size * 0.7
      const e = oCubic(p / 0.82)
      const off = (((FH * 2.35 * (1 - e)) % FH) + FH) % FH
      const gate: readonly [number, number] = [
        (R0.y0 + R0.y1) / 2 - FH / 2,
        (R0.y0 + R0.y1) / 2 + FH / 2,
      ]
      const fl = 1 - sstep(0.55, 0.95, p)
      it.alpha = (it.alpha ?? 1) * clamp(p * 7) * (1 - 0.45 * fl * r(seed, env.step, 99))
      it.x += rs(seed, env.step, 98) * size * 0.02 * fl
      if (off < 0.5) return
      it.y += off
      it.clipY = [gate[0], gate[1]]
      addPre(it, (env2, x) => {
        const ctx = env2.ctx
        ctx.save()
        ctx.beginPath()
        ctx.rect(-env2.W, gate[0], env2.W * 3, FH)
        ctx.clip()
        copyDraw(env2, { ...x, y: x.y - FH }, null, null)
        ctx.restore()
        const yb = gate[0] + off - size * 0.06
        const w = R0.x1 - R0.x0 + size * 1.2
        env2.rect(
          (R0.x0 + R0.x1) / 2 - w / 2,
          yb,
          w,
          size * 0.12,
          mix(pick(env2.sc.bg), pick(env2.sc.fg), 0.18),
          clamp(x.alpha ?? 1),
          false,
        )
      })
    },
  },

  /** 逆光：先升起一圈光晕，字以剪影读出，再被点亮 */
  backlight: {
    w: 0.9,
    tags: ['emotional', 'calm'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.48, 0.22, 0.85),
    apply(env, it, p) {
      const size = it.size
      const bg = pick(env.sc.bg)
      const col = colOf(it)
      const glow = pick(env.sc.accent, env.sc.fg)
      const rise = oCubic(p / 0.4)
      const lit = E.inOutSine(clamp((p - 0.3) / 0.6))
      const halo = rise * (1 - sstep(0.45, 1, p))
      const main = isMain(it)
      if (isHex(it.color)) it.color = mix(mix(bg, col, 0.12), col, lit)
      if (it.fill === false) {
        const sc0 = it.strokeColor || it.color
        if (isHex(sc0)) it.strokeColor = mix(bg, sc0, Math.max(0.25, lit))
      }
      it.alpha = (it.alpha ?? 1) * clamp(p * 5)
      if (!it.shadow && halo > 0.01)
        it.shadow = {
          color: rgba(glow, 0.95 * halo),
          blur: Math.min(110, size * 0.55) * (0.5 + 0.5 * rise),
          dx: 0,
          dy: 0,
        }
      scaleAbout(it, 1 + 0.035 * (1 - lit))
      if (!main) return
      preLocal(it, (env2, b, _x, A) => {
        if (env2.pass !== 'main' || halo <= 0.01) return
        const ctx = env2.ctx
        const rr = Math.hypot(b.w, b.h) / 2 + size * 0.8
        const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, rr)
        g.addColorStop(0, rgba(glow, 0.3 * halo * A))
        g.addColorStop(1, rgba(glow, 0))
        ctx.fillStyle = g
        ctx.fillRect(b.cx - rr, b.cy - rr, rr * 2, rr * 2)
      })
    },
  },

  /** 漏光：一团暖光沿行漂过，扫到处字烧成热色，再冷却回本色 */
  lightLeak: {
    w: 0.9,
    tags: ['emotional', 'calm', 'pop'],
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b = box(it)
      const warm = pick(env.sc.accent, env.sc.fg)
      const dark = lum(pick(env.sc.bg)) < 0.5
      const core = mix(warm, '#ffffff', dark ? 0.45 : 0.2)
      const col = colOf(it)
      const U0 = vert ? b.y0 : b.x0
      const U1 = vert ? b.y1 : b.x1
      const span = Math.max(1, U1 - U0)
      const bl = Math.min(20, size * 0.06)
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const f = ((vert ? gy : gx) - U0) / span
        const q = clamp((p - 0.55 * f) / 0.45)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const e = oCubic(q)
        const heat = 1 - e
        return {
          a: clamp(q * 4),
          color: mix(
            col,
            heat > 0.6 ? mix(warm, core, (heat - 0.6) / 0.4) : warm,
            Math.min(1, heat * 1.5),
          ),
          s: 1 + 0.07 * heat,
          blur: bl * heat * heat,
        }
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, bb, _x, A) => {
        if (env2.pass !== 'main') return
        const a = A * clamp(p * 6) * (1 - sstep(0.55, 0.95, p))
        if (a <= 0.01) return
        const ctx = env2.ctx
        const leakU = lerp(U0 - size * 0.5, U1 + size * 0.5, clamp(p / 0.62))
        const [cx, cy] = ptOf(vert, leakU, vert ? bb.cx : bb.cy)
        const rr = Math.max(size * 1.4, (vert ? bb.w : bb.h) * 1.1)
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr)
        const tint = dark ? warm : mix(warm, '#ffffff', 0.55)
        const k = dark ? 0.55 : 0.4
        g.addColorStop(0, rgba(dark ? core : tint, k * a))
        g.addColorStop(0.45, rgba(tint, k * 0.4 * a))
        g.addColorStop(1, rgba(tint, 0))
        ctx.globalCompositeOperation = dark ? 'screen' : 'multiply'
        ctx.fillStyle = g
        ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
      })
    },
  },

  /** 阳炎：整行在热浪里 shimmer 进来——细切片左右摇，渐渐平复 */
  heatHaze: {
    w: 0.9,
    tags: ['emotional', 'calm', 'glitch'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const R = dRange(it, box(it))
      const t = env.lt
      const amp = size * 0.36 * (1 - E.inOutSine(p))
      it.alpha = (it.alpha ?? 1) * E.outCubic(clamp(p * 2.4))
      // 滞后的色散副本保持不失真（代价考虑）
      if (env.pass !== 'main' || amp < 0.5) return
      const pad = size * 0.3
      if (!vert) {
        const y0 = R.y0 - pad
        const h = R.y1 - R.y0 + pad * 2
        const n = clamp(Math.round(h / (size * 0.085)), 8, 14)
        const bands: [number, number, number][] = []
        for (let k = 0; k < n; k++)
          bands.push([
            y0 + (h * k) / n,
            y0 + (h * (k + 1)) / n + 0.5,
            amp * Math.sin(k * 0.9 + t * 17) * (0.55 + 0.45 * Math.sin(k * 0.37 + t * 6)),
          ])
        it.bands = bands
      } else {
        const x0 = R.x0 - pad
        const w = R.x1 - R.x0 + pad * 2
        const n = clamp(Math.round(w / (size * 0.085)), 8, 14)
        const bands: [number, number, number][] = []
        for (let k = 0; k < n; k++)
          bands.push([
            x0 + (w * k) / n,
            x0 + (w * (k + 1)) / n + 0.5,
            amp * Math.sin(k * 0.9 + t * 17) * (0.55 + 0.45 * Math.sin(k * 0.37 + t * 6)),
          ])
        it.vbands = bands
      }
    },
  },

  /* ------------------------- 数码设备 ------------------------- */

  /** CRT 开机：一个亮点横向拉成扫描线，扫描线再纵向撑开成整行字 */
  crtOn: {
    w: 0.9,
    tags: ['glitch', 'pop', 'graphic'],
    apply(env, it, p) {
      const size = it.size
      const b = box(it)
      const hot = hotOf(env)
      const col = colOf(it)
      const prim = isPrimary(it)
      const e1 = oQuart(p / 0.3)
      const e2 = oBack(clamp((p - 0.24) / 0.5), 1.6)
      const cool = sstep(0.3, 0.95, p)
      const ky = Math.max(0.012, e2)
      const kx = lerp(1.18, 1, oCubic((p - 0.24) / 0.5))
      scaleXY(it, kx, ky, b)
      if (isHex(it.color)) it.color = mix(col, hot, 1 - cool)
      it.alpha = (it.alpha ?? 1) * (p < 0.24 ? 0 : 1)
      if (!prim) return
      addPost(it, (env2, x) => {
        const la = (1 - sstep(0.3, 0.55, p)) * clamp(p * 12)
        if (la <= 0.01) return
        const ctx = env2.ctx
        const bb = box(x)
        ctx.save()
        toLocal(ctx, x)
        const w = (b.w + size * 0.6) * e1
        const th = Math.max(2, size * 0.045) * (1 + 2 * sstep(0.2, 0.3, p))
        env2.rect(bb.cx - w / 2, bb.cy - th * 2, w, th * 4, hot, la * 0.25, false)
        env2.rect(bb.cx - w / 2, bb.cy - th / 2, w, th, hot, la, false)
        ctx.restore()
      })
    },
  },

  /** 隔行扫描：先自上而下画偶数扫描线，再由第二场把奇数行补齐 */
  interlace: {
    w: 0.9,
    tags: ['glitch', 'graphic', 'editorial'],
    apply(_env, it, p) {
      const size = it.size
      const hr = Math.max(2.5, size * 0.065)
      const geo = (b: ItemBox) => {
        const pad = size * 0.25
        const V0 = b.y0 - pad
        const V1 = b.y1 + pad
        return { V0, V1, n: Math.min(260, Math.ceil((V1 - V0) / hr)) }
      }
      const f1 = clamp(p / 0.52)
      const f2 = clamp((p - 0.48) / 0.52)
      clipLocal(it, (ctx, b, _x, env2) => {
        const G = geo(b)
        const x0 = b.x0 - size
        const w = b.w + size * 2
        const ov = 1.2 / (env2.scale || 1)
        let any = false
        for (let k = 0; k < G.n; k++) {
          const y = G.V0 + k * hr
          const f = k % 2 ? f2 : f1
          if ((y - G.V0) / (G.V1 - G.V0) < f) {
            ctx.rect(x0, y - ov / 2, w, hr + ov)
            any = true
          }
        }
        if (!any) ctx.rect(0, 0, 0, 0)
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const G = geo(b)
        const f = p < 0.5 ? f1 : f2
        if (f <= 0 || f >= 1) return
        const y = lerp(G.V0, G.V1, f)
        const m = size * 0.3
        const fade = p < 0.5 ? 1 : 1 - sstep(0.85, 0.99, f)
        const th = Math.max(1.5, size * 0.02)
        env2.rect(b.x0 - m, y - 1, b.w + m * 2, th, hotOf(env2), A * 0.9 * fade, false)
      })
    },
  },

  /** 加载条：进度条一阵一阵往前冲（带百分数），扫过哪儿，哪儿的字就弹起来 */
  loadingBar: {
    w: 0.8,
    tags: ['graphic', 'editorial', 'glitch'],
    minDur: 0.7,
    inDur: (dur) => clamp(dur * 0.55, 0.3, 1),
    apply(env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const seed = cutOf(env).seed | 0
      // 关键帧：进度条在若干处停一下，读数跟着跳格
      const keys: readonly (readonly [number, number])[] = [
        [0.06, 0],
        [0.2, 0.16 + 0.08 * r(seed, 1)],
        [0.3, 0.24 + 0.08 * r(seed, 2)],
        [0.42, 0.52 + 0.1 * r(seed, 3)],
        [0.52, 0.6 + 0.08 * r(seed, 4)],
        [0.7, 1],
      ]
      let pr = 0
      for (let k = 1; k < keys.length; k++)
        if (p >= keys[k - 1][0])
          pr = lerp(
            keys[k - 1][1],
            keys[k][1],
            oCubic((p - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0])),
          )
      const b0 = box(it)
      const U0 = vert ? b0.y0 : b0.x0
      const U1 = vert ? b0.y1 : b0.x1
      const span = Math.max(1, U1 - U0)
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const f = ((vert ? gy : gx) - U0) / span
        const q = clamp((pr - f) / 0.12 + 0.35)
        if (q <= 0) return HIDE
        if (q >= 1) return null
        const e = oBack(q, 2)
        return vert
          ? { a: clamp(q * 3), dx: -(1 - e) * size * 0.25 }
          : { a: clamp(q * 3), dy: (1 - e) * size * 0.25 }
      })
      if (!isPrimary(it)) return
      const out = sstep(0.74, 0.96, p)
      const barA = clamp(p / 0.08) * (1 - sstep(0.88, 1, p))
      const font = env.st.fonts.mono[0] || 'mono'
      postLocal(it, (env2, b, _x, A) => {
        const a = A * barA
        if (a <= 0.01) return
        const th = Math.max(3, size * 0.07)
        const gap = size * 0.24
        const L = vert ? b.h : b.w
        const fs = Math.max(14, size * 0.26)
        const pct = Math.round(pr * 100) + '%'
        const lo = L * out
        const hi = L * pr
        if (!vert) {
          const y = b.y1 + gap
          env2.rect(b.x0 + lo, y, L - lo, th, env2.sc.sub, a * 0.3, false)
          if (hi > lo) env2.rect(b.x0 + lo, y, hi - lo, th, env2.sc.accent, a, false)
          env2.draw({
            text: pct,
            font,
            size: fs,
            x: b.x1 + fs * 0.4,
            y: y + th / 2,
            align: 'left',
            color: env2.sc.sub,
            alpha: a * (1 - out),
            ghost: false,
          })
        } else {
          const x0 = b.x0 - gap - th
          env2.rect(x0, b.y0 + lo, th, L - lo, env2.sc.sub, a * 0.3, false)
          if (hi > lo) env2.rect(x0, b.y0 + lo, th, hi - lo, env2.sc.accent, a, false)
          env2.draw({
            text: pct,
            font,
            size: fs,
            x: x0 + th / 2,
            y: b.y1 + fs * 0.9,
            color: env2.sc.sub,
            alpha: a * (1 - out),
            ghost: false,
          })
        }
      })
    },
  },

  /** 抖动：Bayer 4×4 有序抖动，整行从规则的网点里一排排显影 */
  dither: {
    w: 0.9,
    tags: ['glitch', 'graphic'],
    apply(env, it, p) {
      const size = it.size
      const dir = dirOf(env, 101)
      clipLocal(it, (ctx, b, _x, env2) => {
        const pad = size * 0.2
        const W = b.w + pad * 2
        const H = b.h + pad * 2
        const ov = 1.2 / (env2.scale || 1)
        let cs = Math.max(3, size * 0.075)
        while ((W / cs) * (H / cs) > 1400) cs *= 1.2
        const nx = Math.ceil(W / cs)
        const ny = Math.ceil(H / cs)
        const ox = b.cx - (nx * cs) / 2
        const oy = b.cy - (ny * cs) / 2
        let any = false
        for (let iy = 0; iy < ny; iy++) {
          // 同一行里连续的格子合成一条横条，少画几千个矩形
          let run = -1
          for (let ix = 0; ix <= nx; ix++) {
            let on = false
            if (ix < nx) {
              const th = (BAYER[(iy & 3) * 4 + (ix & 3)] + 0.5) / 16
              const u = nx > 1 ? ix / (nx - 1) : 0
              on = p * 1.35 - 0.3 * (dir > 0 ? u : 1 - u) > th
            }
            if (on && run < 0) run = ix
            if (!on && run >= 0) {
              ctx.rect(ox + run * cs - ov / 2, oy + iy * cs - ov / 2, (ix - run) * cs + ov, cs + ov)
              run = -1
              any = true
            }
          }
        }
        if (!any) ctx.rect(0, 0, 0, 0)
      })
    },
  },

  /** 滚筒：每个字在自己的窗口里向上滚过几个字符，咔哒一声停住 */
  odometer: {
    w: 0.9,
    tags: ['glitch', 'editorial', 'pop'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const seed = seedOf(it)
      const isy = it.sy || 1
      const digits = /^[0-9\s]+$/.test(String(it.text || ''))
      const pool = digits ? '0123456789' : SIGNS
      const reel = (i: number, n: number) => {
        const q = stg(p, ordLR(i, n), 0.45)
        const R = 3 + (hash(seed, i, 111) % 3)
        return { q, R, s: R * (1 - oBack(q, 1.15)) }
      }
      /** 滚筒上的第 j 格（0 = 真正的字），裁在自己的窗口里 */
      const cell = (g: LaidGlyph, j: number, s: number, chs?: string): CharT => {
        const f = (s - j) * 1.02
        if (Math.abs(f) >= 1) return HIDE
        const o: CharT = {
          dy: f * g.h * isy,
          clipY: [-0.58 - f, 0.58 - f],
          clipX: [-2, 2],
          a: 1 - 0.35 * Math.abs(f),
        }
        if (chs) o.ch = chs
        return o
      }
      const main = glyphs(it, (i, g, n) => {
        const rl = reel(i, n)
        if (rl.q <= 0) return HIDE
        if (rl.q >= 1) return null
        if (g.r90) return { a: rl.q }
        return cell(g, 0, rl.s)
      })
      addPre(it, (env2, x) => {
        // 前导格与后继格各画一份，夹住真正那一格
        for (const side of [0, 1]) {
          copyDraw(
            env2,
            x,
            main,
            (i, g, n) => {
              const rl = reel(i, n)
              if (rl.q <= 0 || rl.q >= 1 || g.r90) return HIDE
              const j = side ? Math.ceil(rl.s) : Math.floor(rl.s)
              if (j < 1 || j > rl.R || (side && j === Math.floor(rl.s))) return HIDE
              return cell(g, j, rl.s, pool[hash(seed, i, j, 112) % pool.length])
            },
            { shadow: undefined },
          )
        }
      })
    },
  },

  /** 数据雨：每个字是一段闪烁字符流的亮头，一路垂落进位置 */
  matrixRain: {
    w: 0.8,
    tags: ['glitch', 'graphic'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      const vert = !!it.vertical
      const isy = it.sy || 1
      const size = it.size
      const seed = seedOf(it)
      const step = env.step
      const hot = hotOf(env)
      const acc = pick(env.sc.accent, env.sc.fg)
      const col = colOf(it)
      const K = 4
      const land = 0.62
      const nL = layoutText(it).reduce((m, g) => Math.max(m, g.li + 1), 1)
      // 靠下的字先落地，字符流才不会压到已经落定的字
      const key = (g: LaidGlyph): number =>
        0.35 * r(seed, g.i, 121) +
        0.65 *
          (vert ? (g.n > 1 ? 1 - g.ci / (g.n - 1) : 0) : nL > 1 ? (nL - 1 - g.li) / (nL - 1) : 0)
      const st = (g: LaidGlyph) => {
        const q = stg(p, key(g), 0.45)
        const D = size * (2.2 + r(seed, g.i, 122))
        return { q, y: -D * (1 - oCubic(q / land)) }
      }
      const rnd = (i: number, k: number) => SIGNS[hash(seed, i, k, step, 123) % SIGNS.length]
      const main = glyphs(it, (i, g) => {
        const S = st(g)
        if (S.q <= 0) return HIDE
        if (S.q >= 1) return null
        if (S.q < land) return { dy: S.y, ch: rnd(i, 0), color: hot }
        return { color: mix(col, hot, 1 - oCubic((S.q - land) / (1 - land))) }
      })
      addPre(it, (env2, x) => {
        for (let k = 1; k <= K; k++) {
          copyDraw(
            env2,
            x,
            main,
            (i, g) => {
              const S = st(g)
              if (S.q <= 0 || S.q >= 1) return HIDE
              const a = (1 - k / (K + 1)) * 0.75 * (1 - sstep(land * 0.9, 1, S.q)) * clamp(S.q * 6)
              if (a <= 0.01) return HIDE
              return { dy: S.y - k * g.h * isy * 0.92, ch: rnd(i, k), color: acc, a, s: 0.9 }
            },
            { shadow: undefined, extrude: undefined, gradient: undefined, pattern: undefined },
          )
        }
      })
    },
  },

  /* ------------------------- 图形遮罩 ------------------------- */

  /** 网纹转实色：每个字先以网点/斜纹稿 + 极细描边印出，再被实色墨填满 */
  hatchFill: {
    w: 0.9,
    tags: ['graphic', 'editorial'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(env, it, p) {
      const size = it.size
      const col = colOf(it)
      const pat = (['stripes', 'hatch', 'dots'] as const)[hash(cutOf(env).seed | 0, 131) % 3]
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.45)
      const main = glyphs(it, (i, _g, n) => {
        const q = qf(i, n)
        if (q <= 0.35) return HIDE
        if (q >= 1) return null
        return { a: E.inOutSine((q - 0.35) / 0.55) }
      })
      if (it.fill === false) return
      addPre(it, (env2, x) => {
        if (env2.pass !== 'main') return
        copyDraw(
          env2,
          x,
          main,
          (i, _g, n) => {
            const q = qf(i, n)
            if (q <= 0 || q >= 1) return HIDE
            return { a: clamp(q * 5) * (1 - sstep(0.75, 1, q)), s: lerp(1.1, 1, oCubic(q / 0.4)) }
          },
          {
            pattern: pat,
            patternColor: x.color || col,
            patternBg: undefined,
            gradient: undefined,
            stroke: Math.max(1, size * 0.014),
            strokeColor: x.color || col,
            strokeUnder: false,
            shadow: undefined,
            extrude: undefined,
          },
        )
      })
    },
  },

  /** 笔刷：一道毛边的干笔沿行扫过，笔须的末梢是强调色，一行接一行刷进来 */
  brushReveal: {
    w: 1,
    tags: ['emotional', 'editorial', 'calm'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.85),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const size = it.size
      const seed = seedOf(it)
      const K = 14
      const tail = size * 1.1
      const pad = size * 0.2
      type StripFn = (L: LineSpan, v: number, th: number, u0: number, u1: number, q: number) => void
      /** 每一行的每一根笔须：fn(行, 横向位置, 厚度, 起点, 终点, 该行进度) */
      const strips = (x: TextItem, b: ItemBox, fn: StripFn): void => {
        const Ls = lines(x, b)
        const nL = Ls.length
        for (const L of Ls) {
          const q = stg(p, nL > 1 ? L.li / (nL - 1) : 0, nL > 1 ? 0.4 : 0)
          if (q <= 0) continue
          const F = lerp(L.u0 - pad, L.u1 + pad + tail, E.inOutSine(q))
          const hv = size * 0.66 * (vert ? x.sx || 1 : x.sy || 1)
          const th = (hv * 2) / K
          for (let k = 0; k < K; k++) {
            const lag = tail * Math.pow(r(seed, L.li, k, 141), 1.6)
            const end = F - lag
            if (end > L.u0 - pad) fn(L, L.v - hv + k * th, th, L.u0 - pad, end, q)
          }
        }
      }
      const brush = (
        ctx: CanvasRenderingContext2D,
        v: number,
        th: number,
        u0: number,
        u1: number,
      ) => (vert ? ctx.rect(v, u0, th + 0.6, u1 - u0) : ctx.rect(u0, v, u1 - u0, th + 0.6))
      clipLocal(it, (ctx, b, x, env2) => {
        const ov = 1.2 / (env2.scale || 1)
        let any = false
        strips(x, b, (_L, v, th, u0, u1) => {
          brush(ctx, v - ov / 2, th + ov, u0, u1)
          any = true
        })
        if (!any) ctx.rect(0, 0, 0, 0)
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, x, A) => {
        const tip = size * 0.32
        strips(x, b, (L, v, th, u0, u1, q) => {
          const a = A * 0.9 * (1 - sstep(0.7, 0.95, q))
          if (a <= 0.01 || u1 > L.u1 + pad + tip) return
          const s0 = Math.max(u0, u1 - tip)
          if (vert) env2.rect(v, s0, th * 0.92, u1 - s0, env2.sc.accent, a, false)
          else env2.rect(s0, v, u1 - s0, th * 0.92, env2.sc.accent, a, false)
        })
      })
    },
  },

  /** 墨滴：每个字里落一滴墨，不规则的墨晕向外洇开把它显影 */
  inkDrop: {
    w: 1,
    tags: ['calm', 'emotional', 'graphic'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.85),
    apply(_env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const seed = seedOf(it)
      const qf = (i: number) => stg(p, r(seed, i, 151), 0.5)
      const drop = (g: LaidGlyph) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const hw = (g.w * isx) / 2
        const hh = (g.h * isy) / 2
        const px = gx + rs(seed, g.i, 152) * hw * 0.4
        const py = gy + rs(seed, g.i, 153) * hh * 0.4
        return {
          px,
          py,
          R: Math.hypot(hw + Math.abs(px - gx), hh + Math.abs(py - gy)) + size * 0.08,
        }
      }
      clipLocal(it, (ctx, b) => {
        let any = false
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const q = qf(g.i)
          if (q <= 0.12) continue
          const D = drop(g)
          const rad = D.R * oCubic((q - 0.12) / 0.88)
          const ph1 = r(seed, g.i, 154) * TAU
          const ph2 = r(seed, g.i, 155) * TAU
          if (q >= 1) {
            ctx.rect(D.px - D.R * 1.2, D.py - D.R * 1.2, D.R * 2.4, D.R * 2.4)
            any = true
            continue
          }
          for (let k = 0; k <= 20; k++) {
            const a = (k / 20) * TAU
            const rr = rad * (1 + 0.1 * Math.sin(3 * a + ph1) + 0.07 * Math.sin(5 * a + ph2))
            if (k) ctx.lineTo(D.px + Math.cos(a) * rr, D.py + Math.sin(a) * rr)
            else ctx.moveTo(D.px + rr, D.py)
          }
          ctx.closePath()
          any = true
        }
        if (!any) ctx.rect(0, 0, 0, 0)
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, _x, A) => {
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const q = qf(g.i)
          if (q <= 0 || q >= 0.4) continue
          const D = drop(g)
          const t = q / 0.12
          const rad = size * 0.07 * (q < 0.12 ? oBack(t, 2) : 1 + (q - 0.12) * 4)
          const a = A * (q < 0.12 ? 1 : 1 - (q - 0.12) / 0.28)
          env2.circle(D.px, D.py, rad, env2.sc.accent, null, 1, a, false)
        }
      })
    },
  },

  /** 四方集结：整行切成四象限，从四个角飞进来拼合（对角的一对同时到） */
  quarters: {
    w: 0.9,
    tags: ['graphic', 'pop'],
    apply(env, it, p) {
      const size = it.size
      const b0 = box(it)
      const D = size * (glyphN(it) > 1 ? 1.1 : 0.5) + Math.max(b0.w, b0.h) * 0.12
      const big = size * 30
      const dir = dirOf(env, 161)
      // [横向, 纵向, 序号]：对角的两块一起进场
      const Q: readonly (readonly [number, number, number])[] = [
        [-1, -1, 0],
        [1, 1, 1],
        [1, -1, 2],
        [-1, 1, 3],
      ]
      const ek = (k: number) => oQuint(stg(p, k < 2 ? 0 : 1, 0.2))
      const place = (x: TextItem, k: number): TextItem => {
        const [sx, sy] = Q[k]
        const e = ek(k)
        const o: TextItem = { ...x }
        moveLocal(o, sx * D * (1 - e), sy * D * (1 - e))
        o.rot = (x.rot || 0) + dir * sx * sy * 9 * (1 - e)
        return o
      }
      const quad = (ctx: CanvasRenderingContext2D, b: ItemBox, k: number, ov = 0): void => {
        const [sx, sy] = Q[k]
        ctx.rect(
          sx < 0 ? b.cx - big : b.cx - ov,
          sy < 0 ? b.cy - big : b.cy - ov,
          big + ov,
          big + ov,
        )
      }
      it.alpha = (it.alpha ?? 1) * clamp(p * 5)
      // 已经拼合：整行一次画完
      if (ek(0) > 0.9995 && ek(2) > 0.9995) return
      const m = place(it, 0)
      const dX = m.x - it.x
      const dY = m.y - it.y
      const dR = (m.rot || 0) - (it.rot || 0)
      it.x = m.x
      it.y = m.y
      it.rot = m.rot
      clipLocal(it, (ctx, b) => quad(ctx, b, 0))
      addPre(it, (env2, x) => {
        const rest: TextItem = {
          ...x,
          x: x.x - dX,
          y: x.y - dY,
          rot: (x.rot || 0) - dR,
        }
        for (let k = 1; k < 4; k++) {
          const o = place(rest, k)
          const ctx = env2.ctx
          ctx.save()
          ctx.beginPath()
          ctx.save()
          toLocal(ctx, o)
          quad(ctx, box(o), k, 1.2 / (env2.scale || 1))
          ctx.restore()
          ctx.clip()
          copyDraw(env2, o, null, null)
          ctx.restore()
        }
      })
    },
  },

  /** 反白块：一块实色擦过、把字反白抠出来，随后整块退掉只留本色字 */
  invertBox: {
    w: 0.9,
    tags: ['graphic', 'editorial', 'pop'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(env, it, p) {
      const size = it.size
      const m = size * 0.16
      const bg = pick(env.sc.bg)
      const e1 = oQuart(p / 0.34)
      const e2 = ioQuart((p - 0.42) / 0.55)
      const blk = (b: ItemBox) => ({
        x0: b.x0 - m,
        y0: lerp(b.y0 - m, b.y1 + m, e2),
        x1: lerp(b.x0 - m, b.x1 + m, e1),
        y1: b.y1 + m,
      })
      clipLocal(it, (ctx, b) => {
        const B = blk(b)
        if (e2 <= 0) {
          ctx.rect(0, 0, 0, 0)
          return
        }
        // 只留块顶以上：字在块扫过的地方被"抠"出来
        ctx.rect(b.x0 - size * 20, b.y0 - size * 20, b.w + size * 40, B.y0 - (b.y0 - size * 20))
      })
      postLocal(it, (env2, b, x, A) => {
        const B = blk(b)
        if (B.x1 - B.x0 < 0.5 || B.y1 - B.y0 < 0.5) return
        const fill = isHex(x.color) ? x.color : pick(env2.sc.fg)
        env2.rect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0, fill, A, false)
        if (env2.pass !== 'main') return
        const ctx = env2.ctx
        ctx.save()
        ctx.beginPath()
        ctx.rect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0)
        ctx.clip()
        copyDraw(env2, { ...x, x: 0, y: 0, rot: 0, skew: 0 }, null, null, {
          color: bg,
          strokeColor: bg,
          gradient: undefined,
          pattern: undefined,
          shadow: undefined,
          extrude: undefined,
        })
        ctx.restore()
      })
    },
  },

  /** 套印错位：两块半调色版错着位，几下硬跳之后对回正 */
  printRegister: {
    w: 0.9,
    tags: ['graphic', 'pop', 'editorial'],
    inDur: (dur) => clamp(dur * 0.45, 0.2, 0.8),
    apply(env, it, p) {
      const size = it.size
      const seed = cutOf(env).seed | 0
      const plates = [pick(env.sc.accent), pick(env.sc.accent2, env.sc.ghostA, env.sc.accent)]
      const x4 = clamp(p / 0.8) * 4
      const k = Math.min(3, Math.floor(x4))
      const e = p >= 0.8 ? 1 : (k + oBack(clamp((x4 - k) / 0.3), 2.2)) / 4
      const a0 = r(seed, 171) * TAU
      const D = size * 0.42 * (1 - e)
      const off = (j: number): Pt => [
        Math.cos(a0 + (j * TAU) / 3) * D,
        Math.sin(a0 + (j * TAU) / 3) * D,
      ]
      const [mx, my] = off(0)
      it.x += mx
      it.y += my
      it.alpha = (it.alpha ?? 1) * clamp(p * 4)
      if (D < 0.3) return
      const pa = 1 - sstep(0.8, 1, p)
      addPre(it, (env2, x) => {
        if (env2.pass !== 'main') return
        for (let j = 1; j <= 2; j++) {
          const [ox, oy] = off(j)
          const plate = plates[j - 1]
          copyDraw(env2, { ...x, x: x.x - mx + ox, y: x.y - my + oy }, null, null, {
            color: plate,
            strokeColor: plate,
            alpha: clamp(x.alpha ?? 1) * pa,
            pattern: j === 1 ? 'dots' : 'lines',
            patternColor: plate,
            patternBg: undefined,
            gradient: undefined,
            shadow: undefined,
            extrude: undefined,
          })
        }
      })
    },
  },

  /** 预备拍：三层错位副本跟在整行后面，随拍子一层层掉（3、2、1、走） */
  echoCount: {
    w: 0.8,
    tags: ['pop', 'graphic', 'glitch'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      const size = it.size
      const dir = dirOf(env, 181)
      const x4 = clamp(p / 0.88) * 4
      const b = Math.min(3, Math.floor(x4))
      const f = x4 - b
      const n = p >= 0.88 ? 0 : 3 - b
      const punch =
        p >= 1
          ? 0
          : 0.14 * Math.exp(-f * 7) * (p < 0.88 ? 1 : 0) +
            (p >= 0.88 ? 0.1 * Math.exp(-(p - 0.88) * 40) * (1 - sstep(0.9, 0.99, p)) : 0)
      scaleAbout(it, 1 + punch)
      it.alpha = (it.alpha ?? 1) * clamp(p * 10)
      if (n > 0)
        it.echo = {
          n,
          dx: dir * size * 0.16,
          dy: size * 0.11,
          a: 0.75,
          decay: 0.72,
          color: pick(env.sc.accent, env.sc.sub),
        }
    },
  },

  /** 水位上升：每个字像一只杯子，液面带着微波从极细描边里涨上来 */
  liquidFill: {
    w: 0.9,
    tags: ['emotional', 'calm', 'pop'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      const size = it.size
      const t = env.ltb
      const ph = r(cutOf(env).seed | 0, 201) * TAU
      const col = colOf(it)
      const e = E.inOutSine(clamp(p / 0.94))
      const amp = size * 0.08 * (1 - sstep(0.75, 1, p))
      const kx = TAU / (size * 1.7)
      /** 液面折线：回调拿到 (x, y, 序号)，返回横向余量 */
      const surface = (b: ItemBox, fn: (x: number, y: number, k: number) => void): number => {
        const m = size * 0.3
        const lvl = lerp(b.y1 + m, b.y0 - m - amp * 2, e)
        const n = clamp(Math.ceil((b.w + m * 2) / (size * 0.12)), 8, 90)
        for (let k = 0; k <= n; k++) {
          const x = b.x0 - m + ((b.w + m * 2) * k) / n
          const y =
            lvl + amp * Math.sin(x * kx + t * 7 + ph) + amp * 0.45 * Math.sin(x * kx * 2.3 - t * 5)
          fn(x, y, k)
        }
        return m
      }
      clipLocal(it, (ctx, b) => {
        let x1 = 0
        const m = surface(b, (x, y, k) => {
          if (k) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
          x1 = x
        })
        ctx.lineTo(x1, b.y1 + m + size * 20)
        ctx.lineTo(b.x0 - m, b.y1 + m + size * 20)
        ctx.closePath()
      })
      const oa = clamp(p * 6) * (1 - sstep(0.8, 1, p))
      if (it.fill === false || oa <= 0.01) return
      addPre(it, (env2, x) => {
        if (env2.pass !== 'main') return
        // 杯子的轮廓：本色描边，随水位升高淡出
        copyDraw(env2, x, null, null, {
          fill: false,
          stroke: Math.max(1, size * 0.014),
          strokeColor: isHex(x.color) ? x.color : col,
          alpha: clamp(x.alpha ?? 1) * 0.45 * oa,
          shadow: undefined,
          extrude: undefined,
          gradient: undefined,
          pattern: undefined,
        })
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const pts: Pt[] = []
        surface(b, (x, y) => pts.push([x, y]))
        const lw = Math.max(1.5, size * 0.025)
        env2.line(pts, env2.sc.accent, lw, A * oa * (e > 0.02 ? 1 : 0), false)
      })
    },
  },

  /** 乘风：笔画像被一阵风从一侧吹来，落定前像叶子一样打晃 */
  windBlown: {
    w: 0.8,
    tags: ['emotional', 'calm'],
    pieces: true,
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(env, it, p) {
      if (p >= 1) return
      const dir = dirOf(env, 191)
      const seed = seedOf(it)
      const size = it.size
      const N = Math.max(1, layoutText(it).N)
      const D = env.W * 0.3 + size * 2
      // 描边项 / 渐变项没有碎片可吹，退化成整字飘进来
      if (it.fill === false || it.gradient) {
        glyphs(it, (i, _g, n) => {
          const q = stg(p, dir > 0 ? ordRL(i, n) : ordLR(i, n), 0.5)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const k = 1 - oCubic(q)
          const ph = r(seed, i, 193) * TAU
          return {
            dx: -dir * D * k,
            dy: Math.sin(ph + k * 6) * 0.5 * size * k,
            rot: Math.sin(ph * 2 + k * 7) * 120 * k,
            a: clamp(q * 4),
          }
        })
        return
      }
      pushPiece(it, (ci, pj) => {
        const o = N > 1 ? (dir > 0 ? 1 - ci / (N - 1) : ci / (N - 1)) : 0
        const q = stg(p, 0.55 * o + 0.45 * r(seed, ci, pj, 192), 0.55)
        if (q <= 0) return null
        if (q >= 1) return PIECE_IDLE
        const k = 1 - oCubic(q)
        const ph = r(seed, ci, pj, 193) * TAU
        const dx = -dir * D * k * (0.8 + 0.4 * r(seed, ci, pj, 194))
        const dy = (Math.sin(ph + k * 6) * 0.55 - 0.5 * rs(seed, ci, pj, 195)) * size * k
        return pt(dx, dy, Math.sin(ph * 2 + k * 7) * 170 * k, 1 - 0.3 * k, 1, 0, clamp(q * 4))
      })
    },
  },

  /** 一画一画：每个字像手写那样，从左上往右下一笔一笔写出来 */
  strokeOrder: {
    w: 0.9,
    tags: ['calm', 'emotional', 'editorial'],
    pieces: true,
    minDur: 0.6,
    inDur: (dur, n) => clamp(0.3 + n * 0.06, 0.4, Math.max(0.4, Math.min(1.2, dur * 0.6))),
    apply(_env, it, p) {
      if (p >= 1) return
      const N = Math.max(1, layoutText(it).N)
      const size = it.size
      if (it.fill === false || it.gradient) {
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.6)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return { a: E.inOutSine(q), s: lerp(1.15, 1, oCubic(q)) }
        })
        return
      }
      pushPiece(it, (ci, _pj, pc) => {
        const gq = stg(p, N > 1 ? ci / (N - 1) : 0, N > 1 ? 0.6 : 0)
        // 碎片在字内的位置决定先后：先左上后右下
        const kp = clamp((pc.cy + 0.5) * 0.62 + (pc.cx + 0.5) * 0.38)
        const u = clamp((gq - kp * 0.72) / 0.28)
        if (u <= 0) return null
        if (u >= 1) return PIECE_IDLE
        const s = lerp(1.3, 1, oBack(u, 1.8))
        return pt(0, -(1 - oCubic(u)) * size * 0.04, 0, s, 1, 0, clamp(u * 3))
      })
    },
  },

  /** 顺时针：一根时针绕过每个字的中心，扫过之处把字揭开 */
  clockWipe: {
    w: 0.9,
    tags: ['graphic', 'pop', 'editorial'],
    apply(_env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const seed = seedOf(it)
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.5)
      const geo = (g: LaidGlyph, q: number) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        return {
          gx,
          gy,
          R: Math.hypot(g.w * isx, g.h * isy) * 0.55 + size * 0.05,
          a0: -PI / 2,
          sw: E.inOutSine(q) * TAU,
          cw: r(seed, g.i, 211) < 0.5,
        }
      }
      clipLocal(it, (ctx, b) => {
        const n = b.lay.N
        let any = false
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const q = qf(g.i, n)
          if (q <= 0) continue
          const G = geo(g, q)
          if (q >= 1) {
            ctx.rect(G.gx - G.R, G.gy - G.R, G.R * 2, G.R * 2)
            any = true
            continue
          }
          ctx.moveTo(G.gx, G.gy)
          if (G.cw) ctx.arc(G.gx, G.gy, G.R, G.a0, G.a0 + G.sw)
          else ctx.arc(G.gx, G.gy, G.R, G.a0 - G.sw, G.a0)
          ctx.closePath()
          any = true
        }
        if (!any) ctx.rect(0, 0, 0, 0)
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const n = b.lay.N
        const lw = Math.max(1.5, size * 0.028)
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const q = qf(g.i, n)
          if (q <= 0 || q >= 1) continue
          const G = geo(g, q)
          const an = G.a0 + (G.cw ? G.sw : -G.sw)
          const a = A * (1 - sstep(0.8, 1, q)) * clamp(q * 8)
          const tip: Pt = [G.gx + Math.cos(an) * G.R * 0.9, G.gy + Math.sin(an) * G.R * 0.9]
          env2.line([[G.gx, G.gy], tip], env2.sc.accent, lw, a, false)
          env2.circle(G.gx, G.gy, lw * 1.3, env2.sc.accent, null, 1, a, false)
        }
      })
    },
  },

  /** 先落影子：每个字的影子先着地，字再从镜头上方直直落到影子上 */
  shadowFirst: {
    w: 0.9,
    tags: ['pop', 'graphic', 'emotional'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.48, 0.22, 0.85),
    apply(env, it, p) {
      const size = it.size
      const bg = pick(env.sc.bg)
      const sh = mix(bg, lum(bg) < 0.5 ? pick(env.sc.fg) : '#000000', 0.28)
      const tL = 0.72
      const qf = (i: number, n: number) => stg(p, ordLR(i, n), 0.45)
      const main = glyphs(it, (i, _g, n) => {
        const q = qf(i, n)
        if (q <= 0.12) return HIDE
        if (q >= 1) return null
        if (q < tL) {
          const e = E.inQuad((q - 0.12) / (tL - 0.12))
          return {
            s: lerp(1.75, 1, e),
            dx: -size * 0.22 * (1 - e),
            dy: -size * 0.34 * (1 - e),
            a: clamp((q - 0.12) * 4),
          }
        }
        const u = (q - tL) / (1 - tL)
        return { s: 1 - 0.07 * Math.sin(PI * u) * (1 - u) }
      })
      addPre(it, (env2, x) => {
        copyDraw(
          env2,
          x,
          main,
          (i, _g, n) => {
            const q = qf(i, n)
            if (q <= 0 || q >= tL + 0.05) return HIDE
            const e = clamp(q / tL)
            return {
              color: sh,
              s: lerp(0.55, 1, E.inQuad(e)),
              a: clamp(q * 5) * 0.85,
              blur: size * 0.05 * (1 - e),
            }
          },
          {
            color: sh,
            strokeColor: sh,
            gradient: undefined,
            pattern: undefined,
            shadow: undefined,
            extrude: undefined,
          },
        )
      })
    },
  },

  /** 气泡：字泡在肥皂泡里晃着上浮，泡破的那一刻以完整大小弹出来 */
  bubbles: {
    w: 0.8,
    tags: ['pop', 'emotional', 'calm'],
    minDur: 0.55,
    inDur: (dur) => clamp(dur * 0.5, 0.25, 0.9),
    apply(_env, it, p) {
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const seed = seedOf(it)
      const tP = 0.68
      const st = (i: number, n: number) => {
        const q = stg(p, 0.5 * r(seed, i, 221) + 0.5 * ordLR(i, n), 0.45)
        const f = clamp(q / tP)
        const ph = r(seed, i, 222) * TAU
        return {
          q,
          dx: Math.sin(ph + f * 9) * size * 0.1 * (1 - f),
          dy: size * 1.7 * (1 - oCubic(f)),
        }
      }
      glyphs(it, (i, _g, n) => {
        const S = st(i, n)
        if (S.q <= 0) return HIDE
        if (S.q >= 1) return null
        if (S.q < tP) return { dx: S.dx, dy: S.dy, s: 0.68, a: clamp(S.q * 6) }
        return { s: lerp(0.68, 1, oBack((S.q - tP) / (1 - tP), 2.6)) }
      })
      if (!isMain(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const n = b.lay.N
        const lw = Math.max(1.2, size * 0.018)
        for (const g of b.lay) {
          if (isBlank(g.ch)) continue
          const S = st(g.i, n)
          if (S.q <= 0 || S.q >= 1) continue
          const [gx, gy] = glyphPos(g, isx, isy)
          const rad = Math.max(g.w * isx, g.h * isy) * 0.5
          if (S.q < tP) {
            const cx = gx + S.dx
            const cy = gy + S.dy
            const a = A * clamp(S.q * 6)
            env2.circle(cx, cy, rad, null, env2.sc.accent, lw, a * 0.85, false)
            // 泡壁上的那道反光
            env2.arc(cx, cy, rad * 0.72, 200, 245, env2.sc.fg, lw * 1.2, a * 0.6, false)
          } else {
            const u = (S.q - tP) / (1 - tP)
            if (u < 0.5)
              env2.circle(
                gx,
                gy,
                rad * (1 + 0.6 * oCubic(u / 0.5)),
                null,
                env2.sc.accent,
                lw * (1 - u),
                A * (1 - u / 0.5),
                false,
              )
          }
        }
      })
    },
  },

  /** 凉粉挤出：整行从一条缝里被挤出来，缝口压扁、出来后才松回去 */
  tokoroten: {
    w: 0.7,
    tags: ['pop', 'graphic'],
    minDur: 0.5,
    inDur: (dur) => clamp(dur * 0.48, 0.22, 0.85),
    apply(_env, it, p) {
      const vert = !!it.vertical
      const isx = it.sx || 1
      const isy = it.sy || 1
      const size = it.size
      const b0 = box(it)
      const U0 = vert ? b0.y0 : b0.x0
      const U1 = vert ? b0.y1 : b0.x1
      const slit = U0 - size * 0.12
      const L = U1 - U0 + size * 0.3
      const off = -(1 - E.inOutSine(clamp(p / 0.9))) * L
      const rel = size * 2
      const km = 0.18
      const c = 1 - sstep(0.55, 1, p)
      /** 挤压系数：缝口是 km，走出 rel 之后回到 1 */
      const kAt = (e: number) => 1 - c * (1 - (km + (1 - km) * clamp(e / rel)))
      /** 挤过 e 之后实际走过的距离 */
      const d = (e: number) => {
        if (e <= 0) return e * (1 - c * (1 - km))
        const seg = Math.min(e, rel)
        const k0 = 1 - c * (1 - km)
        return k0 * seg + ((1 - k0) * seg * seg) / (2 * rel) + Math.max(0, e - rel)
      }
      glyphs(it, (_i, g) => {
        const [gx, gy] = glyphPos(g, isx, isy)
        const u = vert ? gy : gx
        const hu = (vert ? g.h * isy : g.w * isx) / 2
        const e = u + off - slit
        if (e + hu < 0) return HIDE
        if (off >= -0.5 && c <= 0) return null
        const k = Math.max(0.05, kAt(e))
        const du = slit + d(e) - u
        const sq = 1 + 0.3 * (1 - k)
        return vert ? { dy: du, sy: k, sx: sq } : { dx: du, sx: k, sy: sq }
      })
      const m = size * 0.3
      clipLocal(it, (ctx, b) => {
        if (vert) ctx.rect(b.x0 - m * 4, slit, b.w + m * 8, b.h + size * 20)
        else ctx.rect(slit, b.y0 - m * 4, b.w + size * 20, b.h + m * 8)
      })
      if (!isPrimary(it)) return
      postLocal(it, (env2, b, _x, A) => {
        const a = A * clamp(p * 8) * (1 - sstep(0.85, 1, p))
        if (a <= 0.01) return
        const t = Math.max(3, size * 0.07)
        const ext = size * 0.25
        if (vert) env2.rect(b.x0 - ext, slit - t, b.w + ext * 2, t, env2.sc.accent, a, false)
        else env2.rect(slit - t, b.y0 - ext, t, b.h + ext * 2, env2.sc.accent, a, false)
      })
    },
  },
}

export const pack: PackParts = { enter: DEFS }
