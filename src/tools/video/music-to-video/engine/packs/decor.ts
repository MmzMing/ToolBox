/**
 * 部件包 decor：45 件图形装饰（HUD/测量标记、几何、粒子与光、手绘标记、文字装饰）。
 *
 * 逐条移植自 JIZURA 的 src/11p_decor.js（MIT）：坐标、常量、缓动曲线、hash 种子、
 * 随机调用顺序一律照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由
 * registry 锁定，不要改名、不要增删。
 *
 * 中文适配与必要的偏离（见移植契约）：
 * - 旧 J.romaji()（假名转罗马音）没有对应物，「ローマ字」部件的副行文案统一走
 *   `note || lineText` 兜底链，角色不变（歌词下方一行小号拉丁化副标题）；
 * - 脚本判定 isKanji / isHira / isKata 换成本仓库的 isHan / isKana；
 * - 字体名换成本仓库字体表：gothic_med→sans_med、gothic_light→sans_light、
 *   mincho→serif、mincho_light→serif_light、mincho_bold→serif_bold；
 * - 旧代码里 `const r = k => J.r(seed, i, k)` 这类局部随机别名会遮蔽本仓库导入的
 *   util.r（自引用会踩 TDZ），统一改名为 rv / rvb，调用参数不变；
 * - 部件画进画面的文字仍是 REC / LOCK / TC 这类拉丁缩写（录像与编辑风格的组成部分）。
 */
import type { BBox, Cut, DecorParam, Env, PackParts, TextItem } from '../types'
import { centerBB } from '../layouts'
import { measure } from '../text-layout'
import { isHan, isKana, isLatin, isPunct } from '../script'
import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  hash,
  lerp,
  lum,
  mix,
  noise1,
  r,
  rgba,
  rr,
  rs,
} from '../util'

type Pt = readonly [number, number]
type Quad = readonly [number, number, number, number]
type Dot = readonly [number, number, number]
type Poly = readonly Pt[]
type StrokeOpt = { cap?: CanvasLineCap; join?: CanvasLineJoin; close?: boolean }
/** nearBB / cornerSpot 的落点结果：左上角 + 中心 + 是否避开了歌词 */
type Spot = { x: number; y: number; cx: number; cy: number; ok: boolean; sx: number; sy: number }

/* ============================================================
   共用助手
   ============================================================ */

/** 1080 短边为 1 的缩放基准 */
const U = (env: Env) => Math.min(env.W, env.H) / 1080
/** 安全边距 */
const MG = (env: Env) => Math.round(Math.min(env.W, env.H) * 0.05)
const monoF = (env: Env) => env.st.fonts.mono[0] || 'mono'
const bodyF = (env: Env) => env.st.fonts.body[0] || 'sans_med'
const serifF = (env: Env) => env.st.fonts.serif[0] || 'serif'
const dark = (env: Env) => lum(env.sc.bg) < 0.5
const inE = (env: Env, d = 0.4, delay = 0, ease: (x: number) => number = E.outExpo): number =>
  ease(clamp((env.lt - delay) / d))
const outE = (env: Env) => 1 - E.inCubic(env.pOut)
const L2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** 副色（色散）只在 ghost 通道可用；非 main pass 且非 ghost 时什么都不画 */
const colOf = (env: Env, c: string, g: boolean): string | null =>
  env.pass === 'main' ? c : g ? env.passColor : null
const FS = (env: Env) => Math.max(12, 16 * U(env))

/** 歌词包围盒：记住本 cut 最后一次真实框，文字隐藏期间装饰也不会跳回画面中心 */
const BBC = new WeakMap<Cut, BBox>()
function getBB(env: Env, bb: BBox | null): BBox {
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
    if (env.cut) BBC.set(env.cut, b)
    return b
  }
  const c = env.cut ? BBC.get(env.cut) : undefined
  return c || centerBB(env, null)
}
const bw = (bb: BBox) => bb.x1 - bb.x0
const bh = (bb: BBox) => bb.y1 - bb.y0
const hitBB = (x0: number, y0: number, x1: number, y1: number, bb: BBox, pad = 0) =>
  !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad)

/** 把 w×h 的框贴到歌词外侧（不出安全边距），返回左上角 + 中心 */
function nearBB(env: Env, bb: BBox, w: number, h: number, P: DecorParam, gap: number): Spot {
  const { W, H } = env
  const m = MG(env) * 0.8
  const sx0 = P.right ? 1 : -1
  const sy0 = P.low ? 1 : -1
  const order: Pt[] = P.corner
    ? [
        [sx0, sy0],
        [-sx0, sy0],
        [sx0, -sy0],
        [-sx0, -sy0],
      ]
    : [
        [sx0, sy0],
        [sx0, -sy0],
        [-sx0, sy0],
        [-sx0, -sy0],
      ]
  const tries: [number, number, number, number][] = []
  for (const [sx, sy] of order) {
    const ax = sx > 0 ? bb.x1 - w : bb.x0
    const ox = sx > 0 ? bb.x1 + gap : bb.x0 - gap - w
    const ay = sy > 0 ? bb.y1 + gap : bb.y0 - gap - h
    const iy = sy > 0 ? bb.y1 - h : bb.y0
    if (P.v & 1) tries.push([ox, iy, sx, sy], [ax, ay, sx, sy], [ox, ay, sx, sy])
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

/** 避开歌词的一个画面角落（落在边距内侧）；实在躲不开就取重叠最小的角落 */
function cornerSpot(env: Env, bb: BBox, w: number, h: number, P: DecorParam, mk = 1): Spot {
  const { W, H } = env
  const m = MG(env) * mk
  const sx0 = P.right ? 1 : -1
  const sy0 = P.low ? 1 : -1
  const order: Pt[] = [
    [sx0, sy0],
    [-sx0, sy0],
    [sx0, -sy0],
    [-sx0, -sy0],
  ]
  let best: Spot | null = null
  let bestA = 1e18
  for (const [sx, sy] of order) {
    const X = sx > 0 ? W - m - w : m
    const Y = sy > 0 ? H - m - h : m
    const spot: Spot = { x: X, y: Y, cx: X + w / 2, cy: Y + h / 2, ok: true, sx, sy }
    if (!hitBB(X, Y, X + w, Y + h, bb, 8)) return spot
    const ov =
      Math.max(0, Math.min(X + w, bb.x1) - Math.max(X, bb.x0)) *
      Math.max(0, Math.min(Y + h, bb.y1) - Math.max(Y, bb.y0))
    if (ov < bestA) {
      bestA = ov
      best = { ...spot, ok: false }
    }
  }
  return best || { x: m, y: m, cx: m + w / 2, cy: m + h / 2, ok: false, sx: -1, sy: -1 }
}

/** 描一条折线（可选圆帽/闭合）；ghost=false 时只在 main pass 画 */
function stroke(
  env: Env,
  pts: readonly Pt[],
  c: string,
  lw: number,
  a = 1,
  g = false,
  o?: StrokeOpt,
): void {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !pts || pts.length < 2) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.strokeStyle = k
  ctx.lineWidth = lw
  ctx.lineCap = (o && o.cap) || 'butt'
  ctx.lineJoin = (o && o.join) || 'miter'
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  if (o && o.close) ctx.closePath()
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

/** 一批直线段，合并成一条路径 */
function segs(
  env: Env,
  list: readonly Quad[],
  c: string,
  lw: number,
  a = 1,
  g = false,
  cap?: CanvasLineCap,
): void {
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

/** 一批实心圆，合并成一条路径 */
function dots(env: Env, list: readonly Dot[], c: string, a = 1, g = false): void {
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

/** 一批实心矩形 */
function rects(env: Env, list: readonly Quad[], c: string, a = 1, g = false): void {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = k
  ctx.beginPath()
  for (const q of list) if (q[2] > 0 && q[3] > 0) ctx.rect(q[0], q[1], q[2], q[3])
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 一批实心多边形，合并成一条路径 */
function polys(env: Env, list: readonly Poly[], c: string, a = 1, g = false): void {
  const k = colOf(env, c, g)
  if (!k || a <= 0.003 || !list.length) return
  const ctx = env.ctx
  ctx.globalAlpha = Math.min(1, a)
  ctx.fillStyle = k
  ctx.beginPath()
  for (const pts of list) {
    if (pts.length < 3) continue
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

/** 虚线直线（只在 main pass） */
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
): void {
  if (env.pass !== 'main' || a <= 0.003) return
  const L = Math.hypot(x1 - x0, y1 - y0)
  if (L < 1) return
  const dx = (x1 - x0) / L
  const dy = (y1 - y0) / L
  const per = on + off
  const list: Quad[] = []
  let s = -(((phase % per) + per) % per)
  for (let i = 0; i < 600 && s < L; i++, s += per) {
    const a0 = Math.max(0, s)
    const a1 = Math.min(L, s + on)
    if (a1 > a0) list.push([x0 + dx * a0, y0 + dy * a0, x0 + dx * a1, y0 + dy * a1])
  }
  segs(env, list, c, lw, a, false)
}

/** 折线按长度比例 e0..e1 取子段（"画到一半"的描线效果） */
function part(pts: readonly Pt[], e0: number, e1: number): Pt[] {
  const f0 = clamp(e0)
  const f1 = clamp(e1)
  if (f1 <= f0 || pts.length < 2) return []
  const d = [0]
  for (let i = 1; i < pts.length; i++)
    d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = d[d.length - 1]
  if (L <= 0) return []
  const A = f0 * L
  const B = f1 * L
  const at = (s: number): Pt => {
    let i = 1
    while (i < d.length - 1 && d[i] < s) i++
    const k = (s - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1])
    return L2(pts[i - 1], pts[i], clamp(k))
  }
  const out = [at(A)]
  for (let i = 1; i < pts.length - 1; i++) if (d[i] > A && d[i] < B) out.push(pts[i])
  out.push(at(B))
  return out
}

/** 小号副文字（永远不参与色散） */
function label(env: Env, text: string | number, x: number, y: number, o?: Partial<TextItem>): void {
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
}
const textW = (text: string | number, font: string, size: number, track = 0.08) =>
  measure({ text: String(text), font, size, track }).w
const pad2 = (n: number, k = 2) => String(Math.max(0, Math.floor(n))).padStart(k, '0')

/** 从歌词里挑一个字：优先汉字，其次拉丁/假名 */
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

const star5 = (cx: number, cy: number, R: number, rr0: number, rot = -90): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * DEG
    const q = i % 2 ? rr0 : R
    o.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q])
  }
  return o
}
/** 四角内凹星芒 */
const glint = (cx: number, cy: number, R: number, w: number, rot = 0): Pt[] => {
  const o: Pt[] = []
  const n = 4
  for (let i = 0; i < n * 2; i++) {
    const a = rot * DEG + (i * Math.PI) / n
    const q = i % 2 ? w : R
    o.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q])
  }
  // 每条边中点向内吸 → 凹边
  const out: Pt[] = []
  for (let i = 0; i < o.length; i++) {
    out.push(o[i])
    out.push(L2(L2(o[i], o[(i + 1) % o.length], 0.5), [cx, cy], 0.35))
  }
  return out
}
const heart = (cx: number, cy: number, s: number): Pt[] => {
  const o: Pt[] = []
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * TAU
    const x = 16 * Math.pow(Math.sin(t), 3)
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    o.push([cx + (x * s) / 17, cy - (y * s) / 17])
  }
  return o
}
/** 超椭圆半径：放射线 / 集中线沿歌词外轮廓取点 */
const superR = (a: number, b: number, p: number, th: number) => {
  const c = Math.abs(Math.cos(th))
  const s = Math.abs(Math.sin(th))
  return 1 / Math.pow(Math.pow(c / a, p) + Math.pow(s / b, p), 1 / p)
}
/** 粒子在歌词附近淡出（front 粒子永远不压住文字） */
const clearOf = (bb: BBox, x: number, y: number, pad: number, soft: number) => {
  const dx = Math.max(bb.x0 - pad - x, 0, x - bb.x1 - pad)
  const dy = Math.max(bb.y0 - pad - y, 0, y - bb.y1 - pad)
  return clamp(Math.hypot(dx, dy) / soft)
}
const wrap = (v: number, lo: number, span: number) => lo + ((((v - lo) % span) + span) % span)

/** 七段数码管的亮段表 */
const SEG: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgedc',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
}
/** 日期印记的一块：段名 + 多边形（'q' 是起笔的小旗） */
type StampPiece = readonly [string, Poly]

/** 七段字的一个亮段，带轻微斜切 */
function segDigit(
  x: number,
  y: number,
  dw: number,
  dh: number,
  t: number,
  d: number,
  sk: number,
): StampPiece[] {
  const out: StampPiece[] = []
  const h2 = dh / 2
  const k = t / 2
  const hs = (x0: number, x1: number, yy: number): Pt[] => [
    [x0 + k, yy],
    [x0 + 2 * k, yy - k],
    [x1 - 2 * k, yy - k],
    [x1 - k, yy],
    [x1 - 2 * k, yy + k],
    [x0 + 2 * k, yy + k],
  ]
  const vs = (xx: number, y0: number, y1: number): Pt[] => [
    [xx, y0 + k],
    [xx + k, y0 + 2 * k],
    [xx + k, y1 - 2 * k],
    [xx, y1 - k],
    [xx - k, y1 - 2 * k],
    [xx - k, y0 + 2 * k],
  ]
  const S2: Record<string, Pt[]> = {
    a: hs(x, x + dw, y),
    g: hs(x, x + dw, y + h2),
    d: hs(x, x + dw, y + dh),
    f: vs(x, y, y + h2),
    b: vs(x + dw, y, y + h2),
    e: vs(x, y + h2, y + dh),
    c: vs(x + dw, y + h2, y + dh),
  }
  for (const s of SEG[d] || '')
    out.push([s, S2[s].map((p): Pt => [p[0] + (y + dh / 2 - p[1]) * sk, p[1]])])
  return out
}

/** 歌词上方 / 下方较空的一条横带（波形类部件用它选位置） */
function freeBand(env: Env, bb: BBox, low: boolean): { low: boolean; room: number; y: number } {
  const { H } = env
  const m = MG(env)
  const above = bb.y0 - m * 0.5
  const below = H - m * 0.5 - bb.y1
  let lo = low
  if ((lo ? below : above) < 60 * U(env) && (lo ? above : below) > (lo ? below : above)) lo = !lo
  const room = lo ? below : above
  const d = Math.min(room * 0.5, 40 * U(env) + room * 0.22)
  return { low: lo, room, y: lo ? bb.y1 + d : bb.y0 - d }
}

/** 花瓣轮廓（归一化，绘制时按尺寸 / 翻转缩放） */
const PETAL: Pt[] = (() => {
  const h: Pt[] = [
    [0, -0.5],
    [0.16, -0.38],
    [0.3, -0.18],
    [0.36, 0.04],
    [0.32, 0.24],
    [0.22, 0.42],
    [0.1, 0.5],
    [0, 0.4],
  ]
  return h.concat(
    h
      .slice(1, -1)
      .reverse()
      .map(([x, y]) => [-x, y]),
  )
})()

/** 手绘圈：绕歌词一圈带噪点的椭圆轨迹（可多绕 1.85 圈） */
function handLoop(env: Env, bb: BBox, P: DecorParam, turns: number): Pt[] {
  const u = U(env)
  const { W, H } = env
  const pad = 14 * u + Math.min(bw(bb), bh(bb)) * 0.08
  const hw = bw(bb) / 2
  const hh = bh(bb) / 2
  const cx = (bb.x0 + bb.x1) / 2
  const cy = (bb.y0 + bb.y1) / 2
  const lx = Math.max(hw * 0.9, Math.min(cx, W - cx) - 10 * u)
  const ly = Math.max(hh * 0.9, Math.min(cy, H - cy) - 10 * u)
  let A = Math.min(hw * 1.22 + pad, lx)
  let B = Math.min(hh * 1.22 + pad, ly)
  // 屏幕紧张时把歌词的角留在圈内（松散的圈可能擦到角）
  if ((hw / A) ** 2 + (hh / B) ** 2 > 1) {
    if (A < hw * 1.22 + pad)
      B = Math.min(ly, (hh / Math.sqrt(Math.max(0.06, 1 - (hw / A) ** 2))) * 0.96 + pad * 0.3)
    else A = Math.min(lx, (hw / Math.sqrt(Math.max(0.06, 1 - (hh / B) ** 2))) * 0.96 + pad * 0.3)
  }
  const th0 = (P.right ? -0.3 : 0.3) * Math.PI - Math.PI / 2
  const dir = P.right ? 1 : -1
  const M = 140
  const pts: Pt[] = []
  const tilt = rs(P.seed, 1) * 2 * DEG
  for (let i = 0; i <= M; i++) {
    const t = i / M
    const th = th0 + dir * t * turns * TAU
    const k =
      1 + 0.03 * noise1(t * 6 + (P.seed % 97), P.seed) + 0.05 * Math.max(0, t * turns - 0.85)
    const x = Math.cos(th) * A * k
    const y = Math.sin(th) * B * k
    pts.push([
      cx + x * Math.cos(tilt) - y * Math.sin(tilt),
      cy + x * Math.sin(tilt) + y * Math.cos(tilt),
    ])
  }
  return pts
}

/** 副标"解码"过程中的乱码字符池 */
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 方螺线的四个前进方向 */
const SPIRAL_DIRS: Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** 隅付き括弧的一侧：外边是直线、内侧鼓出的透镜形（side=-1 为【） */
function lentil(xo: number, yT: number, yB: number, aw: number, tb: number, side: number): Pt[] {
  const pts: Pt[] = [
    [xo, yT],
    [xo - side * aw, yT],
  ]
  const M = 16
  const h = yB - yT
  for (let i = 1; i < M; i++) {
    const t = i / M
    const b = Math.pow(Math.sin(t * Math.PI), 0.7)
    pts.push([xo - side * (aw - (aw - tb) * b), yT + h * t])
  }
  pts.push([xo - side * aw, yB], [xo, yB])
  return pts
}

export const pack: PackParts = {
  decor: {
    /* ============================================================
       HUD / 技术标记
       ============================================================ */

    /* 照準线 — 穿过歌词中心、在文字两侧断开的十字发丝线，断口附近有刻度 */
    crosshair: {
      w: 1,
      tags: ['graphic', 'editorial', 'glitch'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        const gx = 26 * u + bw(bb) * 0.02
        const gy = 22 * u + bh(bb) * 0.1
        const v = (P.v | 0) % 3
        const lw = Math.max(1, 1.3 * u)
        // 竖向臂总是画；横向臂只在歌词两侧还有余地时画
        const arms: [Pt, Pt][] = [
          [
            [cx, bb.y0 - gy],
            [cx, m * 0.5],
          ],
          [
            [cx, bb.y1 + gy],
            [cx, H - m * 0.5],
          ],
          [
            [bb.x0 - gx, cy],
            [m * 0.5, cy],
          ],
          [
            [bb.x1 + gx, cy],
            [W - m * 0.5, cy],
          ],
        ]
        const pOut = E.inCubic(env.pOut)
        arms.forEach(([a, b], i) => {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1])
          if (len < 40 * u) return
          const ee = E.outExpo(clamp((env.lt - i * 0.06) / 0.6))
          if (ee <= pOut) return
          stroke(env, [L2(a, b, pOut), L2(a, b, ee)], sc.sub, lw, 0.75)
          const dx = (b[0] - a[0]) / len
          const dy = (b[1] - a[1]) / len
          const nx = -dy
          const ny = dx
          if (v !== 2 || i < 2) {
            // 断口附近的刻度
            const st = 10 * u
            const nt = Math.min(20, Math.floor((len * 0.5) / st))
            const list: Quad[] = []
            for (let t = 1; t <= nt; t++) {
              const d = t * st
              if (d > len * ee || d < len * pOut) continue
              const tl = (t % 5 === 0 ? 8 : 3.5) * u * clamp((ee * len - d) / (40 * u))
              list.push([
                a[0] + dx * d - nx * tl,
                a[1] + dy * d - ny * tl,
                a[0] + dx * d + nx * tl,
                a[1] + dy * d + ny * tl,
              ])
            }
            segs(env, list, sc.fg, lw, 0.8 * o)
          }
          const cap = 9 * u * ee // 内端的强调色端帽
          if (pOut < 0.02)
            stroke(
              env,
              [
                [a[0] - nx * cap, a[1] - ny * cap],
                [a[0] + nx * cap, a[1] + ny * cap],
              ],
              i < 2 || P.accent ? sc.accent : sc.fg,
              2.4 * u,
              ee * o,
            )
          if (v === 1) env.circle(b[0], b[1], 3 * u * ee, null, sc.fg, lw, o * ee, false)
        })
        if (v !== 2) {
          const e = inE(env, 0.3, 0.35) * o
          const fs = FS(env) * 0.85
          label(env, `Y ${pad2(bb.y0, 4)}`, cx + 12 * u, bb.y0 - gy - fs * 0.9, {
            size: fs,
            alpha: e,
          })
          label(env, `Y ${pad2(bb.y1, 4)}`, cx + 12 * u, bb.y1 + gy + fs * 0.9, {
            size: fs,
            alpha: e,
          })
          label(env, `X ${pad2(cx, 4)}`, cx - 12 * u, H - m * 0.5 - fs * 0.6, {
            size: fs,
            align: 'right',
            alpha: e,
            color: sc.fg,
          })
        }
      },
    },

    /* トンボ — 印刷用规线（角规线 + 中央十字 + 套准圆），框住歌词 */
    cropMarks: {
      w: 1.1,
      tags: ['editorial', 'graphic', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003) return
        const pad = 14 * u + Math.min(bw(bb), bh(bb)) * 0.08 + P.r * 10 * u
        const cm = 12 * u
        const X0 = Math.max(cm, bb.x0 - pad)
        const X1 = Math.min(env.W - cm, bb.x1 + pad)
        const Y0 = Math.max(cm, bb.y0 - pad)
        const Y1 = Math.min(env.H - cm, bb.y1 + pad)
        const g = 8 * u
        const Lm = 26 * u + Math.min(bw(bb), bh(bb)) * 0.05
        const b = 9 * u
        const lw = Math.max(1, 1 * u)
        const col = sc.fg
        const corners: Pt[] = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]
        corners.forEach(([sx, sy], k) => {
          const e = E.outExpo(clamp((env.lt - k * 0.05) / 0.45))
          if (e <= 0) return
          const X = sx < 0 ? X0 : X1
          const Y = sy < 0 ? Y0 : Y1
          const hl = (y: number): Pt[] => [
            [X + sx * g, y],
            [X + sx * (g + Lm * e), y],
          ]
          const vl = (x: number): Pt[] => [
            [x, Y + sy * g],
            [x, Y + sy * (g + Lm * e)],
          ]
          const h0 = hl(Y)
          const v0 = vl(X)
          const h1 = hl(Y + sy * b)
          const v1 = vl(X + sx * b)
          segs(
            env,
            [
              [...h0[0], ...h0[1]],
              [...v0[0], ...v0[1]],
            ],
            col,
            lw,
            0.9 * o,
          )
          segs(
            env,
            [
              [...h1[0], ...h1[1]],
              [...v1[0], ...v1[1]],
            ],
            col,
            lw,
            0.55 * o,
          )
        })
        // 中央十字 + 套准圆
        const e2 = inE(env, 0.45, 0.15)
        if (e2 <= 0) return
        const cx = (X0 + X1) / 2
        const cy = (Y0 + Y1) / 2
        const cl = 20 * u * e2
        const rc = 6 * u
        const col2 = P.accent ? sc.accent : sc.fg
        const marks: Quad[] = [
          [cx, Y0 - g, 0, -1],
          [cx, Y1 + g, 0, 1],
        ]
        if (P.big || bh(bb) > bw(bb)) marks.push([X0 - g, cy, -1, 0], [X1 + g, cy, 1, 0])
        for (const [x, y, dx, dy] of marks) {
          const ex = x + dx * cl
          const ey = y + dy * cl
          const mx = x + dx * cl * 0.55
          const my = y + dy * cl * 0.55
          segs(
            env,
            [
              [x, y, ex, ey],
              [mx - dy * cl * 0.45, my - dx * cl * 0.45, mx + dy * cl * 0.45, my + dx * cl * 0.45],
            ],
            col2,
            lw,
            0.85 * o,
          )
          if (P.big) env.circle(mx, my, rc * e2, null, col2, lw, 0.85 * o, false)
        }
      },
    },

    /* ロックオン — 收缩、旋转并锁定在歌词旁的瞄准环 */
    reticle: {
      w: 0.9,
      tags: ['glitch', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(bw(bb), bh(bb)) * 0.3, 40 * u, 72 * u)
        const LW = FS(env) * 3.6
        const sp = nearBB(env, bb, R * 2.8 + LW, R * 2.6, P, 18 * u)
        const lLeft = sp.cx > env.W / 2
        const cx = lLeft ? sp.x + LW + R * 1.4 : sp.x + R * 1.4
        const cy = sp.cy
        const lock = E.outExpo(clamp(env.lt / 0.6))
        const rad = R * (2.1 - 1.1 * lock) * (1 + 0.25 * E.inCubic(env.pOut))
        const rot = (1 - lock) * 140 + env.ltb * 16 + P.r * 90
        const lw = Math.max(1.2, 1.6 * u)
        const a = Math.min(1, env.lt / 0.12) * o
        const on = lock > 0.97 || env.step % 2 === 0
        for (let k = 0; k < 4; k++)
          env.arc(
            cx,
            cy,
            rad,
            rot + k * 90 - 28,
            rot + k * 90 + 28,
            sc.fg,
            lw,
            a * (on ? 1 : 0.5),
            false,
          )
        env.arc(cx, cy, rad * 0.62, -90, -90 + 360 * lock, sc.sub, Math.max(1, u), a * 0.6, false)
        const tk: Quad[] = []
        for (let k = 0; k < 4; k++) {
          const an = k * 90 * DEG
          tk.push([
            cx + Math.cos(an) * rad * 0.74,
            cy + Math.sin(an) * rad * 0.74,
            cx + Math.cos(an) * rad * 1.16,
            cy + Math.sin(an) * rad * 1.16,
          ])
        }
        segs(env, tk, sc.fg, Math.max(1, u), a * 0.9)
        const tri: Poly[] = []
        const r2 = rad * 1.32
        for (let k = 0; k < 3; k++) {
          const an = (-env.ltb * 30 + k * 120 + P.r * 60) * DEG
          const px = cx + Math.cos(an) * r2
          const py = cy + Math.sin(an) * r2
          const s = 5 * u
          const ix = -Math.cos(an)
          const iy = -Math.sin(an)
          const nx = -iy
          const ny = ix
          tri.push([
            [px + ix * s, py + iy * s],
            [px - ix * s * 0.6 + nx * s * 0.8, py - iy * s * 0.6 + ny * s * 0.8],
            [px - ix * s * 0.6 - nx * s * 0.8, py - iy * s * 0.6 - ny * s * 0.8],
          ])
        }
        polys(env, tri, sc.accent, a)
        env.circle(
          cx,
          cy,
          2.6 * u,
          sc.accent,
          null,
          0,
          a * (lock > 0.97 ? 1 : env.step % 2 ? 1 : 0.2),
          false,
        )
        const fs = FS(env) * 0.9
        const lx = lLeft ? cx - R * 1.5 : cx + R * 1.5
        const al = lLeft ? 'right' : 'left'
        label(env, lock > 0.97 ? 'LOCK' : 'SCAN', lx, cy - R * 0.9, {
          size: fs,
          align: al,
          color: lock > 0.97 ? sc.accent : sc.sub,
          alpha: a,
        })
        label(env, (lock * 100).toFixed(1).padStart(5, '0'), lx, cy - R * 0.9 + fs * 1.3, {
          size: fs,
          align: al,
          alpha: a * 0.8,
        })
      },
    },

    /* レーダー — 空闲角落里带扫掠波束与亮点的小雷达 */
    radar: {
      w: 0.7,
      tags: ['glitch', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.07, 40 * u, 96 * u)
        const fs = FS(env) * 0.85
        const sp = cornerSpot(env, bb, R * 2 + 8 * u, R * 2 + fs * 2.2, P)
        const cx = sp.cx
        const cy = sp.y + R + 4 * u
        const e = E.outExpo(clamp(env.lt / 0.5))
        const s = e * (1 - 0.15 * E.inCubic(env.pOut))
        const rr0 = R * s
        const lw = Math.max(1, u)
        const a = o * (sp.ok ? 1 : 0.35)
        ;[1, 0.66, 0.33].forEach((k, i) =>
          env.arc(
            cx,
            cy,
            rr0 * k,
            -90,
            -90 + 360 * clamp(e * 1.4 - i * 0.15),
            sc.sub,
            lw,
            0.55 * a,
            false,
          ),
        )
        segs(
          env,
          [
            [cx - rr0, cy, cx + rr0, cy],
            [cx, cy - rr0, cx, cy + rr0],
          ],
          sc.sub,
          lw,
          0.3 * a,
        )
        const tk: Quad[] = []
        for (let i = 0; i < 36; i++) {
          const an = i * 10 * DEG
          const l = i % 3 === 0 ? 5 * u : 2.5 * u
          tk.push([
            cx + Math.cos(an) * rr0,
            cy + Math.sin(an) * rr0,
            cx + Math.cos(an) * (rr0 + l),
            cy + Math.sin(an) * (rr0 + l),
          ])
        }
        segs(env, tk, sc.fg, lw, 0.6 * a)
        const sw = (env.ltb * 150 + P.r * 360) % 360
        for (let k = 14; k >= 0; k--) {
          const an = (sw - k * 3.2) * DEG
          stroke(
            env,
            [
              [cx, cy],
              [cx + Math.cos(an) * rr0, cy + Math.sin(an) * rr0],
            ],
            sc.accent,
            k ? lw : 1.6 * lw,
            a * (k ? 0.3 * (1 - k / 15) : 0.95),
          )
        }
        const bl: Quad[] = []
        for (let i = 0; i < 3 + (P.n | 0); i++) {
          const ang = r(P.seed, i, 1) * 360
          const rad = rr(0.2, 0.9, P.seed, i, 2)
          const since = (((sw - ang) % 360) + 360) % 360
          const glow = Math.exp(-since / 70)
          if (glow > 0.03)
            bl.push([
              cx + Math.cos(ang * DEG) * rr0 * rad,
              cy + Math.sin(ang * DEG) * rr0 * rad,
              (2 + 2.2 * glow) * u,
              glow,
            ])
        }
        for (const b of bl) env.circle(b[0], b[1], b[2], sc.fg, null, 0, a * b[3], false)
        const ea = inE(env, 0.3, 0.3) * a
        label(env, `RDR-${pad2((cut.line | 0) + 1)}`, cx - R, sp.y + R * 2 + fs * 1.4, {
          size: fs,
          alpha: ea,
        })
        label(env, `${pad2(sw, 3)}°`, cx + R, sp.y + R * 2 + fs * 1.4, {
          size: fs,
          align: 'right',
          alpha: ea,
          color: sc.fg,
        })
      },
    },

    /* 進行リング — 随本镜头进度填充的细环形量表 */
    progressRing: {
      w: 0.9,
      tags: ['graphic', 'editorial', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.05, 34 * u, 64 * u)
        const sp = nearBB(env, bb, R * 2 + 24 * u, R * 2 + 24 * u, P, 22 * u)
        const cx = sp.cx
        const cy = sp.cy
        const lw = Math.max(1, u)
        const e = E.outExpo(clamp(env.lt / 0.5))
        const a = o * (sp.ok ? 1 : 0.4)
        const prog = clamp(env.lt / Math.max(0.1, cut.dur))
        const tk: Quad[] = []
        const nT = 60
        for (let i = 0; i < nT * e; i++) {
          const an = (-90 + i * 6) * DEG
          const l = i % 5 === 0 ? 6 * u : 3 * u
          const r0 = R + 6 * u
          tk.push([
            cx + Math.cos(an) * r0,
            cy + Math.sin(an) * r0,
            cx + Math.cos(an) * (r0 + l),
            cy + Math.sin(an) * (r0 + l),
          ])
        }
        segs(env, tk, sc.sub, lw, 0.55 * a)
        if ((P.v | 0) % 2) {
          const nS = 24
          for (let i = 0; i < nS; i++) {
            const a0 = -90 + (i * 360) / nS + 2
            const a1 = a0 + 360 / nS - 4
            const lit = (i + 1) / nS <= prog + 1e-3
            if (i / nS > e) break
            env.arc(
              cx,
              cy,
              R,
              a0,
              a1,
              lit ? sc.accent : sc.sub,
              lit ? 3 * u : lw,
              a * (lit ? 1 : 0.35),
              false,
            )
          }
        } else {
          env.arc(cx, cy, R, -90, -90 + 360 * e, sc.sub, lw, 0.35 * a, false)
          env.arc(cx, cy, R, -90, -90 + 360 * prog * e, sc.accent, 2.6 * u, a, false)
          const ha = (-90 + 360 * prog * e) * DEG
          env.circle(
            cx + Math.cos(ha) * R,
            cy + Math.sin(ha) * R,
            3.2 * u,
            sc.accent,
            null,
            0,
            a,
            false,
          )
        }
        const fs = R * 0.52
        label(env, pad2(prog * 100), cx - fs * 0.12, cy, {
          size: fs,
          align: 'center',
          color: sc.fg,
          alpha: a * e,
          track: 0.02,
        })
        label(env, '%', cx + fs * 0.72, cy + fs * 0.12, {
          size: fs * 0.42,
          align: 'left',
          alpha: a * e,
        })
      },
    },
    /* タイムコード — 滚动的 SMPTE 读数 + 带入出点的小进度条 */
    timecodeBar: {
      w: 0.9,
      tags: ['editorial', 'glitch', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fs = FS(env)
        const w = Math.min(W * 0.38, 460 * u)
        const h = fs * 3.4
        let low = !!P.low
        const x0 = P.right ? W - m - w : m
        let y0 = low ? H - m - h : m
        if (hitBB(x0, y0, x0 + w, y0 + h, bb, 10 * u)) {
          low = !low
          y0 = low ? H - m - h : m
        }
        const a = o * (hitBB(x0, y0, x0 + w, y0 + h, bb, 0) ? 0.3 : 1)
        const e = E.outExpo(clamp(env.lt / 0.5))
        const t = Math.max(0, env.t || 0)
        const fr = Math.floor(t * 24)
        const tc = `${pad2(t / 3600)}:${pad2((t / 60) % 60)}:${pad2(t % 60)}:${pad2(fr % 24)}`
        const n = Math.ceil(tc.length * clamp(env.lt / 0.35))
        const ty = y0 + fs * 0.8
        const tcW = textW('TC ', monoF(env), fs * 0.8, 0.1)
        label(env, 'TC', x0, ty + fs * 0.12, { size: fs * 0.8, color: sc.accent, alpha: a })
        label(env, tc.slice(0, n), x0 + tcW, ty, {
          size: fs * 1.25,
          color: sc.fg,
          alpha: a,
          track: 0.06,
        })
        label(env, `F ${pad2(Math.floor(env.lt * 24), 4)}`, x0 + w, ty + fs * 0.12, {
          size: fs * 0.8,
          align: 'right',
          alpha: a * e,
        })
        // 迷你进度条
        const by = y0 + h - fs * 0.6
        const lw = Math.max(1, u)
        const prog = clamp(env.lt / Math.max(0.1, cut.dur))
        stroke(
          env,
          [
            [x0, by],
            [x0 + w * e, by],
          ],
          sc.sub,
          lw,
          0.6 * a,
        )
        const tk: Quad[] = []
        for (let i = 0; i <= 48; i++) {
          const x = x0 + (w * i) / 48
          if (x > x0 + w * e) break
          const l = i % 12 === 0 ? 7 * u : i % 4 === 0 ? 4 * u : 2 * u
          tk.push([x, by, x, by - l])
        }
        segs(env, tk, sc.sub, lw, 0.6 * a)
        const px = x0 + w * prog * e
        stroke(
          env,
          [
            [x0, by],
            [px, by],
          ],
          sc.fg,
          2.2 * u,
          a,
        )
        polys(
          env,
          [
            [
              [px - 5 * u, by - 12 * u],
              [px + 5 * u, by - 12 * u],
              [px, by - 4 * u],
            ],
          ],
          sc.accent,
          a,
        )
        const ib: Quad[] = [
          [x0, by + 4 * u, x0, by + 10 * u],
          [x0 + w * e, by + 4 * u, x0 + w * e, by + 10 * u],
        ]
        segs(env, ib, sc.fg, lw, a * e)
        label(env, 'IN', x0 + 4 * u, by + 9 * u + fs * 0.35, {
          size: fs * 0.6,
          alpha: a * e * 0.8,
        })
        label(env, 'OUT', x0 + w * e - 4 * u, by + 9 * u + fs * 0.35, {
          size: fs * 0.6,
          align: 'right',
          alpha: a * e * 0.8,
        })
      },
    },

    /* 端の定規 — 贴在一侧画面边缘的刻度尺，标尺随歌词位置对齐 */
    rulerEdge: {
      w: 1,
      tags: ['editorial', 'graphic', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const vert = !!P.corner
        const fs = FS(env) * 0.72
        const lw = Math.max(1, u)
        const st = 10 * u
        const e = E.outCubic(clamp(env.lt / 0.55))
        const len = vert ? H : W
        const a0 = m
        const a1 = len - m
        const side = vert ? (P.right ? 1 : -1) : P.low ? 1 : -1
        const base = vert
          ? side > 0
            ? W - m * 0.55
            : m * 0.55
          : side > 0
            ? H - m * 0.55
            : m * 0.55
        const inward = -side
        const P2 = (along: number, off: number): Pt =>
          vert ? [base + inward * off, along] : [along, base + inward * off]
        const n = Math.floor((a1 - a0) / st)
        const list: Quad[] = []
        const head = a0 + (a1 - a0) * e
        for (let i = 0; i <= n; i++) {
          const s = a0 + i * st
          if (s > head) break
          const l = (i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 4.5) * u * clamp((head - s) / (60 * u))
          const p = P2(s, 0)
          const q = P2(s, l)
          list.push([p[0], p[1], q[0], q[1]])
        }
        const a = o
        segs(env, list, sc.sub, lw, 0.7 * a)
        stroke(env, [P2(a0, 0), P2(head, 0)], sc.sub, lw, 0.5 * a)
        for (let i = 0; i <= n; i += 10) {
          const s = a0 + i * st
          if (s > head - 20 * u) break
          const q = P2(s + (vert ? 0 : 3 * u), 20 * u + fs * 0.4)
          label(env, pad2(i, 3), q[0], q[1], {
            size: fs,
            align: vert ? (inward > 0 ? 'left' : 'right') : 'left',
            alpha: 0.7 * a,
          })
        }
        // 歌词区间标记
        const em = inE(env, 0.5, 0.2, E.outCubic) * o
        if (em <= 0) return
        const lo = vert ? bb.y0 : bb.x0
        const hi = vert ? bb.y1 : bb.x1
        const mid = (lo + hi) / 2
        const from = vert ? H / 2 : W / 2
        const Lo = lerp(from, clamp(lo, a0, a1), em)
        const Hi = lerp(from, clamp(hi, a0, a1), em)
        const Mid = lerp(from, clamp(mid, a0, a1), em)
        const off = 26 * u
        stroke(env, [P2(Lo, off), P2(Hi, off)], sc.accent, 2 * u, 0.9 * em)
        segs(
          env,
          [
            [...P2(Lo, off - 5 * u), ...P2(Lo, off + 5 * u)],
            [...P2(Hi, off - 5 * u), ...P2(Hi, off + 5 * u)],
          ],
          sc.accent,
          2 * u,
          0.9 * em,
        )
        const tp = P2(Mid, 3 * u)
        const s5 = 5 * u
        const tri: Poly = vert
          ? [
              [tp[0], tp[1]],
              [tp[0] + inward * s5 * 1.6, tp[1] - s5],
              [tp[0] + inward * s5 * 1.6, tp[1] + s5],
            ]
          : [
              [tp[0], tp[1]],
              [tp[0] - s5, tp[1] + inward * s5 * 1.6],
              [tp[0] + s5, tp[1] + inward * s5 * 1.6],
            ]
        polys(env, [tri], sc.fg, em)
        const lp = P2(Mid, off + 8 * u + fs)
        label(env, `${pad2(hi - lo, 4)}`, lp[0] + (vert ? 0 : 6 * u), lp[1], {
          size: fs,
          color: sc.fg,
          align: vert ? (inward > 0 ? 'left' : 'right') : 'left',
          alpha: em,
        })
      },
    },

    /* 寸法線 — 工程图式的尺寸标注线（宽度；big 时再加高度） */
    dimension: {
      w: 1,
      tags: ['editorial', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const lw = Math.max(1, u)
        const fs = FS(env) * 0.85
        const arch = (P.v | 0) % 2 === 1
        const gap = 20 * u + bh(bb) * 0.1
        let below = !!P.low
        let y = below ? bb.y1 + gap : bb.y0 - gap
        if (y < m * 0.6 || y > H - m * 0.6) {
          below = !below
          y = below ? bb.y1 + gap : bb.y0 - gap
        }
        const e = E.outExpo(clamp(env.lt / 0.55))
        const e2 = inE(env, 0.35, 0.05)
        const x0 = bb.x0
        const x1 = bb.x1
        const cx = (x0 + x1) / 2
        const sy = below ? 1 : -1
        const lab = `${Math.round(x1 - x0)}`
        const lwid = textW(lab, monoF(env), fs, 0.08) + 14 * u
        const X0 = lerp(cx, x0, e)
        const X1 = lerp(cx, x1, e)
        // 延伸线
        const ext: Quad[] = [
          [x0, (below ? bb.y1 : bb.y0) + sy * 6 * u, x0, y + sy * 8 * u],
          [x1, (below ? bb.y1 : bb.y0) + sy * 6 * u, x1, y + sy * 8 * u],
        ]
        segs(
          env,
          ext.map((s): Quad => [s[0], s[1], s[2], lerp(s[1], s[3], e2)]),
          sc.sub,
          lw,
          0.7 * o,
        )
        // 中间留出数值缺口的尺寸线
        if (X1 - X0 > lwid)
          segs(
            env,
            [
              [X0, y, cx - lwid / 2, y],
              [cx + lwid / 2, y, X1, y],
            ],
            sc.fg,
            lw,
            0.9 * o,
          )
        const ea = clamp((e - 0.7) / 0.3) * o
        if (arch)
          segs(
            env,
            [
              [x0 - 5 * u, y + 5 * u, x0 + 5 * u, y - 5 * u],
              [x1 - 5 * u, y + 5 * u, x1 + 5 * u, y - 5 * u],
            ],
            sc.fg,
            1.6 * u,
            ea,
          )
        else
          polys(
            env,
            [
              [
                [x0, y],
                [x0 + 10 * u, y - 3.5 * u],
                [x0 + 10 * u, y + 3.5 * u],
              ],
              [
                [x1, y],
                [x1 - 10 * u, y - 3.5 * u],
                [x1 - 10 * u, y + 3.5 * u],
              ],
            ],
            sc.fg,
            ea,
          )
        label(env, lab, cx, y, {
          size: fs,
          align: 'center',
          color: P.accent ? sc.accent : sc.fg,
          alpha: e2 * o,
        })
        // 一侧的高度标注
        if (P.big || (P.v | 0) % 3 === 0) {
          const gx = 20 * u + bw(bb) * 0.02
          let right = !!P.right
          let x = right ? bb.x1 + gx : bb.x0 - gx
          if (x < m || x > W - m) {
            right = !right
            x = right ? bb.x1 + gx : bb.x0 - gx
          }
          const sx = right ? 1 : -1
          const cy = (bb.y0 + bb.y1) / 2
          const Y0 = lerp(cy, bb.y0, e)
          const Y1 = lerp(cy, bb.y1, e)
          const labH = `${Math.round(bh(bb))}`
          const lh = textW(labH, monoF(env), fs, 0.08) + 14 * u
          const ex2: Quad[] = [
            [(right ? bb.x1 : bb.x0) + sx * 6 * u, bb.y0, x + sx * 8 * u, bb.y0],
            [(right ? bb.x1 : bb.x0) + sx * 6 * u, bb.y1, x + sx * 8 * u, bb.y1],
          ]
          segs(
            env,
            ex2.map((s): Quad => [lerp(s[0], s[2], e2), s[1], s[2], s[3]]),
            sc.sub,
            lw,
            0.7 * o,
          )
          if (Y1 - Y0 > lh)
            segs(
              env,
              [
                [x, Y0, x, cy - lh / 2],
                [x, cy + lh / 2, x, Y1],
              ],
              sc.fg,
              lw,
              0.9 * o,
            )
          if (arch)
            segs(
              env,
              [
                [x - 5 * u, bb.y0 + 5 * u, x + 5 * u, bb.y0 - 5 * u],
                [x - 5 * u, bb.y1 + 5 * u, x + 5 * u, bb.y1 - 5 * u],
              ],
              sc.fg,
              1.6 * u,
              ea,
            )
          else
            polys(
              env,
              [
                [
                  [x, bb.y0],
                  [x - 3.5 * u, bb.y0 + 10 * u],
                  [x + 3.5 * u, bb.y0 + 10 * u],
                ],
                [
                  [x, bb.y1],
                  [x - 3.5 * u, bb.y1 - 10 * u],
                  [x + 3.5 * u, bb.y1 - 10 * u],
                ],
              ],
              sc.fg,
              ea,
            )
          label(env, labH, x, cy, {
            size: fs,
            align: 'center',
            rot: -90,
            color: sc.fg,
            alpha: e2 * o,
          })
        }
      },
    },

    /* 通し番号 — 空闲角落里的细字序号 "03 / 12"，数字逐位滚动 */
    indexNum: {
      w: 1,
      tags: ['editorial', 'graphic', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const lines = env.plan.lines ? env.plan.lines.length : 0
        const idx = cut.line >= 0 ? (cut.line | 0) + 1 : ((cut.index ?? 0) | 0) + 1
        const num = pad2(idx)
        const tot = '/' + pad2(Math.max(lines, idx))
        const font = (P.v | 0) % 2 ? 'serif_light' : 'sans_light'
        const S = clamp(Math.min(env.W, env.H) * 0.1, 64 * u, 132 * u)
        const ts = S * 0.3
        const nw = textW(num, font, S, 0.02)
        const tw = textW(tot, font, ts, 0.06)
        const w = nw + tw + S * 0.12
        const h = S * 1.25
        const sp = cornerSpot(env, bb, w, h, P, 1.1)
        const a = o * (sp.ok ? 1 : 0.35) * E.outCubic(clamp(env.lt / 0.2))
        const x0 = sp.x
        const base = sp.y + S * 0.8
        const ctx = env.ctx
        const digits = [...num]
        let x = x0
        // 滚动数字：裁出一个字宽的窗口（只在 main pass）
        if (env.pass === 'main') {
          digits.forEach((d, i) => {
            const dw = textW(d, font, S, 0.02)
            const p = E.outExpo(clamp((env.lt - 0.04 - i * 0.08) / 0.55))
            const steps = P.mode === 'count' ? 6 + i * 3 : 3
            const off = (1 - p) * steps // 还要滚过几个数字
            ctx.save()
            ctx.beginPath()
            ctx.rect(x - 2, base - S * 0.5, dw + 4, S * 0.98)
            ctx.clip()
            const fl = Math.floor(off)
            const frac = off - fl
            for (let k = 0; k <= (frac > 0.001 ? 1 : 0); k++) {
              const val = (((+d - (fl + k)) % 10) + 10) % 10
              const dy = (k - frac) * S * 1.25
              env.draw({
                text: String(val),
                font,
                size: S,
                x: x + dw / 2,
                y: base + dy,
                color: sc.fg,
                align: 'center',
                track: 0.02,
                alpha: a * (1 - Math.abs(k - frac) * 0.6),
                ghost: false,
              })
            }
            ctx.restore()
            x += dw
          })
        } else x += nw
        const e2 = inE(env, 0.4, 0.25)
        label(env, tot, x + S * 0.1, base + S * 0.26, {
          font,
          size: ts,
          color: sc.sub,
          alpha: a * e2,
          track: 0.06,
        })
        const ry = base + S * 0.52
        stroke(
          env,
          [
            [x0, ry],
            [x0 + w * E.outExpo(clamp((env.lt - 0.1) / 0.5)), ry],
          ],
          sc.sub,
          Math.max(1, u),
          0.8 * a,
        )
        env.rect(x0, ry - 1.5 * u, S * 0.22 * e2, 3 * u, sc.accent, a, false)
        label(env, cut.line >= 0 ? 'LYRIC' : 'INTRO', x0, ry + FS(env) * 0.9, {
          size: FS(env) * 0.72,
          alpha: a * e2,
          track: 0.3,
        })
      },
    },

    /* 日付写真 — 老胶片相机式的橙色七段数码日期印记 */
    dateStamp: {
      w: 0.7,
      tags: ['emotional', 'pop', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const yy = hash(P.seed, 1) % 2 ? 90 + (hash(P.seed, 2) % 10) : hash(P.seed, 3) % 27
        const mm = 1 + (hash(P.seed, 4) % 12)
        const dd = 1 + (hash(P.seed, 5) % 28)
        const groups = [pad2(yy), String(mm), pad2(dd)]
        const dh = clamp(Math.min(env.W, env.H) * 0.034, 24 * u, 46 * u)
        const dw = dh * 0.52
        const t = dh * 0.12
        const gapD = dw * 0.42
        const gapG = dw * 1.35
        const width = groups.reduce((s, g) => s + g.length * (dw + gapD), 0) + gapG * 2 + dw * 0.5
        const sp = cornerSpot(
          env,
          bb,
          width,
          dh * 1.4,
          { ...P, right: (P.v | 0) % 3 === 2 ? !P.right : true, low: true },
          1.2,
        )
        let x = sp.x + dw * 0.5
        const y = sp.y + dh * 0.2
        const pieces: StampPiece[] = []
        pieces.push([
          'q',
          [
            [x - dw * 0.1, y - t * 0.2],
            [x + t * 0.9, y - t * 0.2],
            [x + t * 0.2, y + dh * 0.32],
            [x - dw * 0.1 - t * 0.6, y + dh * 0.32],
          ],
        ])
        x += dw * 0.35
        groups.forEach((g) => {
          for (const ch of g) {
            segDigit(x, y, dw, dh, t, +ch, 0.1).forEach((s) => pieces.push(s))
            x += dw + gapD
          }
          x += gapG - gapD
        })
        const ctx = env.ctx
        const col = sc.accent
        const on: [Poly, number][] = []
        pieces.forEach((pc, i) => {
          const t0 = 0.05 + r(P.seed, i, 7) * 0.35
          if (env.lt < t0) return
          const fl = env.lt - t0 < 0.12 ? (r(P.seed, i, env.step) < 0.5 ? 0.3 : 1) : 1
          on.push([pc[1], fl])
        })
        ctx.save()
        if (env.allowFilter) {
          ctx.shadowColor = rgba(col, 0.8)
          ctx.shadowBlur = 10 * u * (env.scale || 1)
        }
        polys(
          env,
          on.filter((p) => p[1] === 1).map((p) => p[0]),
          col,
          0.92 * o * (sp.ok ? 1 : 0.4),
        )
        polys(
          env,
          on.filter((p) => p[1] !== 1).map((p) => p[0]),
          col,
          0.3 * o,
        )
        ctx.restore()
      },
    },
    /* QR風ブロック — 逐格扫描生成的 QR 风格模块块，带定位方框 */
    qrBlock: {
      w: 0.7,
      tags: ['graphic', 'glitch', 'pop'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = 21
        const S = clamp(Math.min(env.W, env.H) * 0.1, 76 * u, 140 * u)
        const c = S / N
        const fs = FS(env) * 0.72
        const sp = cornerSpot(env, bb, S, S + fs * 2, P, 1.1)
        const x0 = sp.x
        const y0 = sp.y
        const a = o * (sp.ok ? 1 : 0.35)
        const e = clamp(env.lt / 0.55)
        const pOut = env.pOut
        const fg: Quad[] = []
        const acc: Quad[] = []
        const finder = (i: number, j: number) => {
          const boxes: Pt[] = [
            [0, 0],
            [N - 7, 0],
            [0, N - 7],
          ]
          for (const [fi, fj] of boxes) {
            const di = i - fi
            const dj = j - fj
            if (di >= 0 && di < 7 && dj >= 0 && dj < 7) {
              const ring = Math.max(Math.abs(di - 3), Math.abs(dj - 3))
              return ring === 3 || ring <= 1 ? (ring <= 1 ? 2 : 1) : 0
            }
          }
          return -1
        }
        for (let j = 0; j < N; j++)
          for (let i = 0; i < N; i++) {
            let f = finder(i, j)
            if (f === -1) {
              if (
                (i === 7 || j === 7) &&
                ((i < 8 && j < 8) || (i > N - 9 && j < 8) || (i < 8 && j > N - 9))
              )
                f = 0
              else if (i === 6 || j === 6) f = (i + j) % 2 === 0 ? 1 : 0
              else f = r(P.seed, i, j, 3) < 0.48 ? 1 : 0
            }
            if (!f) continue
            const d = (i + j) / (2 * N - 2)
            if (d > e * 1.25 - 0.1 + (r(P.seed, i, j, 9) - 0.5) * 0.1) continue
            if (pOut > 0 && r(P.seed, i, j, 11) < pOut * 1.1) continue
            ;(f === 2 && P.accent ? acc : fg).push([x0 + i * c, y0 + j * c, c + 0.35, c + 0.35])
          }
        rects(env, fg, sc.fg, a)
        rects(env, acc, sc.accent, a)
        // 生成过程中的扫描线
        if (e < 1) {
          const sy = y0 + S * e * 1.1
          if (sy < y0 + S)
            stroke(
              env,
              [
                [x0 - 6 * u, sy],
                [x0 + S + 6 * u, sy],
              ],
              sc.accent,
              1.5 * u,
              a,
            )
        }
        label(
          env,
          `ID ${(hash(P.seed, 12) % 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`,
          x0,
          y0 + S + fs * 1.2,
          { size: fs, alpha: a * inE(env, 0.3, 0.4), track: 0.14 },
        )
      },
    },

    /* グリッチ片 — 贴着歌词两侧的闪烁数据碎片与空心框 */
    glitchRects: {
      w: 0.9,
      tags: ['glitch'],
      layer: 'front',
      draw(env, bb0, P) {
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { W, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const burst = Math.max(1 - clamp(env.lt / 0.45), env.pOut > 0 ? 1 - env.pOut * 0.6 : 0)
        const st = env.step
        const idle = hash(cut.seed, st, 1) % 5 === 0
        const n = Math.round((burst > 0 ? 7 + 6 * burst : idle ? 3 : 1) * (0.7 + 0.2 * (P.n | 0)))
        const gap = 10 * u + bh(bb) * 0.06
        const cols = [sc.fg, sc.accent, sc.ghostA || sc.accent, sc.ghostB || sc.sub]
        const solid: Quad[][] = [[], [], [], []]
        const hollow: Quad[] = []
        for (let i = 0; i < n; i++) {
          const rv = (k: number) => r(P.seed, st, i, k)
          const right = rv(1) < 0.5
          const hh = (1.5 + rv(3) * 9) * u
          const room = right ? W - bb.x1 - gap : bb.x0 - gap
          let w = (18 + rv(4) * rv(4) * 220) * u
          let x: number
          let y: number
          if (room > 60 * u && rv(8) < 0.75) {
            y = lerp(bb.y0, bb.y1, rv(2))
            w = Math.min(w, room - 8 * u)
            x = right
              ? bb.x1 + gap + rv(5) * Math.max(0, room - w - 8 * u) * 0.5
              : bb.x0 - gap - w - rv(5) * Math.max(0, room - w - 8 * u) * 0.5
          } else {
            // 两侧太挤：改贴上下边缘
            const top = rv(9) < 0.5
            y = top ? bb.y0 - gap - rv(2) * 40 * u : bb.y1 + gap + rv(2) * 40 * u
            x = lerp(bb.x0, bb.x1 - w, rv(5))
          }
          x = clamp(x, 4 * u, W - w - 4 * u)
          if (hitBB(x, y, x + w, y + hh, bb, 2)) continue
          if (rv(6) < 0.25) hollow.push([x, y - hh * 1.5, w * 0.7, hh * 3.5])
          else solid[Math.floor(rv(7) * 4)].push([x, y, w, hh])
        }
        solid.forEach((l, k) => rects(env, l, cols[k], 0.9 * o, k < 2))
        for (const hr of hollow)
          stroke(
            env,
            [
              [hr[0], hr[1]],
              [hr[0] + hr[2], hr[1]],
              [hr[0] + hr[2], hr[1] + hr[3]],
              [hr[0], hr[1] + hr[3]],
            ],
            sc.fg,
            Math.max(1, u),
            0.8 * o,
            false,
            { close: true },
          )
        if (burst > 0.2 || idle) {
          const rvb = (k: number) => r(P.seed, st, 99, k)
          const right = rvb(1) < 0.5
          const x = right ? bb.x1 + gap : bb.x0 - gap
          const y = lerp(bb.y0, bb.y1, rvb(2))
          label(
            env,
            `0x${(hash(cut.seed, st, 5) % 0xffff).toString(16).toUpperCase().padStart(4, '0')}`,
            x,
            y - 10 * u,
            { size: FS(env) * 0.75, align: right ? 'left' : 'right', color: sc.accent, alpha: o },
          )
        }
      },
    },

    /* ============================================================
       几何
       ============================================================ */

    /* 同心四角 — 一层层细线方框：缓慢扭转，或无限深的隧道 */
    concentricSquares: {
      w: 1,
      tags: ['graphic', 'calm', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const S = clamp(Math.min(env.W, env.H) * 0.17, 100 * u, 220 * u)
        const sp = P.corner
          ? cornerSpot(env, bb, S * 1.2, S * 1.2, P)
          : nearBB(env, bb, S * 1.2, S * 1.2, P, 24 * u)
        const cx = sp.cx
        const cy = sp.cy
        const n = 5 + (P.n | 0)
        const lw = Math.max(1, 1.2 * u)
        const tunnel = (P.v | 0) % 2 === 1
        const a = o * (sp.ok ? 1 : 0.35)
        for (let i = 0; i < n; i++) {
          let s: number
          let rot: number
          let al = 1
          if (tunnel) {
            const f = (i / n + env.ltb * 0.18) % 1
            s = S * 0.5 * (0.08 + 0.92 * f)
            rot = 45 * (P.r > 0.5 ? 1 : 0)
            al = Math.sin(Math.PI * f)
          } else {
            s = S * 0.5 * (1 - (i / n) * 0.86)
            rot = i * (6 + P.r * 8) + env.ltb * 7 * (P.right ? 1 : -1)
          }
          const e = E.outExpo(clamp((env.lt - i * 0.045) / 0.5))
          if (e <= 0) continue
          const pts: Pt[] = []
          for (let k = 0; k <= 4; k++) {
            const an = (rot + 45 + k * 90) * DEG
            pts.push([cx + Math.cos(an) * s * Math.SQRT2, cy + Math.sin(an) * s * Math.SQRT2])
          }
          stroke(
            env,
            part(pts, 0, e),
            i === (P.n | 0) ? sc.accent : sc.fg,
            i === (P.n | 0) ? lw * 1.6 : lw,
            a * al * (0.45 + 0.55 * (1 - i / n)),
          )
        }
        env.circle(cx, cy, 2.4 * u, sc.accent, null, 0, a * inE(env, 0.3, 0.3), false)
      },
    },

    /* 回転三角 — 边线绕开歌词的大三角，或一对反向旋转的三角 + 一颗轨道实心 */
    triangleSpin: {
      w: 0.9,
      tags: ['graphic', 'pop', 'glitch'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const e = E.outExpo(clamp(env.lt / 0.6))
        const lw = Math.max(1, 1.4 * u)
        const tri = (cx: number, cy: number, R: number, rot: number): Pt[] => {
          const p: Pt[] = []
          for (let k = 0; k <= 3; k++) {
            const an = (rot - 90 + k * 120) * DEG
            p.push([cx + Math.cos(an) * R, cy + Math.sin(an) * R])
          }
          return p
        }
        const dir = P.right ? 1 : -1
        const rin = Math.hypot(bw(bb) / 2, bh(bb) / 2) + 18 * u
        if (P.big && rin * 2 < Math.max(W, H) * 0.62) {
          // 一个大三角，边线始终绕开歌词
          const cx = (bb.x0 + bb.x1) / 2
          const cy = (bb.y0 + bb.y1) / 2
          const R = rin * 2 * (1 + 0.08 * E.inCubic(env.pOut))
          const rot = dir * ((1 - e) * -70 + env.ltb * 5) + P.r * 120
          if (env.pass !== 'main') return
          stroke(env, part(tri(cx, cy, R, rot), 0, e), sc.fg, lw, 0.75 * o)
          stroke(
            env,
            part(
              tri(cx, cy, R * 1.07, -rot * 0.6 + 60),
              0,
              E.outExpo(clamp((env.lt - 0.12) / 0.6)),
            ),
            P.accent ? sc.accent : sc.sub,
            lw,
            0.45 * o,
          )
          return
        }
        // 反向旋转的同心一对 + 一个小实心三角绕轨道
        const S = clamp(Math.min(W, H) * 0.19, 110 * u, 230 * u)
        const sp = P.corner ? cornerSpot(env, bb, S, S, P) : nearBB(env, bb, S, S, P, 24 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const cx = sp.cx
        const cy = sp.cy + S * 0.06
        const R = S * 0.42
        const r1 = dir * (env.ltb * 16 + (1 - e) * -90) + P.r * 120
        const r2 = -dir * (env.ltb * 24 + (1 - e) * -140) + 60
        stroke(env, part(tri(cx, cy, R, r1), 0, e), sc.fg, lw * 1.1, a)
        stroke(
          env,
          part(tri(cx, cy, R * 0.62, r2), 0, E.outExpo(clamp((env.lt - 0.1) / 0.6))),
          sc.sub,
          lw,
          0.8 * a,
        )
        const q = E.outBack(clamp((env.lt - 0.25) / 0.35), 1.8)
        if (q > 0) {
          const an = (env.ltb * 50 * dir + P.r * 360) * DEG
          const rr0 = R * 1.18
          polys(
            env,
            [
              tri(
                cx + Math.cos(an) * rr0,
                cy + Math.sin(an) * rr0,
                R * 0.13 * q,
                env.ltb * 90 * dir,
              ),
            ],
            sc.accent,
            a,
            true,
          )
        }
        env.circle(cx, cy, 2.2 * u, sc.accent, null, 0, a * e, false)
      },
    },

    /* 放射線 — 从歌词外轮廓向外短促放射的强调短线 */
    lineBurst: {
      w: 1.1,
      tags: ['pop', 'graphic', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        const pad = 18 * u + bh(bb) * 0.14
        const A = (bw(bb) / 2) * 1.08 + pad
        const B = (bh(bb) / 2) * 1.12 + pad
        // 采样轮廓，再按弧长等分放射线
        const M = 180
        const pts: Pt[] = []
        const cum = [0]
        for (let i = 0; i <= M; i++) {
          const th = (i / M) * TAU
          const rad = superR(A, B, 4, th)
          pts.push([cx + Math.cos(th) * rad, cy + Math.sin(th) * rad])
          if (i)
            cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        }
        const L = cum[M]
        const N = Math.round(clamp(L / (34 * u), 24, 76) * (0.8 + 0.1 * (P.n | 0)))
        const beat = env.beat ? Math.exp(-env.beat.since * 7) : 0.5 + 0.5 * Math.sin(env.ltb * 5)
        const main: Quad[] = []
        const acc: Quad[] = []
        const pOut = E.inCubic(env.pOut)
        let j = 1
        for (let i = 0; i < N; i++) {
          const s = ((i + 0.5 + rs(P.seed, i, 1) * 0.3) / N) * L
          while (j < M && cum[j] < s) j++
          const k = (s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1])
          const p = L2(pts[j - 1], pts[j], k)
          let tx = pts[j][0] - pts[j - 1][0]
          let ty = pts[j][1] - pts[j - 1][1]
          const tl = Math.hypot(tx, ty) || 1
          tx /= tl
          ty /= tl
          let nx = ty
          let ny = -tx
          if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) {
            nx = -nx
            ny = -ny
          }
          const len =
            rr(10, 30, P.seed, i, 3) * u * (P.big ? 1.5 : 1) * (1 + 0.2 * beat * r(P.seed, i, 4))
          const sE = E.outExpo(clamp((env.lt - r(P.seed, i, 5) * 0.18) / 0.35))
          if (sE <= 0) continue
          const d0 = r(P.seed, i, 2) * 8 * u + pOut * 60 * u
          const d1 = d0 + len * sE
          ;(i % 6 === 0 ? acc : main).push([
            p[0] + nx * d0,
            p[1] + ny * d0,
            p[0] + nx * d1,
            p[1] + ny * d1,
          ])
        }
        segs(env, main, sc.fg, 1.6 * u, 0.85 * o, false, 'round')
        segs(env, acc, sc.accent, 2.4 * u, o, false, 'round')
      },
    },

    /* プラス格子 — 排布精确的 + 字阵，其中一个被扫描高亮 */
    plusGrid: {
      w: 1,
      tags: ['graphic', 'editorial', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const cols = 4 + (P.n | 0) + ((P.v | 0) % 3)
        const rows = 2 + ((P.v | 0) % 2) + (P.big ? 1 : 0)
        const s = clamp(Math.min(env.W, env.H) * 0.034, 24 * u, 44 * u)
        const ps = s * 0.22
        const w = (cols - 1) * s + ps * 2
        const h = (rows - 1) * s + ps * 2
        const sp = P.corner ? cornerSpot(env, bb, w, h, P) : nearBB(env, bb, w, h, P, 26 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const list: Quad[] = []
        const hl = Math.floor(env.ltb * 7 + P.r * 50) % (cols * rows)
        let hx = 0
        let hy = 0
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const q = E.outBack(clamp((env.lt - (i + j) * 0.03) / 0.3), 2)
            if (q <= 0) continue
            const x = sp.x + ps + i * s
            const y = sp.y + ps + j * s
            const k = ps * q
            if (j * cols + i === hl && env.lt > 0.5) {
              hx = x
              hy = y
              continue
            }
            list.push([x - k, y, x + k, y], [x, y - k, x, y + k])
          }
        segs(env, list, sc.sub, Math.max(1, 1.3 * u), a)
        if (hx) {
          const k = ps * 1.5
          segs(
            env,
            [
              [hx - k, hy - k, hx + k, hy + k],
              [hx - k, hy + k, hx + k, hy - k],
            ],
            sc.accent,
            1.8 * u,
            a,
          )
        }
      },
    },
    /* ガイド線 — 沿歌词四边的虚线排版参考线，带控制点与坐标读数 */
    guides: {
      w: 1,
      tags: ['editorial', 'graphic', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const pad = 10 * u + bh(bb) * 0.05
        const e = E.outExpo(clamp(env.lt / 0.6))
        const lw = Math.max(1, 1.1 * u)
        const X0 = bb.x0 - pad
        const X1 = bb.x1 + pad
        const Y0 = bb.y0 - pad
        const Y1 = bb.y1 + pad
        const cx = (X0 + X1) / 2
        const cy = (Y0 + Y1) / 2
        const col = P.accent
          ? sc.accent
          : sc.accent2 && contrast(sc.accent2, sc.bg) > 2
            ? sc.accent2
            : sc.accent
        const hw = W * 0.55 * e
        const hh = H * 0.55 * e
        const a = 0.75 * o
        const vert = P.big || (P.v | 0) % 2 === 1 || bh(bb) > bw(bb)
        for (const y of [Y0, Y1])
          if (y > 0 && y < H) dash(env, cx - hw, y, cx + hw, y, 7 * u, 5 * u, col, lw, a)
        if (vert)
          for (const x of [X0, X1])
            if (x > 0 && x < W) dash(env, x, cy - hh, x, cy + hh, 7 * u, 5 * u, col, lw, a)
        const ea = inE(env, 0.3, 0.3) * o
        const hs = 3.5 * u
        const handles: Pt[] = [
          [X0, Y0],
          [X1, Y0],
          [X0, Y1],
          [X1, Y1],
        ]
        for (const [x, y] of handles)
          stroke(
            env,
            [
              [x - hs, y - hs],
              [x + hs, y - hs],
              [x + hs, y + hs],
              [x - hs, y + hs],
            ],
            sc.fg,
            lw,
            ea,
            false,
            { close: true },
          )
        const fs = FS(env) * 0.75
        const m = MG(env) * 0.5
        label(env, `Y ${pad2(Y0, 4)}`, m, Y0 - fs * 0.8, { size: fs, color: col, alpha: ea })
        label(env, `Y ${pad2(Y1, 4)}`, m, Y1 + fs * 0.9, { size: fs, color: col, alpha: ea })
        if (vert)
          label(env, `X ${pad2(X1, 4)}`, X1 + 6 * u, m + fs * 0.6, {
            size: fs,
            color: col,
            alpha: ea,
          })
      },
    },

    /* 波線 — 在空闲横带上漂移的一对精确正弦发丝线 */
    waveLine: {
      w: 1,
      tags: ['calm', 'emotional', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const fb = freeBand(env, bb, !!P.low)
        if (fb.room < 30 * u) return
        const A = clamp(fb.room * 0.1, 5 * u, 14 * u)
        const lam = clamp(Math.min(W, env.H) * 0.07, 44 * u, 96 * u)
        const dir = P.right ? 1 : -1
        const ph = env.ltb * 2.4 * dir
        const x0 = m
        const x1 = W - m
        const e = E.inOutCubic(clamp(env.lt / 0.7))
        const pOut = E.inCubic(env.pOut)
        const mk = (amp: number, off: number): Pt[] => {
          const p: Pt[] = []
          for (let x = x0; x <= x1 + 0.1; x += 6 * u) {
            const fade = Math.min(1, (x - x0) / (lam * 1.5), (x1 - x) / (lam * 1.5))
            p.push([x, fb.y + Math.sin(((x - x0) / lam) * TAU + ph + off) * amp * fade])
          }
          return p
        }
        if ((P.v | 0) % 3 === 2) {
          const pts = mk(A, 0)
          const d: Dot[] = []
          for (let i = 0; i < pts.length; i += 2) {
            const f = i / pts.length
            if (f <= e && f >= pOut) d.push([pts[i][0], pts[i][1], 1.8 * u])
          }
          dots(env, d, sc.fg, 0.85 * o)
        } else {
          stroke(env, part(mk(A, 0), pOut, e), sc.fg, 1.4 * u, 0.85 * o)
          stroke(
            env,
            part(mk(A * 0.55, Math.PI * 0.6), pOut, E.inOutCubic(clamp((env.lt - 0.12) / 0.7))),
            P.accent ? sc.accent : sc.sub,
            Math.max(1, u),
            0.6 * o,
          )
        }
      },
    },

    /* 渦巻き — 从中心一笔绘出的阿基米德螺线或方螺线 */
    spiralLine: {
      w: 0.8,
      tags: ['graphic', 'pop', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const R = clamp(Math.min(env.W, env.H) * 0.085, 54 * u, 104 * u)
        const sp = nearBB(env, bb, R * 2.3, R * 2.3, P, 20 * u)
        const cx = sp.cx
        const cy = sp.cy
        const a = o * (sp.ok ? 1 : 0.35)
        const turns = 3 + (P.n | 0) * 0.5
        const pts: Pt[] = []
        const sq = (P.v | 0) % 2 === 1
        const rot = env.ltb * 18 * (P.right ? 1 : -1) * DEG + P.r * TAU
        if (sq) {
          const n = Math.round(turns * 4)
          const d = R / (n / 2)
          let x = 0
          let y = 0
          pts.push([0, 0])
          for (let k = 0; k < n; k++) {
            const L = d * (Math.floor(k / 2) + 1)
            const dirs = SPIRAL_DIRS[k % 4]
            x += dirs[0] * L
            y += dirs[1] * L
            pts.push([x, y])
          }
        } else {
          const M = Math.round(turns * 40)
          for (let k = 0; k <= M; k++) {
            const th = (k / M) * turns * TAU
            const rad = (R * k) / M
            pts.push([Math.cos(th) * rad, Math.sin(th) * rad])
          }
        }
        const tp = pts.map(([x, y]): Pt => [
          cx + x * Math.cos(rot) - y * Math.sin(rot),
          cy + x * Math.sin(rot) + y * Math.cos(rot),
        ])
        const e = E.inOutCubic(clamp(env.lt / 0.7))
        const pOut = E.inCubic(env.pOut)
        const seg = part(tp, pOut, e)
        stroke(env, seg, sc.fg, 1.4 * u, 0.85 * a, false, { cap: 'round', join: 'round' })
        if (seg.length) {
          const q = seg[seg.length - 1]
          env.circle(q[0], q[1], 3.2 * u, sc.accent, null, 0, a, false)
        }
      },
    },

    /* 網点 — 从画面角落晕开的网点 / 线网渐变（在文字之下） */
    halftonePatch: {
      w: 1,
      tags: ['graphic', 'pop', 'editorial'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const sx = P.right ? 1 : -1
        const sy = P.low ? 1 : -1
        const ox = sx > 0 ? W : 0
        const oy = sy > 0 ? H : 0
        const pw = W * rr(0.38, 0.58, P.seed, 1)
        const ph = H * rr(0.38, 0.6, P.seed, 2)
        let g = clamp(Math.min(W, H) * 0.018, 12 * u, 22 * u)
        while ((pw / g) * (ph / g) > 1100) g *= 1.15
        const col = P.accent ? sc.accent : sc.sub
        const al = (P.accent ? 0.3 : 0.2) * (dark(env) ? 1 : 0.8) * o
        const lines = (P.v | 0) % 2 === 1
        const grow = clamp(env.lt / 0.7) * 1.3
        const f = (x: number, y: number) => {
          const d = Math.hypot((x - ox) / pw, (y - oy) / ph)
          return clamp(1 - d) * clamp((grow - d) * 3)
        }
        if (lines) {
          const list: Poly[] = []
          for (let y = oy - sy * g * 0.5; Math.abs(y - oy) < ph; y -= sy * g) {
            const top: Pt[] = []
            const bot: Pt[] = []
            for (let x = ox; Math.abs(x - ox) <= pw; x -= sx * g * 0.5) {
              const t = g * 0.46 * Math.pow(f(x, y), 1.1)
              top.push([x, y - t])
              bot.push([x, y + t])
            }
            list.push(top.concat(bot.reverse()))
          }
          polys(env, list, col, al)
        } else {
          const list: Dot[] = []
          let row = 0
          for (let y = oy - sy * g * 0.5; Math.abs(y - oy) < ph; y -= sy * g, row++) {
            for (let x = ox - sx * (row % 2 ? g : g * 0.5); Math.abs(x - ox) <= pw; x -= sx * g) {
              const rad = g * 0.5 * Math.pow(f(x, y), 1.2)
              if (rad > 0.4) list.push([x, y, rad])
            }
          }
          dots(env, list, col, al)
        }
      },
    },

    /* 市松の帯 — 擦开并滚动的小棋盘色带 */
    checkerStrip: {
      w: 0.8,
      tags: ['pop', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const v = (P.v | 0) % 3
        const rows = v === 1 ? 3 : v === 2 ? 1 : 2
        const c = clamp(Math.min(W, env.H) * 0.016, 10 * u, 18 * u)
        const L = Math.min(W * 0.32, 400 * u)
        const h = rows * c
        const sp = cornerSpot(env, bb, L, h + (v === 2 ? 10 * u : 0), P, 1)
        const a = o * (sp.ok ? 1 : 0.35)
        const x0 = sp.x
        const y0 = sp.y + (v === 2 ? 5 * u : 0)
        const e = E.outExpo(clamp(env.lt / 0.55))
        const vis = L * e
        const off = (env.ltb * c * 1.6 * (P.right ? -1 : 1)) % (2 * c)
        const list: Quad[] = []
        for (let j = 0; j < rows; j++)
          for (let i = -2; i * c < L + 2 * c; i++) {
            if ((i + j) % 2 !== 0) continue
            const x = x0 + i * c + off
            const w = c
            const k = v === 1 ? clamp(1 - ((i * c) / L) * 0.95) : 1
            const cw = w * k
            const ch = c * k
            const cx0 = x + (w - cw) / 2
            const xa = Math.max(cx0, x0)
            const xb = Math.min(cx0 + cw, x0 + vis)
            if (xb <= xa) continue
            list.push([xa, y0 + j * c + (c - ch) / 2, xb - xa, ch])
          }
        rects(env, list, P.accent ? sc.accent : sc.fg, 0.9 * a)
        if (v === 2) {
          const lw = Math.max(1, u)
          segs(
            env,
            [
              [x0, y0 - 5 * u, x0 + vis, y0 - 5 * u],
              [x0, y0 + h + 5 * u, x0 + vis, y0 + h + 5 * u],
            ],
            sc.fg,
            lw,
            0.8 * a,
          )
        }
      },
    },

    /* 拍の輪 — 每拍从画面中心向外扩散的细圆环（在文字之下） */
    beatRing: {
      w: 1,
      tags: ['pop', 'emotional', 'calm'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        if (env.pass !== 'main') return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env) * inE(env, 0.4, 0, E.outCubic)
        if (o <= 0.003 || env.lt < 0) return
        let since: number
        let len: number
        if (env.beat) {
          since = env.beat.since
          len = env.beat.len
        } else {
          len = 0.5
          since = ((env.ltb % len) + len) % len
        }
        const cx = W / 2
        const cy = H / 2
        const r0 = Math.min(W, H) * 0.2
        const r1 = Math.hypot(W, H) * 0.55
        const col = P.accent ? sc.accent : sc.sub
        const base = (P.accent ? 0.45 : 0.4) * o
        const dashed = (P.v | 0) % 2 === 1
        for (let k = 0; k < 3; k++) {
          const p = (since + k * len) / (len * 3)
          if (p >= 1) continue
          const rad = lerp(r0, r1, E.outCubic(p))
          const al = base * Math.pow(1 - p, 1.6)
          if (dashed) {
            for (let s = 0; s < 48; s++)
              env.arc(cx, cy, rad, s * 7.5, s * 7.5 + 4, col, 1.4 * u, al, false)
          } else env.circle(cx, cy, rad, null, col, (1 + 1.5 * (1 - p)) * u, al, false)
        }
        const pulse = Math.exp(-since * 9)
        env.circle(
          cx,
          cy,
          r0 * (1 + 0.03 * pulse),
          null,
          col,
          (1 + 2.2 * pulse) * u,
          base * 0.6,
          false,
        )
      },
    },

    /* 周回する点 — 绕歌词的倾斜轨道，点与拖尾经过文字"背后" */
    orbitDots: {
      w: 1,
      tags: ['calm', 'emotional', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        const tall = bh(bb) > bw(bb) * 1.2
        const rx = tall
          ? Math.max(bw(bb) * 0.9, 50 * u)
          : Math.min(bw(bb) / 2 + 50 * u + bw(bb) * 0.08, W * 0.47)
        const ry = tall
          ? Math.min(bh(bb) / 2 + 50 * u + bh(bb) * 0.08, env.H * 0.47)
          : Math.max(bh(bb) * 0.9, 50 * u)
        const tilt = (P.r - 0.5) * 22 * DEG
        const ct = Math.cos(tilt)
        const stt = Math.sin(tilt)
        const at = (th: number): Pt => {
          const x = Math.cos(th) * rx
          const y = Math.sin(th) * ry
          return [cx + x * ct - y * stt, cy + x * stt + y * ct]
        }
        const pad = 8 * u
        const inside = (p: Pt) =>
          p[0] > bb.x0 - pad && p[0] < bb.x1 + pad && p[1] > bb.y0 - pad && p[1] < bb.y1 + pad
        const e = E.inOutCubic(clamp(env.lt / 0.7))
        const th0 = P.r * TAU
        // 轨道线，跳过被歌词遮住的部分
        const M = 160
        const segsL: Quad[] = []
        let prev: Pt | null = null
        for (let k = 0; k <= M * e; k++) {
          const p = at(th0 + (k / M) * TAU)
          if (prev && !inside(p) && !inside(prev)) segsL.push([prev[0], prev[1], p[0], p[1]])
          prev = p
        }
        segs(env, segsL, sc.sub, Math.max(1, u), 0.55 * o)
        const nd = 2 + ((P.n | 0) % 3)
        const dir = P.right ? 1 : -1
        for (let d = 0; d < nd; d++) {
          const w = (0.35 + d * 0.22) * dir * (1 + 2 * E.inCubic(env.pOut))
          const th = th0 + (d * TAU) / nd + env.ltb * w
          const sz = (d === 0 ? 5 : 3.2) * u
          const trail: [Pt, Pt, number][] = []
          for (let k = 0; k < 10; k++) {
            const a1 = th - k * 0.045 * Math.sign(w)
            const a2 = th - (k + 1) * 0.045 * Math.sign(w)
            const p1 = at(a1)
            const p2 = at(a2)
            if (!inside(p1) && !inside(p2)) trail.push([p1, p2, 1 - k / 10])
          }
          for (const [p1, p2, f] of trail)
            stroke(env, [p1, p2], d === 0 ? sc.accent : sc.fg, sz * 0.8 * f, 0.6 * f * o * e)
          const p = at(th)
          if (!inside(p))
            env.circle(p[0], p[1], sz * e, d === 0 ? sc.accent : sc.fg, null, 0, o, false)
        }
      },
    },

    /* 星座 — 小星座：星点按顺序用发丝线连起来 */
    constellation: {
      w: 0.9,
      tags: ['calm', 'emotional', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const w = clamp(Math.min(env.W, env.H) * 0.3, 190 * u, 340 * u)
        const h = w * 0.62
        const sp = P.corner ? cornerSpot(env, bb, w, h, P) : nearBB(env, bb, w, h, P, 30 * u)
        const a = o * (sp.ok ? 1 : 0.35)
        const n = 5 + (P.n | 0)
        const cells: [number, number, number][] = []
        for (let i = 0; i < 12; i++) cells.push([i % 4, Math.floor(i / 4), r(P.seed, i, 1)])
        cells.sort((x, y) => x[2] - y[2])
        const raw: Pt[] = cells
          .slice(0, n)
          .map(([gx, gy], i): Pt => [
            sp.x + (w * (gx + 0.5 + rs(P.seed, i, 2) * 0.35)) / 4,
            sp.y + (h * (gy + 0.5 + rs(P.seed, i, 3) * 0.35)) / 3,
          ])
        raw.sort((x, y) => x[0] - y[0])
        // 从最左一颗开始依次连到最近的未连星点
        const head = raw.shift()
        const pts: Pt[] = head ? [head] : []
        while (raw.length && pts.length) {
          const q = pts[pts.length - 1]
          let bi = 0
          let bd = 1e18
          raw.forEach((c, i) => {
            const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2
            if (d < bd) {
              bd = d
              bi = i
            }
          })
          const nxt = raw.splice(bi, 1)[0]
          if (nxt) pts.push(nxt)
        }
        const path = pts.slice()
        const branch: Pt[] = [
          pts[Math.floor(n / 2)],
          [
            sp.x + w * rr(0.3, 0.7, P.seed, 9),
            sp.y + h * (pts[Math.floor(n / 2)][1] - sp.y > h / 2 ? 0.08 : 0.92),
          ],
        ]
        const e = E.inOutCubic(clamp((env.lt - 0.1) / 0.8))
        stroke(env, part(path, 0, e), sc.sub, Math.max(1, u), 0.7 * a)
        stroke(env, part(branch, 0, clamp((env.lt - 0.6) / 0.4)), sc.sub, Math.max(1, u), 0.7 * a)
        const all = pts.concat([branch[1]])
        const stars: Dot[] = []
        const big: [Pt, number][] = []
        all.forEach((p, i) => {
          const q = E.outBack(clamp((env.lt - i * 0.06) / 0.3), 2)
          if (q <= 0) return
          const tw = 0.65 + 0.35 * noise1(env.ltb * 2.5 + i * 3, P.seed)
          const rad = (r(P.seed, i, 4) < 0.3 ? 3.6 : 2.2) * u * q
          stars.push([p[0], p[1], rad])
          if (rad > 3 * u * q && i % 2 === 0) big.push([p, tw])
        })
        dots(env, stars, sc.fg, a)
        for (const [p, tw] of big) {
          const L = 11 * u * tw
          segs(
            env,
            [
              [p[0] - L, p[1], p[0] + L, p[1]],
              [p[0], p[1] - L, p[0], p[1] + L],
            ],
            sc.accent,
            Math.max(1, u),
            a * tw,
          )
        }
        label(env, `C-${pad2((cut.line | 0) + 1)}`, all[0][0] + 8 * u, all[0][1] - 12 * u, {
          size: FS(env) * 0.72,
          alpha: a * inE(env, 0.3, 0.5),
        })
      },
    },
    /* ============================================================
       有机 / 氛围
       ============================================================ */

    /* 紙吹雪 — 在歌词四周飘落、从不压住文字的翻滚彩纸 */
    confetti: {
      w: 0.9,
      tags: ['pop', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = Math.min(56, 26 + (P.n | 0) * 9)
        const cols = [sc.accent, sc.accent2 || sc.fg, sc.fg, sc.sub]
        const buckets: Poly[][] = [[], [], [], []]
        const pad = 10 * u
        const soft = 24 * u
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const q = E.outBack(clamp((env.lt - rv(1) * 0.35) / 0.3), 1.8)
          if (q <= 0) continue
          const vy = (70 + rv(2) * 110) * u * (1 + E.inCubic(env.pOut))
          const span = H + 80 * u
          const y = wrap(rv(3) * H + vy * env.ltb, -40 * u, span)
          const x =
            rv(4) * W + Math.sin(env.ltb * (1 + rv(5) * 1.8) + rv(6) * 6) * (10 + rv(7) * 30) * u
          const al = clearOf(bb, x, y, pad, soft)
          if (al <= 0.02) continue
          const w = (11 + rv(8) * 11) * u * q
          const h = w * (0.4 + rv(9) * 0.3)
          const rot = rv(10) * TAU + env.ltb * (rv(11) - 0.5) * 8
          const flip = Math.max(0.15, Math.abs(Math.cos(env.ltb * (2 + rv(12) * 4) + rv(13) * 6)))
          const c = Math.cos(rot)
          const s = Math.sin(rot)
          const hw = (w / 2) * flip
          const hh = h / 2
          const corners: Pt[] = [
            [-hw, -hh],
            [hw, -hh],
            [hw, hh],
            [-hw, hh],
          ]
          const pts = corners.map(([px, py]): Pt => [x + px * c - py * s, y + px * s + py * c])
          if (al < 1) {
            if (al > 0.5) buckets[i % 4].push(pts)
          } else buckets[i % 4].push(pts)
        }
        buckets.forEach((l, k) => polys(env, l, cols[k], 0.95 * o))
      },
    },

    /* 花びら — 顺风斜向翻滚的花瓣，绕开歌词 */
    petals: {
      w: 0.9,
      tags: ['emotional', 'calm', 'pop'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const N = Math.min(26, 10 + (P.n | 0) * 5)
        const dir = P.right ? 1 : -1
        const cA: Poly[] = []
        const cB: Poly[] = []
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const q = E.outCubic(clamp((env.lt - rv(1) * 0.4) / 0.35))
          if (q <= 0) continue
          const vy = (40 + rv(2) * 60) * u
          const vx = dir * (30 + rv(3) * 50) * u
          const x = wrap(
            rv(4) * W + vx * env.ltb + Math.sin(env.ltb * (0.8 + rv(5)) + rv(6) * 6) * 30 * u,
            -60 * u,
            W + 120 * u,
          )
          const y = wrap(rv(7) * H + vy * env.ltb, -60 * u, H + 120 * u)
          const al = clearOf(bb, x, y, 12 * u, 28 * u)
          if (al <= 0.5) continue
          const L = (24 + rv(8) * 20) * u * q
          const rot = rv(9) * TAU + env.ltb * (rv(10) - 0.5) * 3
          const fx = Math.max(0.2, Math.abs(Math.cos(env.ltb * (1.2 + rv(11) * 2) + rv(12) * 6)))
          const c = Math.cos(rot)
          const s = Math.sin(rot)
          const pts = PETAL.map(([px, py]): Pt => {
            const X = px * L * fx
            const Y = py * L
            return [x + X * c - Y * s, y + X * s + Y * c]
          })
          ;(rv(13) < 0.7 ? cA : cB).push(pts)
        }
        polys(env, cA, sc.accent, 0.9 * o)
        polys(env, cB, dark(env) ? sc.fg : sc.sub, 0.85 * o)
      },
    },

    /* 雨の筋 — 落在歌词之后的细雨丝（前层不画，故始终在文字之下） */
    rainStreaks: {
      w: 0.9,
      tags: ['emotional', 'calm', 'glitch'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env) * inE(env, 0.45, 0, E.outCubic)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const N = Math.min(110, 60 + (P.n | 0) * 16)
        const sl = (P.right ? 1 : -1) * (8 + P.r * 10) * DEG
        const tn = Math.tan(sl)
        const b: Quad[][] = [[], [], []]
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const z = rv(1)
          const v = (1200 + z * 1300) * u
          const len = (36 + z * 80) * u
          const span = H + len + 80 * u
          const y = wrap(rv(2) * span + v * env.ltb, -len - 40 * u, span)
          const x = rv(3) * (W + H * Math.abs(tn)) - (tn > 0 ? H * tn : 0) + y * tn
          b[z < 0.4 ? 0 : z < 0.8 ? 1 : 2].push([x, y, x + len * tn, y + len])
        }
        const col = dark(env) ? sc.sub : sc.fg
        const k = dark(env) ? 1 : 0.75
        segs(env, b[0], col, Math.max(1, 0.9 * u), 0.18 * o * k)
        segs(env, b[1], col, Math.max(1, 1.2 * u), 0.3 * o * k)
        segs(env, b[2], col, 1.6 * u, 0.46 * o * k)
      },
    },

    /* 雪 — 三层深度的柔雪，轻轻摆动（在文字之下） */
    snow: {
      w: 0.8,
      tags: ['calm', 'emotional'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env) * inE(env, 0.5, 0, E.outCubic)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const N = Math.min(90, 46 + (P.n | 0) * 14)
        const L: Dot[][] = [[], [], []]
        const halo: Dot[] = []
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const z = rv(1)
          const lay = z < 0.5 ? 0 : z < 0.85 ? 1 : 2
          const rad = [2, 3.4, 5.6][lay] * u * (0.8 + rv(2) * 0.4)
          const vy = (22 + lay * 22 + rv(3) * 14) * u
          const y = wrap(rv(4) * H + vy * env.ltb, -10 * u, H + 20 * u)
          const x = wrap(
            rv(5) * W +
              Math.sin(env.ltb * (0.6 + rv(6)) + rv(7) * 6) * (8 + lay * 10) * u +
              (P.right ? 1 : -1) * env.ltb * 8 * u,
            -10 * u,
            W + 20 * u,
          )
          L[lay].push([x, y, rad])
          if (lay) halo.push([x, y, rad * 2.2])
        }
        const col = dark(env) ? sc.fg : sc.sub
        const k = dark(env) ? 1 : 0.55
        dots(env, halo, col, 0.08 * o * k)
        dots(env, L[0], col, 0.35 * o * k)
        dots(env, L[1], col, 0.55 * o * k)
        dots(env, L[2], col, 0.75 * o * k)
      },
    },

    /* 光漏れ — 从画面边缘呼吸式渗进来的暖色光漏（只在 main pass） */
    lightLeak: {
      w: 1,
      tags: ['emotional', 'calm', 'pop'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc, ctx } = env
        if (env.pass !== 'main' || env.lt < 0) return
        const o = outE(env) * inE(env, 0.6, 0, E.outCubic)
        if (o <= 0.003) return
        const dk = dark(env)
        // 只用与背景区分得开的颜色，否则光会变成一坨脏色
        const pickC = (c: string): string | null =>
          c && (dk ? lum(c) > 0.2 : lum(c) < 0.85) ? c : null
        const c1 = pickC(sc.accent) || pickC(sc.accent2) || sc.sub
        const c2 = pickC(sc.accent2) || c1
        const breathe = 0.85 + 0.15 * Math.sin(env.ltb * 1.4 + P.r * 6)
        const sx = P.right ? 1 : -1
        const sy = P.low ? 1 : -1
        const blob = (x: number, y: number, R: number, c: string, a: number) => {
          const g = ctx.createRadialGradient(x, y, 0, x, y, R)
          g.addColorStop(0, rgba(c, a))
          g.addColorStop(0.35, rgba(c, a * 0.5))
          g.addColorStop(1, rgba(c, 0))
          ctx.fillStyle = g
          ctx.fillRect(x - R, y - R, R * 2, R * 2)
        }
        ctx.save()
        ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
        const A = (dk ? 0.5 : 0.28) * o * breathe
        const M = Math.max(W, H)
        const drift = env.ltb * 18 * (P.corner ? 1 : -1)
        blob(
          (sx > 0 ? W : 0) + sx * M * 0.05,
          (sy > 0 ? H : 0) * 0.9 + H * 0.05 + drift,
          M * rr(0.42, 0.6, P.seed, 1),
          c1,
          A,
        )
        blob(
          (sx > 0 ? W : 0) - sx * M * 0.02,
          H * rr(0.3, 0.7, P.seed, 2) - drift,
          M * rr(0.22, 0.32, P.seed, 3),
          c2,
          A * 0.8,
        )
        if ((P.v | 0) % 2) {
          ctx.translate(sx > 0 ? W * 0.82 : W * 0.18, H / 2)
          ctx.rotate(sx * 14 * DEG)
          const w = W * 0.12
          const g = ctx.createLinearGradient(-w, 0, w, 0)
          g.addColorStop(0, rgba(c1, 0))
          g.addColorStop(0.5, rgba(c1, A * 0.5))
          g.addColorStop(1, rgba(c1, 0))
          ctx.fillStyle = g
          ctx.fillRect(-w + drift * 0.5, -H, w * 2, H * 2)
        }
        ctx.restore()
      },
    },

    /* ボケ玉 — 失焦光斑（或六边形焦外），逐渐对上焦 */
    bokeh: {
      w: 1,
      tags: ['emotional', 'calm', 'pop'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const N = Math.min(18, 8 + (P.n | 0) * 3)
        const hex = (P.v | 0) % 2 === 1
        const M = Math.min(W, H)
        const cols = [sc.accent, sc.accent2 || sc.fg, sc.fg]
        const dk = dark(env)
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const f = E.outCubic(clamp((env.lt - rv(1) * 0.4) / 0.6))
          if (f <= 0) continue
          const R0 = M * (0.025 + rv(2) * rv(2) * 0.075)
          const R = R0 * (1.5 - 0.5 * f)
          const x = rv(3) * W + Math.sin(env.ltb * 0.5 + rv(4) * 6) * 14 * u
          const y = wrap(rv(5) * H - env.ltb * (6 + rv(6) * 12) * u, -R0, H + R0 * 2)
          const c = cols[i % 3]
          const al = (dk ? 0.06 + rv(7) * 0.1 : 0.05 + rv(7) * 0.07) * f * o
          if (hex) {
            const pts: Pt[] = []
            for (let k = 0; k < 6; k++) {
              const an = (k * 60 + 15) * DEG
              pts.push([x + Math.cos(an) * R, y + Math.sin(an) * R])
            }
            polys(env, [pts], c, al)
            stroke(env, pts, c, 1.4 * u, al * 1.4, false, { close: true })
          } else {
            env.circle(x, y, R, c, null, 0, al, false)
            env.circle(x, y, R * 0.97, null, c, 1.6 * u, al * 1.3, false)
          }
        }
      },
    },

    /* 集中線 — 从画面四周冲向歌词的漫画速度线，在文字外停住 */
    speedCorner: {
      w: 0.9,
      tags: ['pop', 'emotional', 'glitch'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const cx = (bb.x0 + bb.x1) / 2
        const cy = (bb.y0 + bb.y1) / 2
        const pad = 30 * u + bh(bb) * 0.2
        const A = (bw(bb) / 2) * 1.1 + pad
        const B = (bh(bb) / 2) * 1.15 + pad
        const N = Math.min(150, 80 + (P.n | 0) * 22)
        const corners = !!P.corner
        const pOut = E.inCubic(env.pOut)
        const list: Poly[] = []
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          let th = rv(1) * TAU
          if (corners) {
            const q = Math.floor(rv(2) * 4)
            const base = Math.atan2((q < 2 ? -1 : 1) * H, (q % 2 ? 1 : -1) * W)
            th = base + (rv(3) - 0.5) * 0.7
          }
          const c = Math.cos(th)
          const s = Math.sin(th)
          const tx = c > 0 ? (W + 4 - cx) / c : c < 0 ? (-4 - cx) / c : 1e9
          const ty = s > 0 ? (H + 4 - cy) / s : s < 0 ? (-4 - cy) / s : 1e9
          const dEdge = Math.min(tx, ty)
          const dIn =
            superR(A, B, 4, th) +
            (20 + rv(4) * 0.35 * Math.max(0, dEdge - superR(A, B, 4, th))) * (u / u)
          if (dEdge - dIn < 30 * u) continue
          const jit = 0.85 + 0.15 * r(P.seed, i, env.step)
          const e = E.outExpo(clamp((env.lt - rv(5) * 0.15) / 0.3))
          const tip = lerp(dEdge, lerp(dEdge, dIn, jit), e)
          const tipO = lerp(tip, dEdge, pOut)
          if (dEdge - tipO < 4 * u) continue
          const wd = (1.2 + rv(6) * 4.5) * u
          const nx = -s * wd
          const ny = c * wd
          const ex = cx + c * dEdge
          const ey = cy + s * dEdge
          list.push([
            [ex + nx, ey + ny],
            [ex - nx, ey - ny],
            [cx + c * tipO, cy + s * tipO],
          ])
        }
        polys(env, list, dark(env) ? sc.fg : sc.ink || sc.fg, 0.8 * o)
      },
    },

    /* 立ち上る粒 — 升起并淡出的小火星 / 光尘（在文字之下） */
    risingParticles: {
      w: 0.9,
      tags: ['emotional', 'calm', 'glitch'],
      layer: 'back',
      subtle: true,
      draw(env, _bb, P) {
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env) * inE(env, 0.45, 0, E.outCubic)
        if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return
        const N = Math.min(54, 24 + (P.n | 0) * 10)
        const shape = (P.v | 0) % 3
        const col = P.accent || shape === 1 ? sc.accent : dark(env) ? sc.fg : sc.sub
        const heads: Dot[][] = [[], [], []]
        const headsPoly: Poly[][] = [[], [], []]
        const trails: Quad[][] = [[], [], []]
        const glow: Dot[] = []
        for (let i = 0; i < N; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          const vy = (40 + rv(1) * 90) * u
          const span = H + 120 * u
          const y = H + 60 * u - wrap(rv(2) * span + vy * env.ltb, 0, span)
          const p = clamp(1 - y / H)
          const fade = Math.pow(Math.sin(Math.PI * clamp(p)), 0.7)
          if (fade <= 0.05) continue
          const ph = rv(5) * 6
          const f = 0.7 + rv(4)
          const sw = 14 * u
          const x = rv(3) * W + Math.sin(env.ltb * f + ph) * sw
          const dx = Math.cos(env.ltb * f + ph) * f * sw // 摆动速度，用于拖尾方向
          const s = (1.6 + rv(6) * 2.6) * u
          const b = fade > 0.66 ? 2 : fade > 0.33 ? 1 : 0
          const tl = vy * 0.28
          if (shape === 2)
            headsPoly[b].push([
              [x, y - s * 1.6],
              [x + s, y],
              [x, y + s * 1.6],
              [x - s, y],
            ])
          else heads[b].push([x, y, s])
          trails[b].push([x, y + s * 1.5, x - (dx * tl) / vy, y + s * 1.5 + tl])
          if (s > 3 * u) glow.push([x, y, s * 3.2])
        }
        dots(env, glow, col, 0.06 * o)
        const lw = Math.max(1, u)
        for (let b = 0; b < 3; b++) {
          segs(env, trails[b], col, lw, [0.08, 0.16, 0.26][b] * o, false, 'round')
          if (shape === 2) polys(env, headsPoly[b], col, [0.25, 0.5, 0.85][b] * o)
          else dots(env, heads[b], col, [0.25, 0.5, 0.85][b] * o)
        }
      },
    },

    /* きらめき — 在歌词四角外侧闪烁的四角星芒 */
    twinkle: {
      w: 1,
      tags: ['pop', 'emotional', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const K = Math.min(7, 3 + (P.n | 0) + (P.big ? 1 : 0))
        const pad = 16 * u + bh(bb) * 0.12
        const X0 = bb.x0 - pad
        const X1 = bb.x1 + pad
        const Y0 = bb.y0 - pad
        const Y1 = bb.y1 + pad
        const per = 2 * (X1 - X0 + Y1 - Y0)
        const fills: Poly[][] = [[], []]
        const lines: Quad[] = []
        for (let i = 0; i < K; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          let t = ((i + rv(1) * 0.6) / K) * per
          let x: number
          let y: number
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
          x += rs(P.seed, i, 2) * 14 * u
          y += rs(P.seed, i, 3) * 14 * u
          x = clamp(x, 16 * u, W - 16 * u)
          y = clamp(y, 16 * u, H - 16 * u)
          if (clearOf(bb, x, y, 4 * u, 1) < 1) continue
          const R = (i === 0 ? 30 : 13 + rv(4) * 12) * u
          const cyc = 1.3 + rv(5) * 0.8
          const ph = ((env.ltb - rv(6) * 0.3) / cyc + rv(7)) % 1
          const intro = E.outBack(clamp((env.lt - rv(6) * 0.3) / 0.3), 2)
          const s =
            Math.min(
              intro,
              env.lt > 0.6 ? 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * ph), 2) : intro,
            ) * o
          if (s <= 0.02) continue
          fills[i % 3 === 0 ? 1 : 0].push(glint(x, y, R * s, R * s * 0.2, 0))
          const L = R * 1.9 * s
          lines.push([x - L, y, x + L, y], [x, y - L, x, y + L])
        }
        segs(env, lines, sc.fg, Math.max(1, 0.9 * u), 0.5 * o)
        polys(env, fills[0], sc.fg, o)
        polys(env, fills[1], sc.accent, o)
      },
    },
    /* ============================================================
       手绘
       ============================================================ */

    /* 筆の払い — 带刷毛留白与收笔飞白的干笔横扫（在文字之下） */
    brushStroke: {
      w: 1,
      tags: ['emotional', 'editorial', 'pop'],
      layer: 'back',
      draw(env, _bb, P) {
        const { W, H, sc, ctx } = env
        const u = U(env)
        if (env.pass !== 'main' || env.lt < 0) return
        const o = outE(env)
        if (o <= 0.003) return
        const v = (P.v | 0) % 3
        // 挑一个颜色 + 透明度组合，保证压在上面的歌词（sc.fg）仍有 >= 3:1 对比
        const cands =
          v === 1
            ? [sc.dim, sc.accent2, sc.sub]
            : [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub, sc.dim]
        let col: string | null = null
        let al = 0
        for (const c of cands.filter(Boolean)) {
          if (contrast(c, sc.bg) < 1.15) continue
          for (let a = v === 1 ? 0.9 : 0.55; a >= 0.2; a -= 0.07)
            if (contrast(mix(sc.bg, c, a), sc.fg) >= 3) {
              col = c
              al = a
              break
            }
          if (col) break
        }
        if (!col) return
        al *= o
        const T = Math.min(W, H) * rr(0.11, 0.16, P.seed, 1)
        const yc = H * 0.5 + (P.low ? 1 : -1) * H * rr(0.0, 0.05, P.seed, 2) + (W < H ? 0 : T * 0.1)
        const ltr = !!P.right
        const xa = W * rr(0.06, 0.16, P.seed, 3)
        const xb = W * rr(0.84, 0.95, P.seed, 4)
        const tilt = rs(P.seed, 5) * T * 0.35
        const bow = rs(P.seed, 6) * T * 0.25
        const head = E.outCubic(clamp(env.lt / 0.5))
        const K = 22
        const S = 26
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalAlpha = al
        ctx.strokeStyle = col
        // 刷毛：每条宽度带合成一条路径，重叠处不会叠加变深
        const bands: Poly[][] = [[], []]
        for (let j = 0; j < K; j++) {
          const f = j / (K - 1) - 0.5
          const rv = (k: number) => r(P.seed, j, k)
          const edge = Math.abs(f) * 2
          const t0 = rv(1) * 0.05 + edge * edge * 0.06
          const t1 = 1 - edge * rr(0.12, 0.4, P.seed, j, 2) - rv(3) * 0.06
          const te = Math.min(t1, head)
          if (te <= t0) continue
          const gapAt = rv(4) < 0.45 ? rr(0.55, 0.9, P.seed, j, 5) : 2
          const gapL = 0.03 + rv(6) * 0.05
          const pl: Poly[] = []
          let cur: Pt[] | null = null
          for (let k = 0; k <= S; k++) {
            const t = t0 + ((te - t0) * k) / S
            if (t > gapAt && t < gapAt + gapL) {
              cur = null
              continue
            }
            const tt = ltr ? t : 1 - t
            const x = lerp(xa, xb, tt)
            const taper = 1 - Math.pow(t, 3) * 0.55
            const y =
              yc +
              tilt * (tt - 0.5) +
              bow * Math.sin(tt * Math.PI) +
              f * T * taper +
              rs(P.seed, j, k, 8) * 0.8 * u
            if (!cur) {
              cur = []
              pl.push(cur)
            }
            cur.push([x, y])
          }
          bands[edge > 0.6 || rv(7) < 0.3 ? 1 : 0].push(...pl)
        }
        bands.forEach((list, bi) => {
          ctx.lineWidth = (T / K) * (bi ? 1.3 : 2.2)
          ctx.beginPath()
          for (const pts of list) {
            if (pts.length < 2) continue
            ctx.moveTo(pts[0][0], pts[0][1])
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
          }
          ctx.stroke()
        })
        ctx.restore()
      },
    },

    /* マスキングテープ — 半透明胶带贴住歌词的四角 */
    tapePieces: {
      w: 0.9,
      tags: ['pop', 'emotional', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        if (env.pass !== 'main' || env.lt < 0) return
        const o = outE(env)
        if (o <= 0.003) return
        const Lt = clamp(Math.min(env.W, env.H) * 0.115, 90 * u, 150 * u) * (0.9 + P.r * 0.2)
        const Ht = Lt * 0.4
        const v = (P.v | 0) % 3
        const cs: Pt[] = P.big
          ? [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ]
          : P.right
            ? [
                [1, -1],
                [-1, 1],
              ]
            : [
                [-1, -1],
                [1, 1],
              ]
        const col = [
          sc.accent2 && contrast(sc.accent2, sc.bg) > 1.6 ? sc.accent2 : sc.sub,
          sc.accent,
          sc.sub,
        ][v]
        cs.forEach(([sx, sy], k) => {
          const q = clamp((env.lt - 0.08 - k * 0.1) / 0.25)
          if (q <= 0) return
          const eq = E.outCubic(q)
          const X = sx < 0 ? bb.x0 : bb.x1
          const Y = sy < 0 ? bb.y0 : bb.y1
          const cx = X + sx * Ht * 0.55
          const cy = Y + sy * Ht * 0.55
          const ang = (-sx * sy * 40 + rs(P.seed, k, 1) * 10 + (1 - eq) * 10 * sx) * DEG
          const s = 1 + 0.2 * (1 - eq)
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(ang)
          ctx.scale(s, s)
          const hl = Lt / 2
          const hh = Ht / 2
          const teeth = 5
          const pts: Pt[] = []
          for (let i = 0; i <= teeth; i++)
            pts.push([
              -hl + (i % 2 ? 3 : 0) * u + rs(P.seed, k, i, 2) * 2 * u,
              -hh + (i / teeth) * Ht,
            ])
          for (let i = teeth; i >= 0; i--)
            pts.push([
              hl - (i % 2 ? 3 : 0) * u + rs(P.seed, k, i, 3) * 2 * u,
              -hh + (i / teeth) * Ht,
            ])
          polys(env, [pts], col, 0.62 * eq * o)
          if (v !== 1) {
            // 胶带上的印纹斜条
            ctx.save()
            ctx.beginPath()
            ctx.rect(-hl + 3 * u, -hh, Lt - 6 * u, Ht)
            ctx.clip()
            const list: Quad[] = []
            for (let x = -hl - Ht; x < hl + Ht; x += 9 * u) list.push([x, hh, x + Ht, -hh])
            segs(env, list, dark(env) ? sc.bg : sc.fg, 2 * u, 0.14 * eq * o)
            ctx.restore()
          }
          ctx.restore()
        })
      },
    },

    /* 手描きの囲み — 绕歌词一圈的松散手绘框 */
    scribbleCircle: {
      w: 1,
      tags: ['pop', 'emotional', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const pts = handLoop(env, bb, P, (P.v | 0) % 2 ? 1.85 : 1.12)
        const e = E.inOutCubic(clamp((env.lt - 0.05) / 0.6))
        stroke(
          env,
          part(pts, 0, e),
          P.accent || !dark(env) ? sc.accent : sc.fg,
          3 * u,
          0.95 * o,
          false,
          { cap: 'round', join: 'round' },
        )
      },
    },

    /* 手描き下線 — 手绘下划线：双笔、波浪或之字涂鸦 */
    scribbleUnder: {
      w: 1.1,
      tags: ['pop', 'emotional', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const vert = bh(bb) > bw(bb) * 1.3
        const v = (P.v | 0) % 3
        const L0 = vert ? bb.y0 : bb.x0
        const L1 = vert ? bb.y1 : bb.x1
        const len = L1 - L0
        const base = vert ? bb.x1 + 14 * u + bw(bb) * 0.1 : bb.y1 + 14 * u + bh(bb) * 0.14
        const map = ([a, c]: Pt): Pt => (vert ? [base + c, a] : [a, base + c])
        const jit = (t: number, k: number) => noise1(t * 3 + k * 7, P.seed) * 3 * u
        const strokes: Poly[] = []
        if (v === 0) {
          const s1: Pt[] = []
          const s2: Pt[] = []
          for (let i = 0; i <= 24; i++) {
            const t = i / 24
            s1.push([
              L0 - 8 * u + (len + 16 * u) * t,
              Math.sin(t * Math.PI) * 5 * u + jit(t, 1) - t * 4 * u,
            ])
          }
          for (let i = 0; i <= 16; i++) {
            const t = i / 16
            s2.push([
              L0 + len * 0.18 + len * 0.78 * t,
              11 * u + Math.sin(t * Math.PI) * 4 * u + jit(t, 2),
            ])
          }
          strokes.push(s1, s2)
        } else if (v === 1) {
          const s: Pt[] = []
          const lam = clamp(len / 22, 30 * u, 64 * u)
          for (let x = 0; x <= len + 0.1; x += 5 * u)
            s.push([L0 + x, Math.sin((x / lam) * TAU) * 5 * u + jit(x / len, 3)])
          strokes.push(s)
        } else {
          const s: Pt[] = []
          const passes = 5
          for (let i = 0; i <= passes; i++) {
            const t = i / passes
            s.push([
              L0 + (i % 2 ? len * 0.96 : len * 0.04) + rs(P.seed, i, 4) * 8 * u,
              t * 14 * u + jit(t, 5),
            ])
          }
          strokes.push(s)
        }
        const col = P.accent || !dark(env) ? sc.accent : sc.fg
        strokes.forEach((s, k) => {
          const e = E.inOutCubic(clamp((env.lt - 0.05 - k * 0.28) / (v === 2 ? 0.55 : 0.35)))
          stroke(env, part(s.map(map), 0, e), col, (k ? 2.6 : 3.4) * u, 0.95 * o, false, {
            cap: 'round',
            join: 'round',
          })
        })
      },
    },

    /* 推敲の走り書き — 歌词旁一个被手划掉的"草稿词"，带一支手绘箭头 */
    crossOut: {
      w: 0.4,
      tags: ['editorial', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const txt = String(cut.text || '').replace(/\s+/g, '')
        const arr = [...txt]
        if (arr.length < 1) return
        const w0 = ((cut.words && cut.words[0]) || '').replace(/\s+/g, '')
        const word =
          [...w0].length >= 2 && [...w0].length <= 4
            ? w0
            : arr.slice(0, Math.min(arr.length, 2 + ((P.v | 0) % 3))).join('')
        const font = serifF(env)
        const fs = clamp(bh(bb) * 0.3, 22 * u, 46 * u)
        const tw = textW(word, font, fs, 0.1)
        const sp = nearBB(env, bb, tw + 24 * u, fs * 1.8, { ...P, low: false }, 16 * u)
        const cx = sp.cx
        const cy = sp.cy
        const a = o * (sp.ok ? 1 : 0.4)
        label(env, word, cx, cy, {
          font,
          size: fs,
          align: 'center',
          color: sc.sub,
          alpha: a * inE(env, 0.2),
          track: 0.1,
        })
        const col = sc.accent
        const x0 = cx - tw / 2 - 6 * u
        const x1 = cx + tw / 2 + 6 * u
        const squiggle = (): Pt[] => {
          const s: Pt[] = []
          for (let i = 0; i <= 6; i++)
            s.push([lerp(x0, x1, i / 6), cy + (i % 2 ? -1 : 1) * fs * 0.28])
          return s
        }
        const strikes: Poly[] =
          (P.v | 0) % 2
            ? [
                [
                  [x0, cy - fs * 0.05],
                  [x1, cy - fs * 0.12],
                ],
                [
                  [x0 + 4 * u, cy + fs * 0.1],
                  [x1 - 2 * u, cy + fs * 0.02],
                ],
              ]
            : [squiggle()]
        strikes.forEach((s, k) =>
          stroke(
            env,
            part(s, 0, E.inOutCubic(clamp((env.lt - 0.3 - k * 0.14) / 0.25))),
            col,
            2.4 * u,
            0.95 * a,
            false,
            { cap: 'round', join: 'round' },
          ),
        )
        // 一支指向歌词最近边缘的手绘箭头
        const e3 = E.outCubic(clamp((env.lt - 0.6) / 0.3))
        if (e3 <= 0) return
        let c1: Pt
        let c3: Pt
        if (cy + fs * 0.6 < bb.y0) {
          c1 = [cx + tw * 0.25, cy + fs * 0.75]
          c3 = [clamp(cx + tw * 0.35, bb.x0 + 10 * u, bb.x1 - 10 * u), bb.y0 - 6 * u]
        } else if (cy - fs * 0.6 > bb.y1) {
          c1 = [cx + tw * 0.25, cy - fs * 0.75]
          c3 = [clamp(cx + tw * 0.35, bb.x0 + 10 * u, bb.x1 - 10 * u), bb.y1 + 6 * u]
        } else if (cx < bb.x0) {
          c1 = [cx + tw / 2 + 8 * u, cy + fs * 0.3]
          c3 = [bb.x0 - 6 * u, clamp(cy + fs, bb.y0 + 10 * u, bb.y1 - 10 * u)]
        } else {
          c1 = [cx - tw / 2 - 8 * u, cy + fs * 0.3]
          c3 = [bb.x1 + 6 * u, clamp(cy + fs, bb.y0 + 10 * u, bb.y1 - 10 * u)]
        }
        const dd = Math.hypot(c3[0] - c1[0], c3[1] - c1[1])
        if (dd > 14 * u && dd < 260 * u) {
          const nx = -(c3[1] - c1[1]) / dd
          const ny = (c3[0] - c1[0]) / dd
          const bend = dd * 0.25
          const c2: Pt = [(c1[0] + c3[0]) / 2 + nx * bend, (c1[1] + c3[1]) / 2 + ny * bend]
          const pts: Pt[] = []
          for (let i = 0; i <= 12; i++) {
            const t = i / 12
            pts.push([
              (1 - t) * (1 - t) * c1[0] + 2 * t * (1 - t) * c2[0] + t * t * c3[0],
              (1 - t) * (1 - t) * c1[1] + 2 * t * (1 - t) * c2[1] + t * t * c3[1],
            ])
          }
          stroke(env, part(pts, 0, e3), col, 2 * u, 0.9 * a, false, { cap: 'round', join: 'round' })
          if (e3 > 0.95) {
            const p = pts[pts.length - 1]
            const q = pts[pts.length - 3]
            const an = Math.atan2(p[1] - q[1], p[0] - q[0])
            const L = 9 * u
            stroke(
              env,
              [
                [p[0] - Math.cos(an - 0.5) * L, p[1] - Math.sin(an - 0.5) * L],
                p,
                [p[0] - Math.cos(an + 0.5) * L, p[1] - Math.sin(an + 0.5) * L],
              ],
              col,
              2 * u,
              0.9 * a,
              false,
              { cap: 'round', join: 'round' },
            )
          }
        }
      },
    },

    /* 蛍光マーカー — 每行下半截的荧光笔涂抹（screen / multiply，字保持锐利） */
    highlightMark: {
      w: 1,
      tags: ['pop', 'editorial', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        if (env.pass !== 'main' || env.lt < 0) return
        const o = outE(env)
        if (o <= 0.003) return
        const dk = dark(env)
        // 荧光色：既要在背景上看得见，又要与文字颜色明显不同
        const cands = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub].filter(Boolean)
        // 浅字 → screen 更亮的色；深字 → multiply 更暗的色（字形本身不受影响）
        const lighten = lum(sc.fg) > lum(sc.bg)
        const lb = lum(sc.bg)
        const side = (c: string) => (lighten ? lum(c) > lb + 0.06 : lum(c) < lb - 0.06)
        const pool = cands.filter(side)
        let col = pool.find((c) => contrast(c, sc.fg) >= 1.6)
        let weak = 1
        if (!col) {
          if (!pool.length) return
          col = pool.sort((x, y) => contrast(y, sc.fg) - contrast(x, sc.fg))[0]
          weak = 0.7
        }
        const vert = bh(bb) > bw(bb) * 1.25
        // 把逐字框归并成行（竖排时是列）
        type MarkLine = { k: number; x0: number; x1: number; y0: number; y1: number }
        let lines: MarkLine[] = []
        if (bb.boxes && bb.boxes.length && bb.cx != null) {
          const bx = bb.boxes.map((b) => ({
            x0: bb.cx + b.x - b.w / 2,
            x1: bb.cx + b.x + b.w / 2,
            y0: bb.cy + b.y - b.h / 2,
            y1: bb.cy + b.y + b.h / 2,
          }))
          for (const b of bx) {
            const key = vert ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2
            const sz = vert ? b.x1 - b.x0 : b.y1 - b.y0
            let L = lines.find((l) => Math.abs(l.k - key) < sz * 0.4)
            if (!L) {
              L = { k: key, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }
              lines.push(L)
            } else {
              L.x0 = Math.min(L.x0, b.x0)
              L.x1 = Math.max(L.x1, b.x1)
              L.y0 = Math.min(L.y0, b.y0)
              L.y1 = Math.max(L.y1, b.y1)
            }
          }
          lines.sort((a, b) => (vert ? b.k - a.k : a.k - b.k))
        }
        if (!lines.length) lines = [{ k: 0, x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 }]
        ctx.save()
        ctx.globalCompositeOperation = lighten ? 'screen' : 'multiply'
        lines.slice(0, 4).forEach((L, k) => {
          const e = E.inOutCubic(clamp((env.lt - 0.1 - k * 0.22) / 0.4))
          if (e <= 0) return
          const pts: Pt[] = []
          const s = vert ? L.x1 - L.x0 : L.y1 - L.y0
          const M = 14
          const a0 = (vert ? L.y0 : L.x0) - s * 0.12
          const a1 = (vert ? L.y1 : L.x1) + s * 0.12
          const aE = lerp(a0, a1, e)
          const c0 = vert ? L.x0 + s * 0.52 : L.y0 + s * 0.46
          const c1 = vert ? L.x1 + s * 0.06 : L.y1 + s * 0.06
          const sl = s * 0.18
          for (let i = 0; i <= M; i++) {
            const t = i / M
            const a = lerp(a0 + sl, aE, t)
            pts.push(
              vert
                ? [c1 + noise1(t * 4, P.seed) * 1.5 * u, a]
                : [a, c0 + noise1(t * 4, P.seed) * 1.5 * u],
            )
          }
          for (let i = M; i >= 0; i--) {
            const t = i / M
            const a = lerp(a0, aE - (e < 1 ? 0 : sl), t)
            pts.push(
              vert
                ? [c0 + noise1(t * 4 + 9, P.seed) * 1.5 * u, a]
                : [a, c1 + noise1(t * 4 + 9, P.seed) * 1.5 * u],
            )
          }
          polys(env, [pts], col, (dk ? 0.6 : 0.62) * o * weak)
        })
        ctx.restore()
      },
    },

    /* ハートと星 — 在歌词四周弹出的小心形与五角星 */
    heartsStars: {
      w: 0.9,
      tags: ['pop', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const K = Math.min(7, 3 + (P.n | 0) + (P.big ? 1 : 0))
        const v = (P.v | 0) % 3
        const pad = 26 * u + bh(bb) * 0.15
        const X0 = bb.x0 - pad
        const X1 = bb.x1 + pad
        const Y0 = bb.y0 - pad
        const Y1 = bb.y1 + pad
        const per = 2 * (X1 - X0 + Y1 - Y0)
        const cols = [
          sc.accent,
          sc.fg,
          sc.accent2 && contrast(sc.accent2, sc.bg) > 1.8 ? sc.accent2 : sc.accent,
        ]
        for (let i = 0; i < K; i++) {
          const rv = (k: number) => r(P.seed, i, k)
          let t = ((i + 0.3 + rv(1) * 0.4) / K) * per
          let x = 0
          let y: number
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
          x = clamp(x, 24 * u, W - 24 * u)
          y = clamp(y, 24 * u, H - 24 * u)
          if (clearOf(bb, x, y, 6 * u, 1) < 1) continue
          const q =
            E.outBack(clamp((env.lt - 0.05 - i * 0.07) / 0.3), 2.4) * (1 - E.inCubic(env.pOut))
          if (q <= 0.01) continue
          const s = (i === 0 ? 36 : 18 + rv(2) * 14) * u * q
          const yy = y + Math.sin(env.ltb * 3 + i * 1.7) * 3 * u
          const rot = Math.sin(env.ltb * 2 + i) * 10 + rs(P.seed, i, 3) * 15
          const isHeart = v === 0 || (v === 2 && i % 2 === 0)
          const c = Math.cos(rot * DEG)
          const sn = Math.sin(rot * DEG)
          const pts = (isHeart ? heart(0, 0, s) : star5(0, 0, s, s * 0.45)).map(([px, py]): Pt => [
            x + px * c - py * sn,
            yy + px * sn + py * c,
          ])
          const col = cols[i % 3]
          if (rv(4) < 0.35) stroke(env, pts, col, 2.2 * u, o, false, { close: true, join: 'round' })
          else polys(env, [pts], col, o, true)
        }
      },
    },

    /* ============================================================
       文字装饰
       ============================================================ */

    /* 透かし大漢字 — 取歌词里一个字，超大号、低透明度，被画面边缘裁掉 */
    watermarkKanji: {
      w: 1,
      tags: ['editorial', 'emotional', 'calm'],
      layer: 'back',
      draw(env, _bb, P) {
        if (env.pass !== 'main') return
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const ch = lyricChar(env, P.v)
        if (!ch) return
        const e = E.outCubic(clamp(env.lt / 0.6))
        const S = Math.min(H * 0.86, W * 0.92) * (1.06 - 0.06 * e)
        const x = P.right ? W - S * 0.3 : S * 0.3
        const y = H * 0.5 + (P.low ? 1 : -1) * H * 0.06 - env.ltb * 5 * u
        const outline = (P.v | 0) % 2 === 1
        const font = (P.v | 0) % 3 === 0 ? env.st.fonts.display[0] : serifF(env)
        if (outline)
          env.draw({
            text: ch,
            font,
            size: S,
            x,
            y,
            color: sc.sub,
            fill: false,
            stroke: 1.6 * u,
            alpha: 0.32 * e * o,
            ghost: false,
          })
        else env.draw({ text: ch, font, size: S, x, y, color: sc.dim, alpha: e * o, ghost: false })
      },
    },

    /* 縦書き帯 — 整行歌词小字号竖排在画面边缘，配一条发丝竖线 */
    verticalStrip: {
      w: 1,
      tags: ['editorial', 'calm', 'emotional'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const all = [...String(cut.lineText || cut.text || '').replace(/\s+/g, '　')].slice(0, 26)
        if (!all.join('').trim()) return
        const fs = clamp(Math.min(W, H) * 0.022, 15 * u, 24 * u)
        const track = 0.28
        const step = fs * (1 + track)
        const clear = 44 * u
        const font = (P.v | 0) % 2 ? serifF(env) : bodyF(env)
        // 选最空的一条边 / 一端（竖排带永远不逼近歌词）
        type Strip = {
          right: boolean
          top: boolean
          x: number
          yTop: number
          yBot: number
          n: number
        }
        let best: Strip | null = null
        for (const right of [!!P.right, !P.right])
          for (const top of [!P.low, !!P.low]) {
            const x = right ? W - m * 0.95 : m * 0.95
            const hClear = x + fs * 1.8 < bb.x0 - clear || x - fs * 1.8 > bb.x1 + clear
            const yTop = m * 1.6 + fs
            const yBot = H - m * 1.3
            const avail = hClear
              ? H - m * 2.9 - fs
              : top
                ? bb.y0 - clear - yTop
                : yBot - (bb.y1 + clear)
            const n = Math.min(all.length, Math.floor(avail / step))
            if (n >= 4 && (!best || n > best.n + 1)) best = { right, top, x, yTop, yBot, n }
          }
        if (!best) return
        const chars = all.slice(0, best.n)
        const th = best.n * step - fs * track
        const y0 = best.top ? best.yTop : best.yBot - th
        const x = best.x
        const shown = Math.ceil(best.n * clamp((env.lt - 0.08) / 0.55))
        if (shown > 0)
          env.draw({
            text: chars.slice(0, shown).join(''),
            font,
            size: fs,
            x,
            y: y0,
            vertical: true,
            align: 'left',
            track,
            color: sc.fg,
            alpha: 0.9 * o,
            ghost: false,
          })
        const rx = x + (best.right ? -1 : 1) * fs * 1.1
        const e = E.outExpo(clamp(env.lt / 0.6))
        stroke(
          env,
          [
            [rx, y0 - fs * 0.2],
            [rx, y0 - fs * 0.2 + (th + fs * 0.4) * e],
          ],
          sc.sub,
          Math.max(1, u),
          0.7 * o,
        )
        env.rect(rx - 2 * u, y0 - fs * 0.2 - 12 * u, 4 * u, 8 * u, sc.accent, o * e, false)
        label(env, pad2((cut.line | 0) + 1), x, y0 - fs * 1.6, {
          size: FS(env) * 0.75,
          align: 'center',
          alpha: o * e,
        })
      },
    },

    /* ローマ字 — 歌词下方一行宽字距拉丁副标，逐字"解码"出来 */
    romajiLine: {
      w: 1,
      tags: ['editorial', 'calm', 'graphic'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const cut = env.cut
        if (!cut) return
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const m = MG(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const raw = String(cut.text || '')
          .replace(/\s+/g, ' ')
          .trim()
        if (!raw) return
        // 没有罗马音引擎：副行退回本行注释 / 原文（契约 §6）
        let str = String(cut.note || cut.lineText || '')
          .toUpperCase()
          .replace(/\s+/g, ' ')
          .trim()
        if (!str)
          str = [...raw]
            .filter((c) => c.trim())
            .slice(0, 6)
            .map((c) => 'U+' + (c.codePointAt(0) ?? 0).toString(16).toUpperCase())
            .join(' ')
        const font = (P.v | 0) % 2 ? bodyF(env) : monoF(env)
        const track = 0.34
        let fs = clamp(Math.min(W, H) * 0.018, 12 * u, 20 * u)
        const maxW = Math.min(W - m * 2.4, Math.max(bw(bb) * 1.15, W * 0.4))
        let tw = textW(str, font, fs, track)
        if (tw > maxW) {
          fs = Math.max(10 * u, (fs * maxW) / tw)
          tw = textW(str, font, fs, track)
        }
        while (tw > maxW && str.length > 4) {
          str = str.slice(0, -2)
          tw = textW(str + '...', font, fs, track)
          if (tw <= maxW) {
            str += '...'
            break
          }
        }
        const gap = 18 * u + bh(bb) * 0.1
        let below = !!P.low
        let y = below ? bb.y1 + gap + fs * 0.5 : bb.y0 - gap - fs * 0.5
        if (y < m * 0.6 || y > H - m * 0.6) {
          below = !below
          y = below ? bb.y1 + gap + fs * 0.5 : bb.y0 - gap - fs * 0.5
        }
        const cx = clamp((bb.x0 + bb.x1) / 2, m + tw / 2, W - m - tw / 2)
        const chars = [...str]
        const n = chars.length
        const out = chars
          .map((c, i) => {
            if (c === ' ') return ' '
            const ti = 0.06 + (i / Math.max(1, n)) * 0.5
            if (env.lt >= ti) return c
            if (env.lt < ti - 0.22) return ' '
            return AZ[hash(P.seed, i, env.step) % 26]
          })
          .join('')
        // 字位保持稳定：按最终字符串的起点左对齐绘制
        label(env, out, cx - tw / 2, y, {
          font,
          size: fs,
          color: sc.sub,
          alpha: o * E.outCubic(clamp(env.lt / 0.2)),
          track,
        })
        const e = E.outExpo(clamp((env.lt - 0.1) / 0.5))
        const hl = 36 * u * e
        const g = 14 * u
        segs(
          env,
          [
            [cx - tw / 2 - g - hl, y, cx - tw / 2 - g, y],
            [cx + tw / 2 + g, y, cx + tw / 2 + g + hl, y],
          ],
          P.accent ? sc.accent : sc.sub,
          Math.max(1, u),
          0.8 * o,
        )
      },
    },

    /* 隅付き括弧 — 粗壮的【 】透镜形括号夹住歌词（竖排时换成上下两支） */
    bracketsJP: {
      w: 1,
      tags: ['pop', 'graphic', 'editorial'],
      layer: 'front',
      draw(env, bb0, P) {
        const bb = getBB(env, bb0)
        const { W, H, sc } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0) return
        const e = E.outExpo(clamp(env.lt / 0.45))
        const pOut = E.inCubic(env.pOut)
        const sl = (1 - e + pOut * 0.6) * 60 * u
        const vert = bh(bb) > bw(bb) * 1.25
        const col = P.accent ? sc.accent : sc.fg
        const a = o * clamp(env.lt / 0.12)
        if (!vert) {
          const h = clamp(bh(bb) * 1.08 + 16 * u, 40 * u, H * 0.6) * (0.5 + 0.5 * e)
          const aw = Math.min(h * 0.24, 26 * u + Math.min(W, H) * 0.028)
          const tb = aw * 0.3
          const gap = 12 * u + bh(bb) * 0.05
          const yc = (bb.y0 + bb.y1) / 2
          const xl = Math.max(bb.x0 - gap, aw + 6 * u)
          const xr = Math.min(bb.x1 + gap, W - aw - 6 * u)
          polys(
            env,
            [
              lentil(xl - aw - sl, yc - h / 2, yc + h / 2, aw, tb, -1),
              lentil(xr + aw + sl, yc - h / 2, yc + h / 2, aw, tb, 1),
            ],
            col,
            a,
            true,
          )
        } else {
          const wv = clamp(bw(bb) * 1.05 + 16 * u, 40 * u, W * 0.6) * (0.5 + 0.5 * e)
          const aw = Math.min(wv * 0.24, 26 * u + Math.min(W, H) * 0.028)
          const tb = aw * 0.3
          const gap = 12 * u + bw(bb) * 0.05
          const xc = (bb.x0 + bb.x1) / 2
          const xL = xc - wv / 2
          const M = 16
          const yt = Math.max(bb.y0 - gap, aw + 6 * u) - sl
          const yb = Math.min(bb.y1 + gap, H - aw - 6 * u) + sl
          const mk = (yi: number, dir: number): Pt[] => {
            const p: Pt[] = [
              [xL, yi + dir * aw],
              [xL, yi],
            ]
            for (let i = 1; i < M; i++) {
              const t = i / M
              const b = Math.pow(Math.sin(t * Math.PI), 0.7)
              p.push([xL + wv * t, yi + dir * (aw - tb) * b])
            }
            p.push([xL + wv, yi], [xL + wv, yi + dir * aw])
            return p
          }
          polys(env, [mk(yt, -1), mk(yb, 1)], col, a, true)
        }
      },
    },

    /* 落款 — 一枚朱印，盖上歌词里的一个字，压在歌词旁 */
    seal: {
      w: 0.9,
      tags: ['editorial', 'emotional', 'calm'],
      layer: 'front',
      draw(env, bb0, P) {
        if (env.pass !== 'main') return
        const bb = getBB(env, bb0)
        const { sc, ctx } = env
        const u = U(env)
        const o = outE(env)
        if (o <= 0.003 || env.lt < 0.08) return
        const ch = lyricChar(env, 3 + (P.v | 0))
        if (!ch) return
        const S = clamp(Math.min(env.W, env.H) * 0.074, 48 * u, 92 * u)
        const sp = nearBB(
          env,
          bb,
          S * 1.3,
          S * 1.3,
          { ...P, right: P.v % 3 !== 2, low: true },
          14 * u,
        )
        const p = clamp((env.lt - 0.08) / 0.3)
        const q = E.outCubic(p)
        const a = clamp(p * 4) * o * (sp.ok ? 1 : 0.4)
        const s = lerp(1.5, 1, q)
        const rot = (rs(P.seed, 1) * 5 - (1 - q) * 12) * DEG
        const round = (P.v | 0) % 2 === 1
        ctx.save()
        ctx.translate(sp.cx, sp.cy)
        ctx.rotate(rot)
        ctx.scale(s, s)
        const h = S / 2
        const pts: Pt[] = []
        if (round) {
          for (let i = 0; i < 28; i++) {
            const an = (i / 28) * TAU
            const rad = h * (1 + rs(P.seed, i, 2) * 0.025)
            pts.push([Math.cos(an) * rad, Math.sin(an) * rad])
          }
        } else {
          const corners: Pt[] = [
            [-h, -h],
            [h, -h],
            [h, h],
            [-h, h],
          ]
          for (let k = 0; k < 4; k++) {
            const p0 = corners[k]
            const p1 = corners[(k + 1) % 4]
            for (let i = 0; i < 4; i++) {
              const t = i / 4
              const j = rs(P.seed, k, i, 3) * 1.3 * u
              pts.push([
                lerp(p0[0], p1[0], t) + (k % 2 ? j : 0),
                lerp(p0[1], p1[1], t) + (k % 2 ? 0 : j),
              ])
            }
          }
        }
        polys(env, [pts], sc.accent, a * 0.95, false)
        if (env.pass === 'main') {
          const inner = (P.v | 0) % 3 === 2
          if (inner) {
            if (round) env.circle(0, 0, h * 0.84, null, sc.bg, 1.6 * u, a, false)
            else
              stroke(
                env,
                [
                  [-h * 0.84, -h * 0.84],
                  [h * 0.84, -h * 0.84],
                  [h * 0.84, h * 0.84],
                  [-h * 0.84, h * 0.84],
                ],
                sc.bg,
                1.6 * u,
                a,
                false,
                { close: true },
              )
          }
          env.draw({
            text: ch,
            font: serifF(env) === 'serif_light' ? 'serif_bold' : serifF(env),
            size: S * 0.62,
            x: 0,
            y: S * 0.02,
            color: sc.bg,
            alpha: a,
            ghost: false,
          })
          const sp2: Dot[] = []
          for (let i = 0; i < 9; i++)
            sp2.push([
              rs(P.seed, i, 5) * h * 0.9,
              rs(P.seed, i, 6) * h * 0.9,
              (0.6 + r(P.seed, i, 7) * 1.6) * u,
            ])
          dots(env, sp2, sc.bg, a * 0.7)
        }
        ctx.restore()
      },
    },
  },
}
