/**
 * 部件包 exitB：39 个出场（退場）+ 12 个保持动效（待機中の動き）。
 *
 * 逐条移植自 JIZURA 的 src/11p_exitB.js（MIT）：数值常量、缓动曲线、hash 种子、
 * 坐标、时长一律照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由
 * registry 锁定，不要改名、不要增删。
 *
 * 出场：p 0（静止）→ 1（完全消失）；保持：amt 0..1 × fx.motion 的微弱待机动势。
 * 本包引入的运动原理：纸（撕 / 揉 / 破 / 碎 / 飘）、刚体（铰链 / 多米诺 / 滚 / 弹 /
 * 火箭）、有性格的遮罩（焦边 / 水位线 / 网点 / 条纹 / 时钟 / 板擦通道）、沿路径而行
 * （蛇形 / 扇 / 龙卷 / 吸尘）与信号类（扫描线 / 马赛克 / 色分解 / 数码雨）。
 * 一切相对 it.size 与文字项自身盒，全部由 it.seed / cut.seed / 字形序号 / env.step 决定。
 *
 * 本包自带的机制（核心只提供了一半，故在包内补齐）：
 * - 旧 `J.PT` / `J.PID` → 本文件的 `pt()` 工厂 + 核心导出的 `PIECE_IDLE`；
 * - `merged()` 合并逐字函数（保留 drawItem 认得的所有字段）、`addC()` 追加一条、
 *   `chainPre/chainPost()` 串接文字项的 pre/post 钩子、`copyOf()` 取一份"干净副本"
 *   （剥掉会重复起效的钩子与逐帧状态），`withCopies()` 用不同逐字函数多画几份；
 * - 局部坐标：`lBox()` 自身盒（原点在 it.x/it.y、未旋转）、`dBox()` 旋转后的设计空间
 *   AABB、`toD/toL` 两套坐标互转、`downI/rightI/dirI` 把设计空间方向换算到自身空间。
 *
 * 中文适配（详见移植契约）：旧包用假名/片假名充当"翻面、转轮、数码雨"的随机字符池，
 * 这里换成等长的汉字池（`FLIP_CHARS / REEL_CHARS / RAIN_CHARS`），索引取法与节奏不变；
 * 本包不画文字副读行，故不涉及旧 `J.romaji` 的替身。
 */
import type {
  AnimDef,
  BBox,
  CharFn,
  CharT,
  Env,
  LaidGlyph,
  LaidText,
  PackParts,
  PieceFn,
  PieceT,
  TextItem,
} from '../types'
import { PIECE_IDLE } from '../types'
import { drawFx } from '../layouts'
import { drawItem, itemBox } from '../draw'
import { layoutText, measure } from '../text-layout'
import { ctxOf, makeCanvas } from '../canvas'
import { glyphCount } from '../script'
import {
  DEG,
  E,
  TAU,
  clamp,
  fitContrast,
  hash,
  lerp,
  lum,
  mix,
  noise1,
  r,
  rgba,
  rs,
  smooth,
} from '../util'

type Pt = readonly [number, number]
type Poly = readonly Pt[]
/** [x, y, w, h] */
type Rect4 = readonly [number, number, number, number]
/** 会被 rotateAbout 搬动的最小形状 */
type Spin = { x: number; y: number; rot?: number }

/* ============================== 助手 ============================== */

const isHex = (c: unknown): c is string =>
  typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)
/** 只在两个十六进制色值之间插值，其余（渐变 / 图案色）就近取一边 */
const mixC = (a: string, b: string, t: number): string => {
  const k = clamp(t)
  if (k <= 0.002) return a
  if (k >= 0.998) return b
  return isHex(a) && isHex(b) ? mix(a, b, k) : k < 0.5 ? a : b
}
const colOf = (it: TextItem): string => (isHex(it.color) ? it.color : '#ffffff')
/** fx.motion 的等效倍率：0.7 记作标准强度 */
const motionK = (env: Env): number => clamp(env.fx.motion / 0.7, 0, 1.6)
const isSp = (ch: string): boolean => ch === ' ' || ch === '　'
/** 文字项自己的 seed：planner 未必给装饰项留值，|0 与 hash 的 int32 收敛一致 */
const seedOf = (it: TextItem): number => (it.seed ?? 0) | 0
const layOf = (it: TextItem): LaidText => (it._m ?? (it._m = measure(it))).lay
/** 重新度量后取自身盒（sx/sy/size 可能刚被改过） */
const box = (it: TextItem): ReturnType<typeof itemBox> => {
  it._m = measure(it)
  return itemBox(it)
}
const cutN = (env: Env): number => Math.max(1, glyphCount(String(env.cut?.text || '')))
/** cut 的 seed；无 cut 时退化为 0（与旧代码 env.cut && env.cut.seed|0 一致） */
const cutSeed = (env: Env): number => (env.cut ? env.cut.seed : 0) | 0
/** 同一 cut 内所有文字项共用的一个随机位（选择方向 / 顺序时用） */
const cutBit = (env: Env, k: number): boolean => (hash(cutSeed(env), k, 1991) & 1) === 1
const cutR = (env: Env, k: number): number => r(cutSeed(env), k, 1993)
/** 每项目一个字形（散字 / 混合版式）：此时整项一起走 */
const isSingle = (env: Env, it: TextItem): boolean => layOf(it).N === 1 && cutN(env) > 1
const win = (p: number, o: number, spread: number): number => clamp((p - o * spread) / (1 - spread))
const rot2 = (x: number, y: number, ang: number): Pt => {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [x * c - y * s, x * s + y * c]
}
/** 自身坐标 → 设计坐标 */
const toD = (it: TextItem, lx: number, ly: number): Pt => {
  const [x, y] = rot2(lx, ly, (it.rot || 0) * DEG)
  return [it.x + x, it.y + y]
}
/** 设计坐标 → 自身坐标 */
const toL = (it: TextItem, X: number, Y: number): Pt =>
  rot2(X - it.x, Y - it.y, -(it.rot || 0) * DEG)
/* 设计空间的方向用自身空间表示，这样逐字位移始终沿屏幕轴向 */
const downI = (it: TextItem): Pt => {
  const th = (it.rot || 0) * DEG
  return [Math.sin(th), Math.cos(th)]
}
const rightI = (it: TextItem): Pt => {
  const th = (it.rot || 0) * DEG
  return [Math.cos(th), -Math.sin(th)]
}
const dirI = (it: TextItem, X: number, Y: number): Pt => {
  const [a, b] = rightI(it)
  const [c, d] = downI(it)
  return [a * X + c * Y, b * X + d * Y]
}
const fadeEnd = (p: number, a = 0.85): number => 1 - smooth(a, 1, p)

/** 字形在本帧的透明度 / 缩放已经归零时直接判定隐藏，省掉后续绘制 */
const HIDE: CharT = Object.freeze({ hide: true })

/** 逐字变换的可写版本（CharT 字段全可选，累加时需要初值） */
type Acc = {
  dx: number
  dy: number
  rot: number
  s: number
  a: number
  sx?: number
  sy?: number
  skew?: number
  blur?: number
  outline?: boolean
  ch?: string
  color?: string
  clipX?: readonly [number, number]
  clipY?: readonly [number, number]
}

/** 合并若干逐字函数，保留 drawItem 认得的全部字段 */
function merged(fns: CharFn[]): CharFn {
  return (i, g, n) => {
    let o: Acc | null = null
    for (const f of fns) {
      const t = f(i, g, n)
      if (!t) continue
      if (t.hide) return HIDE
      if (!o) o = { dx: 0, dy: 0, rot: 0, s: 1, a: 1 }
      if (t.dx) o.dx += t.dx
      if (t.dy) o.dy += t.dy
      if (t.rot) o.rot += t.rot
      if (t.s != null) o.s *= t.s
      if (t.a != null) o.a *= t.a
      if (t.sx != null) o.sx = (o.sx == null ? 1 : o.sx) * t.sx
      if (t.sy != null) o.sy = (o.sy == null ? 1 : o.sy) * t.sy
      if (t.skew) o.skew = (o.skew || 0) + t.skew
      if (t.blur) o.blur = (o.blur || 0) + t.blur
      if (t.outline) o.outline = true
      if (t.ch) o.ch = t.ch
      if (t.color) o.color = t.color
      if (t.clipX)
        o.clipX = o.clipX
          ? [Math.max(o.clipX[0], t.clipX[0]), Math.min(o.clipX[1], t.clipX[1])]
          : t.clipX
      if (t.clipY)
        o.clipY = o.clipY
          ? [Math.max(o.clipY[0], t.clipY[0]), Math.min(o.clipY[1], t.clipY[1])]
          : t.clipY
    }
    if (!o) return null
    if (o.a <= 0.003 || Math.abs(o.s) < 0.004) return HIDE
    if (o.sx != null && Math.abs(o.sx) < 0.004) return HIDE
    if (o.sy != null && Math.abs(o.sy) < 0.004) return HIDE
    if ((o.clipX && o.clipX[1] <= o.clipX[0]) || (o.clipY && o.clipY[1] <= o.clipY[0])) return HIDE
    return o
  }
}

/** 追加一条逐字函数（与已有合成结果合并成单条） */
function addC(it: TextItem, fn: CharFn): void {
  if (!it.charFns) it.charFns = []
  const prev = it.charFns.splice(0)
  prev.push(fn)
  it.charFns.push(merged(prev))
}

function chainPost(it: TextItem, fn: (env: Env, it2: TextItem, bb: BBox | null) => void): void {
  const p0 = it.post
  it.post = p0
    ? (env, it2, bb) => {
        p0(env, it2, bb)
        fn(env, it2, bb)
      }
    : fn
}

function chainPre(it: TextItem, fn: (env: Env, it2: TextItem) => void): void {
  const p0 = it.pre
  it.pre = p0
    ? (env, it2) => {
        p0(env, it2)
        fn(env, it2)
      }
    : fn
}

/** 主体用 mainFn，其余每份副本用自己的逐字函数跟在主体后面画 */
function withCopies(it: TextItem, mainFn: CharFn, copyFns: CharFn[]): void {
  if (!it.charFns) it.charFns = []
  const prev = it.charFns.slice()
  const cfs = copyFns.map((f) => merged(prev.concat([f])))
  addC(it, mainFn)
  chainPost(it, (env, it2) => {
    for (const cf of cfs) {
      const c: TextItem = {
        ...it2,
        charFn: cf,
        pieceFn: null,
        pre: undefined,
        post: undefined,
        streak: null,
        echo: null,
      }
      drawItem(env, c)
    }
  })
}

/** 副本要剥掉的钩子与整项特效，否则它们会连着重来一遍 */
const COPY_RESET: Partial<
  Pick<
    TextItem,
    | 'pre'
    | 'post'
    | 'streak'
    | 'echo'
    | 'wipeBar'
    | 'cursorAt'
    | 'clip'
    | 'clipY'
    | 'clipFn'
    | 'bands'
    | 'vbands'
    | 'pieceFn'
  >
> = {
  pre: undefined,
  post: undefined,
  streak: null,
  echo: null,
  wipeBar: null,
  cursorAt: -1,
  clip: undefined,
  clipY: undefined,
  clipFn: undefined,
  bands: null,
  vbands: null,
  pieceFn: null,
}

/** 一份可以直接交给 drawFx / drawItem 的文字项副本 */
const copyOf = (it: TextItem, over?: Partial<TextItem>): TextItem =>
  Object.assign({}, it, COPY_RESET, over)

/** 在文字项自己的（已旋转）坐标系里作画；只需 x/y/rot 三项 */
function inItem(env: Env, it: Spin, fn: (ctx: CanvasRenderingContext2D) => void): void {
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

/** 逐行（竖排时逐列）在自身空间的范围 */
type LineSpan = { li: number; x0: number; x1: number; y0: number; y1: number }
function lineExt(it: TextItem): LineSpan[] {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const out: LineSpan[] = []
  for (const g of lay) {
    if (isSp(g.ch)) continue
    const L: LineSpan =
      out[g.li] || (out[g.li] = { li: g.li, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 })
    const hw = (it.vertical ? it.size : g.w) / 2
    const hh = (it.vertical ? g.h : it.size) / 2
    L.x0 = Math.min(L.x0, (g.x - hw) * sx)
    L.x1 = Math.max(L.x1, (g.x + hw) * sx)
    L.y0 = Math.min(L.y0, (g.y - hh) * sy)
    L.y1 = Math.max(L.y1, (g.y + hh) * sy)
  }
  return out.filter(Boolean)
}

/** 自身空间的盒（原点 it.x/it.y，未旋转，含 pad） */
type LBox = {
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
  w: number
  h: number
}
function lBox(it: TextItem, pad = 0): LBox {
  const b = box(it)
  return {
    x0: b.x0 - it.x - pad,
    y0: b.y0 - it.y - pad,
    x1: b.x1 - it.x + pad,
    y1: b.y1 - it.y + pad,
    cx: b.cx - it.x,
    cy: b.cy - it.y,
    w: b.w + pad * 2,
    h: b.h + pad * 2,
  }
}

/** 旋转后的自身盒 → 设计空间 AABB（含 pad 与 skew 让位） */
function dBox(it: TextItem, pad = 0): LBox {
  const b = box(it)
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1e9
  let y1 = -1e9
  for (const [px, py] of [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x0, b.y1],
    [b.x1, b.y1],
  ]) {
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
    w: x1 - x0 + 2 * pad + 2 * sk,
    h: y1 - y0 + 2 * pad,
  }
}

function scaleAbout(it: TextItem, kx: number, ky: number, ax?: number, ay?: number): void {
  let cx = ax
  let cy = ay
  if (cx === undefined || cy === undefined) {
    const b = box(it)
    cx = b.cx - it.x
    cy = b.cy - it.y
  }
  const [dx, dy] = rot2(cx * (1 - kx), cy * (1 - ky), (it.rot || 0) * DEG)
  it.x += dx
  it.y += dy
  it.sx = (it.sx || 1) * kx
  it.sy = (it.sy || 1) * ky
  it._m = undefined
  it._lay = undefined
}

function sizeAbout(it: TextItem, k: number): void {
  const b = box(it)
  const ax = b.cx - it.x
  const ay = b.cy - it.y
  const [dx, dy] = rot2(ax * (1 - k), ay * (1 - k), (it.rot || 0) * DEG)
  it.x += dx
  it.y += dy
  it.size *= k
  it._m = undefined
  it._lay = undefined
}

/** 绕自身空间里某点旋转一个 {x,y,rot} */
function rotateAbout(it: Spin, deg: number, ax: number, ay: number): void {
  const r0 = (it.rot || 0) * DEG
  const r1 = r0 + deg * DEG
  const [x0, y0] = rot2(ax, ay, r0)
  const [x1, y1] = rot2(ax, ay, r1)
  it.x += x0 - x1
  it.y += y0 - y1
  it.rot = (it.rot || 0) + deg
}

/** 自身空间的区间 → 该字形的逐字裁剪比例。gx/gy = 字形本帧画出的中心（自身空间，含 dx/dy），
 *  kx/ky = 同一条逐字函数里的额外缩放（s·sx、s·sy）；xr / yr = 自身空间的 [lo, hi] 或 null */
function gclip(
  g: LaidGlyph,
  it: TextItem,
  gx: number,
  gy: number,
  kx: number,
  ky: number,
  xr: Pt | null,
  yr: Pt | null,
): CharT {
  const sx = (it.sx || 1) * kx
  const sy = (it.sy || 1) * ky
  const o: CharT = {}
  if (!g.r90) {
    if (xr) o.clipX = [(xr[0] - gx) / (g.w * sx), (xr[1] - gx) / (g.w * sx)]
    if (yr) o.clipY = [(yr[0] - gy) / (g.h * sy), (yr[1] - gy) / (g.h * sy)]
  } else {
    // 竖排里被旋转 90° 的字形：局部 x 沿自身 +y，局部 y 沿自身 −x
    if (yr) o.clipX = [(yr[0] - gy) / (sx * g.w), (yr[1] - gy) / (sx * g.w)]
    if (xr) o.clipY = [-(xr[1] - gx) / (sy * g.h), -(xr[0] - gx) / (sy * g.h)]
  }
  return o
}
/** 字形静止时的中心（自身空间） */
const gCX = (g: LaidGlyph, it: TextItem): number => (g.x + g.vx) * (it.sx || 1)
const gCY = (g: LaidGlyph, it: TextItem): number => (g.y + g.vy) * (it.sy || 1)

/** 半平面 {u > s}（sign 为 +1）或 {u < s}（sign 为 −1），法向 (dx,dy)，画成一个巨型四边形 */
function halfPlane(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  s: number,
  sign: number,
  L = 1e5,
): void {
  const tx = -dy
  const ty = dx
  const a = sign > 0 ? s : s - L
  const b = sign > 0 ? s + L : s
  ctx.moveTo(dx * a + tx * L, dy * a + ty * L)
  ctx.lineTo(dx * b + tx * L, dy * b + ty * L)
  ctx.lineTo(dx * b - tx * L, dy * b - ty * L)
  ctx.lineTo(dx * a - tx * L, dy * a - ty * L)
  ctx.closePath()
}

/** 用文字项当前的变换画出自身空间的多边形（只建路径） */
function polyL(ctx: CanvasRenderingContext2D, it: TextItem, pts: Poly): void {
  for (let k = 0; k < pts.length; k++) {
    const [X, Y] = toD(it, pts[k][0], pts[k][1])
    if (k) ctx.lineTo(X, Y)
    else ctx.moveTo(X, Y)
  }
  ctx.closePath()
}

/** 本帧是否有任何字形带模糊（如聚光加工）？字形滤镜上再叠投影代价极高 */
function glyphBlur(it: TextItem): boolean {
  if (!it.charFns || !it.charFns.length) return false
  const lay = layOf(it)
  for (const g of lay)
    for (const f of it.charFns) {
      const t = f(g.i, g, lay.N)
      if (t && (t.blur || 0) > 0.4) return true
    }
  return false
}

/** 把本项所有字形模糊整体乘以 k（先合并成一条） */
function scaleGlyphBlur(it: TextItem, k: number): void {
  if (!it.charFns || !it.charFns.length) return
  const m = merged(it.charFns.splice(0))
  it.charFns.push((i, g, n) => {
    const t = m(i, g, n)
    return t && t.blur ? Object.assign({}, t, { blur: t.blur * k }) : t
  })
}

const beatLen = (env: Env, fb: number): number => (env.beat && env.beat.len ? env.beat.len : fb)
const beatSince = (env: Env, fb: number): number =>
  env.beat ? env.beat.since : ((env.ltb % fb) + fb) % fb
const beatIdx = (env: Env, fb: number): number =>
  env.beat ? env.beat.index : Math.floor(env.ltb / fb)
const darkBg = (env: Env): boolean => lum(env.sc.bg) < 0.5
/** 只对"歌词本体"成立：淡出副本与描边副本不加附属装饰 */
const primary = (it: TextItem): boolean => (it.alpha ?? 1) > 0.9 && it.fill !== false

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
function pushPiece(it: TextItem, fn: PieceFn): void {
  ;(it.pieceFns ??= []).push(fn)
}

/** 字形序号在本 cut 内的先后 0..1；单项一字的版式改用它在 cut 中的 mi */
function orderOf(env: Env, it: TextItem): (i: number, n: number) => number {
  const N = cutN(env)
  const mi = it.mi || 0
  return (i, n) => (n > 1 ? i / (n - 1) : N > 1 ? clamp(mi / (N - 1)) : 0)
}

/** 乱码 / 转轮 / 数码雨用的字符池：旧包用假名，这里换成等长汉字池 */
const REEL_CHARS =
  '梦光影空夜星雨泪心恋声花月风爱嘘罪色音海碎虚妄时缘念火冰雷晨雾远山雪云0123456789'
const RAIN_CHARS =
  '梦光影空夜星雨泪心恋声花月风爱嘘罪色音海碎虚妄时缘念火冰雷晨雾远山雪云天江湖酒剑诗歌书画窗0123456789'
const FLIP_CHARS =
  '梦光影空夜星雨泪心恋声花月风爱嘘罪色音海碎虚妄时缘念火冰雷晨雾远山雪云天江湖酒剑诗歌书画窗灯'

/** 马赛克出场的离屏缓冲（整帧共用一块，只按需长大） */
let MOSAIC: HTMLCanvasElement | null = null

/** 弹跳行程：4 段等比衰减的弹跳，给出当前高度与"正落地"的程度 */
function hops(q: number): { h: number; land: number } {
  const R = 0.64
  const NH = 4
  let S = 0
  for (let j = 0; j < NH; j++) S += Math.pow(R, j)
  let t = q * S
  for (let j = 0; j < NH; j++) {
    const d = Math.pow(R, j)
    if (t <= d || j === NH - 1) {
      const u = clamp(t / d)
      const hk = d * d
      return {
        h: hk * 4 * u * (1 - u),
        land: Math.max(0, 1 - Math.min(u, 1 - u) / 0.09) * Math.sqrt(hk),
      }
    }
    t -= d
  }
  return { h: 0, land: 0 }
}

/* ============================== 出场 ============================== */

const X: Record<string, AnimDef> = {
  /* ---------------- 纸 ---------------- */

  /** 贴纸剥落：一条折线斜穿文字，被掀起的部分按镜像画出（贴纸的背面） */
  peelOff: {
    tags: ['pop', 'graphic'],
    w: 1,
    outDur: (dur) => clamp(dur * 0.36, 0.3, 0.7),
    apply(env, it, p) {
      const q = isSingle(env, it) ? win(p, orderOf(env, it)(0, 1), 0.4) : p
      if (q <= 0) return
      const v = (hash(cutSeed(env), 311) >>> 5) & 3
      const dx = [0.83, -0.83, 0.83, -0.83][v]
      const dy = [0.56, 0.56, -0.56, -0.56][v]
      const sz = it.size
      const bb = dBox(it, sz * 0.06)
      const us = [
        [bb.x0, bb.y0],
        [bb.x1, bb.y0],
        [bb.x0, bb.y1],
        [bb.x1, bb.y1],
      ].map((c) => c[0] * dx + c[1] * dy)
      const u0 = Math.min(...us)
      const u1 = Math.max(...us)
      const PE = 0.74
      const f = clamp(q / PE)
      const fly = clamp((q - PE) / (1 - PE))
      const s = lerp(u0, u1, 0.1 * f + 0.9 * f * f * (3 - 2 * f))
      const a0 = it.alpha ?? 1
      const c0 = colOf(it)
      const bg = env.sc.bg
      const back = mixC(mixC(c0, bg, 0.5), env.sc.accent, 0.18)
      if (f < 1) it.clipFn = (ctx) => halfPlane(ctx, dx, dy, s, 1)
      else it.alpha = 0
      chainPost(it, (env2, it2) => {
        const ctx = env2.ctx
        const fa = a0 * (1 - E.inQuad(fly))
        if (fa <= 0.01) return
        const lift = sz * (0.05 + 0.1 * f)
        const flap = copyOf(it2, {
          alpha: fa,
          color: back,
          gradient: undefined,
          pattern: undefined,
          extrude: undefined,
          blur: 0,
          ghost: false,
          shadow:
            env2.pass === 'main'
              ? {
                  color: rgba('#000000', darkBg(env2) ? 0.5 : 0.28),
                  blur: sz * 0.12,
                  dx: dx * lift,
                  dy: dy * lift + lift,
                }
              : undefined,
        })
        ctx.save()
        if (fly <= 0) {
          ctx.beginPath()
          halfPlane(ctx, dx, dy, s, 1)
          ctx.clip()
        } else {
          const m = sz * 2.2 * fly * fly
          ctx.translate(dx * m, dy * m - sz * 1.2 * fly)
        }
        // 关于折线做镜面反射
        ctx.transform(
          1 - 2 * dx * dx,
          -2 * dx * dy,
          -2 * dx * dy,
          1 - 2 * dy * dy,
          2 * s * dx,
          2 * s * dy,
        )
        drawItem(env2, flap)
        ctx.restore()
      })
    },
  },

  /** 揉成团再扔掉：三下急捏后抛离画面 */
  crumpleOut: {
    tags: ['pop', 'emotional'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.42, 0.36, 0.85),
    apply(env, it, p) {
      const seed = seedOf(it)
      const W = env.W
      const H = env.H
      const bg = env.sc.bg
      const c0 = colOf(it)
      const g1 = E.outBack(clamp(p / 0.15), 1.6)
      const g2 = E.outBack(clamp((p - 0.17) / 0.15), 1.6)
      const g3 = E.outBack(clamp((p - 0.34) / 0.15), 1.6)
      const cr = clamp(0.45 * g1 + 0.3 * g2 + 0.25 * g3, 0, 1.08)
      const k = 1 - 0.93 * Math.min(1, cr)
      const v = clamp((p - 0.5) / 0.5)
      const dir = cutBit(env, 21) ? 1 : -1
      const spin = dir * (cr * 25 + 620 * v * v)
      const tx = dir * W * 0.42 * v
      const ty = -H * 0.8 * v + H * 1.75 * v * v
      const alpha = fadeEnd(p, 0.88)
      if (isSingle(env, it)) {
        const mi = it.mi || 0
        const jx = rs(cutSeed(env), mi, 23) * it.size * 0.25
        const jy = rs(cutSeed(env), mi, 24) * it.size * 0.25
        const [nx, ny] = rot2(
          (it.x - W / 2) * k + jx * cr,
          (it.y - H / 2) * k + jy * cr,
          spin * DEG,
        )
        it.x = W / 2 + nx + tx
        it.y = H / 2 + ny + ty
        it.rot = (it.rot || 0) + spin + rs(seed, 22) * 150 * cr
        it.size *= 1 - 0.5 * Math.min(1, cr)
        it._m = undefined
        it._lay = undefined
        it.skew = (it.skew || 0) + rs(seed, 25) * 22 * cr
        it.alpha = (it.alpha ?? 1) * alpha
        return
      }
      const b = lBox(it)
      const ox = b.cx
      const oy = b.cy
      const sz = it.size
      const [tix, tiy] = dirI(it, tx, ty)
      addC(it, (i, g) => {
        const px = gCX(g, it) - ox
        const py = gCY(g, it) - oy
        const jx = rs(seed, i, 26) * sz * 0.22
        const jy = rs(seed, i, 27) * sz * 0.22
        const [nx, ny] = rot2(px * k + jx * cr, py * k + jy * cr, spin * DEG)
        const r1 = r(seed, i, 28)
        const r2 = r(seed, i, 29)
        return {
          dx: nx - px + tix,
          dy: ny - py + tiy,
          rot: spin + rs(seed, i, 30) * 170 * cr,
          s: 1 - 0.55 * Math.min(1, cr),
          sx: 1 - 0.35 * r1 * cr,
          sy: 1 - 0.35 * r2 * cr,
          skew: rs(seed, i, 31) * 26 * cr,
          color: r1 < 0.45 ? mixC(c0, bg, 0.3 * Math.min(1, cr)) : undefined,
          a: alpha,
        }
      })
    },
  },

  /** 撕成两半扔掉：沿一条锯齿线破开，两半各自转开下坠 */
  tearOut: {
    tags: ['emotional', 'graphic'],
    w: 0.9,
    outDur: (dur) => clamp(dur * 0.38, 0.3, 0.75),
    apply(env, it, p) {
      const vert = !!it.vertical
      const seed = seedOf(it)
      const sz = it.size
      let polyA: Poly
      let polyB: Poly
      let piv: Pt
      if (isSingle(env, it) && !vert) {
        // 每项一字：整屏只来一条穿过画面中央的撕裂线
        const cs = cutSeed(env)
        const bb = dBox(it, sz * 0.3)
        const W = env.W
        const K = clamp(Math.ceil((bb.y1 - bb.y0) / (sz * 0.08)), 4, 40)
        const jD: Pt[] = []
        for (let k = 0; k <= K; k++) {
          const Y = lerp(bb.y0, bb.y1, k / K)
          jD.push([
            W / 2 +
              noise1(Y / (env.H * 0.035), cs + 5) * env.H * 0.02 +
              rs(cs, Math.round(Y / (env.H * 0.008)), 331) * env.H * 0.006,
            Y,
          ])
        }
        const toLocal = (pts: Poly): Poly => pts.map(([X2, Y2]) => toL(it, X2, Y2))
        polyA = toLocal([[-W, bb.y0], ...jD, [-W, bb.y1]])
        polyB = toLocal([[2 * W, bb.y0], ...jD, [2 * W, bb.y1]])
        piv = toL(it, W / 2, env.H * 0.62)
      } else {
        const b = lBox(it, sz * 0.3)
        const mid = vert ? b.cy : b.cx
        const a0 = vert ? b.x0 : b.y0
        const a1 = vert ? b.x1 : b.y1
        const K = clamp(Math.ceil((a1 - a0) / (sz * 0.08)), 6, 48)
        const jag: Pt[] = []
        for (let k = 0; k <= K; k++) {
          const t = lerp(a0, a1, k / K)
          const off = rs(seed, k, 331) * sz * 0.05 + noise1(k * 0.35, seed + 5) * sz * 0.16
          jag.push(vert ? [t, mid + off] : [mid + off, t])
        }
        // A = 左半（竖排时上半），B = 右半（竖排时下半）
        polyA = vert
          ? [[b.x0, b.y0 - sz], ...jag, [b.x1, b.y0 - sz]]
          : [[b.x0 - sz, b.y0], ...jag, [b.x0 - sz, b.y1]]
        polyB = vert
          ? [[b.x0, b.y1 + sz], ...jag, [b.x1, b.y1 + sz]]
          : [[b.x1 + sz, b.y0], ...jag, [b.x1 + sz, b.y1]]
        // 破口从远端开始，向近端拉开
        piv = jag[jag.length - 1]
      }
      const o = E.outCubic(clamp(p / 0.32))
      const v = clamp((p - 0.26) / 0.74)
      const th = 7 * o + 40 * v * v
      const fall = env.H * 1.1 * v * v
      const side = sz * 1.6 * v
      const place = (h: Spin, sgn: number): void => {
        rotateAbout(h, (vert ? -sgn : sgn) * th, piv[0], piv[1])
        if (vert) {
          h.x += sgn * side * 0.35 - side * 0.4
          h.y += fall + sgn * sz * 0.3 * v
        } else {
          h.x += sgn * side
          h.y += fall * (sgn < 0 ? 1 : 0.85)
        }
      }
      const A: Spin = { x: it.x, y: it.y, rot: it.rot || 0 }
      const B: Spin = { x: it.x, y: it.y, rot: it.rot || 0 }
      place(A, -1)
      place(B, 1)
      const alpha = (it.alpha ?? 1) * fadeEnd(p, 0.82)
      it.x = A.x
      it.y = A.y
      it.rot = A.rot
      it.alpha = alpha
      it.clipFn = (ctx, _e, it3) => polyL(ctx, it3, polyA)
      chainPost(it, (env2, it2) => {
        drawFx(
          env2,
          copyOf(it2, {
            x: B.x,
            y: B.y,
            rot: B.rot,
            clipFn: (ctx, _e3, it3) => polyL(ctx, it3, polyB),
          }),
        )
      })
    },
  },

  /** 烧焦消失：一条带粗糙抖动边缘的火舌横扫过文字——加热带、发光边、烟灰、火星 */
  scorchOut: {
    tags: ['emotional', 'glitch'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.4, 0.32, 0.8),
    apply(env, it, p) {
      const single = isSingle(env, it)
      // 单项一字的版式共用一条横贯屏幕的火线
      const q = p
      const vert = !!it.vertical
      const sz = it.size
      const t = env.ltb
      const acc = env.sc.accent
      const c0 = colOf(it)
      const bg = env.sc.bg
      const seed = single ? cutSeed(env) : seedOf(it)
      const U = single ? Math.min(env.W, env.H) * 0.16 : sz
      const bb = dBox(it, sz * 0.2)
      let d: Pt = vert ? [0.22, 1] : [1, 0.22]
      const dl = Math.hypot(d[0], d[1])
      d = [d[0] / dl, d[1] / dl]
      if (cutBit(env, 31)) d = [-d[0], -d[1]]
      const tn: Pt = [-d[1], d[0]]
      const cs: Pt[] = [
        [bb.x0, bb.y0],
        [bb.x1, bb.y0],
        [bb.x0, bb.y1],
        [bb.x1, bb.y1],
      ]
      const us = cs.map((c) => c[0] * d[0] + c[1] * d[1])
      const ws = cs.map((c) => c[0] * tn[0] + c[1] * tn[1])
      const w0 = Math.min(...ws)
      const w1 = Math.max(...ws)
      const ux = single
        ? [
            [0, 0],
            [env.W, 0],
            [0, env.H],
            [env.W, env.H],
          ].map((c) => c[0] * d[0] + c[1] * d[1])
        : us
      const u0 = Math.min(...ux)
      const u1 = Math.max(...ux)
      const rough = U * 0.2
      const band = U * 0.4
      const S = (x: number): number =>
        lerp(u0 - rough * 1.3, u1 + rough * 1.3 + band, E.inOutSine(x))
      const s = S(q)
      const K = clamp(Math.ceil((w1 - w0) / (U * 0.07)), 6, 60)
      const ptUV = (u: number, w: number): Pt => [d[0] * u + tn[0] * w, d[1] * u + tn[1] * w]
      const edgeU = (w: number): number =>
        s +
        rough * (0.75 * noise1((w / U) * 2.4, seed) + 0.3 * noise1((w / U) * 8 + t * 6, seed + 3))
      const edge: Pt[] = []
      for (let k = 0; k <= K; k++) {
        const w = lerp(w0, w1, k / K)
        edge.push([edgeU(w), w])
      }
      const uMax = Math.max(...us)
      if (edge.every((e) => e[0] > uMax + rough)) {
        it.alpha = 0
        return
      }
      const far = Math.max(u1, uMax) + U * 4
      // edge+off0 与 edge+off1 之间的区域（off1 为 null → 一直到远端）
      const path = (ctx: CanvasRenderingContext2D, off0: number, off1: number | null): void => {
        edge.forEach(([u, w], k) => {
          const P2 = ptUV(u + off0, w)
          if (k) ctx.lineTo(P2[0], P2[1])
          else ctx.moveTo(P2[0], P2[1])
        })
        if (off1 == null) {
          const A2 = ptUV(far, w1)
          const B2 = ptUV(far, w0)
          ctx.lineTo(A2[0], A2[1])
          ctx.lineTo(B2[0], B2[1])
        } else {
          for (let k = edge.length - 1; k >= 0; k--) {
            const P2 = ptUV(edge[k][0] + off1, edge[k][1])
            ctx.lineTo(P2[0], P2[1])
          }
        }
        ctx.closePath()
      }
      it.clipFn = (ctx) => path(ctx, 0, null)
      const heat = mixC(c0, acc, 0.85)
      const soot = darkBg(env) ? mixC(bg, acc, 0.25) : mixC(bg, '#000000', 0.45)
      const lw = Math.max(1.5, U * 0.03)
      const a0 = it.alpha ?? 1
      const rimA = a0 * (1 - smooth(0.86, 1, q))
      chainPost(it, (env2, it2) => {
        drawFx(
          env2,
          copyOf(it2, {
            color: heat,
            gradient: undefined,
            pattern: undefined,
            alpha: a0 * 0.9,
            clipFn: (ctx) => path(ctx, 0, band),
          }),
        )
        if (env2.pass !== 'main') return
        const ep = edge.map(([u, w]) => ptUV(u, w))
        const sp = edge.map(([u, w]) => ptUV(u - lw * 1.6, w))
        env2.line(sp, soot, lw * 2.2, 0.8 * rimA, false)
        env2.line(ep, acc, lw * 4, 0.22 * rimA, false)
        env2.line(ep, acc, lw, rimA, false)
        // 火星：从边缘生成，向后上方飘
        for (let j = 0; j < (single ? 6 : 22); j++) {
          const t0 = r(seed, j, 341) * 0.85
          const age = (q - t0) / 0.28
          if (age <= 0 || age >= 1) continue
          const w = lerp(w0, w1, r(seed, j, 342))
          const [X0, Y0] = ptUV(edgeU(w) - (s - S(t0)) - U * 0.05, w)
          const X1 = X0 - d[0] * U * 0.3 * age + Math.sin(age * 7 + j) * U * 0.06
          const Y1 = Y0 - d[1] * U * 0.3 * age - U * 0.9 * age
          env2.circle(
            X1,
            Y1,
            Math.max(0.8, U * 0.028 * (1 - age)),
            acc,
            null,
            0,
            a0 * (1 - age),
            false,
          )
        }
      })
    },
  },

  /* ---------------- 光 ---------------- */

  /** 白飛び：文字过曝到全白（亮底方案则漂白成纸色），带光晕与镜头拉丝 */
  overexposeOut: {
    tags: ['emotional', 'calm', 'pop'],
    w: 1,
    apply(env, it, p) {
      const dark = darkBg(env)
      const c0 = colOf(it)
      const sz = it.size
      const acc = env.sc.accent
      const hot = dark ? '#ffffff' : env.sc.bg
      const glow = dark ? mixC(acc, '#ffffff', 0.45) : acc
      const a = E.inQuad(clamp(p / 0.5))
      const e = E.outCubic(clamp(p / 0.7))
      it.color = mixC(c0, hot, a)
      if (it.gradient) it.gradient = undefined
      if (it.pattern) it.pattern = undefined
      // 焦点虚化让位于光晕（字形滤镜上再叠投影代价极高）
      scaleGlyphBlur(it, 1 - smooth(0, 0.12, p))
      // 过曝会吞掉景深效果（也省下 bloom 的开销）；加工可能在 pre 里重设 extrude，故一并拦住
      if (p > 0.08) {
        it.extrude = undefined
        chainPre(it, (_e2, i2) => {
          i2.extrude = undefined
        })
      }
      sizeAbout(it, 1 + 0.07 * e)
      it.track = (it.track || 0) + 0.06 * e
      const fade = 1 - E.inOutSine(clamp((p - 0.38) / 0.62))
      if (env.pass === 'main')
        it.shadow = { color: rgba(glow, 0.95), blur: sz * (0.05 + 0.4 * e), dx: 0, dy: 0 }
      it.alpha = (it.alpha ?? 1) * fade
      // 主体下面再垫一层更宽的光晕
      if (env.pass === 'main' && e > 0.02 && p > 0.12) {
        const ga = it.alpha
        chainPre(it, (env2, it2) =>
          drawItem(
            env2,
            copyOf(it2, {
              color: glow,
              gradient: undefined,
              pattern: undefined,
              extrude: undefined,
              stroke: 0,
              alpha: ga * 0.8,
              blur: 0,
              charFn: it2.charFn,
              shadow: { color: rgba(glow, 1), blur: sz * 0.9 * e, dx: 0, dy: 0 },
            }),
          ),
        )
      }
      const st = Math.sin(Math.PI * clamp((p - 0.12) / 0.88))
      if (st > 0.02 && primary(it) && (!isSingle(env, it) || Math.round(it.mi || 0) === 0)) {
        chainPost(it, (env2, it2) => {
          const B: { cx: number; cy: number; w: number } = isSingle(env2, it2)
            ? { cx: env2.W / 2, cy: it2.y, w: 0 }
            : dBox(it2, 0)
          const w = (isSingle(env2, it2) ? env2.W * 0.5 : B.w) * (0.8 + 0.9 * e)
          const cy = B.cy
          const cx = B.cx
          env2.rect(cx - w / 2, cy - sz * 0.09, w, sz * 0.18, glow, 0.14 * st, false)
          env2.rect(cx - w * 0.75, cy - sz * 0.03, w * 1.5, sz * 0.06, glow, 0.35 * st, false)
          env2.rect(cx - w * 0.9, cy - sz * 0.009, w * 1.8, sz * 0.018, glow, 0.95 * st, false)
        })
      }
    },
  },

  /* ---------------- 信号 ---------------- */

  /** 扫描线擦除：一条亮线跑下来，线后的光栅拆成隔行细条，横移并变细 */
  scanOut: {
    tags: ['glitch', 'graphic'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const seed = seedOf(it)
      const bb = dBox(it, sz * 0.3)
      const h = bb.y1 - bb.y0
      let pitch = Math.max(2.5, sz * 0.065)
      if (h / pitch > 64) pitch = h / 64
      const n = Math.ceil(h / pitch)
      const ph = h / n
      const single = isSingle(env, it)
      const L = single ? env.H * 0.14 : Math.max(sz * 0.9, h * 0.3)
      // 单项一字：整屏共用一条扫描线
      const ys = single
        ? lerp(env.H * 0.2, env.H * 0.8 + L, p)
        : lerp(bb.y0 - sz * 0.02, bb.y1 + L, p)
      const rects: [number, number][] = []
      let lastScan = -1
      for (let j = 0; j < n; j++) {
        const y0 = bb.y0 + j * ph
        const yc = y0 + ph / 2
        const a = clamp((ys - yc) / L)
        if (a <= 0) break
        lastScan = j
        const keep = j & 1 ? 1 - clamp(a / 0.4) : 1 - E.inQuad(a)
        const hh = ph * keep * 0.8
        if (hh > 0.08) rects.push([yc - hh / 2, hh])
      }
      // 尚未扫到的区域从这条线开始
      const yU = bb.y0 + (lastScan + 1) * ph
      if (!rects.length && yU >= bb.y1 - 0.5) {
        it.alpha = 0
        return
      }
      it.clipFn = (ctx) => {
        for (const [y, hh] of rects) ctx.rect(bb.x0 - sz * 3, y, bb.w + sz * 6, hh)
        if (yU < bb.y1) ctx.rect(bb.x0 - sz * 3, yU, bb.w + sz * 6, bb.y1 - yU + 1)
      }
      const G = 7
      const gh = (yU - bb.y0) / G
      const bands: [number, number, number][] = []
      if (yU > bb.y0 + 0.5 && env.pass === 'main') {
        for (let k = 0; k < G; k++) {
          const y0 = bb.y0 + k * gh
          const a = clamp((ys - (y0 + gh / 2)) / L)
          bands.push([
            y0,
            y0 + gh + 0.3,
            (k & 1 ? -1 : 1) * sz * (0.04 + 1.1 * a * a) * (0.5 + 0.5 * r(seed, k, 351)),
          ])
        }
      }
      if (bands.length) {
        bands.push([yU, bb.y1, 0])
        it.bands = bands
      }
      if (ys < bb.y1 + sz * 0.1 && ys > bb.y0 - sz * 0.1) {
        const acc = env.sc.accent
        const lw = Math.max(1.5, sz * 0.025)
        const a0 = (it.alpha ?? 1) * (1 - smooth(0.8, 1, p))
        chainPost(it, (env2) => {
          env2.rect(bb.x0 - sz * 0.2, ys - lw * 3, bb.w + sz * 0.4, lw * 6, acc, 0.18 * a0, false)
          env2.rect(bb.x0 - sz * 0.2, ys - lw / 2, bb.w + sz * 0.4, lw, acc, a0, false)
        })
      }
    },
  },

  /* ---------------- 图形遮罩 ---------------- */

  /** 条纹擦除：斜向条纹，每条沿自身长度被抹去，方向交替、逐条错开 */
  stripesOut: {
    tags: ['graphic', 'pop'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const bb = dBox(it, sz * 0.12)
      const acc = env.sc.accent
      const ang = (cutBit(env, 41) ? 64 : 116) * DEG
      const Ld: Pt = [Math.cos(ang), Math.sin(ang)]
      const Ad: Pt = [-Ld[1], Ld[0]]
      const cs: Pt[] = [
        [bb.x0, bb.y0],
        [bb.x1, bb.y0],
        [bb.x0, bb.y1],
        [bb.x1, bb.y1],
      ]
      const as = cs.map((c) => c[0] * Ad[0] + c[1] * Ad[1])
      const ls = cs.map((c) => c[0] * Ld[0] + c[1] * Ld[1])
      const a0 = Math.min(...as)
      const a1 = Math.max(...as)
      const l0 = Math.min(...ls)
      const l1 = Math.max(...ls)
      let n = Math.max(2, Math.ceil((a1 - a0) / Math.max(6, sz * 0.38)))
      if (n > 48) n = 48
      const sw = (a1 - a0) / n
      const rem: [number, number, number, number][] = []
      const caps: [number, number, number, number, number][] = []
      const rev = cutBit(env, 42)
      for (let k = 0; k < n; k++) {
        const o = n > 1 ? k / (n - 1) : 0
        const st = (rev ? 1 - o : o) * 0.42
        const q = E.inOutCubic(clamp((p - st) / 0.58))
        if (q >= 1) continue
        const fromStart = (k & 1) === 1
        const la = fromStart ? lerp(l0, l1, q) : l0
        const lb = fromStart ? l1 : lerp(l1, l0, q)
        rem.push([a0 + k * sw, a0 + (k + 1) * sw + 0.6, la, lb])
        if (q > 0)
          caps.push([
            a0 + k * sw,
            a0 + (k + 1) * sw,
            fromStart ? la : lb,
            fromStart ? 1 : -1,
            1 - smooth(0.8, 1, q),
          ])
      }
      if (!rem.length) {
        it.alpha = 0
        return
      }
      const ptAL = (a: number, l: number): Pt => [Ad[0] * a + Ld[0] * l, Ad[1] * a + Ld[1] * l]
      it.clipFn = (ctx) => {
        for (const [aa, ab, la, lb] of rem) {
          const A2 = ptAL(aa, la)
          const B2 = ptAL(ab, la)
          const C2 = ptAL(ab, lb)
          const D2 = ptAL(aa, lb)
          ctx.moveTo(A2[0], A2[1])
          ctx.lineTo(B2[0], B2[1])
          ctx.lineTo(C2[0], C2[1])
          ctx.lineTo(D2[0], D2[1])
          ctx.closePath()
        }
      }
      const th = Math.max(2, sz * 0.045)
      const al = it.alpha ?? 1
      const tb = dBox(it, sz * 0.02)
      if (caps.length)
        chainPost(it, (env2) => {
          if (env2.pass !== 'main') return
          const ctx = env2.ctx
          ctx.save()
          ctx.beginPath()
          // 刻度只出现在有字的地方
          ctx.rect(tb.x0, tb.y0, tb.w, tb.h)
          ctx.clip()
          for (const [aa, ab, l, sg, ca] of caps)
            env2.poly(
              [
                ptAL(aa + 0.5, l - sg * th),
                ptAL(ab - 0.5, l - sg * th),
                ptAL(ab - 0.5, l),
                ptAL(aa + 0.5, l),
              ],
              acc,
              al * ca,
              false,
            )
          ctx.restore()
        })
    },
  },

  /** 消进网点：填充碎成一 screens 网点，网点随扫过方向缩掉 */
  halftoneOut: {
    tags: ['graphic', 'calm'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const bb = dBox(it, sz * 0.1)
      const w = bb.x1 - bb.x0
      const h = bb.y1 - bb.y0
      const vert = !!it.vertical
      let c = Math.max(3, sz * 0.15)
      while ((w / c + 2) * (h / (c * 0.866) + 2) > 220) c *= 1.1
      const rows = Math.ceil(h / (c * 0.866)) + 1
      const cols = Math.ceil(w / c) + 2
      const R0 = c * 0.64
      const rev = cutBit(env, 51)
      const dots: number[] = []
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const cx = bb.x0 + (col + (row & 1 ? 0.5 : 0) - 0.5) * c
          const cy = bb.y0 + row * c * 0.866
          let pos = vert
            ? ((cy - bb.y0) / h) * 0.8 + ((cx - bb.x0) / w) * 0.2
            : ((cx - bb.x0) / w) * 0.8 + ((cy - bb.y0) / h) * 0.2
          if (rev) pos = 1 - pos
          const k = clamp(p * 1.55 - pos * 0.55)
          const rad = R0 * (1 - E.inOutSine(k))
          if (rad > 0.3) dots.push(cx, cy, rad)
        }
      if (!dots.length) {
        it.alpha = 0
        return
      }
      it.clipFn = (ctx) => {
        for (let j = 0; j < dots.length; j += 3) {
          ctx.moveTo(dots[j] + dots[j + 2], dots[j + 1])
          ctx.arc(dots[j], dots[j + 1], dots[j + 2], 0, TAU)
        }
      }
      it.color = mixC(colOf(it), env.sc.accent, 0.4 * smooth(0.05, 0.5, p))
    },
  },

  /** 黑板擦：毛擦块一条一条来回擦，擦过的地方留一层慢慢淡掉的粉笔灰 */
  eraserOut: {
    tags: ['editorial', 'calm'],
    w: 0.9,
    minDur: 0.9,
    outDur: (dur) => clamp(dur * 0.42, 0.36, 0.85),
    apply(env, it, p) {
      const sz = it.size
      const vert = !!it.vertical
      const single = isSingle(env, it)
      const W = env.W
      const H = env.H
      const bb: LBox = single
        ? { x0: W * 0.03, x1: W * 0.97, y0: H * 0.3, y1: H * 0.7, cx: 0, cy: 0, w: 0, h: 0 }
        : dBox(it, sz * 0.12)
      bb.w = bb.x1 - bb.x0
      bb.h = bb.y1 - bb.y0
      const U = single ? H * 0.13 : sz
      const span = vert ? bb.w : bb.h
      const len = vert ? bb.h : bb.w
      const K = single ? 3 : clamp(Math.round(span / (U * 0.7)), 2, 10)
      const lh = span / K
      const ew = U * 0.8
      const leg = len + ew
      const pos = clamp(p / 0.9) * K * leg
      // 擦子中心在当前通道内的行程
      const lane = Math.min(K - 1, Math.floor(pos / leg))
      const along = pos - lane * leg - ew / 2
      const fwd = (j: number): boolean => (j & 1) === 0
      // 通道 j 的矩形：a = 通道方向，s = 沿笔画方向（自通道起点起算）
      const laneR = (j: number, s0: number, s1: number): Rect4 => {
        const a0 = vert ? bb.x1 - (j + 1) * lh : bb.y0 + j * lh
        const L0 = vert ? bb.y0 : bb.x0
        const t0 = fwd(j) ? L0 + s0 : L0 + len - s1
        const t1 = fwd(j) ? L0 + s1 : L0 + len - s0
        return vert ? [a0, t0, lh, t1 - t0] : [t0, a0, t1 - t0, lh]
      }
      const cut = clamp(along + ew * 0.3, 0, len)
      const keep: Rect4[] = []
      const gone: Rect4[] = []
      if (along + ew * 0.3 < len + 0.5) keep.push(laneR(lane, cut, len))
      for (let j = lane + 1; j < K; j++) keep.push(laneR(j, 0, len))
      for (let j = 0; j < lane; j++) gone.push(laneR(j, 0, len))
      if (cut > 0) gone.push(laneR(lane, 0, cut))
      if (!keep.length && p > 0.9) it.alpha = 0
      const pad = (list: Rect4[], ctx: CanvasRenderingContext2D): void => {
        for (const q of list) ctx.rect(q[0], q[1], q[2] + 0.4, q[3] + 0.4)
      }
      const a0 = it.alpha ?? 1
      it.clipFn = (ctx) => pad(keep, ctx)
      const smear = a0 * 0.26 * (1 - smooth(0.35, 0.95, p))
      const eA = 1 - smooth(0.9, 1, p)
      const acc = env.sc.accent
      const felt = mixC(acc, env.sc.bg, 0.45)
      const drawEraser = !single || Math.round(it.mi || 0) === 0
      chainPost(it, (env2, it2) => {
        // 粉笔痕：擦过的地方模糊、沿笔画方向拉伸
        if (smear > 0.01 && gone.length && env2.pass === 'main') {
          const sm = copyOf(it2, {
            alpha: smear,
            blur: Math.min(sz * 0.1, 28),
            clipFn: (ctx) => pad(gone, ctx),
            gradient: undefined,
            pattern: undefined,
            shadow: undefined,
            extrude: undefined,
            color: mixC(colOf(it2), env2.sc.bg, 0.25),
          })
          if (vert) sm.sy = (sm.sy || 1) * 1.12
          else sm.sx = (sm.sx || 1) * 1.1
          drawFx(env2, sm)
        }
        if (!drawEraser || eA <= 0.01) return
        const c = clamp(along, -ew / 2, len + ew / 2)
        const rr2 = laneR(lane, c - ew / 2, c + ew / 2)
        const x = rr2[0] - (vert ? lh * 0.03 : 0)
        const y = rr2[1] - (vert ? 0 : lh * 0.03)
        const w = rr2[2] + (vert ? lh * 0.06 : 0)
        const h = rr2[3] + (vert ? 0 : lh * 0.06)
        env2.rrect(x, y, w, h, Math.min(w, h) * 0.18, acc, eA, false)
        // 后缘的毛毡条
        const k = 0.3
        if (vert) {
          const fy = fwd(lane) ? y : y + h * (1 - k)
          env2.rrect(x, fy, w, h * k, Math.min(w, h) * 0.12, felt, eA, false)
        } else {
          const fx = fwd(lane) ? x : x + w * (1 - k)
          env2.rrect(fx, y, w * k, h, Math.min(w, h) * 0.12, felt, eA, false)
        }
      })
    },
  },

  /** 被吸进一个点：朝线端外的一点收拢，近的先走，路上越拉越长 */
  vacuumOut: {
    tags: ['pop', 'graphic'],
    w: 0.9,
    apply(env, it, p) {
      const vert = !!it.vertical
      const sz = it.size
      const acc = env.sc.accent
      const rev = cutBit(env, 61)
      const seed = seedOf(it)
      const single = isSingle(env, it)
      // 收拢点上的亮点与尾环（fr = 已被吃掉的比例）
      const dot = (T: Pt, fr: number, drawIt: boolean): void => {
        if (!drawIt) return
        const pulse = 1 + 0.25 * Math.sin(p * 40) * (1 - p)
        const RR = sz * (0.05 + 0.09 * fr) * pulse * (1 - smooth(0.9, 1, p))
        const ring = clamp((p - 0.86) / 0.14)
        chainPost(it, (env2) => {
          if (RR > 0.3) env2.circle(T[0], T[1], RR, acc, null, 0, 1, true)
          if (ring > 0 && ring < 1)
            env2.circle(
              T[0],
              T[1],
              sz * (0.15 + 0.5 * E.outCubic(ring)),
              null,
              acc,
              Math.max(1, sz * 0.03 * (1 - ring)),
              1 - ring,
              false,
            )
        })
      }
      if (single) {
        // 整项飞向屏上同一个点
        const T: Pt = [rev ? env.W * 0.08 : env.W * 0.92, env.H / 2]
        const d0 = Math.hypot(T[0] - it.x, T[1] - it.y)
        const dm = env.W * 0.85
        const q = win(p, clamp(d0 / dm), 0.6)
        if (q >= 1) it.alpha = 0
        else if (q > 0) {
          const e = E.inCubic(q)
          const bend = (r(cutSeed(env), it.mi || 0, 62) - 0.5) * d0 * 0.5
          const nx = -(T[1] - it.y) / Math.max(1, d0)
          const ny = (T[0] - it.x) / Math.max(1, d0)
          const bx = it.x + (T[0] - it.x) * e + nx * bend * Math.sin(Math.PI * e)
          const by = it.y + (T[1] - it.y) * e + ny * bend * Math.sin(Math.PI * e)
          it.x = bx
          it.y = by
          it.size *= 1 - 0.85 * e
          it.sx = (it.sx || 1) * (1 + 1.3 * q * q)
          it.sy = (it.sy || 1) * (1 - 0.4 * q * q)
          it._m = undefined
          it._lay = undefined
        }
        dot(T, clamp(p * 1.2), Math.round(it.mi || 0) === 0)
        return
      }
      const b = lBox(it)
      const lay = layOf(it)
      const Tl: Pt = vert
        ? [b.cx, rev ? b.y0 - sz * 0.8 : b.y1 + sz * 0.8]
        : [rev ? b.x0 - sz * 0.8 : b.x1 + sz * 0.8, b.cy]
      let dm = 1
      for (const g of lay) dm = Math.max(dm, Math.hypot(Tl[0] - gCX(g, it), Tl[1] - gCY(g, it)))
      const alongX = !vert
      addC(it, (i, g) => {
        const gx = gCX(g, it)
        const gy = gCY(g, it)
        const vx = Tl[0] - gx
        const vy = Tl[1] - gy
        const dd = Math.hypot(vx, vy)
        const q = win(p, clamp((dd - sz * 0.8) / Math.max(1, dm - sz * 0.8)), 0.5)
        if (q <= 0) return null
        if (q >= 0.94) return HIDE
        const e = Math.min(1, E.inQuad(q / 0.94))
        const bend = rs(seed, i, 63) * dd * 0.1 * Math.sin(Math.PI * e)
        const nx = -vy / Math.max(1, dd)
        const ny = vx / Math.max(1, dd)
        const st = Math.min(1.8, 3 * q * q)
        // 沿飞行方向的那根局部轴拉长
        const along = alongX !== !!g.r90
        return {
          dx: vx * e + nx * bend,
          dy: vy * e + ny * bend,
          s: 1 - 0.8 * e,
          sx: along ? 1 + st : 1 - (0.3 * st) / 1.8,
          sy: along ? 1 - (0.3 * st) / 1.8 : 1 + st,
        }
      })
      let fr = 0
      for (const g of lay) {
        const dd = Math.hypot(Tl[0] - gCX(g, it), Tl[1] - gCY(g, it))
        if (win(p, clamp((dd - sz * 0.8) / Math.max(1, dm - sz * 0.8)), 0.5) >= 0.94) fr++
      }
      dot(toD(it, Tl[0], Tl[1]), fr / Math.max(1, lay.N), true)
    },
  },

  /* ---------------- 粒子 ---------------- */

  /** 化成砂飞走：迎风一侧先被剥成颗粒，随气流拉丝飘远 */
  sandOut: {
    tags: ['emotional', 'calm'],
    w: 1,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.44, 0.36, 0.9),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const vert = !!it.vertical
      const W = env.W
      const dir = cutBit(env, 71) ? 1 : -1
      const [wx, wy] = dirI(it, dir, 0)
      const [ux, uy] = dirI(it, 0, -1)
      const sdir = Math.atan2(wy, wx) / DEG
      const b = lBox(it)
      const single = isSingle(env, it)
      const og = orderOf(env, it)(0, 1)
      const posOf = (ox: number, oy: number): number => {
        let pos = vert ? (oy - b.y0) / Math.max(1, b.h) : (ox - b.x0) / Math.max(1, b.w)
        if (!vert && dir > 0) pos = 1 - pos
        if (single) pos = 0.8 * (dir > 0 ? 1 - og : og) + 0.2 * pos
        return clamp(pos)
      }
      const D = sz * 3 + W * 0.18
      const move = (x: number, k1: number): Pt => {
        const along = D * x * x
        const lift = sz * 0.55 * x + Math.sin(x * 5 + k1 * 6) * sz * 0.07 * x
        return [wx * along + ux * lift, wy * along + uy * lift]
      }
      // 渐变 / 描边 / 虚线 / 图案填充拿不到笔画碎片：退化到字形级
      if (it.gradient || it.fill === false || it.dash != null || it.pattern) {
        addC(it, (i, g) => {
          const x = (p - posOf(gCX(g, it), gCY(g, it)) * 0.5) / 0.5
          if (x <= 0) return null
          if (x >= 1) return HIDE
          const [dx, dy] = move(x, r(seed, i, 82))
          return {
            dx,
            dy,
            a: 1 - x,
            s: 1 - 0.4 * x,
            sx: 1 + x,
            blur: env.pass === 'main' ? sz * 0.05 * x : 0,
          }
        })
        return
      }
      it.shatter = true
      pushPiece(it, (ci, pj, _pc, ox, oy) => {
        const t0 = posOf(ox, oy) * 0.5 + r(seed, ci, pj, 81) * 0.18
        const x = (p - t0) / 0.32
        if (x <= 0) return PIECE_IDLE
        if (x >= 1) return null
        const [dx, dy] = move(x, r(seed, ci, pj, 82))
        return pt(
          dx,
          dy,
          rs(seed, ci, pj, 83) * 140 * x,
          1 - 0.55 * x,
          1 + 2.4 * x,
          sdir,
          1 - x * x,
        )
      })
    },
  },

  /** 碎纸机：从进料口往下喂，口以上是完整的字，口出来是卷曲的纸条 */
  shredOut: {
    tags: ['graphic', 'pop'],
    w: 0.8,
    minDur: 0.9,
    outDur: (dur) => clamp(dur * 0.44, 0.38, 0.9),
    apply(env, it, p) {
      const sz = it.size
      const seed = seedOf(it)
      const single = isSingle(env, it)
      const H = env.H
      const bb = dBox(it, sz * 0.06)
      const ySlot = single ? Math.max(bb.y1 + sz * 0.1, H * 0.66) : bb.y1 + sz * 0.12
      const travel = ySlot - bb.y0 + sz * 0.1
      const f = clamp((p - 0.08) / 0.72)
      const D = travel * (0.2 * f * f + 0.8 * f)
      const v = clamp((p - 0.72) / 0.28)
      const drop = H * 0.9 * v * v
      it.y += D
      it.clipY = [-1e5, ySlot]
      const n = clamp(Math.round(bb.w / (sz * 0.2)), 5, 20)
      const sw = bb.w / n
      const below = Math.max(0, bb.y1 + D - ySlot)
      const curl = clamp(below / (sz * 1.5))
      const ink = env.sc.ink || env.sc.fg
      const lw = Math.max(2, sz * 0.05)
      const barA = smooth(0, 0.1, p) * (1 - smooth(0.82, 0.98, p))
      const a0 = (it.alpha ?? 1) * (1 - smooth(0.8, 0.97, p))
      chainPost(it, (env2, it2) => {
        const ctx = env2.ctx
        if (below > 0.5 && env2.pass === 'main') {
          for (let k = 0; k < n; k++) {
            const xs0 = bb.x0 + k * sw
            const xs1 = xs0 + sw * 0.74
            const xc = (xs0 + xs1) / 2
            const ang =
              (((k - (n - 1) / 2) / Math.max(1, n)) * 0.5 + rs(seed, k, 131) * 0.12) * curl +
              Math.sin(p * 9 + k) * 0.03 * curl
            const lx0 = xs0 - it2.x - sz * 0.6
            const lx1 = xs1 - it2.x + sz * 0.6
            // 只留落在本条纸带里的那些字
            const cf = merged([
              it2.charFn || (() => null),
              (_i, g) => {
                const gx = gCX(g, it2)
                return gx + (g.w * (it2.sx || 1)) / 2 < lx0 || gx - (g.w * (it2.sx || 1)) / 2 > lx1
                  ? HIDE
                  : null
              },
            ])
            ctx.save()
            ctx.translate(xc, ySlot)
            ctx.rotate(ang)
            ctx.translate(-xc, -ySlot + drop * (0.7 + 0.6 * r(seed, k, 132)))
            ctx.beginPath()
            ctx.rect(xs0, ySlot, xs1 - xs0, H * 3)
            ctx.clip()
            drawItem(env2, copyOf(it2, { charFn: cf, alpha: a0 }))
            ctx.restore()
          }
        }
        if (barA > 0.01) {
          const w = (bb.w + sz * 0.5) * E.outCubic(smooth(0, 0.12, p))
          env2.rect(bb.cx - w / 2, ySlot - lw / 2, w, lw, ink, barA, false)
        }
      })
    },
  },

  /* ---------------- 刚体 ---------------- */

  /** 多米诺：每个字绕自己的底角倒向下一个字，逐字连锁 */
  dominoOut: {
    tags: ['pop', 'graphic'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.42, 0.36, 0.85),
    apply(env, it, p) {
      const ord0 = orderOf(env, it)
      const rev = cutBit(env, 91)
      const sgn = rev ? -1 : 1
      const sx0 = it.sx || 1
      const sy0 = it.sy || 1
      const sz = it.size
      const ord = (i: number, n: number): number => (rev ? 1 - ord0(i, n) : ord0(i, n))
      const fade = 1 - smooth(0.74, 0.98, p)
      const sink = sz * 0.9 * E.inQuad(clamp((p - 0.7) / 0.3))
      const [dnx, dny] = downI(it)
      addC(it, (i, g, n) => {
        const q = win(p, ord(i, n), 0.55)
        if (q <= 0) return null
        const tf = 0.62
        let th: number
        if (q < tf) th = 90 * E.inCubic(q / tf)
        else {
          const u = (q - tf) / (1 - tf)
          th = 90 - 10 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u)
        }
        // 自身空间里倒向一侧的那个底角
        const px = (sgn * g.w * sx0) / 2
        const py = sz * sy0 * 0.5
        const [rx, ry] = rot2(-px, -py, sgn * th * DEG)
        return {
          dx: px + rx + dnx * sink,
          dy: py + ry + dny * sink,
          rot: sgn * th,
          a: fade,
        }
      })
    },
  },

  /** 一侧的钉子弹开：整条文字绕另一只钉子摆下来、定住，然后掉下去 */
  hingeOut: {
    tags: ['pop', 'editorial'],
    w: 0.9,
    minDur: 0.9,
    outDur: (dur) => clamp(dur * 0.46, 0.42, 0.95),
    apply(env, it, p) {
      const single = isSingle(env, it)
      const q = single ? win(p, r(cutSeed(env), it.mi || 0, 101), 0.3) : p
      if (q <= 0) return
      const sz = it.size
      const b = lBox(it, sz * 0.02)
      const vert = !!it.vertical
      const left = !cutBit(env, 102)
      const H = env.H
      const acc = env.sc.accent
      const sg = left ? 1 : -1
      const ax = (left ? b.x0 : b.x1) + sg * Math.min(sz * 0.14, b.w * 0.2)
      const ay = b.y0 + Math.min(sz * 0.12, b.h * 0.2)
      const reach = Math.max(1, b.w - sz * 0.14)
      // 垂下来的角度：横排按画面高度能挂多低算，竖排固定 24°
      const hang = vert
        ? 24
        : Math.min(58, Math.max(14, Math.asin(clamp((H * 0.3) / reach, 0, 1)) / DEG))
      const t1 = 0.64
      const u = clamp(q / t1)
      const v = clamp((q - t1) / (1 - t1))
      const th = hang * (1 - Math.exp(-u * 4.5) * Math.cos(u * 12)) + 30 * v * v
      const pin0 = toD(it, ax, ay)
      const bx = left ? b.x1 - sz * 0.14 : b.x0 + sz * 0.14
      const pin1 = toD(it, bx, ay)
      rotateAbout(it, sg * th, ax, ay)
      it.y += H * 1.25 * v * v
      it.x += sg * sz * 0.4 * v
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.9, 1, q))
      const pr = Math.max(2, sz * 0.045)
      const pa = 1 - smooth(0.05, 0.25, v)
      const fl = clamp(q / 0.16)
      chainPost(it, (env2) => {
        if (pa > 0.01) env2.circle(pin0[0], pin0[1], pr, acc, null, 0, pa, false)
        if (fl < 1)
          env2.circle(
            pin1[0] + sg * sz * 0.5 * fl,
            pin1[1] - sz * 0.6 * fl + sz * 1.6 * fl * fl,
            pr,
            acc,
            null,
            0,
            1 - fl,
            false,
          )
      })
    },
  },

  /** 打ち上げ：每个字先下蹲发抖，再喷着尾焰向上冲出画面 */
  rocketOff: {
    tags: ['pop'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.44, 0.36, 0.9),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const acc = env.sc.accent
      const sub = env.sc.sub
      const sy0 = it.sy || 1
      const lay = layOf(it)
      const [dnx, dny] = downI(it)
      const bb = dBox(it, 0)
      const D = bb.y1 + sz * 1.6
      const step = env.step
      const Q = (i: number): number => win(p, r(seed, i, 111) * 0.85, 0.55)
      const lift = (u: number): number => D * Math.pow(u, 2.3)
      addC(it, (i, g) => {
        const q = Q(i)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const hh = (g.h * sy0) / 2
        const r90 = !!g.r90
        if (q < 0.3) {
          // 下蹲：压扁 + 横向鼓起来，同时原地抖
          const u = q / 0.3
          const sq = Math.sin((u * Math.PI) / 2)
          const k = 1 - 0.22 * sq
          const w = 1 + 0.12 * sq
          const sh = rs(seed, i, step, 112) * sz * 0.02 * u
          return {
            dx: dnx * (1 - k) * hh + sh,
            dy: dny * (1 - k) * hh,
            sx: r90 ? k : w,
            sy: r90 ? w : k,
          }
        }
        const u = (q - 0.3) / 0.7
        const L = lift(u)
        const st = 1 + Math.min(0.8, 3 * u * u)
        return {
          dx: -dnx * L,
          dy: -dny * L,
          sx: r90 ? st : 1 - 0.12 * (st - 1),
          sy: r90 ? 1 - 0.12 * (st - 1) : st,
        }
      })
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return
        inItem(env2, it2, () => {
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const q = Q(g.i)
            if (q < 0.3 || q >= 1) continue
            const u = (q - 0.3) / 0.7
            const L = lift(u)
            const hh = (g.h * sy0) / 2
            const gx = gCX(g, it2)
            const gy = gCY(g, it2)
            // 此刻字形的底边
            const bx = gx - dnx * L + dnx * hh
            const by = gy - dny * L + dny * hh
            const tl = Math.min(L, sz * 2.6)
            const a = 1 - u * 0.8
            env2.line(
              [
                [bx, by],
                [bx + dnx * tl, by + dny * tl],
              ],
              acc,
              Math.max(1.5, sz * 0.2 * (1 - u * 0.5)),
              0.28 * a,
              false,
            )
            env2.line(
              [
                [bx, by],
                [bx + dnx * tl * 0.75, by + dny * tl * 0.75],
              ],
              acc,
              Math.max(1, sz * 0.08),
              0.95 * a,
              false,
            )
            env2.poly(
              [
                [bx - dny * sz * 0.1, by + dnx * sz * 0.1],
                [bx + dny * sz * 0.1, by - dnx * sz * 0.1],
                [bx + dnx * sz * 0.45, by + dny * sz * 0.45],
              ],
              acc,
              a,
              false,
            )
            // 发射台的烟
            const ox = gx + dnx * hh
            const oy = gy + dny * hh
            for (let k = 0; k < 3; k++)
              env2.circle(
                ox + (k - 1) * sz * 0.25 * (0.4 + u),
                oy - sz * 0.05,
                sz * (0.08 + 0.22 * u) * (1 - Math.abs(k - 1) * 0.3),
                sub,
                null,
                0,
                0.35 * (1 - u),
                false,
              )
          }
        })
      })
    },
  },

  /** 弹着离开：逐字横着弹跳离场，落地时压扁 */
  bounceOff: {
    tags: ['pop'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.45, 0.38, 0.9),
    apply(env, it, p) {
      const dir = cutBit(env, 121) ? 1 : -1
      const sz = it.size
      const ord = orderOf(env, it)
      const sy0 = it.sy || 1
      const [rx, ry] = rightI(it)
      const [dnx, dny] = downI(it)
      addC(it, (i, g, n) => {
        const o = dir > 0 ? 1 - ord(i, n) : ord(i, n)
        const q = win(p, o, 0.42)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const [gxD] = toD(it, gCX(g, it), gCY(g, it))
        const dist = dir > 0 ? env.W - gxD + sz * 1.2 : gxD + sz * 1.2
        const along = dist * Math.pow(q, 1.25)
        const hp = hops(q)
        const h = hp.h * sz * 1.4
        const sq = 0.3 * hp.land
        const hh = (g.h * sy0) / 2
        const r90 = !!g.r90
        const k = 1 - sq
        const w = 1 + sq * 0.7
        return {
          dx: rx * dir * along - dnx * h + dnx * (1 - k) * hh,
          dy: ry * dir * along - dny * h + dny * (1 - k) * hh,
          rot: dir * 14 * Math.sin(Math.PI * Math.min(1, hp.h * 4)),
          sx: r90 ? k : w,
          sy: r90 ? w : k,
        }
      })
    },
  },

  /** 吊着气球飞走：每个字挂在自己的线上，像钟摆一样晃着升空 */
  balloonOff: {
    tags: ['emotional', 'calm', 'pop'],
    w: 0.9,
    minDur: 0.9,
    outDur: (dur) => clamp(dur * 0.48, 0.42, 1.0),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const sub = env.sc.sub
      const sy0 = it.sy || 1
      const lay = layOf(it)
      const bb = dBox(it, 0)
      const D = bb.y1 + sz * 1.8
      const Q = (i: number): number => win(p, r(seed, i, 141), 0.45)
      const sway = (i: number, q: number) => {
        const L = D * Math.pow(q, 1.7)
        const ph = r(seed, i, 142) * TAU
        const w = 7 + 3 * r(seed, i, 143)
        const amp = Math.min(1, q * 3)
        return {
          L,
          sw: Math.sin(q * w + ph) * sz * 0.22 * amp,
          rot: -Math.cos(q * w + ph) * 11 * amp,
          inf: 1 + 0.07 * Math.sin(Math.PI * Math.min(1, q * 2.5)),
        }
      }
      addC(it, (i, _g) => {
        const q = Q(i)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const s = sway(i, q)
        const [dx, dy] = dirI(it, s.sw, -s.L)
        return { dx, dy, rot: s.rot, s: s.inf }
      })
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return
        inItem(env2, it2, () => {
          const [dnx, dny] = downI(it2)
          const [rx, ry] = rightI(it2)
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const q = Q(g.i)
            if (q <= 0 || q >= 1) continue
            const s = sway(g.i, q)
            const [dx, dy] = dirI(it2, s.sw, -s.L)
            const r0 = s.rot * DEG
            const hh = ((g.h * sy0) / 2) * s.inf
            const bx = gCX(g, it2) + dx - Math.sin(r0) * hh
            const by = gCY(g, it2) + dy + Math.cos(r0) * hh
            const pts: Pt[] = []
            // 线拖着摆动的尾巴
            for (let k = 0; k <= 6; k++) {
              const u = k / 6
              const lag = Math.sin(q * 8 + r(seed, g.i, 142) * TAU - u * 1.6) * sz * 0.1 * u
              pts.push([bx + dnx * sz * 0.95 * u + rx * lag, by + dny * sz * 0.95 * u + ry * lag])
            }
            env2.line(pts, sub, Math.max(1, sz * 0.014), 0.85 * Math.min(1, q * 8), false)
          }
        })
      })
    },
  },

  /** 漏气的气球：先鼓起来挣两下，再一边缩小一边乱窜着飞走 */
  deflateOut: {
    tags: ['pop'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.42, 0.36, 0.85),
    apply(_env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      addC(it, (i) => {
        const q = win(p, r(seed, i, 151) * 0.8, 0.4)
        if (q <= 0) return null
        if (q >= 0.97) return HIDE
        if (q < 0.16) {
          // 鼓起来、憋着劲
          const u = q / 0.16
          return {
            s: 1 + 0.16 * E.outCubic(u),
            sx: 1 + 0.05 * Math.sin(u * 25),
            sy: 1 - 0.05 * Math.sin(u * 25),
            rot: rs(seed, i, 152) * 4 * u,
          }
        }
        // 沿一条不断被噪声拧弯的航迹积分出位移
        const u = (q - 0.16) / 0.81
        const th0 = r(seed, i, 153) * TAU
        let x = 0
        let y = 0
        let th = th0
        const NS = 14
        const uu = u
        for (let k = 0; k < NS; k++) {
          const t = ((k + 0.5) / NS) * uu
          th = th0 + 7 * noise1(t * 5, seed + i * 7) + 3 * t
          const v = sz * 7.5 * (0.5 + t) * (uu / NS)
          x += Math.cos(th) * v
          y += Math.sin(th) * v
        }
        const wob = Math.sin(u * 70) * 0.14 * (1 - u)
        return {
          dx: x,
          dy: y,
          rot: ((th - th0) / DEG) * 0.5,
          s: 1.16 * (1 - Math.pow(u, 1.3)),
          sx: 1 + wob,
          sy: 1 - wob,
        }
      })
    },
  },

  /** 消失在阳炎里：切成细条正反摆动，整体向上拉长变薄 */
  hazeOut: {
    tags: ['emotional', 'calm'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const t = env.ltb
      const vert = !!it.vertical
      const e = E.inQuad(p)
      const b0 = box(it)
      scaleAbout(it, 1 - 0.05 * e, 1 + 0.3 * e, b0.cx - it.x, b0.y1 - it.y)
      it.y -= sz * 0.3 * e
      it.color = mixC(colOf(it), env.sc.accent, 0.3 * smooth(0.1, 0.7, p))
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.3, 0.94, p))
      const bb = dBox(it, sz * 0.3)
      const A = sz * (0.02 + 0.26 * E.inOutSine(p))
      if (A < 0.4 || env.pass !== 'main') return
      if (!vert) {
        const n = clamp(Math.ceil(bb.h / (sz * 0.09)), 6, isSingle(env, it) ? 7 : 14)
        const bh = bb.h / n
        const out: [number, number, number][] = []
        for (let j = 0; j < n; j++) {
          const y = bb.y0 + j * bh
          const c = (y + bh / 2) / sz
          out.push([
            y,
            y + bh + 0.4,
            A * Math.sin(c * 6.5 - t * 12) * (0.6 + 0.4 * Math.sin(c * 2.3 + t * 5)),
          ])
        }
        it.bands = out
      } else {
        const n = clamp(Math.ceil(bb.w / (sz * 0.08)), 6, 16)
        const bw = bb.w / n
        const out: [number, number, number][] = []
        for (let j = 0; j < n; j++) {
          const x = bb.x0 + j * bw
          const c = (x + bw / 2) / sz
          out.push([
            x,
            x + bw + 0.4,
            A * Math.sin(c * 6.5 - t * 12) * (0.6 + 0.4 * Math.sin(c * 2.3 + t * 5)),
          ])
        }
        it.vbands = out
      }
    },
  },

  /** 玻璃碎裂：先以落点为中心放射出裂纹，再让碎块各自翻着落下 */
  glassBreak: {
    tags: ['graphic', 'pop', 'glitch'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.42, 0.36, 0.85),
    apply(env, it, p) {
      const single = isSingle(env, it)
      const q = single ? win(p, orderOf(env, it)(0, 1), 0.4) : p
      if (q <= 0) return
      const sz = it.size
      const seed = seedOf(it)
      const H = env.H
      const b = lBox(it, sz * 0.12)
      const ix = b.cx + rs(seed, 151) * b.w * 0.2
      const iy = b.cy + rs(seed, 152) * b.h * 0.12
      const K = single ? 4 : clamp(Math.round(5 + (b.w / Math.max(1, b.h)) * 0.8), 6, 10)
      const B: Pt[] = []
      const R: Pt[] = []
      for (let k = 0; k < K; k++) {
        const a = ((k + 0.35 * rs(seed, k, 153)) / K) * TAU
        const c = Math.cos(a)
        const s = Math.sin(a)
        const tx = c > 0 ? (b.x1 - ix) / c : c < 0 ? (b.x0 - ix) / c : 1e9
        const ty = s > 0 ? (b.y1 - iy) / s : s < 0 ? (b.y0 - iy) / s : 1e9
        const tt = Math.min(tx, ty)
        const f = 0.3 + 0.25 * r(seed, k, 154)
        B.push([ix + c * tt, iy + s * tt])
        R.push([ix + c * tt * f, iy + s * tt * f])
      }
      const shards: Pt[][] = []
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K
        shards.push([[ix, iy], R[k], R[k2]])
        shards.push([R[k], B[k], B[k2], R[k2]])
      }
      // 两条辐之间的那块盒子角归外侧碎块所有
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K
        const a1 = Math.atan2(B[k][1] - iy, B[k][0] - ix)
        const a2 = Math.atan2(B[k2][1] - iy, B[k2][0] - ix)
        const corners = (
          [
            [b.x1, b.y1],
            [b.x0, b.y1],
            [b.x0, b.y0],
            [b.x1, b.y0],
          ] as Pt[]
        )
          .filter(([cx, cy]) => {
            let da = Math.atan2(cy - iy, cx - ix) - a1
            let dd = a2 - a1
            da = ((da % TAU) + TAU) % TAU
            dd = ((dd % TAU) + TAU) % TAU
            return da > 0 && da < dd
          })
          .sort(
            (m, n2) =>
              ((((Math.atan2(m[1] - iy, m[0] - ix) - a1) % TAU) + TAU) % TAU) -
              ((((Math.atan2(n2[1] - iy, n2[0] - ix) - a1) % TAU) + TAU) % TAU),
          )
        if (corners.length) shards[k * 2 + 1] = [R[k], B[k], ...corners, B[k2], R[k2]]
      }
      const crack = clamp(q / 0.2)
      const v = clamp((q - 0.18) / 0.82)
      const a0 = it.alpha ?? 1
      const bg = env.sc.bg
      const lw = Math.max(1.5, sz * 0.032)
      if (v <= 0) {
        // 只有裂纹还会长
        chainPost(it, (env2, it2) => {
          if (env2.pass !== 'main') return
          inItem(env2, it2, () => {
            for (let k = 0; k < K; k++) env2.polyPartial([[ix, iy], B[k]], crack, bg, lw, 1, false)
            if (crack > 0.5)
              for (let k = 0; k < K; k++)
                env2.polyPartial([R[k], R[(k + 1) % K]], (crack - 0.5) * 2, bg, lw * 0.8, 1, false)
            env2.circle(
              ix,
              iy,
              sz * (0.06 + 0.2 * crack),
              env2.sc.accent,
              null,
              0,
              0.5 * (1 - crack),
              false,
            )
          })
        })
        return
      }
      it.alpha = 0
      chainPost(it, (env2, it2) => {
        // 碎块只在主 pass 画（碎裂时色散残影直接不要）
        if (env2.pass !== 'main') return
        shards.forEach((poly, j) => {
          let cx = 0
          let cy = 0
          for (const [x, y] of poly) {
            cx += x
            cy += y
          }
          cx /= poly.length
          cy /= poly.length
          const d = r(seed, j, 155) * 0.3 + (j & 1 ? 0 : 0.12)
          const u = clamp((v - d) / (1 - d))
          const h: Spin = { x: it2.x, y: it2.y, rot: it2.rot || 0 }
          if (u > 0) {
            rotateAbout(h, rs(seed, j, 156) * 120 * u * u, cx, cy)
            const ox = ((cx - ix) / Math.max(1, b.w)) * sz * 1.2 * u
            const oy = ((cy - iy) / Math.max(1, b.h)) * sz * 0.5 * u
            const [Ox, Oy] = rot2(ox, oy, (it2.rot || 0) * DEG)
            h.x += Ox
            h.y += Oy + H * 1.1 * u * u
          }
          let x0 = 1e9
          let x1 = -1e9
          let y0 = 1e9
          let y1 = -1e9
          for (const [x, y] of poly) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
          }
          const sx2 = it2.sx || 1
          const sy2 = it2.sy || 1
          const vt = !!it2.vertical
          // 只有落在这块碎片范围内的字才跟着走
          const cf = merged([
            it2.charFn || (() => null),
            (_i, g) => {
              const gx = gCX(g, it2)
              const gy = gCY(g, it2)
              const hw = (vt ? it2.size : g.w) * sx2 * 0.6
              const hh = (vt ? g.h : it2.size) * sy2 * 0.6
              return gx + hw < x0 || gx - hw > x1 || gy + hh < y0 || gy - hh > y1 ? HIDE : null
            },
          ])
          drawFx(
            env2,
            copyOf(it2, {
              x: h.x,
              y: h.y,
              rot: h.rot,
              charFn: cf,
              alpha: a0 * (1 - smooth(0.75, 1, u)),
              clipFn: (ctx, _e3, it3) => polyL(ctx, it3, poly),
            }),
          )
        })
        if (env2.pass === 'main' && v < 0.25)
          inItem(env2, it2, () => {
            for (let k = 0; k < K; k++) env2.line([[ix, iy], B[k]], bg, lw * (1 - v * 4), 1, false)
          })
      })
    },
  },

  /** 拉链：滑块沿每条线跑一遍，走过的地方字形被捏合到一排齿上 */
  zipOut: {
    tags: ['graphic', 'pop'],
    w: 0.8,
    apply(env, it, p) {
      const vert = !!it.vertical
      const sz = it.size
      const acc = env.sc.accent
      const rev = cutBit(env, 161)
      const sub = env.sc.sub
      const single = isSingle(env, it)
      const N = cutN(env)
      const pos = lerp(-0.12, 1.12, E.inOutSine(clamp(p / 0.8)))
      const lines = lineExt(it)
      const band = single ? 1.2 / Math.max(1, N - 1) : 0.22
      const og = orderOf(env, it)(0, 1)
      // 字形在本行内的先后 0..1
      const along = (L: LineSpan, g: LaidGlyph): number => {
        const a0 = vert ? L.y0 : L.x0
        const a1 = vert ? L.y1 : L.x1
        const v = vert ? gCY(g, it) : gCX(g, it)
        const o = (v - a0) / Math.max(1, a1 - a0)
        return rev ? 1 - o : o
      }
      const byLi: Record<number, LineSpan> = {}
      for (const L of lines) byLi[L.li] = L
      addC(it, (_i, g) => {
        const L = byLi[g.li]
        if (!L) return null
        const o = single ? (rev ? 1 - og : og) : along(L, g)
        const c = E.inOutSine(clamp((pos - o) / band + 0.15))
        if (c <= 0) return null
        if (c >= 0.99) return HIDE
        const k = 1 - c
        const acrossX = vert !== !!g.r90
        return acrossX ? { sx: k } : { sy: k }
      })
      const fa = (it.alpha ?? 1) * (1 - smooth(0.76, 0.96, p))
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main' || fa <= 0.01) return
        inItem(env2, it2, () => {
          for (const L of lines) {
            const a0 = vert ? L.y0 : L.x0
            const a1 = vert ? L.y1 : L.x1
            const mid = vert ? (L.x0 + L.x1) / 2 : (L.y0 + L.y1) / 2
            const len = a1 - a0
            let sp = single
              ? a0 + len * ((pos - (rev ? 1 - og : og)) * Math.max(1, N - 1) + 0.5)
              : a0 + len * pos
            if (rev) sp = a0 + a1 - sp
            const z0 = rev ? Math.max(sp, a0 - sz * 0.1) : a0 - sz * 0.1
            const z1 = rev ? a1 + sz * 0.1 : Math.min(sp, a1 + sz * 0.1)
            const tp = Math.max(3, sz * 0.09)
            const th = sz * 0.05
            // 已经拉上的齿
            for (let a = z0, k = 0; a < z1; a += tp, k++) {
              const o = (k & 1 ? 1 : -1) * th * 0.5
              if (vert) env2.rect(mid - th * 0.5 + o, a, th, tp * 0.6, sub, fa, false)
              else env2.rect(a, mid - th * 0.5 + o, tp * 0.6, th, sub, fa, false)
            }
            // 拉头与拉环
            if (sp > a0 - sz * 0.5 && sp < a1 + sz * 0.5) {
              const w = sz * 0.3
              const h = sz * 0.46
              if (vert) {
                env2.rrect(mid - h / 2, sp - w / 2, h, w, w * 0.3, acc, fa, false)
                env2.rrect(
                  mid + h / 2 - sz * 0.02,
                  sp - w * 0.2,
                  sz * 0.36,
                  w * 0.4,
                  w * 0.2,
                  acc,
                  fa,
                  false,
                )
              } else {
                env2.rrect(sp - w / 2, mid - h / 2, w, h, w * 0.3, acc, fa, false)
                env2.rrect(
                  sp - w * 0.2,
                  mid + h / 2 - sz * 0.02,
                  w * 0.4,
                  sz * 0.36,
                  w * 0.2,
                  acc,
                  fa,
                  false,
                )
              }
            }
          }
        })
      })
    },
  },

  /** 中央合拢：两半向中缝拍下、消失在缝里，带一次撞击闪光 */
  clapShut: {
    tags: ['graphic', 'pop'],
    w: 0.9,
    apply(env, it, p) {
      const vert = !!it.vertical
      const sz = it.size
      const acc = env.sc.accent
      const W = env.W
      const e = E.inCubic(clamp(p / 0.62))
      const hit = clamp((p - 0.6) / 0.4)
      if (isSingle(env, it)) {
        const left = it.x < W / 2
        const D = W * 0.47 * e
        it.x += left ? D : -D
        it.clipFn = (ctx) =>
          left
            ? ctx.rect(-W, -env.H, W * 1.5, env.H * 3)
            : ctx.rect(W / 2, -env.H, W * 1.5, env.H * 3)
        if (e >= 0.999) it.alpha = 0
        if (hit > 0 && hit < 1 && Math.round(it.mi || 0) === 0) {
          const h = env.H * 0.3 * (1 + 0.6 * E.outCubic(hit))
          const lw = sz * 0.12 * (1 - hit)
          chainPost(it, (env2) =>
            env2.rect(W / 2 - lw / 2, env.H / 2 - h / 2, lw, h, acc, 1 - hit, false),
          )
        }
        return
      }
      const b = lBox(it, sz * 0.04)
      const seam = vert ? b.cy : b.cx
      const half = (vert ? b.h : b.w) / 2 + sz * 0.05
      const D = half * e
      // 某一侧的字形：向中缝挤过去并各自裁掉越过缝的部分
      const side =
        (sgn: number): CharFn =>
        (_i, g) => {
          const gx = gCX(g, it)
          const gy = gCY(g, it)
          const c = vert ? gy : gx
          const hw = (vert ? g.h * (it.sy || 1) : g.w * (it.sx || 1)) / 2
          if (sgn < 0 ? c - hw >= seam : c + hw <= seam) return HIDE
          const k = 1 - 0.12 * e
          const nx = vert ? gx : gx - sgn * D
          const ny = vert ? gy - sgn * D : gy
          const gc = vert
            ? gclip(g, it, nx, ny, 1, k, null, sgn < 0 ? [-1e5, seam] : [seam, 1e5])
            : gclip(g, it, nx, ny, k, 1, sgn < 0 ? [-1e5, seam] : [seam, 1e5], null)
          return Object.assign(
            { dx: nx - gx, dy: ny - gy },
            vert ? (g.r90 ? { sx: k } : { sy: k }) : g.r90 ? { sy: k } : { sx: k },
            gc,
          )
        }
      withCopies(it, side(-1), [side(1)])
      const sa = smooth(0, 0.15, p) * (1 - smooth(0.6, 0.7, p))
      if (sa > 0.01)
        chainPost(it, (env2, it2) => {
          if (env2.pass !== 'main') return
          const lw = Math.max(1.5, sz * 0.025)
          const ext = (vert ? b.w : b.h) * 1.1 * E.outCubic(smooth(0, 0.15, p))
          const mc = vert ? b.cx : b.cy
          inItem(env2, it2, () => {
            if (vert) env2.rect(mc - ext / 2, seam - lw / 2, ext, lw, acc, sa, false)
            else env2.rect(seam - lw / 2, mc - ext / 2, lw, ext, acc, sa, false)
          })
        })
      if (hit > 0 && hit < 1) {
        const lw = sz * 0.14 * (1 - E.outCubic(hit))
        const ext = (vert ? b.w : b.h) * (1 + 0.7 * E.outCubic(hit))
        const fa = 1 - hit
        chainPost(it, (env2, it2) => {
          if (env2.pass !== 'main') return
          inItem(env2, it2, () => {
            const mc = vert ? b.cx : b.cy
            if (vert) env2.rect(mc - ext / 2, seam - lw / 2, ext, lw, acc, fa, false)
            else env2.rect(seam - lw / 2, mc - ext / 2, lw, ext, acc, fa, false)
            // 撞击火星
            for (let k = 0; k < 4; k++) {
              const a = ((k + 0.5) / 4) * TAU + 0.3
              const r0 = sz * (0.2 + 0.6 * hit)
              const r1 = r0 + sz * 0.25 * (1 - hit)
              const cx = vert ? mc : seam
              const cy = vert ? seam : mc
              env2.line(
                [
                  [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
                  [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
                ],
                acc,
                Math.max(1, sz * 0.03),
                fa,
                false,
              )
            }
          })
        })
      }
    },
  },

  /** 灭灯：供电不稳地闪几下，逐字熄灭，留下慢慢淡掉的暗管 */
  lampOff: {
    tags: ['glitch', 'emotional'],
    w: 0.8,
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      const c0 = colOf(it)
      const bg = env.sc.bg
      const dark = darkBg(env)
      const sz = it.size
      const dimC = mixC(c0, bg, 0.78)
      const hot = dark ? mixC(c0, '#ffffff', 0.5) : c0
      const N = layOf(it).N
      const T = (i: number): number => r(seed, i, 171) * 0.46
      let lit = 0
      for (let i = 0; i < N; i++) {
        const q = (p - T(i)) / 0.36
        lit += q <= 0 ? 1 : q < 0.5 ? 0.5 : 0
      }
      addC(it, (i) => {
        const q = (p - T(i)) / 0.36
        if (q <= 0) return null
        if (q >= 1) return HIDE
        // 熄灭前先两态抖动，最后一段转成暗管色并淡掉
        if (q > 0.55) return { color: dimC, a: 1 - (q - 0.55) / 0.45 }
        const off = r(seed, i, step, 172) < 0.3 + 0.7 * (q / 0.55)
        return off ? { color: dimC } : { color: hot }
      })
      if (dark && env.pass === 'main' && !it.shadow)
        it.shadow = {
          color: rgba(mixC(c0, env.sc.accent, 0.4), 0.85),
          blur: (sz * 0.22 * lit) / Math.max(1, N),
          dx: 0,
          dy: 0,
        }
    },
  },

  /** 老虎机：每个字像转轮一样越转越快，最后停在一格空白上 */
  slotOut: {
    tags: ['glitch', 'pop'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.38, 0.3, 0.7),
    apply(env, it, p) {
      const seed = seedOf(it)
      const ord = orderOf(env, it)
      const sy0 = it.sy || 1
      const acc = env.sc.accent
      const M = (i: number): number => 3 + (hash(seed, i, 182) % 4)
      const chOf = (i: number, m: number): string =>
        REEL_CHARS[hash(seed, i, m, 181) % REEL_CHARS.length]
      const state = (i: number, n: number) => {
        const q = win(p, ord(i, n), 0.35)
        if (q <= 0) return null
        const ph = (M(i) + 1) * E.inOutCubic(q)
        const m = Math.floor(ph)
        return { q, ph, m, fr: ph - m, sp: Math.min(0.6, 6 * Math.sin(Math.PI * q) * 0.12) }
      }
      // 当前格与下一格各画一遍，才像真的在滚
      const reel =
        (next: boolean): CharFn =>
        (i, g, n) => {
          const s = state(i, n)
          if (!s) return next ? HIDE : null
          const m = s.m + (next ? 1 : 0)
          if (m > M(i)) return HIDE
          const pitch = g.h * sy0 * 1.12
          const dy = next ? (1 - s.fr) * pitch : -s.fr * pitch
          const gx = gCX(g, it)
          const gy = gCY(g, it)
          const hh = g.h * sy0 * 0.55
          const ky = 1 + s.sp
          const gc = gclip(g, it, gx, gy + dy, 1, ky, null, [gy - hh, gy + hh])
          const o: CharT = Object.assign({ dy }, gc, g.r90 ? { sx: ky } : { sy: ky })
          if (m > 0) {
            o.ch = chOf(i, m)
            if (r(seed, i, m, 183) < 0.3) o.color = acc
          }
          return o
        }
      withCopies(it, reel(false), [reel(true)])
    },
  },

  /** 时钟擦除：每个字各自被一只小指针扫掉（方形 cooldown），逐字接力 */
  clockOut: {
    tags: ['graphic', 'editorial'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const acc = env.sc.accent
      const cw = !cutBit(env, 191)
      const sg = cw ? 1 : -1
      const a0 = -Math.PI / 2
      const ord = orderOf(env, it)
      const lay = layOf(it)
      const vert = !!it.vertical
      const sx0 = it.sx || 1
      const sy0 = it.sy || 1
      type Cell = { cx: number; cy: number; hw: number; hh: number; e: number }
      const cells: Cell[] = []
      for (const g of lay) {
        if (isSp(g.ch)) continue
        const q = win(p, ord(g.i, lay.N), 0.55)
        if (q >= 1) continue
        cells.push({
          cx: gCX(g, it),
          cy: gCY(g, it),
          hw: (vert ? sz * sx0 : g.w * sx0) * 0.56,
          hh: (vert ? g.h * sy0 : sz * sy0) * 0.56,
          e: E.inOutSine(q),
        })
      }
      if (!cells.length) {
        it.alpha = 0
        return
      }
      // 从格心沿角度 a 出发到格边的交点
      const P2 = (c: Cell, a: number): Pt => {
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const t = Math.min(
          Math.abs(ca) > 1e-6 ? c.hw / Math.abs(ca) : 1e9,
          Math.abs(sa) > 1e-6 ? c.hh / Math.abs(sa) : 1e9,
        )
        return [c.cx + ca * t, c.cy + sa * t]
      }
      // 保留区 = 格心 → 指针 → 按扫过顺序排好的角 → 12 点
      const region = (c: Cell): Pt[] => {
        const ah = a0 + sg * c.e * TAU
        const span = (1 - c.e) * TAU
        const pts: Pt[] = [[c.cx, c.cy], P2(c, ah)]
        const cor = (
          [
            [c.hw, -c.hh],
            [c.hw, c.hh],
            [-c.hw, c.hh],
            [-c.hw, -c.hh],
          ] as Pt[]
        )
          .map(([x, y]) => {
            const rel = ((((Math.atan2(y - 0, x - 0) - ah) * sg) % TAU) + TAU) % TAU
            return [rel, c.cx + x, c.cy + y] as [number, number, number]
          })
          .filter((k) => k[0] > 1e-6 && k[0] < span)
          .sort((m, n2) => m[0] - n2[0])
        for (const k of cor) pts.push([k[1], k[2]])
        pts.push([c.cx, c.cy - c.hh])
        return pts
      }
      it.clipFn = (ctx, _e2, it3) => {
        for (const c of cells) {
          const quad: Poly = [
            [c.cx - c.hw, c.cy - c.hh],
            [c.cx + c.hw, c.cy - c.hh],
            [c.cx + c.hw, c.cy + c.hh],
            [c.cx - c.hw, c.cy + c.hh],
          ]
          polyL(ctx, it3, c.e <= 0.001 ? quad : region(c))
        }
      }
      const fa = it.alpha ?? 1
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return
        inItem(env2, it2, () => {
          for (const c of cells) {
            if (c.e <= 0.001) continue
            const ah = a0 + sg * c.e * TAU
            const glow: Pt[] = [[c.cx, c.cy]]
            const a = fa * Math.min(1, (1 - c.e) * 6)
            for (let k = 0; k <= 5; k++)
              glow.push(P2(c, ah - sg * Math.min(c.e * TAU, 0.6) * (k / 5)))
            env2.poly(glow, acc, 0.22 * a, false)
            env2.line([[c.cx, c.cy], P2(c, ah)], acc, Math.max(1.5, sz * 0.03), a, false)
            env2.circle(c.cx, c.cy, Math.max(1.5, sz * 0.04), acc, null, 0, a, false)
          }
        })
      })
    },
  },

  /** 数码雨：字先变成滚动的半角乱码，再化作一列字符从下面倒出去 */
  matrixOut: {
    tags: ['glitch'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.42, 0.34, 0.85),
    apply(env, it, p) {
      const seed = seedOf(it)
      const step = env.step
      const sz = it.size
      const sy0 = it.sy || 1
      const acc = env.sc.accent
      const c0 = colOf(it)
      const bb = dBox(it, 0)
      const D = env.H - bb.y0 + sz * 1.2
      const head = darkBg(env) ? mixC(c0, '#ffffff', 0.4) : c0
      const Q = (i: number): number => win(p, r(seed, i, 201) * 0.9, 0.5)
      // 每两帧才换一个字符，看起来才是"落下的字符"而不是噪声
      const rch = (i: number, k: number): string =>
        RAIN_CHARS[hash(seed, i, k, Math.floor(step / 2), 202) % RAIN_CHARS.length]
      const fall = (i: number, g: LaidGlyph) => {
        const q = Q(i)
        if (q <= 0) return null
        const u = clamp((q - 0.22) / 0.78)
        return { q, u, L: D * Math.pow(u, 1.7), pitch: g.h * sy0 * 0.92 }
      }
      const headFn: CharFn = (i, g) => {
        const f = fall(i, g)
        if (!f) return null
        if (f.q >= 1) return HIDE
        const [dx, dy] = dirI(it, 0, f.L)
        if (f.q < 0.22)
          return r(seed, i, step, 203) < f.q / 0.22 + 0.2 ? { ch: rch(i, 0), color: acc } : null
        return { dx, dy, ch: rch(i, 0), color: head }
      }
      const trail =
        (k: number): CharFn =>
        (i, g) => {
          const f = fall(i, g)
          if (!f || f.q < 0.22 || f.q >= 1 || f.L < k * f.pitch * 0.6) return HIDE
          const [dx, dy] = dirI(it, 0, f.L - k * f.pitch)
          return { dx, dy, ch: rch(i, k), color: acc, a: (1 - k / 6) * (1 - 0.5 * f.u) }
        }
      withCopies(it, headFn, [trail(1), trail(2), trail(3), trail(4), trail(5)])
    },
  },

  /** 龙卷：字被卷进涡流，绕一根竖轴前后旋转着被拔走 */
  tornadoOut: {
    tags: ['pop'],
    w: 0.8,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.45, 0.38, 0.9),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const dir = cutBit(env, 211) ? 1 : -1
      const single = isSingle(env, it)
      const W = env.W
      const bb = dBox(it, 0)
      const up = bb.y1 + sz * 1.8
      const lay = layOf(it)
      let cx = bb.cx
      let R0 = 1
      if (single) {
        cx = W / 2
        R0 = W * 0.45
      } else
        for (const g of lay) R0 = Math.max(R0, Math.abs(toD(it, gCX(g, it), gCY(g, it))[0] - cx))
      R0 += sz * 0.3
      // X0 = 字形的设计 x；hx = 它在整句里的先后（用来错开上升）
      const orbit = (X0: number, i: number, q: number, hx: number) => {
        const ox = X0 - cx
        const th0 = Math.asin(clamp(ox / R0, -1, 1))
        const rv = r(seed, i, 212)
        const th = th0 + dir * Math.PI * (3.2 + rv) * q * q
        const lift = up * Math.pow(q, 2.2) * (0.8 + 0.3 * rv) + sz * 1.4 * hx * E.outCubic(q)
        const R = R0 * (1 - 0.35 * E.outCubic(q)) + lift * 0.25 + sz * 0.6 * q
        return {
          dx: R * Math.sin(th) - ox,
          dy: -lift,
          z: Math.cos(th),
          tilt: -Math.sin(th) * 14 * q,
        }
      }
      const alpha = 1 - smooth(0.8, 0.98, p)
      if (single) {
        const q = win(p, r(cutSeed(env), it.mi || 0, 213) * 0.5, 0.25)
        if (q <= 0) return
        const o = orbit(it.x, it.mi || 0, q, orderOf(env, it)(0, 1))
        it.x += o.dx
        it.y += o.dy
        it.rot = (it.rot || 0) + o.tilt
        it.size *= 0.72 + 0.28 * o.z
        it._m = undefined
        it._lay = undefined
        it.alpha = (it.alpha ?? 1) * (0.3 + (0.7 * (o.z + 1)) / 2) * alpha
        return
      }
      addC(it, (i, g) => {
        const q = win(p, r(seed, i, 214) * 0.5, 0.25)
        if (q <= 0) return null
        const [X0] = toD(it, gCX(g, it), gCY(g, it))
        const o = orbit(X0, i, q, lay.N > 1 ? i / (lay.N - 1) : 0)
        const [dx, dy] = dirI(it, o.dx, o.dy)
        return {
          dx,
          dy,
          rot: o.tilt,
          s: 0.72 + 0.28 * o.z,
          a: (0.3 + (0.7 * (o.z + 1)) / 2) * alpha,
        }
      })
    },
  },

  /** 卷起来收走：纸卷沿行前进，卷到的地方纸被搓到轴上 */
  rollUpOut: {
    tags: ['graphic', 'editorial'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.4, 0.32, 0.8),
    apply(env, it, p) {
      const sz = it.size
      const vert = !!it.vertical
      const rev = cutBit(env, 221)
      const single = isSingle(env, it)
      const c0 = colOf(it)
      const bg = env.sc.bg
      const b = lBox(it, sz * 0.08)
      const sx0 = it.sx || 1
      const sy0 = it.sy || 1
      const a0 = vert ? b.y0 : b.x0
      const a1 = vert ? b.y1 : b.x1
      const c0x = vert ? b.x0 : b.y0
      const c1x = vert ? b.x1 : b.y1
      let Xr: number
      const r0 = sz * 0.26
      const e = E.inOutSine(clamp(p / 0.86))
      if (single) {
        // 单项一字：整屏只来一根卷
        const X0 = env.W * 0.03 - it.x
        const X1 = env.W * 0.97 - it.x
        Xr = rev ? lerp(X1, X0, e) : lerp(X0, X1, e)
      } else Xr = rev ? lerp(a1 + r0, a0 - r0 * 3, e) : lerp(a0 - r0, a1 + r0 * 3, e)
      const rolled = rev
        ? Math.max(0, (single ? env.W * 0.97 - it.x : a1) - Xr)
        : Math.max(0, Xr - (single ? env.W * 0.03 - it.x : a0))
      const rad = r0 * Math.sqrt(1 + rolled / (sz * 2))
      const sg = rev ? -1 : 1
      // 纸平的起点就在卷的前缘
      const edge = Xr + sg * rad
      addC(it, (_i, g) => {
        const c = vert ? gCY(g, it) : gCX(g, it)
        const hw = (vert ? g.h * sy0 : g.w * sx0) / 2
        const d = (c - edge) * sg
        if (d + hw <= 0) return HIDE
        const near = clamp(1 - (d - hw) / (rad * 2.6))
        if (near <= 0) return null
        // 纸卷上轴时会被搓紧
        const k = 1 - 0.55 * Math.pow(near, 1.6)
        const nc = c - sg * (1 - k) * hw
        const alongLocalX = vert ? !!g.r90 : !g.r90
        const kx = alongLocalX ? k : 1
        const ky = alongLocalX ? 1 : k
        const o: CharT = Object.assign(
          { color: mixC(c0, bg, 0.45 * near), sx: kx, sy: ky },
          vert ? { dy: nc - c } : { dx: nc - c },
        )
        if ((nc - edge) * sg - k * hw < 0)
          Object.assign(
            o,
            vert
              ? gclip(g, it, gCX(g, it), nc, kx, ky, null, sg > 0 ? [edge, 1e5] : [-1e5, edge])
              : gclip(g, it, nc, gCY(g, it), kx, ky, sg > 0 ? [edge, 1e5] : [-1e5, edge], null),
          )
        return o
      })
      const fa = (it.alpha ?? 1) * (1 - smooth(0.82, 0.98, p))
      const back = mixC(c0, bg, 0.55)
      const hi = mixC(c0, bg, 0.25)
      const lo = mixC(c0, bg, 0.8)
      if (fa <= 0.01) return
      chainPost(it, (env2, it2) => {
        inItem(env2, it2, () => {
          // 最后把卷整体抬走（向自己的中线收掉）
          const lift = E.inCubic(clamp((p - 0.8) / 0.18))
          const cm = (c0x + c1x) / 2
          const ext0 = lerp(c0x - sz * 0.06, cm, lift)
          const ext1 = lerp(c1x + sz * 0.06, cm, lift)
          const x0 = Xr - rad * (1 - lift)
          const w = 2 * rad * (1 - lift)
          if (w < 0.3 || ext1 - ext0 < 0.3) return
          const strip = (s0: number, s1: number, col: string, a: number): void => {
            if (vert) env2.rect(ext0, x0 + s0 * w, ext1 - ext0, (s1 - s0) * w, col, a, false)
            else env2.rect(x0 + s0 * w, ext0, (s1 - s0) * w, ext1 - ext0, col, a, false)
          }
          strip(0, 1, back, fa)
          strip(0.18, 0.38, hi, fa)
          strip(0.72, 1, lo, fa)
        })
      })
    },
  },

  /** 排成一列走掉：整行像火车一样顺着自己跑，绕过一段弯后离开画面 */
  snakeOut: {
    tags: ['calm', 'pop'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.45, 0.38, 0.9),
    apply(env, it, p) {
      const sz = it.size
      const rev = cutBit(env, 231)
      const n = cutBit(env, 232) ? 1 : -1
      const W = env.W
      const H = env.H
      // 沿行程坐标 a2、法向偏移 o → [a, o, 旋转角]；过了 aEnd 就进 90° 弯
      const path = (a2: number, o: number, aEnd: number, R: number): [number, number, number] => {
        if (a2 <= aEnd) return [a2, o, 0]
        const s = a2 - aEnd
        const arc = (R * Math.PI) / 2
        if (s <= arc) {
          const f = s / R
          const ca = Math.cos(f)
          const sa = Math.sin(f)
          return [aEnd + R * sa - n * sa * o, n * R * (1 - ca) + ca * o, (n * f) / DEG]
        }
        return [aEnd + R - n * o, n * (R + s - arc), n * 90]
      }
      const ease = (x: number): number => 0.35 * x * x + 0.65 * Math.pow(x, 2.4)
      if (isSingle(env, it)) {
        const ux = rev ? -1 : 1
        const aEnd = rev ? -W * 0.1 : W * 0.9
        const R = Math.min(W, H) * 0.2
        const a = it.x * ux
        const o = (it.y - H / 2) * ux
        const Dt = W * 1.2 + R * 2 + H * 0.8
        const [na, no, rd] = path(a + Dt * ease(p), o, aEnd, R)
        it.x = na * ux
        it.y = H / 2 + no * ux
        it.rot = (it.rot || 0) + rd
        return
      }
      const vert = !!it.vertical
      const b = lBox(it)
      let u: Pt = vert ? [0, 1] : [1, 0]
      if (rev) u = [-u[0], -u[1]]
      const v: Pt = [-u[1], u[0]]
      const lay = layOf(it)
      let aMin = 1e9
      let aMax = -1e9
      for (const g of lay) {
        const a = gCX(g, it) * u[0] + gCY(g, it) * u[1]
        aMin = Math.min(aMin, a)
        aMax = Math.max(aMax, a)
      }
      const aEnd = aMax + sz * 0.5
      const R = sz * 1.3
      const oc = b.cx * v[0] + b.cy * v[1]
      const Dt = aEnd - aMin + R * 2 + Math.max(W, H) * 0.75
      const trav = Dt * ease(p)
      addC(it, (_i, g) => {
        const gx = gCX(g, it)
        const gy = gCY(g, it)
        const a = gx * u[0] + gy * u[1]
        const o = gx * v[0] + gy * v[1] - oc
        const [na, no, rd] = path(a + trav, o, aEnd, R)
        const X2 = u[0] * na + v[0] * (no + oc)
        const Y2 = u[1] * na + v[1] * (no + oc)
        return { dx: X2 - gx, dy: Y2 - gy, rot: rd }
      })
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.9, 1, p))
    },
  },

  /** 一片片飘落：字形逐个脱开，一边晃一边翻面落下 */
  flutterOut: {
    tags: ['emotional', 'calm'],
    w: 1,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.48, 0.42, 1.0),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const bb = dBox(it, 0)
      const D = env.H - bb.y0 + sz * 1.2
      const c0 = colOf(it)
      const back = mixC(c0, env.sc.bg, 0.45)
      addC(it, (i) => {
        const q = win(p, r(seed, i, 241), 0.5)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const ph = r(seed, i, 242) * TAU
        const w = 7 + 4 * r(seed, i, 243)
        const amp = Math.min(1, q * 4)
        const swayv = Math.sin(q * w + ph) * sz * 0.55 * amp
        const L = D * (0.25 * q + 0.75 * Math.pow(q, 1.6))
        const flip = Math.cos(q * (9 + 5 * r(seed, i, 244)) + ph * 0.5)
        const [dx, dy] = dirI(it, swayv, L)
        const shiver = q < 0.08 ? Math.sin(q * 300) * 6 * (1 - q / 0.08) : 0
        return {
          dx,
          dy,
          rot: Math.cos(q * w + ph) * 28 * amp + shiver,
          sx: lerp(1, flip, amp),
          color: flip < 0 && amp > 0.5 ? back : undefined,
        }
      })
    },
  },

  /** 滚着离开：像骰子一样过一个角翻一次，无滑动地滚出画面 */
  rollOff: {
    tags: ['pop'],
    w: 0.8,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.45, 0.38, 0.9),
    apply(env, it, p) {
      const dir = cutBit(env, 251) ? 1 : -1
      const sz = it.size
      const ord = orderOf(env, it)
      const sx0 = it.sx || 1
      const sy0 = it.sy || 1
      const [rx, ry] = rightI(it)
      const [dnx, dny] = downI(it)
      addC(it, (i, g, n) => {
        const o = dir > 0 ? 1 - ord(i, n) : ord(i, n)
        const q = win(p, o, 0.45)
        if (q <= 0) return null
        if (q >= 1) return HIDE
        const [gxD] = toD(it, gCX(g, it), gCY(g, it))
        const dist = dir > 0 ? env.W - gxD + sz * 1.3 : gxD + sz * 1.3
        const rad = Math.max(g.w * sx0, sz * sy0 * 0.8) / 2
        const along = dist * Math.pow(q, 1.7)
        const th = along / rad
        const ph = ((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
        // 每翻过一个角，中心要先抬起一点
        const rise = rad * (Math.SQRT2 * Math.cos(ph - Math.PI / 4) - 1)
        return {
          dx: rx * dir * along - dnx * rise,
          dy: ry * dir * along - dny * rise,
          rot: (dir * th) / DEG,
        }
      })
    },
  },

  /** 合扇：先弯成一把扇形的弧，再让扇骨并到一条边上、整把缩小收走 */
  fanClose: {
    tags: ['graphic', 'editorial', 'emotional'],
    w: 0.9,
    minDur: 0.8,
    outDur: (dur) => clamp(dur * 0.44, 0.36, 0.85),
    apply(env, it, p) {
      const sz = it.size
      const rev = cutBit(env, 261)
      const bend = E.inOutSine(clamp(p / 0.3))
      const close = E.inOutCubic(clamp((p - 0.24) / 0.5))
      const fin = clamp((p - 0.72) / 0.28)
      const fs = 1 - 0.75 * E.inQuad(fin)
      const alpha = 1 - smooth(0.8, 0.99, p)
      const spin = (rev ? 1 : -1) * 0.5 * E.inQuad(fin)
      // a = 沿行方向离中心的距离，w = 朝轴心的偏移（轴心在 R 之外那一侧）
      const place = (a: number, w: number, R: number, aLim: number): [number, number, number] => {
        const alT = lerp(a / R, aLim, close) + spin
        const rr = R - w
        return [
          lerp(a, Math.sin(alT) * rr, bend),
          lerp(w, R - Math.cos(alT) * rr, bend),
          (alT * bend) / DEG,
        ]
      }
      if (isSingle(env, it)) {
        const W = env.W
        const H = env.H
        const R = W * 0.55
        const aLim = ((rev ? 1 : -1) * W * 0.45) / R
        const [na, nw, rd] = place(it.x - W / 2, it.y - H / 2, R, aLim)
        const N = cutN(env)
        const lead = Math.round(it.mi || 0) === (rev ? N - 1 : 0)
        it.x = W / 2 + na
        it.y = H / 2 + nw
        it.rot = (it.rot || 0) + rd
        it.size *= fs
        it._m = undefined
        it._lay = undefined
        it.alpha = (it.alpha ?? 1) * alpha * (lead ? 1 : 1 - smooth(0.55, 0.95, close))
        return
      }
      const vert = !!it.vertical
      const b = lBox(it)
      const lay = layOf(it)
      // 轴心在 +v 一侧：横排在字下面，竖排在字左边
      const u: Pt = vert ? [0, 1] : [1, 0]
      const v: Pt = [-u[1], u[0]]
      const ac = b.cx * u[0] + b.cy * u[1]
      const oc = b.cx * v[0] + b.cy * v[1]
      let aMin = 1e9
      let aMax = -1e9
      for (const g of lay) {
        const a = gCX(g, it) * u[0] + gCY(g, it) * u[1] - ac
        aMin = Math.min(aMin, a)
        aMax = Math.max(aMax, a)
      }
      const half = Math.max(sz, (aMax - aMin) / 2)
      const R = Math.max(sz * 2, half * 1.15)
      const aLim = (rev ? aMax : aMin) / R
      addC(it, (_i, g) => {
        const gx = gCX(g, it)
        const gy = gCY(g, it)
        const a = gx * u[0] + gy * u[1] - ac
        const [na, nw, rd] = place(a, gx * v[0] + gy * v[1] - oc, R, aLim)
        const lead = Math.abs(a / R - aLim) < 1e-3
        return {
          dx: u[0] * (na + ac) + v[0] * (nw + oc) - gx,
          dy: u[1] * (na + ac) + v[1] * (nw + oc) - gy,
          rot: rd,
          s: fs,
          a: alpha * (lead ? 1 : 1 - smooth(0.55, 0.95, close)),
        }
      })
    },
  },

  /** 色彩分离：文字散成残影 / 强调色三条通道，各自抖动、错开、淡掉 */
  rgbSplitOut: {
    tags: ['glitch', 'pop'],
    w: 0.9,
    apply(env, it, p) {
      const sc = env.sc
      const sz = it.size
      const seed = seedOf(it)
      const step = env.step
      const dark = darkBg(env)
      const cols = [sc.ghostA || sc.accent, sc.ghostB || sc.fg, sc.accent]
      const e = E.inCubic(p)
      const sp = sz * (0.05 + 1.5 * e)
      const dirs: Pt[] = [
        [-1, -0.3],
        [1, 0.25],
        [0.15, 0.9],
      ]
      const a0 = it.alpha ?? 1
      const ca = a0 * smooth(0, 0.1, p) * (1 - smooth(0.55, 0.96, p))
      it.alpha = a0 * (1 - smooth(0.05, 0.35, p))
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main' || ca <= 0.01) return
        for (let k = 0; k < 3; k++) {
          const jx = rs(seed, step, k, 271) * sz * 0.06 * (0.3 + e)
          const jy = rs(seed, step, k, 272) * sz * 0.015
          const [ox, oy] = [dirs[k][0] * sp + jx, dirs[k][1] * sp * 0.5 + jy]
          drawItem(
            env2,
            copyOf(it2, {
              x: it2.x + ox,
              y: it2.y + oy,
              size: it2.size * (1 + 0.08 * k * e),
              _m: undefined,
              _lay: undefined,
              color: cols[k],
              gradient: undefined,
              pattern: undefined,
              shadow: undefined,
              extrude: undefined,
              alpha: ca * (k === 2 ? 0.8 : 0.9),
              blend: dark ? 'screen' : 'multiply',
              fill: true,
            }),
          )
        }
      })
    },
  },

  /** 冲击波：先向内一缩，随即环炸开，环过之处字形被吹走 */
  shockOut: {
    tags: ['pop', 'graphic'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const seed = seedOf(it)
      const acc = env.sc.accent
      const single = isSingle(env, it)
      const pre = Math.sin(Math.PI * clamp(p / 0.16)) * (p < 0.16 ? 1 : 0)
      let ringR: number
      let C: Pt
      // 环过了多远 → [径向位移, 缩放, 透明, 旋转]
      const push = (dd: number, i: number): [number, number, number, number] => {
        const passed = ringR - dd
        if (passed <= 0) return [-pre * sz * 0.08, 1 - 0.05 * pre, 1, 0]
        const k = 1 - Math.exp(-passed / (sz * 0.7))
        return [
          sz * 1.6 * k,
          1 + 0.2 * Math.exp(-passed / (sz * 0.25)) - 0.45 * smooth(0, sz * 2, passed),
          1 - smooth(sz * 0.15, sz * 1.5, passed),
          rs(seed, i, 281) * 50 * k,
        ]
      }
      if (single) {
        C = [env.W / 2, env.H / 2]
        const Rmax = Math.hypot(env.W, env.H) * 0.55
        ringR = Rmax * E.outCubic(clamp((p - 0.12) / 0.88))
        const dx = it.x - C[0]
        const dy = it.y - C[1]
        const dd = Math.hypot(dx, dy) || 1
        const [m, s, a, rt] = push(dd, it.mi || 0)
        it.x += (dx / dd) * m
        it.y += (dy / dd) * m
        it.size *= Math.max(0.05, s)
        it._m = undefined
        it._lay = undefined
        it.rot = (it.rot || 0) + rt
        it.alpha = (it.alpha ?? 1) * a
        if (Math.round(it.mi || 0) !== 0) return
      } else {
        const b = lBox(it)
        C = toD(it, b.cx, b.cy)
        const Rmax = Math.hypot(b.w, b.h) / 2 + sz * 1.8
        ringR = Rmax * E.outCubic(clamp((p - 0.12) / 0.88))
        addC(it, (i, g) => {
          const dx = gCX(g, it) - b.cx
          const dy = gCY(g, it) - b.cy
          const dd = Math.hypot(dx, dy) || 1
          const [m, s, a, rt] = push(dd, i)
          return { dx: (dx / dd) * m, dy: (dy / dd) * m, s: Math.max(0.05, s), a, rot: rt }
        })
      }
      if (ringR <= 0.5 || !primary(it)) return
      const fa = 1 - smooth(0.3, 1, p)
      chainPost(it, (env2) => {
        env2.circle(C[0], C[1], ringR, null, acc, Math.max(1.5, sz * 0.09 * fa), fa, false)
        env2.circle(
          C[0],
          C[1],
          ringR * 0.82,
          null,
          acc,
          Math.max(1, sz * 0.025 * fa),
          fa * 0.6,
          false,
        )
      })
    },
  },

  /** 淹没：一条波浪线升上来，水面以下的字被折射、染色、慢慢沉下去 */
  floodOut: {
    tags: ['emotional', 'calm'],
    w: 0.9,
    outDur: (dur) => clamp(dur * 0.4, 0.32, 0.8),
    apply(env, it, p) {
      const sz = it.size
      const t = env.ltb
      const acc = env.sc.accent
      const c0 = colOf(it)
      const single = isSingle(env, it)
      const H = env.H
      const bb = dBox(it, sz * 0.15)
      const U = single ? H * 0.12 : sz
      const A = U * 0.07
      const e = E.inOutSine(clamp(p / 0.9))
      const Y = single ? lerp(H * 0.74, H * 0.24, e) : lerp(bb.y1 + A * 2, bb.y0 - A * 3, e)
      const K = clamp(Math.ceil(bb.w / (U * 0.12)), 8, 80)
      const x0 = bb.x0 - sz * 0.2
      const x1 = bb.x1 + sz * 0.2
      const surf: Pt[] = []
      for (let k = 0; k <= K; k++) {
        const x = lerp(x0, x1, k / K)
        surf.push([
          x,
          Y + A * Math.sin((x / U) * 4.2 + t * 5) + A * 0.5 * Math.sin((x / U) * 9.5 - t * 7.3),
        ])
      }
      if (Y < bb.y0 - A * 2) it.alpha = 0
      const above = (ctx: CanvasRenderingContext2D): void => {
        surf.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.lineTo(x1, -H * 2)
        ctx.lineTo(x0, -H * 2)
        ctx.closePath()
      }
      const below = (ctx: CanvasRenderingContext2D): void => {
        surf.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.lineTo(x1, H * 3)
        ctx.lineTo(x0, H * 3)
        ctx.closePath()
      }
      it.clipFn = above
      const a0 = it.alpha ?? 1
      const uw = (1 - smooth(0.3, 0.95, p)) * 0.5
      const fa = 1 - smooth(0.82, 0.98, p)
      chainPost(it, (env2, it2) => {
        // 水面以下：折射、染色、淡出
        if (uw > 0.01 && env2.pass === 'main') {
          const n = 6
          const h = bb.h + sz
          const out: [number, number, number][] = []
          for (let j = 0; j < n; j++) {
            const y = bb.y0 - sz * 0.5 + (j * h) / n
            out.push([y, y + h / n + 0.4, Math.sin((y / sz) * 7 + t * 6) * sz * 0.04])
          }
          drawFx(
            env2,
            copyOf(it2, {
              y: it2.y + sz * 0.05,
              alpha: a0 * uw,
              color: mixC(c0, acc, 0.55),
              gradient: undefined,
              pattern: undefined,
              shadow: undefined,
              clipFn: below,
              bands: out,
            }),
          )
        }
        if (env2.pass !== 'main' || fa <= 0.01) return
        env2.line(surf, acc, Math.max(4, U * 0.1), 0.15 * fa, false)
        env2.line(surf, acc, Math.max(1.5, U * 0.028), fa, false)
        // 冒到水面的气泡
        for (let j = 0; j < 7; j++) {
          const x = lerp(x0, x1, r(seedOf(it2), j, 291))
          const ph = (p * 2.2 + r(seedOf(it2), j, 292)) % 1
          const y = Y + A + (1 - ph) * sz * 0.9
          if (y > bb.y1 + sz * 0.3) continue
          env2.circle(
            x + Math.sin(ph * 9 + j) * sz * 0.03,
            y,
            Math.max(1, sz * 0.03 * (0.5 + ph)),
            null,
            acc,
            Math.max(1, sz * 0.01),
            0.7 * fa * (1 - ph * 0.5),
            false,
          )
        }
      })
    },
  },

  /** 一刀两断：线上闪过一道刀光，顿一下，上半截沿着切口滑走 */
  slashOut: {
    tags: ['graphic', 'emotional', 'pop'],
    w: 1,
    outDur: (dur) => clamp(dur * 0.4, 0.32, 0.8),
    apply(env, it, p) {
      const sz = it.size
      const vert = !!it.vertical
      const acc = env.sc.accent
      const b = lBox(it, sz * 0.2)
      const tilt =
        (cutBit(env, 301) ? 1 : -1) * (vert ? 16 + 8 * cutR(env, 302) : 7 + 5 * cutR(env, 302))
      const th = ((vert ? 90 : 0) + tilt) * DEG
      const d: Pt = [Math.cos(th), Math.sin(th)]
      const nrm: Pt = [-d[1], d[0]]
      const c: Pt = [b.cx, b.cy]
      const L = Math.hypot(b.w, b.h) + sz * 4
      // 切口某一侧的半平面（四边形）
      const halfL = (sign: number): Pt[] => {
        const o: Pt = [c[0] + nrm[0] * sign * L, c[1] + nrm[1] * sign * L]
        return [
          [c[0] - d[0] * L, c[1] - d[1] * L],
          [c[0] + d[0] * L, c[1] + d[1] * L],
          [o[0] + d[0] * L, o[1] + d[1] * L],
          [o[0] - d[0] * L, o[1] - d[1] * L],
        ]
      }
      // +n = 横排时切口下方那一侧
      const lower = halfL(1)
      const upper = halfL(-1)
      const down: Pt = d[1] > 0 ? d : [-d[0], -d[1]]
      const fl = clamp(p / 0.12)
      const gap = smooth(0.12, 0.3, p)
      const v = clamp((p - 0.3) / 0.7)
      const slide = sz * 0.06 * gap + sz * 2.2 * E.inQuad(v)
      const a0 = it.alpha ?? 1
      const [ux, uy] = rot2(
        down[0] * slide - nrm[0] * sz * 0.05 * gap,
        down[1] * slide - nrm[1] * sz * 0.05 * gap,
        (it.rot || 0) * DEG,
      )
      const [lx, ly] = rot2(
        -down[0] * sz * 0.35 * E.inQuad(v) + nrm[0] * sz * 0.03 * gap,
        -down[1] * sz * 0.35 * E.inQuad(v) + nrm[1] * (sz * 0.03 * gap + sz * 0.5 * E.inQuad(v)),
        (it.rot || 0) * DEG,
      )
      const X0 = it.x
      const Y0 = it.y
      it.x = X0 + lx
      it.y = Y0 + ly
      it.alpha = a0 * (1 - smooth(0.5, 0.95, p))
      it.clipFn = (ctx, _e2, it3) => polyL(ctx, it3, lower)
      const ua = a0 * (1 - smooth(0.62, 0.98, p))
      chainPost(it, (env2, it2) => {
        drawFx(
          env2,
          copyOf(it2, {
            x: X0 + ux,
            y: Y0 + uy,
            alpha: ua,
            clipFn: (ctx, _e3, it3) => polyL(ctx, it3, upper),
          }),
        )
        if (env2.pass !== 'main') return
        const fa = 1 - smooth(0.12, 0.34, p)
        if (fa <= 0.01) return
        const ext = (vert ? b.h : b.w) / 2 + sz * 0.9
        const P0: Pt = [c[0] - d[0] * ext, c[1] - d[1] * ext]
        const P1: Pt = [c[0] + d[0] * ext, c[1] + d[1] * ext]
        const st = cutBit(env2, 303)
        const AA = st ? P1 : P0
        const BB = st ? P0 : P1
        const ee = E.outExpo(fl)
        const tail = smooth(0.08, 0.3, p)
        const S: Pt = [lerp(AA[0], BB[0], tail), lerp(AA[1], BB[1], tail)]
        const Tt: Pt = [lerp(AA[0], BB[0], ee), lerp(AA[1], BB[1], ee)]
        inItem(env2, { x: X0, y: Y0, rot: it2.rot }, () => {
          env2.line([S, Tt], acc, Math.max(2, sz * 0.09 * fa), 0.35 * fa, false)
          env2.line([S, Tt], acc, Math.max(1.5, sz * 0.03 * fa), fa, false)
        })
      })
    },
  },

  /** 马赛克：把字打成一格格越来越大的色块（离屏低分辨率副本放大、不做平滑） */
  mosaicOut: {
    tags: ['glitch', 'graphic'],
    w: 0.9,
    apply(env, it, p) {
      const sz = it.size
      const blk = sz * (0.01 + 0.34 * Math.pow(p, 1.5))
      if (blk * (env.scale || 1) < 1.6) return
      const a0 = it.alpha ?? 1
      const fade = 1 - smooth(0.55, 0.97, p)
      const bb = dBox(it, sz * 0.15)
      it.alpha = 0
      chainPost(it, (env2, it2) => {
        // 一帧只过一次离屏；色散残影在这里直接舍掉
        if (env2.pass !== 'main' || typeof document === 'undefined') return
        let b = blk
        let ow = Math.ceil(bb.w / b)
        let oh = Math.ceil(bb.h / b)
        if (ow > 360 || oh > 360) {
          b *= Math.max(ow, oh) / 360
          ow = Math.ceil(bb.w / b)
          oh = Math.ceil(bb.h / b)
        }
        const cv = MOSAIC || (MOSAIC = makeCanvas(64, 64))
        if (cv.width < ow + 2 || cv.height < oh + 2) {
          cv.width = Math.max(cv.width, ow + 2, 64)
          cv.height = Math.max(cv.height, oh + 2, 64)
        }
        const c2 = ctxOf(cv)
        c2.setTransform(1, 0, 0, 1, 0, 0)
        c2.globalAlpha = 1
        c2.globalCompositeOperation = 'source-over'
        c2.filter = 'none'
        c2.clearRect(0, 0, ow + 2, oh + 2)
        c2.setTransform(1 / b, 0, 0, 1 / b, -bb.x0 / b, -bb.y0 / b)
        drawItem(
          { ...env2, ctx: c2, scale: 1 / b, allowFilter: false },
          copyOf(it2, { alpha: a0 * fade, blur: 0, shadow: undefined, blend: undefined }),
        )
        const ctx = env2.ctx
        ctx.save()
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(cv, 0, 0, ow, oh, bb.x0, bb.y0, ow * b, oh * b)
        ctx.restore()
      })
    },
  },

  /** 乱涂掉：粗马克笔在每行里来回涂满，然后字和涂鸦一起淡掉 */
  scribbleOut: {
    tags: ['editorial', 'emotional', 'pop'],
    w: 0.8,
    outDur: (dur) => clamp(dur * 0.4, 0.32, 0.8),
    apply(env, it, p) {
      const sz = it.size
      const seed = seedOf(it)
      const vert = !!it.vertical
      const acc = env.sc.accent
      const lines = lineExt(it)
      if (!lines.length) return
      const paths: Pt[][] = lines.map((L, li) => {
        const a0 = (vert ? L.y0 : L.x0) - sz * 0.15
        const a1 = (vert ? L.y1 : L.x1) + sz * 0.15
        const mid = vert ? (L.x0 + L.x1) / 2 : (L.y0 + L.y1) / 2
        const half = (vert ? L.x1 - L.x0 : L.y1 - L.y0) / 2
        const pts: Pt[] = []
        const P = (a: number, o: number): Pt => (vert ? [mid + o, a] : [a, mid + o])
        let a = a0
        let k = 0
        // 去程：长短不一的笔画，手会上下漂
        while (a < a1 && k < 200) {
          const drift = Math.sin((a / sz) * 1.3 + li) * half * 0.18
          pts.push(P(a, drift + (k & 1 ? 1 : -1) * half * (0.8 + 0.45 * r(seed, li, k, 312))))
          a += sz * (0.14 + 0.2 * r(seed, li, k, 311))
          k++
        }
        a = a1
        // 回程：更平更快，把缝填上
        while (a > a0 && k < 400) {
          const drift = Math.sin((a / sz) * 2.1 + li * 3) * half * 0.25
          pts.push(P(a, drift + (k & 1 ? 1 : -1) * half * (0.45 + 0.4 * r(seed, li, k, 314))))
          a -= sz * (0.2 + 0.25 * r(seed, li, k, 313))
          k++
        }
        return pts
      })
      const dr = E.inOutSine(clamp(p / 0.58))
      const lw = sz * 0.15 * (1 - 0.7 * smooth(0.62, 0.95, p))
      const sa = 1 - smooth(0.66, 0.97, p)
      it.alpha = (it.alpha ?? 1) * (1 - smooth(0.45, 0.75, p))
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main' || sa <= 0.01) return
        inItem(env2, it2, (ctx) => {
          ctx.save()
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.strokeStyle = acc
          ctx.lineWidth = Math.max(1, lw)
          ctx.globalAlpha = sa
          for (const pts of paths) {
            let tot = 0
            const seg: number[] = []
            for (let k = 1; k < pts.length; k++) {
              const s2 = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
              seg.push(s2)
              tot += s2
            }
            let rem = tot * dr
            ctx.beginPath()
            ctx.moveTo(pts[0][0], pts[0][1])
            for (let k = 1; k < pts.length && rem > 0; k++) {
              const s2 = seg[k - 1]
              if (rem >= s2) ctx.lineTo(pts[k][0], pts[k][1])
              else {
                const f = rem / s2
                ctx.lineTo(lerp(pts[k - 1][0], pts[k][0], f), lerp(pts[k - 1][1], pts[k][1], f))
              }
              rem -= s2
            }
            ctx.stroke()
          }
          ctx.restore()
        })
      })
    },
  },

  /** 一口气吹灭：一口气沿线走过，字先倾、再闪、然后灭掉，各留一缕烟 */
  candleOut: {
    tags: ['emotional', 'calm'],
    w: 0.9,
    outDur: (dur) => clamp(dur * 0.45, 0.38, 0.9),
    apply(env, it, p) {
      const seed = seedOf(it)
      const sz = it.size
      const step = env.step
      const ord0 = orderOf(env, it)
      const dir = cutBit(env, 321) ? 1 : -1
      const ord = (i: number, n: number): number => (dir > 0 ? ord0(i, n) : 1 - ord0(i, n))
      const warm = mixC(colOf(it), env.sc.accent, 0.5)
      const sub = env.sc.sub
      const lay = layOf(it)
      const sy0 = it.sy || 1
      const U = (i: number, n: number): number => (p - ord(i, n) * 0.42) / 0.5
      addC(it, (i, _g, n) => {
        const u = U(i, n)
        if (u <= 0) return null
        if (u >= 0.45) return HIDE
        const lean = Math.sin(Math.PI * Math.min(1, u / 0.45))
        const fl = r(seed, i, step, 322)
        return {
          skew: -dir * 22 * lean,
          dx: dir * sz * 0.06 * lean,
          color: warm,
          a: u > 0.3 ? (1 - (u - 0.3) / 0.15) * (fl < 0.5 ? 1 : 0.6) : 0.65 + 0.35 * fl,
          s: 1 + 0.04 * lean,
        }
      })
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return
        inItem(env2, it2, () => {
          const [ux, uy] = dirI(it2, 0, -1)
          const [rx, ry] = dirI(it2, 1, 0)
          for (const g of lay) {
            if (isSp(g.ch)) continue
            const u = U(g.i, lay.N)
            if (u < 0.36 || u >= 1) continue
            const age = (u - 0.36) / 0.64
            const tx = gCX(g, it2) + ux * g.h * sy0 * 0.4
            const ty = gCY(g, it2) + uy * g.h * sy0 * 0.4
            const pts: Pt[] = []
            for (let k = 0; k <= 9; k++) {
              const f = k / 9
              const hh = sz * (0.25 + 1.3 * age) * f
              const w = Math.sin(f * 5 + age * 7 + g.i) * sz * 0.09 * f + dir * sz * 0.4 * age * f
              pts.push([tx + ux * hh + rx * w, ty + uy * hh + ry * w])
            }
            env2.line(pts, sub, Math.max(1.2, sz * 0.03 * (1 - age * 0.5)), 0.9 * (1 - age), false)
          }
        })
      })
    },
  },
}

const H: Record<string, AnimDef> = {
  /** 烛火般的微光：暖色光晕一边呼吸一边不规则地扑闪，字形轻轻向上舔一点 */
  glowFlicker: {
    tags: ['calm', 'emotional'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const sz = it.size
      const kk = Math.min(1, k)
      const sy0 = it.sy || 1
      const f = 0.6 + 0.28 * noise1(t * 3.3, seed) + 0.12 * noise1(t * 11, seed + 5)
      const lvl = clamp(f * (1 - 0.45 * smooth(0.35, 0.8, noise1(t * 1.1, seed + 9))))
      const glow = darkBg(env) ? mixC(env.sc.accent, '#ffffff', 0.3) : env.sc.accent
      // 已有投影 / 立体 / 逐字模糊时不再叠加（阴影上叠字形滤镜代价极高）
      if (env.pass === 'main' && !it.shadow && !it.extrude && !glyphBlur(it))
        it.shadow = {
          color: rgba(glow, darkBg(env) ? 0.9 : 0.6),
          blur: sz * (0.06 + 0.3 * lvl) * kk,
          dx: 0,
          dy: -sz * 0.02 * lvl * kk,
        }
      it.alpha = (it.alpha ?? 1) * (1 - 0.16 * (1 - lvl) * kk)
      it.color = mixC(colOf(it), env.sc.accent, 0.1 * lvl * kk)
      addC(it, (i, g) => {
        const st = 1 + 0.025 * k * (0.5 + 0.5 * noise1(t * 6 + i * 2.3, seed + i))
        return g.r90 ? { sx: st } : { sy: st, dy: -(st - 1) * sz * sy0 * 0.5 }
      })
    },
  },

  /** 一阵风：每隔几秒一股风沿线扫过，字先倾被推、再弹簧似的回到原位 */
  windGust: {
    tags: ['pop', 'emotional'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const cs = cutSeed(env)
      const sz = it.size
      const ord = orderOf(env, it)
      let cyc: number
      let since: number
      if (env.beat && env.beat.len) {
        const L = env.beat.len
        const bi = env.beat.index - 1
        cyc = Math.floor(bi / 4)
        since = (((bi % 4) + 4) % 4) * L + env.beat.since
      } else {
        // 无节拍：第一阵风约在进入后半秒
        const per = 2.2
        const T = env.ltb - 0.5 - (cs % 5) * 0.06
        cyc = Math.floor(T / per)
        since = T - cyc * per
      }
      const dir = r(cs, cyc, 601) < 0.5 ? 1 : -1
      const str = 0.7 + 0.3 * r(cs, cyc, 602)
      addC(it, (i, _g, n) => {
        const tau = since - (dir > 0 ? ord(i, n) : 1 - ord(i, n)) * 0.4
        if (tau <= 0 || tau > 1.7) return null
        const rr =
          tau < 0.25
            ? smooth(0, 0.25, tau)
            : tau < 0.6
              ? 1 + 0.08 * Math.sin((tau - 0.25) * 30)
              : Math.cos((tau - 0.6) * 9) * Math.exp(-(tau - 0.6) * 4)
        return {
          dx: dir * sz * 0.12 * rr * k * str,
          skew: -dir * 18 * rr * k * str,
          rot: dir * 3 * rr * k * str,
        }
      })
    },
  },

  /** 吊着晃：每个字挂在自己的上边上，各自按自己的节拍摆 */
  dangle: {
    tags: ['calm', 'emotional'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const sz = it.size
      const sy0 = it.sy || 1
      const vert = !!it.vertical
      addC(it, (i, g) => {
        const w = TAU * (0.5 + 0.28 * r(seed, i, 611))
        const ph = r(seed, i, 612) * TAU
        const th = (6.5 * Math.sin(w * t + ph) + 1.6 * Math.sin(w * 2.7 * t + ph * 2)) * k * DEG
        // 支点在字形自己的上边
        const hh = ((vert ? g.h : sz) * sy0) / 2
        return { dx: -hh * Math.sin(th), dy: hh * (Math.cos(th) - 1), rot: th / DEG }
      })
    },
  },

  /** 用响度撑长：字形像电平表的柱子一样从基线向上拉长 */
  eqBounce: {
    tags: ['pop', 'graphic'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const sz = it.size
      const sy0 = it.sy || 1
      const acc = env.sc.accent
      const c0 = colOf(it)
      const vert = !!it.vertical
      const base =
        env.energy != null
          ? clamp(env.energy * 1.2)
          : env.beat
            ? 0.25 + 0.75 * Math.exp(-env.beat.since * 7)
            : 0.45 + 0.4 * noise1(t * 2.6, seed)
      const mi = it.mi || 0
      addC(it, (i, g) => {
        const band = clamp(
          base * (0.3 + 0.7 * (0.5 + 0.5 * noise1(t * 6.5 + (i + mi) * 1.9, seed + 3))) * 1.15,
        )
        const st = 1 + 0.32 * band * k
        const col =
          band > 0.72 ? mixC(c0, acc, ((band - 0.72) / 0.28) * 0.7 * Math.min(1, k)) : undefined
        if (vert) return g.r90 ? { sy: st, color: col } : { sx: st, color: col }
        return { sy: st, dy: -(st - 1) * sz * sy0 * 0.5, color: col }
      })
    },
  },

  /** 踩拍反色：每拍挑一个字反相一次——强调色色块 + 掏空的字 */
  flashBox: {
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.4,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.35) return
      const len = beatLen(env, 0.62)
      const since = beatSince(env, 0.62)
      const idx = beatIdx(env, 0.62)
      const u = since / (len * 0.6)
      if (u >= 1) return
      const N = cutN(env)
      const lay = layOf(it)
      const vis = lay.filter((g) => !isSp(g.ch))
      if (!vis.length) return
      const sel = hash(cutSeed(env), idx, 621) % N
      let g: LaidGlyph
      if (isSingle(env, it)) {
        if (Math.round(it.mi || 0) !== sel) return
        g = vis[0]
      } else {
        g = vis[sel % vis.length]
      }
      const pop = E.outBack(clamp(u / 0.18), 2.2)
      const sz = it.size
      const sx0 = it.sx || 1
      const sy0 = it.sy || 1
      const acc = env.sc.accent
      const vert = !!it.vertical
      const bg = fitContrast(env.sc.bg, acc, 2.5)
      addC(it, (i) => (i === g.i ? { color: bg, s: 1 + 0.05 * (1 - u) } : null))
      chainPre(it, (env2, it2) => {
        if (env2.pass !== 'main') return
        inItem(env2, it2, () => {
          const w = (vert ? sz * sx0 : g.w * sx0) * 1.06 * pop
          const h = (vert ? g.h * sy0 : sz * sy0) * 1.06 * pop
          env2.rect(gCX(g, it2) - w / 2, gCY(g, it2) - h / 2, w, h, acc, 1, false)
        })
      })
    },
  },

  /** 光泽：时不时一道斜光带滑过字面 */
  glintSweep: {
    tags: ['graphic', 'calm'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.05 || env.pass !== 'main') return
      const per = 2.4
      // 第一次扫光约在进入后半秒
      const T = env.ltb - 0.5 - (it.mi || 0) * 0.04
      const u = (((T % per) + per) % per) / 0.75
      if (u >= 1) return
      const sz = it.size
      const bb = dBox(it, sz * 0.2)
      const c0 = colOf(it)
      const gc = lum(c0) > 0.72 ? env.sc.accent : mixC(c0, '#ffffff', 0.85)
      const bw = sz * 0.34
      const sl = bb.h * 0.45
      const x = lerp(bb.x0 - bw - sl, bb.x1 + bw + sl, E.inOutSine(u))
      const a = Math.min(1, k) * 0.9
      chainPost(it, (env2, it2) => {
        const ctx = env2.ctx
        ctx.save()
        ctx.beginPath()
        const band = (x0: number, w: number): void => {
          ctx.moveTo(x0 + sl, bb.y0)
          ctx.lineTo(x0 + sl + w, bb.y0)
          ctx.lineTo(x0 - sl + w, bb.y1)
          ctx.lineTo(x0 - sl, bb.y1)
          ctx.closePath()
        }
        band(x - bw / 2, bw)
        band(x + bw * 0.75, bw * 0.28)
        ctx.clip()
        drawItem(
          env2,
          copyOf(it2, {
            color: gc,
            gradient: undefined,
            pattern: undefined,
            shadow: undefined,
            extrude: undefined,
            alpha: (it2.alpha ?? 1) * a,
          }),
        )
        ctx.restore()
      })
    },
  },

  /** 偶尔翻面：不时有个字像卡片一样翻过去，背面是一个陌生的汉字，再翻回来 */
  flipSwap: {
    tags: ['glitch', 'pop'],
    w: 0.4,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.5) return
      const cs = cutSeed(env)
      const per = 1.6
      const T = env.ltb - 0.45
      const cyc = Math.floor(T / per)
      const u = (T - cyc * per) / 0.95
      if (u >= 1) return
      const N = cutN(env)
      const lay = layOf(it)
      const vis = lay.filter((g) => !isSp(g.ch))
      if (!vis.length) return
      const sel = hash(cs, cyc, 631) % N
      let gi: number
      if (isSingle(env, it)) {
        if (Math.round(it.mi || 0) !== sel) return
        gi = vis[0].i
      } else {
        gi = vis[sel % vis.length].i
      }
      const ch = FLIP_CHARS[hash(cs, cyc, 632) % FLIP_CHARS.length]
      const acc = env.sc.accent
      let sx: number
      let alt: boolean
      if (u < 0.18) {
        sx = Math.cos((u / 0.18) * (Math.PI / 2))
        alt = false
      } else if (u < 0.36) {
        sx = Math.sin(((u - 0.18) / 0.18) * (Math.PI / 2))
        alt = true
      } else if (u < 0.64) {
        sx = 1
        alt = true
      } else if (u < 0.82) {
        sx = Math.cos(((u - 0.64) / 0.18) * (Math.PI / 2))
        alt = true
      } else {
        sx = Math.sin(((u - 0.82) / 0.18) * (Math.PI / 2))
        alt = false
      }
      const w = Math.max(0.02, sx)
      addC(it, (i, g) => {
        if (i !== gi) return null
        const o: CharT = g.r90 ? { sy: w } : { sx: w }
        if (alt) {
          o.ch = ch
          o.color = acc
        }
        return o
      })
    },
  },

  /** 影子摇：一条长而软的影子慢慢摆，像光源在移动 */
  shadowSway: {
    tags: ['calm', 'emotional'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01 || it.extrude || env.pass !== 'main') return
      const t = env.ltb
      const seed = seedOf(it)
      const sz = it.size
      const ang = (60 + 45 * Math.sin((t * TAU) / 5.5 + (seed % 10))) * DEG
      const L = sz * (0.12 + 0.05 * Math.sin((t * TAU) / 3.3 + 1)) * Math.min(1.3, k)
      const col = darkBg(env)
        ? mixC(env.sc.bg, env.sc.accent, 0.42)
        : mixC(env.sc.bg, colOf(it), 0.3)
      it.extrude = {
        n: 12,
        dx: Math.cos(ang) * L,
        dy: Math.sin(ang) * L,
        color: col,
        fade: true,
        a: 0.9,
      }
    },
  },

  /** 磁力：一根看不见的磁铁棒在字周围游走，靠近的字被吸过去并发出嗡鸣 */
  magnetJiggle: {
    tags: ['pop', 'glitch'],
    w: 0.4,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const t = env.ltb
      const seed = seedOf(it)
      const sz = it.size
      const step = env.step
      let Mx: number
      let My: number
      let toItem = false
      if (isSingle(env, it)) {
        const W = env.W
        const H = env.H
        const [X2, Y2] = [
          W / 2 + Math.sin(t * 0.9 + (cutSeed(env) % 9)) * W * 0.36,
          H / 2 + Math.sin(t * 1.7 + 1) * H * 0.12,
        ]
        ;[Mx, My] = toL(it, X2, Y2)
        toItem = true
      } else {
        const b = lBox(it)
        Mx = b.cx + Math.sin(t * 0.9 + (seed % 9)) * b.w * 0.5
        My = b.cy + Math.sin(t * 1.7 + 1) * b.h * 0.9
      }
      addC(it, (i, g) => {
        const gx = toItem ? 0 : gCX(g, it)
        const gy = toItem ? 0 : gCY(g, it)
        const vx = Mx - gx
        const vy = My - gy
        const d = Math.hypot(vx, vy) || 1
        const f = 1 / (1 + Math.pow(d / (sz * 1.1), 2))
        const pull = sz * 0.2 * f * k
        const buzz = f > 0.35 ? rs(seed, step, i, 641) * sz * 0.014 * k * f : 0
        return { dx: (vx / d) * pull + buzz, dy: (vy / d) * pull, rot: (vx / d) * 7 * f * k }
      })
    },
  },

  /** 打字机的抖：一条手打过似的不平基线；每隔几拍有键被再敲一下——先沉一下，再落到新位置 */
  typeRattle: {
    tags: ['editorial', 'glitch'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const idx = beatIdx(env, 0.45)
      const since = beatSince(env, 0.45)
      const seed = seedOf(it)
      const sz = it.size
      const kk = Math.min(1, k)
      addC(it, (i) => {
        // 每个字记住最后一次被"敲"的那一拍，之后一直停在那次的偏移上
        let ep = -1
        for (let b = idx; b > idx - 7; b--) {
          if (r(seed, b, i, 651) < 0.3) {
            ep = b
            break
          }
        }
        const hit = ep === idx && since < 0.1 ? 1 - since / 0.1 : 0
        return {
          dy: rs(seed, ep, i, 652) * sz * 0.045 * k + hit * sz * 0.04 * k,
          dx: rs(seed, ep, i, 655) * sz * 0.01 * k,
          rot: rs(seed, ep, i, 653) * 3.2 * k,
          a: 1 - 0.2 * r(seed, ep, i, 654) * kk - 0.15 * hit * kk,
        }
      })
    },
  },

  /** 移焦：一节焦平面沿线漂过去，离焦的字发虚并微微胀开 */
  focusRack: {
    tags: ['calm', 'emotional'],
    w: 0.5,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      const ord = orderOf(env, it)
      const t = env.ltb
      const sz = it.size
      const kk = Math.min(1, k)
      const fpos = 0.5 + 0.62 * Math.sin((t * TAU) / 4.6 + (cutSeed(env) % 7))
      // 立体字上加逐字模糊太贵，只在主 pass 且允许滤镜时给
      const maxB =
        env.pass === 'main' && env.allowFilter && !it.extrude ? Math.min(sz * 0.065, 18) * kk : 0
      addC(it, (i, _g, n) => {
        const df = clamp((Math.abs(ord(i, n) - fpos) - 0.1) / 0.5)
        if (df <= 0) return null
        return { blur: maxB * df * df, a: 1 - 0.28 * df * kk, s: 1 + 0.035 * df * k }
      })
    },
  },

  /** 拨弦：整行像两端固定的弦一样立起驻波，每隔几拍再被拨一次、慢慢衰减 */
  pluckString: {
    tags: ['pop', 'emotional'],
    w: 0.4,
    apply(env, it, amt) {
      const k = amt * motionK(env)
      if (k < 0.01) return
      let tau: number
      if (env.beat && env.beat.len)
        tau = (((env.beat.index % 4) + 4) % 4) * env.beat.len + env.beat.since
      else {
        const per = 2.4
        tau = (((env.ltb - 0.45) % per) + per) % per
      }
      const sz = it.size
      const A = sz * 0.18 * k * Math.exp(-tau * 1.7) * Math.min(1, tau / 0.04)
      if (A < 0.3) return
      const vert = !!it.vertical
      const single = isSingle(env, it)
      const N = cutN(env)
      const mi = it.mi || 0
      const w1 = Math.cos(tau * TAU * 3.2)
      const w2 = Math.cos(tau * TAU * 6.6 + 1)
      addC(it, (_i, g) => {
        const x = single ? (mi + 1) / (N + 1) : (g.ci + 1) / (g.n + 1)
        const y = A * (Math.sin(Math.PI * x) * w1 + 0.3 * Math.sin(TAU * x) * w2)
        return vert ? { dx: y } : { dy: y }
      })
    },
  },
}

/** 兜底：无论配方最后剩什么，p≈1 一定是"完全消失" */
function guardedExit(defs: Record<string, AnimDef>): Record<string, AnimDef> {
  const out: Record<string, AnimDef> = {}
  for (const [key, def] of Object.entries(defs)) {
    out[key] = {
      ...def,
      apply: (env, it, p, ctx) => {
        if (p >= 0.998) {
          it.alpha = 0
          return
        }
        def.apply(env, it, p, ctx)
      },
    }
  }
  return out
}

export const pack: PackParts = { exit: guardedExit(X), hold: H }
