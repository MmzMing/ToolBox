/**
 * 部件包 looks（87 件）：24 个文字加工 + 24 个整屏背景图形 + 15 个镜头运动 + 24 个后期特效。
 *
 * 逐条移植自 JIZURA 的 src/11p_looks.js（MIT）：key、注册顺序、w / tags / safe / subtle /
 * strong / glitchy / mid / scratch / dur / pre / amp 一律照搬，数值常量、缓动曲线、hash 种子、
 * 坐标与时长全部原样保留 —— 同 seed + 同歌词必须渲染出同一支视频。
 *
 * 结构约定：
 * - plan 产出的随机参数是宽松的 `Params` 记录，每件部件都声明自己的具体参数类型，
 *   入口做一次 `as unknown as XxxP` cast（本仓库认可的唯一 cast 写法）；
 * - `mkBg` / `mkFx` 复刻JIZURA bgReg / fxReg：统一包一层 save/restore，
 *   并把 ctx 作为额外参数交给内部画法；
 * - 文字加工的"叠在文字下面 / 上面"沿用JIZURA的 it.pre / it.post 钩子
 *   （本仓库 layouts.ts 的 drawFx 先在裁剪与条带之前调 pre、之后调 post，语义一致；
 *   旧包里也没有 treat.layer 字段，层次完全由这两个钩子决定）。
 *
 * 中文适配与两处必要的偏离：
 * - 「交互色·汉字」的旧判定是 kanji + katakana，中文换成 isHan（几何与错帧不变）；
 * - 旧 renderer 提供的第二块后期 scratch（tmp2）在本仓库 FxInfo 上未接线，
 *   由本包自备一块离屏画布承担（行为等价：与 I.tmp 互相独立的两块缓冲）；
 * - inPieces 只能查到核心 ENTER / EXIT（合并后的注册表在 registry.ts，包内 import 会成环）。
 */
import type {
  BBox,
  BgDef,
  CamState,
  CharFn,
  Cut,
  Env,
  FxDef,
  FxInfo,
  LaidGlyph,
  PackParts,
  Params,
  PlanEvent,
  Rng,
  Scheme,
  TextItem,
  TreatDef,
} from '../types'
import { ENTER, EXIT } from '../anim'
import { makeCanvas, ctxOf, ensure } from '../canvas'
import { drawItem } from '../draw'
import { fontsOf } from '../layouts'
import { isHan, isPunct } from '../script'
import { layoutText, measure } from '../text-layout'
import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  fitContrast,
  hash,
  lerp,
  lum,
  mix,
  noise1,
  r,
  rgba,
  rr,
  rs,
  smooth,
} from '../util'

/* ================= 颜色助手 ================= */
const ctr = (a: string, b: string): number => contrast(a, b)
const isDark = (c: string): boolean => lum(c) < 0.45
/** 第一个通过 test 的色值（配色字段可能被裁成空串，故先判真值） */
const firstOK = (list: readonly string[], test: (c: string) => boolean, fb: string): string => {
  for (const c of list) if (c && test(c)) return c
  return fb
}
/** 在一组候选里挑对比度最高的 */
const best = (list: readonly string[], against: string): string => {
  let b = list[0]
  let bv = -1
  for (const c of list) {
    if (!c) continue
    const v = ctr(c, against)
    if (v > bv) {
      bv = v
      b = c
    }
  }
  return b
}
/** 与 col 不同、同时在配色背景上读得清的强调色 */
const accentFor = (sc: Scheme, col: string, min = 1.6): string =>
  firstOK(
    [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
    (c) => ctr(c, col) >= min && ctr(c, sc.bg) >= 1.5,
    fitContrast(sc.accent, col, min + 0.3),
  )
/** 坐在色块上的字形颜色：pref 读得清就留着，否则换配色里最合适的 */
const textOn = (box: string, pref: string, sc: Scheme): string =>
  ctr(pref, box) >= 3 ? pref : best([sc.bg, sc.fg, sc.ink, '#111111', '#FFFFFF'], box)
/** 画在文字旁边、能从背景里跳出来的记号色 */
const markCol = (sc: Scheme, col: string): string =>
  firstOK([sc.accent, sc.accent2, col], (c) => ctr(c, sc.bg) >= 2, col)

/* ================= 文字项助手（加工件用） ================= */
/** 单个文字项可以覆盖本 cut 的动效选择（TextItem 未声明这三项） */
type ItemWithAnim = TextItem & { enter?: string; hold?: string; exit?: string }

const alive = (it: TextItem, amin = 0.9): boolean =>
  it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1
const colOf = (env: Env, it: TextItem): string => it.color || env.sc.fg

const addPre = (it: TextItem, f: (env: Env, i: TextItem) => void): void => {
  const p = it.pre
  it.pre = p
    ? (e, i) => {
        p(e, i)
        f(e, i)
      }
    : f
}
const addPost = (it: TextItem, f: (env: Env, i: TextItem, bb: BBox | null) => void): void => {
  const p = it.post
  it.post = p
    ? (e, i, bb) => {
        p(e, i, bb)
        f(e, i, bb)
      }
    : f
}
const pushChar = (it: TextItem, fn: CharFn): void => {
  ;(it.charFns ??= []).push(fn)
}
/** 依赖字号的字段：现在算一次，并在真正画之前（入场/保持/出场改过字号后）再刷一次 */
const sized = (it: TextItem, env: Env, f: (i: TextItem, e: Env) => void): void => {
  f(it, env)
  addPre(it, (e, i) => f(i, e))
}
const inP = (env: Env, it: TextItem, d: number, len: number): number =>
  clamp((env.lt - (it.delay || 0) - d) / len)
const glyphN = (t: string): number => [...String(t || '')].filter((c) => c.trim()).length
/** 逐碎片入场/出场正在跑（此时渐变与不填充会让碎片失效） */
const inPieces = (env: Env, it: TextItem): boolean => {
  const c = env.cut
  if (!c) return false
  const ov = it as ItemWithAnim
  const en = ENTER[ov.enter || c.enter]
  const ex = EXIT[ov.exit || c.exit]
  if (en?.pieces && env.lt - (it.delay || 0) < c.inDur * 1.3 + 0.05) return true
  if (ex?.pieces && c.outDur > 0 && env.lt > c.dur - c.outDur - 0.3) return true
  return false
}
/** 在与 drawFx 给文字施加的同一套裁剪/条带/模糊下跑 fn()；local=true 时同时进入项目局部坐标 */
const withFx = (env: Env, it: TextItem, fn: () => void, local = true): void => {
  const ctx = env.ctx
  const W = env.W
  const H = env.H
  ctx.save()
  const blur = it.blur || 0
  if (blur > 0.4 && env.allowFilter) ctx.filter = `blur(${(blur * env.scale).toFixed(1)}px)`
  if (it.clip) {
    ctx.beginPath()
    ctx.rect(it.clip[0], -H, it.clip[1] - it.clip[0], H * 3)
    ctx.clip()
  }
  if (it.clipY) {
    ctx.beginPath()
    ctx.rect(-W, it.clipY[0], W * 3, it.clipY[1] - it.clipY[0])
    ctx.clip()
  }
  if (it.clipFn) {
    ctx.beginPath()
    it.clipFn(ctx, env, it)
    ctx.clip()
  }
  const run = (): void => {
    if (!local) {
      fn()
      return
    }
    ctx.save()
    ctx.translate(it.x, it.y)
    if (it.rot) ctx.rotate(it.rot * DEG)
    if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0)
    fn()
    ctx.restore()
  }
  try {
    if (it.vbands && it.vbands.length) {
      for (const [x0, x1, dy] of it.vbands) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0, -H * 2, x1 - x0, H * 5)
        ctx.clip()
        ctx.translate(0, dy)
        run()
        ctx.restore()
      }
    } else if (it.bands && it.bands.length) {
      for (const [y0, y1, dx] of it.bands) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(-W * 2, y0, W * 5, y1 - y0)
        ctx.clip()
        ctx.translate(dx, 0)
        run()
        ctx.restore()
      }
      const lo = it.bands[0][0]
      const hi = it.bands[it.bands.length - 1][1]
      ctx.save()
      ctx.beginPath()
      ctx.rect(-W * 2, -H * 3, W * 5, lo + H * 3)
      ctx.rect(-W * 2, hi, W * 5, H * 4)
      ctx.clip()
      run()
      ctx.restore()
    } else run()
  } finally {
    ctx.restore()
  }
}

/** 静态排版给出的每行（竖排每列）在项目空间的范围，被 charFn 隐藏的字形不计入 */
type LineSpan = { li: number; a0: number; a1: number; c: number }
const lineSpans = (it: TextItem): LineSpan[] => {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const map = new Map<number, LineSpan>()
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue
    if (it.charFn) {
      const c = it.charFn(g.i, g, lay.N)
      if (c && (c.hide || (c.a != null && c.a < 0.05))) continue
    }
    const a0 = it.vertical ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx
    const a1 = it.vertical ? (g.y + g.h / 2) * sy : (g.x + g.w / 2) * sx
    const L = map.get(g.li)
    if (!L) map.set(g.li, { li: g.li, a0, a1, c: it.vertical ? g.x * sx : g.y * sy })
    else {
      L.a0 = Math.min(L.a0, a0)
      L.a1 = Math.max(L.a1, a1)
    }
  }
  return [...map.values()]
}
/** 可见字形（项目空间），跟随入场/保持/出场的逐字位移与缩放 */
type VisGlyph = {
  g: LaidGlyph
  x: number
  y: number
  w: number
  h: number
  s: number
  rot: number
  a: number
}
const glyphList = (it: TextItem): VisGlyph[] => {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const out: VisGlyph[] = []
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null
    if (c && c.hide) continue
    out.push({
      g,
      x: g.x * sx + ((c && c.dx) || 0),
      y: g.y * sy + ((c && c.dy) || 0),
      w: g.w * sx,
      h: g.h * sy,
      s: c && c.s != null ? c.s : 1,
      rot: (c && c.rot) || 0,
      a: c && c.a != null ? c.a : 1,
    })
  }
  return out
}
/** 每个字形中心在所属行里的比例 0..1 —— 荧光笔扫过的字要翻色 */
const lineFracs = (it: TextItem): number[] => {
  const lay = layoutText(it)
  const ext = new Map<number, { a: number; b: number }>()
  const fr: number[] = []
  for (const g of lay) {
    const p = it.vertical ? g.y : g.x
    const h = (it.vertical ? g.h : g.w) / 2
    const e = ext.get(g.li) || { a: 1e9, b: -1e9 }
    e.a = Math.min(e.a, p - h)
    e.b = Math.max(e.b, p + h)
    ext.set(g.li, e)
  }
  for (const g of lay) {
    const e = ext.get(g.li)
    if (!e) continue
    const p = it.vertical ? g.y : g.x
    fr[g.i] = (p - e.a) / Math.max(1, e.b - e.a)
  }
  return fr
}

/* ================= 柔光晕（离屏降采样 + 一次模糊） ================= */
const HALO: Record<string, HTMLCanvasElement> = {}
const haloCv = (k: string, w: number, h: number): HTMLCanvasElement => {
  let c = HALO[k]
  if (!c) c = HALO[k] = makeCanvas(64, 64)
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w)
    c.height = Math.max(c.height, h)
  }
  return c
}
/** 小尺寸画布上画一遍再放大模糊：代价不随模糊半径增长（整帧 filter 会掉帧） */
const halo = (e: Env, i: TextItem, col: string, b: number, dk: boolean): void => {
  const m = measure(i)
  const s = i.size
  const hw0 = m.w / 2
  const hh0 = m.h / 2
  let cx = i.x
  let cy = i.y
  if (i.vertical) {
    if (i.align === 'left') cy += hh0
  } else if (i.align === 'left') cx += hw0
  else if (i.align === 'right') cx -= hw0
  let hw = hw0
  let hh = hh0
  if (i.rot) {
    const rad = Math.hypot(hw0, hh0)
    const a = i.rot * DEG
    const dx = cx - i.x
    const dy = cy - i.y
    cx = i.x + dx * Math.cos(a) - dy * Math.sin(a)
    cy = i.y + dx * Math.sin(a) + dy * Math.cos(a)
    hw = hh = rad
  }
  const pad = s * b * 2.2 + s * 0.1
  const x0 = cx - hw - pad
  const y0 = cy - hh - pad
  const Wd = (hw + pad) * 2
  const Hd = (hh + pad) * 2
  const q = Math.min((e.scale || 1) * 0.25, 900 / Math.max(Wd, Hd))
  const wp = Math.max(2, Math.ceil(Wd * q))
  const hp = Math.max(2, Math.ceil(Hd * q))
  const A = haloCv('a', wp, hp)
  const B = haloCv('b', wp, hp)
  const ax = ctxOf(A)
  const bx = ctxOf(B)
  ax.setTransform(1, 0, 0, 1, 0, 0)
  ax.clearRect(0, 0, wp + 2, hp + 2)
  ax.setTransform(q, 0, 0, q, -x0 * q, -y0 * q)
  const c: TextItem = {
    ...i,
    pre: undefined,
    post: undefined,
    echo: null,
    streak: null,
    shadow: undefined,
    extrude: undefined,
    pattern: undefined,
    gradient: undefined,
    pieceFn: null,
    dash: null,
    strokeDash: undefined,
    blur: 0,
    blend: undefined,
    alpha: 1,
    fill: true,
    color: col,
    strokeColor: col,
    stroke: s * 0.07,
    strokeUnder: false,
    _lay: undefined,
  }
  drawItem(
    { ...e, ctx: ax, pass: 'main', passColor: null, scale: q, allowFilter: false, inLayer: false },
    c,
  )
  bx.setTransform(1, 0, 0, 1, 0, 0)
  bx.clearRect(0, 0, wp + 2, hp + 2)
  bx.filter = `blur(${Math.max(1, s * b * q * 0.9).toFixed(1)}px)`
  bx.drawImage(A, 0, 0, wp, hp, 0, 0, wp, hp)
  bx.filter = 'none'
  const ctx = e.ctx
  ctx.save()
  ctx.globalAlpha = (i.alpha ?? 1) * (dk ? 1 : 0.75)
  if (dk) ctx.globalCompositeOperation = 'screen'
  ctx.drawImage(B, 0, 0, wp, hp, x0, y0, Wd, Hd)
  if (dk) ctx.drawImage(B, 0, 0, wp, hp, x0, y0, Wd, Hd)
  ctx.restore()
}

/** 双色（字形色 + 花饰色）渐变里的第二色 */
const twoTone = (sc: Scheme, col: string): string =>
  firstOK(
    [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
    (c) => ctr(c, col) >= 1.5 && ctr(c, sc.bg) >= 2,
    mix(col, sc.bg, 0.45),
  )

/** 网纹填充类加工的公共 apply：tone = 同色系底，duo = 强调色底，lines = 横线条 */
function patternTreat(
  kind: NonNullable<TextItem['pattern']>,
  alt?: TextItem['pattern'],
): TreatDef['apply'] {
  return function (env: Env, it: TextItem, P: Params): void {
    if (!alive(it)) return
    const sc = env.sc
    const col = colOf(env, it)
    it.pattern = P.v === 'lines' && alt ? alt : kind
    it.patternColor = col
    if (P.v === 'duo') {
      it.patternBg = accentFor(sc, col, 1.6)
    } else {
      it.patternBg = mix(col, sc.bg, 0.62)
      it.strokeColor = col
      sized(it, env, (i) => {
        i.stroke = Math.max(1.2, i.size * 0.018)
      })
    }
  }
}

/* ================= 背景图形助手 ================= */
/** 淡层次色（k ≈ 0.05..0.15）与淡强调色 */
const layC = (sc: Scheme, k: number): string => mix(sc.bg, sc.fg, k)
const tintC = (sc: Scheme, k: number): string => mix(sc.bg, sc.accent, k)
const Umin = (env: Env): number => Math.min(env.W, env.H)
const bs = (rng: Rng): number => rng.int(1, 1e9)
/** 本背景已经跑了多久（连续同 bg 的多个 cut 算一段） */
const bgRun = new WeakMap<Cut, number>()
const bgT = (env: Env): number => {
  const c = env.cut
  if (!c) return env.t
  let s = bgRun.get(c)
  if (s == null) {
    s = c.start
    const cs = (env.plan && env.plan.cuts) || []
    const P0 = c.bgP || {}
    for (let i = ((c.index ?? 0) | 0) - 1; i >= 0 && i < cs.length; i--) {
      const p = cs[i]
      if (p.bg === c.bg && (p.bgP || {}).seed === P0.seed && Math.abs(p.end - s) < 0.06) s = p.start
      else break
    }
    bgRun.set(c, s)
  }
  return env.t - s
}
const wrap = (v: number, m: number): number => ((v % m) + m) % m
/** 網点场按 行/尺寸/色 预渲染一次（逐帧画 2000 个点是画不动的），之后只滚动不到一格 */
const htCache = new Map<string, HTMLCanvasElement>()

/** 二色分割里的色块：lay = 层次色，tint = 强调色 */
const splitCol = (sc: Scheme, P: SplitP): string =>
  P.c === 'tint' ? tintC(sc, (P.k || 0.08) * 1.8) : layC(sc, P.k || 0.08)

/** 旧 bgReg：统一包 save/restore，并把 ctx 递进内部画法 */
type BgInner = Omit<BgDef, 'draw'> & {
  draw: (env: Env, P: Params, ctx: CanvasRenderingContext2D) => void
}
const mkBg = (d: BgInner): BgDef => ({
  ...d,
  draw(env, P0) {
    const ctx = env.ctx
    ctx.save()
    try {
      d.draw(env, P0 || {}, ctx)
    } finally {
      ctx.restore()
    }
  },
})

/* ================= 镜头运动助手 ================= */
const KM = (env: Env): number => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25)
const cuOf = (env: Env): number => clamp(env.lt / Math.max(0.3, env.cut ? env.cut.dur : 1))
/** 平移曲线：两端慢、中段匀速 */
const panP = (u: number): number => u * 0.6 + E.inOutSine(u) * 0.4
const lagOf = (env: Env): number => Math.max(0, (env.ltb ?? env.lt) - env.lt)

const stepCache = new WeakMap<Cut, { n: number; v: number[] }>()
/** 段階ズーム的落点：cut 内按节拍取 n 个相对时间，没有节拍就等分 */
const stepTimes = (env: Env, n: number): number[] => {
  const c = env.cut
  if (!c) return []
  const ts = stepCache.get(c)
  if (ts && ts.n === n) return ts.v
  const beats = (env.plan && env.plan.beats) || []
  const v: number[] = []
  if (beats.length) {
    for (const b of beats) {
      if (b <= c.start + 0.2 || b >= c.end - 0.15) continue
      const q = b - c.start
      if (!v.length || q - v[v.length - 1] >= 0.3) v.push(q)
      if (v.length >= n) break
    }
  }
  if (!v.length) for (let i = 0; i < n; i++) v.push(c.dur * ((i + 1) / (n + 1)))
  stepCache.set(c, { n, v })
  return v
}

/* ================= 后期特效助手 ================= */
const bell = (k: number): number => Math.sin(Math.PI * clamp(k))
/** 事件时间量化成 hash 种子：同一事件每一帧随机结果一致 */
const evS = (ev: PlanEvent): number => hash(Math.round(ev.t * 1000), 7331)
const ampOf = (ev: PlanEvent): number => clamp(ev.amp ?? 1, 0.3, 1.6)
/** 0 → 1（在 b 处完全遮住）→ 0 */
const cover = (
  k: number,
  b: number,
  inE: (x: number) => number = E.inCubic,
  outE: (x: number) => number = E.outCubic,
): number => (k < b ? inE(k / b) : 1 - outE((k - b) / Math.max(0.01, 1 - b)))
const inkOf = (sc: Scheme): string => firstOK([sc.ink, sc.fg], (c) => ctr(c, sc.bg) >= 1.6, sc.fg)

/** 旧 fxReg：统一包 save/restore */
type FxInner = Omit<FxDef, 'draw'> & {
  draw: (ctx: CanvasRenderingContext2D, ev: PlanEvent, k: number, I: FxInfo) => void
}
const mkFx = (d: FxInner): FxDef => ({
  ...d,
  draw(ctx, ev, k, I) {
    ctx.save()
    try {
      d.draw(ctx, ev, k, I)
    } finally {
      ctx.restore()
    }
  },
})

/** renderer 只给了 I.tmp 一块 scratch，色散类需要同时持有两块缓冲 */
let SMALL2: HTMLCanvasElement | null = null
const tmp2 = (w: number, h: number): HTMLCanvasElement =>
  ensure(SMALL2 || (SMALL2 = makeCanvas(w, h)), w, h)

/** トラッキングノイズ的条纹噪点纹理（建一次，确定性） */
let NOISE: HTMLCanvasElement | null = null
const noiseTex = (): HTMLCanvasElement => {
  if (NOISE) return NOISE
  const w = 256
  const h = 64
  const c = makeCanvas(w, h)
  const x = ctxOf(c)
  const id = x.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const run = 1 + (hash(y, 3) % 7)
    for (let i = 0; i < w; i++) {
      const v = Math.pow(r(y, Math.floor(i / run), 11), 2.2) * 255
      const p = (y * w + i) * 4
      id.data[p] = v
      id.data[p + 1] = v
      id.data[p + 2] = v
      id.data[p + 3] = 255
    }
  }
  x.putImageData(id, 0, 0)
  NOISE = c
  return c
}

/** 黒コマ / 白コマ：整帧单色，一半概率只占前半程（真"抽一帧"） */
const koma = (col: string): FxInner => ({
  tags: col === '#000000' ? ['editorial', 'emotional', 'glitch'] : ['emotional', 'pop'],
  dur: 2,
  pre: 1,
  amp: 1,
  mid: false,
  draw(ctx, ev, k, I) {
    const one = r(evS(ev), 9) < 0.5
    if (one && k >= 0.5) return
    ctx.fillStyle = col
    ctx.fillRect(0, 0, I.cw, I.ch)
  },
})

/* ---------- 各部件的 params：plan 产出、apply/draw 消费 ---------- */
type OutlineP = { k: number }
type OutlineFillP = { k: number; c: number }
type DoubleOutlineP = { a: number; b: number }
type ExtrudeP = { d: number; dir: number[]; c: number }
type LongShadowP = { L: number; ang: number }
type HardShadowP = { d: number; dir: number[] }
type SoftShadowP = { b: number; dy: number }
type GlowP = { b: number; self: boolean }
type MarkerP = { v: string; c: number }
type UnderlineP = { v: string; k: number }
type StrikeP = { v: string; ang: number; k: number }
type BoxedP = { v: string }
type GradientVP = { up: boolean; g: boolean }
type SplitColorP = { sp: number; top: boolean }
type PatternP = { v: string }
type DottedP = { k: number; spd: number }
type AlternateP = { v: string }
type ItalicP = { a: number }
type EchoOutlineP = { v: string; n: number; d: number }
type EmphasisDotsP = { v: string }

type SunburstP = { seed: number; n: number; cx: number; cy: number; spd: number; k: number }
type ConcentricP = { seed: number; gap: number; spd: number; k: number; cy: number }
type HalftoneFadeP = { seed: number; dir: number; cell: number; k: number }
type BigStripesP = {
  seed: number
  ang: number
  w: number
  spd: number
  fill: number
  k: number
}
type SplitP = { seed: number; side: number; pos: number; c: string; k: number }
type SplitDiagP = SplitP & { ang: number }
type GradientSweepP = { seed: number; spd: number; k: number; c: string; a0: number }
type SpotlightP = { seed: number; beam: boolean; k: number }
type TvBarsP = { seed: number; n: number; spd: number; k: number }
type CheckerP = { seed: number; n: number; k: number; spd: number; rot: number }
type BigCharP = { seed: number; side: number; font: string; outline: boolean; k: number }
type SpeedLinesP = { seed: number; n: number; k: number; clear: number }
type ScanBarsP = { seed: number; n: number; spd: number; k: number }
type DotGridP = { seed: number; sp: number; k: number; plus: boolean }
type RetroGridP = { seed: number; hz: number; spd: number; sun: boolean; k: number }
type BokehP = { seed: number; n: number; k: number }
type ParticlesP = { seed: number; n: number; k: number; sq: boolean }
type RipplesP = { seed: number; centre: boolean; life: number; k: number }
type PolkaP = { seed: number; sp: number; r: number; k: number; acc: boolean }
type EqBarsP = { seed: number; n: number; mode: string; seg: boolean; k: number }
type BorderFrameP = { seed: number; th: number; m: number; acc: boolean; dbl: boolean }
type LetterboxP = { seed: number; k: number; line: boolean }
type NoiseFieldP = { seed: number; n: number; k: number; th: number }

type PullOutP = { a: number }
type PanP = { a: number }
type TiltP = { a: number }
type DutchP = { dir: number; a: number }
type HandheldP = { f: number }
type BeatPunchP = { a: number }
type WhipInP = { dir: string; d: number }
type CrashZoomP = { at: number; a: number }
type BounceP = { a: number }
type RollP = { dir: number; a: number }
type DriftDiagP = { dx: number; dy: number }
type DollyInP = { a: number }
type StepZoomP = { n: number; a: number }

export const pack: PackParts = {
  treat: {
    /* 袋文字：只描边不填充 */
    outline: {
      tags: ['graphic', 'pop', 'glitch', 'emotional'],
      w: 1.2,
      plan: (rng): OutlineP => ({ k: rng.range(0.022, 0.038) }),
      apply(env, it, P0) {
        const P = P0 as unknown as OutlineP
        if (!alive(it, 0.5) || inPieces(env, it)) return
        it.strokeColor = colOf(env, it)
        it.fill = false
        sized(it, env, (i) => {
          i.stroke = Math.max(1.4, i.size * (P.k || 0.03))
        })
      },
    },

    /* 縁取り：字形下面压一圈粗描边 */
    outlineFill: {
      tags: ['pop', 'graphic'],
      w: 1,
      plan: (rng): OutlineFillP => ({ k: rng.range(0.075, 0.12), c: rng.int(0, 2) }),
      apply(env, it, P0) {
        const P = P0 as unknown as OutlineFillP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        it.strokeColor =
          P.c === 2
            ? firstOK([sc.accent2, sc.accent], (c) => ctr(c, col) >= 1.8, accentFor(sc, col, 1.8))
            : accentFor(sc, col, 1.8)
        it.strokeUnder = true
        sized(it, env, (i) => {
          i.stroke = Math.max(2, i.size * (P.k || 0.09))
        })
      },
    },

    /* 二重縁：内圈留缝色 + 外圈强调色 */
    doubleOutline: {
      tags: ['pop', 'graphic'],
      w: 0.7,
      plan: (rng): DoubleOutlineP => ({ a: rng.range(0.07, 0.09), b: rng.range(0.08, 0.11) }),
      apply(env, it, P0) {
        const P = P0 as unknown as DoubleOutlineP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const ring = accentFor(sc, col, 1.6)
        const gap =
          ctr(sc.bg, col) >= 1.5 && ctr(sc.bg, ring) >= 1.3
            ? sc.bg
            : best([sc.ink, sc.fg, '#000000', '#FFFFFF'], ring)
        it.strokeColor = gap
        it.strokeUnder = true
        sized(it, env, (i) => {
          i.stroke = Math.max(2, i.size * P.a)
        })
        // 外圈：垫在主体下面的一份纯描边副本
        addPre(it, (e, i) => {
          const c: TextItem = {
            ...i,
            pre: undefined,
            post: undefined,
            echo: null,
            streak: null,
            shadow: undefined,
            extrude: undefined,
            pattern: undefined,
            gradient: undefined,
            fill: false,
            strokeUnder: false,
            strokeDash: undefined,
            stroke: Math.max(4, i.size * (P.a + P.b)),
            strokeColor: ring,
            wipeBar: null,
            cursorAt: undefined,
          }
          withFx(e, i, () => drawItem(e, c), false)
        })
      },
    },
    /* 立体：沿一个方向叠 N 份副本挤出厚度 */
    extrude: {
      tags: ['pop', 'graphic'],
      w: 0.9,
      plan: (rng): ExtrudeP => ({
        d: rng.range(0.09, 0.13),
        dir: rng.pick([
          [1, 1],
          [1, 1],
          [-1, 1],
          [1, 0.55],
        ]),
        c: rng.int(0, 1),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as ExtrudeP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const N = glyphN(it.text)
        const base = P.c
          ? firstOK(
              [sc.ink, sc.accent2],
              (c) => ctr(c, col) >= 1.6 && ctr(c, sc.bg) >= 1.4,
              accentFor(sc, col, 1.6),
            )
          : accentFor(sc, col, 1.6)
        const ec = mix(base, '#000000', isDark(sc.bg) ? 0.3 : 0.2)
        sized(it, env, (i) => {
          const L = i.size * P.d
          i.extrude = {
            n: clamp(Math.round(L / 2.5), 4, N > 10 ? 12 : 22),
            dx: P.dir[0] * L,
            dy: P.dir[1] * L,
            color: ec,
          }
        })
      },
    },

    /* 長い影：一路拉长的渐变影 */
    longShadow: {
      tags: ['pop', 'graphic'],
      w: 0.6,
      plan: (rng): LongShadowP => ({
        L: rng.range(0.35, 0.65),
        ang: rng.pick([45, 45, 35, 60, 135]),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as LongShadowP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const N = glyphN(it.text)
        const sh = isDark(sc.bg)
          ? mix(sc.bg, accentFor(sc, col, 1.5), 0.5)
          : mix(sc.bg, sc.fg, 0.28)
        const ca = Math.cos(P.ang * DEG)
        const sa = Math.sin(P.ang * DEG)
        sized(it, env, (i) => {
          const L = i.size * P.L
          i.extrude = {
            n: clamp(Math.round(L / Math.max(2, i.size * 0.018)), 10, N > 10 ? 14 : 24),
            dx: ca * L,
            dy: sa * L,
            color: sh,
            fade: true,
            a: 0.9,
          }
        })
      },
    },

    /* ずらし影：只偏移一次的实心影 */
    hardShadow: {
      tags: ['pop', 'graphic', 'glitch'],
      w: 1,
      plan: (rng): HardShadowP => ({
        d: rng.range(0.05, 0.085),
        dir: rng.pick([
          [1, 1],
          [1, 1],
          [-1, 1],
          [1, -1],
          [0.45, 1],
        ]),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as HardShadowP
        if (!alive(it)) return
        const sh = accentFor(env.sc, colOf(env, it), 1.6)
        sized(it, env, (i) => {
          const L = i.size * P.d
          i.extrude = { n: 1, dx: P.dir[0] * L, dy: P.dir[1] * L, color: sh }
        })
      },
    },

    /* ぼかし影：canvas 阴影 */
    softShadow: {
      tags: ['calm', 'emotional', 'editorial'],
      w: 0.8,
      safe: true,
      plan: (rng): SoftShadowP => ({ b: rng.range(0.08, 0.14), dy: rng.range(0.03, 0.07) }),
      apply(env, it, P0) {
        const P = P0 as unknown as SoftShadowP
        if (!alive(it)) return
        const sc = env.sc
        const c = isDark(sc.bg)
          ? rgba(mix(sc.bg, sc.accent, 0.45), 0.75)
          : rgba(mix(sc.fg, '#000000', 0.5), 0.36)
        sized(it, env, (i) => {
          i.shadow = { color: c, blur: i.size * P.b, dx: i.size * 0.02, dy: i.size * P.dy }
        })
      },
    },

    /* 発光：小字号走 canvas 阴影，大字号走离屏降采样模糊 */
    glow: {
      tags: ['emotional', 'calm', 'glitch'],
      w: 0.9,
      safe: true,
      plan: (rng): GlowP => ({ b: rng.range(0.16, 0.26), self: rng.chance(0.5) }),
      apply(env, it, P0) {
        const P = P0 as unknown as GlowP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const dk = isDark(sc.bg)
        const gc = dk
          ? firstOK(
              P.self ? [col, sc.accent, sc.accent2] : [sc.accent, sc.accent2, col],
              (c) => lum(c) > lum(sc.bg) + 0.2,
              col,
            )
          : firstOK(
              [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
              (c) => ctr(c, sc.bg) >= 2 && lum(c) > 0.08 && ctr(c, col) >= 1.4,
              col,
            )
        const small = (i: TextItem): boolean => i.size < Math.min(env.W, env.H) * 0.09
        sized(it, env, (i, e) => {
          i.shadow =
            e.allowFilter && !small(i)
              ? undefined
              : { color: rgba(gc, 0.95), blur: i.size * P.b * 0.6, dx: 0, dy: 0 }
        })
        addPre(it, (e, i) => {
          if (e.pass === 'main' && e.allowFilter && !small(i))
            withFx(e, i, () => halo(e, i, gc, P.b * (0.9 + 0.1 * Math.sin(e.ltb * 3.2)), dk), false)
        })
      },
    },
    /* マーカー：荧光笔从左向右扫过，扫到的字翻色 */
    marker: {
      tags: ['pop', 'graphic', 'editorial'],
      w: 1,
      plan: (rng): MarkerP => ({ v: rng.pick(['box', 'box', 'skew', 'half']), c: rng.int(0, 1) }),
      apply(env, it, P0) {
        const P = P0 as unknown as MarkerP
        if (!alive(it, 0.9)) return
        const sc = env.sc
        const col = colOf(env, it)
        const half = P.v === 'half'
        const box = half
          ? fitContrast(
              firstOK([sc.accent, sc.accent2], (c) => ctr(c, col) >= 2, sc.accent),
              col,
              2.2,
            )
          : firstOK(
              P.c ? [sc.accent2, sc.accent, sc.ink, sc.fg] : [sc.accent, sc.accent2, sc.ink, sc.fg],
              (c) => ctr(c, sc.bg) >= 2.2,
              sc.fg,
            )
        const tc = half ? col : textOn(box, col, sc)
        const prog = (e: Env, li: number): [number, number] => [
          E.inCubic(e.pOut),
          E.outExpo(inP(e, it, li * 0.07, 0.32)),
        ]
        if (tc !== col) {
          const fr = lineFracs(it)
          pushChar(it, (gi, g) => {
            const [o, q] = prog(env, g.li)
            const f = fr[gi] ?? 0.5
            return f >= o && f <= q ? { color: tc } : null
          })
        }
        addPre(it, (e, i) =>
          withFx(e, i, () => {
            const s = i.size
            const sx = i.sx || 1
            const sy = i.sy || 1
            const a = i.alpha ?? 1
            for (const L of lineSpans(i)) {
              const [o, q] = prog(e, L.li)
              if (q <= 0 || o >= 1) continue
              const pad = s * 0.14
              const a0 = L.a0 - pad
              const len = L.a1 + pad - a0
              const p0 = a0 + len * o
              const p1 = a0 + len * q
              if (p1 - p0 < 1) continue
              const th = s * (i.vertical ? sx : sy) * (half ? 0.52 : 1.08)
              const c0 = half ? L.c + s * (i.vertical ? sx : sy) * 0.02 : L.c - th / 2
              if (!i.vertical) {
                if (P.v === 'skew') {
                  const k = th * 0.22
                  e.poly(
                    [
                      [p0 + k, c0],
                      [p1 + k, c0],
                      [p1 - k, c0 + th],
                      [p0 - k, c0 + th],
                    ],
                    box,
                    a,
                    true,
                  )
                } else e.rect(p0, c0, p1 - p0, th, box, half ? a * 0.92 : a, true)
              } else if (P.v === 'skew') {
                const k = th * 0.22
                e.poly(
                  [
                    [c0, p0 - k],
                    [c0 + th, p0 + k],
                    [c0 + th, p1 + k],
                    [c0, p1 - k],
                  ],
                  box,
                  a,
                  true,
                )
              } else e.rect(c0, p0, th, p1 - p0, box, half ? a * 0.92 : a, true)
            }
          }),
        )
      },
    },

    /* 下線：横条 / 双细线 / 波形，随入场逐行画出 */
    underline: {
      tags: ['editorial', 'calm', 'graphic'],
      w: 0.8,
      plan: (rng): UnderlineP => ({
        v: rng.pick(['bar', 'bar', 'double', 'wave']),
        k: rng.range(0.05, 0.075),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as UnderlineP
        if (!alive(it, 0.9) || glyphN(it.text) < 2) return
        const lc = markCol(env.sc, colOf(env, it))
        addPost(it, (e, i) =>
          withFx(e, i, () => {
            const s = i.size
            const a = i.alpha ?? 1
            const o = E.inCubic(e.pOut)
            const cross = s * (i.vertical ? i.sx || 1 : i.sy || 1)
            lineSpans(i).forEach((L, k) => {
              const q = E.outExpo(inP(e, i, 0.08 + k * 0.08, 0.45))
              if (q <= 0 || o >= 1) return
              const a0 = L.a0 - s * 0.04
              const len = L.a1 + s * 0.04 - a0
              const p0 = a0 + len * o
              const p1 = a0 + len * q
              if (p1 - p0 < 1) return
              const off = L.c + cross * 0.6
              const th = Math.max(2, s * P.k)
              const pt = (u: number, d: number): [number, number] =>
                i.vertical ? [off + d, u] : [u, off + d]
              if (P.v === 'wave') {
                const pts: [number, number][] = []
                const wl = s * 0.32
                const m = Math.min(160, Math.ceil((p1 - p0) / (wl / 8)) + 1)
                for (let j = 0; j < m; j++) {
                  const u = p0 + ((p1 - p0) * j) / (m - 1)
                  pts.push(pt(u, Math.sin(((u - a0) / wl) * TAU) * th * 0.7))
                }
                e.line(pts, lc, th * 0.75, a, false)
              } else if (P.v === 'double') {
                e.line([pt(p0, -th * 0.55), pt(p1, -th * 0.55)], lc, th * 0.42, a, false)
                e.line([pt(p0, th * 0.55), pt(p1, th * 0.55)], lc, th * 0.42, a, false)
              } else e.line([pt(p0, 0), pt(p1, 0)], lc, th, a, false)
            })
          }),
        )
      },
    },

    /* 取り消し線：整条划掉 */
    strike: {
      tags: ['glitch', 'editorial', 'emotional'],
      w: 0.5,
      plan: (rng): StrikeP => ({
        v: rng.pick(['one', 'one', 'two']),
        ang: rng.range(-4, 4),
        k: rng.range(0.06, 0.085),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as StrikeP
        if (!alive(it, 0.9)) return
        const sc = env.sc
        const lc = accentFor(sc, colOf(env, it), 1.8)
        addPost(it, (e, i) =>
          withFx(e, i, () => {
            const s = i.size
            const a = i.alpha ?? 1
            const o = E.inCubic(e.pOut)
            const ctx = e.ctx
            lineSpans(i).forEach((L, k) => {
              const q = E.outExpo(inP(e, i, (e.cut ? e.cut.inDur : 0) * 0.7 + k * 0.1, 0.3))
              if (q <= 0 || o >= 1) return
              const a0 = L.a0 - s * 0.08
              const len = L.a1 + s * 0.08 - a0
              const p0 = a0 + len * o
              const p1 = a0 + len * q
              if (p1 - p0 < 1) return
              const th = Math.max(2, s * P.k)
              const mid = (L.a0 + L.a1) / 2
              ctx.save()
              if (i.vertical) {
                ctx.translate(L.c, mid)
                ctx.rotate(P.ang * DEG)
              } else {
                ctx.translate(mid, L.c + s * 0.02)
                ctx.rotate(P.ang * DEG)
              }
              const pt = (u: number, d: number): [number, number] =>
                i.vertical ? [d, u - mid] : [u - mid, d]
              if (P.v === 'two') {
                e.line([pt(p0, -th * 0.8), pt(p1, -th * 0.8)], lc, th * 0.6, a, true)
                e.line([pt(p0, th * 0.8), pt(p1, th * 0.8)], lc, th * 0.6, a, true)
              } else e.line([pt(p0, 0), pt(p1, 0)], lc, th, a, true)
              ctx.restore()
            })
          }),
        )
      },
    },

    /* 箱組：每字一个色块（实底 / 交替色 / 只留框） */
    boxed: {
      tags: ['graphic', 'editorial', 'pop'],
      w: 0.7,
      plan: (rng): BoxedP => ({ v: rng.pick(['solid', 'solid', 'alt', 'frame']) }),
      apply(env, it, P0) {
        const P = P0 as unknown as BoxedP
        if (!alive(it, 0.9)) return
        const sc = env.sc
        const col = colOf(env, it)
        const frame = P.v === 'frame'
        const off = (it.mi ?? 0) | 0
        const boxA = firstOK([sc.ink, sc.fg, sc.accent], (c) => ctr(c, sc.bg) >= 2.2, sc.fg)
        const boxB =
          P.v === 'alt'
            ? firstOK(
                [sc.accent, sc.accent2],
                (c) => ctr(c, boxA) >= 1.5 && ctr(c, sc.bg) >= 1.8,
                boxA,
              )
            : boxA
        const tcA = frame ? col : textOn(boxA, sc.bg, sc)
        const tcB = frame ? col : textOn(boxB, sc.bg, sc)
        const qOf = (e: Env, gi: number): number =>
          E.outBack(clamp((e.lt - (it.delay || 0) - gi * 0.035) / 0.24), 1.7) *
          (1 - E.inCubic(clamp(e.pOut * 1.4 - gi * 0.03)))
        const alt = (gi: number): boolean => P.v === 'alt' && (gi + off) % 2 === 1
        if (!frame)
          pushChar(it, (gi) => (qOf(env, gi) > 0.55 ? { color: alt(gi) ? tcB : tcA } : null))
        addPre(it, (e, i) =>
          withFx(e, i, () => {
            const s = i.size
            const sx = i.sx || 1
            const sy = i.sy || 1
            const a = i.alpha ?? 1
            const ctx = e.ctx
            for (const G of glyphList(i)) {
              const q = qOf(e, G.g.i)
              if (q <= 0.01) continue
              const w = i.vertical ? s * sx * 1.02 : Math.max(G.w * 0.94, s * sx * 0.42)
              const h = i.vertical ? Math.max(G.h * 0.94, s * sy * 0.42) : s * sy * 1.02
              const c = alt(G.g.i) ? boxB : boxA
              ctx.save()
              ctx.translate(G.x, G.y)
              if (G.rot) ctx.rotate(G.rot * DEG)
              ctx.scale(G.s * q, G.s * q)
              if (frame)
                e.rrect(-w / 2, -h / 2, w, h, 0, null, a * G.a, true, c, Math.max(1.5, s * 0.035))
              else e.rect(-w / 2, -h / 2, w, h, c, a * G.a, true)
              ctx.restore()
            }
          }),
        )
      },
    },

    /* 縦グラデ：竖向渐变填充 */
    gradientV: {
      tags: ['emotional', 'pop'],
      w: 0.9,
      plan: (rng): GradientVP => ({ up: rng.chance(0.4), g: rng.chance(0.5) }),
      apply(env, it, P0) {
        const P = P0 as unknown as GradientVP
        if (!alive(it) || inPieces(env, it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const g =
          P.g && sc.grad && sc.grad.every((c) => ctr(c, sc.bg) >= 1.6)
            ? sc.grad.slice()
            : [col, twoTone(sc, col)]
        if (P.up) g.reverse()
        it.gradient = g
      },
    },

    /* 上下二色：硬切的双色渐变 */
    splitColor: {
      tags: ['pop', 'graphic'],
      w: 0.8,
      plan: (rng): SplitColorP => ({ sp: rng.range(0.5, 0.57), top: rng.chance(0.35) }),
      apply(env, it, P0) {
        const P = P0 as unknown as SplitColorP
        if (!alive(it) || inPieces(env, it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const c2 = twoTone(sc, col)
        const a = P.top ? c2 : col
        const b = P.top ? col : c2
        it.gradient = [
          [0, a],
          [P.sp, a],
          [P.sp, b],
          [1, b],
        ]
      },
    },

    halftone: {
      tags: ['pop', 'graphic'],
      w: 0.7,
      plan: (rng): PatternP => ({ v: rng.pick(['tone', 'tone', 'duo']) }),
      apply: patternTreat('dots'),
    },

    stripes: {
      tags: ['pop', 'graphic'],
      w: 0.6,
      plan: (rng): PatternP => ({ v: rng.pick(['tone', 'duo', 'lines']) }),
      apply: patternTreat('stripes', 'lines'),
    },

    hatch: {
      tags: ['graphic', 'editorial', 'glitch'],
      w: 0.5,
      plan: (rng): PatternP => ({ v: rng.pick(['tone', 'tone', 'duo']) }),
      apply: patternTreat('hatch'),
    },

    /* 点線輪郭：只描边 + 缓慢流动的虚线 */
    dotted: {
      tags: ['calm', 'editorial', 'graphic'],
      w: 0.5,
      plan: (rng): DottedP => ({ k: rng.range(0.03, 0.04), spd: rng.pick([0, 1, 1]) }),
      apply(env, it, P0) {
        const P = P0 as unknown as DottedP
        if (!alive(it, 0.5) || inPieces(env, it)) return
        it.strokeColor = colOf(env, it)
        it.fill = false
        sized(it, env, (i, e) => {
          const s = i.size
          const a = s * 0.05
          const g = s * 0.036
          const per = a + g
          i.stroke = Math.max(1.6, s * P.k)
          const off = P.spd ? (((e.ltb * s * 0.22) % per) + per) % per : 0
          i.strokeDash = off < a ? [a - off, g, off, 0] : [0, g - (off - a), a, off - a]
        })
      },
    },
    /* 交互色：隔字换色，或只把汉字换成强调色 */
    alternate: {
      tags: ['pop', 'graphic'],
      w: 0.8,
      plan: (rng): AlternateP => ({ v: rng.pick(['alt', 'alt', 'kanji']) }),
      apply(env, it, P0) {
        const P = P0 as unknown as AlternateP
        if (!alive(it)) return
        const sc = env.sc
        const col = colOf(env, it)
        const c2 = accentFor(sc, col, 1.6)
        const chars = [...it.text].filter((c) => c.trim())
        // 旧判定是 kanji + katakana，中文等价物就是汉字
        const isK = (c: string): boolean => isHan(c)
        const mixed = chars.some(isK) && chars.some((c) => !isK(c))
        if (P.v === 'kanji' && (mixed || chars.length === 1))
          pushChar(it, (_gi, g) => (isK(g.ch) ? { color: c2 } : null))
        else {
          const off = (it.mi ?? 0) | 0
          pushChar(it, (gi) => ((gi + off) % 2 ? { color: c2 } : null))
        }
      },
    },

    /* 斜体：横排 shear，竖排逐字旋转（JIZURA假名斜体的中文等价） */
    italic: {
      tags: ['editorial', 'pop', 'emotional'],
      w: 0.8,
      safe: true,
      plan: (rng): ItalicP => ({ a: rng.range(10, 15) }),
      apply(_env, it, P0) {
        const P = P0 as unknown as ItalicP
        if (!it.text) return
        if (it.vertical) {
          const sk = P.a * 0.65
          pushChar(it, () => ({ rot: sk }))
        } else it.skew = (it.skew || 0) - P.a
      },
    },

    /* 平体：压扁拉宽（原本塞得下的行不能被推出画面） */
    wide: {
      tags: ['graphic', 'pop'],
      w: 0.7,
      safe: true,
      apply(env, it) {
        if (!it.text) return
        if (!it.vertical) {
          const w0 = measure(it).w
          const lim = env.W * 0.9
          it.sx = (it.sx || 1) * 1.1
          if (w0 <= lim && w0 * 1.1 > lim) it.size *= lim / (w0 * 1.1)
        }
        it.sy = (it.sy || 1) * 0.84
      },
    },

    /* 長体：压窄拉长 */
    tall: {
      tags: ['editorial', 'calm', 'graphic', 'emotional'],
      w: 0.7,
      safe: true,
      apply(_env, it) {
        if (!it.text) return
        it.sx = (it.sx || 1) * 0.8
        if (it.vertical) it.sy = (it.sy || 1) * 1.02
        else {
          it.sy = (it.sy || 1) * 1.05
          it.size *= 1.05
        }
      },
    },

    /* 輪郭の残響：几层描边副本随入场散开 */
    echoOutline: {
      tags: ['glitch', 'emotional', 'graphic'],
      w: 0.7,
      plan: (rng): EchoOutlineP => ({
        v: rng.pick(['diag', 'diag', 'zoom', 'rise', 'side']),
        n: rng.int(3, 4),
        d: rng.range(0.045, 0.07),
      }),
      apply(env, it, P0) {
        const P = P0 as unknown as EchoOutlineP
        if (!alive(it)) return
        const c = accentFor(env.sc, colOf(env, it), 1.4)
        sized(it, env, (i, e) => {
          const amt =
            E.outCubic(inP(e, i, 0.05, 0.45)) *
            (1 - E.inCubic(e.pOut)) *
            (0.85 + 0.15 * Math.sin(e.ltb * 3.4))
          if (amt <= 0.01) {
            i.echo = null
            return
          }
          const d = i.size * P.d * amt
          const o: NonNullable<TextItem['echo']> = {
            n: P.n,
            a: 0.8,
            decay: 0.72,
            outline: true,
            color: c,
          }
          if (P.v === 'zoom') o.scale = 1 + 0.035 * amt
          else if (P.v === 'rise') o.dy = -d * 1.2
          else if (P.v === 'side') o.dx = d * 1.3
          else {
            o.dx = d
            o.dy = d
          }
          i.echo = o
        })
      },
    },

    /* 傍点：逐字在字旁点一个记号（点 / 芝麻点 / 空心圈） */
    emphasisDots: {
      tags: ['editorial', 'emotional', 'calm'],
      w: 0.8,
      plan: (rng): EmphasisDotsP => ({ v: rng.pick(['dot', 'dot', 'sesame', 'ring']) }),
      apply(env, it, P0) {
        const P = P0 as unknown as EmphasisDotsP
        if (!alive(it, 0.9)) return
        const dc = markCol(env.sc, colOf(env, it))
        addPost(it, (e, i) =>
          withFx(e, i, () => {
            if (e.pass !== 'main') return
            const s = i.size
            const sx = i.sx || 1
            const sy = i.sy || 1
            const a = i.alpha ?? 1
            const o = 1 - E.inCubic(e.pOut)
            const ctx = e.ctx
            for (const G of glyphList(i)) {
              if (isPunct(G.g.ch)) continue
              const q =
                E.outBack(inP(e, i, (e.cut ? e.cut.inDur : 0) * 0.45 + G.g.i * 0.04, 0.22), 2.2) * o
              if (q <= 0.01) continue
              const rr0 = s * 0.07 * G.s * q * Math.min(sx, sy)
              const x = i.vertical ? G.x + s * sx * 0.64 * G.s : G.x
              const y = i.vertical ? G.y : G.y - s * sy * 0.64 * G.s
              if (P.v === 'ring')
                e.circle(x, y, rr0 * 0.85, null, dc, Math.max(1, rr0 * 0.42), a * G.a, false)
              else if (P.v === 'sesame') {
                ctx.save()
                ctx.globalAlpha = a * G.a
                ctx.fillStyle = dc
                ctx.beginPath()
                ctx.ellipse(x, y, rr0 * 1.25, rr0 * 0.6, -40 * DEG, 0, TAU)
                ctx.fill()
                ctx.restore()
              } else e.circle(x, y, rr0, dc, null, 0, a * G.a, false)
            }
          }),
        )
      },
    },
  },

  bg: {
    /* 放射：从一点散开的楔形光芒 */
    sunburst: mkBg({
      tags: ['pop', 'graphic'],
      w: 0.8,
      plan: (rng): SunburstP => ({
        seed: bs(rng),
        n: rng.pick([12, 16, 20, 24]),
        cx: rng.pick([0.5, 0.5, 0.3, 0.7]),
        cy: rng.pick([0.5, 0.5, 0.62, 1.05]),
        spd: rng.range(3, 7) * rng.pick([1, -1]),
        k: rng.range(0.07, 0.1),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SunburstP
        const { W, H, sc } = env
        const cx = W * (P.cx ?? 0.5)
        const cy = H * (P.cy ?? 0.5)
        const n = P.n || 16
        const e = E.outCubic(clamp(bgT(env) / 0.5))
        const R = Math.hypot(W, H) * 1.1 * (0.25 + 0.75 * e)
        const rot = (env.t * (P.spd || 4) + (1 - e) * 25) * DEG
        const w = (TAU / n) * 0.5
        ctx.fillStyle = layC(sc, P.k || 0.08)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const a0 = rot + (i / n) * TAU
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R)
          ctx.lineTo(cx + Math.cos(a0 + w) * R, cy + Math.sin(a0 + w) * R)
          ctx.closePath()
        }
        ctx.fill()
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Umin(env) * 0.55)
        g.addColorStop(0, rgba(sc.bg, 0.85))
        g.addColorStop(1, rgba(sc.bg, 0))
        const rr0 = Umin(env) * 0.55
        ctx.fillStyle = g
        ctx.fillRect(cx - rr0, cy - rr0, rr0 * 2, rr0 * 2)
      },
    }),

    /* 同心円：一圈圈向外推的细线 */
    concentric: mkBg({
      tags: ['calm', 'graphic', 'emotional'],
      w: 0.9,
      plan: (rng): ConcentricP => ({
        seed: bs(rng),
        gap: rng.range(0.07, 0.11),
        spd: rng.range(0.15, 0.35) * rng.pick([1, 1, -1]),
        k: rng.range(0.08, 0.12),
        cy: rng.pick([0.5, 0.5, 0.58]),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as ConcentricP
        const { W, H, sc } = env
        const cx = W / 2
        const cy = H * (P.cy || 0.5)
        const gap = Umin(env) * (P.gap || 0.09)
        const ph = wrap(env.t * (P.spd || 0.2), 1)
        const pulse = env.beat
          ? Math.exp(-env.beat.since * 5)
          : 0.5 + 0.5 * Math.sin(env.t * TAU * 0.5)
        const Rm = Math.hypot(W, H) * 0.6
        const e = E.outCubic(clamp(bgT(env) / 0.6))
        ctx.lineWidth = gap * (0.14 + 0.1 * pulse)
        ctx.strokeStyle = layC(sc, (P.k || 0.1) * (0.8 + 0.4 * pulse))
        ctx.beginPath()
        for (let rad = ph * gap; rad < Rm * e; rad += gap) {
          if (rad < 2) continue
          ctx.moveTo(cx + rad, cy)
          ctx.arc(cx, cy, rad, 0, TAU)
        }
        ctx.stroke()
      },
    }),

    /* 網点グラデ：沿一个方向渐疏的网点场 */
    halftoneFade: mkBg({
      tags: ['pop', 'graphic', 'editorial'],
      w: 1,
      plan: (rng): HalftoneFadeP => ({
        seed: bs(rng),
        dir: rng.pick([0, 45, 90, 135, 180, 225, 270, 315]),
        cell: rng.range(0.032, 0.045),
        k: rng.range(0.12, 0.17),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as HalftoneFadeP
        const { W, H, sc } = env
        const cell = Umin(env) * (P.cell || 0.032)
        const col = layC(sc, P.k || 0.14)
        const q = Math.min(1, env.scale || 1)
        const key = [P.seed, W, H, q.toFixed(3), col, P.dir, P.cell].join('|')
        let cv = htCache.get(key)
        if (!cv) {
          if (htCache.size > 2) htCache.clear()
          const Wc = W + cell * 2
          const Hc = H + cell * 2
          cv = makeCanvas(Math.ceil(Wc * q), Math.ceil(Hc * q))
          const x = ctxOf(cv)
          const ang = (P.dir || 0) * DEG
          const dx = Math.cos(ang)
          const dy = Math.sin(ang)
          const ext = (Math.abs(dx) * W) / 2 + (Math.abs(dy) * H) / 2
          x.scale(q, q)
          x.fillStyle = col
          x.beginPath()
          let row = 0
          for (let y = 0; y < Hc + cell; y += cell * 0.866, row++) {
            for (let px = ((row & 1) * cell) / 2; px < Wc + cell; px += cell) {
              const u = ((px - cell - W / 2) * dx + (y - cell - H / 2) * dy) / ext
              const rad = cell * 0.52 * smooth(-0.8, 1, u)
              if (rad < cell * 0.06) continue
              x.moveTo(px + rad, y)
              x.arc(px, y, rad, 0, TAU)
            }
          }
          x.fill()
          htCache.set(key, cv)
        }
        ctx.globalAlpha = E.outCubic(clamp(bgT(env) / 0.5))
        ctx.drawImage(
          cv,
          -cell * 2 + wrap(env.t * cell * 0.35, cell),
          -cell,
          W + cell * 2,
          H + cell * 2,
        )
      },
    }),

    /* 大きな斜線：整屏斜向条纹缓慢平移 */
    bigStripes: mkBg({
      tags: ['graphic', 'pop'],
      w: 0.9,
      plan: (rng): BigStripesP => ({
        seed: bs(rng),
        ang: rng.pick([30, 45, -30, -45, 60]),
        w: rng.range(0.06, 0.11),
        spd: rng.range(0.03, 0.08) * rng.pick([1, -1]),
        fill: rng.pick([0.5, 0.5, 0.3]),
        k: rng.range(0.05, 0.08),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as BigStripesP
        const { W, H, sc } = env
        const R = Math.hypot(W, H) / 2 + 10
        const per = Umin(env) * (P.w || 0.08) * 2
        const e = E.outExpo(clamp(bgT(env) / 0.5))
        const off = wrap(env.t * Umin(env) * (P.spd || 0.05), per)
        ctx.translate(W / 2, H / 2)
        ctx.rotate((P.ang || 45) * DEG)
        ctx.fillStyle = layC(sc, P.k || 0.06)
        ctx.beginPath()
        for (let x = -R - per + off; x < R; x += per)
          ctx.rect(x, -R, per * (P.fill || 0.5) * e, 2 * R)
        ctx.fill()
      },
    }),

    /* 左右二色：竖向分割面 + 分界亮线 */
    splitV: mkBg({
      tags: ['graphic', 'editorial', 'pop'],
      w: 1,
      plan: (rng): SplitP => ({
        seed: bs(rng),
        side: rng.pick([1, -1]),
        pos: rng.range(0.4, 0.6),
        c: rng.pick(['lay', 'lay', 'tint']),
        k: rng.range(0.08, 0.12),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SplitP
        const { W, H, sc } = env
        const e = E.outExpo(clamp(bgT(env) / 0.5))
        const x = W * ((P.pos || 0.5) + 0.012 * Math.sin(env.t * 0.6))
        const right = (P.side || 1) > 0
        const edge = right ? lerp(W, x, e) : lerp(0, x, e)
        ctx.fillStyle = splitCol(sc, P)
        if (right) ctx.fillRect(edge, 0, W - edge + 1, H)
        else ctx.fillRect(-1, 0, edge + 1, H)
        ctx.globalAlpha = 0.6 * e
        ctx.fillStyle = tintC(sc, 0.45)
        ctx.fillRect(edge - 1, 0, 2, H)
      },
    }),

    /* 上下二色 */
    splitH: mkBg({
      tags: ['graphic', 'editorial', 'calm'],
      w: 0.9,
      plan: (rng): SplitP => ({
        seed: bs(rng),
        side: rng.pick([1, -1]),
        pos: rng.range(0.42, 0.6),
        c: rng.pick(['lay', 'lay', 'tint']),
        k: rng.range(0.08, 0.12),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SplitP
        const { W, H, sc } = env
        const e = E.outExpo(clamp(bgT(env) / 0.5))
        const y = H * ((P.pos || 0.5) + 0.012 * Math.sin(env.t * 0.5))
        const low = (P.side || 1) > 0
        const edge = low ? lerp(H, y, e) : lerp(0, y, e)
        ctx.fillStyle = splitCol(sc, P)
        if (low) ctx.fillRect(0, edge, W, H - edge + 1)
        else ctx.fillRect(0, -1, W, edge + 1)
        ctx.globalAlpha = 0.6 * e
        ctx.fillStyle = tintC(sc, 0.45)
        ctx.fillRect(0, edge - 1, W, 2)
      },
    }),

    /* 斜め二色 */
    splitDiag: mkBg({
      tags: ['graphic', 'pop'],
      w: 1,
      plan: (rng): SplitDiagP => ({
        seed: bs(rng),
        side: rng.pick([1, -1]),
        pos: rng.range(0.42, 0.58),
        ang: rng.range(14, 30) * rng.pick([1, -1]),
        c: rng.pick(['lay', 'lay', 'tint']),
        k: rng.range(0.08, 0.12),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SplitDiagP
        const { W, H, sc } = env
        const e = E.outExpo(clamp(bgT(env) / 0.5))
        const side = (P.side || 1) > 0 ? 1 : -1
        const tn = Math.tan((P.ang || 20) * DEG)
        const cx = W * (P.pos || 0.5) + (1 - e) * W * 0.9 * side + W * 0.01 * Math.sin(env.t * 0.5)
        const xt = cx - (tn * H) / 2
        const xb = cx + (tn * H) / 2
        const X = side > 0 ? W + 10 : -10
        ctx.fillStyle = splitCol(sc, P)
        ctx.beginPath()
        ctx.moveTo(xt, -1)
        ctx.lineTo(X, -1)
        ctx.lineTo(X, H + 1)
        ctx.lineTo(xb, H + 1)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 0.6 * e
        ctx.strokeStyle = tintC(sc, 0.45)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(xt, -1)
        ctx.lineTo(xb, H + 1)
        ctx.stroke()
      },
    }),

    /* グラデ：整屏缓慢转动的双色渐变 */
    gradientSweep: mkBg({
      tags: ['calm', 'emotional', 'pop'],
      w: 1,
      subtle: true,
      plan: (rng): GradientSweepP => ({
        seed: bs(rng),
        spd: rng.range(0.25, 0.5),
        k: rng.range(0.16, 0.26),
        c: rng.pick(['accent', 'accent', 'accent2', 'fg']),
        a0: rng.range(0, 6.28),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as GradientSweepP
        const { W, H, sc } = env
        const ang = (P.a0 || 0) + env.t * 0.12
        const dx = Math.cos(ang)
        const dy = Math.sin(ang)
        const L = Math.hypot(W, H) / 2
        const tint = mix(
          sc.bg,
          P.c === 'accent2' ? sc.accent2 : P.c === 'fg' ? sc.fg : sc.accent,
          P.k || 0.2,
        )
        const p = 0.5 + 0.32 * Math.sin(env.t * (P.spd || 0.35))
        const g = ctx.createLinearGradient(
          W / 2 - dx * L,
          H / 2 - dy * L,
          W / 2 + dx * L,
          H / 2 + dy * L,
        )
        g.addColorStop(0, rgba(tint, 0))
        g.addColorStop(p, rgba(tint, 1))
        g.addColorStop(1, rgba(tint, 0))
        ctx.globalAlpha = E.outCubic(clamp(bgT(env) / 0.6))
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      },
    }),

    /* スポットライト：一束会晃的灯 + 四周压暗 */
    spotlight: mkBg({
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.9,
      subtle: true,
      plan: (rng): SpotlightP => ({
        seed: bs(rng),
        beam: rng.chance(0.6),
        k: rng.range(0.1, 0.16),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SpotlightP
        const { W, H, sc } = env
        const t = env.t
        const s = P.seed || 1
        const U = Umin(env)
        const dk = isDark(sc.bg)
        const cx = W * (0.5 + 0.2 * Math.sin(t * 0.31 + (s % 7)))
        const cy = H * (0.52 + 0.08 * Math.sin(t * 0.23 + (s % 5)))
        const R = U * 0.62
        const e = E.outCubic(clamp(bgT(env) / 0.6))
        const lc = dk ? sc.fg : '#FFFFFF'
        const k = (P.k || 0.12) * e
        const g1 = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.7)
        g1.addColorStop(0, 'rgba(0,0,0,0)')
        g1.addColorStop(1, `rgba(0,0,0,${((dk ? 0.35 : 0.14) * e).toFixed(3)})`)
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, W, H)
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
        g2.addColorStop(0, rgba(lc, k))
        g2.addColorStop(0.6, rgba(lc, k * 0.5))
        g2.addColorStop(1, rgba(lc, 0))
        ctx.fillStyle = g2
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
        if (P.beam) {
          const tx = cx + (W / 2 - cx) * 0.5
          const g3 = ctx.createLinearGradient(0, 0, 0, cy)
          g3.addColorStop(0, rgba(lc, k * 0.7))
          g3.addColorStop(1, rgba(lc, 0))
          ctx.fillStyle = g3
          ctx.beginPath()
          ctx.moveTo(tx - U * 0.04, -2)
          ctx.lineTo(tx + U * 0.04, -2)
          ctx.lineTo(cx + R * 0.75, cy)
          ctx.lineTo(cx - R * 0.75, cy)
          ctx.closePath()
          ctx.fill()
        }
      },
    }),

    /* テレビの帯：上下爬行的电视色带 */
    tvBars: mkBg({
      tags: ['glitch', 'graphic', 'emotional'],
      w: 0.6,
      plan: (rng): TvBarsP => ({
        seed: bs(rng),
        n: rng.int(4, 7),
        spd: rng.range(0.05, 0.14),
        k: rng.range(0.06, 0.09),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as TvBarsP
        const { W, H, sc } = env
        const s = P.seed || 1
        const k = P.k || 0.07
        for (let i = 0; i < (P.n || 5); i++) {
          const h = H * rr(0.02, 0.15, s, i, 1)
          const v = H * (P.spd || 0.08) * (0.5 + r(s, i, 2))
          const y = wrap(env.t * v + r(s, i, 3) * H * 1.4, H * 1.4) - H * 0.2
          ctx.fillStyle = i % 3 === 0 ? tintC(sc, k * 1.7) : layC(sc, k * (0.6 + 0.8 * r(s, i, 4)))
          ctx.fillRect(0, y, W, h)
          if (r(s, i, 5) < 0.5) {
            ctx.fillStyle = layC(sc, k * 1.4)
            ctx.fillRect(0, y - H * 0.012, W, Math.max(1.5, H * 0.002))
          }
        }
      },
    }),

    /* 市松：旋转平移的棋盘格 */
    checker: mkBg({
      tags: ['graphic', 'pop'],
      w: 0.7,
      plan: (rng): CheckerP => ({
        seed: bs(rng),
        n: rng.int(5, 8),
        k: rng.range(0.04, 0.065),
        spd: rng.range(0.1, 0.25),
        rot: rng.pick([0, 0, 45]),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as CheckerP
        const { W, H, sc } = env
        const cell = (Umin(env) / (P.n || 6)) * (P.rot ? 1.2 : 1)
        const R = Math.hypot(W, H) / 2 + cell * 2
        const off = wrap(env.t * cell * (P.spd || 0.15), cell * 2)
        const n = Math.ceil(R / cell) + 2
        const e = E.outCubic(clamp(bgT(env) / 0.4))
        ctx.translate(W / 2, H / 2)
        ctx.rotate((P.rot || 0) * DEG)
        ctx.globalAlpha = e
        ctx.fillStyle = layC(sc, P.k || 0.05)
        ctx.beginPath()
        for (let j = -n; j <= n; j++)
          for (let i = -n; i <= n; i++)
            if ((i + j) & 1) ctx.rect(i * cell + off - cell, j * cell + off - cell, cell, cell)
        ctx.fill()
      },
    }),

    /* 巨大文字：把行首字放大成背景图形 */
    bigChar: mkBg({
      tags: ['editorial', 'emotional', 'graphic', 'calm'],
      w: 1,
      subtle: true,
      plan: (rng): BigCharP => ({
        seed: bs(rng),
        side: rng.pick([-1, 1]),
        font: rng.pick(['display', 'serif']),
        outline: rng.chance(0.3),
        k: rng.range(0.07, 0.1),
      }),
      draw(env, P0) {
        const P = P0 as unknown as BigCharP
        const cut = env.cut
        if (!cut) return
        const { W, H, sc } = env
        const txt = String(cut.lineText || cut.text || '').replace(/\s+/g, '')
        const arr = [...txt]
        const ch = arr.find((c) => !isPunct(c)) || arr[0]
        if (!ch) return
        const font = fontsOf(env.st, [P.font || 'display'])[0]
        const side = P.side || 1
        const e = E.outCubic(clamp(bgT(env) / 0.7))
        const size = Math.max(W, H) * 0.6 * (1.06 - 0.06 * e + 0.015 * Math.sin(env.t * 0.3))
        const it: TextItem = {
          text: ch,
          font,
          size,
          x: W / 2 + side * W * 0.2 + Math.sin(env.t * 0.2) * W * 0.01,
          y: H * 0.53,
          rot: side * 4,
          color: layC(sc, P.k || 0.08),
          alpha: e,
          ghost: false,
        }
        if (P.outline)
          Object.assign(it, {
            fill: false,
            stroke: Math.max(2, size * 0.006),
            strokeColor: layC(sc, (P.k || 0.08) * 2.4),
          })
        env.draw(it)
      },
    }),
    /* 集中線：向中心收拢的漫画速度线，中间留出干净区 */
    speedLines: mkBg({
      tags: ['pop', 'emotional', 'graphic'],
      w: 0.7,
      plan: (rng): SpeedLinesP => ({
        seed: bs(rng),
        n: rng.int(90, 140),
        k: rng.range(0.2, 0.28),
        clear: rng.range(0.3, 0.36),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as SpeedLinesP
        const { W, H, sc } = env
        const s = P.seed || 1
        const st = env.step
        const n = P.n || 100
        const cx = W / 2
        const cy = H / 2
        const e = E.outCubic(clamp(bgT(env) / 0.3))
        const rx = W * (P.clear || 0.38) * (1 + (1 - e) * 0.6)
        const ry = H * (P.clear || 0.38) * 1.05 * (1 + (1 - e) * 0.6)
        const R = Math.hypot(W, H) * 0.6
        ctx.fillStyle = layC(sc, P.k || 0.16)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const a = ((i + r(s, i, st, 1) * 0.8) / n) * TAU
          const f = 1 + r(s, i, st, 2) * 0.5
          const w = (TAU / n) * (0.15 + 0.45 * r(s, i, st, 3))
          ctx.moveTo(cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f)
          ctx.lineTo(cx + Math.cos(a - w / 2) * R, cy + Math.sin(a - w / 2) * R)
          ctx.lineTo(cx + Math.cos(a + w / 2) * R, cy + Math.sin(a + w / 2) * R)
          ctx.closePath()
        }
        ctx.fill()
      },
    }),

    /* 走査線の帯：带亮边的横向扫描带 */
    scanBars: mkBg({
      tags: ['calm', 'glitch', 'editorial'],
      w: 0.9,
      subtle: true,
      plan: (rng): ScanBarsP => ({
        seed: bs(rng),
        n: rng.int(2, 3),
        spd: rng.range(0.06, 0.12),
        k: rng.range(0.05, 0.08),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as ScanBarsP
        const { W, H, sc } = env
        const s = P.seed || 1
        const k = P.k || 0.06
        for (let i = 0; i < (P.n || 2); i++) {
          const h = H * (0.12 + 0.12 * r(s, i, 1))
          const y =
            wrap(
              env.t * H * (P.spd || 0.08) * (0.8 + 0.4 * r(s, i, 2)) + r(s, i, 3) * H * 1.5,
              H * 1.5,
            ) -
            H * 0.3
          const g = ctx.createLinearGradient(0, y, 0, y + h)
          g.addColorStop(0, rgba(sc.fg, 0))
          g.addColorStop(0.85, rgba(sc.fg, k))
          g.addColorStop(1, rgba(sc.fg, 0))
          ctx.fillStyle = g
          ctx.fillRect(0, y, W, h)
          ctx.fillStyle = rgba(sc.fg, k * 1.6)
          ctx.fillRect(0, y + h * 0.86, W, Math.max(1.5, H * 0.0018))
        }
      },
    }),

    /* ドット格子：缓慢漂移的点阵，偶发一颗点亮成强调色 */
    dotGrid: mkBg({
      tags: ['calm', 'editorial', 'graphic'],
      w: 1,
      subtle: true,
      plan: (rng): DotGridP => ({
        seed: bs(rng),
        sp: rng.range(0.045, 0.065),
        k: rng.range(0.22, 0.3),
        plus: rng.chance(0.4),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as DotGridP
        const { W, H, sc } = env
        const s = P.seed || 1
        const U = Umin(env)
        const sp = U * (P.sp || 0.055)
        const rad = Math.max(1.5, U * 0.0036)
        const mx = env.t * 0.15
        const my = env.t * 0.08
        const ox = wrap(mx * sp, sp)
        const oy = wrap(my * sp, sp)
        const bx = Math.floor(mx)
        const by = Math.floor(my)
        const e = E.outCubic(clamp(bgT(env) / 0.5))
        const tw = Math.floor(env.t * 2)
        ctx.globalAlpha = e
        ctx.fillStyle = layC(sc, P.k || 0.2)
        ctx.beginPath()
        const acc: [number, number][] = []
        for (let j = -1, y = oy - sp; y < H + sp; y += sp, j++)
          for (let i = -1, x = ox - sp; x < W + sp; x += sp, i++) {
            const id = hash(s, i - bx, j - by)
            if (P.plus && (i - bx) % 4 === 0 && (j - by) % 4 === 0) {
              ctx.rect(x - rad * 3, y - rad * 0.5, rad * 6, rad)
              ctx.rect(x - rad * 0.5, y - rad * 3, rad, rad * 6)
              continue
            }
            ctx.moveTo(x + rad, y)
            ctx.arc(x, y, rad, 0, TAU)
            if (r(id, tw) < 0.012) acc.push([x, y])
          }
        ctx.fill()
        if (acc.length) {
          ctx.fillStyle = tintC(sc, 0.55)
          ctx.beginPath()
          for (const [x, y] of acc) {
            ctx.moveTo(x + rad * 2, y)
            ctx.arc(x, y, rad * 2, 0, TAU)
          }
          ctx.fill()
        }
      },
    }),

    /* レトロ格子：地平线 + 透视网格 + 可选落日 */
    retroGrid: mkBg({
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.6,
      plan: (rng): RetroGridP => ({
        seed: bs(rng),
        hz: rng.range(0.56, 0.64),
        spd: rng.range(0.4, 0.8),
        sun: rng.chance(0.4),
        k: rng.range(0.38, 0.5),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as RetroGridP
        const { W, H, sc } = env
        const yh = H * (P.hz || 0.6)
        const col = tintC(sc, P.k || 0.35)
        const e = E.outCubic(clamp(bgT(env) / 0.6))
        if (P.sun) {
          const R = Math.min(W, H) * 0.2
          const sy = yh - R * 0.35
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, W, yh)
          ctx.clip()
          ctx.fillStyle = tintC(sc, (P.k || 0.35) * 0.45)
          ctx.beginPath()
          ctx.arc(W / 2, sy, R * e, 0, TAU)
          ctx.fill()
          ctx.fillStyle = sc.bg
          for (let i = 0; i < 5; i++) {
            const yy = sy + R * (0.1 + i * 0.18)
            const hh = R * 0.03 * (1 + i * 0.6)
            ctx.fillRect(W / 2 - R, yy, R * 2, hh)
          }
          ctx.restore()
        }
        const g = ctx.createLinearGradient(0, yh, 0, H)
        g.addColorStop(0, rgba(col, 0))
        g.addColorStop(0.3, rgba(col, 0.55 * e))
        g.addColorStop(1, rgba(col, e))
        ctx.strokeStyle = g
        ctx.lineWidth = Math.max(1.5, Umin(env) * 0.0025)
        ctx.beginPath()
        const nV = 12
        const spB = W * 0.18
        for (let i = -nV; i <= nV; i++) {
          ctx.moveTo(W / 2 + i * spB * 0.06, yh)
          ctx.lineTo(W / 2 + i * spB * 1.6, H + H * 0.3)
        }
        const ph = wrap(env.t * (P.spd || 0.6), 1)
        for (let j = 0; j < 26; j++) {
          const z = j + 1 - ph
          if (z <= 0.2) continue
          const y = yh + ((H - yh) * 0.9) / z
          if (y > H + 2 || y - yh < 1.5) continue
          ctx.moveTo(0, y)
          ctx.lineTo(W, y)
        }
        ctx.stroke()
        const gh = ctx.createLinearGradient(0, yh - H * 0.1, 0, yh)
        gh.addColorStop(0, rgba(col, 0))
        gh.addColorStop(1, rgba(col, 0.35 * e))
        ctx.fillStyle = gh
        ctx.fillRect(0, yh - H * 0.1, W, H * 0.1)
        ctx.fillStyle = rgba(col, 0.8 * e)
        ctx.fillRect(0, yh - 1, W, 2)
      },
    }),

    /* ボケ玉：上浮的散焦光斑 */
    bokehBg: mkBg({
      tags: ['emotional', 'calm', 'pop'],
      w: 1,
      plan: (rng): BokehP => ({ seed: bs(rng), n: rng.int(12, 20), k: rng.range(0.18, 0.28) }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as BokehP
        const { W, H, sc } = env
        const s = P.seed || 1
        const U = Umin(env)
        const t = env.t
        const dk = isDark(sc.bg)
        const cols = [sc.accent, sc.accent2, sc.fg, sc.ghostA, sc.ghostB]
        const e = E.outCubic(clamp(bgT(env) / 0.8))
        if (dk) ctx.globalCompositeOperation = 'screen'
        for (let i = 0; i < (P.n || 12); i++) {
          const rad = U * rr(0.035, 0.13, s, i, 1)
          const vx = rs(s, i, 2) * U * 0.03
          const vy = -U * rr(0.01, 0.04, s, i, 3)
          const x =
            wrap(r(s, i, 4) * W + t * vx, W + 2 * rad) - rad + Math.sin(t * 0.4 + i) * U * 0.015
          const y = wrap(r(s, i, 5) * H + t * vy, H + 2 * rad) - rad
          const c = cols[i % cols.length]
          const a =
            (P.k || 0.2) *
            e *
            (0.5 + 0.5 * r(s, i, 6)) *
            (0.75 + 0.25 * Math.sin(t * (0.6 + r(s, i, 7)) + i)) *
            (dk ? 1 : 0.7)
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
          g.addColorStop(0, rgba(c, a * 0.7))
          g.addColorStop(0.8, rgba(c, a))
          g.addColorStop(0.92, rgba(c, a * 0.5))
          g.addColorStop(1, rgba(c, 0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(x, y, rad, 0, TAU)
          ctx.fill()
        }
      },
    }),

    /* 舞い上がる粒：一路向上的细粒 */
    particlesBg: mkBg({
      tags: ['emotional', 'calm', 'pop'],
      w: 1,
      plan: (rng): ParticlesP => ({
        seed: bs(rng),
        n: rng.int(60, 100),
        k: rng.range(0.45, 0.65),
        sq: rng.chance(0.4),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as ParticlesP
        const { W, H, sc } = env
        const s = P.seed || 1
        const U = Umin(env)
        const t = env.t
        const n = Math.min(140, Math.round((P.n || 60) * Math.sqrt((W * H) / (1920 * 1080))))
        const e = E.outCubic(clamp(bgT(env) / 0.6))
        for (let i = 0; i < n; i++) {
          const v = H * rr(0.04, 0.14, s, i, 1)
          const y = H + 10 - wrap(t * v + r(s, i, 2) * H * 1.2, H * 1.2)
          const x = r(s, i, 3) * W + Math.sin(t * rr(0.4, 1.2, s, i, 4) + i) * U * 0.02
          const sz = U * rr(0.0025, 0.008, s, i, 5)
          const a = (P.k || 0.45) * e * clamp(y / (H * 0.3)) * (0.55 + 0.45 * r(s, i, 6))
          if (a <= 0.01) continue
          ctx.globalAlpha = a
          ctx.fillStyle = r(s, i, 7) < 0.22 ? sc.accent : layC(sc, 0.6)
          if (P.sq) ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2)
          else {
            ctx.beginPath()
            ctx.arc(x, y, sz, 0, TAU)
            ctx.fill()
          }
        }
      },
    }),

    /* 波紋：踩在节拍上的一圈圈涟漪 */
    ripples: mkBg({
      tags: ['calm', 'emotional', 'graphic'],
      w: 0.9,
      plan: (rng): RipplesP => ({
        seed: bs(rng),
        centre: rng.chance(0.4),
        life: rng.range(1.6, 2.4),
        k: rng.range(0.24, 0.34),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as RipplesP
        const { W, H, sc } = env
        const s = P.seed || 1
        const U = Umin(env)
        const life = P.life || 1.8
        const rings: [number, number][] = []
        const beat = env.beat
        if (beat && beat.len > 0.2) {
          const per = beat.len
          const stp = per < 0.4 ? 2 : 1
          let b0 = beat.index
          let since = beat.since
          if (stp === 2 && b0 % 2) {
            since += per
            b0 -= 1
          }
          for (let j = 0; j < 8; j++) {
            const age = since + j * per * stp
            if (age > life) break
            rings.push([b0 - j * stp, age])
          }
        } else {
          const per = 0.7
          const idx = Math.floor(env.t / per)
          for (let j = 0; j < 4; j++) {
            const age = env.t - (idx - j) * per
            if (age > life) break
            rings.push([idx - j, age])
          }
        }
        for (const [idx, age] of rings) {
          const q = clamp(age / life)
          const rad = U * (0.05 + 0.75 * E.outCubic(q))
          const a = (P.k || 0.2) * Math.pow(1 - q, 1.4)
          const x = P.centre ? W / 2 : W * rr(0.15, 0.85, s, idx, 1)
          const y = P.centre ? H / 2 : H * rr(0.2, 0.8, s, idx, 2)
          ctx.strokeStyle = rgba(sc.fg, a)
          ctx.lineWidth = U * (0.008 * (1 - q) + 0.002)
          ctx.beginPath()
          ctx.arc(x, y, rad, 0, TAU)
          ctx.stroke()
          ctx.strokeStyle = rgba(sc.fg, a * 0.5)
          ctx.lineWidth = U * 0.0015
          ctx.beginPath()
          ctx.arc(x, y, rad * 0.8, 0, TAU)
          ctx.stroke()
        }
      },
    }),

    /* 水玉：错行排列的圆点阵 */
    polka: mkBg({
      tags: ['pop', 'graphic'],
      w: 0.7,
      plan: (rng): PolkaP => ({
        seed: bs(rng),
        sp: rng.range(0.11, 0.16),
        r: rng.range(0.2, 0.3),
        k: rng.range(0.06, 0.09),
        acc: rng.chance(0.3),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as PolkaP
        const { W, H, sc } = env
        const sp = Umin(env) * (P.sp || 0.13)
        const rad = sp * (P.r || 0.25)
        const rh = sp * 0.866
        const ox = wrap(env.t * sp * 0.25, sp)
        const oy = wrap(env.t * sp * 0.15, rh * 2)
        const e = E.outBack(clamp(bgT(env) / 0.45), 1.5)
        ctx.fillStyle = P.acc ? tintC(sc, (P.k || 0.07) * 1.8) : layC(sc, P.k || 0.07)
        ctx.beginPath()
        let j = 0
        for (let y = oy - rh * 2; y < H + rh; y += rh, j++)
          for (let x = ox - sp * 2 + ((j & 1) * sp) / 2; x < W + sp; x += sp) {
            ctx.moveTo(x + rad * e, y)
            ctx.arc(x, y, rad * e, 0, TAU)
          }
        ctx.fill()
      },
    }),

    /* 背景イコライザー：跟着能量与节拍跳的柱状条 */
    eqBars: mkBg({
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.6,
      plan: (rng): EqBarsP => ({
        seed: bs(rng),
        n: rng.pick([24, 32, 40]),
        mode: rng.pick(['bottom', 'bottom', 'mirror', 'center']),
        seg: rng.chance(0.4),
        k: rng.range(0.09, 0.14),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as EqBarsP
        const { W, H, sc } = env
        const s = P.seed || 1
        const n = P.n || 32
        const bw = W / n
        const t = env.t
        const en = env.energy != null ? env.energy : 0.45 + 0.2 * noise1(t * 2, s)
        const bt = env.beat ? Math.exp(-env.beat.since * 6) : Math.exp(-wrap(t * 2, 1) * 4)
        const e = E.outCubic(clamp(bgT(env) / 0.4))
        const mode = P.mode || 'bottom'
        const segH = bw * 0.45
        const main = layC(sc, P.k || 0.11)
        const cap = tintC(sc, 0.4)
        // dir：1 从 y0 向下长，-1 向上长
        const bar = (x: number, y0: number, h: number, dir: number): void => {
          if (h < 1) return
          if (P.seg) {
            for (let y = 0; y + segH * 0.7 <= h; y += segH)
              ctx.rect(x, dir > 0 ? y0 + y : y0 - y - segH * 0.7, bw * 0.62, segH * 0.7)
          } else ctx.rect(x, dir > 0 ? y0 : y0 - h, bw * 0.62, h)
        }
        ctx.fillStyle = main
        ctx.beginPath()
        const tops: [number, number][] = []
        for (let i = 0; i < n; i++) {
          const sh = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / n)
          const nz = 0.5 + 0.5 * noise1(t * 4 + i * 1.7, s + i)
          const lvl = clamp(sh * (0.25 + 0.75 * en) * (0.55 + 0.45 * nz) + bt * 0.18 * nz) * e
          const h = H * 0.32 * lvl
          const x = i * bw + bw * 0.19
          if (mode === 'center') {
            bar(x, H / 2, h * 0.7, -1)
            bar(x, H / 2, h * 0.7, 1)
          } else {
            bar(x, H, h, -1)
            tops.push([x, H - h])
            if (mode === 'mirror') bar(x, 0, h * 0.7, 1)
          }
        }
        ctx.fill()
        if (tops.length) {
          ctx.fillStyle = cap
          ctx.beginPath()
          for (const [x, y] of tops) ctx.rect(x, y - bw * 0.3, bw * 0.62, Math.max(2, bw * 0.12))
          ctx.fill()
        }
      },
    }),

    /* 太枠：两条路径同时描出的粗边框（可选内圈细线） */
    borderFrame: mkBg({
      tags: ['graphic', 'pop', 'editorial'],
      w: 0.7,
      plan: (rng): BorderFrameP => ({
        seed: bs(rng),
        th: rng.range(0.012, 0.022),
        m: rng.range(0.03, 0.05),
        acc: rng.chance(0.6),
        dbl: rng.chance(0.4),
      }),
      draw(env, P0) {
        const P = P0 as unknown as BorderFrameP
        const { W, H, sc } = env
        const U = Umin(env)
        const m = U * (P.m || 0.04)
        const th = U * (P.th || 0.016)
        const e = E.inOutCubic(clamp(bgT(env) / 0.6))
        if (e <= 0) return
        const col = firstOK(
          P.acc ? [sc.accent, sc.ink, sc.fg] : [sc.ink, sc.fg],
          (c) => ctr(c, sc.bg) >= 1.6,
          sc.fg,
        )
        const x0 = m + th / 2
        const y0 = m + th / 2
        const x1 = W - m - th / 2
        const y1 = H - m - th / 2
        env.polyPartial(
          [
            [x0 - th / 2, y0],
            [x1, y0],
            [x1, y1 + th / 2],
          ],
          e,
          col,
          th,
          1,
          false,
        )
        env.polyPartial(
          [
            [x1 + th / 2, y1],
            [x0, y1],
            [x0, y0 - th / 2],
          ],
          e,
          col,
          th,
          1,
          false,
        )
        if (P.dbl) {
          const m2 = m + th * 2.4
          const lw = Math.max(1, th * 0.18)
          env.polyPartial(
            [
              [m2, m2],
              [W - m2, m2],
              [W - m2, H - m2],
              [m2, H - m2],
              [m2, m2],
            ],
            e,
            col,
            lw,
            0.45,
            false,
          )
        }
      },
    }),

    /* シネスコ帯：宽银幕黑边 */
    letterbox: mkBg({
      tags: ['emotional', 'editorial', 'calm'],
      w: 0.6,
      plan: (rng): LetterboxP => ({
        seed: bs(rng),
        k: rng.range(0.085, 0.11),
        line: rng.chance(0.6),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as LetterboxP
        const { W, H, sc } = env
        const e = E.outExpo(clamp(bgT(env) / 0.55))
        const bh = (W >= H ? H * (P.k || 0.1) : H * 0.05) * e
        if (bh < 0.5) return
        ctx.fillStyle = isDark(sc.bg) ? mix(sc.bg, '#000000', 0.85) : mix(sc.fg, '#000000', 0.3)
        ctx.fillRect(0, -1, W, bh + 1)
        ctx.fillRect(0, H - bh, W, bh + 1)
        ctx.fillStyle = isDark(sc.bg) ? layC(sc, 0.3) : tintC(sc, 0.6)
        if (P.line || isDark(sc.bg)) {
          ctx.fillRect(0, bh, W, Math.max(1.2, H * 0.0015))
          ctx.fillRect(0, H - bh - Math.max(1.2, H * 0.0015), W, Math.max(1.2, H * 0.0015))
        }
      },
    }),

    /* ノイズの揺らぎ：噪声阈值化成的方块场，偶发整行错位 */
    noiseField: mkBg({
      tags: ['glitch', 'emotional'],
      w: 0.6,
      plan: (rng): NoiseFieldP => ({
        seed: bs(rng),
        n: rng.int(14, 22),
        k: rng.range(0.05, 0.085),
        th: rng.range(0.56, 0.66),
      }),
      draw(env, P0, ctx) {
        const P = P0 as unknown as NoiseFieldP
        const { W, H, sc } = env
        const s = P.seed || 1
        const cell = Umin(env) / (P.n || 18)
        const t = env.t
        const st = env.step
        const cols = Math.ceil(W / cell)
        const rows = Math.ceil(H / cell)
        const th = P.th || 0.6
        const k = P.k || 0.07
        const paths = [new Path2D(), new Path2D(), new Path2D()]
        const acc = new Path2D()
        const e = clamp(bgT(env) / 0.3)
        for (let j = 0; j < rows; j++) {
          const shift = r(s, j, st, 7) < 0.05 ? Math.round(rs(s, j, st, 8) * 4) * cell : 0
          for (let i = 0; i < cols; i++) {
            let v =
              0.5 +
              0.5 *
                (noise1(i * 0.23 + t * 0.7, s + j * 31) * 0.6 +
                  noise1(j * 0.29 - t * 0.5, s + i * 17 + 999) * 0.4)
            v += (r(s, i, j, st) - 0.5) * 0.12
            if (v < th + (1 - e) * 0.4) continue
            const lv = v > th + 0.2 ? 2 : v > th + 0.1 ? 1 : 0
            ;(r(s, i, j, st >> 1) < 0.01 ? acc : paths[lv]).rect(
              i * cell + shift,
              j * cell,
              cell - 1,
              cell - 1,
            )
          }
        }
        ;[0.6, 1, 1.6].forEach((m, l) => {
          ctx.fillStyle = layC(sc, k * m)
          ctx.fill(paths[l])
        })
        ctx.fillStyle = tintC(sc, 0.3)
        ctx.fill(acc)
      },
    }),
  },

  cam: {
    /* 引き：从略放大缓缓退回原尺寸 */
    pullOut: {
      tags: ['calm', 'emotional', 'editorial'],
      w: 1,
      plan: (rng): PullOutP => ({ a: rng.range(0.06, 0.09) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as PullOutP
        return { s: 1 + (P.a || 0.07) * KM(env) * (1 - E.outCubic(cuOf(env))) }
      },
    },

    /* 左パン / 右パン：横向平移 + 一点余量避免露边 */
    panL: {
      tags: ['calm', 'editorial', 'emotional', 'graphic'],
      w: 0.9,
      plan: (rng): PanP => ({ a: rng.range(0.018, 0.028) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as PanP
        return {
          x: (panP(cuOf(env)) - 0.5) * 2 * env.W * (P.a || 0.022) * KM(env),
          s: 1.02,
        }
      },
    },

    panR: {
      tags: ['calm', 'editorial', 'emotional', 'graphic'],
      w: 0.9,
      plan: (rng): PanP => ({ a: rng.range(0.018, 0.028) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as PanP
        return {
          x: -(panP(cuOf(env)) - 0.5) * 2 * env.W * (P.a || 0.022) * KM(env),
          s: 1.02,
        }
      },
    },

    /* ティルト：纵向平移 */
    tiltUp: {
      tags: ['calm', 'emotional', 'editorial'],
      w: 0.8,
      plan: (rng): TiltP => ({ a: rng.range(0.02, 0.03) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as TiltP
        return { y: (panP(cuOf(env)) - 0.5) * 2 * env.H * (P.a || 0.025) * KM(env), s: 1.02 }
      },
    },

    /* ダッチ：歪一点点到一边，同时缓缓推近 */
    dutch: {
      tags: ['emotional', 'glitch', 'graphic'],
      w: 0.8,
      plan: (rng): DutchP => ({ dir: rng.pick([1, -1]), a: rng.range(2.5, 4.5) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as DutchP
        const K = KM(env)
        const span = env.cut ? env.cut.dur * 0.8 : 0.3
        return {
          rot:
            (P.dir || 1) *
            Math.min(5, (P.a || 3.5) * K) *
            E.inOutSine(clamp(env.lt / Math.max(0.3, span))),
          s: 1 + 0.03 * K * cuOf(env),
        }
      },
    },

    /* 手持ち：两路噪声叠加的呼吸感晃动 */
    handheld: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 1,
      plan: (rng): HandheldP => ({ f: rng.range(0.8, 1.3) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as HandheldP
        const c = env.cut
        if (!c) return {}
        const K = KM(env)
        const f = P.f || 1
        const t = env.lt
        const sd = c.seed | 0
        return {
          x:
            (noise1(t * f * 1.1, sd) * 0.7 + noise1(t * f * 2.9, sd + 1) * 0.3) * env.W * 0.007 * K,
          y:
            (noise1(t * f * 0.9, sd + 2) * 0.7 + noise1(t * f * 3.3, sd + 3) * 0.3) *
            env.H *
            0.009 *
            K,
          rot: noise1(t * f * 0.8, sd + 4) * 0.7 * K,
          s: 1.012,
        }
      },
    },

    /* 拍でズーム：每拍弹一下（跟着 pOut 的滞后走） */
    beatPunch: {
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.9,
      plan: (rng): BeatPunchP => ({ a: rng.range(0.03, 0.045) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as BeatPunchP
        let since: number
        if (env.beat) {
          const len = env.beat.len
          since = env.beat.since - lagOf(env)
          if (since < 0) since += len
        } else since = wrap(env.lt, 0.5)
        const k = Math.exp(-since * 9)
        return { s: 1 + (P.a || 0.035) * KM(env) * k, y: -env.H * 0.004 * KM(env) * k }
      },
    },

    /* ホイップイン：从画外甩进来，落位时带剪切与糊 */
    whipIn: {
      tags: ['pop', 'glitch', 'graphic'],
      w: 0.7,
      strong: true,
      plan: (rng): WhipInP => ({
        dir: rng.pick(['L', 'R', 'L', 'R', 'U', 'D']),
        d: rng.range(0.16, 0.24),
      }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as WhipInP
        const K = KM(env)
        const r0 = 1 - E.outExpo(clamp(env.lt / 0.3))
        const d = (P.d || 0.2) * K * r0
        if (r0 <= 0.001) return {}
        const sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1
        const hor = P.dir === 'L' || P.dir === 'R'
        return {
          x: hor ? sg * env.W * d : 0,
          y: hor ? 0 : sg * env.H * d * 0.7,
          skx: hor ? sg * 9 * r0 * K : 0,
          s: 1 + 0.04 * r0,
          blur: 22 * K * r0,
        }
      },
    },

    /* クラッシュズーム：在预设时间点猛推一下再稳住 */
    crashZoom: {
      tags: ['pop', 'glitch', 'emotional'],
      w: 0.6,
      strong: true,
      plan: (rng): CrashZoomP => ({ at: rng.range(0.6, 0.75), a: rng.range(0.08, 0.11) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as CrashZoomP
        const c = env.cut
        if (!c) return {}
        const K = KM(env)
        const dur = c.dur
        const tc = dur < 0.8 ? dur * 0.5 : Math.max(dur * (P.at || 0.65), dur - 0.6)
        const dt = env.lt - tc
        if (dt < 0) return { s: 1 - 0.008 * K * clamp((env.lt - tc + 0.25) / 0.25) }
        const q = E.outExpo(clamp(dt / 0.1))
        const sd = c.seed | 0
        const sh = Math.exp(-dt * 6) * q
        return {
          s: 1 + Math.min(0.12, (P.a || 0.1) * K) * q,
          blur: 12 * K * Math.max(0, 1 - Math.abs(dt - 0.05) / 0.08),
          x: rs(sd, env.step, 1) * env.W * 0.004 * sh * K,
          y: rs(sd, env.step, 2) * env.H * 0.004 * sh * K,
        }
      },
    },

    /* バウンス：落幅后衰减的弹跳 */
    bounce: {
      tags: ['pop', 'graphic'],
      w: 0.9,
      plan: (rng): BounceP => ({ a: rng.range(0.045, 0.065) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as BounceP
        const K = KM(env)
        const t = env.lt
        const d = Math.exp(-t * 5.5)
        return {
          s: 1 - (P.a || 0.07) * K * d * Math.cos(t * 16),
          y: -env.H * 0.012 * K * d * Math.sin(t * 16),
        }
      },
    },

    /* ロール：整幅轻微翻滚 */
    roll: {
      tags: ['emotional', 'calm', 'glitch'],
      w: 0.8,
      plan: (rng): RollP => ({ dir: rng.pick([1, -1]), a: rng.range(2.5, 4) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as RollP
        return { rot: (P.dir || 1) * (cuOf(env) - 0.5) * (P.a || 3) * KM(env), s: 1.025 }
      },
    },

    /* 斜めドリフト：对角缓移 + 持续推近 */
    driftDiag: {
      tags: ['calm', 'emotional', 'editorial', 'graphic'],
      w: 1,
      plan: (rng): DriftDiagP => ({ dx: rng.pick([1, -1]), dy: rng.pick([1, -1]) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as DriftDiagP
        const K = KM(env)
        const u = E.inOutSine(cuOf(env)) * 0.5 + cuOf(env) * 0.5
        return {
          x: (u - 0.5) * env.W * 0.035 * K * (P.dx || 1),
          y: (u - 0.5) * env.H * 0.03 * K * (P.dy || 1),
          s: 1.02 + 0.025 * K * u,
        }
      },
    },

    /* 強い揺れ：开头剧烈抖动后迅速收敛 */
    shakeHard: {
      tags: ['glitch', 'pop', 'emotional'],
      w: 0.6,
      strong: true,
      get: (env): CamState => {
        const c = env.cut
        if (!c) return {}
        const K = KM(env)
        const amp = Math.exp(-env.lt * 4.5) * K
        if (amp < 0.01) return {}
        const sd = c.seed | 0
        const st = env.step
        return {
          x: rs(sd, st, 1) * env.W * 0.022 * amp,
          y: rs(sd, st, 2) * env.H * 0.02 * amp,
          rot: rs(sd, st, 3) * 1.6 * amp,
          s: 1 + 0.03 * amp,
          blur: 2.5 * amp,
        }
      },
    },

    /* ドリー：一路缓推 */
    dollyIn: {
      tags: ['emotional', 'calm', 'editorial'],
      w: 1,
      plan: (rng): DollyInP => ({ a: rng.range(0.08, 0.11) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as DollyInP
        const K = KM(env)
        const q = E.inCubic(cuOf(env))
        return { s: 1 + Math.min(0.14, (P.a || 0.1) * K) * q, y: -env.H * 0.008 * K * q }
      },
    },

    /* 段階ズーム：踩在节拍上分几段跳近，每段带一帧糊 */
    stepZoom: {
      tags: ['pop', 'graphic', 'glitch'],
      w: 0.8,
      plan: (rng): StepZoomP => ({ n: rng.int(2, 3), a: rng.range(0.035, 0.045) }),
      get: (env, P0): CamState => {
        const P = P0 as unknown as StepZoomP
        const K = KM(env)
        const a = (P.a || 0.04) * K
        let s = 1
        let blur = 0
        for (const ti of stepTimes(env, P.n || 2)) {
          const d = env.lt - ti
          if (d < 0) continue
          s += a * E.outExpo(clamp(d / 0.07))
          blur += 5 * K * (1 - clamp(d / 0.06))
        }
        return { s: Math.min(1.15, s), blur }
      },
    },
  },

  fx: {
    /* パネルワイプ：斜向滑块横扫，前缘一条亮色 */
    panelWipe: mkFx({
      tags: ['pop', 'graphic'],
      w: 1,
      dur: 5,
      pre: 2,
      amp: 1,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const b = 0.4
        const dir = r(s, 1) < 0.5 ? 1 : -1
        const vert = r(s, 2) < 0.28
        const L = vert ? ch : cw
        const M = vert ? cw : ch
        const sl = M * 0.3
        let a0: number
        let a1: number
        if (k < b) {
          a0 = 0
          a1 = E.outCubic(k / b)
        } else {
          a0 = E.inCubic((k - b) / (1 - b))
          a1 = 1
        }
        const pt = (X: number, Y: number): [number, number] => {
          const x = dir > 0 ? X : L - X
          return vert ? [Y, x] : [x, Y]
        }
        const band = (u0: number, u1: number, col: string): void => {
          if (u1 - u0 <= 0.0005) return
          const X0 = u0 * (L + sl)
          const X1 = u1 * (L + sl)
          const q = [pt(X0, 0), pt(X1, 0), pt(X1 - sl, M), pt(X0 - sl, M)]
          ctx.fillStyle = col
          ctx.beginPath()
          q.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
          ctx.closePath()
          ctx.fill()
        }
        const second = best([sc.ink, sc.fg, sc.bg], sc.accent)
        if (k < b) band(a1, Math.min(1, a1 + 0.06), second)
        else band(Math.max(0, a0 - 0.06), a0, second)
        band(a0, a1, sc.accent)
      },
    }),

    /* アイリス：从偏心圆洞里开合 */
    irisTrans: mkFx({
      tags: ['pop', 'editorial'],
      w: 0.7,
      dur: 8,
      pre: 4,
      amp: 1,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const c = cover(k, 0.5)
        const cx = cw / 2 + rs(s, 1) * cw * 0.08
        const cy = ch / 2 + rs(s, 2) * ch * 0.06
        const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy))
        const rad = R * (1 - c)
        ctx.fillStyle = isDark(sc.bg) ? '#000000' : isDark(sc.ink) ? sc.ink : '#111111'
        ctx.beginPath()
        ctx.rect(0, 0, cw, ch)
        if (rad > 0.5) {
          ctx.moveTo(cx + rad, cy)
          ctx.arc(cx, cy, rad, 0, TAU)
        }
        ctx.fill('evenodd')
        if (rad > 1 && c > 0.02) {
          ctx.strokeStyle = sc.accent
          ctx.lineWidth = Math.max(2, ch * 0.008)
          ctx.beginPath()
          ctx.arc(cx, cy, rad, 0, TAU)
          ctx.stroke()
        }
      },
    }),

    /* 扉：两扇对开（可横可竖），缝上一条强调色 */
    doors: mkFx({
      tags: ['graphic', 'pop'],
      w: 0.7,
      dur: 8,
      pre: 4,
      amp: 1,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const c = cover(k, 0.5, E.inQuad, E.outCubic)
        const vert = r(s, 3) < 0.3
        if (c <= 0.001) return
        const L = vert ? ch : cw
        const half = (L / 2) * c + 1
        const lw = Math.max(2, Math.min(cw, ch) * 0.008)
        const col = inkOf(sc)
        const R = (a: number, b: number, w: number, h: number): void => {
          if (vert) ctx.fillRect(b, a, h, w)
          else ctx.fillRect(a, b, w, h)
        }
        const M = vert ? cw : ch
        ctx.fillStyle = col
        R(0, 0, half, M)
        R(L - half, 0, half, M)
        ctx.fillStyle = sc.accent
        R(half - lw, 0, lw, M)
        R(L - half, 0, lw, M)
        ctx.globalAlpha = 0.35
        R(half - lw * 4, 0, lw * 0.5, M)
        R(L - half + lw * 3.5, 0, lw * 0.5, M)
      },
    }),

    /* ブラインド：百叶一片两片合上 */
    blindsTrans: mkFx({
      tags: ['graphic', 'editorial'],
      w: 0.7,
      dur: 6,
      pre: 3,
      amp: 1,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const c = cover(k, 0.5)
        const n = 7 + (hash(s, 4) % 6)
        const vert = r(s, 5) < 0.35
        if (c <= 0.001) return
        const L = vert ? cw : ch
        const M = vert ? ch : cw
        const slat = L / n
        ctx.fillStyle = r(s, 6) < 0.5 ? sc.accent : inkOf(sc)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const ci = clamp(c * 1.35 - (i / n) * 0.35)
          const h = slat * ci + (ci >= 1 ? 1 : 0)
          if (h <= 0.2) continue
          if (vert) ctx.rect(i * slat, 0, h, M)
          else ctx.rect(0, i * slat, M, h)
        }
        ctx.fill()
      },
    }),

    /* RGB分離：拿 |帧-背景| 当墨水遮罩，只做彩色描边，背景不失色 */
    rgbSplit: mkFx({
      tags: ['glitch', 'emotional'],
      w: 1,
      dur: 4,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const a = ampOf(ev)
        const dk = isDark(sc.bg)
        const st = I.step + evS(ev)
        const d = Math.max(2, cw * (0.006 + 0.01 * r(st, 5)) * a * (1 - 0.6 * k))
        const dy = rs(st, 6) * ch * 0.004 * a
        const hw = Math.max(2, Math.round(cw / 2))
        const hh = Math.max(2, Math.round(ch / 2))
        const tint = (T: HTMLCanvasElement, c: string): HTMLCanvasElement => {
          const x = ctxOf(T)
          x.save()
          x.setTransform(1, 0, 0, 1, 0, 0)
          x.globalAlpha = 1
          x.globalCompositeOperation = 'copy'
          x.drawImage(S, 0, 0, hw, hh)
          x.globalCompositeOperation = 'difference'
          x.fillStyle = sc.bg
          x.fillRect(0, 0, hw, hh)
          if (dk) {
            x.globalCompositeOperation = 'multiply'
            x.fillStyle = c
            x.fillRect(0, 0, hw, hh)
          } else {
            x.fillStyle = '#ffffff'
            x.fillRect(0, 0, hw, hh)
            x.globalCompositeOperation = 'screen'
            x.fillStyle = c
            x.fillRect(0, 0, hw, hh)
          }
          x.restore()
          return T
        }
        const T1 = tint(I.tmp(hw, hh), '#FF2A2A')
        const T2 = tint(tmp2(hw, hh), '#1EE6FF')
        ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
        ctx.globalAlpha = 0.9
        ctx.drawImage(T1, 0, 0, hw, hh, -d, -dy, cw, ch)
        ctx.drawImage(T2, 0, 0, hw, hh, d, dy, cw, ch)
      },
    }),

    /* 横スミア：几条横向像素被拖长 */
    smear: mkFx({
      tags: ['glitch'],
      w: 0.8,
      dur: 3,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, _k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const a = ampOf(ev)
        const st = I.step * 13 + evS(ev)
        const n = 7 + (hash(st, 2) % 6)
        const sw = Math.max(1, Math.round(cw * 0.003))
        ctx.globalAlpha = 0.92
        for (let i = 0; i < n; i++) {
          const h = Math.max(2, Math.round(ch * rr(0.008, 0.06, st, i, 2)))
          const y = Math.round(clamp(ch * (0.22 + 0.56 * r(st, i, 1)), 0, ch - h))
          const sx = Math.round(cw * rr(0.25, 0.75, st, i, 3))
          const len = cw * rr(0.12, 0.45, st, i, 4) * a
          const dir = r(st, i, 5) < 0.5 ? 1 : -1
          ctx.drawImage(S, sx, y, sw, h, dir > 0 ? sx : sx - len, y, len, h)
        }
      },
    }),

    /* VHSロール：整幅向下卷出一段黑缝 */
    vhsRoll: mkFx({
      tags: ['glitch', 'emotional'],
      w: 0.8,
      dur: 6,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const a = ampOf(ev)
        const st = I.step * 7 + evS(ev)
        const oy = Math.round(ch * 0.2 * a * bell(k))
        const dx = Math.round(rs(st, 1) * cw * 0.004 * a)
        if (oy < 1) return
        ctx.drawImage(S, dx, oy)
        ctx.drawImage(S, dx, oy - ch)
        for (let i = 0; i < 5; i++) {
          const h = Math.max(2, Math.round(ch * 0.008))
          const yy = oy + i * h * 1.6
          const src = yy - oy
          if (yy + h > ch || src < 0) break
          ctx.drawImage(S, 0, src, cw, h, rs(st, i, 2) * cw * 0.03 * a, yy, cw, h)
        }
        const bh = Math.max(3, ch * 0.028)
        ctx.fillStyle = 'rgba(0,0,0,0.78)'
        ctx.fillRect(0, oy - bh, cw, bh)
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.fillRect(0, oy - bh - Math.max(1, ch * 0.003), cw, Math.max(1, ch * 0.003))
      },
    }),

    /* トラッキングノイズ：两段错位扫描带 + 条纹噪点 */
    trackingNoise: mkFx({
      tags: ['glitch', 'emotional'],
      w: 0.8,
      dur: 4,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const a = ampOf(ev)
        const s = evS(ev)
        const st = I.step * 5 + s
        const N = noiseTex()
        const dk = isDark(sc.bg)
        const band = (yc: number, bh: number, rows: number): void => {
          const y0 = clamp(Math.round(yc - bh / 2), 0, ch - 2)
          const hh = Math.min(ch - y0, Math.round(bh))
          for (let i = 0; i < rows; i++) {
            const y = y0 + Math.floor((i * hh) / rows)
            const h = Math.max(1, Math.floor(hh / rows))
            ctx.drawImage(S, 0, y, cw, h, rs(st, i, 9) * cw * 0.035 * a, y, cw, h)
          }
          ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
          ctx.globalAlpha = 0.75
          const nx = r(st, 3) * N.width * 0.5
          ctx.drawImage(N, nx, hash(st, 4) % 32, N.width * 0.5, 32, 0, y0, cw, hh)
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          ctx.fillStyle = dk ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'
          for (let j = 0; j < 7; j++)
            ctx.fillRect(
              r(st, j, 5) * cw,
              y0 + r(st, j, 6) * hh,
              cw * rr(0.05, 0.4, st, j, 7),
              Math.max(1, ch * 0.0025),
            )
        }
        band(
          ch * (0.25 + 0.5 * r(s, 1)) + (k - 0.5) * ch * 0.12,
          ch * (0.05 + 0.06 * r(s, 2)) * a,
          6,
        )
        band(ch * (0.1 + 0.8 * r(s, 8)) - k * ch * 0.08, ch * 0.018 * a, 2)
      },
    }),

    /* ミラー：半边或四象限镜像 */
    mirrorFlash: mkFx({
      tags: ['glitch', 'graphic'],
      w: 0.6,
      dur: 2,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, _k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const m = hash(evS(ev), 9) % 4
        const hw = Math.floor(cw / 2)
        const hh = Math.floor(ch / 2)
        if (m === 0) {
          ctx.setTransform(-1, 0, 0, 1, cw, 0)
          ctx.drawImage(S, 0, 0, hw, ch, 0, 0, hw, ch)
        } else if (m === 1) {
          ctx.setTransform(-1, 0, 0, 1, cw, 0)
          ctx.drawImage(S, cw - hw, 0, hw, ch, cw - hw, 0, hw, ch)
        } else if (m === 2) {
          ctx.setTransform(1, 0, 0, -1, 0, ch)
          ctx.drawImage(S, 0, 0, cw, hh, 0, 0, cw, hh)
        } else {
          ctx.setTransform(-1, 0, 0, 1, cw, 0)
          ctx.drawImage(S, 0, 0, hw, hh, 0, 0, hw, hh)
          ctx.setTransform(1, 0, 0, -1, 0, ch)
          ctx.drawImage(S, 0, 0, cw, hh, 0, 0, cw, hh)
          ctx.setTransform(-1, 0, 0, -1, cw, ch)
          ctx.drawImage(S, 0, 0, hw, hh, 0, 0, hw, hh)
        }
      },
    }),

    /* ストロボ：隔帧反相 */
    strobe: mkFx({
      tags: ['glitch', 'pop'],
      w: 0.5,
      dur: 4,
      amp: 1,
      mid: true,
      draw(ctx, _ev, k, I) {
        if (Math.floor(k * 4) % 2) return
        ctx.globalCompositeOperation = 'difference'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, I.cw, I.ch)
      },
    }),

    /* ポスタリゼ：提对比提饱和（不支持 filter 时退化为叠一次） */
    posterize: mkFx({
      tags: ['glitch', 'pop', 'graphic'],
      w: 0.7,
      dur: 3,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { S } = I
        if (!S) return
        const a = ampOf(ev) * Math.pow(1 - k, 1.2)
        if (a < 0.02) return
        if (I.allowFilter) {
          ctx.filter = `contrast(${(1 + 1.8 * a).toFixed(2)}) saturate(${(1 + 2.6 * a).toFixed(2)})`
          ctx.drawImage(S, 0, 0)
          ctx.filter = 'none'
        } else {
          ctx.globalCompositeOperation = 'overlay'
          ctx.globalAlpha = Math.min(1, a)
          ctx.drawImage(S, 0, 0)
        }
      },
    }),

    /* 色相シフト：整帧转色相再叠一层幽灵色 */
    hueShift: mkFx({
      tags: ['glitch', 'pop', 'emotional'],
      w: 0.7,
      dur: 3,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const s = evS(ev)
        const a = Math.pow(1 - k, 0.8) * Math.min(1, ampOf(ev))
        const deg = Math.round(90 + 180 * r(s, 3))
        const dk = isDark(sc.bg)
        if (I.allowFilter) {
          ctx.globalAlpha = a
          ctx.filter = `hue-rotate(${deg}deg) saturate(1.6)`
          ctx.drawImage(S, 0, 0)
          ctx.filter = 'none'
        }
        ctx.globalAlpha = 0.5 * a
        ctx.globalCompositeOperation = dk ? 'multiply' : 'screen'
        ctx.fillStyle = r(s, 4) < 0.5 ? sc.ghostA : sc.ghostB
        ctx.fillRect(0, 0, cw, ch)
      },
    }),
    /* タイルずらし：网格块各自错位，少数块直接换个源块 */
    tileShift: mkFx({
      tags: ['glitch', 'graphic'],
      w: 0.8,
      dur: 3,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, _k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const a = ampOf(ev)
        const s0 = I.step * 11 + evS(ev)
        const gx = 3 + (hash(s0, 1) % 4)
        const gy = 2 + (hash(s0, 2) % 3)
        ctx.fillStyle = sc.bg
        ctx.fillRect(0, 0, cw, ch)
        for (let j = 0; j < gy; j++)
          for (let i = 0; i < gx; i++) {
            const x0 = Math.round((i * cw) / gx)
            const x1 = Math.round(((i + 1) * cw) / gx)
            const y0 = Math.round((j * ch) / gy)
            const y1 = Math.round(((j + 1) * ch) / gy)
            const tw = x1 - x0
            const th = y1 - y0
            const moved = r(s0, i, j, 3) < 0.6
            const dx = moved ? rs(s0, i, j, 4) * tw * 0.2 * a : 0
            const dy = moved ? rs(s0, i, j, 5) * th * 0.15 * a : 0
            let si = i
            let sj = j
            if (r(s0, i, j, 6) < 0.12) {
              si = hash(s0, i, j, 7) % gx
              sj = hash(s0, i, j, 8) % gy
            }
            const sx0 = Math.round((si * cw) / gx)
            const sy0 = Math.round((sj * ch) / gy)
            ctx.drawImage(
              S,
              sx0,
              sy0,
              Math.min(tw, cw - sx0),
              Math.min(th, ch - sy0),
              x0 + dx,
              y0 + dy,
              tw,
              th,
            )
          }
      },
    }),

    /* フィルム焼け：从角落烧进来的暖色曝光 */
    filmBurn: mkFx({
      tags: ['emotional', 'calm', 'editorial'],
      w: 0.7,
      dur: 7,
      pre: 2,
      amp: 1,
      mid: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const b = 2 / 7
        const a =
          (k < b ? E.outCubic(k / b) : 1 - E.inOutCubic((k - b) / (1 - b))) *
          clamp(ampOf(ev), 0.5, 1.2) *
          (0.85 + 0.15 * r(I.step, 3))
        if (a <= 0.01) return
        const cn = hash(s, 5) % 4
        const cx = cn & 1 ? cw * 1.02 : -cw * 0.02
        const cy = cn & 2 ? ch * (0.7 + 0.3 * r(s, 6)) : ch * 0.3 * r(s, 6)
        const R = Math.hypot(cw, ch) * (0.55 + 0.5 * k)
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
        g.addColorStop(0, `rgba(255,244,214,${(0.95 * a).toFixed(3)})`)
        g.addColorStop(0.3, `rgba(255,170,70,${(0.75 * a).toFixed(3)})`)
        g.addColorStop(0.62, `rgba(255,80,20,${(0.32 * a).toFixed(3)})`)
        g.addColorStop(1, 'rgba(255,60,0,0)')
        if (!isDark(sc.bg)) {
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
          g2.addColorStop(0, `rgba(255,120,40,${(0.45 * a).toFixed(3)})`)
          g2.addColorStop(1, 'rgba(255,120,40,0)')
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = g2
          ctx.fillRect(0, 0, cw, ch)
        }
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = g
        ctx.fillRect(0, 0, cw, ch)
      },
    }),

    /* ホイップブラー：半分辨率上把画面横向拖成一条 */
    whipBlur: mkFx({
      tags: ['pop', 'graphic', 'emotional'],
      w: 1,
      dur: 5,
      pre: 2,
      amp: 1,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const amt = cover(k, 0.4)
        const d = cw * 0.045 * ampOf(ev) * amt
        const vert = r(evS(ev), 2) < 0.25
        if (d < 1) return
        const hw = Math.max(2, Math.round(cw / 2))
        const hh = Math.max(2, Math.round(ch / 2))
        const T = tmp2(hw, hh)
        const x = ctxOf(T)
        x.save()
        x.setTransform(1, 0, 0, 1, 0, 0)
        x.globalCompositeOperation = 'source-over'
        x.globalAlpha = 1
        x.fillStyle = sc.bg
        x.fillRect(0, 0, hw, hh)
        const n = 11
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * d
          x.globalAlpha = 1 / (i + 1)
          x.drawImage(S, vert ? 0 : o, vert ? o : 0, hw, hh)
        }
        x.restore()
        ctx.drawImage(T, 0, 0, hw, hh, 0, 0, cw, ch)
      },
    }),

    blackFrame: mkFx({ ...koma('#000000'), w: 0.6 }),

    whiteFrame: mkFx({ ...koma('#ffffff'), w: 0.5 }),

    /* 画面分割：同一帧重复成 2×2 / 3×3 */
    gridRepeat: mkFx({
      tags: ['pop', 'graphic', 'glitch'],
      w: 0.7,
      dur: 3,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const f = r(evS(ev), 1) < 0.5
        const n = k < 0.6 === f ? 2 : 3
        const tw = cw / n
        const th = ch / n
        const g = Math.max(2, Math.round(ch * 0.006))
        ctx.fillStyle = sc.bg
        ctx.fillRect(0, 0, cw, ch)
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) ctx.drawImage(S, 0, 0, cw, ch, i * tw, j * th, tw, th)
        ctx.fillStyle = sc.bg
        for (let i = 1; i < n; i++) {
          ctx.fillRect(i * tw - g / 2, 0, g, ch)
          ctx.fillRect(0, i * th - g / 2, cw, g)
        }
      },
    }),

    /* 波ゆがみ：逐行横向正弦位移 */
    waveWarp: mkFx({
      tags: ['emotional', 'glitch'],
      w: 0.7,
      dur: 5,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const s = evS(ev)
        const A = cw * 0.034 * ampOf(ev) * bell(k)
        if (A < 0.5) return
        const n = 54
        const h = ch / n
        const fr = 2 + r(s, 1) * 2
        const ph = k * 8 + r(s, 2) * 6
        for (let i = 0; i < n; i++) {
          const y = Math.floor(i * h)
          const hh = Math.min(ch - y, Math.ceil(h) + 1)
          ctx.drawImage(S, 0, y, cw, hh, Math.sin((i / n) * TAU * fr + ph) * A, y, cw, hh)
        }
      },
    }),

    /* ピクセルずれ：一小条一小条搬走 */
    pixelDrift: mkFx({
      tags: ['glitch'],
      w: 0.8,
      dur: 3,
      amp: 1,
      glitchy: true,
      mid: true,
      scratch: true,
      draw(ctx, ev, _k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const a = ampOf(ev)
        const s0 = I.step * 7 + evS(ev)
        const m = 16 + (hash(s0, 1) % 14)
        for (let i = 0; i < m; i++) {
          const h = Math.max(1, Math.round(ch * rr(0.003, 0.022, s0, i, 2)))
          const y = Math.round(clamp(ch * (0.2 + 0.6 * r(s0, i, 1)), 0, ch - h))
          const len = Math.round(cw * rr(0.05, 0.3, s0, i, 4))
          const x0 = Math.round(r(s0, i, 3) * (cw - len))
          const dx = rs(s0, i, 5) * cw * 0.07 * a
          if (r(s0, i, 6) < 0.35) ctx.drawImage(S, x0, y, 1, h, dx > 0 ? x0 : x0 - len, y, len, h)
          else ctx.drawImage(S, x0, y, len, h, x0 + dx, y, len, h)
        }
      },
    }),

    /* ズームパンチ：快速推一下再退回 */
    zoomPunch: mkFx({
      tags: ['pop', 'graphic', 'glitch'],
      w: 1,
      dur: 4,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S } = I
        if (!S) return
        const amt = k < 0.25 ? E.outExpo(k / 0.25) : 1 - E.inOutCubic((k - 0.25) / 0.75)
        const z = 1 + (0.06 + 0.04 * r(evS(ev), 1)) * clamp(ampOf(ev), 0.5, 1.3) * amt
        if (z <= 1.001) return
        ctx.drawImage(S, cw / 2 - (cw * z) / 2, ch / 2 - (ch * z) / 2, cw * z, ch * z)
      },
    }),

    /* 光の筋：斜着扫过的一道亮光 */
    lightSweep: mkFx({
      tags: ['pop', 'emotional', 'calm'],
      w: 0.9,
      dur: 7,
      amp: 1,
      mid: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, sc } = I
        const s = evS(ev)
        const dk = isDark(sc.bg)
        const ang = (20 + 20 * r(s, 1)) * DEG * (r(s, 2) < 0.5 ? 1 : -1)
        const p = E.inOutCubic(k)
        const dir = r(s, 3) < 0.5 ? 1 : -1
        const xc = dir > 0 ? lerp(-0.3, 1.3, p) * cw : lerp(1.3, -0.3, p) * cw
        const bw = cw * 0.11
        const HH = Math.hypot(cw, ch)
        const a = Math.min(1, ampOf(ev)) * Math.pow(bell(k), 0.5)
        const col = dk ? sc.fg : mix(sc.accent, '#ffffff', 0.35)
        ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
        ctx.translate(xc, ch / 2)
        ctx.rotate(ang)
        const strip = (x: number, w: number, al: number): void => {
          const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
          g.addColorStop(0, rgba(col, 0))
          g.addColorStop(0.5, rgba(col, al))
          g.addColorStop(1, rgba(col, 0))
          ctx.fillStyle = g
          ctx.fillRect(x - w / 2, -HH, w, HH * 2)
        }
        strip(0, bw, 0.6 * a)
        strip(-bw * 0.95 * dir, bw * 0.25, 0.45 * a)
      },
    }),

    /* ブラウン管オフ：老电视关机那样压成一条亮线再回来 */
    crtOff: mkFx({
      tags: ['glitch', 'emotional'],
      w: 0.3,
      dur: 8,
      pre: 4,
      amp: 1,
      scratch: true,
      draw(ctx, _ev, k, I) {
        const { cw, ch, S } = I
        if (!S) return
        let sy: number
        let sx: number
        let br: number
        if (k < 0.5) {
          const q = k / 0.5
          sy = Math.max(0.004, 1 - E.inCubic(Math.min(1, q * 1.15)))
          sx = q > 0.8 ? Math.max(0.01, 1 - E.inCubic((q - 0.8) / 0.2) * 0.99) : 1
          br = E.inQuad(q)
        } else {
          const q = (k - 0.5) / 0.5
          sy = Math.max(0.004, E.outExpo(clamp(q * 1.4 - 0.15)))
          sx = q < 0.15 ? Math.max(0.01, E.outCubic(q / 0.15)) : 1
          br = 1 - E.outCubic(q)
        }
        const w = cw * sx
        const h = Math.max(1, ch * sy)
        const x = cw / 2 - w / 2
        const y = ch / 2 - h / 2
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, cw, ch)
        ctx.drawImage(S, x, y, w, h)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = `rgba(255,255,255,${(br * 0.85).toFixed(3)})`
        ctx.fillRect(x, y, w, h)
        const gh = ch * 0.05 * br + 1
        const g = ctx.createLinearGradient(0, ch / 2 - gh, 0, ch / 2 + gh)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(0.5, `rgba(255,255,255,${(0.6 * br).toFixed(3)})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - w * 0.05, ch / 2 - gh, w * 1.1, gh * 2)
      },
    }),

    /* 上下スライド：沿一条亮缝把画面错开成两半 */
    splitSlide: mkFx({
      tags: ['graphic', 'pop', 'glitch'],
      w: 0.9,
      dur: 6,
      pre: 2,
      amp: 1,
      mid: true,
      scratch: true,
      draw(ctx, ev, k, I) {
        const { cw, ch, S, sc } = I
        if (!S) return
        const s = evS(ev)
        const amt = cover(k, 1 / 3, E.outCubic, E.inOutCubic)
        const vert = r(s, 1) < 0.3
        const sp = 0.5 + rs(s, 2) * 0.08
        if (amt <= 0.002) return
        const lw = Math.max(2, Math.round(Math.min(cw, ch) * 0.004))
        ctx.fillStyle = sc.bg
        ctx.fillRect(0, 0, cw, ch)
        if (!vert) {
          const d = cw * 0.09 * ampOf(ev) * amt
          const ys = Math.round(ch * sp)
          ctx.drawImage(S, 0, 0, cw, ys, -d, 0, cw, ys)
          ctx.drawImage(S, 0, ys, cw, ch - ys, d, ys, cw, ch - ys)
          ctx.globalAlpha = amt
          ctx.fillStyle = sc.accent
          ctx.fillRect(0, ys - lw / 2, cw, lw)
        } else {
          const d = ch * 0.1 * ampOf(ev) * amt
          const xs = Math.round(cw * sp)
          ctx.drawImage(S, 0, 0, xs, ch, 0, -d, xs, ch)
          ctx.drawImage(S, xs, 0, cw - xs, ch, xs, d, cw - xs, ch)
          ctx.globalAlpha = amt
          ctx.fillStyle = sc.accent
          ctx.fillRect(xs - lw / 2, 0, lw, ch)
        }
      },
    }),
  },
}
