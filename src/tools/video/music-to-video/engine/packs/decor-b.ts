/**
 * 部件包 decorB：55 个装饰部件（和风纹样 / 科幻 HUD / 印刷文具 / 自然氛围 / 几何图形 / UI 控件）。
 *
 * 逐条移植自 JIZURA 的 src/11p_decorB.js（MIT）：坐标、常量、缓动、hash 种子与随机调用
 * 顺序一律照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由 registry 锁定，
 * 不要改名、不要增删。
 *
 * 中文适配（见移植契约）：
 * - 画进画面的日文文案换成对应中文词（家纹名、月龄名、假名标签、贴纸字样），几何与动效不变；
 * - lyricChar 的脚本优先级由「汉字 → 假名 → 拉丁」映射为 isHan / isKana / isLatin，
 *   中文歌词只走第一档，判定形状保留；
 * - 字体 key 用本仓库的命名（sans_med / serif / sans_black / mono），mincho_light → serif_light；
 * - 旧 def.ae（After Effects 导出用的动画归类）在本仓库无消费方、DecorDef 也未声明，故未照搬。
 */
import type { BBox, Cut, DecorParam, Env, PackParts, TextItem } from '../types'
import { centerBB } from '../layouts'
import { measure } from '../text-layout'
import { glyphCount, isHan, isKana, isLatin, isPunct } from '../script'
import { DEG, E, TAU, clamp, contrast, hash, lerp, lum, mix, noise1, r, rr, rs } from '../util'

/* ------------------------------------------------------------------ 公共助手 */

type Pt = readonly [number, number]
/** 直线段 [x0,y0,x1,y1] / 圆 [x,y,r] / 圆弧 [cx,cy,r,a0,a1]：都按变长数字组传 */
type Num = readonly number[]
type StrokeOpt = { cap?: CanvasLineCap; join?: CanvasLineJoin; close?: boolean }
/** 落位结果：盒子左上角、中心、是否干净地避开了歌词 */
type Spot = { x: number; y: number; cx: number; cy: number; ok: boolean }
/** 带所在象限的落位（供绕圈排布的部件用） */
type QuadSpot = Spot & { sx: number; sy: number }
type Rect = { x: number; y: number; w: number; h: number; side: string }
/** 逐字框（屏幕坐标） */
type GBox = { x0: number; x1: number; y0: number; y1: number }
type LabelOpt = Partial<TextItem>
type DrawFn = (env: Env, bb: BBox | null, p: DecorParam) => void

/** 1080p 短边 = 1 的缩放基准 */
const U = (env: Env) => Math.min(env.W, env.H) / 1080
/** 安全边距 */
const MG = (env: Env) => Math.round(Math.min(env.W, env.H) * 0.05)
const monoF = (env: Env) => env.st.fonts.mono[0] || 'mono'
const bodyF = (env: Env) => env.st.fonts.body[0] || 'sans_med'
const serifF = (env: Env) => env.st.fonts.serif[0] || 'serif'
const dispF = (env: Env) => env.st.fonts.display[0] || 'sans_black'
const dark = (env: Env) => lum(env.sc.bg) < 0.5
/** 局部时间上的淡入：delay 之后用 d 秒走完 ease */
const inE = (env: Env, d = 0.4, delay = 0, ease: (x: number) => number = E.outExpo) =>
  ease(clamp((env.lt - delay) / d))
/** 出场前一直保持 1，开始淡出后收尾 */
const outE = (env: Env) => 1 - E.inCubic(env.pOut)
const L2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** 残影通道只画 g=true 的图元，且换成该通道的单色 */
const colOf = (env: Env, c: string, g: boolean) =>
  env.pass === 'main' ? c : g ? env.passColor : null
/** 小号标签字号 */
const FS = (env: Env) => Math.max(12, 16 * U(env))
/** 在背景上真的看得清的方案色（否则退回 fg） */
const vis = (env: Env, c: string | null | undefined, min = 1.5) =>
  c && contrast(c, env.sc.bg) >= min ? c : env.sc.fg
const ACC = (env: Env) => vis(env, env.sc.accent)
const ACC2 = (env: Env) => vis(env, env.sc.accent2 || env.sc.accent)

/** 记住每个 cut 最后一次真实包围盒：文字飞走或隐藏时装饰不会弹回画面中心 */
const BBC = new WeakMap<Cut, BBox>()
function getBB(env: Env, bb: BBox | null): BBox {
  const cut = env.cut
  // 出场阶段沿用静止时的框（文字可能被放大或炸开）
  if (env.pOut > 0 && cut) {
    const held = BBC.get(cut)
    if (held) return held
  }
  if (bb && isFinite(bb.x0 + bb.x1 + bb.y0 + bb.y1) && bb.x1 > bb.x0 && bb.y1 > bb.y0) {
    const b: BBox = {
      x0: Math.max(bb.x0, -env.W * 0.1),
      x1: Math.min(bb.x1, env.W * 1.1),
      y0: Math.max(bb.y0, -env.H * 0.1),
      y1: Math.min(bb.y1, env.H * 1.1),
      boxes: bb.boxes || [],
      cx: bb.cx,
      cy: bb.cy,
    }
    if (b.x1 <= b.x0) {
      b.x0 = bb.x0
      b.x1 = bb.x1
    }
    if (b.y1 <= b.y0) {
      b.y0 = bb.y0
      b.y1 = bb.y1
    }
    if (cut) BBC.set(cut, b)
    return b
  }
  const c = cut && BBC.get(cut)
  return c || centerBB(env, null)
}
const bw = (bb: BBox) => bb.x1 - bb.x0
const bh = (bb: BBox) => bb.y1 - bb.y0
const hitBB = (x0: number, y0: number, x1: number, y1: number, bb: BBox, pad = 0) =>
  !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad)
const isVert = (bb: BBox) => bh(bb) > bw(bb) * 1.25

/** 把一个 w×h 的盒子放在歌词外侧（盒子外、安全边距内） */
function nearBB(env: Env, bb: BBox, w: number, h: number, P: DecorParam, gap: number): QuadSpot {
  const { W, H } = env
  const m = MG(env) * 0.8
  const sx0 = P.right ? 1 : -1
  const sy0 = P.low ? 1 : -1
  const order = P.corner
    ? ([
        [sx0, sy0],
        [-sx0, sy0],
        [sx0, -sy0],
        [-sx0, -sy0],
      ] as const)
    : ([
        [sx0, sy0],
        [sx0, -sy0],
        [-sx0, sy0],
        [-sx0, -sy0],
      ] as const)
  const tries: (readonly [number, number, number, number])[] = []
  for (const [sx, sy] of order) {
    const ax = sx > 0 ? bb.x1 - w : bb.x0
    const ox = sx > 0 ? bb.x1 + gap : bb.x0 - gap - w
    const ay = sy > 0 ? bb.y1 + gap : bb.y0 - gap - h
    const iy = sy > 0 ? bb.y1 - h : bb.y0
    if ((P.v | 0) % 2) tries.push([ox, iy, sx, sy], [ax, ay, sx, sy], [ox, ay, sx, sy])
    else tries.push([ax, ay, sx, sy], [ox, iy, sx, sy], [ox, ay, sx, sy])
  }
  for (const [x, y, sx, sy] of tries) {
    const X = clamp(x, m, Math.max(m, W - m - w))
    const Y = clamp(y, m, Math.max(m, H - m - h))
    if (!hitBB(X, Y, X + w, Y + h, bb, gap * 0.4))
      return { x: X, y: Y, cx: X + w / 2, cy: Y + h / 2, ok: true, sx, sy }
  }
  return cornerSpot(env, bb, w, h, P)
}

/** 避开歌词的一个屏幕角落（margin 内）；实在避不开就取重叠面积最小的 */
function cornerSpot(env: Env, bb: BBox, w: number, h: number, P: DecorParam, mk = 1): QuadSpot {
  const { W, H } = env
  const m = MG(env) * mk
  const sx0 = P.right ? 1 : -1
  const sy0 = P.low ? 1 : -1
  const order = [
    [sx0, sy0],
    [-sx0, sy0],
    [sx0, -sy0],
    [-sx0, -sy0],
  ] as const
  const cands: QuadSpot[] = order.map(([sx, sy]) => {
    const X = sx > 0 ? W - m - w : m
    const Y = sy > 0 ? H - m - h : m
    return {
      x: X,
      y: Y,
      cx: X + w / 2,
      cy: Y + h / 2,
      ok: !hitBB(X, Y, X + w, Y + h, bb, 8),
      sx,
      sy,
    }
  })
  const free = cands.find((c) => c.ok)
  if (free) return free
  let best = cands[0]
  let bestA =
    Math.max(0, Math.min(best.x + w, bb.x1) - Math.max(best.x, bb.x0)) *
    Math.max(0, Math.min(best.y + h, bb.y1) - Math.max(best.y, bb.y0))
  for (const c of cands.slice(1)) {
    const ov =
      Math.max(0, Math.min(c.x + w, bb.x1) - Math.max(c.x, bb.x0)) *
      Math.max(0, Math.min(c.y + h, bb.y1) - Math.max(c.y, bb.y0))
    if (ov < bestA) {
      bestA = ov
      best = c
    }
  }
  return best
}

const spot = (env: Env, bb: BBox, w: number, h: number, P: DecorParam, gap: number) =>
  P.corner ? cornerSpot(env, bb, w, h, P) : nearBB(env, bb, w, h, P, gap)

/** 歌词四周的空白矩形（上/下/左/右），可用尺寸大的排前面 */
function freeRects(env: Env, bb: BBox, gap: number): Rect[] {
  const { W, H } = env
  const m = MG(env) * 0.8
  const out: Rect[] = [
    { x: m, y: m, w: W - 2 * m, h: bb.y0 - gap - m, side: 't' },
    { x: m, y: bb.y1 + gap, w: W - 2 * m, h: H - m - bb.y1 - gap, side: 'b' },
    { x: m, y: m, w: bb.x0 - gap - m, h: H - 2 * m, side: 'l' },
    { x: bb.x1 + gap, y: m, w: W - m - bb.x1 - gap, h: H - 2 * m, side: 'r' },
  ].filter((rc) => rc.w > 30 && rc.h > 30)
  out.sort((a, b) => Math.min(b.w, b.h * 1.5) - Math.min(a.w, a.h * 1.5))
  return out
}

/** 描一条折线（可选圆头）；g=false → 只进主通道 */
function stroke(
  env: Env,
  pts: readonly Pt[] | null | undefined,
  c: string,
  lw: number,
  a = 1,
  g = false,
  o?: StrokeOpt,
) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !pts || pts.length < 2) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.lineCap = o?.cap || 'butt'
  ctx.lineJoin = o?.join || 'miter'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  if (o?.close) ctx.closePath()
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

/** 一个 path 里描多条折线 */
function strokes(
  env: Env,
  list: readonly (readonly Pt[] | null | undefined)[],
  c: string,
  lw: number,
  a = 1,
  g = false,
  o?: StrokeOpt,
) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.lineCap = o?.cap || 'butt'
  ctx.lineJoin = o?.join || 'miter'
  ctx.beginPath()
  for (const pts of list) {
    if (!pts || pts.length < 2) continue
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    if (o?.close) ctx.closePath()
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

/** 一个 path 里画多条直线段 [x0,y0,x1,y1] */
function segs(
  env: Env,
  list: readonly Num[],
  c: string,
  lw: number,
  a = 1,
  g = false,
  cap?: CanvasLineCap,
) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.lineCap = cap || 'butt'
  ctx.beginPath()
  for (const s of list) {
    ctx.moveTo(s[0], s[1])
    ctx.lineTo(s[2], s[3])
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
}

/** 一个 path 里画多条圆弧 [cx,cy,r,a0,a1]（弧度） */
function arcs(
  env: Env,
  list: readonly Num[],
  c: string,
  lw: number,
  a = 1,
  g = false,
  cap?: CanvasLineCap,
) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.lineCap = cap || 'butt'
  ctx.beginPath()
  for (const s of list) {
    if (s[2] <= 0) continue
    ctx.moveTo(s[0] + Math.cos(s[3]) * s[2], s[1] + Math.sin(s[3]) * s[2])
    ctx.arc(s[0], s[1], s[2], s[3], s[4])
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
}

/** 一个 path 里填多个圆 [x,y,r] */
function dots(env: Env, list: readonly Num[], c: string, a = 1, g = false) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = k
  ctx.beginPath()
  for (const d of list) {
    if (d[2] <= 0.05) continue
    ctx.moveTo(d[0] + d[2], d[1])
    ctx.arc(d[0], d[1], d[2], 0, TAU)
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 一个 path 里描多个圆 [x,y,r] */
function rings(env: Env, list: readonly Num[], c: string, lw: number, a = 1, g = false) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.beginPath()
  for (const d of list) {
    if (d[2] <= 0.05) continue
    ctx.moveTo(d[0] + d[2], d[1])
    ctx.arc(d[0], d[1], d[2], 0, TAU)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** 一个 path 里填多个矩形 [x,y,w,h] */
function rects(env: Env, list: readonly Num[], c: string, a = 1, g = false) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = k
  ctx.beginPath()
  for (const rc of list) if (rc[2] > 0 && rc[3] > 0) ctx.rect(rc[0], rc[1], rc[2], rc[3])
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 一个 path 里填多个多边形（nonzero 规则 → 重叠处不叠色） */
function polys(env: Env, list: readonly Pt[][], c: string, a = 1, g = false) {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = k
  ctx.beginPath()
  for (const pts of list) {
    if (!pts || pts.length < 3) continue
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 圆角矩形 path（主通道直接操 ctx） */
function rrPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
) {
  const q = Math.max(0, Math.min(rad, w / 2, h / 2))
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}
function rrStroke(
  env: Env,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
  c: string,
  lw: number,
  a: number,
) {
  if (env.pass !== 'main' || a <= 0.003 || w <= 0 || h <= 0) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = c
  ctx.lineWidth = lw
  ctx.beginPath()
  rrPath(ctx, x, y, w, h, rad)
  ctx.stroke()
  ctx.globalAlpha = 1
}
function rrFill(
  env: Env,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
  c: string,
  a: number,
) {
  if (env.pass !== 'main' || a <= 0.003 || w <= 0 || h <= 0) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = c
  ctx.beginPath()
  rrPath(ctx, x, y, w, h, rad)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 虚线段（只进主通道） */
function dash(
  env: Env,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  on: number,
  off: number,
  c: string,
  lw: number,
  a = 1,
  phase = 0,
) {
  if (env.pass !== 'main' || a <= 0.003) return
  const L = Math.hypot(x1 - x0, y1 - y0)
  if (L < 1) return
  const dx = (x1 - x0) / L
  const dy = (y1 - y0) / L
  const per = on + off
  const list: number[][] = []
  let s = -(((phase % per) + per) % per)
  for (let i = 0; i < 600 && s < L; i++, s += per) {
    const a0 = Math.max(0, s)
    const a1 = Math.min(L, s + on)
    if (a1 > a0) list.push([x0 + dx * a0, y0 + dy * a0, x0 + dx * a1, y0 + dy * a1])
  }
  segs(env, list, c, lw, a, false)
}

/** 折线在长度比例 e0..e1 之间的子段 */
function part(pts: readonly Pt[], e0: number, e1: number): Pt[] {
  const s0 = clamp(e0)
  const s1 = clamp(e1)
  if (s1 <= s0 || pts.length < 2) return []
  const d: number[] = [0]
  for (let i = 1; i < pts.length; i++)
    d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = d[d.length - 1]
  if (L <= 0) return []
  const A = s0 * L
  const B = s1 * L
  const at = (s: number): Pt => {
    let i = 1
    while (i < d.length - 1 && d[i] < s) i++
    const k = (s - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1])
    return L2(pts[i - 1], pts[i], clamp(k))
  }
  const out: Pt[] = [at(A)]
  for (let i = 1; i < pts.length - 1; i++) if (d[i] > A && d[i] < B) out.push(pts[i])
  out.push(at(B))
  return out
}

/** 折线长度比例 t 处的点与切线角 */
function along(pts: readonly Pt[], t: number): { x: number; y: number; ang: number } {
  const p = part(pts, 0, clamp(t, 0.0005, 1))
  const a = p[p.length - 1]
  const b = p.length > 1 ? p[p.length - 2] : pts[0]
  return { x: a[0], y: a[1], ang: Math.atan2(a[1] - b[1], a[0] - b[0]) }
}

/** 圆心折线（角度制） */
const arcP = (cx: number, cy: number, rad: number, a0: number, a1: number, n = 48): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG
    o.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad])
  }
  return o
}
/** 椭圆弧折线（角度制，rot 为弧度） */
const ellP = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  a0: number,
  a1: number,
  n = 48,
): Pt[] => {
  const o: Pt[] = []
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG
    const x = Math.cos(a) * rx
    const y = Math.sin(a) * ry
    o.push([cx + x * c - y * s, cy + x * s + y * c])
  }
  return o
}
const xf = (pts: readonly Pt[], cx: number, cy: number, ang = 0, s = 1): Pt[] => {
  const c = Math.cos(ang)
  const sn = Math.sin(ang)
  return pts.map(([x, y]) => [cx + (x * c - y * sn) * s, cy + (x * sn + y * c) * s])
}
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 20): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const mt = 1 - t
    o.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return o
}
/** 小号副文字（不参与残影通道） */
const label = (env: Env, text: string | number, x: number, y: number, o?: LabelOpt) =>
  env.draw({
    text: String(text),
    font: monoF(env),
    size: FS(env),
    x,
    y,
    color: env.sc.sub,
    align: 'left',
    track: 0.08,
    ghost: false,
    ...o,
  })
const textW = (text: string | number, font: string, size: number, track = 0.08) =>
  measure({ text: String(text), font, size, track }).w
const pad2 = (n: number, k = 2) => String(Math.max(0, Math.floor(n))).padStart(k, '0')

/** 从歌词里取一个字：优先汉字，其次假名/拉丁 */
function lyricChar(env: Env, salt: number): string {
  const cut = env.cut
  if (!cut) return ''
  const arr = [...String(cut.text || cut.lineText || '')].filter((c) => c.trim() && !isPunct(c))
  if (!arr.length) return ''
  const kan = arr.filter((c) => isHan(c))
  const pool = kan.length ? kan : arr.filter((c) => isKana(c) || isLatin(c))
  const p = pool.length ? pool : arr
  return p[hash(cut.seed, salt | 0, 5) % p.length]
}

/** 0 = 压到歌词，1 = 离出 soft 那么远 */
const clearOf = (bb: BBox, x: number, y: number, pad: number, soft: number) => {
  const dx = Math.max(bb.x0 - pad - x, 0, x - bb.x1 - pad)
  const dy = Math.max(bb.y0 - pad - y, 0, y - bb.y1 - pad)
  return clamp(Math.hypot(dx, dy) / soft)
}
const wrap = (v: number, lo: number, span: number) => lo + ((((v - lo) % span) + span) % span)

/** 歌词的逐字框按行（竖排时按列）分组 */
function glyphLines(bb: BBox): { vert: boolean; lines: { k: number; g: GBox[] }[] } {
  const vert = isVert(bb)
  const lines: { k: number; g: GBox[] }[] = []
  if (bb.boxes && bb.boxes.length && bb.cx != null) {
    for (const b of bb.boxes) {
      const g: GBox = {
        x0: bb.cx + b.x - b.w / 2,
        x1: bb.cx + b.x + b.w / 2,
        y0: bb.cy + b.y - b.h / 2,
        y1: bb.cy + b.y + b.h / 2,
      }
      const key = vert ? (g.x0 + g.x1) / 2 : (g.y0 + g.y1) / 2
      const sz = vert ? g.x1 - g.x0 : g.y1 - g.y0
      let L = lines.find((l) => Math.abs(l.k - key) < sz * 0.4)
      if (!L) {
        L = { k: key, g: [] }
        lines.push(L)
      }
      L.g.push(g)
    }
    lines.sort((a, b) => (vert ? b.k - a.k : a.k - b.k))
    for (const L of lines) L.g.sort((a, b) => (vert ? a.y0 - b.y0 : a.x0 - b.x0))
  }
  return { vert, lines }
}

/** 挂在歌词旁边的装饰等入场基本稳定之后才画，免得包围盒变化时跳动 */
const settleT = (env: Env) => clamp(((env.cut && env.cut.inDur) || 0) * 0.6, 0, 0.35)
function settle(fn: DrawFn): DrawFn {
  return (env, bb, P) => {
    const s = settleT(env)
    if (s <= 0.001) return fn(env, bb, P)
    if (env.lt < s) return
    const ev: Env = { ...env, lt: env.lt - s, ltb: env.ltb - s }
    return fn(ev, bb, P)
  }
}

/** 家纹名号（画进画面，用中文纹样名） */
const KAMON = ['丸三巴', '七宝纹', '丸梅钵', '丸轮违', '丸三丸']

/** 单位半径的家纹图案路径（闭合折线，局部坐标） */
function kamonPaths(kind: number): Pt[][] {
  const out: Pt[][] = []
  if (kind === 0) {
    // 三つ巴：三个旋转的逗号
    for (let k = 0; k < 3; k++) {
      const th0 = (-90 + k * 120) * DEG
      const sw = 150 * DEG
      const h0 = 0.27
      const M = 30
      const outer: Pt[] = []
      const inner: Pt[] = []
      for (let i = 0; i <= M; i++) {
        const t = i / M
        const th = th0 + t * sw
        const rc = 0.38 + 0.46 * t
        const w = h0 * Math.pow(1 - t, 0.85)
        outer.push([Math.cos(th) * (rc + w), Math.sin(th) * (rc + w)])
        inner.push([Math.cos(th) * (rc - w), Math.sin(th) * (rc - w)])
      }
      const hc: Pt = [Math.cos(th0) * 0.38, Math.sin(th0) * 0.38]
      const rh = [Math.cos(th0), Math.sin(th0)]
      const tv = [-Math.sin(th0), Math.cos(th0)]
      const cap: Pt[] = []
      for (let i = 1; i < 16; i++) {
        const f = (i / 16) * Math.PI
        cap.push([
          hc[0] + h0 * (-rh[0] * Math.cos(f) - tv[0] * Math.sin(f)),
          hc[1] + h0 * (-rh[1] * Math.cos(f) - tv[1] * Math.sin(f)),
        ])
      }
      out.push(outer.concat(inner.reverse(), cap, [outer[0]]))
    }
  } else if (kind === 1) {
    // 七宝：四个过圆心的等圆
    for (let k = 0; k < 4; k++) {
      const a = k * 90
      out.push(arcP(Math.cos(a * DEG) * 0.5, Math.sin(a * DEG) * 0.5, 0.5, a + 180, a + 540, 40))
    }
    out.push(arcP(0, 0, 0.13, -90, 270, 20))
  } else if (kind === 2) {
    // 梅钵：五片圆瓣绕一个小中心
    for (let k = 0; k < 5; k++) {
      const a = -90 + k * 72
      out.push(arcP(Math.cos(a * DEG) * 0.6, Math.sin(a * DEG) * 0.6, 0.3, a + 180, a + 540, 32))
    }
    out.push(arcP(0, 0, 0.17, -90, 270, 20))
  } else if (kind === 3) {
    // 轮违：两个相扣的圆环
    out.push(arcP(-0.3, 0, 0.55, 0, 360, 48), arcP(0.3, 0, 0.55, 180, 540, 48))
  } else {
    // 三つ輪：三个相扣的圆环
    for (let k = 0; k < 3; k++) {
      const a = -90 + k * 120
      out.push(arcP(Math.cos(a * DEG) * 0.4, Math.sin(a * DEG) * 0.4, 0.46, a + 180, a + 540, 40))
    }
  }
  return out
}

/** 枫叶轮廓（单位尺寸，y 轴向下） */
const MAPLE: Pt[] = (() => {
  const lobes: readonly (readonly [number, number])[] = [
    [-125, 0.36],
    [-82, 0.66],
    [-42, 0.9],
    [0, 1],
    [42, 0.9],
    [82, 0.66],
    [125, 0.36],
  ]
  const pts: Pt[] = []
  const P2 = (a: number, rad: number): Pt => [Math.sin(a * DEG) * rad, -Math.cos(a * DEG) * rad]
  pts.push(P2(180, 0.1))
  lobes.forEach(([a, l], i) => {
    pts.push(
      P2(a - 17, l * 0.6),
      P2(a - 11, l * 0.64),
      P2(a - 6, l * 0.84),
      P2(a, l),
      P2(a + 6, l * 0.84),
      P2(a + 11, l * 0.64),
      P2(a + 17, l * 0.6),
    )
    const nx = i < lobes.length - 1 ? lobes[i + 1][0] : 180
    pts.push(P2((a + nx) / 2, i < lobes.length - 1 ? 0.3 : 0.1))
  })
  return pts
})()

/** 卷浪：背脊 + 卷口 + 浪面 + 内侧水纹 */
function waveCrest(x: number, yb: number, w: number, h: number) {
  const back = bez([x - w / 2, yb], [x - w * 0.18, yb], [x - w * 0.28, yb - h], [x, yb - h], 16)
  const r0 = h * 0.4
  const cx = x
  const cy = yb - h + r0
  const curl: Pt[] = []
  for (let i = 1; i <= 30; i++) {
    const deg = (i / 30) * 430
    const an = (-90 + deg) * DEG
    const rad = r0 * (deg < 90 ? 1 : 1 - (0.8 * (deg - 90)) / 340)
    curl.push([cx + Math.cos(an) * rad, cy + Math.sin(an) * rad])
  }
  const face = bez(
    [cx + r0, cy],
    [cx + r0 * 1.05, cy + h * 0.35],
    [x + w * 0.3, yb],
    [x + w / 2, yb],
    12,
  )
  const inner = [0.7, 0.44].map((k) =>
    bez(
      [x - w / 2 + w * 0.12 * (1 - k), yb],
      [x - w * 0.2, yb],
      [x - w * 0.24, yb - h * k],
      [x - w * 0.02, yb - h * k + h * 0.08],
      12,
    ),
  )
  return { crest: back.concat(curl), face, inner, top: [x + r0 * 0.9, yb - h] as Pt }
}

/** 日式云：起伏的顶 + 平底 + 左侧卷涡 */
function kumo(x0: number, yb: number, L: number, hc: number): { outline: Pt[]; curl: Pt[] } {
  const bumps: readonly (readonly [number, number])[] = [
    [0.22, 0.5],
    [0.48, 0.78],
    [0.74, 0.55],
    [0.9, 0.32],
  ]
  const top: Pt[] = []
  for (let i = 0; i <= 44; i++) {
    const x = x0 + (L * i) / 44
    let y = yb
    for (const [bx, br] of bumps) {
      const dx = x - (x0 + L * bx)
      const R = br * hc
      if (Math.abs(dx) < R) y = Math.min(y, yb - Math.sqrt(R * R - dx * dx))
    }
    top.push([x, y])
  }
  const curl: Pt[] = []
  const c: Pt = [x0 - hc * 0.05, yb - hc * 0.3]
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    const an = (90 + t * 400) * DEG
    const rad = hc * 0.3 * (1 - t * 0.78)
    curl.push([c[0] - Math.cos(an) * rad * 1.1, c[1] + Math.sin(an) * rad])
  }
  return {
    outline: top.concat([
      [x0 + L, yb],
      [x0, yb],
    ]),
    curl,
  }
}

/** 罗盘整点方位缩写（国际通用航海记号，保留拉丁字母） */
const DIR_LABEL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }

/** 歌词四周的"纸张"虚拟边角线（staple / paperClip 共用，画两层错开的纸） */
function sheetCorner(
  env: Env,
  X: number,
  Y: number,
  sx: number,
  sy: number,
  L: number,
  e: number,
  a: number,
) {
  const u = U(env)
  const lw = Math.max(1, u)
  const c1 = part(
    [
      [X + sx * L, Y],
      [X, Y],
      [X, Y + sy * L],
    ],
    0.5 - 0.5 * e,
    0.5 + 0.5 * e,
  )
  const o = 5 * u
  const c2 = part(
    [
      [X + sx * L * 0.8 + sx * o, Y + sy * o],
      [X + sx * o, Y + sy * o],
      [X + sx * o, Y + sy * L * 0.8 + sy * o],
    ],
    0.5 - 0.5 * e,
    0.5 + 0.5 * e,
  )
  stroke(env, c2, env.sc.sub, lw, 0.35 * a)
  stroke(env, c1, env.sc.sub, lw, 0.8 * a)
}

/** 歌词下方（或上方）空白带里居中放一个 w×h 的块；放不下退回 spot() */
function bandSpot(env: Env, bb: BBox, w: number, h: number, P: DecorParam, gap: number): Spot {
  const { W, H } = env
  const m = MG(env) * 0.8
  for (const below of P.low ? [false, true] : [true, false]) {
    const y = below ? bb.y1 + gap : bb.y0 - gap - h
    if (y < m || y + h > H - m) continue
    const x = clamp((bb.x0 + bb.x1) / 2 - w / 2, m, W - m - w)
    return { x, y, cx: x + w / 2, cy: y + h / 2, ok: true }
  }
  return spot(env, bb, w, h, P, gap)
}

/** 长尾夹的钢丝轮廓（夹子自身坐标系，已垂直居中） */
const CLIP: Pt[] = (() => {
  const p: Pt[] = []
  const seg = (a: Pt, b: Pt) => {
    for (let i = 0; i <= 6; i++) p.push(L2(a, b, i / 6))
  }
  const arc = (cx: number, cy: number, rad: number, a0: number, a1: number) => {
    for (let i = 0; i <= 14; i++) {
      const an = (a0 + ((a1 - a0) * i) / 14) * DEG
      p.push([cx + Math.cos(an) * rad, cy + Math.sin(an) * rad])
    }
  }
  seg([-0.2, 0.95], [-0.2, 2.45])
  arc(0.05, 2.45, 0.25, 180, 0)
  seg([0.3, 2.45], [0.3, 0.42])
  arc(-0.02, 0.42, 0.32, 0, -180)
  seg([-0.34, 0.42], [-0.34, 2.62])
  arc(0.06, 2.62, 0.4, 180, 0)
  seg([0.46, 2.62], [0.46, 0.85])
  return p.map(([x, y]): Pt => [x, y - 1.5])
})()

/** 积雨云轮廓：多个圆的并集，只留没被别的圆盖住的部分 */
function cloudOutline(
  cx: number,
  by: number,
  Wc: number,
  seed: number,
): { runs: Pt[][]; base: Pt[]; circles: number[][] } {
  const cs: number[][] = [
    [-0.38, 0.15, 0.3],
    [-0.21, 0.22, 0.5],
    [0.02, 0.26, 0.75],
    [0.23, 0.2, 0.5],
    [0.39, 0.13, 0.3],
    [-0.07, 0.19, 1.35],
  ].map(([fx, fr, fy], i) => {
    const rad = fr * Wc * (0.9 + 0.2 * r(seed, i, 1))
    return [cx + fx * Wc, by - rad * fy, rad]
  })
  const runs: Pt[][] = []
  for (const [x, y, rad] of cs) {
    let cur: Pt[] | null = null
    for (let i = 0; i <= 40; i++) {
      const an = Math.PI + (i / 40) * Math.PI
      const px = x + Math.cos(an) * rad
      const py = y + Math.sin(an) * rad
      const hidden =
        py > by ||
        cs.some((c) => (c[0] !== x || c[1] !== y) && Math.hypot(px - c[0], py - c[1]) < c[2] - 0.5)
      if (hidden) {
        cur = null
        continue
      }
      if (!cur) {
        cur = []
        runs.push(cur)
      }
      cur.push([px, py])
    }
    // 圆的下半，但仍在基线之上
    cur = null
    for (let i = 0; i <= 20; i++) {
      const an = (i / 20) * Math.PI
      const px = x + Math.cos(an) * rad
      const py = y + Math.sin(an) * rad
      const hidden =
        py > by ||
        cs.some((c) => (c[0] !== x || c[1] !== y) && Math.hypot(px - c[0], py - c[1]) < c[2] - 0.5)
      if (hidden) {
        cur = null
        continue
      }
      if (!cur) {
        cur = []
        runs.push(cur)
      }
      cur.push([px, py])
    }
  }
  let xl = 1e9
  let xr = -1e9
  for (const [x, y, rad] of cs) {
    if (by - y < rad) {
      const d = Math.sqrt(rad * rad - (by - y) * (by - y))
      xl = Math.min(xl, x - d)
      xr = Math.max(xr, x + d)
    }
  }
  return {
    runs,
    base: [
      [xl, by],
      [xr, by],
    ],
    circles: cs,
  }
}

/** 鼠标指针轮廓（单位高度，左上角为尖端） */
const CURSOR: Pt[] = [
  [0, 0],
  [0, 1],
  [0.27, 0.76],
  [0.45, 1.13],
  [0.6, 1.06],
  [0.42, 0.7],
  [0.74, 0.7],
]
/** 双击的两个时刻 + 之后隔一会儿再点一次 */
const CLICK_TIMES = [0.62, 0.84, 1.9]

/** 开关面板的四套标签 */
const TOGGLE_LABELS: readonly (readonly string[])[] = [
  ['SHUFFLE', 'REPEAT', 'LYRICS'],
  ['思念', '记忆', '留恋'],
  ['LOVE', 'MEMORY', 'REPLAY'],
  ['声音', '光', '夜'],
]

/** 心形轮廓（参数方程，s 为半宽） */
const heartPts = (cx: number, cy: number, s: number): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * TAU
    const x = 16 * Math.pow(Math.sin(t), 3)
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    o.push([cx + (x * s) / 17, cy - (y * s) / 17])
  }
  return o
}

/** 「正」字的五笔笔画（0..1 归一坐标） */
const SEI: Pt[][] = [
  [
    [0.1, 0.12],
    [0.9, 0.12],
  ],
  [
    [0.5, 0.12],
    [0.5, 0.9],
  ],
  [
    [0.5, 0.5],
    [0.84, 0.5],
  ],
  [
    [0.22, 0.46],
    [0.22, 0.9],
  ],
  [
    [0.02, 0.9],
    [0.98, 0.9],
  ],
]

/** 八个等分月相的中文月名 */
const MOON_NAMES = ['新月', '蛾眉月', '上弦', '盈凸', '满月', '亏凸', '下弦', '残月']

/** 分类标签的三套序号字样（数字 / 天干 / 拉丁） */
const LAB_SETS: readonly (readonly string[])[] = [
  ['01', '02', '03', '04', '05'],
  ['甲', '乙', '丙', '丁', '戊'],
  ['A', 'B', 'C', 'D', 'E'],
]

export const pack: PackParts = {
  decor: {
    /* ==================================================== 和风纹样 */

    /* 家纹：双环里用圆与弧画一枚纹章，下方小字标出名号 */
    kamon: {
      layer: 'front',
      w: 0.8,
      tags: ['editorial', 'calm', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.075, 48 * u, 96 * u)
        const fs = FS(env) * 0.85
        const sp = spot(env, bb, R * 2.3, R * 2.3 + fs * 2.2, P, 24 * u)
        const cx = sp.cx
        const cy = sp.y + R * 1.15
        const a = o * (sp.ok ? 1 : 0.35)
        const kind = (P.v | 0) % 5
        const lw = Math.max(1, 1.5 * u)
        const e0 = E.inOutCubic(clamp(env.lt / 0.6))
        stroke(env, arcP(cx, cy, R, -90, -90 + 360 * e0, 90), sc.fg, lw, a)
        stroke(
          env,
          arcP(cx, cy, R * 0.9, 90, 90 + 360 * e0, 90),
          sc.fg,
          Math.max(1, 0.8 * u),
          a * 0.55,
        )
        const spin = kind === 0 || kind === 4 ? env.ltb * 8 * (P.right ? 1 : -1) : 0
        const ang =
          ((1 - E.outExpo(clamp(env.lt / 0.9))) * -70 + spin + (kind === 0 ? P.r * 120 : 0)) * DEG
        const paths = kamonPaths(kind)
        const col = P.accent ? ACC(env) : sc.fg
        const s = R * 0.8
        paths.forEach((p, i) => {
          const e = E.inOutCubic(clamp((env.lt - 0.12 - i * 0.07) / 0.55))
          if (e <= 0) return
          stroke(env, part(xf(p, cx, cy, ang, s), 0, e), col, lw * 1.1, a, false, { join: 'round' })
        })
        env.circle(cx, cy, 2.2 * u, ACC(env), null, 0, a * inE(env, 0.3, 0.5), false)
        const le = inE(env, 0.4, 0.45, E.outCubic)
        label(env, KAMON[kind], cx, cy + R + fs * 1.35, {
          font: serifF(env),
          size: fs,
          align: 'center',
          track: 0.32,
          color: sc.sub,
          alpha: a * le,
        })
      }),
    },

    /* 青海波：从屏幕角落铺开的同心弧波纹，压在歌词之下 */
    seigaiha: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'emotional', 'editorial'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const rad = clamp(Math.min(W, H) * 0.05, 34 * u, 60 * u)
        const sx = P.right ? 1 : -1
        const sy = P.low ? 1 : -1
        const ox = sx > 0 ? W : 0
        const oy = sy > 0 ? H : 0
        const pw = W * rr(0.42, 0.62, P.seed, 1)
        const ph = H * rr(0.45, 0.65, P.seed, 2)
        const grow = E.outCubic(clamp(env.lt / 1.0)) * 1.3
        const drift = ((env.ltb * 7 * u) % (2 * rad)) * -sx
        // 每圈被下一行遮住后剩下的可见弧范围
        const NR = 4
        const gam: number[] = []
        for (let k = 0; k < NR; k++) {
          const rho = rad * (1 - k / NR)
          const ca = (rho * rho + 1.25 * rad * rad - rad * rad) / (2 * rho * 1.118 * rad)
          gam.push(Math.max(0, Math.acos(clamp(ca, -1, 1)) - 26.565 * DEG))
        }
        const buckets: Num[][] = [[], [], [], []]
        const rows = Math.ceil(ph / (rad / 2)) + 2
        const cols = Math.ceil(pw / (2 * rad)) + 2
        const y0 = sy > 0 ? H - ph : -rad
        const x0 = sx > 0 ? W - pw - 2 * rad : -2 * rad
        for (let j = 0; j < rows && j < 80; j++) {
          const y = y0 + (j * rad) / 2
          for (let i = 0; i < cols && i < 60; i++) {
            const x = x0 + i * 2 * rad + (j % 2) * rad + drift
            const d = Math.hypot((x - ox) / pw, (y - oy) / ph)
            const f = Math.pow(clamp(1 - d), 0.6) * clamp((grow - d) * 3)
            if (f <= 0.04) continue
            const b = Math.min(3, Math.floor(f * 4))
            for (let k = 0; k < NR; k++)
              buckets[b].push([x, y, rad * (1 - k / NR), Math.PI + gam[k], TAU - gam[k]])
          }
        }
        const col = P.accent ? ACC(env) : sc.sub
        const base = (P.accent ? 0.5 : 0.46) * (dark(env) ? 1 : 0.8) * o
        const lw = Math.max(1, 1.3 * u)
        buckets.forEach((l, b) => arcs(env, l, col, lw, (base * (b + 1)) / 4))
      },
    },

    /* 麻の葉：透过圆形（或方形）窗看到的麻叶纹，在歌词之后张开 */
    asanoha: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'editorial', 'emotional'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const M = Math.min(W, H)
        const R0 = M * rr(0.27, 0.36, P.seed, 1)
        const portrait = H > W * 1.1
        const cx = portrait
          ? W * (0.5 + (P.right ? 0.14 : -0.14))
          : W * (0.5 + (P.right ? 0.22 : -0.22)) + rs(P.seed, 2) * W * 0.04
        const cy = portrait ? H * (P.low ? 0.66 : 0.34) : H * (0.5 + (P.low ? 0.07 : -0.07))
        const e = E.outCubic(clamp(env.lt / 0.8))
        const R = R0 * e * (1 + 0.06 * E.inCubic(env.pOut))
        if (R < 2) return
        const sq = !!P.corner
        const s = R0 / 3.2
        const h3 = (s * Math.sqrt(3)) / 2
        const rot = (P.r * 60 + env.ltb * 2.5) * DEG
        const c = Math.cos(rot)
        const sn = Math.sin(rot)
        const T = (x: number, y: number): Pt => [cx + x * c - y * sn, cy + x * sn + y * c]
        const col = P.accent ? ACC(env) : sc.sub
        const al = (dark(env) ? 0.3 : 0.34) * o
        const lw = Math.max(1, 1.1 * u)
        ctx.save()
        ctx.beginPath()
        if (sq) rrPath(ctx, cx - R, cy - R, R * 2, R * 2, 6 * u)
        else ctx.arc(cx, cy, R, 0, TAU)
        ctx.clip()
        const n = Math.ceil((R0 * 1.5) / s) + 1
        const grid: number[][] = []
        const star: number[][] = []
        const bloom = E.outCubic(clamp((env.lt - 0.15) / 0.8))
        for (let j = -n; j <= n; j++)
          for (let i = -n; i <= n; i++) {
            const px = i * s + j * (s / 2)
            const py = j * h3
            if (Math.hypot(px, py) > R0 * 1.45) continue
            const A = T(px, py)
            const B = T(px + s, py)
            const C = T(px + s / 2, py + h3)
            const D = T(px + s * 1.5, py + h3)
            grid.push([A[0], A[1], B[0], B[1]], [A[0], A[1], C[0], C[1]], [B[0], B[1], C[0], C[1]])
            for (const tri of [
              [A, B, C],
              [B, D, C],
            ] as const) {
              const g = [
                (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
                (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
              ]
              for (const v of tri)
                star.push([g[0], g[1], lerp(g[0], v[0], bloom), lerp(g[1], v[1], bloom)])
            }
          }
        segs(env, grid, col, lw, al * 0.8)
        if (bloom > 0) segs(env, star, col, lw, al)
        ctx.restore()
        const e2 = E.inOutCubic(clamp(env.lt / 0.9))
        if (sq)
          stroke(
            env,
            part(
              [
                [cx - R, cy - R],
                [cx + R, cy - R],
                [cx + R, cy + R],
                [cx - R, cy + R],
                [cx - R, cy - R],
              ],
              0,
              e2,
            ),
            col,
            lw * 1.3,
            al * 1.6,
          )
        else stroke(env, arcP(cx, cy, R, -90, -90 + 360 * e2, 96), col, lw * 1.3, al * 1.6)
        const R2 = R + 7 * u
        if (!sq)
          stroke(env, arcP(cx, cy, R2, 90, 90 + 300 * e2, 90), col, Math.max(1, 0.8 * u), al * 0.9)
      },
    },

    /* 花火：在歌词周围的空白里炸开的花火（菊瓣尾迹 / 牡丹星点 / 垂柳） */
    hanabi: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'pop', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fr = freeRects(env, bb, 26 * u)
        if (!fr.length) return
        const nB = 2 + ((P.n | 0) % 2)
        const T = 2.2
        const style = (P.v | 0) % 3
        const cols = [ACC(env), ACC2(env), sc.fg]
        const pad = 8 * u
        const soft = 30 * u
        for (let k = 0; k < nB; k++) {
          const all = env.ltb - 0.02 - k * 0.6
          if (all < 0) continue
          const cyc = Math.floor(all / T)
          const tau = all - cyc * T
          const rad = (i: number) => r(P.seed, k, cyc, i)
          const reg = fr[(k + cyc) % Math.min(2, fr.length)]
          const R =
            clamp(Math.min(reg.w * 0.5, reg.h) * 0.5, 44 * u, 190 * u) * (0.75 + 0.3 * rad(3))
          const x = reg.x + R * 0.9 + Math.max(0, reg.w - R * 1.8) * rad(1)
          const y = reg.y + R * 0.8 + Math.max(0, reg.h - R * 1.7) * rad(2)
          const c1 = cols[(k + cyc) % 3]
          const c2 = cols[(k + cyc + 1) % 3]
          const rise = 0.3
          if (tau < rise) {
            // 升空的花火壳与短尾迹
            const q = E.outCubic(tau / rise)
            const yy = y + R * 1.1 * (1 - q)
            const al = clearOf(bb, x, yy, pad, soft)
            segs(
              env,
              [[x, yy, x, yy + 34 * u * (1 - q * 0.7)]],
              c1,
              1.4 * u,
              0.7 * o * al,
              false,
              'round',
            )
            dots(env, [[x, yy, 2.2 * u]], c1, o * al)
            continue
          }
          const tb = tau - rise
          const life = style === 2 ? 1.75 : 1.4
          if (tb > life) continue
          const fade = 1 - clamp((tb - life * 0.4) / (life * 0.6))
          const g = R * (style === 2 ? 0.75 : 0.28)
          if (tb < 0.16)
            dots(
              env,
              [[x, y, R * 0.16 * (1 - tb / 0.16) + 2 * u]],
              sc.fg,
              0.6 * o * clearOf(bb, x, y, pad, soft),
            )
          const layers: readonly (readonly [number, number, string, number])[] = [
            [style === 1 ? 32 : 28, 1, c1, 1.4 * u],
            [style === 2 ? 0 : 16, 0.52, c2, 1.2 * u],
          ]
          for (const [M, rk, col, lw] of layers) {
            if (!M) continue
            const segL: number[][] = []
            const segT: number[][] = []
            const hd: number[][] = []
            for (let i = 0; i < M; i++) {
              const th = ((i + r(P.seed, k, cyc, i, rk * 10) * 0.35) / M) * TAU + rk
              const sp = rk * (0.86 + 0.18 * r(P.seed, k, cyc, i, 3))
              const pos: (t: number) => Pt =
                style === 2
                  ? (t: number): Pt => {
                      const rr2 = R * sp * (1 - Math.exp(-t * 2.6))
                      return [x + Math.cos(th) * rr2, y + Math.sin(th) * rr2 + g * 0.55 * t * t]
                    }
                  : (t: number): Pt => {
                      const rr2 = R * sp * E.outCubic(clamp(t / 0.85))
                      return [x + Math.cos(th) * rr2, y + Math.sin(th) * rr2 + g * t * t]
                    }
              const p = pos(tb)
              const al = clearOf(bb, p[0], p[1], pad, soft)
              if (al <= 0.3) continue
              const tw = tb > life * 0.5 && r(P.seed, k, i, env.step) < 0.4 ? 0.2 : 1
              if (style === 1) {
                hd.push([p[0], p[1], 2.6 * u * (0.5 + 0.5 * fade) * tw])
                const q = pos(Math.max(0, tb - 0.05))
                segL.push([q[0], q[1], p[0], p[1]])
              } else if (style === 2) {
                const q: Pt[] = []
                for (let j = 0; j <= 7; j++) q.push(pos(Math.max(0, tb - 0.9 + (j * 0.9) / 7)))
                for (let j = 3; j <= 7; j++) segL.push([q[j - 1][0], q[j - 1][1], q[j][0], q[j][1]])
                for (let j = 1; j < 3; j++) segT.push([q[j - 1][0], q[j - 1][1], q[j][0], q[j][1]])
                hd.push([p[0], p[1], 1.6 * u * tw])
              } else {
                const q = pos(Math.max(0, tb - 0.2))
                segL.push([q[0], q[1], p[0], p[1]])
                hd.push([p[0], p[1], 2 * u * tw])
              }
            }
            segs(env, segT, col, lw, 0.3 * o * fade, false, 'round')
            segs(env, segL, col, lw, (style === 1 ? 0.35 : 0.8) * o * fade, false, 'round')
            dots(env, hd, col, o * fade)
          }
        }
      }),
    },

    /* 提灯：吊线从顶边垂下来的纸灯笼，轻轻摆动，灯身写一个歌词里的字 */
    chochin: {
      layer: 'front',
      w: 0.7,
      tags: ['emotional', 'pop', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc, ctx } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const lw0 = clamp(Math.min(W, H) * 0.066, 42 * u, 86 * u)
        const lh = lw0 * 1.32
        const gap = 24 * u
        const K = Math.max(5, Math.floor((W - 2 * m) / (lw0 * 1.9)))
        const cands: { x: number; room: number; i: number }[] = []
        for (let i = 0; i < K; i++) {
          const x = m + lw0 * 0.7 + ((W - 2 * m - lw0 * 1.4) * i) / Math.max(1, K - 1)
          const over = x + lw0 * 0.75 > bb.x0 - gap && x - lw0 * 0.75 < bb.x1 + gap
          const floor = over ? bb.y0 - gap : H * 0.62
          const room = floor - lh * 1.3 - 10 * u
          if (room >= 16 * u) cands.push({ x, room, i })
        }
        // 均匀而略带对称感的分布：从种子决定的相位起隔位取槽
        const want = Math.min(K, 3 + ((P.n | 0) % 3))
        const pick: { x: number; room: number; i: number }[] = []
        for (let j = 0; j < want; j++) {
          const ideal = Math.round(((j + 0.5) * K) / want - 0.5 + rs(P.seed, j, 4) * 0.4)
          const c = cands
            .filter((cd) => pick.every((p) => Math.abs(p.x - cd.x) > lw0 * 1.6))
            .sort((a, b) => Math.abs(a.i - ideal) - Math.abs(b.i - ideal))[0]
          if (c && Math.abs(c.i - ideal) <= Math.max(1, K / want / 2)) pick.push(c)
        }
        pick.sort((a, b) => a.x - b.x)
        const body = ACC(env)
        const rib = mix(body, sc.bg, 0.45)
        const cap = dark(env) ? sc.fg : sc.ink || sc.fg
        const txtC = lum(body) > 0.55 ? '#000000' : sc.bg
        pick.forEach((p, j) => {
          const q = clamp((env.lt - 0.03 - j * 0.08) / 0.6)
          if (q <= 0) return
          const Lf = Math.min(p.room, p.room * (0.25 + 0.6 * r(P.seed, p.i, 2)) + 20 * u)
          const drop = E.outBack(q, 1.4)
          const L = lerp(-lh * 1.6, Lf, drop)
          const amp = (2.5 + 8 * Math.exp(-env.lt * 1.5)) * (r(P.seed, j, 3) < 0.5 ? 1 : -1)
          const ang = amp * Math.sin(env.ltb * (1.7 + j * 0.23) + j * 1.3) * DEG
          ctx.save()
          ctx.translate(p.x, 0)
          ctx.rotate(ang)
          const top = L
          const cy = top + lh / 2
          if (top > 0) segs(env, [[0, 0, 0, top]], sc.sub, Math.max(1, u), 0.8 * o)
          if (dark(env)) {
            dots(env, [[0, cy, lw0 * 1.05]], body, 0.06 * o)
            dots(env, [[0, cy, lw0 * 0.78]], body, 0.08 * o)
          }
          const shape: Pt[] = []
          for (let i = 0; i <= 32; i++) {
            const t = (i / 32) * TAU
            const cs = Math.cos(t)
            const sn = Math.sin(t)
            shape.push([
              Math.sign(cs) * Math.pow(Math.abs(cs), 0.8) * (lw0 / 2),
              Math.sign(sn) * Math.pow(Math.abs(sn), 0.9) * lh * 0.42 + cy,
            ])
          }
          polys(env, [shape], body, 0.94 * o)
          const rl: number[][] = []
          for (let k = 1; k < 8; k++) {
            const yy = -lh * 0.42 + (lh * 0.84 * k) / 8
            const sn = Math.pow(Math.abs(yy) / (lh * 0.42), 1 / 0.9)
            const f = Math.pow(Math.sqrt(Math.max(0, 1 - sn * sn)), 0.8) * (lw0 / 2) - 1.5 * u
            if (f > 2 * u) rl.push([-f, cy + yy, f, cy + yy])
          }
          segs(env, rl, rib, Math.max(1, 1.1 * u), 0.7 * o)
          rects(
            env,
            [
              [-lw0 * 0.27, cy - lh * 0.5, lw0 * 0.54, lh * 0.1],
              [-lw0 * 0.27, cy + lh * 0.4, lw0 * 0.54, lh * 0.1],
            ],
            cap,
            o,
          )
          const ch = lyricChar(env, p.i * 7 + 1)
          if (ch)
            env.draw({
              text: ch,
              font: serifF(env) === 'serif_light' ? 'serif_bold' : serifF(env),
              size: lw0 * 0.5,
              x: 0,
              y: cy + lw0 * 0.02,
              color: txtC,
              alpha: o * clamp((q - 0.35) / 0.4),
              ghost: false,
            })
          const ts: number[][] = []
          for (let k = -2; k <= 2; k++)
            ts.push([k * 2.4 * u, cy + lh * 0.5, k * 3.2 * u, cy + lh * 0.5 + lh * 0.24])
          segs(env, ts, body, Math.max(1, u), 0.85 * o)
          ctx.restore()
        })
      }),
    },

    /* 注連縄：横过空白带的扭转神绳，挂着之字形纸垂与草穗 */
    shimenawa: {
      layer: 'front',
      w: 0.6,
      tags: ['editorial', 'emotional', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc, ctx } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const gap = 30 * u
        const need0 = 210 * u
        const topRoom = bb.y0 - gap - m * 0.3
        const botRoom = H - m * 0.4 - bb.y1 - gap
        const top = P.low
          ? !(botRoom >= need0 * 0.7 || botRoom > topRoom)
          : topRoom >= need0 * 0.7 || topRoom >= botRoom
        const room = top ? topRoom : botRoom
        if (room < 60 * u) return
        const k = clamp(room / need0, 0.4, 1.15)
        const T0 = 17 * u * k
        const sag = 46 * u * k
        const shL = 112 * u * k
        const shW = shL * 0.17
        const ya = top ? m * 0.3 + T0 * 0.6 : bb.y1 + gap + T0 * 0.6
        const Y = (x: number) => ya + sag * 4 * (x / W) * (1 - x / W)
        const TK = (x: number) => T0 * (0.45 + 0.55 * Math.sin(Math.PI * clamp(x / W)))
        const e = E.inOutCubic(clamp(env.lt / 0.8))
        const half = (W / 2 + 12) * e
        const xa = W / 2 - half
        const xb = W / 2 + half
        const col = dark(env) ? sc.fg : sc.ink || sc.fg
        const lw = Math.max(1, 1.1 * u)
        // 绳身：斜切的扭束，束间留发丝宽的缝
        const step = T0 * 1.05
        const ph = (env.ltb * 5 * u) % step
        const twist: Pt[][] = []
        for (let x = -2 * step + ph; x < W + step; x += step) {
          if (x < xa - step * 0.5 || x > xb) continue
          const x0 = Math.max(xa, x)
          const x1 = Math.min(xb, x + step * 0.82)
          const sl = TK(x) * 0.7
          if (x1 - x0 < 1) continue
          twist.push([
            [x0, Y(x0) - TK(x0) / 2],
            [x1, Y(x1) - TK(x1) / 2],
            [x1 + sl, Y(x1) + TK(x1) / 2],
            [x0 + sl, Y(x0) + TK(x0) / 2],
          ])
        }
        polys(env, twist, col, 0.82 * o)
        const tp: Pt[] = []
        const bt: Pt[] = []
        for (let x = xa; x <= xb + 0.1; x += 8 * u) {
          tp.push([x, Y(x) - TK(x) / 2 - 1.5 * u])
          bt.push([x, Y(x) + TK(x) / 2 + 1.5 * u])
        }
        strokes(env, [tp, bt], col, lw, 0.45 * o)
        const ns = 3 + ((P.n | 0) % 2 ? 1 : 0)
        const paperC = dark(env) ? sc.fg : sc.bg
        for (let i = 0; i < ns; i++) {
          const x = (W * (i + 1)) / (ns + 1)
          const ex = Math.abs(x - W / 2) / (W / 2 + 12)
          if (e < ex) continue
          const qy = E.outBack(clamp((env.lt - 0.2 - ex * 0.5) / 0.45), 1.6)
          if (qy <= 0) continue
          const y = Y(x) + TK(x) / 2
          const sw = Math.sin(env.ltb * 1.4 + i * 1.7) * 3 * DEG
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(sw)
          ctx.scale(1, qy)
          const h = shL / 4
          const rs2: Pt[][] = []
          for (let s = 0; s < 4; s++) {
            const dx = (s % 2 ? shW * 0.62 : 0) - shW / 2
            const sk = (s % 2 ? -1 : 1) * shW * 0.18
            rs2.push([
              [dx, s * h],
              [dx + shW, s * h + sk * 0.3],
              [dx + shW + sk, (s + 1) * h + 0.5],
              [dx + sk, (s + 1) * h + 0.5 - sk * 0.3],
            ])
          }
          polys(env, rs2, paperC, 0.94 * o)
          if (!dark(env)) strokes(env, rs2, sc.fg, Math.max(1, u), 0.85 * o, false, { close: true })
          ctx.restore()
          if (i < ns - 1) {
            // 纸垂之间的草穗
            const tx = (W * (i + 1.5)) / (ns + 1)
            const ty = Y(tx) + TK(tx) / 2
            const tl = shL * 0.36 * E.outCubic(clamp((env.lt - 0.4) / 0.4))
            const t: number[][] = []
            for (let s = -4; s <= 4; s++)
              t.push([
                tx + s * 1.4 * u,
                ty,
                tx + s * 2 * u + Math.sin(env.ltb * 1.2 + i) * 2 * u,
                ty + tl * (1 - Math.abs(s) * 0.05),
              ])
            if (tl > 1) segs(env, t, sc.sub, Math.max(1, u), 0.85 * o)
          }
        }
      }),
    },

    /* 扇：带折痕的扇子展开（素面 / 红日 / 描金波带），出场时折回 */
    sensu: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'editorial', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.105, 62 * u, 124 * u)
        const r0 = R * 0.36
        const sp = spot(env, bb, R * 2.05, R * 1.2, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const tilt = (P.right ? 1 : -1) * (5 + P.r * 9)
        const px = sp.cx
        const py = sp.y + R * 1.12
        const open = E.outBack(clamp((env.lt - 0.05) / 0.65), 1.1) * (1 - 0.9 * E.inCubic(env.pOut))
        const spread = 12 + 140 * open
        const N = 14
        const v = (P.v | 0) % 3
        const ang = (i: number) => (-90 + tilt - spread / 2 + (spread * i) / N) * DEG
        const outer: Pt[] = []
        const inner: Pt[] = []
        const ribs: number[][] = []
        const folds: number[][] = []
        for (let i = 0; i <= N; i++) {
          const an = ang(i)
          const c = Math.cos(an)
          const s = Math.sin(an)
          const rr2 = R * (i % 2 ? 0.965 : 1)
          outer.push([px + c * rr2, py + s * rr2])
          inner.push([px + c * r0, py + s * r0])
          ribs.push([px + c * R * 0.06, py + s * R * 0.06, px + c * r0, py + s * r0])
          if (i > 0 && i < N) folds.push([px + c * r0, py + s * r0, px + c * rr2, py + s * rr2])
        }
        const leaf = outer.concat(inner.slice().reverse())
        const ac = ACC(env)
        polys(env, [leaf], ac, 0.13 * a)
        if (v === 1 && open > 0.6) {
          // 扇面上一轮红日
          const an = (-90 + tilt) * DEG
          const rc = (r0 + R) / 2
          dots(
            env,
            [
              [
                px + Math.cos(an) * rc,
                py + Math.sin(an) * rc,
                (R - r0) * 0.28 * clamp((open - 0.6) / 0.4),
              ],
            ],
            ac,
            0.9 * a,
          )
        } else if (v === 2) {
          // 顺着扇面的彩绘波带
          for (const f of [0.55, 0.72]) {
            const pts: Pt[] = []
            for (let i = 0; i <= 40; i++) {
              const an = ang((i * N) / 40)
              const rr2 = lerp(r0, R, f) + Math.sin((i / 40) * TAU * 2 + env.ltb) * 3 * u
              pts.push([px + Math.cos(an) * rr2, py + Math.sin(an) * rr2])
            }
            stroke(env, pts, ac, 2 * u, 0.8 * a)
          }
        }
        segs(env, folds, sc.fg, Math.max(1, 0.8 * u), 0.45 * a)
        segs(env, ribs, sc.fg, Math.max(1, 1.1 * u), 0.8 * a)
        stroke(env, outer, sc.fg, Math.max(1, 1.3 * u), 0.95 * a, false, { join: 'round' })
        stroke(env, inner, sc.fg, Math.max(1, 1.1 * u), 0.8 * a)
        segs(
          env,
          [
            [px, py, outer[0][0], outer[0][1]],
            [px, py, outer[N][0], outer[N][1]],
          ],
          sc.fg,
          Math.max(1, 1.6 * u),
          a,
        )
        env.circle(px, py, 4 * u, null, sc.fg, Math.max(1, u), a, false)
        env.circle(px, py, 1.6 * u, ac, null, 0, a, false)
      }),
    },

    /* 月に雲：满月或缺月加光晕环，一朵卷云缓缓横穿而过 */
    tsukiKumo: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'calm', 'editorial'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const Rm = clamp(Math.min(env.W, env.H) * 0.064, 40 * u, 84 * u)
        const bw0 = Rm * 4.6
        const bh0 = Rm * 2.9
        const sp = spot(env, bb, bw0, bh0, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const flip = sp.cx < env.W / 2 ? -1 : 1
        const mx = sp.cx + flip * Rm * 0.9
        const my = sp.y + Rm * 1.3
        const e = E.outCubic(clamp(env.lt / 0.6))
        const moonC = dark(env) ? sc.fg : ACC(env)
        const cres = (P.v | 0) % 2 === 1
        const rr2 = Rm * (0.85 + 0.15 * e)
        if (cres) {
          const pts = arcP(mx, my, rr2, 60, 300, 40)
          const k = 0.62
          const inner: Pt[] = []
          for (let i = 0; i <= 40; i++) {
            const an = (300 - (240 * i) / 40) * DEG
            inner.push([
              mx + rr2 * 0.42 + Math.cos(an) * rr2 * k * 1.12,
              my + Math.sin(an) * rr2 * 0.93,
            ])
          }
          polys(env, [pts.concat(inner)], moonC, 0.95 * a * e)
        } else dots(env, [[mx, my, rr2]], moonC, 0.95 * a * e)
        const e2 = E.inOutCubic(clamp((env.lt - 0.1) / 0.7))
        stroke(
          env,
          arcP(mx, my, Rm * 1.28, -90, -90 + 360 * e2, 80),
          sc.sub,
          Math.max(1, u),
          0.5 * a,
        )
        stroke(
          env,
          arcP(mx, my, Rm * 1.5, 90, 90 + 200 * e2, 60),
          sc.sub,
          Math.max(1, 0.8 * u),
          0.3 * a,
        )
        // 云横过月亮下半（用背景色填，所以是在前面穿过）
        const L = Rm * 3.3
        const hc = Rm * 0.7
        const drift = Math.sin(env.ltb * 0.5 + P.r * 6) * Rm * 0.35 - flip * (1 - e) * Rm * 1.4
        const x0 = mx - L * 0.55 + drift
        const yb = my + Rm * 0.62
        const cl = kumo(x0, yb, L, hc)
        const ce = E.inOutCubic(clamp((env.lt - 0.2) / 0.7))
        polys(env, [cl.outline], sc.bg, a * clamp(ce * 2))
        stroke(
          env,
          part(cl.outline.slice(0, -1), 0, ce),
          sc.fg,
          Math.max(1, 1.4 * u),
          0.9 * a,
          false,
          { join: 'round' },
        )
        stroke(env, part(cl.curl, 0, ce), sc.fg, Math.max(1, 1.4 * u), 0.9 * a, false, {
          cap: 'round',
          join: 'round',
        })
        const inner2 = cl.outline.slice(6, 40).map(([x, y]): Pt => [x, y + hc * 0.28])
        stroke(env, part(inner2, 0, ce), sc.sub, Math.max(1, u), 0.5 * a)
        const ce2 = E.inOutCubic(clamp((env.lt - 0.35) / 0.7))
        const L2c = L * 0.55
        const x2 = mx + flip * Rm * 0.2 - L2c / 2 - drift * 0.6
        const y2 = my - Rm * 0.9
        const c2 = kumo(x2, y2, L2c, hc * 0.55)
        stroke(
          env,
          part(c2.outline.slice(0, -1), 0, ce2),
          sc.sub,
          Math.max(1, 1.1 * u),
          0.7 * a,
          false,
          { join: 'round' },
        )
        stroke(env, part(c2.curl, 0, ce2), sc.sub, Math.max(1, 1.1 * u), 0.7 * a, false, {
          cap: 'round',
        })
      }),
    },

    /* 紅葉：几片枫叶摆着钟落下来（随摆动自转），避开歌词 */
    momiji: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'calm'],
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = 4 + (P.n | 0) + (P.big ? 1 : 0)
        const ac = ACC(env)
        const cols = [ac, mix(ac, sc.fg, 0.3), mix(ac, sc.bg, 0.3)]
        const vein = sc.bg
        for (let i = 0; i < N; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const q = E.outCubic(clamp((env.lt - rad(1) * 0.35) / 0.45))
          if (q <= 0) continue
          const L = (40 + rad(2) * 26) * u * (i === 0 ? 1.35 : 1)
          const v = (38 + rad(3) * 30) * u
          const om = 1.3 + rad(4) * 0.9
          const ph = rad(5) * TAU
          const span = H + L * 4
          const y = wrap(rad(6) * span + v * env.ltb, -L * 2, span)
          const x0 = (W * (i + 0.5)) / N + (rs(P.seed, i, 7) * W * 0.4) / N
          const A = (26 + rad(8) * 34) * u
          const s = Math.sin(env.ltb * om + ph)
          const x = x0 + A * s
          const yy = y - Math.abs(Math.cos(env.ltb * om + ph)) * A * 0.25
          const al = clearOf(bb, x, yy, 12 * u + L * 0.5, 30 * u)
          if (al <= 0.02) continue
          const rot = (rs(P.seed, i, 9) * 40 + s * 38) * DEG
          const fx = 0.55 + 0.45 * Math.abs(Math.cos(env.ltb * om * 0.5 + ph))
          const c = Math.cos(rot)
          const sn = Math.sin(rot)
          const T = ([px, py]: Pt): Pt => {
            const X = px * L * fx * q
            const Y = py * L * q
            return [x + X * c - Y * sn, yy + X * sn + Y * c]
          }
          const col = cols[i % 3]
          const a = 0.92 * o * al
          polys(env, [MAPLE.map(T)], col, a)
          const vs: number[][] = []
          const veins: readonly (readonly [number, number])[] = [
            [0, 0.82],
            [-42, 0.7],
            [42, 0.7],
            [-82, 0.5],
            [82, 0.5],
          ]
          for (const [ang, l] of veins) {
            const p0 = T([0, 0])
            const p1 = T([Math.sin(ang * DEG) * l, -Math.cos(ang * DEG) * l])
            vs.push([p0[0], p0[1], p1[0], p1[1]])
          }
          segs(env, vs, vein, Math.max(1, 0.9 * u), 0.45 * a)
          const s0 = T([0, 0.05])
          const s1 = T([0.06, 0.42])
          segs(env, [[s0[0], s0[1], s1[0], s1[1]]], col, Math.max(1, 1.4 * u), a, false, 'round')
        }
      },
    },

    /* 波頭：沿底边升起的一排卷浪（线稿 + 水纹 + 飞沫） */
    namiGashira: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'editorial', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const room = H - m * 0.6 - (bb.y1 + 26 * u)
        if (room < 34 * u) return
        const h = Math.min(Math.min(W, H) * 0.085, room * 0.72)
        const w = h * 2.3
        const e = E.outCubic(clamp(env.lt / 0.6))
        const sink = (1 - e) * h * 1.2 + E.inCubic(env.pOut) * h * 0.8
        const yb = H - m * 0.6 + sink
        const dir = P.right ? 1 : -1
        const off = wrap(env.ltb * 16 * u * dir, 0, w)
        const n = Math.ceil(W / w) + 2
        const col = sc.fg
        const lw = Math.max(1, 1.5 * u)
        const crest: Pt[][] = []
        const faces: Pt[][] = []
        const inner: Pt[][] = []
        const spray: number[][] = []
        const de = E.inOutCubic(clamp((env.lt - 0.05) / 0.8))
        for (let i = -1; i < n; i++) {
          const x = i * w + off - w * 0.5
          const hh = h * (0.82 + 0.18 * Math.sin(i * 1.7 + P.r * 6))
          const bob = Math.sin(env.ltb * 1.6 + i * 0.9) * h * 0.04
          const wc = waveCrest(x, yb + bob, w, hh)
          crest.push(part(wc.crest, 0, de))
          faces.push(part(wc.face, 0, de))
          inner.push(...wc.inner.map((p) => part(p, 0, de)))
          if (de > 0.8)
            for (let k = 0; k < 4; k++) {
              const tw = 0.5 + 0.5 * Math.sin(env.ltb * 5 + i * 3 + k * 2)
              spray.push([
                wc.top[0] + (k * 0.12 + 0.06) * w * 0.45,
                wc.top[1] - (k % 2 ? 0.1 : 0.2) * hh - k * 1.5 * u,
                (1.2 + 1.2 * tw) * u,
              ])
            }
        }
        strokes(env, crest, col, lw, 0.9 * o, false, { cap: 'round', join: 'round' })
        strokes(env, faces, col, lw, 0.9 * o, false, { cap: 'round' })
        strokes(env, inner, sc.sub, Math.max(1, u), 0.6 * o, false, { cap: 'round' })
        dots(env, spray, ACC(env), 0.9 * o * clamp((de - 0.8) / 0.2))
        segs(
          env,
          [[m * 0.5, yb + 3 * u, W - m * 0.5, yb + 3 * u]],
          sc.sub,
          Math.max(1, 0.8 * u),
          0.5 * o * de,
        )
      }),
    },

    /* 霞：层层すやり霞（圆头阶梯条）在歌词后漂移，边缘一道金线 */
    kasumi: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'emotional', 'editorial'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const n = 2 + ((P.n | 0) % 2)
        const hb = clamp(Math.min(W, H) * 0.046, 28 * u, 58 * u)
        const fill = sc.dim
        const line = ACC(env)
        const dk = dark(env)
        const fa = (dk ? 0.9 : 0.75) * o
        for (let k = 0; k < n; k++) {
          const rad = (i: number) => r(P.seed, k, i)
          const dir = (k + (P.right ? 1 : 0)) % 2 ? 1 : -1
          const e = E.outCubic(clamp((env.lt - k * 0.12) / 0.8))
          const Lm = W * (0.34 + rad(1) * 0.22)
          const yc = H * ((k + 0.5) / n) + (rad(2) - 0.5) * H * 0.16
          const xc =
            W * (0.5 + dir * (0.2 + rad(3) * 0.18)) +
            dir * (1 - e) * W * 0.25 +
            dir * env.ltb * 7 * u
          const Lu = Lm * (0.45 + rad(4) * 0.2)
          const xu = xc + (rad(5) < 0.5 ? -1 : 1) * Lm * 0.22
          const hu = hb * 0.8
          const Ld = Lm * (0.3 + rad(6) * 0.2)
          const xd = xc - (xu - xc) * 0.8
          ctx.save()
          ctx.globalAlpha = fa * e
          ctx.fillStyle = fill
          ctx.beginPath()
          rrPath(ctx, xc - Lm / 2, yc - hb / 2, Lm, hb, hb / 2)
          rrPath(ctx, xu - Lu / 2, yc - hb / 2 - hu + 1, Lu, hu + 2, hu / 2)
          if (rad(7) < 0.6) rrPath(ctx, xd - Ld / 2, yc + hb / 2 - 1, Ld, hu * 0.85 + 2, hu * 0.42)
          ctx.fill()
          ctx.restore()
          const lw = Math.max(1, 1.2 * u)
          const la = 0.75 * o * e
          const tl: Pt[] = [
            [xu - Lu / 2 + hu / 2, yc - hb / 2 - hu + 1],
            [xu + Lu / 2 - hu / 2, yc - hb / 2 - hu + 1],
          ]
          stroke(
            env,
            part(tl, 0, E.inOutCubic(clamp((env.lt - 0.3 - k * 0.12) / 0.6))),
            line,
            lw,
            la,
          )
          stroke(
            env,
            part(
              [
                [xc + Lm / 2 - hb / 2, yc + hb / 2],
                [xc - Lm / 2 + hb / 2, yc + hb / 2],
              ],
              0,
              E.inOutCubic(clamp((env.lt - 0.4 - k * 0.12) / 0.6)),
            ),
            line,
            lw,
            la * 0.7,
          )
        }
      },
    },

    /* ==================================================== 科幻 / HUD */

    /* 六角格子：一格格荡开的蜂巢，配扫描光带与随机点亮的格子 */
    hexGrid: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'graphic'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const rc = clamp(Math.min(env.W, env.H) * 0.021, 13 * u, 24 * u)
        const cols = 5 + (P.n | 0) + (P.big ? 1 : 0)
        const rows = 3 + ((P.v | 0) % 2)
        const dx = rc * 1.5
        const dy = rc * Math.sqrt(3)
        const fs = FS(env) * 0.72
        const w = (cols - 1) * dx + rc * 2
        const h = rows * dy + dy / 2 + fs * 1.8
        const sp = spot(env, bb, w, h, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const x0 = sp.x + rc
        const y0 = sp.y + fs * 1.8 + dy / 2
        const seedC = [Math.floor(P.r * cols), Math.floor(r(P.seed, 2) * rows)]
        const scan = ((env.ltb * 0.45 + P.r) % 1.4) * (w + 40 * u) - 20 * u
        const outl: Pt[][] = []
        const hot: Pt[][] = []
        const lit: Pt[][] = []
        const litA: Pt[][] = []
        const nl = 3 + (P.n | 0)
        const tick = Math.floor(env.ltb * 2.5)
        const litSet = new Set<number>()
        for (let k = 0; k < nl; k++) litSet.add(hash(P.seed, tick, k) % (cols * rows))
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            const cx = x0 + i * dx
            const cy = y0 + j * dy + (i % 2 ? dy / 2 : 0)
            const d = Math.hypot(i - seedC[0], j - seedC[1])
            const q = E.outBack(clamp((env.lt - d * 0.045) / 0.3), 1.6)
            if (q <= 0) continue
            const rad = rc * 0.88 * q
            const hx: Pt[] = []
            for (let k = 0; k <= 6; k++) {
              const an = k * 60 * DEG
              hx.push([cx + Math.cos(an) * rad, cy + Math.sin(an) * rad])
            }
            const near = Math.abs(cx - sp.x - scan) < rc * 1.2
            const edge = near ? hot : outl
            edge.push(hx)
            if (litSet.has(i * rows + j) && env.lt > 0.5) {
              const fill = r(P.seed, i, j, 4) < 0.5 ? lit : litA
              fill.push(hx.map(([px, py]): Pt => [cx + (px - cx) * 0.62, cy + (py - cy) * 0.62]))
            }
          }
        const lw = Math.max(1, u)
        strokes(env, outl, sc.sub, lw, 0.6 * a)
        strokes(env, hot, sc.fg, lw * 1.3, 0.95 * a)
        polys(env, lit, sc.fg, 0.5 * a)
        polys(env, litA, ACC(env), 0.9 * a)
        const le = inE(env, 0.3, 0.35)
        label(env, `SECTOR ${pad2((cut.line | 0) + 1)}`, sp.x, sp.y + fs * 0.5, {
          size: fs,
          alpha: a * le,
          track: 0.2,
        })
        label(env, `${pad2(litSet.size)}/${cols * rows}`, sp.x + w, sp.y + fs * 0.5, {
          size: fs,
          align: 'right',
          color: sc.fg,
          alpha: a * le,
        })
        segs(env, [[sp.x, sp.y + fs * 1.15, sp.x + w * le, sp.y + fs * 1.15]], sc.sub, lw, 0.5 * a)
      }),
    },

    /* 圆形频谱：一圈镜像对称的频谱条 + 下落的峰值点 */
    spectrumRing: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R0 = clamp(Math.min(env.W, env.H) * 0.052, 34 * u, 66 * u)
        const Lm = R0 * 0.95
        const sp = spot(env, bb, (R0 + Lm) * 2.1, (R0 + Lm) * 2.1, P, 18 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx
        const cy = sp.cy
        const N = 60
        const e = E.outExpo(clamp(env.lt / 0.5))
        const en = env.energy != null ? 0.35 + env.energy * 1.1 : 1
        const beat = env.beat ? Math.exp(-env.beat.since * 6) : 0.5 + 0.5 * Math.sin(env.ltb * 7)
        const rot = (P.r * 360 + env.ltb * 6) * DEG
        const bars: number[][] = []
        const hot: number[][] = []
        const peaks: number[][] = []
        for (let i = 0; i < N; i++) {
          if (i / N > e) break
          // 左右镜像
          const k = i < N / 2 ? i : N - 1 - i
          const f = k / (N / 2)
          const v = clamp(
            (0.55 + 0.45 * noise1(k * 0.5 + env.ltb * 5.5, P.seed)) *
              (1 - f * 0.55) *
              en *
              (0.75 + 0.35 * beat),
          )
          const an = rot + (i / N) * TAU
          const c = Math.cos(an)
          const s = Math.sin(an)
          const L = Lm * v * e
          const r1 = R0 + 3 * u + L
          const lane = v > 0.78 ? hot : bars
          lane.push([cx + c * (R0 + 3 * u), cy + s * (R0 + 3 * u), cx + c * r1, cy + s * r1])
          const pk =
            R0 +
            3 * u +
            Lm *
              clamp(
                0.25 +
                  0.7 *
                    (0.55 + 0.45 * noise1(k * 0.5 + (env.ltb - 0.25) * 5.5, P.seed)) *
                    (1 - f * 0.55) *
                    en,
              ) *
              e +
            5 * u
          if (i % 2 === 0)
            peaks.push([
              cx + c * Math.max(pk, r1 + 4 * u),
              cy + s * Math.max(pk, r1 + 4 * u),
              1.3 * u,
            ])
        }
        const bl = Math.max(1.4, Math.min(3.2 * u, ((TAU * R0) / N) * 0.55))
        segs(env, bars, sc.fg, bl, 0.85 * a)
        segs(env, hot, ACC(env), bl, a)
        dots(env, peaks, sc.sub, 0.8 * a)
        env.arc(cx, cy, R0, -90, -90 + 360 * e, sc.sub, Math.max(1, u), 0.7 * a, false)
        env.arc(
          cx,
          cy,
          R0 * 0.72,
          90,
          90 + 360 * inE(env, 0.5, 0.15),
          sc.sub,
          Math.max(1, 0.8 * u),
          0.4 * a,
          false,
        )
        const fs = R0 * 0.42
        label(env, pad2((cut.line | 0) + 1), cx, cy - fs * 0.1, {
          size: fs,
          align: 'center',
          color: sc.fg,
          alpha: a * inE(env, 0.3, 0.3),
          track: 0.04,
        })
        label(env, 'Hz', cx, cy + fs * 0.75, {
          size: fs * 0.42,
          align: 'center',
          alpha: a * inE(env, 0.3, 0.4),
          track: 0.2,
        })
      }),
    },

    /* 数据列：地址 / 字节 / 码位逐行上卷的小型内存面板，最新一行打旗标 */
    dataColumns: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'editorial', 'graphic'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fs = FS(env) * 0.9
        const rh = fs * 1.55
        const nR = 6 + (P.n | 0)
        const font = monoF(env)
        const chars = [...String(cut.text || '')].filter((c) => c.trim())
        const sample = '0x0000  00 00 00 00  U+0000'
        const w = textW(sample, font, fs, 0.06) + 22 * u
        const hwin = nR * rh
        const h = hwin + fs * 2.2
        const sp = spot(env, bb, w, h, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const x0 = sp.x + 14 * u
        const yTop = sp.y + fs * 2.2
        const e = E.outExpo(clamp(env.lt / 0.5))
        const vis = hwin * e
        const hexs = (n: number, k: number) =>
          (n >>> 0).toString(16).toUpperCase().padStart(k, '0').slice(-k)
        label(env, 'MEM', sp.x, sp.y + fs * 0.6, {
          size: fs,
          color: ACC(env),
          alpha: a * e,
          track: 0.2,
        })
        label(env, `LYRIC_${pad2((cut.line | 0) + 1)}`, sp.x + w, sp.y + fs * 0.6, {
          size: fs,
          align: 'right',
          alpha: a * e,
          track: 0.1,
        })
        segs(
          env,
          [[sp.x, sp.y + fs * 1.4, sp.x + w * e, sp.y + fs * 1.4]],
          sc.sub,
          Math.max(1, u),
          0.7 * a,
        )
        segs(env, [[sp.x, yTop, sp.x, yTop + vis]], sc.sub, Math.max(1, u), 0.5 * a)
        const speed = 2.6
        const off = env.ltb * speed
        const base = Math.floor(off)
        const frac = E.inOutCubic(clamp((off - base) * 2.5))
        ctx.save()
        ctx.beginPath()
        ctx.rect(sp.x - 2 * u, yTop, w + 4 * u, vis)
        ctx.clip()
        for (let k = -1; k <= nR; k++) {
          const n = base + k
          const y = yTop + (k + 1 - frac) * rh - rh * 0.5
          if (y < yTop - rh || y > yTop + vis + rh) continue
          const bytes = [0, 1, 2, 3].map((j) => hexs(hash(P.seed, n, j), 2)).join(' ')
          const ch = chars.length ? chars[((n % chars.length) + chars.length) % chars.length] : 'A'
          const txt = `0x${hexs(((hash(P.seed, 7) & 0xff) << 8) + n * 16, 4)}  ${bytes}  U+${hexs(ch.codePointAt(0) ?? 0, 4)}`
          const newest = k === nR - 1
          const age = (nR - 1 - k) / nR
          label(env, txt, x0, y, {
            size: fs,
            font,
            color: newest ? sc.fg : sc.sub,
            alpha: a * (newest ? 1 : 0.3 + 0.6 * (1 - age)),
            track: 0.06,
          })
          if (newest)
            polys(
              env,
              [
                [
                  [sp.x + 3 * u, y - 4 * u],
                  [sp.x + 9 * u, y],
                  [sp.x + 3 * u, y + 4 * u],
                ],
              ],
              ACC(env),
              a,
            )
        }
        ctx.restore()
      }),
    },

    /* 读取指示：三段式加载图标（刻度条 / 双弧 / 追点），最后落定成对勾 */
    spinner: {
      layer: 'front',
      w: 0.8,
      tags: ['glitch', 'pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.036, 22 * u, 44 * u)
        const fs = FS(env) * 0.95
        const font = monoF(env)
        const tw = textW('LOADING...', font, fs, 0.16)
        const w = R * 2 + 14 * u + tw
        const h = R * 2 + 4 * u
        const sp = spot(env, bb, w, h, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const left = sp.cx < env.W / 2 || !sp.ok
        const cx = left ? sp.x + R : sp.x + w - R
        const cy = sp.cy
        const tDone = clamp(cut.dur * 0.55, 0.9, 2.4)
        const done = clamp((env.lt - tDone) / 0.35)
        const e = E.outBack(clamp(env.lt / 0.35), 1.6)
        const v = (P.v | 0) % 3
        const lw = Math.max(1.4, 2.2 * u)
        const ac = ACC(env)
        const sa = a * (1 - done)
        if (sa > 0.01) {
          if (v === 0) {
            // 12 段轮转、逐级衰减
            const st = Math.floor(env.ltb * 12)
            const list: number[][][] = [[], [], []]
            for (let i = 0; i < 12; i++) {
              const k = (((st - i) % 12) + 12) % 12
              const an = i * 30 * DEG
              list[k < 2 ? 0 : k < 6 ? 1 : 2].push([
                cx + Math.cos(an) * R * 0.5 * e,
                cy + Math.sin(an) * R * 0.5 * e,
                cx + Math.cos(an) * R * e,
                cy + Math.sin(an) * R * e,
              ])
            }
            segs(env, list[0], sc.fg, lw, sa, false, 'round')
            segs(env, list[1], sc.fg, lw, 0.5 * sa, false, 'round')
            segs(env, list[2], sc.fg, lw, 0.18 * sa, false, 'round')
          } else if (v === 1) {
            // 两股反向旋转的弧
            const a1 = env.ltb * 300
            const a2 = -env.ltb * 200
            const sw = 90 + 60 * Math.sin(env.ltb * 4)
            env.arc(cx, cy, R * e, a1, a1 + sw, sc.fg, lw, sa, false)
            env.arc(cx, cy, R * 0.62 * e, a2, a2 + sw * 0.8, ac, lw, sa, false)
            env.circle(cx, cy, R * e, null, sc.sub, Math.max(1, 0.8 * u), 0.25 * sa, false)
          } else {
            // 大小递减的追点
            const d: number[][] = []
            for (let i = 0; i < 8; i++) {
              const an = (env.ltb * 280 - i * 26) * DEG
              d.push([
                cx + Math.cos(an) * R * 0.8 * e,
                cy + Math.sin(an) * R * 0.8 * e,
                (3.4 - i * 0.35) * u * e,
              ])
            }
            dots(env, d.slice(0, 1), ac, sa)
            dots(env, d.slice(1), sc.fg, 0.7 * sa)
          }
        }
        if (done > 0) {
          const de = E.outCubic(done)
          env.arc(cx, cy, R, -90, -90 + 360 * de, ac, lw, a, false)
          const ck: Pt[] = [
            [cx - R * 0.42, cy + R * 0.02],
            [cx - R * 0.1, cy + R * 0.32],
            [cx + R * 0.45, cy - R * 0.3],
          ]
          stroke(
            env,
            part(ck, 0, E.inOutCubic(clamp((env.lt - tDone - 0.15) / 0.3))),
            ac,
            lw,
            a,
            false,
            {
              cap: 'round',
              join: 'round',
            },
          )
        }
        const dotsN = Math.floor(env.ltb * 3) % 4
        const txt = done > 0.5 ? 'COMPLETE' : 'LOADING' + '.'.repeat(dotsN)
        const lx = left ? cx + R + 12 * u : cx - R - 12 * u - tw
        label(env, txt, lx, cy - fs * 0.35, {
          size: fs,
          font,
          color: done > 0.5 ? ac : sc.fg,
          alpha: a * inE(env, 0.3, 0.1),
          track: 0.16,
        })
        const pr =
          done > 0 ? 100 : Math.min(99, Math.floor(100 * (1 - Math.exp((-env.lt / tDone) * 2.2))))
        label(
          env,
          `${pad2(pr, 3)}%  ${String((env.lt * 1000) | 0).padStart(5, '0')}ms`,
          lx,
          cy + fs * 0.75,
          {
            size: fs * 0.72,
            font,
            alpha: a * 0.8 * inE(env, 0.3, 0.2),
            track: 0.1,
          },
        )
      }),
    },

    /* 方位胶带：滚动的罗盘刻度带 + 固定指针与读数框 */
    headingTape: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'graphic', 'editorial'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fs = FS(env) * 0.85
        const font = monoF(env)
        const gap = 22 * u
        let ht = fs * 1.4 + 16 * u + fs * 2.2
        const aboveRoom = bb.y0 - gap - m * 0.6
        const belowRoom = H - m * 0.6 - bb.y1 - gap
        let above = !P.low
        if (
          (above ? aboveRoom : belowRoom) < ht &&
          (above ? belowRoom : aboveRoom) > (above ? aboveRoom : belowRoom)
        )
          above = !above
        const room = above ? aboveRoom : belowRoom
        const compact = room < ht
        if (compact) ht = fs * 1.4 + 18 * u
        const yT = above
          ? Math.max(m * 0.6, bb.y0 - gap - ht - Math.max(0, (room - ht) * 0.35))
          : bb.y1 + gap + Math.max(0, (room - ht) * 0.35)
        const a = o * (room >= ht * 0.8 ? 1 : 0.35)
        const Wt = Math.min(W * 0.56, 620 * u, W - 2 * m)
        const cx = clamp((bb.x0 + bb.x1) / 2, m + Wt / 2, W - m - Wt / 2)
        const e = E.outExpo(clamp(env.lt / 0.55)) * (1 - 0.7 * E.inCubic(env.pOut))
        const half = (Wt / 2) * e
        const hdg =
          (((P.r * 360 +
            env.ltb * 7 * (P.right ? 1 : -1) +
            18 * Math.sin(env.ltb * 0.6 + P.r * 5)) %
            360) +
            360) %
          360
        const k = Wt / 100
        const base = yT + fs * 1.4 + 14 * u
        const lw = Math.max(1, u)
        const buckets: number[][][] = [[], [], []]
        const d0 = Math.ceil((hdg - 50) / 5) * 5
        for (let d = d0; d <= hdg + 50; d += 5) {
          const x = cx + (d - hdg) * k
          if (Math.abs(x - cx) > half) continue
          const f = Math.abs(x - cx) / (Wt / 2)
          const b = f < 0.5 ? 0 : f < 0.8 ? 1 : 2
          const L = (d % 15 === 0 ? 12 : 6) * u
          buckets[b].push([x, base, x, base - L])
          if (d % 15 === 0 && f < 0.92) {
            const dd = ((d % 360) + 360) % 360
            const lab = DIR_LABEL[dd] || pad2(dd, 3)
            label(env, lab, x, base - 12 * u - fs * 0.75, {
              size: fs,
              font,
              align: 'center',
              color: lab.length === 1 ? ACC(env) : sc.sub,
              alpha: a * (1 - f) * 1.2,
              track: 0.04,
            })
          }
        }
        buckets.forEach((l, b) => segs(env, l, sc.fg, lw, a * [0.9, 0.55, 0.22][b]))
        segs(env, [[cx - half, base, cx + half, base]], sc.sub, lw, 0.6 * a)
        const pw = 6 * u
        const py = base + 3 * u
        polys(
          env,
          [
            [
              [cx, py],
              [cx - pw, py + pw * 1.3],
              [cx + pw, py + pw * 1.3],
            ],
          ],
          ACC(env),
          a,
        )
        const txt = `${pad2(hdg, 3)}°`
        const tw = textW(txt, font, fs * 1.1, 0.08) + 14 * u
        const bh0 = fs * 1.6
        const bx = compact ? cx + half + 12 * u : cx - tw / 2
        const by = compact ? base - 6 * u - bh0 / 2 : py + pw * 1.3 + 4 * u
        const be = inE(env, 0.3, 0.25)
        rrStroke(env, bx, by, tw, bh0 * be, 2 * u, sc.fg, lw, a)
        if (be > 0.6)
          label(env, txt, bx + tw / 2, by + bh0 / 2, {
            size: fs * 1.1,
            font,
            align: 'center',
            color: sc.fg,
            alpha: a * clamp((be - 0.6) / 0.4),
            track: 0.08,
          })
        label(env, 'HDG', compact ? cx - half - 10 * u : bx - 8 * u, by + bh0 / 2, {
          size: fs * 0.72,
          font,
          align: 'right',
          alpha: a * be,
          track: 0.2,
        })
      }),
    },

    /* 文字锁定：HUD 取景角在歌词外缘的字与字之间跳换，留下已遍历的刻度 */
    glyphLock: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'graphic', 'editorial'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const gl = glyphLines(bb)
        const vert = gl.vert
        let A: GBox[]
        let B: GBox[]
        if (gl.lines.length) {
          A = gl.lines[0].g
          B = gl.lines[gl.lines.length - 1].g
        } else {
          const n = Math.max(
            1,
            Math.min(12, glyphCount(String(cut.text || '').replace(/\s+/g, '')) || 1),
          )
          const list: GBox[] = []
          for (let i = 0; i < n; i++)
            list.push(
              vert
                ? {
                    x0: bb.x0,
                    x1: bb.x1,
                    y0: lerp(bb.y0, bb.y1, i / n),
                    y1: lerp(bb.y0, bb.y1, (i + 1) / n),
                  }
                : {
                    x0: lerp(bb.x0, bb.x1, i / n),
                    x1: lerp(bb.x0, bb.x1, (i + 1) / n),
                    y0: bb.y0,
                    y1: bb.y1,
                  },
            )
          A = list
          B = list
        }
        const pad = 12 * u + (vert ? bw(bb) : bh(bb)) * 0.07
        const lw = Math.max(1.2, 1.9 * u)
        const ac = ACC(env)
        const hop = 0.34
        const t = Math.max(0, env.lt - 0.15)
        const k = Math.floor(t / hop)
        const f = E.outExpo(clamp((t - k * hop) / 0.16))
        const idx = (i: number, L: GBox[]) =>
          (((i + (hash(P.seed, 1) % 3)) % L.length) + L.length) % L.length
        const lerpBox = (L: GBox[], i: number): GBox => {
          const a = L[idx(i - 1, L)]
          const b = L[idx(i, L)]
          return k === 0
            ? b
            : {
                x0: lerp(a.x0, b.x0, f),
                x1: lerp(a.x1, b.x1, f),
                y0: lerp(a.y0, b.y0, f),
                y1: lerp(a.y1, b.y1, f),
              }
        }
        const e = E.outExpo(clamp(env.lt / 0.3))
        // 已遍历的刻度
        const tk: number[][] = []
        const nVis = Math.min(A.length, k + 1)
        for (let j = 0; j < nVis; j++) {
          const g = A[idx(j, A)]
          if (vert)
            tk.push([
              bb.x1 + pad * 0.45,
              (g.y0 + g.y1) / 2,
              bb.x1 + pad * 0.45 + 5 * u,
              (g.y0 + g.y1) / 2,
            ])
          else
            tk.push([
              (g.x0 + g.x1) / 2,
              bb.y0 - pad * 0.45,
              (g.x0 + g.x1) / 2,
              bb.y0 - pad * 0.45 - 5 * u,
            ])
        }
        segs(env, tk, sc.sub, Math.max(1, u), 0.6 * o)
        // side：-1 = 上/右边，1 = 下/左边
        const corners = (g: GBox, side: number): Pt[][] => {
          const s = (1 - e) * 10 * u
          const list: Pt[][] = []
          if (!vert) {
            const y = side < 0 ? bb.y0 - pad - s : bb.y1 + pad + s
            const dy = side < 0 ? 1 : -1
            const Lh = Math.min((g.x1 - g.x0) * 0.36, 22 * u)
            const Lv = pad * 0.8
            const x0 = g.x0 - 3 * u - s
            const x1 = g.x1 + 3 * u + s
            list.push(
              [
                [x0, y + dy * Lv],
                [x0, y],
                [x0 + Lh, y],
              ],
              [
                [x1 - Lh, y],
                [x1, y],
                [x1, y + dy * Lv],
              ],
            )
          } else {
            const x = side < 0 ? bb.x1 + pad + s : bb.x0 - pad - s
            const dx = side < 0 ? -1 : 1
            const Lh = Math.min((g.y1 - g.y0) * 0.36, 22 * u)
            const Lv = pad * 0.8
            const y0 = g.y0 - 3 * u - s
            const y1 = g.y1 + 3 * u + s
            list.push(
              [
                [x + dx * Lv, y0],
                [x, y0],
                [x, y0 + Lh],
              ],
              [
                [x, y1 - Lh],
                [x, y1],
                [x + dx * Lv, y1],
              ],
            )
          }
          return list
        }
        const ga = lerpBox(A, k)
        const gb = lerpBox(B, k + 2)
        strokes(env, corners(ga, -1), ac, lw, o * e)
        strokes(env, corners(gb, 1), sc.fg, lw, 0.8 * o * e)
        // 当前目标上的读数
        const fs = FS(env) * 0.9
        const ch = [...String(cut.text || '').replace(/\s+/g, '')][idx(k, A)] || ''
        const txt = `TGT ${pad2(idx(k, A) + 1)}/${pad2(A.length)}`
        const le = inE(env, 0.25, 0.2)
        if (!vert) {
          const lx = clamp((ga.x0 + ga.x1) / 2, m, W - m)
          const up = bb.y0 - pad - 14 * u - fs > m * 0.4
          const ly = up ? bb.y0 - pad - 10 * u - fs * 0.6 : bb.y1 + pad + 14 * u + fs * 0.6
          segs(
            env,
            [
              [
                lx,
                up ? bb.y0 - pad - 2 * u : bb.y1 + pad + 2 * u,
                lx,
                up ? ly + fs * 0.6 : ly - fs * 0.6,
              ],
            ],
            ac,
            Math.max(1, u),
            o * le,
          )
          label(env, txt, lx + 6 * u, ly, { size: fs, color: sc.fg, alpha: o * le, track: 0.12 })
          if (ch)
            label(env, ch, lx - 6 * u, ly, {
              size: fs * 1.1,
              font: bodyF(env),
              align: 'right',
              color: ac,
              alpha: o * le,
            })
        } else {
          const ly = clamp((ga.y0 + ga.y1) / 2, m, H - m)
          const right = bb.x1 + pad + 16 * u + textW(txt, monoF(env), fs, 0.12) < W - m * 0.4
          const lx = right ? bb.x1 + pad + 12 * u : bb.x0 - pad - 12 * u
          label(env, txt, lx, ly, {
            size: fs,
            color: sc.fg,
            align: right ? 'left' : 'right',
            alpha: o * le,
            track: 0.12,
          })
        }
      }),
    },

    /* 原子轨道：三条倾斜轨道绕一个小核，电子在核前 / 核后交替穿过 */
    atomOrbit: {
      layer: 'front',
      w: 0.8,
      tags: ['graphic', 'glitch', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.072, 46 * u, 92 * u)
        const fs = FS(env) * 0.75
        const sp = spot(env, bb, R * 2.3, R * 2.3 + fs * 1.6, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx
        const cy = sp.y + R * 1.15
        const ac = ACC(env)
        const lw = Math.max(1, 1.1 * u)
        const base = P.r * 180 + env.ltb * 5 * (P.right ? 1 : -1)
        const ry = R * 0.34
        const n = 3
        type Elec = { p: readonly [number, number, number]; tr: number[][]; k: number }
        const back: Elec[] = []
        const front: Elec[] = []
        for (let k = 0; k < n; k++) {
          const rot = (base + (k * 180) / n) * DEG
          const e = E.inOutCubic(clamp((env.lt - k * 0.07) / 0.45))
          stroke(env, ellP(cx, cy, R, ry, rot, 0, 360 * e, 80), sc.fg, lw, 0.55 * a)
          const w = (1.4 + k * 0.35) * (k % 2 ? -1 : 1)
          const ph = r(P.seed, k) * 360
          const pos = (t: number): readonly [number, number, number] => {
            const an = (ph + t * w * 90) * DEG
            const x = Math.cos(an) * R
            const y = Math.sin(an) * ry
            return [
              cx + x * Math.cos(rot) - y * Math.sin(rot),
              cy + x * Math.sin(rot) + y * Math.cos(rot),
              Math.sin(an),
            ]
          }
          if (e < 0.9) continue
          const p = pos(env.ltb)
          const tr: number[][] = []
          for (let j = 0; j < 8; j++) {
            const q0 = pos(env.ltb - j * 0.035)
            const q1 = pos(env.ltb - (j + 1) * 0.035)
            tr.push([q0[0], q0[1], q1[0], q1[1], 1 - j / 8])
          }
          const lane = p[2] < 0 ? back : front
          lane.push({ p, tr, k })
        }
        const drawE = ({ p, tr, k }: Elec) => {
          const dim = p[2] < 0 ? 0.45 : 1
          for (const s of tr)
            segs(
              env,
              [[s[0], s[1], s[2], s[3]]],
              k === 0 ? ac : sc.fg,
              2.2 * u * s[4],
              0.5 * s[4] * a * dim,
              false,
              'round',
            )
          env.circle(
            p[0],
            p[1],
            (p[2] < 0 ? 2.6 : 3.8) * u,
            k === 0 ? ac : sc.fg,
            null,
            0,
            a * dim,
            false,
          )
        }
        back.forEach(drawE)
        const q = E.outBack(clamp((env.lt - 0.1) / 0.35), 2)
        const pulse = 1 + 0.06 * Math.sin(env.ltb * 6)
        const nr = 5 * u * q * pulse
        dots(
          env,
          [
            [cx - nr * 0.6, cy - nr * 0.3, nr],
            [cx + nr * 0.6, cy + nr * 0.35, nr],
          ],
          ac,
          a,
        )
        dots(
          env,
          [
            [cx + nr * 0.5, cy - nr * 0.55, nr],
            [cx - nr * 0.5, cy + nr * 0.5, nr],
          ],
          sc.fg,
          a,
        )
        env.circle(cx, cy, nr * 2.6, null, sc.sub, Math.max(1, 0.8 * u), 0.5 * a * q, false)
        front.forEach(drawE)
        label(env, `ORB-${n}  e⁻${n}`, cx, cy + R * 1.15 + fs * 0.4, {
          size: fs,
          align: 'center',
          alpha: a * inE(env, 0.3, 0.5),
          track: 0.2,
        })
      }),
    },

    /* 音波：从歌词两侧（竖排时上下）随节拍向外扩散的弧 */
    sonarArcs: {
      layer: 'front',
      w: 0.9,
      tags: ['pop', 'emotional', 'graphic'],
      draw: settle((env, bb0, _P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        const roomH = Math.min(bb.x0, W - bb.x1) - m * 0.5
        const roomV = Math.min(bb.y0, H - bb.y1) - m * 0.5
        let vert = isVert(bb)
        if ((vert ? bh(bb) / H : bw(bb) / W) > 0.66 && (vert ? roomH : roomV) > 60 * u) vert = !vert
        const g0 = 16 * u + (vert ? bw(bb) : bh(bb)) * 0.04
        const sides: readonly (readonly [number, number, number, number])[] = vert
          ? [
              [cx, bb.y0 - g0, -90, bb.y0 - g0 - m * 0.5],
              [cx, bb.y1 + g0, 90, H - m * 0.5 - bb.y1 - g0],
            ]
          : [
              [bb.x0 - g0, cy, 180, bb.x0 - g0 - m * 0.5],
              [bb.x1 + g0, cy, 0, W - m * 0.5 - bb.x1 - g0],
            ]
        const len = env.beat ? env.beat.len : 0.62
        const since = env.beat ? env.beat.since : ((env.ltb % len) + len) % len
        const span = vert ? 40 : 34
        const e = E.outCubic(clamp(env.lt / 0.4))
        const ac = ACC(env)
        for (const [ex, ey, dir, room] of sides) {
          if (room < 30 * u) continue
          const rMax = Math.min(room, 190 * u)
          const r0 = 8 * u
          const lists: number[][][] = [[], [], []]
          for (let k = 0; k < 4; k++) {
            const p = (since + k * len) / (len * 4)
            if (p >= 1) continue
            const rr2 = lerp(r0, rMax, E.outCubic(p)) * e
            const al = Math.pow(1 - p, 1.3)
            lists[al > 0.66 ? 0 : al > 0.33 ? 1 : 2].push([
              ex,
              ey,
              rr2,
              (dir - span) * DEG,
              (dir + span) * DEG,
            ])
          }
          arcs(env, lists[0], ac, 2.4 * u, 0.95 * o, false, 'round')
          arcs(env, lists[1], sc.fg, 1.6 * u, 0.6 * o, false, 'round')
          arcs(env, lists[2], sc.fg, 1.1 * u, 0.3 * o, false, 'round')
          // 静止的内侧"喇叭"弧
          const st: number[][] = []
          for (let j = 1; j <= 2; j++)
            st.push([ex, ey, j * 7 * u * e, (dir - span * 1.2) * DEG, (dir + span * 1.2) * DEG])
          arcs(env, st, sc.sub, Math.max(1, 1.2 * u), 0.8 * o, false, 'round')
          env.circle(ex, ey, 2.2 * u * e, ac, null, 0, o, false)
        }
      }),
    },

    /* 回路：从屏幕边缘往歌词走 45° 折角的电路板走线，含焊盘、过孔与跑动的脉冲 */
    circuit: {
      layer: 'front',
      w: 0.9,
      tags: ['glitch', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const gap = 18 * u + Math.min(bw(bb), bh(bb)) * 0.05
        const rooms: Record<string, number> = {
          l: bb.x0 - gap,
          r: W - bb.x1 - gap,
          t: bb.y0 - gap,
          b: H - bb.y1 - gap,
        }
        let order = Object.keys(rooms).sort((a, b) => rooms[b] - rooms[a])
        const pref = P.right ? 'r' : 'l'
        if (rooms[pref] > 140 * u) order = [pref].concat(order.filter((s) => s !== pref))
        const sides = [order[0]]
        if (P.big && rooms[order[1]] > 140 * u) sides.push(order[1])
        const ac = ACC(env)
        const lw = Math.max(1, 1.3 * u)
        sides.forEach((side, si) => {
          const sEnd = rooms[side]
          if (sEnd < 70 * u) return
          const horiz = side === 'l' || side === 'r'
          const tc = horiz
            ? clamp((bb.y0 + bb.y1) / 2, 60 * u, H - 60 * u)
            : clamp((bb.x0 + bb.x1) / 2, 60 * u, W - 60 * u)
          const across = horiz ? bh(bb) : bw(bb)
          const n = 4 + ((P.n | 0) % 3)
          const pe = clamp(across / n, 10 * u, 22 * u)
          const ps = pe * (1.6 + P.r * 0.8)
          const M = (s: number, t: number): Pt =>
            side === 'l' ? [s, t] : side === 'r' ? [W - s, t] : side === 't' ? [t, s] : [t, H - s]
          const paths: Pt[][] = []
          const pads: Pt[] = []
          const vias: Pt[] = []
          for (let i = 0; i < n; i++) {
            const c = i - (n - 1) / 2
            const t0 = tc + c * ps + rs(P.seed, i, 1) * 3 * u
            const t1 = tc + c * pe
            const d = Math.abs(t1 - t0)
            const sm = sEnd * (0.45 + 0.15 * rs(P.seed, si, 2))
            const sa = Math.max(10 * u, sm - d / 2)
            const pts: Pt[] = [
              M(-6 * u, t0),
              M(sa, t0),
              M(sa + d, t1),
              M(sEnd - (i % 2 ? 14 * u : 0), t1),
            ]
            paths.push(pts)
            pads.push(pts[3])
            if (d > 3 * u) vias.push(pts[1])
          }
          const drawn: Pt[][] = []
          paths.forEach((p, i) => {
            const e = E.inOutCubic(clamp((env.lt - i * 0.06 - si * 0.1) / 0.6))
            drawn.push(part(p, 0, e))
          })
          strokes(env, drawn, sc.sub, lw, 0.85 * o, false, { join: 'miter' })
          const ea = inE(env, 0.3, 0.55)
          rings(
            env,
            pads.map((p) => [p[0], p[1], 4 * u * ea]),
            sc.fg,
            Math.max(1, 1.2 * u),
            o,
          )
          dots(
            env,
            pads.map((p) => [p[0], p[1], 1.6 * u * ea]),
            ac,
            o,
          )
          rings(
            env,
            vias.map((p) => [p[0], p[1], 2.6 * u * ea]),
            sc.sub,
            Math.max(1, u),
            0.8 * o,
          )
          // 沿线跑动的脉冲
          const pl: Pt[][] = []
          paths.forEach((p, i) => {
            const T = 1.3 + r(P.seed, i, 5) * 0.8
            const ph = ((env.ltb - 0.7 - r(P.seed, i, 6) * T) / T) % 1
            if (env.lt < 0.7 || ph < 0) return
            pl.push(part(p, Math.max(0, ph - 0.1), ph))
          })
          strokes(env, pl, ac, 2.4 * u, o, false, { cap: 'round' })
        })
      }),
    },

    /* ==================================================== 印刷 / 文具 */

    /* 色見本：用配色方案拼出的印厂色标条，实色压 50% 网，带色号与套准标记 */
    swatches: {
      layer: 'front',
      w: 0.9,
      tags: ['editorial', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const seen = new Set<string>()
        const cols: [string, string][] = []
        const src: readonly (readonly [string, string])[] = [
          [sc.accent, 'ACC'],
          [sc.accent2, 'AC2'],
          [sc.fg, 'FG'],
          [sc.sub, 'SUB'],
          [sc.ink, 'INK'],
          [sc.dim, 'DIM'],
        ]
        for (const [c, k] of src) {
          if (!c) continue
          const h = String(c).toUpperCase()
          if (seen.has(h)) continue
          seen.add(h)
          cols.push([c, k])
        }
        const sq = clamp(Math.min(env.W, env.H) * 0.037, 24 * u, 44 * u)
        const g = 2 * u
        const fs = FS(env) * 0.7
        const n = Math.min(6, cols.length)
        const w = n * (sq + g) + sq * 1.4
        const h = sq * 1.7 + fs * 3.4
        const sp = spot(env, bb, w, h, { ...P, low: P.low || P.corner }, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const x0 = sp.x
        const y0 = sp.y + fs * 1.6
        const lw = Math.max(1, u)
        label(env, `COLOR BAR  ${pad2(n)}`, x0, sp.y + fs * 0.6, {
          size: fs,
          alpha: a * inE(env, 0.3),
          track: 0.2,
        })
        for (let i = 0; i < n; i++) {
          const [c, k] = cols[i]
          const q = E.outExpo(clamp((env.lt - 0.05 - i * 0.06) / 0.35))
          if (q <= 0) continue
          const x = x0 + i * (sq + g)
          rects(env, [[x, y0, sq, sq * q]], c, a)
          const q2 = E.outExpo(clamp((env.lt - 0.25 - i * 0.06) / 0.35))
          rects(env, [[x, y0 + sq + g, sq, sq * 0.7 * q2]], mix(sc.bg, c, 0.5), a)
          if (contrast(c, sc.bg) < 1.3) rrStroke(env, x, y0, sq, sq * q, 0, sc.sub, lw, 0.6 * a)
          label(env, k, x + sq / 2, y0 + sq * 1.7 + g + fs * 0.9, {
            size: fs,
            align: 'center',
            alpha: a * q2,
            track: 0.05,
          })
          label(
            env,
            String(c).replace('#', '').toUpperCase().slice(0, 6),
            x + sq / 2,
            y0 + sq * 1.7 + g + fs * 2.1,
            {
              size: fs * 0.8,
              align: 'center',
              color: sc.fg,
              alpha: 0.8 * a * q2,
              track: 0,
            },
          )
        }
        // 色标末端的套准靶
        const e = inE(env, 0.4, 0.3)
        const rx = x0 + n * (sq + g) + sq * 0.7
        const ry = y0 + sq * 0.85
        const rr2 = sq * 0.42
        env.arc(rx, ry, rr2, -90, -90 + 360 * e, sc.fg, lw, a, false)
        segs(
          env,
          [
            [rx - rr2 * 1.5 * e, ry, rx + rr2 * 1.5 * e, ry],
            [rx, ry - rr2 * 1.5 * e, rx, ry + rr2 * 1.5 * e],
          ],
          sc.fg,
          lw,
          a,
        )
      }),
    },

    /* 線入りノート：歌词后面铺开淡淡的笔记本横线，一条红色版心线加日期抬头 */
    ruledLines: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['editorial', 'calm', 'emotional'],
      draw(env, _bb, P) {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const s = clamp(Math.min(W, H) * 0.078, 44 * u, 96 * u)
        const dk = dark(env)
        const lw = Math.max(1, 1.2 * u)
        const col = sc.sub
        const al = (dk ? 0.36 : 0.42) * o
        const dotted = (P.v | 0) % 2 === 1
        const y0 = s * 1.6 + (r(P.seed, 1) - 0.5) * s * 0.4
        const rows = Math.floor((H - y0) / s)
        const list: number[][] = []
        for (let i = 0; i <= rows && i < 40; i++) {
          const y = y0 + i * s
          const e = E.inOutCubic(clamp((env.lt - i * 0.025) / 0.6))
          if (e <= 0) continue
          if (dotted) dash(env, 0, y, W * e, y, 2 * u, 7 * u, col, lw * 1.4, al)
          else list.push([0, y, W * e, y])
        }
        segs(env, list, col, lw, al)
        const mx = P.right ? W - W * 0.09 : W * 0.09
        const me = E.inOutCubic(clamp((env.lt - 0.1) / 0.7))
        const mc = ACC(env)
        const ma = (dk ? 0.55 : 0.6) * o
        segs(env, [[mx, 0, mx, H * me]], mc, lw, ma)
        if ((P.v | 0) % 3 === 2)
          segs(
            env,
            [[mx + (P.right ? -5 : 5) * u, 0, mx + (P.right ? -5 : 5) * u, H * me]],
            mc,
            lw,
            ma * 0.7,
          )
        const fs = FS(env) * 0.95
        const he = inE(env, 0.4, 0.4)
        const hy = y0 - s * 0.35
        const hx = P.right ? W * 0.06 : W - W * 0.06
        const al2 = P.right ? 'left' : 'right'
        const dd = 1 + (hash(P.seed, 3) % 28)
        const mm = 1 + (hash(P.seed, 4) % 12)
        label(
          env,
          `No.  ${pad2((cut.line | 0) + 1)}      Date   ${pad2(mm)} . ${pad2(dd)}`,
          hx,
          hy,
          {
            size: fs,
            align: al2,
            alpha: 0.6 * o * he,
            track: 0.1,
          },
        )
      },
    },

    /* 見当合わせ：三色错开的套准靶，慢慢滑进完全套准 */
    registration: {
      layer: 'front',
      w: 0.8,
      tags: ['editorial', 'graphic', 'glitch'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.045, 28 * u, 56 * u)
        const fs = FS(env) * 0.72
        const sp = spot(env, bb, R * 3.2, R * 3.2 + fs * 2, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx
        const cy = sp.y + R * 1.6
        const lock = E.outExpo(clamp((env.lt - 0.05) / 0.9))
        const jit =
          env.lt > 1.2 && Math.floor(env.ltb / 1.7) !== Math.floor((env.ltb - 0.08) / 1.7)
            ? 2.5 * u
            : 0
        const D = 18 * u * (1 - lock) + jit
        const cols = [ACC(env), ACC2(env), sc.fg]
        const dirs: readonly (readonly [number, number])[] = [
          [-1, -0.6],
          [0.9, -0.5],
          [0.1, 1],
        ]
        const lw = Math.max(1, 1.3 * u)
        const e = E.outBack(clamp(env.lt / 0.35), 1.4)
        ctx.save()
        ctx.globalCompositeOperation = dark(env) ? 'screen' : 'multiply'
        cols.forEach((c, k) => {
          const x = cx + dirs[k][0] * D
          const y = cy + dirs[k][1] * D
          const rr2 = R * e
          env.circle(x, y, rr2 * 0.98, null, c, lw, 0.9 * a, false)
          env.circle(x, y, rr2 * 0.62, null, c, lw, 0.9 * a, false)
          segs(
            env,
            [
              [x - rr2 * 1.45, y, x + rr2 * 1.45, y],
              [x, y - rr2 * 1.45, x, y + rr2 * 1.45],
            ],
            c,
            lw,
            0.9 * a,
          )
          const pie = (a0: number): Pt[] => {
            const p: Pt[] = [[x, y]]
            for (let i = 0; i <= 8; i++) {
              const an = (a0 + (i * 90) / 8) * DEG
              p.push([x + Math.cos(an) * rr2 * 0.32, y + Math.sin(an) * rr2 * 0.32])
            }
            return p
          }
          polys(env, [pie(-90), pie(90)], c, 0.9 * a)
        })
        ctx.restore()
        const ok = lock > 0.985 && !jit
        const dx = D * 0.1
        const t = `ΔX ${(dirs[0][0] * dx).toFixed(2)}  ΔY ${(dirs[0][1] * dx).toFixed(2)}`
        const ly = cy + R * 1.6 + fs * 0.5
        label(env, ok ? 'REG  OK' : 'REG', cx - R * 1.5, ly, {
          size: fs,
          color: ok ? ACC(env) : sc.sub,
          alpha: a * inE(env, 0.3, 0.1),
          track: 0.2,
        })
        label(env, ok ? '±0.00mm' : t, cx + R * 1.5, ly, {
          size: fs,
          align: 'right',
          color: sc.fg,
          alpha: a * inE(env, 0.3, 0.1),
          track: 0.06,
        })
      }),
    },

    /* パンチ穴：沿一条干净的屏边逐个冲出的装订孔，带补强环与孔距标注 */
    punchHoles: {
      layer: 'front',
      w: 0.7,
      tags: ['editorial', 'calm', 'graphic'],
      draw(env, bb0, P) {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const rad = clamp(Math.min(W, H) * 0.016, 10 * u, 19 * u)
        const n = (P.v | 0) % 3 === 2 ? 3 : 2
        // 候选边：孔沿边排布、以边为中线
        const edges = (P.right ? ['r', 'l'] : ['l', 'r']).concat(P.low ? ['b', 't'] : ['t', 'b'])
        let pick: { ed: string; vertE: boolean; spc: number; c: number; mid: number } | null = null
        for (const ed of edges) {
          const vertE = ed === 'l' || ed === 'r'
          const L = vertE ? H : W
          const spc = Math.min(L * 0.3, 260 * u) * (n === 3 ? 0.8 : 1)
          const c =
            ed === 'l'
              ? m * 0.9 + rad
              : ed === 'r'
                ? W - m * 0.9 - rad
                : ed === 't'
                  ? m * 0.9 + rad
                  : H - m * 0.9 - rad
          const span = (spc * (n - 1)) / 2 + rad * 3
          const mid = vertE ? H / 2 : W / 2
          const box = vertE
            ? [c - rad * 5, mid - span, c + rad * 5, mid + span]
            : [mid - span, c - rad * 5, mid + span, c + rad * 5]
          if (!hitBB(box[0], box[1], box[2], box[3], bb, 6 * u)) {
            pick = { ed, vertE, spc, c, mid }
            break
          }
        }
        if (!pick) return
        const { ed, vertE, spc, c, mid } = pick
        const lw = Math.max(1, 1.2 * u)
        const inward = ed === 'r' || ed === 'b' ? -1 : 1
        const PP = (along: number, off: number): number[] =>
          vertE ? [c + inward * off, along] : [along, c + inward * off]
        const pos: number[] = []
        for (let i = 0; i < n; i++) pos.push(mid + (i - (n - 1) / 2) * spc)
        // 等歌词落定后再开始
        const t0 = Math.min(cut.inDur || 0, 0.6) * 0.9
        const lt = env.lt - t0
        if (lt <= 0) return
        const ge = E.inOutCubic(clamp(lt / 0.7))
        const Lh = (vertE ? H : W) * 0.5 * ge
        const g0 = PP(mid - Lh, rad * 3.4)
        const g1 = PP(mid + Lh, rad * 3.4)
        dash(env, g0[0], g0[1], g1[0], g1[1], 6 * u, 6 * u, sc.sub, lw, 0.5 * o)
        pos.forEach((al, i) => {
          const q = clamp((lt - 0.08 - i * 0.14) / 0.22)
          if (q <= 0) return
          const [x, y] = PP(al, 0)
          const s = 1 + 0.35 * (1 - E.outCubic(q))
          if ((P.v | 0) % 2 === 0)
            env.circle(x, y, rad * 1.85 * s, null, sc.sub, rad * 0.75, 0.18 * o * q, false)
          env.circle(x, y, rad * s, sc.dim, null, 0, 0.95 * o * q, false)
          env.circle(x, y, rad * s, null, sc.fg, lw, 0.9 * o * q, false)
          env.arc(x, y, rad * s * 0.76, 200, 290, sc.sub, 2 * u, 0.6 * o * q, false)
          if (q < 1) {
            const b: number[][] = []
            for (let k = 0; k < 6; k++) {
              const an = k * 60 * DEG + 0.3
              const d0 = rad * 1.3 + q * 8 * u
              b.push([
                x + Math.cos(an) * d0,
                y + Math.sin(an) * d0,
                x + Math.cos(an) * (d0 + 5 * u),
                y + Math.sin(an) * (d0 + 5 * u),
              ])
            }
            segs(env, b, ACC(env), lw, o * (1 - q))
          }
        })
        const de = E.outExpo(clamp((lt - 0.4) / 0.4))
        const fs = FS(env) * 0.72
        if (de > 0) {
          const a0 = pos[0]
          const a1 = pos[n - 1]
          const am = (a0 + a1) / 2
          const hl = ((a1 - a0) / 2) * de
          const gp = fs * 2.4
          const off = rad * 2.3
          const S = (al: number, d: number) => PP(al, off + d)
          const l1 = [S(am - hl, 0), S(am - gp, 0)]
          const l2 = [S(am + gp, 0), S(am + hl, 0)]
          segs(
            env,
            [
              [...l1[0], ...l1[1]],
              [...l2[0], ...l2[1]],
              [...S(a0, -3 * u), ...S(a0, 3 * u)],
              [...S(a1, -3 * u), ...S(a1, 3 * u)],
            ],
            sc.sub,
            lw,
            0.85 * o,
          )
          const lp = S(am, 0)
          label(env, `${n === 2 ? 80 : 108}mm`, lp[0], lp[1], {
            size: fs,
            align: 'center',
            rot: vertE ? -90 : 0,
            alpha: o * de,
            track: 0.1,
          })
        }
      },
    },

    /* ホチキス：把歌词当作订好的纸页：折角线、卷边，一枚斜着钉进去的订书钉 */
    staple: {
      layer: 'front',
      w: 0.7,
      tags: ['editorial', 'pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc, ctx } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const Ls = clamp(Math.min(W, H) * 0.058, 38 * u, 70 * u)
        const padP = Ls * 0.7 + 14 * u + bh(bb) * 0.04
        const sx = P.right ? 1 : -1
        const sy = P.low ? 1 : -1
        const X = clamp(sx < 0 ? bb.x0 - padP : bb.x1 + padP, m * 0.5, W - m * 0.5)
        const Y = clamp(sy < 0 ? bb.y0 - padP : bb.y1 + padP, m * 0.5, H - m * 0.5)
        const e = E.inOutCubic(clamp(env.lt / 0.5))
        const L = Math.min(Ls * 3.4, Math.max(bw(bb), bh(bb)) * 0.45)
        sheetCorner(env, X, Y, -sx, -sy, L, e, o)
        if ((P.v | 0) % 2 === 1) {
          // 对角卷边
          const X2 = sx < 0 ? bb.x1 + padP * 0.6 : bb.x0 - padP * 0.6
          const Y2 = sy < 0 ? bb.y1 + padP * 0.6 : bb.y0 - padP * 0.6
          const f = Ls * 0.7 * inE(env, 0.4, 0.3)
          if (X2 > m * 0.5 && X2 < W - m * 0.5 && Y2 > m * 0.5 && Y2 < H - m * 0.5 && f > 1) {
            stroke(
              env,
              [
                [X2 + sx * L * 0.7 * e, Y2],
                [X2 + sx * f, Y2],
                [X2, Y2 + sy * f],
                [X2, Y2 + sy * L * 0.7 * e],
              ],
              sc.sub,
              Math.max(1, u),
              0.8 * o,
            )
            stroke(
              env,
              [
                [X2 + sx * f, Y2],
                [X2 + sx * f, Y2 + sy * f],
                [X2, Y2 + sy * f],
              ],
              sc.sub,
              Math.max(1, u),
              0.55 * o,
            )
          }
        }
        const d = Ls * 0.3
        const cx = X - sx * d
        const cy = Y - sy * d
        const ang = sx * sy > 0 ? -45 : 45
        const q = clamp((env.lt - 0.3) / 0.18)
        if (q <= 0) return
        const s = 1 + 0.6 * (1 - E.outCubic(q))
        const al = o * clamp(q * 3)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((ang + (1 - q) * 14) * DEG)
        ctx.scale(s, s)
        const hl = Ls / 2
        const t = 2.6 * u
        rrFill(env, -hl + 2 * u, -t + 2.5 * u, Ls, t * 2, t, sc.sub, 0.3 * al)
        rrFill(env, -hl, -t, Ls, t * 2, t, sc.fg, 0.95 * al)
        segs(
          env,
          [[-hl + t * 1.5, -t * 0.3, hl - t * 1.5, -t * 0.3]],
          sc.bg,
          Math.max(1, 0.8 * u),
          0.45 * al,
        )
        rects(
          env,
          [
            [-hl - 1.5 * u, -t * 1.6, 3 * u, t * 3.2],
            [hl - 1.5 * u, -t * 1.6, 3 * u, t * 3.2],
          ],
          sc.fg,
          0.8 * al,
        )
        ctx.restore()
        if (q < 1) {
          // 钉下去瞬间的冲击短线
          const b: number[][] = []
          for (let i = 0; i < 4; i++) {
            const an = (ang + 90 + (i < 2 ? 0 : 180) + (i % 2 ? 28 : -28)) * DEG
            const d0 = 9 * u + q * 12 * u
            b.push([
              cx + Math.cos(an) * d0,
              cy + Math.sin(an) * d0,
              cx + Math.cos(an) * (d0 + 7 * u),
              cy + Math.sin(an) * (d0 + 7 * u),
            ])
          }
          segs(env, b, ACC(env), Math.max(1, 1.4 * u), o * (1 - q), false, 'round')
        }
      }),
    },

    /* クリップ：一笔画出的长尾夹钢丝，夹住歌词这张"纸"的上缘 */
    paperClip: {
      layer: 'front',
      w: 0.7,
      tags: ['editorial', 'pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const S = clamp(Math.min(W, H) * 0.035, 22 * u, 40 * u)
        const hc = S * 3.3
        const low = !!P.low && H - bb.y1 > hc * 1.2 + m
        const padP = hc * 0.42 + 10 * u + bh(bb) * 0.03
        const Y = low ? bb.y1 + padP : Math.max(m * 0.5 + hc * 0.55, bb.y0 - padP)
        const sy = low ? 1 : -1
        const sx = P.right ? 1 : -1
        const Xc = clamp(
          sx < 0 ? bb.x0 - 26 * u - bw(bb) * 0.02 : bb.x1 + 26 * u + bw(bb) * 0.02,
          m * 0.5,
          W - m * 0.5,
        )
        const e = E.inOutCubic(clamp(env.lt / 0.45))
        const L = Math.min(S * 7, Math.max(bw(bb) * 0.45, S * 4))
        sheetCorner(env, Xc, Y, -sx, -sy, L, e, o)
        const cx = clamp(Xc - sx * L * 0.42, m, W - m)
        const tilt = (sx * 7 + rs(P.seed, 1) * 5) * DEG
        const slide = (1 - E.outCubic(clamp((env.lt - 0.1) / 0.45))) * 24 * u
        const cy = Y + sy * (hc * 0.12) - sy * slide
        const pts = xf(low ? CLIP.map(([x, y]): Pt => [x, -y]) : CLIP, cx, cy, tilt, S)
        const de = E.inOutCubic(clamp((env.lt - 0.1) / 0.6))
        const wire = part(pts, 0, de)
        stroke(env, wire, sc.fg, Math.max(1.4, 2.1 * u), 0.95 * o, false, {
          cap: 'round',
          join: 'round',
        })
        stroke(
          env,
          wire.map(([x, y]): Pt => [x - 0.8 * u, y - 0.8 * u]),
          sc.bg,
          Math.max(1, 0.7 * u),
          0.35 * o,
          false,
          { cap: 'round', join: 'round' },
        )
      }),
    },

    /* 見出しタブ：从干净的屏边滑出来的分类标签，当前行的那枚用强调色探出 */
    indexTabs: {
      layer: 'front',
      w: 0.8,
      tags: ['editorial', 'pop', 'graphic'],
      draw(env, bb0, P) {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        // 等歌词落定
        const t0 = Math.min(cut.inDur || 0, 0.6) * 0.9
        const lt = env.lt - t0
        if (lt <= 0) return
        const n = 5
        const th = clamp(Math.min(W, H) * 0.066, 42 * u, 76 * u)
        const tw = th * 0.8
        const g = 6 * u
        const fs = FS(env) * 1.05
        const edges = (P.right ? ['r', 'l'] : ['l', 'r']).concat(['t', 'b'])
        const span = n * th + (n - 1) * g
        let pick: { ed: string; vertE: boolean; mid: number } | null = null
        for (const ed of edges) {
          const vertE = ed === 'l' || ed === 'r'
          const mid = vertE ? H * (P.low ? 0.58 : 0.42) : W / 2
          const depth = tw + 22 * u
          const box =
            ed === 'l'
              ? [0, mid - span / 2, depth, mid + span / 2]
              : ed === 'r'
                ? [W - depth, mid - span / 2, W, mid + span / 2]
                : ed === 't'
                  ? [mid - span / 2, 0, mid + span / 2, depth]
                  : [mid - span / 2, H - depth, mid + span / 2, H]
          if (
            (vertE ? H : W) > span + 40 * u &&
            !hitBB(box[0], box[1], box[2], box[3], bb, 26 * u)
          ) {
            pick = { ed, vertE, mid }
            break
          }
        }
        if (!pick) return
        const { ed, vertE, mid } = pick
        const cur = (((cut.line | 0) % n) + n) % n
        const labs = LAB_SETS[(P.v | 0) % 3]
        for (let i = 0; i < n; i++) {
          const q = E.outBack(clamp((lt - i * 0.06) / 0.35), 1.3)
          if (q <= 0) continue
          const isC = i === cur
          const d = (tw + (isC ? 16 * u : 0)) * q
          const along = mid - span / 2 + i * (th + g)
          let x: number, y: number, w: number, h: number
          if (ed === 'l') {
            x = -12 * u
            y = along
            w = d + 12 * u
            h = th
          } else if (ed === 'r') {
            x = W - d
            y = along
            w = d + 12 * u
            h = th
          } else if (ed === 't') {
            x = along
            y = -12 * u
            w = th
            h = d + 12 * u
          } else {
            x = along
            y = H - d
            w = th
            h = d + 12 * u
          }
          const col = isC ? ACC(env) : sc.dim
          rrFill(env, x, y, w, h, 6 * u, col, (isC ? 0.95 : 0.9) * o)
          if (!isC) rrStroke(env, x, y, w, h, 6 * u, sc.sub, Math.max(1, u), 0.7 * o)
          const tx = ed === 'l' ? d - tw * 0.5 : ed === 'r' ? W - d + tw * 0.5 : x + th / 2
          const ty = ed === 't' ? d - tw * 0.5 : ed === 'b' ? H - d + tw * 0.5 : y + th / 2
          const tc = isC ? (lum(col) > 0.55 ? '#000000' : sc.bg) : sc.fg
          label(env, labs[i], tx, ty, {
            size: fs * (labs[i].length > 1 ? 1 : 1.15),
            font: labs[i].length > 1 ? monoF(env) : bodyF(env),
            align: 'center',
            color: tc,
            alpha: o * clamp((q - 0.5) * 2),
            track: 0.04,
          })
        }
        // 贴着标签的"书页边"细线
        const ge = E.outExpo(clamp((lt - 0.1) / 0.5))
        const L = (vertE ? H : W) * 0.5 * ge
        const pe: Pt[] =
          ed === 'l'
            ? [
                [1.5 * u, mid - L],
                [1.5 * u, mid + L],
              ]
            : ed === 'r'
              ? [
                  [W - 1.5 * u, mid - L],
                  [W - 1.5 * u, mid + L],
                ]
              : ed === 't'
                ? [
                    [mid - L, 1.5 * u],
                    [mid + L, 1.5 * u],
                  ]
                : [
                    [mid - L, H - 1.5 * u],
                    [mid + L, H - 1.5 * u],
                  ]
        stroke(env, pe, sc.sub, Math.max(1, u), 0.5 * o)
      },
    },

    /* ==================================================== 自然 / 氛围 */

    /* 蔓：从屏幕角落长进来的藤蔓，边走边发芽吐卷须，停在歌词之前 */
    vines: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'calm', 'pop'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const nV = P.big ? 2 : 1
        const ac = ACC(env)
        const leafC = mix(ac, sc.fg, 0.15)
        for (let v = 0; v < nV; v++) {
          const sx = (P.right ? 1 : -1) * (v ? -1 : 1)
          const sy = (P.low ? 1 : -1) * (v ? -1 : 1)
          const x0 = sx > 0 ? W - W * 0.08 : W * 0.08
          const y0 = sy > 0 ? H + 4 * u : -4 * u
          let th = Math.atan2(-sy, -sx * 0.55)
          let x = x0
          let y = y0
          const step = 7 * u
          const Lmax = Math.min(W, H) * 0.62
          const pts: Pt[] = [[x, y]]
          const seed = P.seed + v * 17
          for (let s = 0; s < Lmax && pts.length < 200; s += step) {
            th += Math.sin(s / (90 * u) + (seed % 7)) * 0.05 + noise1(s / (60 * u), seed) * 0.03
            x += Math.cos(th) * step
            y += Math.sin(th) * step
            if (clearOf(bb, x, y, 22 * u, 1) < 1 || x < 4 || x > W - 4 || y < -8 || y > H + 8) break
            pts.push([x, y])
          }
          if (pts.length < 6) continue
          const e = E.outCubic(clamp((env.lt - v * 0.12) / 1.0))
          const sway = Math.sin(env.ltb * 0.9 + v) * 1.2 * DEG
          const T = xf(
            pts.map(([px, py]): Pt => [px - x0, py - y0]),
            x0,
            y0,
            sway,
          )
          const stem = part(T, 0, e)
          stroke(env, stem, sc.fg, Math.max(1.2, 1.7 * u), 0.9 * o, false, {
            cap: 'round',
            join: 'round',
          })
          const leaves: Pt[][] = []
          const curls: Pt[][] = []
          for (let k = 1; k < 12; k++) {
            const f = k / 12 + rs(seed, k, 1) * 0.02
            if (f > e) break
            const p = along(T, f)
            const side = k % 2 ? 1 : -1
            const grow = E.outBack(clamp((e - f) / 0.12), 1.8)
            if (k % 4 === 3) {
              // 卷曲的 tendrils
              const cp: Pt[] = []
              const an0 = p.ang + side * 1.2
              const R0 = 12 * u
              const cx = p.x + Math.cos(an0) * R0
              const cy = p.y + Math.sin(an0) * R0
              for (let i = 0; i <= 20; i++) {
                const t = i / 20
                const an = an0 + Math.PI + side * t * 8
                const rad = R0 * (1 - t * 0.85)
                cp.push([cx + Math.cos(an) * rad, cy + Math.sin(an) * rad])
              }
              curls.push(part(cp, 0, grow))
              continue
            }
            const Ll = (17 + r(seed, k, 2) * 12) * u * grow
            const an = p.ang + side * 0.95
            const c = Math.cos(an)
            const s = Math.sin(an)
            const leaf: Pt[] = []
            for (let i = 0; i <= 10; i++) {
              const t = i / 10
              leaf.push([t * Ll, Math.sin(t * Math.PI) * Ll * 0.3])
            }
            for (let i = 10; i >= 0; i--) {
              const t = i / 10
              leaf.push([t * Ll, -Math.sin(t * Math.PI) * Ll * 0.3])
            }
            leaves.push(leaf.map(([lx, ly]): Pt => [p.x + lx * c - ly * s, p.y + lx * s + ly * c]))
          }
          polys(env, leaves, leafC, 0.9 * o)
          strokes(env, curls, sc.fg, Math.max(1, 1.2 * u), 0.85 * o, false, {
            cap: 'round',
            join: 'round',
          })
          if (stem.length && e < 1) {
            const q = stem[stem.length - 1]
            env.circle(q[0], q[1], 2.4 * u, ac, null, 0, o, false)
          }
        }
      }),
    },

    /* 雲：圆并集勾出的积雨云线稿，在空白带里慢慢漂移 */
    cloudPuffs: {
      layer: 'front',
      w: 0.8,
      tags: ['calm', 'pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fr = freeRects(env, bb, 20 * u).filter(
          (rc) => rc.side === 't' || rc.side === 'b' || rc.h > rc.w,
        )
        if (!fr.length) return
        const reg = fr[0]
        const n = 2 + ((P.n | 0) % 2)
        for (let i = 0; i < n; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const Wc = Math.min(
            clamp(reg.w * 0.42 * (0.6 + 0.4 * rad(1)), 90 * u, 260 * u),
            reg.h / 0.56,
          )
          if (Wc < 50 * u) continue
          const q = E.outBack(clamp((env.lt - i * 0.12) / 0.45), 1.5)
          if (q <= 0) continue
          const Wq = Wc * (0.6 + 0.4 * q)
          const lane = (i + 0.5) / n
          const dir = (P.right ? 1 : -1) * (i % 2 ? -1 : 1)
          const cx = wrap(
            reg.x + reg.w * (lane + (rad(2) - 0.5) * 0.25) + dir * env.ltb * (6 + rad(3) * 8) * u,
            reg.x - Wc * 0.2,
            reg.w + Wc * 0.4,
          )
          const by =
            reg.y +
            Wc * 0.52 +
            Math.max(0, reg.h - Wc * 0.56) * rad(4) +
            Math.sin(env.ltb * 0.8 + i) * 2 * u
          if (cx - Wc * 0.6 < reg.x - Wc * 0.1 || cx + Wc * 0.6 > reg.x + reg.w + Wc * 0.1) continue
          const cl = cloudOutline(cx, by, Wq, P.seed + i)
          // 柔软的云体填充（单一路径，不叠 alpha）
          ctx.save()
          ctx.beginPath()
          ctx.rect(cx - Wq * 2, by - Wq * 2, Wq * 4, Wq * 2)
          ctx.clip()
          ctx.globalAlpha = 0.5 * o
          ctx.fillStyle = sc.dim
          ctx.beginPath()
          for (const [x, y, rr2] of cl.circles) {
            ctx.moveTo(x + rr2, y)
            ctx.arc(x, y, rr2, 0, TAU)
          }
          ctx.fill()
          ctx.restore()
          strokes(env, cl.runs, sc.fg, Math.max(1.2, 1.6 * u), 0.9 * o, false, {
            cap: 'round',
            join: 'round',
          })
          if (cl.base[0][0] < 1e8)
            stroke(env, cl.base, sc.fg, Math.max(1.2, 1.6 * u), 0.9 * o, false, { cap: 'round' })
          const c0 = cl.circles[2]
          stroke(
            env,
            arcP(c0[0] - c0[2] * 0.1, c0[1] + c0[2] * 0.12, c0[2] * 0.55, 200, 290, 16),
            sc.sub,
            Math.max(1, u),
            0.6 * o,
            false,
            { cap: 'round' },
          )
        }
      }),
    },

    /* 星空：歌词背后细密的眨眼星野，偶尔划过一颗流星 */
    starField: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'emotional'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const dk = dark(env)
        const col = dk ? sc.fg : sc.sub
        const k = dk ? 1 : 0.7
        const N = Math.min(160, 90 + (P.n | 0) * 25)
        const b: number[][][] = [[], [], []]
        const bright: number[][] = []
        for (let i = 0; i < N; i++) {
          const rad = (j: number) => r(P.seed, i, j)
          const f = clamp((env.lt - rad(1) * 0.5) / 0.3)
          if (f <= 0) continue
          const x = rad(2) * W
          const y = rad(3) * H
          const tw = 0.5 + 0.5 * Math.sin(env.ltb * (1.5 + rad(4) * 3) + rad(5) * 6)
          const lvl = rad(6) < 0.6 ? 0 : rad(6) < 0.9 ? 1 : 2
          b[lvl].push([x, y, [1.2, 1.9, 2.8][lvl] * u * (0.6 + 0.4 * tw) * f])
          if (lvl === 2 && rad(7) < 0.5) bright.push([x, y, tw * f])
        }
        dots(env, b[0], col, 0.45 * o * k)
        dots(env, b[1], col, 0.65 * o * k)
        dots(env, b[2], col, 0.9 * o * k)
        for (const [x, y, tw] of bright) {
          const L = (7 + 7 * tw) * u
          segs(
            env,
            [
              [x - L, y, x + L, y],
              [x, y - L, x, y + L],
            ],
            col,
            Math.max(1, 0.8 * u),
            0.5 * tw * o * k,
          )
        }
        // 流星
        const T = 2.4
        const ph = env.ltb - 0.6 - P.r * 0.8
        if (ph < 0) return
        const cyc = Math.floor(ph / T)
        const t = (ph - cyc * T) / 0.55
        if (t > 1) return
        const sx0 = W * rr(0.15, 0.85, P.seed, cyc, 1)
        const sy0 = H * rr(0.05, 0.4, P.seed, cyc, 2)
        const ang = (r(P.seed, cyc, 3) < 0.5 ? 25 : 155) * DEG
        const Ls = Math.min(W, H) * 0.35
        const hx = sx0 + Math.cos(ang) * Ls * E.outCubic(t)
        const hy = sy0 + Math.sin(ang) * Ls * E.outCubic(t)
        const tail = Ls * 0.35 * Math.sin(Math.PI * t)
        for (let s = 0; s < 6; s++) {
          const a0 = s / 6
          const a1 = (s + 1) / 6
          segs(
            env,
            [
              [
                hx - Math.cos(ang) * tail * a0,
                hy - Math.sin(ang) * tail * a0,
                hx - Math.cos(ang) * tail * a1,
                hy - Math.sin(ang) * tail * a1,
              ],
            ],
            col,
            1.4 * u * (1 - a0),
            0.8 * (1 - a0) * o * k,
            false,
            'round',
          )
        }
      },
    },

    /* 月龄：一排月相图标（朔 → 望 → 朔），当夜那枚被圈出并写 name */
    moonPhases: {
      layer: 'front',
      w: 0.8,
      tags: ['calm', 'emotional', 'editorial'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const n = 8
        const fs = FS(env) * 0.95
        let rad = clamp(Math.min(W, H) * 0.025, 14 * u, 27 * u)
        let dx = rad * 2.8
        if (dx * (n - 1) + rad * 2 > W - 2 * m) {
          dx = (W - 2 * m - rad * 2) / (n - 1)
          rad = Math.min(rad, dx / 2.6)
        }
        const w = dx * (n - 1) + rad * 2
        const h = rad * 2 + fs * 2.6
        const gap = 26 * u
        const above = P.low ? false : true
        let y0 = above ? bb.y0 - gap - h : bb.y1 + gap
        if (y0 < m * 0.6 || y0 + h > H - m * 0.6) y0 = above ? bb.y1 + gap : bb.y0 - gap - h
        let sp: { x: number; y: number; ok: boolean } = {
          x: clamp((bb.x0 + bb.x1) / 2 - w / 2, m, W - m - w),
          y: y0,
          ok: true,
        }
        if (y0 < m * 0.4 || y0 + h > H - m * 0.4) sp = spot(env, bb, w, h, P, gap)
        const a = o * (sp.ok ? 1 : 0.35)
        const cy = sp.y + rad
        const ac = ACC(env)
        const target = hash(cut.seed, 3) % n
        const sel = E.inOutCubic(clamp((env.lt - 0.25) / 0.7)) * target
        const outl: number[][] = []
        const lit: Pt[][] = []
        for (let k = 0; k < n; k++) {
          const q = E.outBack(clamp((env.lt - k * 0.05) / 0.3), 1.8)
          if (q <= 0) continue
          const cx = sp.x + rad + k * dx
          const rr2 = rad * q
          const p = k / n
          const f = (1 - Math.cos(p * TAU)) / 2
          const wax = p <= 0.5
          outl.push([cx, cy, rr2])
          if (f > 0.02) {
            const kx = 1 - 2 * f
            const pts: Pt[] = []
            for (let i = 0; i <= 16; i++) {
              const t = (-90 + (180 * i) / 16) * DEG
              pts.push([cx + (wax ? 1 : -1) * Math.cos(t) * rr2, cy + Math.sin(t) * rr2])
            }
            for (let i = 16; i >= 0; i--) {
              const t = (-90 + (180 * i) / 16) * DEG
              pts.push([cx + (wax ? 1 : -1) * kx * Math.cos(t) * rr2, cy + Math.sin(t) * rr2])
            }
            lit.push(pts)
          }
        }
        rings(env, outl, sc.sub, Math.max(1, u), 0.8 * a)
        polys(env, lit, sc.fg, 0.92 * a)
        const hx = sp.x + rad + sel * dx
        env.circle(
          hx,
          cy,
          rad * 1.45,
          null,
          ac,
          Math.max(1.2, 1.6 * u),
          a * inE(env, 0.3, 0.2),
          false,
        )
        segs(
          env,
          [[sp.x, cy + rad * 1.8, sp.x + w * inE(env, 0.5, 0.1), cy + rad * 1.8]],
          sc.sub,
          Math.max(1, u),
          0.5 * a,
        )
        segs(
          env,
          [[hx, cy + rad * 1.8 - 3 * u, hx, cy + rad * 1.8 + 3 * u]],
          ac,
          Math.max(1, 1.4 * u),
          a,
        )
        const done = clamp((env.lt - 0.9) / 0.3)
        label(env, MOON_NAMES[Math.round(sel)], hx, cy + rad * 1.8 + fs * 1.1, {
          font: serifF(env),
          size: fs,
          align: 'center',
          color: sc.fg,
          alpha: a * (0.5 + 0.5 * done),
          track: 0.2,
        })
      }),
    },

    /* 陽射し：从角落（或底边）缓缓转出的淡光楔，铺在歌词之后 */
    sunRays: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['emotional', 'pop', 'calm'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const bottom = (P.v | 0) % 3 === 2
        const cx = bottom ? W / 2 : P.right ? W + W * 0.02 : -W * 0.02
        const cy = bottom ? H + H * 0.08 : P.low ? H + H * 0.03 : -H * 0.03
        const N = 16 + (P.n | 0) * 4
        const R = Math.hypot(W, H) * 1.05
        const e = E.outCubic(clamp(env.lt / 0.8))
        const rot = (P.r * 30 + env.ltb * 2.2 * (P.right ? -1 : 1)) * DEG
        const list: Pt[][] = []
        for (let i = 0; i < N; i++) {
          const a0 = rot + (i / N) * TAU
          const a1 = a0 + (TAU / N) * 0.5
          list.push([
            [cx, cy],
            [cx + Math.cos(a0) * R * e, cy + Math.sin(a0) * R * e],
            [cx + Math.cos(a1) * R * e, cy + Math.sin(a1) * R * e],
          ])
        }
        const dk = dark(env)
        polys(
          env,
          list,
          P.accent ? ACC(env) : sc.dim,
          (P.accent ? (dk ? 0.07 : 0.09) : dk ? 0.45 : 0.6) * o,
        )
        const R0 = Math.min(W, H) * 0.13 * E.outBack(clamp(env.lt / 0.5), 1.4)
        const ac = ACC(env)
        env.circle(cx, cy, R0, null, ac, Math.max(1, 1.4 * u), 0.5 * o, false)
        env.circle(cx, cy, R0 * 1.18, null, ac, Math.max(1, u), 0.25 * o, false)
        dots(env, [[cx, cy, R0 * 0.8]], ac, 0.12 * o)
      },
    },

    /* 雨の波紋：下半屏一片"地面"，雨点落下炸开透视椭圆波纹（歌词之下） */
    rainRipples: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'emotional'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env) * inE(env, 0.4, 0, E.outCubic)
        if (o <= 0.003) return
        const dk = dark(env)
        const col = dk ? sc.fg : sc.sub
        const k = dk ? 0.55 : 0.6
        const N = 9 + (P.n | 0) * 3
        const y0 = H * 0.6
        const y1 = H * 0.97
        const b: Pt[][][] = [[], [], []]
        const drops: number[][] = []
        for (let i = 0; i < N; i++) {
          const T = 1.5 + r(P.seed, i, 1) * 0.9
          const t = env.ltb + r(P.seed, i, 2) * T
          const cyc = Math.floor(t / T)
          const tau = t - cyc * T - 0.22
          const x = W * rr(0.03, 0.97, P.seed, i, cyc, 3)
          const f = r(P.seed, i, cyc, 4)
          const y = lerp(y0, y1, f * f * 0.3 + f * 0.7)
          const depth = 0.45 + (0.55 * (y - y0)) / (y1 - y0)
          const Rm = (70 + r(P.seed, i, cyc, 5) * 90) * u * depth
          if (tau < 0) {
            const q = 1 + tau / 0.22
            const L = 26 * u * depth
            drops.push([x, y - (1 - q) * H * 0.18 - L, x, y - (1 - q) * H * 0.18])
            continue
          }
          for (let j = 0; j < 3; j++) {
            const tj = (tau - j * 0.14) / 1.1
            if (tj <= 0 || tj >= 1) continue
            const rr2 = Rm * E.outCubic(tj) * (1 - j * 0.18)
            const al = Math.pow(1 - tj, 1.4)
            b[al > 0.6 ? 0 : al > 0.3 ? 1 : 2].push(
              ellP(x, y, rr2, rr2 * 0.26 * (0.8 + 0.4 * depth), 0, 0, 360, 36),
            )
          }
        }
        const lw = Math.max(1, 1.1 * u)
        strokes(env, b[0], col, lw, 0.8 * o * k)
        strokes(env, b[1], col, lw, 0.5 * o * k)
        strokes(env, b[2], col, lw, 0.22 * o * k)
        segs(env, drops, col, lw, 0.6 * o * k, false, 'round')
      },
    },

    /* シャボン玉：上升摆动的肥皂泡；要飘到歌词底下的会先破掉 */
    bubbles: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'emotional', 'calm'],
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = Math.min(14, 7 + (P.n | 0) * 2)
        const iri = ACC2(env)
        const pad = 10 * u
        const outl: Pt[][] = []
        const hi: Pt[][] = []
        const irid: Pt[][] = []
        const glints: number[][] = []
        const pops: number[][] = []
        for (let i = 0; i < N; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const born = rad(9) < 0.4 && bb.y0 - pad - 30 * u > m
          const Tc = born ? 2.2 + rad(1) * 1.2 : 3.4 + rad(1) * 1.6
          const t = born ? env.ltb - 0.1 - rad(2) * 1.4 : env.ltb + rad(2) * Tc
          if (t < 0) continue
          const cyc = Math.floor(t / Tc)
          const tau = t - cyc * Tc
          const rc = (k: number) => r(P.seed, i, cyc, k)
          const R = (14 + rc(3) * rc(3) * 30) * u * (born ? 0.8 : 1)
          const v = (born ? 45 + rc(4) * 40 : 60 + rc(4) * 60) * u
          const x0 = born ? lerp(bb.x0 + R, bb.x1 - R, rc(5)) : m + (W - 2 * m) * rc(5)
          const y0 = born ? bb.y0 - pad - R : H + R + 10 * u
          let life = born ? Math.min(Tc - 0.3, (y0 + R) / v) : 2.2 + rc(6) * (Tc - 2.6)
          const x = x0 + Math.sin(tau * 1.4 + rc(7) * 6) * 16 * u * (born ? Math.min(1, tau) : 1)
          const over = x0 + R + 16 * u > bb.x0 - pad && x0 - R - 16 * u < bb.x1 + pad
          if (!born && over && y0 > bb.y1) life = Math.min(life, (y0 - (bb.y1 + pad + R)) / v)
          const y = y0 - v * Math.min(tau, life)
          const inflate = born
            ? E.outBack(clamp(tau / 0.45), 1.6)
            : E.outBack(clamp(env.lt / 0.35 + (cyc > 0 || rad(2) * Tc > 0.4 ? 1 : 0)), 1.6)
          if (tau < life) {
            if (clearOf(bb, x, y, pad * 0.5 + R, 1) < 1) continue
            const wob = Math.sin(tau * 5 + i) * 0.05
            const rx = R * (1 + wob) * inflate
            const ry = R * (1 - wob) * inflate
            outl.push(ellP(x, y, rx, ry, 0, 0, 360, 32))
            irid.push(ellP(x, y, rx * 0.8, ry * 0.8, 0, 200, 262, 10))
            hi.push(ellP(x, y, rx * 0.8, ry * 0.8, 0, 292, 330, 8))
            glints.push([x - rx * 0.36, y - ry * 0.44, 1.6 * u * inflate])
          } else if (tau < life + 0.24) {
            const q = (tau - life) / 0.24
            const d0 = R * (1 + q * 0.6)
            for (let k = 0; k < 8; k++) {
              const an = k * 45 * DEG + i
              pops.push([
                x + Math.cos(an) * d0,
                y + Math.sin(an) * d0,
                x + Math.cos(an) * (d0 + 5 * u * (1 - q)),
                y + Math.sin(an) * (d0 + 5 * u * (1 - q)),
                1 - q,
              ])
            }
          }
        }
        const lw = Math.max(1, 1.2 * u)
        strokes(env, outl, sc.fg, lw, 0.7 * o)
        strokes(env, irid, iri, 1.8 * u, 0.8 * o, false, { cap: 'round' })
        strokes(env, hi, sc.fg, 1.6 * u, 0.7 * o, false, { cap: 'round' })
        dots(env, glints, sc.fg, 0.9 * o)
        for (const p of pops) segs(env, [p.slice(0, 4)], sc.fg, lw, p[4] * 0.9 * o, false, 'round')
      },
    },

    /* 煙：向上扭动的细烟丝（可选一支点着的线香，顶端发红），在歌词之下 */
    smoke: {
      layer: 'back',
      subtle: true,
      w: 0.8,
      tags: ['calm', 'emotional', 'editorial'],
      draw(env, _bb, P) {
        if (env.pass !== 'main' || env.lt < 0) return
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003) return
        const incense = (P.v | 0) % 2 === 1
        const dk = dark(env)
        const col = dk ? sc.fg : sc.sub
        const k = dk ? 0.5 : 0.6
        const nW = incense ? 1 : 2 + ((P.n | 0) % 2)
        const Hs = H * 0.72 * E.outCubic(clamp(env.lt / 1.0))
        for (let w = 0; w < nW; w++) {
          const xb = incense
            ? P.right
              ? W - W * 0.12
              : W * 0.12
            : W * rr(0.15, 0.85, P.seed, w, 1)
          const yb = incense ? H - m - 90 * u : H + 10 * u
          const seed = P.seed + w * 31
          if (incense && w === 0) {
            segs(env, [[xb, yb, xb + 1.5 * u, H - m * 0.4]], sc.sub, 2 * u, 0.8 * o)
            const gl = 0.7 + 0.3 * Math.sin(env.ltb * 7)
            dots(env, [[xb, yb, 6 * u]], ACC(env), 0.15 * o * gl)
            dots(env, [[xb, yb, 2.4 * u]], ACC(env), o)
          }
          for (let s = 0; s < 4; s++) {
            const pts: Pt[] = []
            const sp = s - 1.5
            for (let d = 0; d <= Hs; d += 8 * u) {
              const A = 6 * u + d * 0.17
              const x =
                xb +
                sp * d * 0.035 +
                noise1(d / (130 * u) - env.ltb * 0.8 + s * 0.45, seed) * A +
                Math.sin(d / (75 * u) - env.ltb * 1.5 + s * 0.8) * A * 0.4
              pts.push([x, yb - d])
            }
            const n = pts.length
            if (n < 3) continue
            for (let q = 0; q < 4; q++) {
              const seg = pts.slice(Math.floor((n * q) / 4), Math.floor((n * (q + 1)) / 4) + 1)
              stroke(
                env,
                seg,
                col,
                (1.7 - s * 0.25) * u,
                (0.6 - q * 0.13) * (1 - s * 0.18) * o * k,
                false,
                {
                  cap: 'round',
                  join: 'round',
                },
              )
            }
          }
        }
      },
    },

    /* 綿毛：乘风飘走的蒲公英种子（茎 + 伞状细丝），可从一团绒球上一把把摘下 */
    dandelion: {
      layer: 'front',
      w: 0.8,
      tags: ['calm', 'emotional'],
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const dir = P.right ? 1 : -1
        const N = 6 + (P.n | 0) * 2 + (P.big ? 3 : 0)
        const lw = Math.max(1, 0.9 * u)
        const lines: number[][] = []
        const tips: number[][] = []
        const bodies: number[][] = []
        const seedShape = (x: number, y: number, s: number, rot: number) => {
          const c = Math.cos(rot)
          const sn = Math.sin(rot)
          const T = (px: number, py: number): Pt => [
            x + (px * c - py * sn) * s,
            y + (px * sn + py * c) * s,
          ]
          const top = T(0, -24 * u)
          const bot = T(0, 2 * u)
          lines.push([bot[0], bot[1], top[0], top[1]])
          for (let k = 0; k < 13; k++) {
            const an = (-90 + (k - 6) * 14) * DEG
            const L = 17 * u
            const p = T(Math.cos(an) * L, -24 * u + Math.sin(an) * L * 0.75)
            lines.push([top[0], top[1], p[0], p[1]])
            tips.push([p[0], p[1], 1.1 * u * s])
          }
          const b0 = T(0, 2 * u)
          const b1 = T(0, 10 * u)
          bodies.push([b0[0], b0[1], b1[0], b1[1]])
        }
        const puff = !!P.big
        const px = P.right ? W * 0.1 : W * 0.9
        const py = H - m - H * 0.16
        for (let i = 0; i < N; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const q = E.outCubic(clamp((env.lt - rad(1) * 0.35) / 0.4))
          if (q <= 0) continue
          const v = (40 + rad(2) * 50) * u
          const span = W + 120 * u
          const t = env.ltb
          let x: number, y: number
          if (puff) {
            // 一颗颗脱离，沿风向被拉成一串
            const T = (W * 0.9) / v
            const age = wrap(t + rad(4) * T, 0, T)
            x = px + dir * v * age
            y =
              py -
              v * 0.38 * age +
              Math.sin(t * (1 + rad(7)) + rad(8) * 6) * 14 * u * Math.min(1, age)
            if (age < 0.15) continue
          } else {
            x = wrap(rad(3) * W + dir * v * (t + rad(4) * 8), -60 * u, span)
            y = wrap(
              H * (0.12 + 0.76 * rad(5)) -
                (18 + rad(6) * 20) * u * t +
                Math.sin(t * (1 + rad(7)) + rad(8) * 6) * 18 * u,
              -40 * u,
              H + 80 * u,
            )
          }
          const al = clearOf(bb, x, y, 14 * u, 26 * u)
          if (al < 0.6) continue
          seedShape(x, y, (0.8 + rad(9) * 0.5) * q, (dir * 12 + Math.sin(t * 1.2 + i) * 18) * DEG)
        }
        if (puff) {
          // 种子来源的那团绒球
          const e = E.outCubic(clamp(env.lt / 0.5))
          const R = 30 * u * e
          const st: Pt[] = []
          for (let k = 0; k <= 12; k++) {
            const f = k / 12
            st.push([
              px + Math.sin(f * 2) * 8 * u * (P.right ? -1 : 1),
              H + 4 * u - (H + 4 * u - py) * f * e,
            ])
          }
          stroke(env, st, sc.sub, 1.6 * u, 0.9 * o, false, { cap: 'round' })
          for (let k = 0; k < 30; k++) {
            if (r(P.seed, k, 44) < 0.25) continue
            const an = (k / 30) * TAU
            const x1 = px + Math.cos(an) * R
            const y1 = py + Math.sin(an) * R
            lines.push([px, py, x1, y1])
            tips.push([x1, y1, 1.3 * u])
          }
          dots(env, [[px, py, 4 * u * e]], sc.sub, o)
        }
        segs(env, lines, sc.fg, lw, 0.7 * o)
        dots(env, tips, sc.fg, 0.8 * o)
        segs(env, bodies, ACC(env), 2.2 * u, 0.9 * o, false, 'round')
      },
    },

    /* 蛍：绕着歌词游走的萤火虫，明灭之间带柔光晕与淡尾迹 */
    fireflies: {
      layer: 'front',
      w: 0.8,
      tags: ['emotional', 'calm'],
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const col = dark(env) ? [ACC2(env), ACC(env)].sort((a, b) => lum(b) - lum(a))[0] : ACC(env)
        const N = Math.min(16, 9 + (P.n | 0) * 2)
        const halo: number[][][] = [[], []]
        const core: number[][] = []
        const trails: number[][] = []
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        for (let i = 0; i < N; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const f = clamp((env.lt - rad(1) * 0.4) / 0.4)
          if (f <= 0) continue
          const pos = (t: number): Pt => {
            const th = rad(2) * TAU + noise1(t * 0.18 + i * 3.1, P.seed) * 1.6
            const rr2 = 0.55 + 0.45 * rad(3) + 0.12 * noise1(t * 0.3 + i * 5.3, P.seed + 1)
            return [
              clamp(cx + Math.cos(th) * (W * 0.5 - m) * rr2, m * 0.5, W - m * 0.5),
              clamp(cy + Math.sin(th) * (H * 0.5 - m) * rr2, m * 0.5, H - m * 0.5),
            ]
          }
          const p = pos(env.ltb)
          const al = clearOf(bb, p[0], p[1], 10 * u, 34 * u)
          if (al <= 0.02) continue
          const b =
            Math.pow(Math.max(0, Math.sin(env.ltb * (1.6 + rad(4) * 1.4) + rad(5) * 6)), 2) * 0.85 +
            0.15
          const a = f * al * b
          halo[0].push([p[0], p[1], 20 * u, a])
          halo[1].push([p[0], p[1], 8.5 * u, a])
          core.push([p[0], p[1], 3 * u, a])
          const q = pos(env.ltb - 0.25)
          trails.push([q[0], q[1], p[0], p[1], a])
        }
        for (const h of halo[0]) dots(env, [h], col, 0.1 * h[3] * o)
        for (const h of halo[1]) dots(env, [h], col, 0.26 * h[3] * o)
        for (const t of trails)
          segs(env, [t.slice(0, 4)], col, 1.2 * u, 0.2 * t[4] * o, false, 'round')
        for (const c of core) dots(env, [c], col, (0.35 + 0.65 * c[3]) * o * Math.min(1, c[3] * 3))
      },
    },

    /* ==================================================== 几何图形 */

    /* メンフィス：绕歌词撒一圈孟菲斯风的波浪线、折线、空心三角、点阵与排线 */
    memphis: {
      layer: 'front',
      w: 0.9,
      tags: ['pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const K = Math.min(8, 5 + (P.n | 0))
        const pad = 34 * u + bh(bb) * 0.22
        const X0 = bb.x0 - pad
        const X1 = bb.x1 + pad
        const Y0 = bb.y0 - pad
        const Y1 = bb.y1 + pad
        const per = 2 * (X1 - X0 + Y1 - Y0)
        const cols = [ACC(env), ACC2(env), sc.fg]
        const S = clamp(Math.min(W, H) * 0.036, 24 * u, 44 * u)
        const lw = 3.4 * u
        const types = ['squig', 'zig', 'tri', 'dots', 'half', 'hatch']
        for (let i = 0; i < K; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          let t = ((i + 0.2 + rad(1) * 0.6) / K) * per
          let x: number, y: number
          if (t < X1 - X0) {
            x = X0 + t
            y = Y0
          } else if ((t -= X1 - X0) < Y1 - Y0) {
            x = X1
            y = Y0 + t
          } else if ((t -= Y1 - Y0) < X1 - X0) {
            x = X1 - t
            y = Y1
          } else {
            t -= X1 - X0
            x = X0
            y = Y1 - t
          }
          x = clamp(x, S * 1.6, W - S * 1.6)
          y = clamp(y, S * 1.6, H - S * 1.6)
          if (clearOf(bb, x, y, S * 1.3, 1) < 1) continue
          const q = clamp((env.lt - 0.04 - i * 0.06) / 0.4)
          if (q <= 0) continue
          const sc2 = E.outBack(q, 2)
          const de = E.inOutCubic(q)
          const type = types[(i + (P.v | 0)) % types.length]
          const col = cols[i % 3]
          const rot = (rad(3) * 360 + Math.sin(env.ltb * 1.3 + i) * 6) * DEG
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(rot)
          if (type === 'squig') {
            const p: Pt[] = []
            for (let k = 0; k <= 24; k++) {
              const f = k / 24
              p.push([(f - 0.5) * S * 2.6, Math.sin(f * TAU * 1.5) * S * 0.28])
            }
            stroke(env, part(p, 0, de), col, lw, o, false, { cap: 'round', join: 'round' })
          } else if (type === 'zig') {
            const p: Pt[] = []
            for (let k = 0; k <= 6; k++)
              p.push([(k / 6 - 0.5) * S * 2.4, (k % 2 ? -1 : 1) * S * 0.3])
            stroke(env, part(p, 0, de), col, lw, o, false, { cap: 'round', join: 'round' })
          } else if (type === 'tri') {
            const p: Pt[] = []
            for (let k = 0; k <= 3; k++) {
              const an = (-90 + k * 120) * DEG
              p.push([Math.cos(an) * S * 0.8 * sc2, Math.sin(an) * S * 0.8 * sc2])
            }
            stroke(env, p, col, lw * 0.8, o, false, { join: 'round' })
          } else if (type === 'dots') {
            const d: number[][] = []
            for (let a = -1; a <= 1; a++)
              for (let b = -1; b <= 1; b++) d.push([a * S * 0.5, b * S * 0.5, 2.6 * u * sc2])
            dots(env, d, col, o)
          } else if (type === 'half') {
            const p = arcP(0, 0, S * 0.7 * sc2, 180, 360, 20)
            polys(env, [p], col, o)
          } else {
            const l: number[][] = []
            for (let k = -1; k <= 1; k++)
              l.push([
                k * S * 0.45 - S * 0.3 * de,
                S * 0.5 * de,
                k * S * 0.45 + S * 0.3 * de,
                -S * 0.5 * de,
              ])
            segs(env, l, col, lw * 0.9, o, false, 'round')
          }
          ctx.restore()
        }
      }),
    },

    /* ジグザグリボン：从屏幕角落展开的风琴折双色缎带 */
    zigzagRibbon: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const rw = clamp(Math.min(W, H) * 0.3, 200 * u, 420 * u)
        const rh = rw * 0.42
        const sp = cornerSpot(env, bb, rw, rh, P, 0.6)
        const a = o * (sp.ok ? 1 : 0.3)
        const sx = sp.sx
        const sy = sp.sy
        const ox = sx > 0 ? W + 20 * u : -20 * u
        const oy = sy > 0 ? sp.y + rh * 0.75 : sp.y + rh * 0.25
        const ix = sx > 0 ? sp.x : sp.x + rw
        const iy = sy > 0 ? sp.y + rh * 0.2 : sp.y + rh * 0.8
        const L = Math.hypot(ix - ox, iy - oy)
        const dx = (ix - ox) / L
        const dy = (iy - oy) / L
        const nx = -dy
        const ny = dx
        const seg = 7
        const Z = rh * 0.22
        const wv = rh * 0.3
        // 缎带"厚度"主要沿竖直方向铺开
        const vx = nx * 0.35
        const vy = 1
        const vl = Math.hypot(vx, vy)
        const VX = (vx / vl) * wv
        const VY = (vy / vl) * wv
        const e = E.outCubic(clamp(env.lt / 0.6)) * seg
        const C = (k: number): Pt => {
          const s = (L * k) / seg
          return [ox + dx * s + nx * (k % 2 ? Z : -Z), oy + dy * s + ny * (k % 2 ? Z : -Z)]
        }
        const front: Pt[][] = []
        const back: Pt[][] = []
        const edges: Pt[][] = []
        for (let k = 0; k < seg; k++) {
          if (k >= e) break
          const f = Math.min(1, e - k)
          const p0 = C(k)
          const p1f = C(k + 1)
          const p1 = L2(p0, p1f, f)
          const quad: Pt[] = [p0, p1, [p1[0] + VX, p1[1] + VY], [p0[0] + VX, p0[1] + VY]]
          const lane = k % 2 ? back : front
          lane.push(quad)
          edges.push(
            [p0, p1],
            [
              [p0[0] + VX, p0[1] + VY],
              [p1[0] + VX, p1[1] + VY],
            ],
          )
        }
        const c1 = ACC(env)
        const c2 =
          contrast(ACC2(env), sc.bg) > 1.6 && ACC2(env) !== c1 ? ACC2(env) : mix(c1, sc.bg, 0.4)
        polys(env, back, c2, 0.95 * a, true)
        polys(env, front, c1, 0.95 * a, true)
        strokes(env, edges, sc.bg, Math.max(1, 0.8 * u), 0.25 * a)
      }),
    },

    /* 水玉：一块圆点阵，点径随对角行波呼吸 */
    polkaPatch: {
      layer: 'front',
      w: 0.9,
      tags: ['pop', 'graphic', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const cols = 6 + (P.n | 0)
        const rows = 3 + ((P.v | 0) % 2)
        const s = clamp(Math.min(env.W, env.H) * 0.03, 20 * u, 36 * u)
        const w = (cols - 0.5) * s
        const h = (rows - 1) * s * 0.87 + s
        const sp = spot(env, bb, w, h, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const round = (P.v | 0) % 3 === 2
        const ac = ACC(env)
        const main: number[][] = []
        const hot: number[][] = []
        const dir = P.right ? 1 : -1
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const x = sp.x + s * 0.5 + i * s + (j % 2 ? s * 0.5 : 0)
            const y = sp.y + s * 0.5 + j * s * 0.87
            if (x > sp.x + w) continue
            if (round) {
              const fx = (x - sp.x - w / 2) / (w / 2)
              const fy = (y - sp.y - h / 2) / (h / 2)
              if (fx * fx + fy * fy > 1.05) continue
            }
            const d = (dir > 0 ? i : cols - i) + j
            const q = E.outBack(clamp((env.lt - d * 0.03) / 0.3), 2)
            if (q <= 0) continue
            const wv = 0.5 + 0.5 * Math.sin(env.ltb * 3.2 - d * 0.7)
            const rr2 = s * 0.42 * (0.35 + 0.65 * wv) * q
            const lane = wv > 0.93 && (i + j) % 3 === 0 ? hot : main
            lane.push([x, y, rr2])
          }
        dots(env, main, P.accent ? ac : sc.fg, 0.9 * a)
        dots(env, hot, P.accent ? sc.fg : ac, a)
      }),
    },

    /* 縞の円：细密旋转条纹填满的圆盘，套一圈描边并留一个错位的影子圆 */
    stripeCircle: {
      layer: 'front',
      w: 0.9,
      tags: ['graphic', 'pop'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.062, 40 * u, 80 * u)
        const sp = spot(env, bb, R * 2.4, R * 2.4, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx - 3 * u
        const cy = sp.cy - 3 * u
        const e = E.outBack(clamp(env.lt / 0.45), 1.5)
        const r = R * e
        const v = (P.v | 0) % 2
        if (r <= 1) return
        const ac = ACC(env)
        const half = v === 1
        env.circle(
          cx + 7 * u,
          cy + 7 * u,
          r,
          null,
          sc.sub,
          Math.max(1, u),
          0.7 * a * clamp((env.lt - 0.2) / 0.3),
          false,
        )
        ctx.save()
        ctx.beginPath()
        if (half) ctx.arc(cx, cy, r, 0, Math.PI)
        else ctx.arc(cx, cy, r, 0, TAU)
        ctx.clip()
        const th = (45 + env.ltb * (half ? 0 : 18) * (P.right ? 1 : -1)) * DEG
        const gap = 8 * u
        const shift = half ? (env.ltb * 14 * u) % gap : 0
        const c = Math.cos(th)
        const s = Math.sin(th)
        const list: number[][] = []
        for (let k = -Math.ceil(R / gap) - 1; k <= Math.ceil(R / gap) + 1; k++) {
          const d = k * gap + shift
          list.push([
            cx + c * d - s * R * 1.2,
            cy + s * d + c * R * 1.2,
            cx + c * d + s * R * 1.2,
            cy + s * d - c * R * 1.2,
          ])
        }
        segs(env, list, ac, 3.2 * u, a)
        ctx.restore()
        if (half) {
          // 上半圆：细密的同心弧描出来
          const he = E.inOutCubic(clamp((env.lt - 0.2) / 0.5))
          const ar: number[][] = []
          for (let k = 1; k <= 3; k++)
            ar.push([cx, cy, (r * k) / 4, Math.PI, Math.PI + Math.PI * he])
          arcs(env, ar, sc.fg, Math.max(1, 1.1 * u), 0.8 * a)
          segs(env, [[cx - r, cy, cx + r, cy]], sc.fg, Math.max(1, 1.2 * u), a)
        }
        env.circle(cx, cy, r, null, sc.fg, Math.max(1, 1.5 * u), a, false)
      }),
    },

    /* 装飾コーナー：从两个（或四个）屏幕角画进来的装饰艺术角饰 */
    decoCorners: {
      layer: 'front',
      w: 0.9,
      tags: ['editorial', 'graphic', 'calm'],
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const Lc = clamp(Math.min(W, H) * 0.15, 90 * u, 190 * u)
        const g = 9 * u
        const lw = Math.max(1, 1.3 * u)
        const ac = ACC(env)
        const cs: readonly (readonly [number, number])[] = P.big
          ? [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ]
          : P.corner
            ? [
                [-1, -1],
                [1, 1],
              ]
            : [
                [1, -1],
                [-1, 1],
              ]
        cs.forEach(([sx, sy], k) => {
          const X = sx < 0 ? m * 0.7 : W - m * 0.7
          const Y = sy < 0 ? m * 0.7 : H - m * 0.7
          if (
            hitBB(
              Math.min(X, X - sx * Lc),
              Math.min(Y, Y - sy * Lc),
              Math.max(X, X - sx * Lc),
              Math.max(Y, Y - sy * Lc),
              bb,
              6 * u,
            )
          )
            return
          const e = E.outCubic(clamp((env.lt - k * 0.06) / 0.55))
          if (e <= 0) return
          const ix = -sx
          const iy = -sy
          const P2 = (dx: number, dy: number): Pt => [X + ix * dx, Y + iy * dy]
          const outer: Pt[] = [P2(Lc, 0), P2(0, 0), P2(0, Lc)]
          const inner: Pt[] = [
            P2(Lc * 0.62, g),
            P2(g * 2, g),
            P2(g * 2, g * 2),
            P2(g, g * 2),
            P2(g, Lc * 0.62),
          ]
          stroke(env, part(outer, 0.5 - 0.5 * e, 0.5 + 0.5 * e), sc.fg, lw, 0.85 * o)
          stroke(env, part(inner, 0.5 - 0.5 * e, 0.5 + 0.5 * e), sc.fg, lw, 0.6 * o)
          const e2 = E.outCubic(clamp((env.lt - 0.15 - k * 0.06) / 0.5))
          const a0 = Math.atan2(iy, 0) / DEG
          const a1 = Math.atan2(0, ix) / DEG
          let s0 = a0
          let s1 = a1
          if (Math.abs(s1 - s0) > 180) {
            if (s1 < s0) s1 += 360
            else s0 += 360
          }
          const mid = (s0 + s1) / 2
          const hs = ((s1 - s0) / 2) * e2
          stroke(env, arcP(X, Y, Lc * 0.42, mid - hs, mid + hs, 30), sc.fg, lw, 0.5 * o)
          stroke(
            env,
            arcP(X, Y, Lc * 0.42 + 5 * u, mid - hs * 0.6, mid + hs * 0.6, 20),
            sc.sub,
            Math.max(1, 0.8 * u),
            0.5 * o,
          )
          const q = E.outBack(clamp((env.lt - 0.35 - k * 0.06) / 0.3), 2)
          if (q <= 0) return
          const dia = (x: number, y: number, rad: number): Pt[] => [
            [x, y - rad],
            [x + rad, y],
            [x, y + rad],
            [x - rad, y],
          ]
          const d1 = P2(Lc, 0)
          const d2 = P2(0, Lc)
          const dm = P2(Lc * 0.42 * 0.7071, Lc * 0.42 * 0.7071)
          polys(env, [dia(d1[0], d1[1], 4 * u * q), dia(d2[0], d2[1], 4 * u * q)], ac, o)
          polys(env, [dia(dm[0], dm[1], 5.5 * u * q)], sc.fg, 0.9 * o)
          dots(env, [[...P2(g * 3.4, g * 3.4), 1.8 * u * q]], ac, o)
        })
      },
    },

    /* 半円の積層：包豪斯半圆——叠起来的圆顶、上下交替的扇贝边、或嵌套彩虹拱 */
    halfCircles: {
      layer: 'front',
      w: 0.9,
      tags: ['graphic', 'pop', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const v = (P.v | 0) % 3
        const R = clamp(Math.min(env.W, env.H) * 0.058, 38 * u, 74 * u)
        const lw = Math.max(1.2, 1.6 * u)
        const bw0 = v === 1 ? R * 7.4 : R * 2.2
        const bh0 = v === 0 ? R * 2.5 : v === 1 ? R * 1.3 : R * 1.2
        const sp = spot(env, bb, bw0, bh0, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const a2 = ACC2(env)
        const grow = (k: number) => E.outBack(clamp((env.lt - k * 0.08) / 0.35), 1.6)
        if (v === 0) {
          // 圆顶层层叠起
          let yb = sp.y + bh0
          for (let k = 0; k < 4; k++) {
            const rad = R * (1 - k * 0.2)
            const q = grow(k)
            if (q <= 0) break
            const cx = sp.cx + Math.sin(env.ltb * 1.2 + k) * 2 * u * k
            const pts = arcP(cx, yb, rad * q, 180, 360, 28)
            if (k % 2 === 0) polys(env, [pts], k === 0 ? ac : sc.fg, 0.95 * a)
            else stroke(env, pts.concat([pts[0]]), sc.fg, lw, a, false, { join: 'round' })
            yb -= rad * q * 0.62
          }
        } else if (v === 1) {
          // 上下交替的扇贝边
          const rad = R * 0.6
          const y = sp.cy
          for (let k = 0; k < 6; k++) {
            const q = grow(k)
            if (q <= 0) break
            const cx = sp.x + rad + k * rad * 2
            const up = k % 2 === 0
            const bob = Math.sin(env.ltb * 2 + k) * 2 * u
            const pts = arcP(cx, y + bob, rad * q, up ? 180 : 0, up ? 360 : 180, 20)
            if (k % 3 === 0) polys(env, [pts], ac, 0.95 * a)
            else if (k % 3 === 1) polys(env, [pts], a2, 0.9 * a)
            else stroke(env, pts.concat([pts[0]]), sc.fg, lw, a)
          }
          segs(env, [[sp.x, y, sp.x + bw0 * inE(env, 0.5), y]], sc.fg, Math.max(1, u), 0.6 * a)
        } else {
          // 嵌套拱
          const yb = sp.y + bh0
          const rot = Math.sin(env.ltb * 0.8) * 3
          for (let k = 0; k < 5; k++) {
            const rad = R * (1 - k * 0.18)
            const q = grow(4 - k)
            if (q <= 0) continue
            const pts = arcP(sp.cx, yb, rad, 180 + rot, 180 + rot + 180 * E.outCubic(clamp(q)), 36)
            if (k === 4) polys(env, [arcP(sp.cx, yb, rad * q, 180, 360, 20)], ac, a)
            else stroke(env, pts, k % 2 ? ac : sc.fg, 3 * u, a, false, { cap: 'butt' })
          }
          segs(
            env,
            [[sp.cx - R * 1.1, yb, sp.cx + R * 1.1, yb]],
            sc.fg,
            Math.max(1, u),
            0.7 * a * inE(env, 0.4),
          )
        }
      }),
    },

    /* 循環矢印：绕一个小读数旋转的循环箭头（2 或 3 支），像刷新 / 重复议字符 */
    loopArrows: {
      layer: 'front',
      w: 0.8,
      tags: ['graphic', 'pop', 'editorial'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.055, 36 * u, 70 * u)
        const sp = spot(env, bb, R * 2.8, R * 2.8, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx
        const cy = sp.cy
        const n = 2 + ((P.n | 0) % 2)
        const dir = P.right ? 1 : -1
        const ac = ACC(env)
        const lw = Math.max(1.4, 2.4 * u)
        const e = E.outCubic(clamp(env.lt / 0.5))
        const rot = dir * (env.ltb * 70 + (1 - e) * -120) + P.r * 360
        const seg = 360 / n
        const sw = (seg - 38) * e
        for (let k = 0; k < n; k++) {
          const a0 = rot + k * seg
          const a1 = a0 + dir * sw
          stroke(env, arcP(cx, cy, R, a0, a1, 30), sc.fg, lw, a, false, { cap: 'round' })
          const an = a1 * DEG
          const tx = -Math.sin(an) * dir
          const ty = Math.cos(an) * dir
          const px = cx + Math.cos(an) * R
          const py = cy + Math.sin(an) * R
          const hs = 7 * u * e
          polys(
            env,
            [
              [
                [px + tx * hs * 1.3, py + ty * hs * 1.3],
                [px - tx * hs * 0.4 + Math.cos(an) * hs, py - ty * hs * 0.4 + Math.sin(an) * hs],
                [px - tx * hs * 0.4 - Math.cos(an) * hs, py - ty * hs * 0.4 - Math.sin(an) * hs],
              ],
            ],
            ac,
            a,
          )
        }
        env.circle(cx, cy, R * 1.32, null, sc.sub, Math.max(1, 0.8 * u), 0.35 * a * e, false)
        const fs = R * 0.5
        const loops = 1 + Math.floor(env.lt / 1.1)
        label(env, `×${loops}`, cx, cy, {
          size: fs,
          align: 'center',
          color: sc.fg,
          alpha: a * inE(env, 0.3, 0.2),
          track: 0.02,
        })
      }),
    },

    /* スターバースト：转到歌词旁边的锯齿爆炸贴，里面写一个词或一个编号 */
    starburst: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.068, 44 * u, 88 * u)
        const sp = nearBB(env, bb, R * 2.2, R * 2.2, P, 14 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const q = E.outBack(clamp((env.lt - 0.05) / 0.4), 2.2)
        if (q <= 0) return
        const rot = (env.ltb * 9 + (1 - q) * -120 + P.r * 30) * DEG
        const N = 22
        const ac = ACC(env)
        const pts: Pt[] = []
        for (let i = 0; i < N * 2; i++) {
          const an = (i / (N * 2)) * TAU
          const rad = i % 2 ? R * 0.83 : R
          pts.push([Math.cos(an) * rad, Math.sin(an) * rad])
        }
        const txtC = lum(ac) > 0.55 ? '#000000' : sc.bg
        ctx.save()
        ctx.translate(sp.cx, sp.cy)
        ctx.rotate(rot)
        ctx.scale(q, q)
        polys(env, [pts], ac, 0.97 * a)
        env.circle(0, 0, R * 0.7, null, txtC, Math.max(1, 1.2 * u), 0.55 * a, false)
        const v = (P.v | 0) % 5
        const ch = lyricChar(env, 9)
        const txt = [`No.${pad2((cut.line | 0) + 1)}`, '新品', '热卖', ch || '♪', '热爱'][v]
        const font = v === 3 ? serifF(env) : dispF(env)
        let fs = R * (v === 3 ? 0.7 : 0.42)
        const tw = textW(txt, font, fs, 0.02)
        if (tw > R * 1.15) fs *= (R * 1.15) / tw
        ctx.rotate(-rot * 0.85)
        env.draw({
          text: txt,
          font,
          size: fs,
          x: 0,
          y: 0,
          color: txtC,
          alpha: a,
          track: 0.02,
          ghost: false,
        })
        ctx.restore()
      }),
    },

    /* 正の字：手写一笔笔加上去的"正"字计数，整个镜头里数满为止 */
    tally: {
      layer: 'front',
      w: 0.8,
      tags: ['editorial', 'pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const nC = 2 + ((P.n | 0) % 2)
        const S = clamp(Math.min(env.W, env.H) * 0.064, 40 * u, 76 * u)
        const gp = S * 0.3
        const fs = FS(env) * 1.05
        const w = nC * S + (nC - 1) * gp + fs * 3.2
        const h = S * 1.1
        const sp = spot(env, bb, w, h, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const total = nC * 5
        const dt = clamp((cut.dur * 0.75 - 0.2) / total, 0.09, 0.26)
        const col = P.accent ? ACC(env) : sc.fg
        const lw = Math.max(1.6, 3 * u)
        let count = 0
        for (let c = 0; c < nC; c++) {
          const x0 = sp.x + c * (S + gp)
          const y0 = sp.y + (h - S) / 2
          const tilt = rs(P.seed, c, 1) * 4 * DEG
          for (let k = 0; k < 5; k++) {
            const idx = c * 5 + k
            const t0 = 0.1 + idx * dt
            const e = E.outCubic(clamp((env.lt - t0) / Math.min(0.14, dt * 0.9)))
            if (e <= 0) continue
            if (e >= 1) count++
            const jit = (i: number) => rs(P.seed, idx, i) * 0.035
            const p = SEI[k]
              .map(([x, y], i): Pt => [x + jit(i * 2), y + jit(i * 2 + 1)])
              .map(([x, y]): Pt => {
                const X = (x - 0.5) * S
                const Y = (y - 0.5) * S
                return [
                  x0 + S / 2 + X * Math.cos(tilt) - Y * Math.sin(tilt),
                  y0 + S / 2 + X * Math.sin(tilt) + Y * Math.cos(tilt),
                ]
              })
            stroke(env, part(p, 0, e), col, lw, 0.95 * a, false, { cap: 'round' })
          }
        }
        const lx = sp.x + nC * (S + gp) - gp + fs * 0.8
        label(env, '×', lx, sp.y + h / 2, { size: fs, alpha: a * inE(env, 0.3, 0.1) })
        label(env, pad2(count), lx + fs * 0.9, sp.y + h / 2, {
          size: fs * 1.3,
          color: count >= total ? ACC(env) : sc.fg,
          alpha: a * inE(env, 0.3, 0.1),
          track: 0.04,
        })
      }),
    },

    /* ==================================================== UI 控件 */

    /* カーソル：一只鼠标指针滑到歌词旁边点击（涟漪 + 提示气泡），或拖出一个走马灯选框 */
    cursorClick: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      draw(env, bb0, P) {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const Sc = clamp(Math.min(W, H) * 0.034, 24 * u, 42 * u)
        const ac = ACC(env)
        const marquee = (P.v | 0) % 2 === 1
        const pad = 14 * u + bh(bb) * 0.06
        const lw = Math.max(1, 1.2 * u)
        let tip: Pt
        if (marquee) {
          const A: Pt = [clamp(bb.x0 - pad, m * 0.4, W), clamp(bb.y0 - pad, m * 0.4, H)]
          const B: Pt = [clamp(bb.x1 + pad, 0, W - m * 0.4), clamp(bb.y1 + pad, 0, H - m * 0.4)]
          const enter = E.outCubic(clamp(env.lt / 0.3))
          const drag = E.inOutCubic(clamp((env.lt - 0.3) / 0.6))
          const start: Pt = [A[0] - 60 * u, A[1] - 90 * u]
          tip = drag <= 0 ? L2(start, A, enter) : L2(A, B, drag)
          if (env.lt > 0.95)
            tip = [
              B[0] + 18 * u * E.outCubic(clamp((env.lt - 0.95) / 0.4)),
              B[1] + 12 * u * E.outCubic(clamp((env.lt - 0.95) / 0.4)),
            ]
          if (drag > 0) {
            const C = drag < 1 ? tip : B
            const x0 = Math.min(A[0], C[0])
            const y0 = Math.min(A[1], C[1])
            const x1 = Math.max(A[0], C[0])
            const y1 = Math.max(A[1], C[1])
            const ph = env.ltb * 30 * u
            dash(env, x0, y0, x1, y0, 6 * u, 4 * u, sc.fg, lw, 0.9 * o, ph)
            dash(env, x1, y0, x1, y1, 6 * u, 4 * u, sc.fg, lw, 0.9 * o, ph)
            dash(env, x1, y1, x0, y1, 6 * u, 4 * u, sc.fg, lw, 0.9 * o, ph)
            dash(env, x0, y1, x0, y0, 6 * u, 4 * u, sc.fg, lw, 0.9 * o, ph)
            if (drag >= 1) {
              const hs = 3.5 * u
              const hq = E.outBack(clamp((env.lt - 0.9) / 0.25), 2) * hs
              const hl: number[][] = []
              const handles: readonly Pt[] = [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
                [(x0 + x1) / 2, y0],
                [(x0 + x1) / 2, y1],
                [x0, (y0 + y1) / 2],
                [x1, (y0 + y1) / 2],
              ]
              for (const [x, y] of handles) hl.push([x - hq, y - hq, hq * 2, hq * 2])
              rects(env, hl, ac, o)
              label(
                env,
                `${Math.round(x1 - x0)} × ${Math.round(y1 - y0)}`,
                x1,
                y1 + FS(env) * 1.1,
                {
                  size: FS(env) * 0.8,
                  align: 'right',
                  color: sc.fg,
                  alpha: o * clamp((env.lt - 1) / 0.3),
                },
              )
            }
          }
        } else {
          const sx = P.right ? 1 : -1
          const target = [
            sx > 0 ? bb.x1 + 10 * u : bb.x0 - 10 * u - Sc * 0.7,
            (P.low ? bb.y1 : bb.y0) + (P.low ? 8 * u : -Sc * 1.2),
          ]
          target[0] = clamp(target[0], m * 0.5, W - m * 0.5 - Sc)
          target[1] = clamp(target[1], m * 0.5, H - m * 0.5 - Sc * 1.2)
          const from: Pt = [target[0] + sx * W * 0.22, target[1] + H * 0.18]
          const mv = E.outCubic(clamp(env.lt / 0.55))
          tip = [
            lerp(from[0], target[0], mv) + Math.sin(mv * Math.PI) * 30 * u,
            lerp(from[1], target[1], mv),
          ]
          const away = E.inCubic(env.pOut)
          tip = [tip[0] + sx * away * 60 * u, tip[1] + away * 40 * u]
          for (const tc of CLICK_TIMES) {
            const q = (env.lt - tc) / 0.5
            if (q <= 0 || q >= 1) continue
            env.circle(
              target[0],
              target[1],
              (6 + 26 * E.outCubic(q)) * u,
              null,
              ac,
              2 * u * (1 - q),
              o * (1 - q),
              false,
            )
          }
          const tq = clamp((env.lt - 0.9) / 0.25)
          if (tq > 0) {
            const txt = `LYRIC ${pad2((cut.line | 0) + 1)}`
            const fs = FS(env) * 0.85
            const tw = textW(txt, monoF(env), fs, 0.1) + 16 * u
            const th = fs * 1.9
            const bx = clamp(target[0] + Sc * 0.9, m * 0.4, W - m * 0.4 - tw)
            const by = clamp(target[1] + Sc * 1.25, m * 0.4, H - m * 0.4 - th)
            if (!hitBB(bx, by, bx + tw, by + th, bb, 2)) {
              rrFill(env, bx, by, tw, th * E.outBack(tq, 1.5), 4 * u, sc.fg, 0.92 * o)
              label(env, txt, bx + tw / 2, by + th / 2, {
                size: fs,
                align: 'center',
                color: sc.bg,
                alpha: o * tq,
                track: 0.1,
              })
            }
          }
        }
        const click = !marquee && CLICK_TIMES.some((tc) => env.lt > tc && env.lt < tc + 0.1)
        const s = Sc * (click ? 0.86 : 1)
        const pts = CURSOR.map(([x, y]): Pt => [tip[0] + x * s, tip[1] + y * s])
        polys(env, [pts.map(([x, y]): Pt => [x + 3 * u, y + 4 * u])], sc.sub, 0.3 * o)
        polys(env, [pts], sc.fg, o)
        strokes(env, [pts], sc.bg, Math.max(1, 1.4 * u), o, false, { close: true, join: 'round' })
      },
    },

    /* ウィンドウ：套在歌词外圈的系统窗口框：标题栏、按钮、文件名、滚动条与状态行 */
    windowChrome: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const bar = clamp(Math.min(W, H) * 0.036, 26 * u, 44 * u)
        const pxB = 30 * u + bw(bb) * 0.03
        const pyB = 20 * u + bh(bb) * 0.08
        let X0 = bb.x0 - pxB
        let X1 = bb.x1 + pxB
        let Y0 = bb.y0 - pyB - bar
        let Y1 = bb.y1 + pyB + bar * 0.6
        X0 = Math.max(X0, m * 0.35)
        X1 = Math.min(X1, W - m * 0.35)
        Y0 = Math.max(Y0, m * 0.35)
        Y1 = Math.min(Y1, H - m * 0.35)
        if (Y0 + bar > bb.y0 - 4 * u) Y0 = bb.y0 - 4 * u - bar
        const e = E.outExpo(clamp(env.lt / 0.45)) * (1 - 0.06 * E.inCubic(env.pOut))
        const s = 0.94 + 0.06 * e
        const cx = (X0 + X1) / 2
        const cy = (Y0 + Y1) / 2
        const T = (x: number, y: number): Pt => [cx + (x - cx) * s, cy + (y - cy) * s]
        const [x0, y0] = T(X0, Y0)
        const [x1, y1] = T(X1, Y1)
        const lw = Math.max(1, 1.4 * u)
        const a = o * clamp(env.lt / 0.15)
        const rad = 8 * u
        const ac = ACC(env)
        const mac = (P.v | 0) % 2 === 0
        rrStroke(env, x0, y0, x1 - x0, y1 - y0, rad, sc.fg, lw, 0.9 * a)
        rrFill(env, x0, y0, x1 - x0, bar * s, rad, sc.fg, 0.1 * a)
        segs(env, [[x0, y0 + bar * s, x1, y0 + bar * s]], sc.fg, lw, 0.8 * a)
        const be = inE(env, 0.3, 0.2)
        const by = y0 + (bar * s) / 2
        const br = bar * 0.17
        if (mac) {
          const cs2 = [ac, ACC2(env), sc.sub]
          cs2.forEach((c, k) =>
            env.circle(x0 + bar * 0.55 + k * br * 3, by, br * be, c, null, 0, a, false),
          )
        } else {
          const bx = x1 - bar * 0.6
          const k = br * be
          segs(
            env,
            [
              [bx - k, by - k, bx + k, by + k],
              [bx - k, by + k, bx + k, by - k],
            ],
            sc.fg,
            lw,
            a,
          )
          rrStroke(env, bx - bar * 0.95 - k, by - k, k * 2, k * 2, 0, sc.fg, lw, a)
          segs(env, [[bx - bar * 1.9 - k, by, bx - bar * 1.9 + k, by]], sc.fg, lw, a)
        }
        const fs = FS(env) * 0.92
        const title = `lyric_${pad2((cut.line | 0) + 1)}.txt`
        label(env, title, (x0 + x1) / 2, by, {
          size: fs,
          align: 'center',
          color: sc.fg,
          alpha: a * be,
          track: 0.08,
        })
        // 滚动条 + 状态行
        const sbx = x1 - 9 * u
        const st = y0 + bar * s + 8 * u
        const sbH = y1 - 8 * u - st
        if (sbH > 30 * u && sbx > bb.x1 + 12 * u) {
          segs(env, [[sbx, st, sbx, st + sbH * be]], sc.sub, Math.max(1, u), 0.4 * a)
          const th = sbH * 0.35
          const ty = st + (sbH - th) * clamp(env.lt / Math.max(1, cut.dur))
          rrFill(env, sbx - 2 * u, ty, 4 * u, th * be, 2 * u, sc.sub, 0.8 * a)
        }
        if (y1 - bb.y1 > fs * 1.4)
          label(
            env,
            `Ln ${pad2((cut.line | 0) + 1)}, Col ${[...String(cut.text || '')].length}   UTF-8`,
            x1 - 14 * u,
            y1 - fs * 0.8,
            {
              size: fs * 0.8,
              align: 'right',
              alpha: a * be * 0.8,
              track: 0.08,
            },
          )
      }),
    },

    /* 読み込みバー：胶囊轨道 + 理发店转灯式填充，按不均匀的几段冲到 100%，带文件大小读数 */
    progressBar: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fs = FS(env) * 0.9
        const th = clamp(Math.min(W, env.H) * 0.014, 10 * u, 18 * u)
        const w = Math.min(W * 0.4, 460 * u, Math.max(bw(bb) * 0.65, 260 * u))
        const h = th + fs * 3.2
        const sp = bandSpot(env, bb, w, h, P, 26 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const x0 = sp.x
        const ty = sp.y + fs * 1.5
        const e = E.outExpo(clamp(env.lt / 0.45))
        const tw = w * e
        const tx = x0 + (w - tw) / 2
        // 不均匀的进度：5 段冲刺带停顿，在镜头 85% 处走完
        const T = Math.max(0.8, cut.dur * 0.85 - 0.3)
        let p = 0
        for (let k = 0; k < 5; k++) {
          const t0 = 0.25 + (T * k) / 5 + r(P.seed, k, 1) * T * 0.08
          const d = (T / 5) * (0.35 + r(P.seed, k, 2) * 0.4)
          p += 0.2 * E.inOutCubic(clamp((env.lt - t0) / d))
        }
        p = clamp(p)
        rrStroke(env, tx, ty, tw, th, th / 2, sc.fg, Math.max(1, 1.2 * u), 0.8 * a)
        const fw = Math.max(0, (tw - 4 * u) * p)
        if (fw > 1) {
          ctx.save()
          ctx.beginPath()
          rrPath(ctx, tx + 2 * u, ty + 2 * u, fw, th - 4 * u, (th - 4 * u) / 2)
          ctx.clip()
          rects(env, [[tx, ty, tw, th]], ac, a)
          const st: number[][] = []
          const gap = 12 * u
          const off = (env.ltb * 26 * u) % gap
          for (let x = tx - th + off; x < tx + fw + th; x += gap) st.push([x, ty + th, x + th, ty])
          segs(env, st, lum(ac) > 0.5 ? '#000000' : '#ffffff', 4 * u, 0.16 * a)
          ctx.restore()
        }
        const done = p >= 0.999
        const le = inE(env, 0.3, 0.15)
        const dots3 = '.'.repeat(Math.floor(env.ltb * 3) % 4)
        label(env, done ? 'Complete' : 'Loading' + dots3, tx, sp.y + fs * 0.6, {
          size: fs,
          font: bodyF(env),
          color: sc.fg,
          alpha: a * le,
          track: 0.04,
        })
        label(env, `${Math.floor(p * 100)}%`, tx + tw, sp.y + fs * 0.6, {
          size: fs,
          align: 'right',
          color: done ? ac : sc.fg,
          alpha: a * le,
        })
        const tot = 8 + (hash(P.seed, 3) % 400) / 10
        label(
          env,
          `${(tot * p).toFixed(1)} MB / ${tot.toFixed(1)} MB`,
          tx + tw,
          ty + th + fs * 1.1,
          {
            size: fs * 0.78,
            align: 'right',
            alpha: a * le * 0.85,
          },
        )
        if (done) {
          const ck: Pt[] = [
            [tx + 2 * u, ty + th + fs * 1.1],
            [tx + 6 * u, ty + th + fs * 1.1 + 4 * u],
            [tx + 13 * u, ty + th + fs * 1.1 - 5 * u],
          ]
          stroke(env, part(ck, 0, clamp((env.lt - T - 0.3) * 4)), ac, 2 * u, a, false, {
            cap: 'round',
            join: 'round',
          })
        }
      }),
    },

    /* トグル：小设置面板，两三枚 iOS 式开关一个接一个拨到 ON */
    toggleSwitch: {
      layer: 'front',
      w: 0.7,
      tags: ['pop', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const n = 2 + ((P.n | 0) % 2)
        const th = clamp(Math.min(env.W, env.H) * 0.034, 24 * u, 44 * u)
        const tw = th * 1.8
        const rowH = th * 1.7
        const fs = th * 0.58
        const labs = TOGGLE_LABELS[(P.v | 0) % TOGGLE_LABELS.length]
        const lw0 = Math.max(...labs.slice(0, n).map((l) => textW(l, bodyF(env), fs, 0.12)))
        const w = lw0 + 16 * u + tw
        const h = n * rowH
        const sp = spot(env, bb, w, h, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const knobC = lum(ac) > 0.6 ? '#000000' : sc.bg
        for (let i = 0; i < n; i++) {
          const q = E.outCubic(clamp((env.lt - i * 0.08) / 0.3))
          if (q <= 0) continue
          const y = sp.y + i * rowH + (rowH - th) / 2
          const x = sp.x + w - tw
          const on = E.outBack(clamp((env.lt - 0.45 - i * 0.32) / 0.25), 1.6)
          label(env, labs[i], sp.x, y + th / 2, {
            size: fs,
            font: bodyF(env),
            color: sc.fg,
            alpha: a * q,
            track: 0.12,
          })
          rrFill(env, x, y, tw, th, th / 2, ac, a * clamp(on) * q)
          rrStroke(
            env,
            x,
            y,
            tw,
            th,
            th / 2,
            clamp(on) > 0.5 ? ac : sc.sub,
            Math.max(1, 1.2 * u),
            a * q,
          )
          const kx = x + th / 2 + (tw - th) * on
          env.circle(
            kx,
            y + th / 2,
            th * 0.38 * q,
            clamp(on) > 0.5 ? knobC : sc.fg,
            null,
            0,
            a,
            false,
          )
          if (i < n - 1)
            segs(
              env,
              [[sp.x, sp.y + (i + 1) * rowH, sp.x + w * q, sp.y + (i + 1) * rowH]],
              sc.sub,
              Math.max(1, 0.8 * u),
              0.3 * a,
            )
        }
      }),
    },

    /* 通知：一枚线稿铃铛，红色角标每跳一次就摇一下 */
    notifBell: {
      layer: 'front',
      w: 0.7,
      tags: ['pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const S = clamp(Math.min(env.W, env.H) * 0.075, 48 * u, 92 * u)
        const fs = FS(env) * 0.95
        const sp = spot(env, bb, S * 1.9, S * 1.7 + fs * 1.8, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const cx = sp.cx - S * 0.15
        const cy = sp.y + S * 0.95
        const step = 0.5
        const k = Math.max(0, Math.floor((env.lt - 0.35) / step) + 1)
        const maxN = 3 + (hash(P.seed, 2) % 7)
        const cnt = Math.min(maxN, k)
        const since = env.lt - (0.35 + (Math.min(k, maxN) - 1) * step)
        const ring = cnt > 0 ? Math.exp(-since * 5) * Math.sin(since * 30) * 16 : 0
        const e = E.outBack(clamp(env.lt / 0.4), 1.6)
        const body: Pt[] = ([[-0.44, 0.36]] as Pt[]).concat(
          bez([-0.34, 0.26], [-0.38, -0.12], [-0.3, -0.45], [0, -0.47], 12),
          bez([0, -0.47], [0.3, -0.45], [0.38, -0.12], [0.34, 0.26], 12),
          [[0.44, 0.36]],
        )
        ctx.save()
        ctx.translate(cx, cy - S * 0.5)
        ctx.rotate(ring * DEG)
        ctx.translate(0, S * 0.5)
        ctx.scale(e, e)
        const pts = body.map(([x, y]): Pt => [x * S, y * S])
        stroke(env, pts.concat([pts[0]]), sc.fg, Math.max(1.4, 2 * u), a, false, {
          join: 'round',
          cap: 'round',
        })
        env.circle(0, -0.52 * S, 0.06 * S, null, sc.fg, Math.max(1.2, 1.6 * u), a, false)
        env.arc(
          Math.sin(ring * DEG * 2) * S * 0.08,
          0.44 * S,
          0.1 * S,
          0,
          180,
          sc.fg,
          Math.max(1.4, 2 * u),
          a,
          false,
        )
        ctx.restore()
        if (cnt > 0) {
          const bump = 1 + 0.35 * Math.exp(-since * 9)
          const br = S * 0.26 * bump
          const bx = cx + S * 0.36
          const by = cy - S * 0.42
          env.circle(bx, by, br, ac, null, 0, a, false)
          env.circle(bx, by, br + 2 * u, null, sc.bg, 2 * u, a, false)
          label(env, cnt >= 9 ? '9+' : String(cnt), bx, by, {
            size: br * 1.15,
            font: dispF(env),
            align: 'center',
            color: lum(ac) > 0.6 ? '#000000' : sc.bg,
            alpha: a,
            track: 0,
          })
        }
        label(env, `通知 ${pad2(cnt)}条`, cx, cy + S * 0.72 + fs * 0.8, {
          size: fs,
          font: bodyF(env),
          align: 'center',
          alpha: a * inE(env, 0.3, 0.3),
          track: 0.1,
        })
      }),
    },

    /* いいね：点赞时爆心填充的红心，旁边的计数滚动跳字 */
    likeCounter: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'emotional'],
      draw: settle((env, bb0, P) => {
        const cut = env.cut
        if (!cut) return
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const S = clamp(Math.min(env.W, env.H) * 0.042, 28 * u, 52 * u)
        const fs = S * 0.85
        const font = monoF(env)
        const base = 1000 + (hash(P.seed, 5) % 90000)
        const tLike = 0.45
        const inc = (t: number) =>
          t < tLike
            ? 0
            : 1 + Math.floor(Math.max(0, t - tLike - 0.4) / 0.38) * (1 + (hash(P.seed, 6) % 3))
        const fmt = (n: number) => n.toLocaleString('en-US')
        const txtMax = fmt(base + inc(cut.dur))
        const w = S * 2.4 + textW(txtMax, font, fs, 0.04) + 10 * u
        const h = S * 2.4
        const sp = spot(env, bb, w, h, P, 20 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const hx = sp.x + S * 1.2
        const hy = sp.cy
        const liked = clamp((env.lt - tLike) / 0.3)
        const pop =
          liked > 0
            ? 1 + 0.35 * Math.sin(Math.PI * clamp(liked * 1.4))
            : E.outBack(clamp(env.lt / 0.3), 1.6)
        const hp = heartPts(hx, hy + S * 0.05, S * pop)
        if (liked > 0) polys(env, [hp], ac, a)
        stroke(env, hp.concat([hp[0]]), liked > 0 ? ac : sc.fg, Math.max(1.4, 2 * u), a, false, {
          join: 'round',
        })
        if (liked > 0 && liked < 1) {
          env.circle(
            hx,
            hy,
            S * (0.6 + 0.8 * liked),
            null,
            ac,
            2 * u * (1 - liked),
            a * (1 - liked),
            false,
          )
          const b: number[][] = []
          for (let k = 0; k < 7; k++) {
            const an = (-90 + (k * 360) / 7) * DEG
            const d0 = S * (0.9 + 0.7 * E.outCubic(liked))
            b.push([hx + Math.cos(an) * d0, hy + Math.sin(an) * d0, 2.4 * u * (1 - liked)])
          }
          dots(env, b, ac, a)
        }
        // 滚动的计数：旧值向上滑出，新值滑进来
        const t = env.lt
        const cur = base + inc(t)
        const prev = base + inc(Math.max(0, t - 0.16))
        const lx = hx + S * 1.25
        const ly = hy
        ctx.save()
        ctx.beginPath()
        ctx.rect(lx - 2 * u, ly - fs * 0.75, w, fs * 1.5)
        ctx.clip()
        if (cur !== prev) {
          const f = E.outCubic(clamp(((((t - tLike - 0.4) % 0.38) + 0.38) % 0.38) / 0.16))
          label(env, fmt(prev), lx, ly - fs * 1.2 * f, {
            size: fs,
            font,
            color: sc.fg,
            alpha: a * (1 - f),
            track: 0.04,
          })
          label(env, fmt(cur), lx, ly + fs * 1.2 * (1 - f), {
            size: fs,
            font,
            color: liked > 0 ? ac : sc.fg,
            alpha: a * f,
            track: 0.04,
          })
        } else
          label(env, fmt(cur), lx, ly, {
            size: fs,
            font,
            color: liked > 0 ? ac : sc.fg,
            alpha: a * inE(env, 0.3, 0.1),
            track: 0.04,
          })
        ctx.restore()
      }),
    },

    /* 再生ボタン：上一首 / 播放 / 下一首；播放在点击时变成暂停，下方走时间读数 */
    mediaControls: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'graphic', 'emotional'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.04, 28 * u, 52 * u)
        const fs = FS(env) * 0.9
        const w = R * 6.4
        const h = R * 2.2 + fs * 1.8
        const sp = bandSpot(env, bb, w, h, P, 34 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const cx = sp.cx
        const cy = sp.y + R * 1.1
        const e = E.outBack(clamp(env.lt / 0.35), 1.6)
        const lw = Math.max(1.2, 1.6 * u)
        const tc = 0.55
        const m = E.inOutCubic(clamp((env.lt - tc) / 0.22))
        env.circle(cx, cy, R * e, null, sc.fg, lw, a, false)
        if (env.lt > tc) {
          const q = clamp((env.lt - tc) / 0.45)
          env.circle(
            cx,
            cy,
            R * (1 + 0.5 * E.outCubic(q)),
            null,
            ac,
            2 * u * (1 - q),
            a * (1 - q),
            false,
          )
        }
        const s = R * 0.42 * e
        const A0: Pt[] = [
          [-0.35, -0.5],
          [0.075, -0.25],
          [0.075, 0.25],
          [-0.35, 0.5],
        ]
        const B0: Pt[] = [
          [0.075, -0.25],
          [0.5, 0],
          [0.5, 0],
          [0.075, 0.25],
        ]
        const A1: Pt[] = [
          [-0.4, -0.5],
          [-0.12, -0.5],
          [-0.12, 0.5],
          [-0.4, 0.5],
        ]
        const B1: Pt[] = [
          [0.12, -0.5],
          [0.4, -0.5],
          [0.4, 0.5],
          [0.12, 0.5],
        ]
        const morph = (P0: readonly Pt[], P1: readonly Pt[]): Pt[] =>
          P0.map((p, i): Pt => [
            cx + lerp(p[0], P1[i][0], m) * s * 2 + (1 - m) * s * 0.12,
            cy + lerp(p[1], P1[i][1], m) * s * 2,
          ])
        polys(env, [morph(A0, A1), morph(B0, B1)], sc.fg, a)
        // 上一首 / 下一首
        const side = (dir: number, k: number) => {
          const q = E.outBack(clamp((env.lt - 0.1 - k * 0.06) / 0.3), 1.6)
          if (q <= 0) return
          const x = cx + dir * R * 2.3
          const ss = R * 0.36 * q
          polys(
            env,
            [
              [
                [x - dir * ss * 0.6, cy - ss],
                [x + dir * ss * 0.9, cy],
                [x - dir * ss * 0.6, cy + ss],
              ],
            ],
            sc.fg,
            a,
          )
          rects(
            env,
            [[x + dir * ss * 0.9 - (dir > 0 ? 0 : 2.4 * u), cy - ss, 2.4 * u, ss * 2]],
            sc.fg,
            a,
          )
        }
        side(-1, 0)
        side(1, 1)
        const tot = env.plan && env.plan.duration ? env.plan.duration : 200
        const t = Math.max(0, env.t || 0)
        const mmss = (x: number) => `${Math.floor(x / 60)}:${pad2(x % 60)}`
        label(env, `${mmss(t)} / ${mmss(tot)}`, cx, cy + R * 1.1 + fs * 1.1, {
          size: fs,
          align: 'center',
          color: sc.sub,
          alpha: a * inE(env, 0.3, 0.2),
          track: 0.1,
        })
      }),
    },

    /* 音量：喇叭图标 + 随音乐起伏的阶梯音量计 */
    volumeBars: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'glitch', 'graphic'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const S = clamp(Math.min(env.W, env.H) * 0.042, 28 * u, 52 * u)
        const nB = 8
        const bwid = S * 0.3
        const gap = S * 0.18
        const fs = FS(env) * 0.9
        const w = S * 1.9 + nB * (bwid + gap)
        const h = S * 1.8 + fs * 1.6
        const sp = spot(env, bb, w, h, P, 22 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const ac = ACC(env)
        const x0 = sp.x
        const yb = sp.y + S * 1.6
        const lw = Math.max(1.2, 1.6 * u)
        const e = E.outBack(clamp(env.lt / 0.3), 1.6)
        const cy = yb - S * 0.55
        // 喇叭
        polys(
          env,
          [
            [
              [x0, cy - S * 0.2 * e],
              [x0 + S * 0.25, cy - S * 0.2 * e],
              [x0 + S * 0.6, cy - S * 0.48 * e],
              [x0 + S * 0.6, cy + S * 0.48 * e],
              [x0 + S * 0.25, cy + S * 0.2 * e],
              [x0, cy + S * 0.2 * e],
            ],
          ],
          sc.fg,
          a,
        )
        const en =
          env.energy != null ? clamp(env.energy * 1.4) : 0.55 + 0.4 * noise1(env.ltb * 3, P.seed)
        const lvl = Math.round(clamp(en) * nB * E.outCubic(clamp((env.lt - 0.15) / 0.5)))
        const wave: number[][] = [
          [x0 + S * 0.62, cy, S * 0.35, -45 * DEG, 45 * DEG],
          [x0 + S * 0.62, cy, S * 0.62, -45 * DEG, 45 * DEG],
        ]
        arcs(env, wave.slice(0, lvl > nB / 2 ? 2 : lvl > 0 ? 1 : 0), sc.fg, lw, a, false, 'round')
        const lit: number[][] = []
        const hot: number[][] = []
        const off: number[][] = []
        for (let i = 0; i < nB; i++) {
          const q = E.outBack(clamp((env.lt - 0.05 - i * 0.03) / 0.25), 1.6)
          if (q <= 0) continue
          const bh0 = S * (0.3 + (1.3 * (i + 1)) / nB) * q
          const x = x0 + S * 1.5 + i * (bwid + gap)
          const lane = i < lvl ? (i === lvl - 1 ? hot : lit) : off
          lane.push([x, yb - bh0, bwid, bh0])
        }
        rects(env, off, sc.sub, 0.3 * a)
        rects(env, lit, sc.fg, 0.9 * a)
        rects(env, hot, ac, a)
        label(env, `VOL ${pad2(lvl)}`, x0, yb + fs * 1, {
          size: fs,
          alpha: a * inE(env, 0.3, 0.2),
          track: 0.16,
        })
      }),
    },

    /* 音符：八分 / 符杠 / 四分音符从歌词旁边的空白里浮起来并轻轻摇摆 */
    musicNotes: {
      layer: 'front',
      w: 0.8,
      tags: ['pop', 'emotional', 'calm'],
      draw: settle((env, bb0, P) => {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = Math.min(10, 5 + (P.n | 0) * 2)
        const S = clamp(Math.min(W, H) * 0.036, 24 * u, 44 * u)
        const pad = 26 * u + bh(bb) * 0.15
        const X0 = bb.x0 - pad
        const X1 = bb.x1 + pad
        const Y0 = bb.y0 - pad
        const Y1 = bb.y1 + pad
        const per = 2 * (X1 - X0 + Y1 - Y0)
        const cols = [sc.fg, ACC(env), ACC2(env)]
        for (let i = 0; i < N; i++) {
          const rad = (k: number) => r(P.seed, i, k)
          const T = 2.2 + rad(1) * 1.2
          const t = env.ltb - rad(2) * 0.8
          if (t < 0) continue
          const cyc = Math.floor(t / T)
          const tau = (t - cyc * T) / T
          let pt = ((i + r(P.seed, i, cyc, 3)) / N) * per
          let x: number, y: number
          if (pt < X1 - X0) {
            x = X0 + pt
            y = Y0
          } else if ((pt -= X1 - X0) < Y1 - Y0) {
            x = X1
            y = Y0 + pt
          } else if ((pt -= Y1 - Y0) < X1 - X0) {
            x = X1 - pt
            y = Y1
          } else {
            pt -= X1 - X0
            x = X0
            y = Y1 - pt
          }
          const out = [Math.sign(x - (bb.x0 + bb.x1) / 2) || 1, -1]
          x += out[0] * tau * 40 * u + Math.sin(tau * TAU + i) * 12 * u
          y += -tau * 90 * u
          x = clamp(x, S, W - S)
          y = clamp(y, S * 1.5, H - S)
          const al = clearOf(bb, x, y, S * 1.1, 20 * u) * Math.sin(Math.PI * tau) * 1.4
          if (al <= 0.02) continue
          const q = E.outBack(clamp(tau * 5), 1.8)
          const s = S * (0.75 + 0.4 * r(P.seed, i, cyc, 4)) * q
          const col = cols[i % 3]
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((Math.sin(tau * 5 + i) * 14 - 6) * DEG)
          const type = (i + hash(P.seed, cyc)) % 3
          const a = o * Math.min(1, al)
          const lw = Math.max(1.2, s * 0.07)
          const head = (hx: number): Pt[] => ellP(hx, 0, s * 0.3, s * 0.21, -22 * DEG, 0, 360, 16)
          if (type === 2) {
            // 符杠连接的一对
            polys(env, [head(-s * 0.35), head(s * 0.45)], col, a)
            segs(
              env,
              [
                [-s * 0.35 + s * 0.26, -s * 0.05, -s * 0.35 + s * 0.26, -s * 1.05],
                [s * 0.45 + s * 0.26, -s * 0.05, s * 0.45 + s * 0.26, -s * 1.15],
              ],
              col,
              lw,
              a,
            )
            polys(
              env,
              [
                [
                  [-s * 0.09 - lw / 2, -s * 1.05],
                  [s * 0.71 + lw / 2, -s * 1.15],
                  [s * 0.71 + lw / 2, -s * 0.97],
                  [-s * 0.09 - lw / 2, -s * 0.87],
                ],
              ],
              col,
              a,
            )
          } else {
            polys(env, [head(0)], col, a)
            segs(env, [[s * 0.26, -s * 0.05, s * 0.26, -s * 1.05]], col, lw, a)
            if (type === 0)
              stroke(
                env,
                bez(
                  [s * 0.26, -s * 1.05],
                  [s * 0.3, -s * 0.8],
                  [s * 0.72, -s * 0.72],
                  [s * 0.55, -s * 0.35],
                  10,
                ),
                col,
                lw * 1.3,
                a,
                false,
                { cap: 'round' },
              )
          }
          ctx.restore()
        }
      }),
    },
  },
}
