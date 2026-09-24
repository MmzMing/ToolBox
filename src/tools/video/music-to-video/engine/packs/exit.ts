/**
 * 部件包 exitHold：36 个出场（exit）+ 20 个待机动作（hold）。
 *
 * 逐条移植自 JIZURA 的 src/11p_exit.js（MIT）：常量、缓动、hash 种子、时长系数
 * 一律照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由 registry 锁定，
 * 不要改名、不要增删。
 *
 * 语义约定：
 * - exit 的 `p` 从 0（静止）走到 1（完全消失）；所有配方最后再套一层"p>=0.998 直接
 *   alpha=0"的保险（与旧项目一致），任何配方收尾都必须真的消失干净；
 * - hold 的 `amt` 是振幅（出场时衰减过），乘以 env.fx.motion 后才起作用，amt=0 时
 *   必须对文字项零改动。
 *
 * 中文适配（见移植契约）：旧项目里的假名/罗马音分支在本包里不涉及；
 * 逐字乱码符号池沿用旧项目的全角符号集（不含假名）。
 */
import type { AnimDef, CharFn, CharT, Env, LaidGlyph, PackParts, PieceT, TextItem } from '../types'
import { PIECE_IDLE } from '../types'
import { itemBands } from '../anim'
import { drawItem, itemBox } from '../draw'
import { layoutText, measure } from '../text-layout'
import { glyphCount } from '../script'
import { DEG, E, TAU, clamp, hash, lerp, mix, noise1, r, rr, rs, smooth } from '../util'

/** 一条切片：[起点, 终点, 位移] */
type Band = readonly [number, number, number]
/** 设计空间矩形 [x, y, w, h] */
type Rect4 = readonly [number, number, number, number]
type Pt = readonly [number, number]
type PostFn = NonNullable<TextItem['post']>
type PreFn = NonNullable<TextItem['pre']>
/** 项目空间包围盒（未旋转） */
type Box = ReturnType<typeof itemBox>
type DBox = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
type LineExt = { li: number; x0: number; x1: number; y0: number; y1: number }

/** 隐藏整个字形：所有逐字函数共用这个返回值 */
const HIDE: CharT = Object.freeze({ hide: true })

/* ============================== 助手 ============================== */

/** PieceT 构造器（旧 J.PT），缺省即静止 */
const pt = (dx = 0, dy = 0, rot = 0, s = 1, st = 1, sdir = 0, a = 1): PieceT => ({
  dx,
  dy,
  rot,
  s,
  st,
  sdir,
  a,
})

/** mix 只吃十六进制色；非 hex（渐变/图案）时只能整色切换 */
const isHex = (c: string | undefined): boolean =>
  typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)

const mixC = (a: string, b: string, t0: number): string => {
  const t = clamp(t0)
  if (t <= 0.002) return a
  if (t >= 0.998) return b
  return isHex(a) && isHex(b) ? mix(a, b, t) : t < 0.5 ? a : b
}

const colOf = (it: TextItem): string => it.color || '#ffffff'

/** 文字项可能来自装饰分支，seed 缺省时与旧代码的 `it.seed | 0` 同样收敛到 0 */
const seedOf = (it: TextItem): number => (it.seed ?? 0) | 0

/** 项目空间 → 设计空间的方向向量（旋转后的"下"） */
const downI = (it: TextItem): [number, number] => {
  const r0 = (it.rot || 0) * DEG
  return [Math.sin(r0), Math.cos(r0)]
}

/** 全局表现强度：motion 滑条折算成 0..1.6 的动作系数 */
const motionK = (env: Env): number => clamp((env.fx?.motion ?? 0.7) / 0.7, 0, 1.6)

const isSp = (ch: string): boolean => ch === ' ' || ch === '\u3000'

/** 度量缓存：同一帧里多个助手共用一次 layoutText */
const layOf = (it: TextItem) => (it._m || (it._m = measure(it))).lay

/** 重新度量并取包围盒（sx/sy/size 可能刚被改过） */
const box = (it: TextItem): Box => {
  it._m = measure(it)
  return itemBox(it)
}

/** 本镜头的字数（空白不算），用于单字项目的错峰 */
const cutN = (env: Env): number => Math.max(1, glyphCount(String(env.cut?.text || '')))

const cutSeed = (env: Env): number => (env.cut ? env.cut.seed | 0 : 0)

/** 同一个镜头内所有项目共享的一次二选一（避免各字各走各的方向） */
const cutBit = (env: Env, k: number): boolean => (hash(cutSeed(env), k, 991) & 1) === 1

/** 错峰窗口：把 [o*spread, o*spread+1-spread] 拉回 0..1 */
const win = (p: number, o: number, spread: number): number => clamp((p - o * spread) / (1 - spread))

const rot2 = (x: number, y: number, a: number): [number, number] => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [x * c - y * s, x * s + y * c]
}

/** 项目空间局部坐标 → 设计空间 */
const toD = (it: TextItem, lx: number, ly: number): [number, number] => {
  const [x, y] = rot2(lx, ly, (it.rot || 0) * DEG)
  return [it.x + x, it.y + y]
}

/**
 * 顺序错峰函数：返回字形 i 在 0..1 上的出场次序。
 * 单字项目（mixed / scatter 一类构图）改用它在 cut 内的序号 mi。
 */
function orderOf(env: Env, it: TextItem): (i: number, n: number) => number {
  const N = cutN(env)
  const mi = it.mi || 0
  return (i, n) => (n > 1 ? i / (n - 1) : N > 1 ? clamp(mi / (N - 1)) : 0)
}

/**
 * 合并逐字函数，保留 drawItem 认得的全部字段
 * （核心 combineChar 会丢掉 clip/skew/blur/outline，出场配方要用就得自己合）。
 */
function merged(fns: CharFn[]): CharFn {
  return (i, g, n) => {
    let o: CharT | null = null
    for (const f of fns) {
      const r0 = f(i, g, n)
      if (!r0) continue
      if (r0.hide) return HIDE
      if (!o) o = { dx: 0, dy: 0, rot: 0, s: 1, a: 1 }
      if (r0.dx) o.dx = (o.dx || 0) + r0.dx
      if (r0.dy) o.dy = (o.dy || 0) + r0.dy
      if (r0.rot) o.rot = (o.rot || 0) + r0.rot
      if (r0.s != null) o.s = (o.s ?? 1) * r0.s
      if (r0.a != null) o.a = (o.a ?? 1) * r0.a
      if (r0.sx != null) o.sx = (o.sx == null ? 1 : o.sx) * r0.sx
      if (r0.sy != null) o.sy = (o.sy == null ? 1 : o.sy) * r0.sy
      if (r0.skew) o.skew = (o.skew || 0) + r0.skew
      if (r0.blur) o.blur = (o.blur || 0) + r0.blur
      if (r0.outline) o.outline = true
      if (r0.ch) o.ch = r0.ch
      if (r0.color) o.color = r0.color
      if (r0.clipX)
        o.clipX = o.clipX
          ? [Math.max(o.clipX[0], r0.clipX[0]), Math.min(o.clipX[1], r0.clipX[1])]
          : r0.clipX
      if (r0.clipY)
        o.clipY = o.clipY
          ? [Math.max(o.clipY[0], r0.clipY[0]), Math.min(o.clipY[1], r0.clipY[1])]
          : r0.clipY
    }
    if (!o) return null
    if ((o.a ?? 1) <= 0.003 || Math.abs(o.s ?? 1) < 0.004) return HIDE
    if (o.sx != null && Math.abs(o.sx) < 0.004) return HIDE
    if (o.sy != null && Math.abs(o.sy) < 0.004) return HIDE
    if ((o.clipX && o.clipX[1] <= o.clipX[0]) || (o.clipY && o.clipY[1] <= o.clipY[0])) return HIDE
    return o
  }
}

/** 压入一个逐字函数，并把项目上已有的函数折成一个全字段函数 */
function addC(it: TextItem, fn: CharFn): void {
  const prev = (it.charFns ??= []).splice(0)
  prev.push(fn)
  it.charFns.push(merged(prev))
}

/** 串接绘制钩子（先原有、后新增） */
function chainPost(it: TextItem, fn: PostFn): void {
  const p0 = it.post
  it.post = (env, it2, bb) => {
    p0?.(env, it2, bb)
    fn(env, it2, bb)
  }
}
function chainPre(it: TextItem, fn: PreFn): void {
  const p0 = it.pre
  it.pre = (env, it2) => {
    p0?.(env, it2)
    fn(env, it2)
  }
}

/** 主体用 mainFn 画，每个 copyFn 在主体之后再画一份副本（折页、描边、四分裂都靠它） */
function withCopies(
  it: TextItem,
  mainFn: CharFn,
  copyFns: CharFn[],
  extra?: Partial<TextItem>,
): void {
  const prev = (it.charFns ??= []).slice()
  const cfs = copyFns.map((f) => merged(prev.concat([f])))
  addC(it, mainFn)
  chainPost(it, (env, it2) => {
    for (const cf of cfs) {
      drawItem(env, {
        ...it2,
        charFn: cf,
        pieceFn: null,
        pre: undefined,
        post: undefined,
        streak: null,
        echo: null,
        ...extra,
      })
    }
  })
}

/** 在项目自身（含旋转）的坐标系里画 */
function inItem(env: Env, it: TextItem, fn: (ctx: CanvasRenderingContext2D) => void): void {
  const ctx = env.ctx
  ctx.save()
  ctx.translate(it.x, it.y)
  if (it.rot) ctx.rotate(it.rot * DEG)
  try {
    fn(ctx)
  } finally {
    ctx.restore()
  }
}

/** 逐行（竖排时逐列）在投影后的包围盒范围 */
function lineExt(it: TextItem): LineExt[] {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const out: LineExt[] = []
  for (const g of lay) {
    if (isSp(g.ch)) continue
    let L = out[g.li]
    if (!L) out[g.li] = L = { li: g.li, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }
    const hw = (it.vertical ? it.size : g.w) / 2
    const hh = (it.vertical ? g.h : it.size) / 2
    L.x0 = Math.min(L.x0, (g.x - hw) * sx)
    L.x1 = Math.max(L.x1, (g.x + hw) * sx)
    L.y0 = Math.min(L.y0, (g.y - hh) * sy)
    L.y1 = Math.max(L.y1, (g.y + hh) * sy)
  }
  return out.filter(Boolean)
}

/** 旋转后的项目包围盒 → 设计空间 AABB（外加 pad） */
function dBox(it: TextItem, pad = 0): DBox {
  const b = box(it)
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1e9
  let y1 = -1e9
  const corners: Pt[] = [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x0, b.y1],
    [b.x1, b.y1],
  ]
  for (const [px, py] of corners) {
    const [X, Y] = toD(it, px - it.x, py - it.y)
    x0 = Math.min(x0, X)
    x1 = Math.max(x1, X)
    y0 = Math.min(y0, Y)
    y1 = Math.max(y1, Y)
  }
  const sk = Math.abs(Math.tan((it.skew || 0) * DEG)) * b.h * 0.5
  return {
    x0: x0 - pad - sk,
    y0: y0 - pad,
    x1: x1 + pad + sk,
    y1: y1 + pad,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  }
}

/** 绕项目空间的某个锚点缩放（默认绕盒心） */
function scaleAbout(it: TextItem, kx: number, ky: number, ax?: number, ay?: number): void {
  let X = ax
  let Y = ay
  if (X == null || Y == null) {
    const b = box(it)
    X = b.cx - it.x
    Y = b.cy - it.y
  }
  const [dx, dy] = rot2(X * (1 - kx), Y * (1 - ky), (it.rot || 0) * DEG)
  it.x += dx
  it.y += dy
  it.sx = (it.sx || 1) * kx
  it.sy = (it.sy || 1) * ky
  it._m = undefined
}

/** 绕盒心缩放字号（位置、字距、字形都跟着走） */
function sizeAbout(it: TextItem, k: number): void {
  const b = box(it)
  const [dx, dy] = rot2((b.cx - it.x) * (1 - k), (b.cy - it.y) * (1 - k), (it.rot || 0) * DEG)
  it.x += dx
  it.y += dy
  it.size *= k
  it._m = undefined
}

/** 绕项目空间的某个点旋转若干度 */
function rotateAbout(it: TextItem, deg: number, ax: number, ay: number): void {
  const r0 = (it.rot || 0) * DEG
  const r1 = r0 + deg * DEG
  const [x0, y0] = rot2(ax, ay, r0)
  const [x1, y1] = rot2(ax, ay, r1)
  it.x += x0 - x1
  it.y += y0 - y1
  it.rot = (it.rot || 0) + deg
}

/**
 * 逐字裁剪窗口：字形被 (dx, dy) 推走时，裁剪框仍钉在项目空间的原位，
 * 于是字"从自己的格子里滑出去"而不是把格子一起带走。
 * kx/ky 是同一个逐字函数另外施加的字形缩放。
 */
function winShift(
  g: LaidGlyph,
  it: TextItem,
  dx: number,
  dy: number,
  kx = 1,
  ky = 1,
): { clipX: readonly [number, number]; clipY: readonly [number, number] } {
  const sx = it.sx || 1
  const sy = it.sy || 1
  const mx = dx ? 0.66 : 1.6
  const my = dy ? 0.66 : 1.6
  if (!g.r90) {
    const fx = dx / (g.w * sx)
    const fy = dy / (g.h * sy)
    return {
      clipX: [(-mx - fx) / kx, (mx - fx) / kx],
      clipY: [(-my - fy) / ky, (my - fy) / ky],
    }
  }
  // 竖排里被旋转 90° 的字形：局部 x 沿项目 +y（按 sx 缩放），局部 y 沿项目 −x（按 sy 缩放）
  const My = my * g.h * sx
  const Mx = mx * g.w * sy
  return {
    clipX: [(-My - dy) / (sx * kx * g.w), (My - dy) / (sx * kx * g.w)],
    clipY: [(-Mx + dx) / (sy * ky * g.h), (Mx + dx) / (sy * ky * g.h)],
  }
}

const beatLen = (env: Env, fb: number): number => (env.beat && env.beat.len ? env.beat.len : fb)
const beatSince = (env: Env, fb: number): number =>
  env.beat ? env.beat.since : ((env.ltb % fb) + fb) % fb
const beatIdx = (env: Env, fb: number): number =>
  env.beat ? env.beat.index : Math.floor(env.ltb / fb)

/** 逐字乱码用的全角符号池（旧包同款，不含假名） */
const POOL = '※◆◇■□▲△▼●○◎＃＊＋×÷＝≠∞§†01／＼＜＞'

/* ============================== 出场 ============================== */

/** 左右滑出：dir 决定流向，靠前的字先走 */
function slideOut(dir: number): AnimDef {
  return {
    w: 0.8,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const b = box(it)
      const dist = env.W + b.w + it.size * 1.5
      const sz = it.size
      addC(it, (i, _g, n) => {
        const o = dir < 0 ? ord(i, n) : 1 - ord(i, n)
        const q = win(p, o, 0.5)
        if (q <= 0) return null
        // 起步前先被"风"吹歪一下
        const wind = q < 0.24 ? Math.sin((q / 0.24) * Math.PI) * sz * 0.07 : 0
        const u = clamp((q - 0.1) / 0.9)
        const v = 3 * u * u
        return {
          dx: dir * (dist * u * u * u - wind),
          sx: 1 + Math.min(1.3, v * 0.45),
          sy: 1 - Math.min(0.28, v * 0.09),
          skew: -dir * Math.min(22, v * 8),
          a: 1 - smooth(0.82, 1, q),
        }
      })
    },
  }
}

const EXIT: Record<string, AnimDef> = {
  /** 沉底：微微上抬后逐字沉到自己的基线以下 */
  sinkMask: {
    w: 1,
    tags: ['calm', 'editorial', 'graphic'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const sy = it.sy || 1
      addC(it, (i, g, n) => {
        const q = win(p, ord(i, n), 0.5)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const d = (E.inOutCubic(q) - 0.06 * Math.sin(Math.PI * clamp(q / 0.3))) * g.h * sy * 1.4
        return { dy: d, ...winShift(g, it, 0, d) }
      })
    },
  },

  /** 上飘：逐字向上脱离，离开时纵向被速度拉长 */
  riseOut: {
    w: 1,
    tags: ['calm', 'emotional', 'editorial'],
    apply(_env, it, p) {
      const seed = seedOf(it)
      const sy = it.sy || 1
      addC(it, (i, g) => {
        const q = win(p, r(seed, i, 201), 0.5)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const d = -Math.pow(q, 2.2) * g.h * sy * 1.5
        const st = 1 + 0.5 * Math.sin(Math.PI * q) * q
        return { dy: d, sy: st, sx: 1 - 0.1 * (st - 1), ...winShift(g, it, 0, d, 1, st) }
      })
    },
  },

  slideOutL: slideOut(-1),

  slideOutR: slideOut(1),

  /** 关门：逐字绕竖轴转 90°，铰链在一侧（方向由镜头种子决定） */
  flipOutX: {
    w: 1,
    tags: ['graphic', 'pop', 'editorial'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const sx0 = it.sx || 1
      const c0 = colOf(it)
      const bg = env.sc.bg
      const dir = cutBit(env, 1) ? 1 : -1
      addC(it, (i, g, n) => {
        const q = win(p, ord(i, n), 0.5)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const th = (E.inQuad(q) * Math.PI) / 2
        const c = Math.cos(th)
        const s = Math.sin(th)
        return {
          sx: c,
          sy: 1 + 0.14 * s,
          dx: dir * (1 - c) * g.w * sx0 * 0.5,
          color: mixC(c0, bg, s * 0.55),
          a: 1 - smooth(0.8, 1, q),
        }
      })
    },
  },

  /** 倒下：绕底边向后翻平，落到基线上 */
  flipOutY: {
    w: 0.9,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const seed = seedOf(it)
      const sy0 = it.sy || 1
      const c0 = colOf(it)
      const bg = env.sc.bg
      addC(it, (i, g) => {
        const q = win(p, r(seed, i, 211), 0.5)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const th = (E.inQuad(q) * Math.PI) / 2
        const c = Math.cos(th)
        const s = Math.sin(th)
        return {
          sy: c,
          sx: 1 - 0.12 * s,
          dy: (1 - c) * g.h * sy0 * 0.5,
          color: mixC(c0, bg, s * 0.6),
        }
      })
    },
  },

  /** 对折：上半向前翻下来压住下半，折完两面都不剩 */
  foldOut: {
    w: 0.9,
    tags: ['graphic', 'editorial'],
    outDur: (dur) => clamp(dur * 0.34, 0.28, 0.65),
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const back = mixC(colOf(it), env.sc.accent, 0.75)
      const Q = (i: number, n: number) => win(p, ord(i, n), 0.3)
      const bottom: CharFn = (i, _g, n) => {
        const q = Q(i, n)
        if (q >= 1) return HIDE
        const b = clamp((q - 0.5) / 0.5)
        return {
          clipY: [0, 1.2],
          sy: Math.cos(E.inQuad(b) * (Math.PI / 2)),
          a: 1 - smooth(0.85, 1, q),
        }
      }
      const top: CharFn = (i, _g, n) => {
        const q = Q(i, n)
        if (q >= 1) return HIDE
        const a = E.inOutSine(clamp(q / 0.5))
        const b = clamp((q - 0.5) / 0.5)
        // 1 → −1（折下来翻面）→ 0（压平消失）
        const sy = Math.cos(a * Math.PI) * Math.cos(E.inQuad(b) * (Math.PI / 2))
        return {
          clipY: [-1.2, 0.012],
          sy,
          color: sy < 0 ? back : undefined,
          a: 1 - smooth(0.85, 1, q),
        }
      }
      withCopies(it, bottom, [top])
    },
  },

  /** 挤扁：整行压成一条亮线再收成一个亮点（老 CRT 关机） */
  squash: {
    w: 0.9,
    tags: ['glitch', 'pop', 'graphic'],
    apply(env, it, p) {
      const b0 = box(it)
      const sz = it.size
      const col = colOf(it)
      const N = cutN(env)
      const single = layOf(it).N === 1 && N > 1
      const a1 = clamp(p / 0.42)
      const a2 = clamp((p - 0.4) / 0.45)
      const ky = 1 - 0.97 * E.inCubic(a1)
      const kx = (1 + 0.08 * E.outCubic(a1)) * (1 - E.inOutCubic(a2))
      if (single) {
        // 一字一项：整行朝画面中心收拢
        it.x = lerp(it.x, env.W / 2, E.inOutCubic(a2))
        scaleAbout(it, 1 + 0.08 * E.outCubic(a1), ky)
        it.alpha = (it.alpha ?? 1) * (1 - smooth(0.7, 0.9, p))
      } else if (kx > 0.01) scaleAbout(it, kx, ky)
      else it.alpha = 0
      const c: [number, number] = single ? [env.W / 2, it.y] : toD(it, b0.cx - it.x, b0.cy - it.y)
      const dotA = smooth(0.6, 0.8, p) * (1 - smooth(0.88, 1, p))
      if (dotA > 0.01 && (!single || Math.round(it.mi || 0) === Math.floor((N - 1) / 2))) {
        const dr = sz * 0.08
        chainPost(it, (env2) => {
          env2.circle(c[0], c[1], dr, col, null, 0, dotA, true)
          env2.rect(
            c[0] - dr * 5 * (1 - a2 * 0.5),
            c[1] - dr * 0.12,
            dr * 10 * (1 - a2 * 0.5),
            dr * 0.24,
            col,
            dotA * 0.8,
            false,
          )
        })
      }
    },
  },

  /** 字距张开：字符沿阅读轴被拉开、同时变细，末段整项糊掉 */
  trackOutWide: {
    w: 1,
    tags: ['calm', 'emotional', 'editorial'],
    apply(env, it, p) {
      const b = box(it)
      const ox = b.cx - it.x
      const oy = b.cy - it.y
      const sx = it.sx || 1
      const sy = it.sy || 1
      const vert = !!it.vertical
      const k = E.inQuad(p) * 1.6 + p * 0.3
      const thin = 1 - 0.6 * E.inQuad(p)
      addC(it, (_i, g) =>
        vert ? { dy: (g.y * sy - oy) * k, sy: thin } : { dx: (g.x * sx - ox) * k, sx: thin },
      )
      if (layOf(it).N === 1 && cutN(env) > 1) {
        // 单字项目朝画面中心之外漂移
        it.x += (it.x - env.W / 2) * k * 0.7
        it.y += (it.y - env.H / 2) * k * 0.4
      }
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.2, 1, p))
      // 模糊只在主画层做，色散层再加一次只是浪费
      if (env.pass === 'main')
        it.blur =
          (it.blur || 0) + Math.min(E.inQuad(p) * it.size * 0.035, Math.min(env.W, env.H) * 0.012)
    },
  },

  /** 吸入：向心差分旋转，越靠外转得越慢，拧成一条螺旋转轴心 */
  collapse: {
    w: 0.9,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const dir = cutBit(env, 2) ? 1 : -1
      const rk = 1 - E.inQuad(p)
      const turn = dir * E.inQuad(p) * DEG
      const sc = Math.max(0.02, 1 - E.inQuad(p) * 0.94)
      const spiral = (px: number, py: number, R: number): [number, number, number] => {
        const phi = turn * (140 + 220 * (1 - clamp(Math.hypot(px, py) / R)))
        const c = Math.cos(phi)
        const s = Math.sin(phi)
        return [(px * c - py * s) * rk, (px * s + py * c) * rk, phi]
      }
      if (layOf(it).N === 1 && cutN(env) > 1) {
        // 单字项目整体被旋进画面中心
        const px = it.x - env.W / 2
        const py = it.y - env.H / 2
        const [nx, ny, phi] = spiral(px, py, Math.max(env.W, env.H) * 0.5)
        it.x = env.W / 2 + nx
        it.y = env.H / 2 + ny
        it.rot = (it.rot || 0) + phi / DEG
        it.size *= sc
        it._m = undefined
      } else {
        const b = box(it)
        const ox = b.cx - it.x
        const oy = b.cy - it.y
        const sx = it.sx || 1
        const sy = it.sy || 1
        const R = Math.max(1, Math.hypot(b.w, b.h) * 0.5)
        addC(it, (_i, g) => {
          const px = g.x * sx - ox
          const py = g.y * sy - oy
          const [nx, ny, phi] = spiral(px, py, R)
          return { dx: nx - px, dy: ny - py, rot: phi / DEG, s: sc }
        })
      }
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.8, 1, p))
    },
  },

  /** 冲出画面：字号朝观察者放大，配一层越缩越淡的回声 */
  zoomThrough: {
    w: 1,
    tags: ['emotional', 'pop'],
    apply(env, it, p) {
      const sz0 = it.size
      const single = layOf(it).N === 1 && cutN(env) > 1
      const maxK = Math.max(1.3, (Math.max(env.W, env.H) * (single ? 0.8 : 1.6)) / Math.max(1, sz0))
      const k = Math.min(maxK, 1 + 4.5 * E.inCubic(p) + 0.25 * p)
      if (single) {
        const kk = 1 + 4.5 * E.inCubic(p) + 0.25 * p
        it.x = env.W / 2 + (it.x - env.W / 2) * kk
        it.y = env.H / 2 + (it.y - env.H / 2) * kk
      }
      sizeAbout(it, k)
      const a = 1 - smooth(0.3, 0.88, p)
      it.alpha = (it.alpha ?? 1) * a
      if (a > 0.01)
        it.echo = { n: 3, dx: 0, dy: 0, scale: 0.84, a: 0.45 * smooth(0, 0.25, p), decay: 0.62 }
    },
  },

  /** 推向远处：朝画面上方的消失点退去，留下描边回声 */
  zoomFar: {
    w: 1,
    tags: ['emotional', 'calm'],
    apply(env, it, p) {
      const sz0 = it.size
      const e = 1 - Math.pow(1 - p, 2.6) // 退得快、停得缓
      sizeAbout(it, 1 - 0.9 * e)
      if (layOf(it).N === 1 && cutN(env) > 1) {
        it.x = lerp(it.x, env.W / 2, e * 0.85)
        it.y = lerp(it.y, env.H / 2, e * 0.85)
      }
      it.y -= sz0 * 0.35 * e
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.5, 1, p))
      it.echo = {
        n: 3,
        dx: 0,
        dy: sz0 * 0.06 * e,
        scale: 1.2,
        a: 0.6 * smooth(0, 0.2, p),
        decay: 0.62,
        outline: true,
      }
    },
  },

  /** 自转消散：逐字自转缩小，中途先拱起一下再消失 */
  spinOut: {
    w: 0.9,
    tags: ['pop'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const dir = cutBit(env, 3) ? 1 : -1
      const sy = it.sy || 1
      addC(it, (i, g, n) => {
        const q = win(p, ord(i, n), 0.45)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const e = E.inCubic(q)
        return {
          rot: dir * (i % 2 ? 1 : 0.8) * 250 * E.inQuad(q),
          s: Math.max(0.01, 1 - e),
          dy: -Math.sin(Math.PI * q) * g.h * sy * 0.18,
          a: 1 - smooth(0.8, 1, q),
        }
      })
    },
  },

  /** 拧带：沿阅读轴加相位差，整行像一条被拧转的缎带，最后转到只剩侧面 */
  twist: {
    w: 0.8,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const vert = !!it.vertical
      const back = mixC(colOf(it), env.sc.bg, 0.5)
      const flat = 1 - E.inQuad(clamp((p - 0.55) / 0.45))
      const e = Math.pow(p, 1.3)
      addC(it, (i, _g, n) => {
        const th = e * (0.5 + 2 * ord(i, n)) * Math.PI
        const c = Math.cos(th) * flat
        const t: CharT = {
          color: c < 0 ? back : undefined,
          skew: vert ? 0 : Math.sin(th) * 12 * flat,
        }
        if (vert) t.sx = c
        else t.sy = c
        return t
      })
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.9, 1, p))
    },
  },

  /** 浪涌：逐字被一道浪掀起来再抛出去 */
  waveOut: {
    w: 0.9,
    tags: ['pop', 'emotional'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const sz = it.size
      addC(it, (i, _g, n) => {
        const q = win(p, ord(i, n), 0.55)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const A = sz * 0.42
        return {
          dy: -Math.sin(q * Math.PI) * A + q * q * A * 2.6,
          dx: q * A * 0.6,
          rot: Math.sin(q * Math.PI * 1.5) * 28 + q * 30,
          a: 1 - smooth(0.45, 1, q),
        }
      })
    },
  },

  /** 逐字失焦：每个字各自糊开、上浮、放大后淡掉 */
  blurOutStagger: {
    w: 1,
    tags: ['calm', 'emotional'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const sz = it.size
      const bmax = env.pass === 'main' ? Math.min(sz * 0.09, Math.min(env.W, env.H) * 0.02) : 0
      addC(it, (i, _g, n) => {
        const q = win(p, ord(i, n), 0.55)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const e = E.inOutSine(q)
        return { blur: e * bmax, a: 1 - q, dy: -e * sz * 0.12, s: 1 + e * 0.22 }
      })
    },
  },

  /** 回到线条：先只剩描边，再用虚线收尾（笔画被倒着擦掉） */
  undraw: {
    w: 1,
    tags: ['editorial', 'calm', 'graphic'],
    outDur: (dur) => clamp(dur * 0.36, 0.25, 0.7),
    apply(_env, it, p) {
      const a = clamp(p / 0.3)
      const b = clamp((p - 0.24) / 0.76)
      it.stroke = Math.max(it.stroke || 0, it.size * 0.022)
      if (!it.strokeColor) it.strokeColor = colOf(it)
      it.fillAlpha = (it.fillAlpha ?? 1) * (1 - E.inOutSine(a))
      if (b > 0) it.dash = Math.max(0.002, 1 - E.inOutSine(b))
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.9, 1, p))
    },
  },

  /** 涂色漏光：填充像水位一样从顶上漏干，只剩描边闪一下再消失 */
  outlineOut: {
    w: 0.9,
    tags: ['graphic', 'emotional'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const lw = Math.max(1, it.size * 0.024)
      const acc = env.sc.accent
      const Q = (i: number, n: number) => win(p, ord(i, n), 0.35)
      const fill: CharFn = (i, _g, n) => {
        const q = Q(i, n)
        if (q <= 0) return null
        const k = E.inOutSine(clamp(q / 0.7))
        if (k >= 0.999) return HIDE
        return { clipY: [-0.72 + 1.44 * k, 1.2] }
      }
      const line: CharFn = (i, _g, n) => {
        const q = Q(i, n)
        if (q <= 0 || q >= 1) return HIDE
        const u = clamp((q - 0.68) / 0.32)
        return { outline: true, s: 1 + 0.3 * E.outCubic(u), a: Math.min(1, q * 8) * (1 - u) }
      }
      withCopies(it, fill, [line], { stroke: lw, strokeColor: acc, fill: true })
    },
  },

  /** 光圈收缩：以盒心为圆心的圆形裁剪窗越收越小，边上描一道亮环 */
  irisClose: {
    w: 1,
    tags: ['graphic', 'pop', 'editorial'],
    apply(env, it, p) {
      const b = box(it)
      const c = toD(it, b.cx - it.x, b.cy - it.y)
      const R0 = Math.hypot(b.w, b.h) * 0.5 + it.size * 0.12
      const rad = R0 * (1 - E.inOutCubic(p))
      if (rad < 0.5) {
        it.alpha = 0
        return
      }
      it.clipFn = (ctx) => {
        ctx.moveTo(c[0] + rad, c[1])
        ctx.arc(c[0], c[1], rad, 0, TAU)
      }
      const lw = Math.max(1.5, it.size * 0.035)
      const acc = env.sc.accent
      const a = Math.min(1, p * 6) * (1 - smooth(0.9, 1, p))
      chainPost(it, (env2) => env2.circle(c[0], c[1], rad + lw * 0.5, null, acc, lw, a, false))
    },
  },

  /** 斜向擦除：整个镜头共用同一条斜边（方向由镜头种子决定），边后留下亮条 */
  diagWipeOut: {
    w: 1,
    tags: ['graphic', 'editorial'],
    apply(env, it, p) {
      const bb = dBox(it, it.size * 0.15)
      const v = (hash(cutSeed(env), 77) >>> 3) & 3
      const W = env.W
      const H = env.H
      const ang = [22, -22, 158, 202][v] * DEG
      const d: Pt = [Math.cos(ang), Math.sin(ang)]
      const t: Pt = [-d[1], d[0]]
      const cs: Pt[] = [
        [bb.x0, bb.y0],
        [bb.x1, bb.y0],
        [bb.x0, bb.y1],
        [bb.x1, bb.y1],
        [0, 0],
        [W, 0],
        [0, H],
        [W, H],
      ]
      const us = cs.map((q) => q[0] * d[0] + q[1] * d[1])
      const ws = cs.slice(4).map((q) => q[0] * t[0] + q[1] * t[1])
      const u0 = Math.min(...us)
      const u1 = Math.max(...us)
      const w0 = Math.min(...ws)
      const w1 = Math.max(...ws)
      const th = Math.max(2, Math.min(W, H) * 0.011)
      const s = lerp(u0 - th, u1 + th, E.inOutCubic(p))
      if (p >= 0.999) {
        it.alpha = 0
        return
      }
      const L = (W + H) * 3
      const at = (u: number, w: number): Pt => [d[0] * u + t[0] * w, d[1] * u + t[1] * w]
      it.clipFn = (ctx) => {
        const a = at(s, w0 - L)
        const b2 = at(s, w1 + L)
        const c = at(s + L, w1 + L)
        const e = at(s + L, w0 - L)
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b2[0], b2[1])
        ctx.lineTo(c[0], c[1])
        ctx.lineTo(e[0], e[1])
        ctx.closePath()
      }
      // 亮条只画一次（交给本镜头的第一个项目）
      if (Math.abs(it.mi || 0) < 1e-6) {
        const acc = env.sc.accent
        const pad = Math.max(W, H) * 0.1
        chainPost(it, (env2) =>
          env2.poly(
            [at(s - th, w0 - pad), at(s, w0 - pad), at(s, w1 + pad), at(s - th, w1 + pad)],
            acc,
            1,
            false,
          ),
        )
      }
    },
  },

  /** 百叶窗：把包围盒切成横（竖排切竖）叶片，从阅读起点依次闭拢 */
  blindsClose: {
    w: 0.9,
    tags: ['graphic', 'editorial'],
    apply(_env, it, p) {
      const bb = dBox(it, it.size * 0.2)
      const vert = !!it.vertical
      const span = vert ? bb.x1 - bb.x0 : bb.y1 - bb.y0
      const cnt = clamp(Math.ceil(span / Math.max(4, it.size * 0.26)), 2, 90)
      const pitch = span / cnt
      const hs: number[] = []
      let any = false
      for (let j = 0; j < cnt; j++) {
        const h = pitch * (1 - Math.pow(win(p, cnt > 1 ? j / (cnt - 1) : 0, 0.4), 0.85))
        hs.push(h)
        if (h > 0.05) any = true
      }
      if (!any) {
        it.alpha = 0
        return
      }
      it.clipFn = (ctx) => {
        for (let j = 0; j < cnt; j++) {
          const h = hs[j]
          if (h <= 0.05) continue
          if (vert) ctx.rect(bb.x0 + j * pitch + (pitch - h) / 2, bb.y0, h, bb.y1 - bb.y0)
          else ctx.rect(bb.x0, bb.y0 + j * pitch + (pitch - h) / 2, bb.x1 - bb.x0, h)
        }
      }
    },
  },

  /** 市松：方格棋盘按对角线错峰缩没，另一色格先走 */
  checkerOut: {
    w: 0.8,
    tags: ['graphic', 'glitch'],
    apply(_env, it, p) {
      const bb = dBox(it, it.size * 0.15)
      const w = bb.x1 - bb.x0
      const h = bb.y1 - bb.y0
      let cell = Math.max(4, it.size * 0.26)
      while ((w / cell) * (h / cell) > 420) cell *= 1.25
      const nx = Math.ceil(w / cell)
      const ny = Math.ceil(h / cell)
      const dg = Math.max(1, nx + ny - 2)
      const cells: Band[] = []
      let any = false
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const st = ((x + y) & 1) * 0.42 + ((x + y) / dg) * 0.3
          const k = 1 - E.inQuad(clamp((p - st) / 0.28))
          if (k > 0.02) {
            any = true
            cells.push([
              bb.x0 + (x + 0.5) * cell,
              bb.y0 + (y + 0.5) * cell,
              cell * k + (k > 0.98 ? 0.8 : 0),
            ])
          }
        }
      if (!any) {
        it.alpha = 0
        return
      }
      it.clipFn = (ctx) => {
        for (const [cx, cy, s] of cells) ctx.rect(cx - s / 2, cy - s / 2, s, s)
      }
    },
  },

  /** 上下裂开：先裂一条发丝缝，两半各自弹开并压扁，缝里透出一条亮线 */
  splitApart: {
    w: 1,
    tags: ['graphic', 'pop'],
    apply(env, it, p) {
      const vert = !!it.vertical
      const sz = it.size
      const crack = clamp(p / 0.2)
      const u = clamp((p - 0.16) / 0.84)
      const e = E.outCubic(u)
      const off = crack * sz * 0.03 + sz * 0.75 * e
      const a = 1 - smooth(0.35, 1, u)
      const sq = 1 - 0.35 * e
      const half =
        (sgn: number): CharFn =>
        () =>
          vert
            ? {
                clipX: sgn < 0 ? [-1.6, 0.012] : [0, 1.6],
                dx: sgn * off,
                dy: sgn * off * 0.3,
                sx: sq,
                a,
              }
            : {
                clipY: sgn < 0 ? [-1.6, 0.012] : [0, 1.6],
                dy: sgn * off,
                dx: sgn * off * 0.3,
                sy: sq,
                a,
              }
      withCopies(it, half(-1), [half(1)])
      const fl = clamp(p / 0.2) * (1 - smooth(0.55, 1, p))
      if (fl > 0.02) {
        const lines = lineExt(it)
        const acc = env.sc.accent
        const lw = Math.max(1.5, sz * (0.02 + 0.05 * e))
        const pad = sz * (0.15 + 0.5 * e)
        chainPost(it, (env2, it2) =>
          inItem(env2, it2, () => {
            for (const L of lines) {
              if (vert) {
                const x = (L.x0 + L.x1) / 2
                env2.rect(x - lw / 2, L.y0 - pad, lw, L.y1 - L.y0 + pad * 2, acc, fl, false)
              } else {
                const y = (L.y0 + L.y1) / 2
                env2.rect(L.x0 - pad, y - lw / 2, L.x1 - L.x0 + pad * 2, lw, acc, fl, false)
              }
            }
          }),
        )
      }
    },
  },

  /** 纵条下落：切成竖条各自先微抬再坠出画面 */
  vSliceDrop: {
    w: 0.9,
    tags: ['graphic', 'glitch'],
    outDur: (dur) => clamp(dur * 0.34, 0.25, 0.62),
    apply(env, it, p) {
      const bb = dBox(it, it.size * 0.35)
      const seed = seedOf(it)
      const w = bb.x1 - bb.x0
      const n = clamp(Math.round(w / (it.size * 0.24)), 4, 14)
      const D = env.H - bb.y0 + it.size
      const out: Band[] = []
      for (let k = 0; k < n; k++) {
        const d0 = r(seed, k, 301) * 0.45
        const q = clamp((p - d0) / 0.55)
        const dy = (q * q * 1.05 - Math.sin(Math.PI * clamp(q / 0.25)) * 0.012) * D
        out.push([bb.x0 + (k * w) / n, bb.x0 + ((k + 1) * w) / n + 0.6, dy])
      }
      it.vbands = out
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.95, 1, p))
    },
  },

  /** 熔化：整项往下拉长，再切成竖条按噪声滴落，颜色被烤成强调色 */
  melt: {
    w: 0.8,
    tags: ['emotional', 'glitch'],
    outDur: (dur) => clamp(dur * 0.4, 0.3, 0.8),
    minDur: 0.9,
    apply(env, it, p) {
      const b0 = box(it)
      const seed = seedOf(it)
      const sz = it.size
      // 锚在顶边往下拽
      scaleAbout(it, 1 - 0.05 * p, 1 + 0.8 * E.inQuad(p), b0.cx - it.x, b0.y0 - it.y)
      const bb = dBox(it, sz * 0.35)
      const w = bb.x1 - bb.x0
      const n = clamp(Math.round(w / (sz * (layOf(it).N === 1 ? 0.3 : 0.15))), 4, 16)
      const e = E.inQuad(p)
      const out: Band[] = []
      for (let k = 0; k < n; k++) {
        const drip = 0.5 + 0.5 * noise1(k * 0.6, seed)
        const spike = r(seed, k, 311) < 0.3 ? r(seed, k, 312) : 0
        out.push([
          bb.x0 + (k * w) / n,
          bb.x0 + ((k + 1) * w) / n + 0.6,
          e * sz * (0.1 + 1.3 * drip + 1.1 * spike),
        ])
      }
      it.vbands = out
      it.color = mixC(colOf(it), env.sc.accent, smooth(0.3, 0.9, p) * 0.45)
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.55, 1, p))
    },
  },

  /** 剥落：笔画碎片带着随机延迟轻轻上飘消失（无碎片可分时退化成逐字闪现） */
  dissolve: {
    w: 0.9,
    tags: ['calm', 'emotional'],
    pieces: true,
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const b = dBox(it, 0)
      const bw = Math.max(1, b.x1 - b.x0)
      it.shatter = true
      ;(it.pieceFns ??= []).push((ci, pj, _pc, ox) => {
        // 随机之外再叠一层从左到右的松动扫过
        const t0 = r(seed, ci, pj, 71) * 0.5 + clamp((ox + it.x - b.x0) / bw) * 0.25
        const x = (p - t0) / 0.25
        if (x <= 0) return PIECE_IDLE
        if (x >= 1) return null
        return pt(0, -x * sz * 0.05, 0, 1 + 0.3 * x, 1, 0, 1 - x)
      })
      if (it.gradient || it.fill === false || it.dash != null || it.pattern) {
        const step = env.step
        addC(it, (i) => {
          const t0 = r(seed, i, 72) * 0.7
          return p > t0 + 0.3 ? HIDE : p > t0 && r(seed, step, i, 73) < (p - t0) / 0.3 ? HIDE : null
        })
      }
    },
  },

  /** 退格：真画出选区与光标，先加速逐字删，或整段选中后一次删掉 */
  backspace: {
    w: 0.8,
    tags: ['editorial', 'glitch'],
    cursor: true,
    minDur: 0.9,
    outDur: (dur, n) => clamp(0.2 + n * 0.035, 0.3, Math.max(0.3, Math.min(0.9, dur * 0.45))),
    apply(env, it, p) {
      const lay = layOf(it)
      const n = lay.N
      if (!n) return
      const N = cutN(env)
      const single = n === 1 && N > 1
      const sel = !single && (hash(cutSeed(env), 601) & 1) === 1
      const acc = env.sc.accent
      const bg = env.sc.bg
      const sz = it.size
      const sx = it.sx || 1
      const sy = it.sy || 1
      const vert = !!it.vertical
      const blink = Math.floor(env.ltb * 5) % 2 === 0
      const cw = Math.max(2, sz * 0.07)
      const cursorAfter = (g: LaidGlyph): Rect4 =>
        vert
          ? [g.x * sx - sz * sx * 0.48, (g.y + g.h / 2) * sy + sz * 0.05, sz * sx * 0.96, cw]
          : [(g.x + g.w / 2) * sx + sz * 0.05, g.y * sy - sz * sy * 0.5, cw, sz * sy]
      const cursorBefore = (g: LaidGlyph): Rect4 =>
        vert
          ? [g.x * sx - sz * sx * 0.48, (g.y - g.h / 2) * sy - sz * 0.05 - cw, sz * sx * 0.96, cw]
          : [(g.x - g.w / 2) * sx - sz * 0.05 - cw, g.y * sy - sz * sy * 0.5, cw, sz * sy]
      const drawCur = (rc: Rect4): void =>
        chainPost(it, (env2, it2) =>
          inItem(env2, it2, () => env2.rect(rc[0], rc[1], rc[2], rc[3], acc, 1, false)),
        )

      if (single) {
        const j = clamp(Math.round(it.mi || 0), 0, N - 1)
        const del = Math.pow(clamp((p - 0.1) / 0.8), 1.3)
        const tj = (N - 1 - j) / N
        const g0 = lay[0]
        if (del > tj) addC(it, () => HIDE)
        let cur: Rect4 | null = null
        if (p < 0.94) {
          if (j === N - 1 && del <= 0) cur = blink ? cursorAfter(g0) : null
          else if (del > tj && (j === 0 || del <= tj + 1 / N))
            cur = j === 0 && del >= 1 && !blink ? null : cursorBefore(g0)
        }
        if (cur) drawCur(cur)
        return
      }

      const vis = lay.filter((g) => !isSp(g.ch))
      if (!vis.length) return

      if (sel) {
        // 从末尾按住 shift+← 全选，然后一次删净
        const s = Math.ceil(vis.length * E.outQuad(clamp(p / 0.42)))
        const from = vis.length - s
        if (p >= 0.55) addC(it, () => HIDE)
        else if (s > 0) {
          const selIdx = new Set(vis.slice(from).map((g) => g.i))
          const track = it.track || 0
          chainPre(it, (env2, it2) =>
            inItem(env2, it2, () => {
              for (const g of vis.slice(from)) {
                if (vert)
                  env2.rect(
                    g.x * sx - sz * sx * 0.6,
                    (g.y - g.h / 2) * sy - 0.5,
                    sz * sx * 1.2,
                    g.h * sy + track * sy + 1,
                    acc,
                    1,
                    true,
                  )
                else
                  env2.rect(
                    (g.x - g.w / 2) * sx - 0.5,
                    g.y * sy - sz * sy * 0.6,
                    g.w * sx + track * sx + 1,
                    sz * sy * 1.2,
                    acc,
                    1,
                    true,
                  )
              }
            }),
          )
          addC(it, (i) => (selIdx.has(i) ? { color: bg } : null))
        }
        if (p < 0.94) {
          const g0 = vis[Math.min(vis.length - 1, from)]
          if (p >= 0.55) {
            if (blink) drawCur(cursorBefore(vis[0]))
          } else if (s === 0) {
            if (blink) drawCur(cursorAfter(vis[vis.length - 1]))
          } else drawCur(cursorBefore(g0))
        }
        return
      }

      // 逐字删除，像按键连发那样越删越快
      const del = Math.pow(clamp((p - 0.1) / 0.8), 1.3)
      const k = vis.length - Math.min(vis.length, Math.floor(del * (vis.length + 0.999)))
      const keep = k > 0 ? vis[k - 1].i : -1
      if (k < vis.length) addC(it, (i) => (i > keep ? HIDE : null))
      if (p < 0.94) {
        const idle = p < 0.1 || k === 0
        if (!idle || blink) drawCur(k > 0 ? cursorAfter(vis[k - 1]) : cursorBefore(vis[0]))
      }
    },
  },

  /** 符号化：逐字换成随机符号并越来越短命 */
  scrambleOut: {
    w: 0.9,
    tags: ['glitch'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const seed = seedOf(it)
      const step = env.step
      const acc = env.sc.accent
      addC(it, (i, _g, n) => {
        const q = win(p, 0.65 * ord(i, n) + 0.35 * r(seed, i, 701), 0.55)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        if (q > 0.55 && r(seed, i, step, 703) < (q - 0.55) * 2.4) return HIDE
        return {
          ch: POOL[hash(seed, i, step, 702) % POOL.length],
          color: r(seed, i, step, 704) < 0.3 ? acc : undefined,
          s: 1 - 0.35 * smooth(0.4, 1, q),
        }
      })
    },
  },

  /** 块化：字被半条遮掉、错位，周围飘出同色系的矩形色块 */
  glitchDissolve: {
    w: 0.8,
    tags: ['glitch'],
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      const sz = it.size
      const lay = layOf(it)
      const sx = it.sx || 1
      const sy = it.sy || 1
      const acc = env.sc.accent
      const c0 = colOf(it)
      const cols = [c0, acc, env.sc.ghostA || acc, env.sc.ghostB || c0]
      const T = (i: number): number => r(seed, i, 801) * 0.55
      addC(it, (i) => {
        const q = (p - T(i)) / 0.45
        if (q <= 0) return null
        if (q >= 0.3) return HIDE
        const roll = r(seed, i, step, 802)
        const cut = rs(seed, i, step, 804) * 0.35
        return {
          dx: rs(seed, i, step, 803) * sz * 0.12,
          clipY: roll < 0.5 ? [-1.2, cut] : [cut, 1.2],
          color: roll < 0.25 ? acc : undefined,
        }
      })
      chainPost(it, (env2, it2) =>
        inItem(env2, it2, () => {
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const q = (p - T(g.i)) / 0.45
            if (q <= 0 || q >= 1) continue
            const cnt = Math.ceil(5 * (1 - q * 0.8))
            for (let b = 0; b < cnt; b++) {
              const hk = g.i * 8 + b
              if (r(seed, hk, step, 805) < q * 0.55) continue
              const w = sz * rr(0.12, 0.6, seed, hk, step, 806) * (1 - q * 0.5)
              const h = sz * rr(0.06, 0.3, seed, hk, step, 807)
              const x = g.x * sx + rs(seed, hk, step, 808) * sz * 0.34 - w / 2
              const y = g.y * sy + rs(seed, hk, step, 809) * sz * 0.34 - h / 2
              env2.rect(x, y, w, h, cols[hash(seed, hk, step, 810) % cols.length], 1, false)
            }
          }
        }),
      )
    },
  },

  /** 残响：主体淡走，身后留三层越放越大的描边 */
  echoOut: {
    w: 0.9,
    tags: ['emotional', 'calm'],
    apply(_env, it, p) {
      const b = box(it)
      const ax = b.cx - it.x
      const ay = b.cy - it.y
      const a0 = it.alpha ?? 1
      const sz = it.size
      const lw = Math.max(1, sz * 0.016)
      const col = colOf(it)
      const acc = _env.sc.accent
      it.alpha = a0 * (1 - E.inOutSine(clamp(p / 0.45)))
      chainPost(it, (env2, it2) => {
        for (let k = 0; k < 3; k++) {
          const q = clamp((p - k * 0.15) / 0.55)
          if (q <= 0 || q >= 1) continue
          const s = 1 + 0.5 * E.outCubic(q) * (1 + k * 0.2)
          const [dx, dy] = rot2(ax * (1 - s), ay * (1 - s), (it2.rot || 0) * DEG)
          drawItem(env2, {
            ...it2,
            x: it2.x + dx,
            y: it2.y + dy,
            size: it2.size * s,
            alpha: a0 * 0.8 * (1 - q),
            fill: false,
            stroke: lw / s,
            strokeColor: k === 1 ? acc : col,
            pieceFn: null,
            pre: undefined,
            post: undefined,
            echo: null,
            streak: null,
            extrude: undefined,
            shadow: undefined,
            gradient: undefined,
            pattern: undefined,
            dash: null,
            fillAlpha: 1,
            _lay: undefined,
            _m: undefined,
          })
        }
      })
    },
  },

  /** 甩出：整项沿自身轴向被猛甩出去，甩途中拉伸带斜切，拖出速度线 */
  whipOut: {
    w: 1,
    tags: ['pop', 'graphic'],
    apply(env, it, p) {
      const b = box(it)
      const vert = !!it.vertical
      const sz = it.size
      const dir = cutBit(env, 4) ? 1 : -1
      const dist = (vert ? env.H + b.h : env.W + b.w) + sz * 2
      // 起手先往回压一下才有"甩"的感觉
      const pb = sz * 0.14 * E.outCubic(clamp(p / 0.28))
      const u = clamp((p - 0.26) / 0.74)
      const e = Math.pow(u, 2)
      const v = Math.min(1.6, 2 * u)
      const off = dir * (dist * e - pb * (1 - u))
      const ra = (it.rot || 0) * DEG
      if (vert) {
        it.x += -off * Math.sin(ra)
        it.y += off * Math.cos(ra)
        scaleAbout(it, 1, 1 + v * 0.45)
      } else {
        it.x += off * Math.cos(ra)
        it.y += off * Math.sin(ra)
        scaleAbout(it, 1 + v * 0.55, 1 - v * 0.08)
        it.skew = (it.skew || 0) - dir * Math.min(28, v * 16)
      }
      if (v > 0.05) {
        const m = Math.min(1, v)
        it.streak = vert
          ? { n: 4, dx: 0, dy: -dir * sz * 0.45 * m, a: 0.4 * m }
          : { n: 4, dx: -dir * sz * 0.45 * m, dy: 0, a: 0.4 * m }
      }
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.9, 1, p))
    },
  },

  /** 重力：逐字先被弹起一点再自由落体掉出画面，边落边转 */
  gravity: {
    w: 1,
    tags: ['pop', 'emotional'],
    outDur: (dur) => clamp(dur * 0.38, 0.3, 0.75),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const bb = dBox(it, 0)
      const [dsx, dsy] = downI(it)
      const D = Math.max(sz * 2, env.H - bb.y0 + sz * 1.2)
      addC(it, (i) => {
        const d0 = r(seed, i, 901) * 0.4
        const q = clamp((p - d0) / 0.6)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        // 起跳高度决定初速，重力取"落到 D 处刚好"
        const h = sz * (0.12 + 0.22 * r(seed, i, 902))
        const v0 = 2 * h + Math.sqrt(4 * h * h + 4 * h * D)
        const G = D + v0
        const down = -v0 * q + G * q * q
        const side = rs(seed, i, 903) * sz * 0.9 * q
        return {
          dx: down * dsx + side * dsy,
          dy: down * dsy - side * dsx,
          rot: rs(seed, i, 904) * 240 * q * q,
          a: 1 - smooth(0.92, 1, q),
        }
      })
    },
  },

  /** 弹掉：字先鼓起来再不见，原位留下一圈冲击波与八根短线 */
  popOut: {
    w: 1,
    tags: ['pop'],
    apply(env, it, p) {
      const ord = orderOf(env, it)
      const seed = seedOf(it)
      const acc = env.sc.accent
      const c0 = colOf(it)
      const lay = layOf(it)
      const sz = it.size
      const sx = it.sx || 1
      const sy = it.sy || 1
      const Q = (i: number, n: number): number =>
        win(p, 0.6 * ord(i, n) + 0.4 * r(seed, i, 1001), 0.5)
      addC(it, (i, _g, n) => {
        const q = Q(i, n)
        if (q <= 0) return null
        if (q >= 0.55) return HIDE
        const u = q / 0.55
        return {
          s: 1 + 0.5 * u * u,
          sx: 1 + 0.07 * Math.sin(u * 26) * u,
          sy: 1 - 0.07 * Math.sin(u * 26) * u,
          color: mixC(c0, acc, u * 0.7),
        }
      })
      chainPost(it, (env2, it2) =>
        inItem(env2, it2, () => {
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const q = Q(g.i, lay.N)
            if (q < 0.55 || q >= 1) continue
            const u = (q - 0.55) / 0.45
            const e = E.outCubic(u)
            const cx = g.x * sx
            const cy = g.y * sy
            const lw = Math.max(1, sz * 0.08 * (1 - u))
            env2.circle(cx, cy, sz * (0.35 + 0.45 * e), null, acc, lw, 1 - u, false)
            const a0 = r(seed, g.i, 1002) * TAU
            for (let k = 0; k < 8; k++) {
              const a = a0 + (k / 8) * TAU
              const r0 = sz * (0.5 + 0.55 * e)
              const r1 = r0 + sz * 0.16 * (1 - u)
              env2.line(
                [
                  [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
                  [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
                ],
                acc,
                lw,
                1 - u,
                false,
              )
            }
          }
        }),
      )
    },
  },

  /** 烧掉：从底边开始烧穿，火线上移、颜色先发热再成灰，边上飘火星 */
  burn: {
    w: 0.8,
    tags: ['emotional', 'glitch'],
    outDur: (dur) => clamp(dur * 0.36, 0.28, 0.7),
    apply(env, it, p) {
      const ord0 = orderOf(env, it)
      const seed = seedOf(it)
      const rev = cutBit(env, 5)
      const ord = (i: number, n: number): number => (rev ? 1 - ord0(i, n) : ord0(i, n))
      const c0 = colOf(it)
      const acc = env.sc.accent
      const bg = env.sc.bg
      const sz = it.size
      const lay = layOf(it)
      const sx = it.sx || 1
      const sy = it.sy || 1
      const step = env.step
      const Q = (i: number, n: number): number =>
        win(p, 0.6 * ord(i, n) + 0.4 * r(seed, i, 1101), 0.45)
      /** 已烧掉的比例（自下而上） */
      const K = (q: number): number => Math.pow(clamp((q - 0.12) / 0.88), 1.15)
      addC(it, (i, _g, n) => {
        const q = Q(i, n)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const heat = smooth(0, 0.2, q)
        const char = smooth(0.35, 0.95, q)
        const k = K(q)
        return {
          color: char > 0 ? mixC(acc, bg, char * 0.75) : mixC(c0, acc, heat),
          clipY: [-1.2, 0.72 - 1.44 * k],
          dy: -k * sz * 0.1,
          dx: rs(seed, i, step, 1102) * sz * 0.012 * heat,
        }
      })
      chainPost(it, (env2, it2) =>
        inItem(env2, it2, () => {
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const q = Q(g.i, lay.N)
            if (q <= 0.15 || q >= 1) continue
            for (let j = 0; j < 5; j++) {
              const b0 = 0.15 + r(seed, g.i, j, 1103) * 0.6
              const age = (q - b0) / 0.35
              if (age <= 0 || age >= 1) continue
              const ey =
                g.y * sy + (0.72 - 1.44 * K(b0)) * g.h * sy - K(b0) * sz * 0.1 - age * sz * 0.55
              const ex =
                g.x * sx +
                rs(seed, g.i, j, 1104) * g.w * sx * 0.4 +
                Math.sin(age * 6 + j) * sz * 0.05
              env2.circle(ex, ey, Math.max(1, sz * 0.04 * (1 - age)), acc, null, 0, 1 - age, false)
            }
          }
        }),
      )
    },
  },

  /** 亮条掩走：一根根强调色条把每行盖住，盖到的字立刻不再画 */
  sweepCover: {
    w: 1,
    tags: ['graphic', 'editorial', 'pop'],
    outDur: (dur) => clamp(dur * 0.34, 0.26, 0.6),
    apply(env, it, p) {
      const lines = lineExt(it)
      const vert = !!it.vertical
      const sz = it.size
      const acc = env.sc.accent
      const L = lines.length
      if (!L) return
      const st = L > 1 ? Math.min(0.12, 0.3 / (L - 1)) : 0
      const span = 1 - (L - 1) * st
      const N = cutN(env)
      const single = layOf(it).N === 1 && N > 1
      const U = single
        ? [win(p, orderOf(env, it)(0, 1), 0.45)]
        : lines.map((_ln, k) => clamp((p - k * st) / span))
      const hidden = new Set(lines.filter((_ln, k) => U[k] >= 0.5).map((ln) => ln.li))
      if (hidden.size) addC(it, (_i, g) => (hidden.has(g.li) ? HIDE : null))
      const pa = sz * 0.14
      const pc = sz * 0.1
      chainPost(it, (env2, it2) =>
        inItem(env2, it2, () => {
          lines.forEach((ln, k) => {
            const u = U[k]
            if (u <= 0 || u >= 1) return
            // 条子先从两侧收拢成一条线，再缩掉
            const c1 = E.inOutCubic(clamp(u / 0.5))
            const c2 = E.inOutCubic(clamp((u - 0.5) / 0.5))
            if (vert) {
              const a0 = ln.y0 - pa
              const a1 = ln.y1 + pa
              const y0 = lerp(a0, a1, c2)
              const y1 = lerp(a0, a1, c1)
              if (y1 - y0 > 0.3)
                env2.rect(ln.x0 - pc, y0, ln.x1 - ln.x0 + pc * 2, y1 - y0, acc, 1, false)
            } else {
              const a0 = ln.x0 - pa
              const a1 = ln.x1 + pa
              const x0 = lerp(a0, a1, c2)
              const x1 = lerp(a0, a1, c1)
              if (x1 - x0 > 0.3)
                env2.rect(x0, ln.y0 - pc, x1 - x0, ln.y1 - ln.y0 + pc * 2, acc, 1, false)
            }
          })
        }),
      )
    },
  },

  /** 四分裂：沿中线裁成四块各甩各的，带旋转与下坠 */
  shatterLite: {
    w: 0.8,
    tags: ['pop', 'glitch'],
    apply(_env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const dist = sz * 1.7
      const quad =
        (qx: number, qy: number, id: number): CharFn =>
        (i) => {
          const clipX: readonly [number, number] = qx < 0 ? [-1.6, 0.012] : [0, 1.6]
          const clipY: readonly [number, number] = qy < 0 ? [-1.6, 0.012] : [0, 1.6]
          const d0 = r(seed, i, 1201) * 0.35
          const q = clamp((p - d0) / 0.65)
          if (q <= 0) return { clipX, clipY }
          if (q >= 1) return HIDE
          const e = E.outCubic(q)
          const dd = dist * (0.7 + 0.6 * r(seed, i, id, 1203))
          return {
            clipX,
            clipY,
            dx: (qx + rs(seed, i, id, 1202) * 0.5) * dd * e,
            dy: (qy + rs(seed, i, id, 1205) * 0.5) * dd * e + sz * 0.9 * q * q,
            rot: rs(seed, i, id, 1204) * 110 * e,
            s: 1 - 0.45 * q,
            a: 1 - smooth(0.45, 1, q),
          }
        }
      withCopies(it, quad(-1, -1, 0), [quad(1, -1, 1), quad(-1, 1, 2), quad(1, 1, 3)])
    },
  },
}

/**
 * 收尾保险：不管配方在 p≈1 留下了什么（细线、补偿描边），一律确保彻底消失。
 * 与旧项目注册前的那道包装等价。
 */
for (const key of Object.keys(EXIT)) {
  const def = EXIT[key]
  const f = def.apply
  def.apply = (env, it, p, ctx) => {
    if (p >= 0.998) {
      it.alpha = 0
      return
    }
    f(env, it, p, ctx)
  }
}

/* ============================== 待机 ============================== */

const HOLD: Record<string, AnimDef> = {
  /** 漂浮：噪声 + 正弦的低速起伏 */
  float: {
    w: 0.8,
    tags: ['calm', 'emotional'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const A = it.size * 0.075 * k
      const ph = (seed % 97) * 0.13
      addC(it, (i) => ({
        dy: (0.55 * Math.sin(t * 2.1 + i * 1.3 + ph) + 0.6 * noise1(t * 0.9 + i * 0.43, seed)) * A,
        dx: noise1(t * 0.6 + i * 0.31, seed + 7) * A * 0.35,
      }))
    },
  },

  /** 摇摆：吊在文字上方一点的支点上摆 */
  sway: {
    w: 0.6,
    tags: ['calm', 'emotional'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const b = box(it)
      const ang = Math.sin((env.ltb * TAU) / 3.2 + (seedOf(it) % 7)) * 2.6 * k
      rotateAbout(it, ang, b.cx - it.x, b.y0 - it.y - it.size * 0.6)
    },
  },

  /** 脉动：每拍一次弹性放大 */
  pulse: {
    w: 0.6,
    tags: ['pop', 'graphic'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const f = 1 + 0.055 * Math.exp(-beatSince(env, 0.5) * 9) * k
      scaleAbout(it, f, f)
    },
  },

  /** 闪烁：逐字按噪声明暗呼吸，偶发一颗爆亮的星 */
  shimmer: {
    w: 0.5,
    tags: ['emotional', 'calm'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const step = env.step
      const acc = env.sc.accent
      const c0 = colOf(it)
      addC(it, (i) => {
        const tw = 0.5 + 0.5 * noise1(t * 3.2 + i * 1.7, seed)
        const sp = r(seed, step, i, 401) < 0.03 * k
        return {
          a: 1 - 0.42 * Math.min(1, k) * tw * tw,
          color: sp ? mixC(c0, acc, 0.85) : undefined,
          s: sp ? 1.05 : 1,
        }
      })
    },
  },

  /** 流光：一道高斯亮包沿阅读轴扫过，扫到的字被染色并抬起 */
  colorRun: {
    w: 0.5,
    tags: ['pop', 'graphic'],
    apply(env, it, amt) {
      const k = amt * Math.min(1, motionK(env))
      if (k < 0.01) return
      const c0 = colOf(it)
      const acc = env.sc.accent
      if (!isHex(c0) || !isHex(acc)) return
      const N = cutN(env)
      const mi = it.mi || 0
      const sz = it.size
      const per = N + 5
      const pos = ((((env.ltb * 7) % per) + per) % per) - 2.5
      addC(it, (i, _g, n) => {
        const d = (n > 1 ? i : mi) - pos
        const w = Math.exp((-d * d) / 1.6)
        if (w < 0.02) return null
        return { color: mixC(c0, acc, w * 0.9 * k), dy: -w * sz * 0.035 * k }
      })
    },
  },

  /** 慢转：绕盒心匀速转到限角，方向由种子决定 */
  rotateSlow: {
    w: 0.4,
    tags: ['calm', 'editorial'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const dir = ((seedOf(it) >>> 1) & 1) === 1 ? 1 : -1
      const b = box(it)
      rotateAbout(it, dir * Math.min(10, env.ltb * 2.6) * k, b.cx - it.x, b.cy - it.y)
    },
  },

  /** 字距呼吸：整行像手风琴那样松紧 */
  trackBreathe: {
    w: 0.5,
    tags: ['calm', 'editorial'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const b = box(it)
      const ox = b.cx - it.x
      const oy = b.cy - it.y
      const sx = it.sx || 1
      const sy = it.sy || 1
      const vert = !!it.vertical
      const f = Math.sin((env.ltb * TAU) / 2.8) * 0.075 * k
      addC(it, (_i, g) => (vert ? { dy: (g.y * sy - oy) * f } : { dx: (g.x * sx - ox) * f }))
    },
  },

  /** 斜摇：整项左右剪切，锚住盒心不让它跑位 */
  skewWobble: {
    w: 0.4,
    tags: ['pop', 'glitch'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const b = box(it)
      const oy = b.cy - it.y
      const s0 = it.skew || 0
      const s1 = s0 + Math.sin((env.ltb * TAU) / 1.9) * 12 * k
      const [dx, dy] = rot2(-(Math.tan(s1 * DEG) - Math.tan(s0 * DEG)) * oy, 0, (it.rot || 0) * DEG)
      it.skew = s1
      it.x += dx
      it.y += dy
    },
  },

  /** 踩拍：轮到哪个字哪个字跳，邻居跟着涟漪一下 */
  beatHop: {
    w: 0.5,
    tags: ['pop'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const len = beatLen(env, 0.45)
      const u = beatSince(env, 0.45) / (len * 0.85)
      if (u >= 1) return
      const N = cutN(env)
      const idx = beatIdx(env, 0.45)
      const cur = ((idx % N) + N) % N
      const mi = it.mi || 0
      const sz = it.size
      const h = Math.pow(Math.sin(Math.PI * u), 0.7)
      addC(it, (i, _g, n) => {
        const d = Math.abs((n > 1 ? i : mi) - cur)
        const w = d === 0 ? 1 : d === 1 ? 0.3 : 0
        return w
          ? { dy: -h * w * sz * 0.2 * k, sy: 1 + 0.08 * h * w * k, sx: 1 - 0.05 * h * w * k }
          : null
      })
    },
  },

  /** 横波：逐字相位错开的左右波，配一点剪切 */
  hWave: {
    w: 0.4,
    tags: ['pop', 'emotional'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const sz = it.size
      addC(it, (i) => {
        const a = t * TAU * 0.55 - i * 0.9
        return { dx: Math.sin(a) * sz * 0.085 * k, skew: -Math.cos(a) * 9 * k }
      })
    },
  },

  /** 心跳：两下收缩的指数衰减包络，一拍一下交替 */
  heartbeat: {
    w: 0.4,
    tags: ['emotional', 'pop'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const u = env.beat
        ? (env.beat.index % 2) * env.beat.len + env.beat.since
        : ((env.ltb % 1.05) + 1.05) % 1.05
      const v = Math.exp(-u * 9) + (u > 0.2 ? 0.75 * Math.exp(-(u - 0.2) * 9) : 0)
      const f = 1 + 0.055 * v * k
      scaleAbout(it, f, f)
      it.color = mixC(colOf(it), env.sc.accent, Math.min(0.85, 0.6 * v * Math.min(1, k)))
    },
  },

  /** 小圆周：逐字沿小圈转，相位各异 */
  orbitSmall: {
    w: 0.5,
    tags: ['calm', 'pop'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = (env.ltb * TAU) / 1.7
      const rad = it.size * 0.05 * k
      const dir = ((seedOf(it) >>> 2) & 1) === 1 ? 1 : -1
      addC(it, (i) => ({
        dx: Math.cos(t * dir + i * 0.9) * rad,
        dy: Math.sin(t * dir + i * 0.9) * rad,
      }))
    },
  },

  /** 果冻：底边钉住的压扁拉伸，有拍时按拍逐字起波 */
  jelly: {
    w: 0.4,
    tags: ['pop'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const sy0 = it.sy || 1
      const t = env.ltb
      const bs = env.beat ? env.beat.since : null
      addC(it, (i, g) => {
        const w =
          bs != null
            ? Math.exp(-(bs - i * 0.03) * 4.5) * Math.sin(Math.max(0, bs - i * 0.03) * 21)
            : Math.sin(t * TAU * 1.1 - i * 0.55)
        const a = 0.1 * w * k
        const syk = 1 - a
        return { sx: 1 + a, sy: syk, dy: (1 - syk) * g.h * sy0 * 0.5 }
      })
    },
  },

  /** 扫描带：一条亮带反复扫过，扫到的行错位（有入场切片时让位） */
  scanBand: {
    w: 0.4,
    tags: ['glitch', 'graphic'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      if (it.bands || it.vbands) return
      const per = 2.2
      const cyc = Math.floor(env.ltb / per)
      const v = (((env.ltb % per) + per) % per) / (per * 0.7)
      if (v >= 1) return
      const bb = dBox(it, it.size * 0.1)
      const h = bb.y1 - bb.y0
      const bh = Math.max(it.size * 0.24, h * 0.12)
      const y = bb.y0 - bh + (h + bh) * v
      const dx = it.size * 0.075 * k * (r(seedOf(it), cyc, 451) < 0.5 ? 1 : -1)
      it.bands = [[y, y + bh, dx]]
      const acc = env.sc.accent
      const lw = Math.max(1, it.size * 0.012)
      chainPost(it, (env2) =>
        env2.rect(bb.x0, y + bh - lw, bb.x1 - bb.x0, lw, acc, 0.55 * Math.min(1, k), false),
      )
    },
  },

  /** 噪声漂流：位移与旋转都取平滑噪声，慢而无规则 */
  noiseDrift: {
    w: 0.6,
    tags: ['calm', 'emotional'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb * 0.35
      const seed = seedOf(it)
      const A = it.size * 0.075 * k
      addC(it, (i) => ({
        dx: noise1(t + i * 1.7, seed + 11) * A,
        dy: noise1(t + i * 2.3, seed + 23) * A,
        rot: noise1(t * 1.3 + i * 0.9, seed + 37) * 7 * k,
      }))
    },
  },

  /** 跷跷板：基线绕盒心倾斜，字本身保持 upright */
  tilt: {
    w: 0.4,
    tags: ['calm', 'editorial'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const b = box(it)
      const ox = b.cx - it.x
      const oy = b.cy - it.y
      const sx = it.sx || 1
      const sy = it.sy || 1
      const vert = !!it.vertical
      const tn = Math.tan(Math.sin((env.ltb * TAU) / 4.2 + (seedOf(it) % 5)) * 4 * k * DEG)
      addC(it, (_i, g) => (vert ? { dx: -(g.y * sy - oy) * tn } : { dy: (g.x * sx - ox) * tn }))
    },
  },

  /** 缓推：整段时长里极慢地推近，像纪录片的镜头 */
  zoomSlow: {
    w: 0.8,
    tags: ['calm', 'emotional', 'editorial'],
    apply(env, it, amt, ctx) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      // 镜头时长兜底：env.cut 在非渲染路径上可能为空
      const cutDur = env.cut ? env.cut.dur : 1
      const u = clamp(env.ltb / Math.max(0.3, ctx?.dur || cutDur || 1))
      const f = 1 + 0.07 * E.outQuad(u) * k
      scaleAbout(it, f, f)
    },
  },

  /** 横向拉伸拍：拍上先变宽再弹回 */
  stretchPulse: {
    w: 0.4,
    tags: ['pop', 'graphic'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const kick = Math.exp(-beatSince(env, 0.5) * 8) * k
      scaleAbout(it, 1 + 0.12 * kick, 1 - 0.045 * kick)
    },
  },

  /** 偶发错位：每 8 个帧格里抽一小段跳位 + 切片，抽不抽由 glitch 滑条决定 */
  glitchJump: {
    w: 0.4,
    tags: ['glitch'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const seed = seedOf(it)
      const step = env.step
      const slot = Math.floor(step / 8)
      const ph = step - slot * 8
      const gl = env.fx?.glitch ?? 0.5
      if (ph > 2 || r(seed, slot, 501) > 0.4 + 0.3 * gl) return
      const sz = it.size
      it.x += rs(seed, slot, 502) * sz * 0.2 * k
      it.y += rs(seed, slot, 503) * sz * 0.04 * k
      if (ph === 0 && !it.bands && !it.vbands) {
        it.bands = itemBands(env, it, 5, (b) =>
          r(seed, slot, b, 504) < 0.6 ? rs(seed, slot, b, 505) * sz * 0.12 * k : 0,
        )
        if (r(seed, slot, 506) < 0.5) it.color = env.sc.ghostA || env.sc.accent
      }
    },
  },

  /** 残像拖行：整项走一条利萨曲线，身后留三张偏色的回声 */
  echoTrail: {
    w: 0.4,
    tags: ['emotional', 'glitch'],
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const sz = it.size
      const w = TAU / 3.4
      const ph = (seedOf(it) % 100) * 0.1
      const Ax = sz * 0.09 * k
      const Ay = sz * 0.05 * k
      it.x += Math.sin(w * t + ph) * Ax
      it.y += Math.sin(w * 1.37 * t + ph * 1.3) * Ay
      // 回声顶在运动方向的反面
      const vx = Math.cos(w * t + ph) * w * Ax
      const vy = Math.cos(w * 1.37 * t + ph * 1.3) * w * 1.37 * Ay
      if (!it.echo)
        it.echo = {
          n: 3,
          dx: -vx * 0.3,
          dy: -vy * 0.3,
          a: 0.34 * Math.min(1, k),
          decay: 0.62,
          color: env.sc.sub || it.color,
        }
    },
  },
}

export const pack: PackParts = { exit: EXIT, hold: HOLD }
