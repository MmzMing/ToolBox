/**
 * 表达式包 layoutsD：动力学 / 拟 3D / 实体物件 / 平面波普一类的构图（34 件）。
 *
 * 1:1 移植自 JIZURA 的 `src/11p_layoutsD.js`。与核心 `../layouts` 同一套契约：
 * - `plan(rng, cut, st)` 每镜跑一次，把随机挑选写进可序列化的 params；
 * - `render(env)` 逐帧跑，读 `env.cut.params` 作画，返回主文字包围盒。
 *
 * 这一包的共同点是"歌词印在一个会动的物件上"：立方体、圆筒、卡片、风琴折、旗帜……
 * 因此文件内自带一批几何助手（仿射矩阵贴图、多边形重采样、离屏图案缓存），
 * 主文字一律先算出一个 2×3 仿射矩阵再交给 `mainDraw`（drawAff），
 * 包围盒用矩阵四角反算回设计空间。
 *
 * 中文适配：罗马音副行改为「歌词行注释兜底链」，假名干扰字池换成常用汉字池，
 * 片假名标签（ヨコのカギ…）换成中文；几何与时长全部照搬。
 */
import type {
  BBox,
  CharFn,
  Cut,
  Env,
  PackParts,
  Paint,
  Rng,
  Scheme,
  StylePack,
  TextItem,
} from '../types'
import { fontsOf, mainDraw, unionBB } from '../layouts'
import { chunkText, fitSize, layoutText, measure, splitLines } from '../text-layout'
import { metrics } from '../glyphs'
import { fontCSS } from '../fonts'
import { ctxOf, makeCanvas } from '../canvas'
import { glyphCount, isHan, isKana, isLatin, isPunct } from '../script'
import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  fmtTime,
  hash,
  lerp,
  lum,
  mix,
  r,
  rgba,
  rr,
  rs,
  sid,
} from '../util'

/* ------------------------------------------------------------------ 通用助手 */

type Mat = number[]
type Pt = [number, number]

/** 短边（这一包里所有"按画面尺寸换算"的量都走它） */
const U = (env: Env): number => Math.min(env.W, env.H)
const isPort = (env: Env): boolean => env.H > env.W * 1.08
const strip = (t: string): string => String(t || '').replace(/\s+/g, '')
const hasLatin = (t: string): boolean => /[A-Za-z]/.test(t)
/** 整句当一个串：拉丁保留词间单空格，中文直接去掉空白 */
const flat = (t: string): string =>
  hasLatin(t)
    ? String(t || '')
        .trim()
        .replace(/\s+/g, ' ')
    : strip(t)
/** 保留词间空格的字形槽位（' ' 槽位留空不画） */
const slotsOf = (t: string): string[] => [...flat(t)]
const bodyF = (env: Env): string => env.st.fonts.body[0] || 'sans_med'
const monoF = (env: Env): string => env.st.fonts.mono[0] || 'mono'
/** 入场缓动：从本地时间 lt 延时 d 秒、时长 len */
const tin = (env: Env, d = 0, len = 0.4, ease: (x: number) => number = E.outExpo): number =>
  ease(clamp((env.lt - d) / Math.max(0.01, len)))
/** 出场衰减（几乎所有底板都用它收束） */
const tout = (env: Env): number => 1 - E.inCubic(env.pOut)
const box = (x0: number, y0: number, x1: number, y1: number): BBox => ({
  x0,
  y0,
  x1,
  y1,
  cx: (x0 + x1) / 2,
  cy: (y0 + y1) / 2,
  boxes: [],
})
const pad2 = (n: number): string => String(n).padStart(2, '0')
const lineNo = (cut: Cut): string => pad2(Math.max(0, cut.line | 0) + 1)
const smallSize = (env: Env): number => clamp(U(env) * 0.024, 13, 32)
/** 让 mainDraw 从本地时间 t 才开始这一项入场的 motion index */
const miAt = (_env: Env, cut: Cut, t: number): number =>
  Math.max(0, t) / Math.max(0.005, cut.stagger || 0.04)
/** 大底板只在飞入阶段上色散残影 */
const gIn = (env: Env): boolean => env.lt < 0.6 && env.pOut <= 0
/** 印在物件上的字只保留不打乱位置的保持动效 */
const plateHold = (cut: Cut): boolean =>
  !['still', 'jitter', 'breathe', 'glitchtick'].includes(cut.hold)
/** 旧项目的假名→罗马音副行没有对应物，改用歌词行尾注释兜底 */
const romajiOf = (cut: Cut): string | null => (cut.note ? flat(cut.note) : null)
/** 副标题一行：整句 ≠ 本镜文字就用整句，否则注释，最后退化成编号 */
const altCopy = (cut: Cut): string => {
  if (cut.lineText && strip(cut.lineText) !== strip(cut.text)) return flat(cut.lineText)
  return romajiOf(cut) || 'No.' + lineNo(cut)
}
const lightOf = (sc: Scheme): string => (lum(sc.fg) > lum(sc.bg) ? sc.fg : sc.bg)
const darkOf = (sc: Scheme): string => (lum(sc.fg) > lum(sc.bg) ? sc.bg : sc.fg)

const onColCache = new Map<string, string>()
/** 在色值为 fill 的底板上对比度最好的配色成员 */
function onCol(sc: Scheme, fill: string): string {
  const key = fill + sc.bg + sc.fg + sc.ink + sc.accent
  const hit = onColCache.get(key)
  if (hit) return hit
  let best = ''
  let bv = 0
  for (const c of [sc.bg, sc.fg, sc.ink, sc.accent, sc.sub]) {
    if (!c || c === fill) continue
    const k = contrast(c, fill)
    if (k > bv) {
      bv = k
      best = c
    }
  }
  const v = bv >= 2.4 ? best : lum(fill) > 0.5 ? '#111111' : '#FFFFFF'
  if (onColCache.size > 300) onColCache.clear()
  onColCache.set(key, v)
  return v
}
/** 第一个能在背景上显出来的配色成员（画板/物件本体色） */
function plateCol(sc: Scheme, pref: readonly string[]): string {
  for (const c of pref) if (c && contrast(c, sc.bg) >= 1.6) return c
  return sc.fg
}
/** 把底板色往亮端（s > 0）或暗端（s < 0）推 */
const shade = (sc: Scheme, c: string, s: number): string =>
  s >= 0 ? mix(c, lightOf(sc), Math.min(0.9, s)) : mix(c, darkOf(sc), Math.min(0.9, -s))
/** 一组在背景上读得清的物件色（牌、磁贴、气球…） */
function objCols(sc: Scheme): string[] {
  const out: string[] = []
  for (const c of [sc.accent, sc.fg, sc.accent2, sc.ink, sc.sub])
    if (c && contrast(c, sc.bg) >= 1.7 && !out.includes(c)) out.push(c)
  return out.length ? out : [sc.fg]
}
const adv = (font: string, ch: string): number => (ch === ' ' ? 0.34 : metrics.adv(font, ch))
/** CharT / TextItem 的颜色位被窄化成 string，运行时接受任意 Paint */
const asColor = (p: Paint): string => p as unknown as string

/* ---- 分块：把整句切成 k 组尽量均衡的词块（长词在自然处再劈开） ---- */

function splitWord(w: string): string[] {
  const n = [...w].length
  if (/[A-Za-z]/.test(w)) {
    if (/[^\0-\x7F]/.test(w)) {
      const c = chunkText(w).filter(Boolean)
      if (c.length > 1) return c
    }
    return n > 10 ? [w.slice(0, Math.ceil(w.length / 2)), w.slice(Math.ceil(w.length / 2))] : [w]
  }
  return n < 2
    ? [w]
    : splitLines(w, Math.ceil(n / 2))
        .split('\n')
        .filter(Boolean)
}

type Word = { t: string; sp: boolean }

function chunksK(text: string, kIn: number): string[] {
  const t = String(text || '').trim()
  if (!t) return ['']
  let words: Word[] = []
  if (/\s/.test(t) && hasLatin(t)) {
    const ws = t.split(/\s+/).filter(Boolean)
    ws.forEach((w, i) => words.push({ t: w, sp: i < ws.length - 1 }))
  } else
    words = chunkText(strip(t))
      .map((w) => ({ t: w.trim(), sp: false }))
      .filter((w) => w.t)
  if (!words.length) words = [{ t, sp: false }]
  const k = Math.max(1, Math.min(kIn, glyphCount(t)))
  const gl = (w: Word): number => glyphCount(w.t)
  const hard = new Set<string>()
  const splitAt = (idx: number): boolean => {
    const w = words[idx]
    const parts = splitWord(w.t)
    if (parts.length < 2) {
      hard.add(w.t)
      return false
    }
    words.splice(
      idx,
      1,
      ...parts.map((q, i) => ({ t: q, sp: i === parts.length - 1 ? w.sp : false })),
    )
    return true
  }
  for (let guard = 0; words.length < k && guard < 20; guard++) {
    let bi = -1
    let bl = 1
    words.forEach((w, i) => {
      if (!hard.has(w.t) && gl(w) > bl) {
        bl = gl(w)
        bi = i
      }
    })
    if (bi < 0) break
    splitAt(bi)
  }
  // 连续切分成 k 组、字形数最均衡（小型 DP）
  const part = (): Word[][] => {
    const n = words.length
    const kk = Math.min(k, n)
    const L = words.map((w) => gl(w) + 0.4)
    const pre: number[] = [0]
    L.forEach((l) => pre.push(pre[pre.length - 1] + l))
    const tgt = pre[n] / kk
    const dp = Array.from({ length: kk + 1 }, () =>
      new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY),
    )
    const by = Array.from({ length: kk + 1 }, () => new Array<number>(n + 1).fill(0))
    dp[0][0] = 0
    for (let g = 1; g <= kk; g++)
      for (let i = g; i <= n; i++)
        for (let j = g - 1; j < i; j++) {
          const d = pre[i] - pre[j] - tgt
          const v = dp[g - 1][j] + d * d
          if (v < dp[g][i]) {
            dp[g][i] = v
            by[g][i] = j
          }
        }
    const cuts: number[] = []
    let i = n
    for (let g = kk; g >= 1; g--) {
      cuts.unshift(i)
      i = by[g][i]
    }
    const out: Word[][] = []
    let prev = 0
    for (const c of cuts) {
      out.push(words.slice(prev, c))
      prev = c
    }
    return out
  }
  let groups = part()
  for (let it = 0; it < 3 && groups.length > 1; it++) {
    const lens = groups.map((g) => g.reduce((a, w) => a + gl(w), 0))
    const mx = Math.max(...lens)
    const mn = Math.min(...lens)
    if (mx <= mn * 1.7 + 1) break
    const big = groups[lens.indexOf(mx)]
    let bw: Word | null = null
    for (const w of big) if (!hard.has(w.t) && gl(w) >= 4 && (!bw || gl(w) > gl(bw))) bw = w
    if (!bw || !splitAt(words.indexOf(bw))) break
    groups = part()
  }
  return groups
    .map((g) => g.map((w, i) => w.t + (i < g.length - 1 && w.sp ? ' ' : '')).join(''))
    .filter(Boolean)
}

/** 按槽位分成若干行（' ' 槽位表示词间隙），在词块边界断行 */
const rowsOf = (text: string, maxPer: number): string[][] => {
  const t = flat(text)
  const n = glyphCount(t)
  return (n > maxPer ? chunksK(t, Math.ceil(n / maxPer)) : [t]).map((row) => [...row.trim()])
}
/** 展示型断行：在词块边界处均衡换行 */
const brk = (text: string, maxPer: number): string => {
  const t = flat(text)
  const n = glyphCount(t)
  return n <= maxPer ? t : chunksK(t, Math.ceil(n / maxPer)).join('\n')
}

/* ---- 仿射：文字经矩阵画出，包围盒再反算回设计空间 ---- */

const mapPt = (m: Mat, x: number, y: number): Pt => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
]
const mapBB = (bb: BBox | null, m: Mat): BBox | null => {
  if (!bb) return null
  let x0 = 1e9
  let y0 = 1e9
  let x1 = -1e9
  let y1 = -1e9
  for (const [x, y] of [
    [bb.x0, bb.y0],
    [bb.x1, bb.y0],
    [bb.x1, bb.y1],
    [bb.x0, bb.y1],
  ] as Pt[]) {
    const p = mapPt(m, x, y)
    x0 = Math.min(x0, p[0])
    x1 = Math.max(x1, p[0])
    y0 = Math.min(y0, p[1])
    y1 = Math.max(y1, p[1])
  }
  return box(x0, y0, x1, y1)
}
const drawAff = (env: Env, it: TextItem, m: Mat): BBox | null => {
  const c = env.ctx
  c.save()
  c.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  const bb = mainDraw(env, it)
  c.restore()
  return mapBB(bb, m)
}
/** 陪衬文字：不进 mainDraw，只做矩阵变换 */
const drawAffPlain = (env: Env, it: TextItem, m: Mat): void => {
  const c = env.ctx
  c.save()
  c.transform(m[0], m[1], m[2], m[3], m[4], m[5])
  env.draw(it)
  c.restore()
}
const polyPts = (m: Mat, pts: readonly (readonly number[])[]): Pt[] =>
  pts.map((p) => mapPt(m, p[0], p[1]))
/** 圆角矩形路径（直接画到 ctx 上，调用方负责 beginPath） */
const rrPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void => {
  const k = Math.max(0, Math.min(rad, w / 2, h / 2))
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}
/** 多边形轮廓（只在主 pass 有意义） */
const outline = (env: Env, pts: readonly Pt[], col: string, lw: number, a = 1): void => {
  if (pts.length > 1) env.line([...pts, pts[0]], col, lw, a, false)
}
/** 日文假名池换成常用汉字池（填字/干扰字的来源） */
const FILLER = '之乎者也日月星山水火土木金风云雨雪花鸟虫鱼春夏秋冬东南西北上下左右中高大小'
const fillers = [...FILLER].filter((_c, i) => i % 3 === 0)
const poolCache = new Map<string, string[]>()
/** 从整句里取出的字形池（干扰字、填充字） */
function poolOf(cut: Cut): string[] {
  const key = (cut.lineText || '') + '|' + cut.text
  const hit = poolCache.get(key)
  if (hit) return hit
  const own = [...strip((cut.lineText || '') + cut.text)].filter(
    (c) => !isPunct(c) && !isKana(c) && c !== 'ー' && !isLatin(c),
  )
  const p = own.concat(fillers)
  if (poolCache.size > 100) poolCache.clear()
  poolCache.set(key, p)
  return p
}
/** 按字体度量表版本作废的逐字缓存（字体是延迟加载的） */
const MEMO = new Map<string, unknown>()
const SENT = '\x01layoutsD'
function memo<T>(key: string, fn: () => T): T {
  const mm = metrics.m
  if (mm && !mm.has(SENT)) {
    MEMO.clear()
    mm.set(SENT, 1)
  }
  if (MEMO.has(key)) return MEMO.get(key) as T
  const v = fn()
  if (MEMO.size > 300) MEMO.clear()
  MEMO.set(key, v)
  return v
}
/** 闭合多边形按固定间距重采样（灯泡招牌的灯座轨迹） */
function resample(pts: readonly Pt[], d: number, maxN = 160): Pt[] {
  const seg: number[] = []
  let L = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    seg.push(l)
    L += l
  }
  const N = Math.max(4, Math.min(maxN, Math.round(L / d)))
  const step = L / N
  const out: Pt[] = []
  let si = 0
  let acc = 0
  for (let k = 0; k < N; k++) {
    const t = k * step
    while (si < seg.length - 1 && acc + seg[si] < t) {
      acc += seg[si]
      si++
    }
    const a = pts[si]
    const b = pts[(si + 1) % pts.length]
    const f = seg[si] > 0 ? (t - acc) / seg[si] : 0
    out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)])
  }
  return out
}
/** 圆角矩形轮廓点（招牌外框） */
function rrPts(x: number, y: number, w: number, h: number, rad: number, nc = 5): Pt[] {
  const k = Math.min(rad, w / 2, h / 2)
  const out: Pt[] = []
  const C: [number, number, number][] = [
    [x + w - k, y + k, -90],
    [x + w - k, y + h - k, 0],
    [x + k, y + h - k, 90],
    [x + k, y + k, 180],
  ]
  for (const [cx, cy, a0] of C)
    for (let i = 0; i <= nc; i++) {
      const a = (a0 + (90 * i) / nc) * DEG
      out.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k])
    }
  return out
}

/* ================================================================== 1 cube 立方体 */

/** 正交立方体（偏航 th、俯仰 ph）：每个面都是平行四边形，一个仿射矩阵就能贴图 */
function cubeFaces(cx: number, cy: number, h: number, th: number, ph: number) {
  const cp = Math.cos(ph)
  const sp = Math.sin(ph)
  const faces: { f: number; vis: number; m: Mat; nx: number; nz: number; top?: boolean }[] = []
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2 + th
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    faces.push({
      f,
      vis: ca * cp,
      m: [ca, -sa * sp, 0, cp, cx + h * sa, cy + h * ca * sp],
      nx: sa,
      nz: ca,
    })
  }
  const ct = Math.cos(th)
  const s2 = Math.sin(th)
  faces.push({
    f: 4,
    vis: sp,
    m: [ct, -s2 * sp, s2, ct * sp, cx, cy - h * cp],
    nx: 0,
    nz: 0,
    top: true,
  })
  return faces
}

type CubeParams = {
  mode: string
  chunks: string[]
  font: string
  pitch: number
  dir: number
  face: string
  top: string
  sway: number
}

/* ================================================================== 2 cylinder 円筒 */

type CylinderParams = {
  font: string
  fs: string
  rings: number
  band: boolean
  dir: number
  speed: number
  tilt: number
  sep: string
  glass: boolean
}

/* ================================================================== 3 flipCards カードめくり */

type FlipCardsParams = {
  font: string
  order: string
  table: boolean
  back: string
  peek: boolean
  idx: boolean
}

/* ================================================================== 4 accordion 蛇腹 */

type AccordionParams = {
  font: string
  fold: number
  orient: string
  covers: boolean
  plate: string
  breathe: number
  start: number
}

/* ================================================================== 5 flag はためく旗 */

type FlagParams = {
  font: string
  mode: string
  cloth: string
  trim: string
  tail: string
  wind: number
  side: number
}

/* ================================================================== 6 ribbon リボン */

type RibbonParams = {
  font: string
  amp: number
  freq: number
  ph: number
  col: string
  reveal: string
  tilt: number
}

/* ================================================================== 7 pendulum 振り子 */

type PendulumParams = {
  mode: string
  chunks: string[]
  font: string
  period: number
  amp: number
  phase: number
  side: number
}

/* ================================================================== 8 pile 文字の山 */

type PileParams = {
  font: string
  hf: string
  peak: number
  hgt: number
  order: string
  dust: boolean
}

/* ================================================================== 9 blocks 積み木 */

type BlocksParams = {
  font: string
  deco: boolean
  tilt: boolean
  hop: boolean
  side: number
  colOff: number
}

type Block = {
  ch: string | null
  x: number
  y: number
  r?: number
  order: number
  col: string
  shape?: number
  sz?: number
}

/* ================================================================== 10 balloons 文字風船 */

type BalloonsParams = {
  font: string
  tie: string
  arc: number
  colOff: number
  mono: boolean
}

/* ================================================================== 11 magnets マグネット */

/** 冰箱门上散落的干扰磁贴字符 */
const DECOY = 'ABCDEFGHKMNPRSTXYZ0123456789★♥♪?!'

type MagnetsParams = {
  font: string
  df: string
  decoys: number
  handle: number
  colOff: number
  tilt: number
}

type MagnetItem = {
  ch: string
  x: number
  y: number
  size: number
  rot: number
  col: string
  q: number
}

/* ================================================================== 12 tiles 文字タイル */

/** 拼字游戏分值：非拉丁字形按 sid 稳定给分 */
const LPTS: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
}
const tilePts = (ch: string): number => {
  const up = ch.toUpperCase()
  if (LPTS[up]) return LPTS[up]
  if (isHan(ch)) return 3 + (sid(ch) % 8)
  if (isKana(ch)) return 5
  if (isPunct(ch)) return 0
  return 1 + (sid(ch) % 3)
}

type TilesParams = {
  font: string
  from: string
  rack: string
  score: boolean
}

/* ================================================================== 13 bulbs 電球サイン */

type BulbsParams = {
  font: string
  shape: string
  chase: string
  dir: number
  sub: boolean
}

/* ================================================================== 14 ledScroll 電光掲示板 */

/** LED 模组的点阵贴片：'dot' 是亮点，'mask' 是"挖掉圆点"的反遮罩 */
const ledTiles = new Map<string, HTMLCanvasElement>()
function ledTile(kind: string, col: string, bg: string, T: number): HTMLCanvasElement {
  const key = kind + col + bg + T
  const hit = ledTiles.get(key)
  if (hit) return hit
  const cv = makeCanvas(T, T)
  const x = ctxOf(cv)
  if (kind === 'mask') {
    x.fillStyle = bg
    x.fillRect(0, 0, T, T)
    x.globalCompositeOperation = 'destination-out'
    x.beginPath()
    x.arc(T / 2, T / 2, T * 0.37, 0, TAU)
    x.fill()
  } else {
    x.fillStyle = col
    x.beginPath()
    x.arc(T / 2, T / 2, T * 0.33, 0, TAU)
    x.fill()
  }
  if (ledTiles.size > 40) ledTiles.clear()
  ledTiles.set(key, cv)
  return cv
}

type LedScrollParams = {
  font: string
  col: string
  info: string
  mods: number
  y: number
}

/* ================================================================== 15 billboard 看板 */

type BillboardParams = {
  font: string
  face: string
  lamps: number
  sweep: number
  tag: boolean
}

/* ================================================================== 16 crowdBubbles 吹き出しの群れ */

const REACT = ['…', '！？', '♪', '？', '！', '…！', '♡']

type CrowdBubblesParams = {
  font: string
  sf: string
  big: string
  style: string
  count: number
  side: number
}

/* ================================================================== 17 crossword クロスワード */

type CrosswordParams = {
  font: string
  dens: number
  fill: number
  clue: boolean
}

/* ================================================================== 18 wordSearch 文字探し */

type WordSearchParams = {
  font: string
  gf: string
  dir: string
  decoys: number
  pad: number
}

/* ================================================================== 19 puzzle パズル */

/** 一条拼图边（x0,y0)→(x1,y1)；s = ±1 凸/凹，0 平边 */
function jigEdge(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  s: number,
): void {
  if (!s) {
    ctx.lineTo(x1, y1)
    return
  }
  const dx = x1 - x0
  const dy = y1 - y0
  const L = Math.hypot(dx, dy)
  const ux = dx / L
  const uy = dy / L
  const nx = uy * s
  const ny = -ux * s
  const P = (t: number, h: number): Pt => [
    x0 + ux * t * L + nx * h * L,
    y0 + uy * t * L + ny * h * L,
  ]
  const a = P(0.37, 0)
  const b1 = P(0.42, 0.1)
  const b2 = P(0.3, 0.26)
  const c = P(0.5, 0.27)
  const d1 = P(0.7, 0.26)
  const d2 = P(0.58, 0.1)
  const e = P(0.63, 0)
  ctx.lineTo(a[0], a[1])
  ctx.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], c[0], c[1])
  ctx.bezierCurveTo(d1[0], d1[1], d2[0], d2[1], e[0], e[1])
  ctx.lineTo(x1, y1)
}
const jigPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  r0: number,
  b: number,
  l: number,
): void => {
  ctx.moveTo(x, y)
  jigEdge(ctx, x, y, x + w, y, t)
  jigEdge(ctx, x + w, y, x + w, y + h, r0)
  jigEdge(ctx, x + w, y + h, x, y + h, b)
  jigEdge(ctx, x, y + h, x, y, l)
  ctx.closePath()
}

type PuzzleParams = {
  font: string
  plate: string
  rows: number
  last: boolean
  spread: number
}

/* ================================================================== 20 shadowPlay 影絵 */

type ShadowPlayParams = {
  font: string
  mode: string
  dir: number
  sweep: number
  sun: boolean
}

/* ================================================================== 21 kaleido 万華鏡 */

type KaleidoParams = {
  font: string
  N: number
  speed: number
  flow: number
  center: string
  tint: string
}

/* ================================================================== 22 dominoes ドミノ */

/** 骨牌点数布局（原样照搬 0..6 的骰位） */
const PIPS: [number, number][][] = [
  [],
  [[0, 0]],
  [
    [-1, -1],
    [1, 1],
  ],
  [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
]

type DominoesParams = {
  font: string
  face: string
  pips: boolean
}

/* ================================================================== 23 burst ドカン */

type BurstParams = {
  font: string
  spikes: number
  sharp: number
  tilt: number
  lines: boolean
  debris: boolean
  order: string
}

/* ================================================================== 24 fisheye 魚眼レンズ */

type FisheyeParams = {
  font: string
  mode: string
  glass: string
  amp: number
}

/* ================================================================== 25 wall 壁面パース */

type WallParams = {
  font: string
  side: number
  yaw: number
  orbit: number
  stripe: boolean
  eye: number
  tone: string
}

/* ================================================================== 26 origami 折り紙 */

type OrigamiParams = {
  font: string
  mode: string
  col: string
  order: number
}

/* ================================================================== 27 zipper ジッパー */

type ZipperParams = {
  font: string
  cloth: string
  dir: number
  stitch: boolean
}

/* ================================================================== 28 sliceStack スライス積層 */

type SliceStackParams = {
  font: string
  mode: string
  slices: number
  gap: number
  side: string
  amp: number
  dir: number
  plate: string
}

/* ================================================================== 29 glitchGrid グリッチ格子 */

type GlitchGridParams = {
  font: string
  rate: number
  inv: number
  labels: boolean
  gut: number
}

/* ================================================================== 30 mosaicTiles タイル画 */

type MosaicSample = { cols: number; rows: number; lit: number[] }
let mosaicCv: HTMLCanvasElement | null = null
/** 把文字栅格化到 1 格 = D 像素，取出被字覆盖的格子（一次性、按参数缓存） */
const mosaicSample = (text: string, font: string, D: number, lead: number): MosaicSample =>
  memo('mos|' + text + '|' + font + '|' + D + '|' + lead, (): MosaicSample => {
    const SS = 4
    const fpx = D * SS
    const lay = layoutText({ text, font, size: fpx, lead })
    const cols = Math.ceil(lay.W / SS) + 2
    const rows = Math.ceil(lay.H / SS) + 2
    const cw = cols * SS
    const chh = rows * SS
    let cv: HTMLCanvasElement
    try {
      if (!mosaicCv) mosaicCv = makeCanvas()
      cv = mosaicCv
    } catch {
      /* 拿不到画布（无 DOM）：当作没有亮格 */
      return { cols, rows, lit: [] }
    }
    cv.width = cw
    cv.height = chh
    const x = ctxOf(cv, { willReadFrequently: true })
    x.clearRect(0, 0, cw, chh)
    x.font = fontCSS(font, fpx)
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillStyle = '#fff'
    x.strokeStyle = '#fff'
    x.lineWidth = SS * 0.7
    x.lineJoin = 'round'
    for (const g of lay)
      if (g.ch !== ' ' && g.ch !== '\u3000') {
        x.fillText(g.ch, cw / 2 + g.x, chh / 2 + g.y)
        x.strokeText(g.ch, cw / 2 + g.x, chh / 2 + g.y)
      }
    const id = x.getImageData(0, 0, cw, chh).data
    const lit: number[] = []
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        let a = 0
        for (let yy = 0; yy < SS; yy++)
          for (let xx = 0; xx < SS; xx++) a += id[((row * SS + yy) * cw + col * SS + xx) * 4 + 3]
        if (a / (SS * SS * 255) > 0.42) lit.push(col, row)
      }
    return { cols, rows, lit }
  })

type MosaicTilesParams = {
  font: string
  D: number
  wave: string
  rot: boolean
  col: string
  floor: boolean
}

/* ================================================================== 31 maskReveal 文字窓 */

/** 给一个文字项加逐字填充（图案/渐变），并且能扛住 mainDraw 重置 charFns */
const withFill = (it: TextItem, fillOf: () => Paint): TextItem => {
  let arr: CharFn[] = []
  const fn: CharFn = () => (it.pieceFn ? null : { color: asColor(fillOf()) })
  Object.defineProperty(it, 'charFns', {
    get: () => arr,
    set: (v: CharFn[]) => {
      arr = v
      if (Array.isArray(v)) arr.unshift(fn)
    },
    enumerable: true,
    configurable: true,
  })
  return it
}
const tileCache = new Map<string, HTMLCanvasElement>()
/** 图案贴片：按 key 缓存一张离屏小图 */
function tileCv(
  key: string,
  w: number,
  h: number,
  paint: (x: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement | null {
  const hit = tileCache.get(key)
  if (hit) return hit
  let cv: HTMLCanvasElement
  try {
    cv = makeCanvas(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)))
  } catch {
    /* 无 DOM 环境 */
    return null
  }
  paint(ctxOf(cv), cv.width, cv.height)
  if (tileCache.size > 30) tileCache.clear()
  tileCache.set(key, cv)
  return cv
}

type MaskRevealParams = {
  font: string
  scene: string
  ang: number
  speed: number
  rim: boolean
  label: boolean
}

/* ================================================================== 32 contour 等高線 */

type ContourParams = {
  font: string
  fb: string
  side: number
  rings: number
  speed: number
  col: string
  place: string
}

/* ================================================================== 33 halftoneBig 網点巨大文字 */

type Coverage = { S: number; cw: number; ch: number; a: Uint8Array }
let halftoneCv: HTMLCanvasElement | null = null
/** 文字块的 alpha 覆盖率（em = 64px 采一次，按参数缓存） */
const coverage = (text: string, font: string, lead: number, track: number): Coverage | null =>
  memo('cov|' + text + '|' + font + '|' + lead + '|' + track, (): Coverage | null => {
    const S = 64
    const lay = layoutText({ text, font, size: S, lead, track })
    const pad = 8
    const cw = Math.ceil(lay.W) + pad * 2
    const ch = Math.ceil(lay.H) + pad * 2
    let cv: HTMLCanvasElement
    try {
      if (!halftoneCv) halftoneCv = makeCanvas()
      cv = halftoneCv
    } catch {
      /* 无 DOM：网点模式退化成实心大字 */
      return null
    }
    cv.width = cw
    cv.height = ch
    const x = ctxOf(cv, { willReadFrequently: true })
    x.clearRect(0, 0, cw, ch)
    x.font = fontCSS(font, S)
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillStyle = '#fff'
    for (const g of lay)
      if (g.ch !== ' ' && g.ch !== '\u3000') x.fillText(g.ch, cw / 2 + g.x, ch / 2 + g.y)
    const d = x.getImageData(0, 0, cw, ch).data
    const a = new Uint8Array(cw * ch)
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]
    return { S, cw, ch, a }
  })

type HalftoneBigParams = {
  font: string
  mode: string
  ang: number
  shape: string
  speed: number
  crop: boolean
}

/* ================================================================== 34 stencil ステンシル */

type StencilParams = {
  font: string
  col: string
  drips: number
  marks: boolean
  dir: number
  tilt: number
}

export const pack: PackParts = {
  layout: {
    cube: {
      w: 0.8,
      tags: ['graphic', 'pop'],
      treat: 'safe',
      emph: 1.2,
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { cut: 1.6, blur: 1.2, pop: 1.1, slice: 0.4, wipe: 0.5, stretch: 0.5 },
      plan: (rng: Rng, cut, st: StylePack): CubeParams => {
        const n = cut.n
        let mode = n >= 4 && rng.chance(0.45) ? 'pair' : 'single'
        if (n >= 6 && cut.dur > 2.6 && rng.chance(0.35)) mode = 'turn'
        const k =
          mode === 'pair' ? 2 : mode === 'turn' ? Math.min(4, Math.max(2, Math.ceil(n / 5))) : 1
        return {
          mode,
          chunks: k > 1 ? chunksK(cut.text, k) : [flat(cut.text)],
          font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])),
          pitch: rng.range(20, 30),
          dir: rng.pick([1, -1]),
          face: rng.pick(['ink', 'accent', 'ink']),
          top: rng.pick(['accent', 'shade']),
          sway: rng.range(3, 7),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CubeParams
        const u = U(env)
        const lt = env.lt
        const chunks = P.chunks.length ? P.chunks : [flat(cut.text)]
        const mode = chunks.length < 2 ? 'single' : P.mode
        const ph = P.pitch * DEG
        const dir = P.dir || 1
        const h = Math.min(W * (mode === 'pair' ? 0.27 : 0.3), H * 0.285, u * 0.36)
        const cx = W / 2
        const cy = H / 2 + h * Math.sin(ph) * 0.55
        const pc = plateCol(
          sc,
          P.face === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.fg, sc.accent],
        )
        const tc = onCol(sc, pc)
        const topC =
          P.top === 'accent' && contrast(sc.accent, pc) > 1.3 ? sc.accent : shade(sc, pc, 0.22)
        const out = tout(env)
        const pop = E.outBack(clamp(lt / 0.4), 1.3) * (1 - 0.15 * E.inCubic(env.pOut))
        // 偏航角时间表
        let th: number
        const k = chunks.length
        const spinIn = 1 - E.outBack(clamp(lt / 0.8), 1.1)
        const hold = Math.sin(env.ltb * 0.7) * P.sway * DEG * env.fx.motion
        const away = E.inCubic(env.pOut) * 70 * DEG * dir
        const segT: number[] = []
        if (mode === 'turn') {
          const T = cut.dur / k
          for (let j = 0; j < k; j++) segT.push(j * T)
          let acc = 0
          for (let j = 1; j < k; j++) acc += E.inOutCubic(clamp((lt - segT[j] + 0.25) / 0.5))
          th = -(acc * Math.PI) / 2 - 20 * DEG - spinIn * 90 * DEG
          th *= dir
        } else if (mode === 'pair') {
          th = dir * (-45 * DEG) + spinIn * 100 * DEG * dir
        } else th = dir * (-24 * DEG) + spinIn * 100 * DEG * dir
        th += hold + away
        const hs = h * pop
        if (hs < 1 || out <= 0) return null
        const faces = cubeFaces(cx, cy, hs, th, ph)
        // 接触阴影：把（看不见的）底面往下推
        const bm = [...faces[4].m]
        bm[5] = cy + hs * Math.cos(ph) + hs * 0.14
        env.poly(
          polyPts(bm, [
            [-hs * 1.04, -hs * 1.04],
            [hs * 1.04, -hs * 1.04],
            [hs * 1.04, hs * 1.04],
            [-hs * 1.04, hs * 1.04],
          ]),
          darkOf(sc),
          0.35 * out,
          false,
        )
        const lw = Math.max(1.2, u * 0.0022)
        let bb: BBox | null = null
        const sq = (s: number): Pt[] => [
          [-s, -s],
          [s, -s],
          [s, s],
          [-s, s],
        ]
        // 哪一面承载哪一块
        const faceOf =
          mode === 'turn'
            ? (f: number): number => {
                const idx = dir > 0 ? f : (4 - f) % 4
                return idx < k ? idx : -1
              }
            : mode === 'pair'
              ? (f: number): number =>
                  dir > 0 ? (f === 0 ? 0 : f === 1 ? 1 : -1) : f === 3 ? 0 : f === 0 ? 1 : -1
              : (f: number): number => (f === 0 ? 0 : -1)
        for (const F of faces) {
          if (F.vis <= 0.004) continue
          const light = F.top ? 0.28 : (-0.55 * F.nx * dir + 0.55 * F.nz) * 0.35
          const col = F.top ? topC : shade(sc, pc, light)
          const pts = polyPts(F.m, sq(hs))
          env.poly(pts, col, out, gIn(env))
          outline(env, pts, mix(col, darkOf(sc), 0.35), lw, out)
          if (F.vis < 0.08) continue
          const lm = [...F.m]
          // 面内坐标以未缩放的 2h 为面尺寸：把弹跳缩放并进矩阵
          const s0 = hs / h
          lm[0] *= s0
          lm[1] *= s0
          lm[2] *= s0
          lm[3] *= s0
          if (F.top) {
            drawAffPlain(
              env,
              {
                text: 'No.' + lineNo(cut),
                font: monoF(env),
                size: h * 0.2,
                x: 0,
                y: 0,
                track: 0.2,
                color: onCol(sc, topC),
                alpha: out * 0.9,
                ghost: false,
              },
              lm,
            )
            continue
          }
          const ci = faceOf(F.f)
          if (ci >= 0 && chunks[ci]) {
            const t = brk(chunks[ci], mode === 'single' ? (isPort(env) ? 4 : 5) : 4)
            const size = Math.min(
              fitSize(t, P.font, h * 1.64, h * 1.5, { lead: 1.12, track: 0.02 }),
              h * 0.9,
            )
            const arrive = mode === 'turn' ? segT[ci] + (ci ? 0.05 : 0.12) : 0.18 + ci * 0.12
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: t,
                  font: P.font,
                  size,
                  x: 0,
                  y: 0,
                  lead: 1.12,
                  track: 0.02,
                  color: tc,
                  noHold: plateHold(cut),
                  mi: miAt(env, cut, arrive),
                },
                lm,
              ),
            )
          } else if (mode === 'single' && F.f === (dir > 0 ? 1 : 3)) {
            const t = brk(altCopy(cut), 6)
            const fs = Math.min(
              fitSize(t, bodyF(env), h * 1.5, h * 1.2, { lead: 1.4, track: 0.08 }),
              h * 0.2,
            )
            drawAffPlain(
              env,
              {
                text: t,
                font: bodyF(env),
                size: fs,
                x: 0,
                y: 0,
                lead: 1.4,
                track: 0.08,
                color: tc,
                alpha: 0.75 * out * tin(env, 0.3, 0.4),
                ghost: false,
              },
              lm,
            )
          } else if (mode === 'single' && F.f === (dir > 0 ? 3 : 1)) {
            drawAffPlain(
              env,
              {
                text: lineNo(cut),
                font: P.font,
                size: h * 1.1,
                x: 0,
                y: 0,
                fill: false,
                stroke: Math.max(1.5, h * 0.012),
                strokeColor: tc,
                alpha: 0.5 * out,
                ghost: false,
              },
              lm,
            )
          }
        }
        return bb || box(cx - hs * 1.4, cy - hs * 1.6, cx + hs * 1.4, cy + hs * 1.2)
      },
    },

    cylinder: {
      w: 0.9,
      tags: ['graphic', 'calm', 'emotional'],
      fits: (n) => n >= 2 && n <= 16,
      enterBias: { cut: 1.4, blur: 1.3, slice: 0.3, wipe: 0.4, stretch: 0.5 },
      plan: (rng: Rng, _cut, st: StylePack): CylinderParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fs: rng.pick(fontsOf(st, ['body', 'display'])),
        rings: rng.pick([2, 4, 4, 6]),
        band: rng.chance(0.45),
        dir: rng.pick([1, -1]),
        speed: rng.range(0.25, 0.45),
        tilt: rng.range(0.13, 0.2),
        sep: rng.pick([' ・ ', ' / ', ' — ']),
        glass: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CylinderParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const rowsT = n > (port ? 7 : 9) ? chunksK(t0, 2) : [t0]
        const R = Math.min(W * (port ? 0.38 : 0.3), H * 0.42)
        const cx = W / 2
        const ek = P.tilt
        const span = 2.1 // 歌词在正面最多可占据的弧度
        let size = H * 0.2
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * 1.04
          size = Math.min(size, (span * R) / Math.max(1, a))
        }
        size = Math.min(size, u * (rowsT.length > 1 ? 0.15 : 0.19))
        const rowGap = size * 1.45
        const nR = rowsT.length
        const out = tout(env)
        const dir = P.dir || 1
        const spin =
          -(1 - E.outCubic(clamp(lt / 0.8))) * 1.7 * dir +
          Math.sin(env.ltb * 0.8) * 0.05 * env.fx.motion +
          E.inCubic(env.pOut) * 1.9 * dir
        // 上下两侧的小字环
        const ss = Math.max(12, size * 0.3)
        const unit = [...(flat(cut.lineText || cut.text) + P.sep)]
        const nSec = P.rings
        const yMid = H / 2
        const ringY: { y: number; dir: number; k: number }[] = []
        const blockH = nR * rowGap
        for (let i = 0; i < nSec; i++) {
          const side = i % 2 ? 1 : -1
          const kk = Math.floor(i / 2)
          ringY.push({
            y: yMid + side * (blockH / 2 + ss * 0.9 + kk * ss * 1.6),
            dir: (i % 2 ? 1 : -1) * dir,
            k: kk,
          })
        }
        const yTop =
          Math.min(yMid - blockH / 2, ...ringY.map((q) => q.y - ss * 0.8)) - ek * R - size * 0.12
        const yBot =
          Math.max(yMid + blockH / 2, ...ringY.map((q) => q.y + ss * 0.8)) - ek * R + size * 0.12
        const ea = tin(env, 0, 0.6, E.outCubic) * out
        const ell = (y: number, a0: number, a1: number, N = 40): Pt[] => {
          const pts: Pt[] = []
          for (let i = 0; i <= N; i++) {
            const t = a0 + ((a1 - a0) * i) / N
            pts.push([cx + R * Math.sin(t), y + ek * R * Math.cos(t)])
          }
          return pts
        }
        // 玻璃筒身
        if (P.glass && ea > 0) {
          const lw = Math.max(1, u * 0.0016)
          env.line(ell(yTop, -Math.PI, Math.PI, 60), sc.sub, lw, 0.45 * ea, false)
          env.line(ell(yBot, -Math.PI / 2, Math.PI / 2), sc.sub, lw, 0.45 * ea, false)
          env.line(
            [
              [cx - R, yTop],
              [cx - R, lerp(yTop, yBot, ea)],
            ],
            sc.sub,
            lw,
            0.45 * ea,
            false,
          )
          env.line(
            [
              [cx + R, yTop],
              [cx + R, lerp(yTop, yBot, ea)],
            ],
            sc.sub,
            lw,
            0.45 * ea,
            false,
          )
        }
        // 歌词后面的裹带
        const bandC = plateCol(sc, [sc.accent, sc.ink])
        const onBand = P.band
        if (onBand && ea > 0) {
          const yb0 = yMid - blockH / 2 + size * 0.02 - ek * R
          const yb1 = yMid + blockH / 2 - size * 0.02 - ek * R
          const top = ell(yb0, -Math.PI / 2, Math.PI / 2, 36)
          const bot = ell(yb1, -Math.PI / 2, Math.PI / 2, 36).reverse()
          const pts = [...top, ...bot]
          if (env.pass === 'main') {
            const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0)
            g.addColorStop(0, shade(sc, bandC, -0.5))
            g.addColorStop(0.35, bandC)
            g.addColorStop(0.55, shade(sc, bandC, 0.12))
            g.addColorStop(1, shade(sc, bandC, -0.55))
            ctx.save()
            ctx.globalAlpha = ea
            ctx.beginPath()
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
            ctx.closePath()
            ctx.save()
            ctx.clip()
            ctx.fillStyle = g
            ctx.fillRect(cx - R - 2, yb0 - 4, R * 2 + 4, yb1 - yb0 + ek * R * 2 + 8)
            ctx.restore()
            ctx.restore()
          } else env.poly(pts, bandC, ea, gIn(env))
        }
        // 小字环：一圈一项，绕鼓面摆放（背面镜像并压暗）
        if (env.pass === 'main') {
          for (const rg of ringY) {
            const a = tin(env, 0.05 + rg.k * 0.08, 0.5, E.outCubic) * out
            if (a <= 0.01) continue
            const cnt = Math.min(72, Math.max(unit.length, Math.floor((TAU * R) / (ss * 1.05))))
            const chars: string[] = []
            for (let i = 0; i < cnt; i++) chars.push(unit[i % unit.length])
            const rot0 = env.ltb * P.speed * rg.dir + rg.k * 0.7 + spin * 0.5
            const it: TextItem = {
              text: chars.join(''),
              font: P.fs,
              size: ss,
              x: 0,
              y: 0,
              color: sc.sub,
              ghost: false,
              alpha: a,
            }
            it._lay = layoutText(it)
            it.charFn = (i, g) => {
              const t = rot0 + (i / cnt) * TAU
              const c = Math.cos(t)
              const s = Math.sin(t)
              const x = cx + R * s
              const y = rg.y - ek * R + ek * R * c
              if (Math.abs(c) < 0.06) return { hide: true }
              return {
                dx: x - g.x,
                dy: y - g.y,
                sx: c,
                rot: (Math.atan2(-ek * s, 1) / DEG) * 0.8,
                a: c > 0 ? 0.45 + 0.55 * c : 0.12 + 0.1 * -c,
              }
            }
            env.draw(it)
          }
        }
        // 鼓正面的歌词行
        let bb: BBox | null = null
        rowsT.forEach((row, ri) => {
          const y0 = yMid + (ri - (nR - 1) / 2) * rowGap
          const chars = [...row]
          const ads = chars.map((ch) => adv(P.font, ch) * size * 1.04)
          const tot = ads.reduce((a, b) => a + b, 0)
          let acc = -tot / 2
          chars.forEach((ch, i) => {
            const a0 = acc + ads[i] / 2
            acc += ads[i]
            if (ch === ' ') return
            const t =
              a0 / R +
              spin +
              (ri % 2 ? 0.08 : -0.08) * (nR > 1 ? 1 - E.outCubic(clamp(lt / 0.9)) : 0)
            const c = Math.cos(t)
            const s = Math.sin(t)
            if (c < 0.03) return
            const x = cx + R * s
            const y = y0 - ek * R + ek * R * c
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: ch,
                  font: P.font,
                  size,
                  x: 0,
                  y: 0,
                  color: onBand ? onCol(sc, bandC) : sc.fg,
                  alpha: 0.35 + 0.65 * Math.pow(c, 0.6),
                  mi: ri * 4 + i * 0.6,
                  noHold: true,
                },
                [c, -ek * s, 0, 1, x, y],
              ),
            )
          })
        })
        return bb || box(cx - R, yMid - blockH / 2, cx + R, yMid + blockH / 2)
      },
    },

    flipCards: {
      w: 0.8,
      tags: ['pop', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 14,
      enterBias: {
        cut: 3,
        pop: 0.8,
        blur: 0.5,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.3,
        assemble: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): FlipCardsParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        order: rng.pick(['ltr', 'ltr', 'random']),
        table: rng.chance(0.55),
        back: rng.pick(['accent', 'ink']),
        peek: rng.chance(0.6),
        idx: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as FlipCardsParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const rowsC = rowsOf(cut.text, port ? 4 : 7)
        const cards: { ch: string; r: number; j: number; cnt: number }[] = []
        rowsC.forEach((row, r0) =>
          row.forEach((ch, j) => {
            if (ch !== ' ') cards.push({ ch, r: r0, j, cnt: row.length })
          }),
        )
        const n = cards.length
        if (!n) return null
        const rowsL = rowsC.length
        const per = Math.max(...rowsC.map((row) => row.length))
        const extra = P.table ? 1 : 0
        const rows = rowsL + extra * 2
        const asp = 1.38
        const gap = 0.16
        const k = Math.min(
          (W * 0.86) / (per + (per - 1) * gap),
          (H * (P.table ? 0.86 : 0.7)) / (rows * asp + (rows - 1) * gap),
          u * 0.26,
        )
        const cw = k
        const chh = k * asp
        const sx = k * (1 + gap)
        const sy = chh + k * gap
        const faceC = lightOf(sc)
        const faceT = darkOf(sc)
        const backC =
          [
            ...(P.back === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent]),
            sc.accent2,
            sc.sub,
            darkOf(sc),
          ].find((c) => c && contrast(c, faceC) >= 1.6 && contrast(c, sc.bg) >= 1.25) ||
          mix(faceC, darkOf(sc), 0.6)
        const backL = mix(backC, onCol(sc, backC), 0.35)
        const fd = clamp(cut.dur * 0.12, 0.22, 0.36)
        const gapT = clamp((cut.dur * 0.34) / n, 0.04, 0.12)
        const rank = cards.map((_c, i) => i)
        if (P.order === 'random') rank.sort((a, b) => r(s, a, 31) - r(s, b, 31))
        const ord = new Array<number>(n)
        rank.forEach((gi, q) => {
          ord[gi] = q
        })
        const lw = Math.max(1, k * 0.012)
        const rad = k * 0.08
        /** p：0 扣着 … 1 翻过来；卡片绕自身竖轴转 */
        const drawCard = (
          x: number,
          y: number,
          p: number,
          _ch: string | null,
          _isFace: boolean,
          _key: number,
          alpha: number,
          lift: number,
        ) => {
          const ang = p * Math.PI
          const c = Math.cos(ang)
          const sn = Math.sin(ang)
          const w = cw * Math.max(0.02, Math.abs(c))
          const sc2 = 1 + 0.1 * sn * lift
          const hL = chh * sc2 * (1 + 0.1 * sn * (c > 0 ? 1 : -1))
          const hR = chh * sc2 * (1 - 0.1 * sn * (c > 0 ? 1 : -1))
          const ws = w * sc2
          const pts: Pt[] = [
            [x - ws / 2, y - hL / 2],
            [x + ws / 2, y - hR / 2],
            [x + ws / 2, y + hR / 2],
            [x - ws / 2, y + hL / 2],
          ]
          const up = p >= 0.5
          env.poly(
            pts.map(
              ([a, b]) => [a + k * 0.05 * (1 + sn * 1.5), b + k * 0.07 * (1 + sn * 1.5)] as Pt,
            ),
            darkOf(sc),
            0.25 * alpha,
            false,
          )
          if (up) {
            env.poly(pts, faceC, alpha, gIn(env))
            outline(env, pts, mix(faceC, faceT, 0.25), lw, alpha)
          } else {
            env.poly(pts, backC, alpha, gIn(env))
            const ins = k * 0.09
            const iw = Math.max(0, ws - ins * 2 * Math.abs(c))
            if (iw > 2) {
              const ih = chh * sc2 - ins * 2
              env.rrect(x - iw / 2, y - ih / 2, iw, ih, rad * 0.6, null, alpha, false, backL, lw)
              const d = Math.min(iw, ih) * 0.28
              env.poly(
                [
                  [x, y - d * 1.2],
                  [x + d * Math.abs(c) * 0.9, y],
                  [x, y + d * 1.2],
                  [x - d * Math.abs(c) * 0.9, y],
                ],
                backL,
                alpha,
                false,
              )
            }
          }
          return { up, c, sc2, hs: (hL + hR) / 2 / chh }
        }
        let bb: BBox | null = null
        // 陪衬桌面的排（扣着的牌）
        if (P.table) {
          const ta = tin(env, 0, 0.4, E.outCubic) * (1 - E.inCubic(clamp((env.pOut - 0.4) / 0.6)))
          for (const rr0 of [-1, rowsL]) {
            for (let j = 0; j < per; j++) {
              const x = W / 2 + (j - (per - 1) / 2) * sx
              const y = H / 2 + (rr0 - (rowsL - 1) / 2) * sy
              let p = 0
              let ch: string | null = null
              if (P.peek) {
                // 偶尔有一张掀开一下：翻起、露出一个随机字形、再扣回去
                const T = 1.3
                const kk = Math.floor(env.ltb / T)
                const f = env.ltb / T - kk
                if (kk >= 1 && hash(s, kk, 5) % (per * 2) === j + (rr0 < 0 ? 0 : per)) {
                  p =
                    f < 0.25
                      ? E.inOutCubic(f / 0.25)
                      : f < 0.6
                        ? 1
                        : 1 - E.inOutCubic((f - 0.6) / 0.25)
                  ch = hash(s, kk, 6) % 2 ? '？' : '★'
                }
              }
              const dc = drawCard(x, y, p, ch, false, 0, ta * 0.8, 1)
              if (dc.up && ch)
                env.draw({
                  text: ch,
                  font: P.font,
                  size: k * 0.46,
                  x,
                  y,
                  sx: Math.abs(dc.c) * dc.sc2,
                  sy: dc.sc2,
                  color: sc.accent === faceC ? faceT : sc.accent,
                  alpha: ta * 0.8,
                  ghost: false,
                })
            }
          }
        }
        cards.forEach((cd, i) => {
          const ch = cd.ch
          const x = W / 2 + (cd.j - (cd.cnt - 1) / 2) * sx
          const y = H / 2 + (cd.r - (rowsL - 1) / 2) * sy
          const ti = 0.12 + ord[i] * gapT
          let p = E.inOutCubic(clamp((lt - ti) / fd))
          const po = clamp(env.pOut * 1.5 - (ord[i] / Math.max(1, n)) * 0.5)
          if (po > 0) p = Math.min(p, 1 - E.inOutCubic(po))
          const appear =
            tin(env, ord[i] * 0.02, 0.25, E.outCubic) *
            (1 - E.inCubic(clamp((env.pOut - 0.55) / 0.45)))
          const dc = drawCard(x, y, p, ch, true, i, appear, 1)
          if (!dc.up) return
          const m = [Math.abs(dc.c) * dc.sc2, 0, 0, dc.sc2 * dc.hs, x, y]
          if (P.idx && Math.abs(dc.c) > 0.3) {
            const is = k * 0.15
            drawAffPlain(
              env,
              {
                text: ch,
                font: P.font,
                size: is,
                x: -cw * 0.34,
                y: -chh * 0.36,
                color: sc.accent,
                ghost: false,
              },
              m,
            )
            drawAffPlain(
              env,
              {
                text: ch,
                font: P.font,
                size: is,
                x: cw * 0.34,
                y: chh * 0.36,
                rot: 180,
                color: sc.accent,
                ghost: false,
              },
              m,
            )
          }
          bb = unionBB(
            bb,
            drawAff(
              env,
              {
                text: ch,
                font: P.font,
                size: k * 0.6,
                x: 0,
                y: 0,
                color: faceT,
                noHold: plateHold(cut),
                mi: miAt(env, cut, ti + fd * 0.5),
              },
              m,
            ),
          )
        })
        const bw = per * sx
        const bh = rowsL * sy
        return bb || box(W / 2 - bw / 2, H / 2 - bh / 2, W / 2 + bw / 2, H / 2 + bh / 2)
      },
    },

    accordion: {
      w: 0.8,
      tags: ['pop', 'graphic', 'editorial'],
      treat: 'safe',
      fits: (n) => n >= 2 && n <= 16,
      enterBias: { cut: 2, blur: 1, pop: 0.8, slice: 0.3, wipe: 0.4 },
      plan: (rng: Rng, cut, st: StylePack): AccordionParams => {
        const port = cut.H > cut.W * 1.08
        return {
          font: rng.pick(fontsOf(st, ['display', 'serif'])),
          fold: rng.range(26, 38),
          orient: port && cut.n <= 10 && rng.chance(0.7) ? 'v' : 'h',
          covers: rng.chance(0.7),
          plate: rng.pick(['ink', 'fg', 'accent']),
          breathe: rng.range(3, 7),
          start: rng.pick([1, -1]),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as AccordionParams
        const u = U(env)
        const lt = env.lt
        const n = glyphCount(cut.text)
        if (!n) return null
        const port = isPort(env)
        const vert = P.orient === 'v' && port && n <= 10
        const out = tout(env)
        const open = E.outBack(clamp((lt - 0.02) / 0.7), 1.25)
        const mot = env.fx.motion
        let alpha =
          P.fold +
          (1 - open) * (86 - P.fold) +
          Math.sin(env.ltb * 2.1) * P.breathe * mot * clamp(lt / 0.8) +
          E.inCubic(env.pOut) * (88 - P.fold)
        alpha = clamp(alpha, 2, 88.5) * DEG
        const ca = Math.cos(alpha)
        const sa = Math.sin(alpha)
        const rowsA = rowsOf(cut.text, vert ? 10 : port ? 5 : 9)
        const rows = rowsA.length
        const per = Math.max(...rowsA.map((row) => row.length))
        const cA = Math.cos(P.fold * DEG)
        // 展开后的面板尺寸由静止角推回
        const Pw = Math.min(
          (vert ? H * 0.82 : W * 0.86) / (per * cA + 0.5),
          (vert ? W * 0.5 : (H * 0.62) / rows) / 1.25,
          u * 0.3,
        )
        const Ph = Pw * 1.2
        const pc = plateCol(
          sc,
          P.plate === 'accent'
            ? [sc.accent, sc.ink]
            : P.plate === 'fg'
              ? [sc.fg, sc.ink]
              : [sc.ink, sc.fg],
        )
        const tc = onCol(sc, pc)
        const lit = shade(sc, pc, 0.1)
        const dim = shade(sc, pc, -0.32)
        const covC =
          plateCol(sc, [sc.accent, sc.ink, sc.fg]) === pc
            ? shade(sc, pc, -0.45)
            : plateCol(sc, [sc.accent, sc.ink, sc.fg])
        const kap = 0.13
        let bb: BBox | null = null
        const lw = Math.max(1, u * 0.0016)
        let gi = 0
        for (let r0 = 0; r0 < rows; r0++) {
          const row = rowsA[r0]
          const cnt = row.length
          const cy = (vert ? W : H) / 2 + (r0 - (rows - 1) / 2) * Ph * 1.3
          const c0 = (vert ? H : W) / 2 - (cnt * Pw * ca) / 2
          const edgeH = (j: number): number =>
            Ph * (1 + kap * sa * ((j + (P.start > 0 ? 0 : 1)) % 2 ? -1 : 1))
          // (沿缝向, 横向) → 屏幕
          const P2 = (a: number, b: number): Pt => (vert ? [b, a] : [a, b])
          // 整条下面的投影
          const sh: Pt[] = []
          for (let j = 0; j <= cnt; j++)
            sh.push(P2(c0 + j * Pw * ca + Ph * 0.06, cy + edgeH(j) / 2 + Ph * 0.07))
          for (let j = cnt; j >= 0; j--)
            sh.push(P2(c0 + j * Pw * ca + Ph * 0.06, cy + edgeH(j) / 2 + Ph * 0.02))
          env.poly(sh, darkOf(sc), 0.3 * out, false)
          for (let j = 0; j < cnt; j++) {
            const a0 = c0 + j * Pw * ca
            const a1 = a0 + Pw * ca
            const h0 = edgeH(j)
            const h1 = edgeH(j + 1)
            const q = clamp((lt - j * 0.03) / 0.2) * out
            if (q <= 0) continue
            const facing = h1 > h0 ? 1 : -1 // 这一折朝光还是背光
            const col = facing > 0 ? dim : lit
            env.poly(
              [P2(a0, cy - h0 / 2), P2(a1, cy - h1 / 2), P2(a1, cy + h1 / 2), P2(a0, cy + h0 / 2)],
              col,
              q,
              gIn(env),
            )
            env.line(
              [P2(a0, cy - h0 / 2), P2(a0, cy + h0 / 2)],
              mix(col, darkOf(sc), 0.4),
              lw,
              q,
              false,
            )
            const ch = row[j]
            if (ch === ' ') continue
            const mid = P2((a0 + a1) / 2, cy)
            const hs = (h0 + h1) / 2 / Ph
            const m = vert ? [hs, 0, 0, ca, mid[0], mid[1]] : [ca, 0, 0, hs, mid[0], mid[1]]
            const size = Math.min(Pw * 0.66, Ph * 0.62)
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: ch,
                  font: P.font,
                  size,
                  x: 0,
                  y: 0,
                  color: tc,
                  noHold: plateHold(cut),
                  mi: miAt(env, cut, 0.12 + gi++ * 0.035),
                },
                m,
              ),
            )
          }
          if (P.covers) {
            const cq = tin(env, 0, 0.3, E.outCubic) * out
            const cw2 = Ph * 0.09
            const chh = Ph * 1.16
            for (const [a, hh] of [
              [c0 - cw2, edgeH(0)],
              [c0 + cnt * Pw * ca, edgeH(cnt)],
            ] as [number, number][]) {
              env.poly(
                [
                  P2(a, cy - (chh / 2) * (hh / Ph)),
                  P2(a + cw2, cy - (chh / 2) * (hh / Ph)),
                  P2(a + cw2, cy + (chh / 2) * (hh / Ph)),
                  P2(a, cy + (chh / 2) * (hh / Ph)),
                ],
                covC,
                cq,
                gIn(env),
              )
            }
          }
        }
        return bb
      },
    },

    flag: {
      w: 0.8,
      tags: ['emotional', 'pop', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { cut: 1.6, blur: 1.2, pop: 0.6, slice: 0.3, wipe: 0.6 },
      plan: (rng: Rng, _cut, st: StylePack): FlagParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        mode: rng.pick(['unfurl', 'unfurl', 'raise']),
        cloth: rng.pick(['accent', 'ink', 'accent']),
        trim: rng.pick(['none', 'bands', 'edge']),
        tail: rng.pick(['rect', 'rect', 'swallow']),
        wind: rng.range(0.7, 1.15),
        side: rng.pick([1, 1, -1]),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as FlagParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const side = P.side || 1
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const text = brk(t0, port ? 5 : n <= 5 ? 5 : Math.max(4, Math.ceil(n / 2)))
        const Wf = W * (port ? 0.78 : 0.62)
        const Hf = Math.min(H * (port ? 0.34 : 0.52), Wf * 0.64)
        const poleX = side > 0 ? W / 2 - Wf / 2 - W * 0.03 : W / 2 + Wf / 2 + W * 0.03
        const out = tout(env)
        const mot = env.fx.motion
        const unf = P.mode === 'unfurl' ? E.outCubic(clamp((lt - 0.05) / 0.75)) : 1
        const raise = P.mode === 'raise' ? E.outCubic(clamp(lt / 0.8)) : 1
        const lower = P.mode === 'raise' ? E.inCubic(env.pOut) : 0
        const furl = P.mode === 'unfurl' ? E.inCubic(env.pOut) : 0
        const y0 = H / 2 - Hf / 2 - H * 0.03 + (1 - raise) * H * 0.55 + lower * H * 0.6
        const ext = Math.max(0.001, unf * (1 - furl))
        const A = Hf * 0.1 * P.wind * (0.5 + 0.7 * mot) * (1 + (1 - unf) * 1.2)
        const D = Wf * 1.3
        const wf = 2.1
        const om = 3.2 * P.wind
        const tb = env.ltb
        const zf = (x: number): number =>
          A * Math.pow(x, 0.85) * Math.sin(TAU * wf * x * 0.5 - om * tb) +
          A * 0.35 * x * Math.sin(TAU * 1.3 * x - om * 0.7 * tb + 1.3)
        const N = 30
        const col = plateCol(sc, P.cloth === 'ink' ? [sc.ink, sc.accent] : [sc.accent, sc.ink])
        const tc = onCol(sc, col)
        const trimC =
          contrast(sc.fg, col) > 1.5 ? (col === sc.accent ? onCol(sc, col) : sc.accent) : sc.accent
        // 采样布面
        const S: { u: number; x: number; top: number; bot: number; sl: number; hs: number }[] = []
        let xAcc = 0
        for (let i = 0; i <= N; i++) {
          const uu = (i / N) * ext
          const z = zf(uu)
          const dz = (zf(uu + 0.01) - zf(uu - 0.01)) / 0.02 / Wf
          if (i > 0) xAcc += (Wf * ext) / N / Math.sqrt(1 + dz * dz)
          const hs = 1 + z / D
          const droop = uu * uu * Hf * 0.05 - z * 0.12
          const x = poleX + side * xAcc
          S.push({
            u: uu,
            x,
            top: y0 + droop - ((hs - 1) * Hf) / 2,
            bot: y0 + droop + Hf * hs - ((hs - 1) * Hf) / 2,
            sl: dz,
            hs,
          })
        }
        // 旗杆
        const pa =
          tin(env, 0, 0.3, E.outCubic) *
          (P.mode === 'raise' ? 1 - E.inCubic(clamp((env.pOut - 0.5) / 0.5)) : out)
        const pw = Math.max(3, u * 0.011)
        const ptop = H / 2 - Hf / 2 - H * 0.03 - Hf * 0.3
        env.rect(poleX - pw / 2, ptop, pw, H * 1.2, sc.sub, pa, false)
        env.circle(poleX, ptop, pw * 1.5, sc.accent, null, 0, pa, false)
        if (unf * out <= 0.001 || y0 > H * 1.2) return null
        // 布：一个轮廓（燕尾就挖个口）+ 裁进轮廓里的镶边与折光
        const sw = P.tail === 'swallow'
        const at0 = (uu: number) => {
          const f = clamp(uu / ext) * N
          const i = Math.min(N - 1, Math.floor(f))
          const t = f - i
          const a = S[i]
          const b = S[i + 1]
          return { x: lerp(a.x, b.x, t), top: lerp(a.top, b.top, t), bot: lerp(a.bot, b.bot, t) }
        }
        const sil: Pt[] = S.map((q) => [q.x, q.top])
        if (sw) {
          const q = at0(ext * 0.86)
          sil.push([q.x, (q.top + q.bot) / 2])
        }
        for (let i = N; i >= 0; i--) sil.push([S[i].x, S[i].bot])
        env.poly(sil, col, out, false)
        if (env.pass === 'main') {
          ctx.save()
          ctx.beginPath()
          sil.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
          ctx.closePath()
          ctx.clip()
          const band = (v0: number, v1: number, c: string, a: number) => {
            const pts: Pt[] = S.map((q) => [q.x, lerp(q.top, q.bot, v0)])
            for (let i = N; i >= 0; i--) pts.push([S[i].x, lerp(S[i].top, S[i].bot, v1)])
            env.poly(pts, c, a, false)
          }
          if (P.trim === 'bands') {
            band(0.08, 0.15, trimC, out)
            band(0.85, 0.92, trimC, out)
          }
          if (P.trim === 'edge') {
            const a = S[0]
            const b = S[Math.min(N, 3)]
            env.poly(
              [
                [a.x - side * 2, a.top - 4],
                [b.x, b.top - 4],
                [b.x, b.bot + 4],
                [a.x - side * 2, a.bot + 4],
              ],
              trimC,
              out,
              false,
            )
          }
          for (let i = 0; i < N; i++) {
            const a = S[i]
            const b = S[i + 1]
            const v = clamp((-(a.sl + b.sl) / 2) * side * 0.9, -0.4, 0.2)
            if (Math.abs(v) < 0.02) continue
            env.poly(
              [
                [a.x, a.top - 4],
                [b.x, b.top - 4],
                [b.x, b.bot + 4],
                [a.x, a.bot + 4],
              ],
              v < 0 ? darkOf(sc) : lightOf(sc),
              Math.abs(v) * 0.8 * out,
              false,
            )
          }
          ctx.restore()
        }
        // 绳索环
        env.circle(
          poleX + side * pw * 0.2,
          S[0].top + Hf * 0.04,
          pw * 0.9,
          null,
          sc.sub,
          Math.max(1, pw * 0.3),
          out,
          false,
        )
        env.circle(
          poleX + side * pw * 0.2,
          S[0].bot - Hf * 0.04,
          pw * 0.9,
          null,
          sc.sub,
          Math.max(1, pw * 0.3),
          out,
          false,
        )
        // 印在布上的歌词：字形中心在旗面局部 (u, v)
        const o = { track: 0.04, lead: 1.15 }
        const size = Math.min(
          fitSize(
            text,
            P.font,
            Wf * (P.tail === 'swallow' ? 0.66 : 0.78),
            Hf * (P.trim === 'bands' ? 0.58 : 0.68),
            o,
          ),
          Hf * 0.42,
        )
        const lay = layoutText({ text, font: P.font, size, track: o.track, lead: o.lead })
        const uC = (P.tail === 'swallow' ? 0.46 : 0.52) + (P.trim === 'edge' ? 0.03 : 0)
        let bb: BBox | null = null
        const at = (uu: number) => {
          const f = clamp(uu / ext) * N
          const i = Math.min(N - 1, Math.floor(f))
          const t = f - i
          const a = S[i]
          const b = S[i + 1]
          return {
            x: lerp(a.x, b.x, t),
            top: lerp(a.top, b.top, t),
            bot: lerp(a.bot, b.bot, t),
            sl: lerp(a.sl, b.sl, t),
            hs: lerp(a.hs, b.hs, t),
          }
        }
        for (const g of lay) {
          if (g.ch === ' ' || g.ch === '\u3000') continue
          const uu = uC + (side * g.x) / Wf
          if (uu > ext) continue
          const q = at(uu)
          const v = 0.5 + g.y / Hf
          const y = lerp(q.top, q.bot, v)
          const cs = 1 / Math.sqrt(1 + q.sl * q.sl)
          const slope =
            (at(uu + 0.01).top + at(uu + 0.01).bot - (at(uu - 0.01).top + at(uu - 0.01).bot)) /
            2 /
            (Math.abs(at(uu + 0.01).x - at(uu - 0.01).x) + 1e-3)
          bb = unionBB(
            bb,
            drawAff(
              env,
              {
                text: g.ch,
                font: P.font,
                size,
                x: 0,
                y: 0,
                color: tc,
                noHold: plateHold(cut),
                mi: miAt(env, cut, 0.1 + uu * 0.6),
              },
              [cs, slope * cs * side, 0, q.hs, q.x, y],
            ),
          )
        }
        return bb || box(Math.min(S[0].x, S[N].x), S[0].top, Math.max(S[0].x, S[N].x), S[0].bot)
      },
    },

    ribbon: {
      w: 0.9,
      tags: ['pop', 'emotional', 'graphic'],
      treat: 'safe',
      portrait: 0.7,
      fits: (n) => n >= 2 && n <= 16,
      enterBias: { cut: 1.8, blur: 1.2, pop: 0.8, slice: 0.3, stretch: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): RibbonParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        amp: rng.range(0.05, 0.1),
        freq: rng.range(0.55, 0.9),
        ph: rng.range(0, 6),
        col: rng.pick(['accent', 'accent', 'ink']),
        reveal: rng.pick(['center', 'left']),
        tilt: rng.range(-6, 6),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as RibbonParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const rowsT = n > (port ? 6 : 10) ? chunksK(t0, n > 12 && port ? 3 : 2) : [t0]
        const nR = rowsT.length
        const pc = plateCol(sc, P.col === 'ink' ? [sc.ink, sc.accent] : [sc.accent, sc.ink])
        const back = shade(sc, pc, -0.42)
        const tc = onCol(sc, pc)
        const mot = env.fx.motion
        let bb: BBox | null = null
        const x0 = W * 0.09
        const x1 = W * 0.91
        const L = x1 - x0
        // 多行共用一个字号
        let size = u * 0.16
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * 1.05
          size = Math.min(size, (L * 0.58) / Math.max(1, a))
        }
        size = Math.min(size, (H * 0.62) / (nR * 2.3))
        const bw = size * 0.72
        rowsT.forEach((row, ri) => {
          const cy = H / 2 + (ri - (nR - 1) / 2) * size * 2.35
          const A = H * P.amp * (nR > 1 ? 0.55 : 1) * (1 + 0.12 * Math.sin(env.ltb * 1.1 + ri))
          const ph = P.ph + ri * 2.1 + env.ltb * 0.9 * mot * 0.6
          const tl = Math.tan(P.tilt * DEG) * (ri % 2 ? -1 : 1)
          const path = (x: number): Pt => [
            x,
            cy + A * Math.sin(TAU * P.freq * ((x - x0) / L) + ph) + (x - W / 2) * tl,
          ]
          // 弧长表
          const NS = 90
          const pts: Pt[] = []
          const acc: number[] = [0]
          for (let i = 0; i <= NS; i++) pts.push(path(x0 + (L * i) / NS))
          for (let i = 1; i <= NS; i++)
            acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
          const TL = acc[NS]
          const atS = (s0: number) => {
            const s = clamp(s0, 0, TL)
            let lo = 0
            let hi = NS
            while (hi - lo > 1) {
              const m = (lo + hi) >> 1
              if (acc[m] <= s) lo = m
              else hi = m
            }
            const f = (s - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo])
            const p: Pt = [lerp(pts[lo][0], pts[hi][0], f), lerp(pts[lo][1], pts[hi][1], f)]
            const ang = Math.atan2(pts[hi][1] - pts[lo][1], pts[hi][0] - pts[lo][0])
            return { p, ang }
          }
          // 扭转：中段平铺，两端折起露出背面
          const tau = (f: number): number => {
            const d = Math.abs(f - 0.5)
            return d < 0.33 ? 1 : Math.cos((Math.PI * (d - 0.33)) / 0.17)
          }
          const e = E.inOutCubic(clamp((lt - ri * 0.12) / 0.75)) * (1 - E.inCubic(env.pOut))
          const vis = (f: number): boolean =>
            P.reveal === 'left' ? f <= e : Math.abs(f - 0.5) <= e / 2
          // 投影 + 缎带本体
          const NB = 64
          const seg: { f: number; t: number; a: Pt; b: Pt; p: Pt; ang: number }[] = []
          for (let i = 0; i <= NB; i++) {
            const f = i / NB
            const q = atS(f * TL)
            const t = tau(f)
            const nx = -Math.sin(q.ang)
            const ny = Math.cos(q.ang)
            seg.push({
              f,
              t,
              a: [q.p[0] + nx * bw * t, q.p[1] + ny * bw * t],
              b: [q.p[0] - nx * bw * t, q.p[1] - ny * bw * t],
              p: q.p,
              ang: q.ang,
            })
          }
          const sh = size * 0.1
          const vs = seg.filter((q) => vis(q.f))
          if (vs.length > 1)
            env.poly(
              [
                ...vs.map((q) => [q.a[0] + sh, q.a[1] + sh * 1.4] as Pt),
                ...vs
                  .slice()
                  .reverse()
                  .map((q) => [q.b[0] + sh, q.b[1] + sh * 1.4] as Pt),
              ],
              darkOf(sc),
              0.22,
              false,
            )
          // 同向的连续段并成一个多边形，扭转明暗再叠上去
          let run: typeof seg = []
          const flush = () => {
            if (run.length > 1) {
              const t = run[Math.floor(run.length / 2)].t
              env.poly(
                [
                  ...run.map((q) => q.a),
                  ...run
                    .slice()
                    .reverse()
                    .map((q) => q.b),
                ],
                t >= 0 ? pc : back,
                1,
                gIn(env) && t >= 0,
              )
              if (t >= 0)
                env.line(
                  run.filter((q) => q.t > 0.6).map((q) => q.a),
                  shade(sc, pc, 0.3),
                  Math.max(1, size * 0.02),
                  0.8,
                  false,
                )
            }
            run = []
          }
          for (let i = 0; i <= NB; i++) {
            const q = seg[i]
            if (!vis(q.f)) {
              flush()
              continue
            }
            if (run.length && Math.sign(run[run.length - 1].t || 1) !== Math.sign(q.t || 1)) {
              const last = run[run.length - 1]
              flush()
              run.push(last)
            }
            run.push(q)
          }
          flush()
          for (let i = 0; i < NB; i++) {
            const A0 = seg[i]
            const B0 = seg[i + 1]
            if (!vis(A0.f) || !vis(B0.f)) continue
            const t = (A0.t + B0.t) / 2
            if (Math.abs(t) > 0.97) continue
            env.poly([A0.a, B0.a, B0.b, A0.b], darkOf(sc), (1 - Math.abs(t)) * 0.4, false)
          }
          // 剪了缺口的尾端
          for (const end of [0, NB]) {
            const S0 = seg[end]
            if (!vis(S0.f)) continue
            const dirn = end === 0 ? 1 : -1
            const ext: Pt = [
              -Math.cos(S0.ang) * bw * 1.3 * dirn,
              -Math.sin(S0.ang) * bw * 1.3 * dirn,
            ]
            const c = shade(sc, back, -0.12)
            env.poly(
              [
                S0.a,
                [S0.a[0] + ext[0], S0.a[1] + ext[1]],
                [S0.p[0] + ext[0] * 0.45, S0.p[1] + ext[1] * 0.45],
                [S0.b[0] + ext[0], S0.b[1] + ext[1]],
                S0.b,
              ],
              c,
              1,
              false,
            )
          }
          // 平铺中段上的歌词
          const chars = [...row]
          const ads = chars.map((ch) => adv(P.font, ch) * size * 1.05)
          const tot = ads.reduce((a, b) => a + b, 0)
          let s0 = TL / 2 - tot / 2
          chars.forEach((ch, i) => {
            const sc0 = s0 + ads[i] / 2
            s0 += ads[i]
            if (ch === ' ') return
            const f = sc0 / TL
            if (!vis(f)) return
            const q = atS(sc0)
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: ch,
                font: P.font,
                size,
                x: q.p[0],
                y: q.p[1],
                rot: q.ang / DEG,
                sy: tau(f),
                color: tc,
                noHold: plateHold(cut),
                mi: miAt(
                  env,
                  cut,
                  ri * 0.12 + (P.reveal === 'left' ? f : Math.abs(f - 0.5) * 2) * 0.6,
                ),
              }),
            )
          })
        })
        return bb
      },
    },
    pendulum: {
      w: 0.8,
      tags: ['calm', 'pop', 'emotional'],
      treat: 'safe',
      portrait: 1.2,
      fits: (n) => n >= 1 && n <= 16,
      enterBias: {
        cut: 2,
        drop: 1.4,
        pop: 1.2,
        blur: 0.8,
        slice: 0.2,
        wipe: 0.3,
        stretch: 0.3,
      },
      plan: (rng: Rng, cut, st: StylePack): PendulumParams => {
        const n = cut.n
        const port = cut.H > cut.W * 1.08
        const spaced = /\s/.test(String(cut.text).trim())
        const opts: string[] = []
        if (n <= (port ? 5 : 8) && !spaced) opts.push('cradle', 'cradle')
        if (n <= 12 && !spaced) opts.push('fan', port ? 'fan' : 'chunks')
        if (n >= 4) opts.push('chunks')
        const mode = rng.pick(opts.length ? opts : ['chunks'])
        return {
          mode,
          chunks: chunksK(cut.text, clamp(Math.ceil(n / 4), 2, 4)),
          font: rng.pick(fontsOf(st, ['display', 'serif'])),
          period: rng.range(1.05, 1.4),
          amp: rng.range(22, 30),
          phase: rng.range(0, 6),
          side: rng.pick([1, -1]),
        }
      },
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as PendulumParams
        const u = U(env)
        const lt = env.lt
        const chs = slotsOf(cut.text).filter((c) => c !== ' ')
        const n = chs.length
        if (!n) return null
        const out = tout(env)
        const mot = env.fx.motion
        const port = isPort(env)
        let mode = P.mode
        if (mode === 'cradle' && n > (port ? 6 : 9)) mode = 'fan'
        if (mode === 'fan' && n > 13) mode = 'chunks'
        const lw = Math.max(1, u * 0.0015)
        const pc = plateCol(sc, [sc.ink, sc.fg])
        const tc = onCol(sc, pc)
        const fa = tin(env, 0, 0.45, E.outCubic) * out
        let bb: BBox | null = null
        if (mode === 'cradle') {
          // 牛顿摆：只有两端的小球在摆
          const rad = Math.min((W * 0.84) / (n * 2.02 + 1.2), H * 0.13, u * 0.12)
          const L = Math.min(H * 0.42, rad * 5.2)
          const cx = W / 2
          const x0 = cx - (n - 1) * rad
          const py = H / 2 - L * 0.62
          const by = py + L
          const fw = (n - 1) * rad + rad * 2.6
          const fb = by + rad + H * 0.06
          const fc = sc.sub
          env.line(
            [
              [cx - fw, fb],
              [cx - fw, py],
              [cx + fw, py],
              [cx + fw, fb],
            ],
            fc,
            Math.max(2, u * 0.006),
            fa,
            false,
          )
          env.rrect(
            cx - fw - rad * 0.7,
            fb,
            fw * 2 + rad * 1.4,
            rad * 0.28,
            rad * 0.1,
            fc,
            fa,
            false,
          )
          const T = P.period
          const om = TAU / T
          const A = P.amp * DEG * (0.6 + 0.5 * mot)
          const t0 = 0.75
          const tau = env.ltb - t0
          const sAng = tau > 0 ? -Math.cos(om * tau) : -1
          const lift = tau > 0 ? 1 : E.inOutCubic(clamp((lt - 0.25) / 0.45))
          const decay = 1 - 0.25 * clamp(tau / 6)
          chs.forEach((ch, i) => {
            const px = x0 + i * rad * 2
            let th = 0
            if (i === 0) th = A * decay * Math.min(0, sAng) * (tau > 0 ? 1 : lift)
            if (i === n - 1 && n > 1) th = A * decay * Math.max(0, sAng)
            if (n === 1) th = A * decay * sAng * lift
            const drop = E.outBack(clamp((lt - i * 0.05) / 0.35), 1.4)
            const Lc = L * drop
            const bx = px + Math.sin(th) * Lc
            const byy = py + Math.cos(th) * Lc
            if (drop <= 0) return
            const d = rad * 0.85
            env.line(
              [
                [px - d, py],
                [bx, byy],
              ],
              sc.sub,
              lw,
              0.9 * out,
              false,
            )
            env.line(
              [
                [px + d, py],
                [bx, byy],
              ],
              sc.sub,
              lw,
              0.9 * out,
              false,
            )
            env.circle(bx, byy, rad * 0.985, pc, null, 0, out, gIn(env))
            env.circle(
              bx - rad * 0.35,
              byy - rad * 0.38,
              rad * 0.2,
              lightOf(sc),
              null,
              0,
              0.35 * out,
              false,
            )
            env.circle(bx, byy, rad * 0.985, null, mix(pc, darkOf(sc), 0.4), lw, out, false)
            // 撞击火花
            if (tau > 0 && ((i === 0 && n > 1) || i === n - 1)) {
              const ph = ((om * tau) / Math.PI) % 2
              const near = Math.min(Math.abs(ph - 0.5), Math.abs(ph - 1.5))
              if (near < 0.08 && (i === 0) === Math.abs(ph - 0.5) < 0.08) {
                const k = 1 - near / 0.08
                const sx = px + (i === 0 ? rad : -rad)
                for (let q = -1; q <= 1; q++)
                  env.line(
                    [
                      [sx + (i === 0 ? rad * 0.2 : -rad * 0.2), byy + q * rad * 0.5],
                      [sx + (i === 0 ? rad * 0.55 : -rad * 0.55), byy + q * rad * 0.9],
                    ],
                    sc.accent,
                    Math.max(1.5, rad * 0.05),
                    k * out,
                    false,
                  )
              }
            }
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: ch,
                font: P.font,
                size: rad * 1.08,
                x: bx,
                y: byy,
                rot: -th / DEG,
                color: tc,
                noHold: plateHold(cut),
                mi: miAt(env, cut, 0.15 + i * 0.05),
              }),
            )
          })
          return bb
        }
        // 单点悬挂：几根不同摆长的摆（摆波）
        const items =
          mode === 'fan'
            ? chs.map((c) => ({ t: c }))
            : (P.chunks.length ? P.chunks : chunksK(cut.text, 3)).map((c) => ({ t: flat(c) }))
        const k = items.length
        const px = W / 2
        const py = H * 0.06
        let size: number
        let step: number
        let L0: number
        let plateW: number[] = []
        if (mode === 'fan') {
          step = Math.min((H * 0.84) / (k + 1.2), W * 0.2)
          size = step * 0.84
          L0 = step * 1.4
        } else {
          const wMax = W * (port ? 0.8 : 0.56)
          size = Math.min(
            ...items.map((q) =>
              fitSize(q.t, P.font, wMax, ((H * 0.8) / (k + 1)) * 0.62, { track: 0.03 }),
            ),
            u * 0.14,
          )
          step = size * 1.75
          L0 = Math.max(H * 0.9 - step * k, size * 2)
          plateW = items.map(
            (q) => measure({ text: q.t, font: P.font, size, track: 0.03 }).w + size * 0.8,
          )
        }
        const Lmax = L0 + step * (k - 1)
        const A = (mode === 'fan' ? 7 : 5) * DEG * (0.5 + 0.7 * mot)
        const rel = E.inOutCubic(clamp((lt - 0.1) / 0.6))
        env.circle(px, py, Math.max(3, u * 0.008), sc.accent, null, 0, fa, false)
        env.rect(
          px - u * 0.06 * fa,
          py - Math.max(2, u * 0.003),
          u * 0.12 * fa,
          Math.max(3, u * 0.005),
          sc.sub,
          fa,
          false,
        )
        const pos = items.map((_q, i) => {
          const L = L0 + step * i
          const Ti = P.period * 1.6 * Math.sqrt(L / Lmax)
          const tau = Math.max(0, env.ltb - 0.2)
          const th =
            A * P.side * Math.cos((TAU * tau) / Ti) * rel +
            E.inCubic(env.pOut) * 30 * DEG * P.side * (0.5 + i / k)
          const grow = E.outCubic(clamp((lt - i * 0.04) / 0.4))
          return { L: L * grow, th, grow }
        })
        // 先画线再画坠子，扇形不会切穿字形
        pos.forEach((q, _i) => {
          if (q.grow > 0)
            env.line(
              [
                [px, py],
                [
                  px + Math.sin(q.th) * q.L,
                  py + Math.cos(q.th) * q.L - (mode === 'fan' ? size * 0.55 : size * 0.62),
                ],
              ],
              sc.sub,
              lw,
              0.75 * out,
              false,
            )
        })
        items.forEach((q, i) => {
          const p = pos[i]
          if (p.grow <= 0) return
          const bx = px + Math.sin(p.th) * p.L
          const byy = py + Math.cos(p.th) * p.L
          const col = i % 2 && contrast(sc.accent, sc.bg) > 1.6 ? sc.accent : pc
          if (mode === 'fan') {
            env.circle(bx, byy, size * 0.62, col, null, 0, out, gIn(env))
          } else {
            const w2 = plateW[i]
            const h2 = size * 1.24
            ctx.save()
            ctx.translate(bx, byy)
            ctx.rotate(-p.th)
            env.rrect(-w2 / 2, -h2 / 2, w2, h2, h2 * 0.14, col, out, gIn(env))
            env.circle(0, -h2 / 2 + h2 * 0.12, Math.max(2, size * 0.06), sc.bg, null, 0, out, false)
            ctx.restore()
          }
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: q.t,
              font: P.font,
              size: mode === 'fan' ? size * 0.78 : size,
              track: 0.03,
              x: bx,
              y: byy + (mode === 'fan' ? 0 : size * 0.06),
              rot: -p.th / DEG,
              color: onCol(sc, col),
              noHold: plateHold(cut),
              mi: miAt(env, cut, 0.12 + i * 0.05),
            }),
          )
        })
        return bb
      },
    },

    pile: {
      w: 0.8,
      tags: ['pop', 'emotional', 'graphic'],
      fits: (n) => n >= 1 && n <= 14,
      enterBias: {
        cut: 2.4,
        drop: 1.2,
        pop: 0.8,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.3,
        assemble: 0.4,
      },
      plan: (rng: Rng, _cut, st: StylePack): PileParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        hf: rng.pick(fontsOf(st, ['body', 'display', 'serif'])),
        peak: rng.range(-0.12, 0.12),
        hgt: rng.range(0.26, 0.34),
        order: rng.pick(['ltr', 'random', 'random']),
        dust: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as PileParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        if (!n) return null
        const rowsT = n > (port ? 5 : 8) ? chunksK(t0, port ? Math.ceil(n / 5) : 2) : [t0]
        const nR = rowsT.length
        const out = tout(env)
        let size = Math.min(u * 0.2, (H * 0.5) / (nR + 0.6))
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * 1.02
          size = Math.min(size, (W * (port ? 0.86 : 0.74)) / Math.max(1, a))
        }
        let maxTot = 0
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * 1.02 * size
          maxTot = Math.max(maxTot, a)
        }
        const cx = clamp(
          W * (0.5 + P.peak * (port ? 0.2 : 0.6)),
          W * 0.06 + maxTot / 2,
          W * 0.94 - maxTot / 2,
        )
        const sig = Math.max(W * 0.26, maxTot * 0.68)
        const yBase = H * 1.04
        const Hm = yBase - (H * (0.5 + P.hgt * 0.25) + nR * size * 0.49)
        const rise = (1 - E.outCubic(clamp(lt / 0.5))) * Hm * 1.1 + E.inCubic(env.pOut) * Hm * 0.5
        const bump = (x: number): number =>
          Math.sin((x / W) * 17 + (s % 7)) * H * 0.006 +
          Math.sin((x / W) * 31 + (s % 5)) * H * 0.004
        const surf = (x: number): number =>
          yBase + rise - Hm / (1 + Math.pow((x - cx) / sig, 4)) + bump(x)
        // 表面之下的一堆小字（一个文字项，字形由 charFn 摆位）
        const pool = poolOf(cut)
        const NP = pool.length
        const cell = clamp(u * 0.045, 16, 60)
        type Heap = { x: number; y: number; rot: number; ch: string; c: number; a: number }
        const heap: Heap[] = []
        // 土堆本体（压暗）
        const mound: Pt[] = []
        for (let i = 0; i <= 48; i++) {
          const x = -W * 0.02 + (W * 1.04 * i) / 48
          mound.push([x, surf(x) + cell * 1.2])
        }
        mound.push([W * 1.02, H + 4], [-W * 0.02, H + 4])
        env.poly(mound, mix(sc.bg, sc.sub, 0.14), out, false)
        const colsN = Math.ceil(W / cell) + 2
        const depth = Math.max(3, Math.min(5, Math.floor(200 / colsN)))
        for (let gx = -1; gx < colsN - 1 && heap.length < 200; gx++) {
          const x = (gx + 0.5) * cell
          const top = surf(x)
          for (let gy = 0; gy < depth && heap.length < 200; gy++) {
            const y = top + (gy + 0.5) * cell * 0.82
            if (y > H + cell) break
            heap.push({
              x: x + rs(s, gx, gy, 3) * cell * 0.3,
              y: y + rs(s, gx, gy, 4) * cell * 0.2,
              rot: rs(s, gx, gy, 5) * 70,
              ch: pool[hash(s, gx, gy, 6) % NP],
              c: r(s, gx, gy, 7) < 0.14 ? 1 : 0,
              a: (0.35 + 0.5 * r(s, gx, gy, 8)) * (1 - gy / (depth + 1)),
            })
          }
        }
        if (env.pass === 'main' && heap.length) {
          const it: TextItem = {
            text: heap.map((q) => q.ch).join(''),
            font: P.hf,
            size: cell * 0.8,
            x: 0,
            y: 0,
            color: sc.sub,
            ghost: false,
            alpha: out,
          }
          it._lay = layoutText(it)
          it.charFn = (i, g) => {
            const q = heap[i]
            return q
              ? {
                  dx: q.x - g.x,
                  dy: q.y - g.y,
                  rot: q.rot,
                  a: q.a,
                  color: q.c ? sc.accent : undefined,
                }
              : { hide: true }
          }
          env.draw(it)
        }
        // 歌词字符落到堆上，顺着坡面停住
        const fd = 0.34
        const gap = clamp((cut.dur * 0.3) / n, 0.03, 0.09)
        let bb: BBox | null = null
        const order: [number, number][] = []
        for (let ri = nR - 1; ri >= 0; ri--) {
          // 下层先落地
          const chars = [...rowsT[ri]]
          const ord = chars.map((_c, i) => i)
          if (P.order === 'random') ord.sort((a, b) => r(s, ri, a, 21) - r(s, ri, b, 21))
          ord.forEach((i) => order.push([ri, i]))
        }
        const when = new Map<number, number>()
        order.forEach(([ri, i], q) => when.set(ri * 100 + i, 0.08 + q * gap))
        rowsT.forEach((row, ri) => {
          const layer = nR - 1 - ri
          const chars = [...row]
          const ads = chars.map((ch) => adv(P.font, ch) * size * 1.02)
          const tot = ads.reduce((a, b) => a + b, 0)
          let x = cx - tot / 2
          chars.forEach((ch, i) => {
            const gxp = x + ads[i] / 2
            x += ads[i]
            if (ch === ' ') return
            const ys = surf(gxp)
            const slope = Math.atan2(surf(gxp + size * 0.5) - surf(gxp - size * 0.5), size)
            const tilt = (slope / DEG) * 0.7 + rs(s, ri, i, 9) * 6
            const restY = ys - size * (0.47 + layer * 0.98)
            const t1 = when.get(ri * 100 + i) ?? 0
            const f = (lt - t1) / fd
            if (f < 0) return
            let y: number
            let rot: number
            let sy = 1
            if (f < 1) {
              const e = E.inQuad(f)
              y = lerp(-size * 1.2 - r(s, ri, i, 10) * H * 0.2, restY, e)
              rot = lerp(rs(s, ri, i, 11) * 50, tilt, e)
            } else {
              const tau = (f - 1) * fd
              y = restY - size * 0.14 * Math.abs(Math.sin(tau * 16)) * Math.exp(-tau / 0.09)
              rot = tilt
              sy = 1 - 0.16 * Math.exp(-tau / 0.05)
              if (P.dust && tau < 0.35 && env.pass === 'main') {
                for (let q = 0; q < 4; q++) {
                  const dir = q < 2 ? -1 : 1
                  const sp = rr(0.6, 1.2, s, ri, i, q)
                  env.circle(
                    gxp + dir * (size * 0.35 + tau * size * 1.6 * sp),
                    restY + size * 0.45 - tau * size * (0.9 - tau * 2.2) * sp,
                    size * 0.035 * (1 - tau / 0.35),
                    sc.sub,
                    null,
                    0,
                    (1 - tau / 0.35) * out,
                    false,
                  )
                }
              }
            }
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: ch,
                font: P.font,
                size,
                x: gxp,
                y: y + size * 0.47 * (1 - sy),
                sy,
                rot,
                color: r(s, ri, i, 12) < 0.12 ? sc.accent : sc.fg,
                mi: miAt(env, cut, t1),
              }),
            )
          })
        })
        return bb
      },
    },

    blocks: {
      w: 0.8,
      tags: ['pop', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 2.5, drop: 1.4, pop: 1, blur: 0.4, slice: 0.2, wipe: 0.2, stretch: 0.3 },
      plan: (rng: Rng, _cut, st: StylePack): BlocksParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        deco: rng.chance(0.75),
        tilt: rng.chance(0.5),
        hop: rng.chance(0.7),
        side: rng.pick([1, -1]),
        colOff: rng.int(0, 5),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BlocksParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const n = glyphCount(cut.text)
        if (!n) return null
        const port = isPort(env)
        const rowsB = rowsOf(cut.text, port ? 4 : n <= 6 ? 6 : Math.min(8, Math.ceil(n / 2)))
        const rows = rowsB.length
        const per = Math.max(...rowsB.map((row) => row.length))
        const dk = 0.34
        const gk = 1.07 // 斜侧面的深度 / 顶面的进深
        const deco = P.deco && (!port || n <= 3)
        const extra = deco ? 2 : 0
        const k = Math.min(
          (W * 0.84) / (per * gk + extra * 0.95 + dk),
          (H * 0.7) / (rows * 1.02 + dk + 0.2),
          u * 0.26,
        )
        const dx = k * dk * 0.8 * P.side
        const dy = -k * dk * 0.62
        const floorY = H / 2 + (rows * k) / 2 + k * 0.1
        const out = tout(env)
        const cols = objCols(sc)
        const lw = Math.max(1, k * 0.012)
        env.line(
          [
            [W * 0.08, floorY],
            [W * 0.92, floorY],
          ],
          sc.sub,
          Math.max(1, u * 0.002),
          0.6 * tin(env, 0, 0.4) * out,
          false,
        )
        const blk: Block[] = []
        // 歌词块：底行先码，上排才落得住
        let gi = 0
        const byRow: Block[][] = rowsB.map(() => [])
        rowsB.forEach((row, r0) =>
          row.forEach((ch, j) => {
            if (ch === ' ') return
            const x = W / 2 + (j - (row.length - 1) / 2) * k * gk - dx / 2
            const b0: Block = {
              ch,
              x,
              y: floorY - (rows - r0 - 0.5) * k * 1.02,
              r: r0,
              order: (rows - 1 - r0) * per + j,
              col: cols[(gi++ + P.colOff) % cols.length],
            }
            blk.push(b0)
            byRow[r0].push(b0)
          }),
        )
        // 悬空处补一块素积木，上排永远有东西垫着
        for (let r0 = 0; r0 < rows - 1; r0++)
          for (const b0 of byRow[r0]) {
            if (byRow[r0 + 1].some((q) => Math.abs(q.x - b0.x) < k * 0.6)) continue
            const f: Block = {
              ch: null,
              shape: 3,
              x: b0.x,
              y: floorY - (rows - r0 - 1.5) * k * 1.02,
              r: r0 + 1,
              order: (rows - 2 - r0) * per - 1,
              col: mix(b0.col, sc.bg, 0.35),
            }
            blk.push(f)
            byRow[r0 + 1].push(f)
          }
        if (deco) {
          const cntB = Math.min(per, n)
          const xl = W / 2 - ((cntB - 1) / 2) * k * gk - dx / 2 - k * 1.05
          const xr = W / 2 + ((cntB - 1) / 2) * k * gk - dx / 2 + k * 1.05
          blk.push({
            ch: null,
            shape: 0,
            x: xl,
            y: floorY - k * 0.5 * 0.8,
            sz: 0.8,
            order: -1,
            col: cols[(P.colOff + 2) % cols.length],
          })
          blk.push({
            ch: null,
            shape: 1,
            x: xr,
            y: floorY - k * 0.5 * 0.8,
            sz: 0.8,
            order: n + 1,
            col: cols[(P.colOff + 3) % cols.length],
          })
          if (rows === 1)
            blk.push({
              ch: null,
              shape: 2,
              x: xr + rs(s, 1) * k * 0.05,
              y: floorY - k * 0.8 - k * 0.3,
              sz: 0.6,
              order: n + 2,
              col: cols[(P.colOff + 1) % cols.length],
            })
        }
        const gap = clamp((cut.dur * 0.3) / (n + 2), 0.035, 0.1)
        const fd = 0.3
        let bb: BBox | null = null
        // 踩拍子跳一下（没有节拍就每 0.65 秒）
        let hopI = -1
        let hopF = 0
        if (P.hop && lt > 0.3 + (n + 2) * gap + fd) {
          if (env.beat && env.beat.len > 0.2) {
            hopI = hash(s, env.beat.index, 4) % n
            hopF = env.beat.since / 0.32
          } else {
            const P0 = 0.65
            const kk = Math.floor(env.ltb / P0)
            hopI = hash(s, kk, 4) % n
            hopF = (env.ltb - kk * P0) / 0.32
          }
        }
        const sorted = blk.slice().sort((a, b) => b.y - a.y || (P.side > 0 ? a.x - b.x : b.x - a.x))
        for (const b of sorted) {
          const kz = k * (b.sz || 1)
          const t1 = 0.06 + (b.order + 1) * gap
          const f = (lt - t1) / fd
          if (f < 0) continue
          let y: number
          let sq = 1
          if (f < 1) y = lerp(-kz * 2 - (H - b.y) * 0.2, b.y, E.inQuad(f))
          else {
            const tau = (f - 1) * fd
            y = b.y - kz * 0.1 * Math.abs(Math.sin(tau * 14)) * Math.exp(-tau / 0.1)
            sq = 1 - 0.1 * Math.exp(-tau / 0.05)
          }
          const bi = blk.indexOf(b)
          if (bi === hopI && hopF < 1) y -= kz * 0.16 * Math.sin(Math.PI * clamp(hopF))
          y += E.inQuad(clamp(env.pOut * 1.4 - ((b.order + 1) / (n + 3)) * 0.4)) * H * 0.7
          const rot = P.tilt && b.r === 0 && rows > 1 ? rs(s, bi, 3) * 3 : 0
          ctx.save()
          ctx.translate(b.x, y + kz / 2)
          ctx.rotate(rot * DEG)
          ctx.scale(1, sq)
          ctx.translate(0, -kz / 2)
          const hk = kz / 2
          const ddx = dx * (b.sz || 1)
          const ddy = dy * (b.sz || 1)
          const topC = shade(sc, b.col, 0.28)
          const sideC = shade(sc, b.col, -0.3)
          env.poly(
            [
              [-hk, -hk],
              [hk, -hk],
              [hk + ddx, -hk + ddy],
              [-hk + ddx, -hk + ddy],
            ],
            topC,
            out,
            false,
          )
          env.poly(
            P.side > 0
              ? [
                  [hk, -hk],
                  [hk + ddx, -hk + ddy],
                  [hk + ddx, hk + ddy],
                  [hk, hk],
                ]
              : [
                  [-hk, -hk],
                  [-hk + ddx, -hk + ddy],
                  [-hk + ddx, hk + ddy],
                  [-hk, hk],
                ],
            sideC,
            out,
            false,
          )
          env.rect(-hk, -hk, kz, kz, b.col, out, gIn(env))
          env.rrect(
            -hk + kz * 0.08,
            -hk + kz * 0.08,
            kz * 0.84,
            kz * 0.84,
            kz * 0.06,
            null,
            out,
            false,
            mix(b.col, onCol(sc, b.col), 0.35),
            lw * 1.5,
          )
          if (b.ch == null) {
            const tcol = mix(b.col, onCol(sc, b.col), 0.8)
            const q = kz * 0.26
            if (b.shape === 0) env.circle(0, 0, q, tcol, null, 0, out, false)
            else if (b.shape === 1)
              env.poly(
                [
                  [0, -q * 1.1],
                  [q * 1.05, q * 0.8],
                  [-q * 1.05, q * 0.8],
                ],
                tcol,
                out,
                false,
              )
            else if (b.shape !== 3)
              env.poly(
                [
                  [0, -q],
                  [q, 0],
                  [0, q],
                  [-q, 0],
                ],
                tcol,
                out,
                false,
              )
            // shape 3 = 素垫块，不画图案
          }
          ctx.restore()
          if (b.ch != null) {
            const m = [
              Math.cos(rot * DEG),
              Math.sin(rot * DEG),
              -Math.sin(rot * DEG) * sq,
              Math.cos(rot * DEG) * sq,
              b.x,
              y + kz / 2,
            ]
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: b.ch,
                  font: P.font,
                  size: kz * 0.6,
                  x: 0,
                  y: -kz / 2,
                  color: onCol(sc, b.col),
                  noHold: plateHold(cut),
                  mi: miAt(env, cut, t1),
                },
                m,
              ),
            )
          }
        }
        return bb
      },
    },

    balloons: {
      w: 0.8,
      tags: ['pop', 'emotional', 'calm'],
      treat: false,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: {
        cut: 1.8,
        pop: 1.5,
        drop: 0.6,
        blur: 0.8,
        slice: 0.2,
        wipe: 0.2,
        assemble: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): BalloonsParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        tie: rng.pick(['bunch', 'bunch', 'free']),
        arc: rng.range(0.02, 0.06),
        colOff: rng.int(0, 4),
        mono: rng.chance(0.3),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BalloonsParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        if (!n) return null
        const rowsT = n > (port ? 4 : 7) ? chunksK(t0, port ? Math.ceil(n / 4) : 2) : [t0]
        const nR = rowsT.length
        const out = tout(env)
        const mot = env.fx.motion
        let size = Math.min(u * 0.26, (H * 0.56) / (nR * 1.25 + 0.3))
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * 1.2
          size = Math.min(size, (W * 0.84) / Math.max(1, a))
        }
        const cols = objCols(sc)
        const gx = W / 2
        const gy = H * 0.93
        const fly = E.inCubic(env.pOut) * H * 0.9
        type Balloon = {
          ch: string
          x: number
          y: number
          rot: number
          e: number
          t1: number
          col: string
          q: number
        }
        const glyphs: Balloon[] = []
        rowsT.forEach((row, ri) => {
          const chars = [...row]
          const ads = chars.map((ch) => adv(P.font, ch) * size * 1.2)
          const tot = ads.reduce((a, b) => a + b, 0)
          let x = W / 2 - tot / 2
          const yRow = H * 0.4 + (ri - (nR - 1) / 2) * size * 1.3
          chars.forEach((ch, i) => {
            const cxp = x + ads[i] / 2
            x += ads[i]
            if (ch === ' ') return
            const q = glyphs.length
            const ph = r(s, q, 1) * TAU
            const u0 = tot > 0 ? (cxp - W / 2) / (tot / 2) : 0
            const t1 = 0.05 + q * clamp((cut.dur * 0.3) / n, 0.03, 0.08)
            const e = clamp((lt - t1) / 0.45)
            const bob = Math.sin(env.ltb * 1.4 + ph) * size * 0.05 * (0.4 + mot)
            const y =
              yRow -
              P.arc * H * (1 - u0 * u0) +
              bob +
              (1 - E.outCubic(e)) * H * 0.35 -
              fly * (0.8 + 0.4 * r(s, q, 2))
            glyphs.push({
              ch,
              x: cxp + Math.sin(env.ltb * 0.9 + ph) * size * 0.03,
              y,
              rot: Math.sin(env.ltb * 0.8 + ph * 1.3) * 5 * (0.4 + mot) + rs(s, q, 3) * 4,
              e,
              t1,
              col: P.mono ? cols[P.colOff % cols.length] : cols[(q + P.colOff) % cols.length],
              q,
            })
          })
        })
        // 线（在气球后面）
        const lw = Math.max(1, u * 0.0016)
        for (const g of glyphs) {
          if (g.e <= 0) continue
          const bx = g.x - Math.sin(g.rot * DEG) * size * 0.58
          const by = g.y + Math.cos(g.rot * DEG) * size * 0.58
          const pts: Pt[] = []
          const ex =
            P.tie === 'bunch'
              ? gx + (g.x - gx) * 0.06
              : bx + Math.sin(env.ltb * 1.1 + g.q) * size * 0.2
          const ey = P.tie === 'bunch' ? gy - fly : Math.min(H * 1.05, by + H * 0.3)
          for (let k = 0; k <= 10; k++) {
            const f = k / 10
            const wig = Math.sin(f * 7 + env.ltb * 2 + g.q) * size * 0.05 * f * (1 - f) * 4
            pts.push([lerp(bx, ex, f) + wig, lerp(by, ey, f) + Math.sin(f * Math.PI) * size * 0.25])
          }
          env.line(pts, sc.sub, lw, 0.85 * out * g.e, false)
          env.poly(
            [
              [bx - size * 0.05, by + size * 0.07],
              [bx + size * 0.05, by + size * 0.07],
              [bx, by - size * 0.02],
            ],
            shade(sc, g.col, -0.35),
            out * g.e,
            false,
          )
        }
        if (P.tie === 'bunch')
          env.circle(gx, gy - fly, size * 0.05, sc.sub, null, 0, out * tin(env, 0.2, 0.3), false)
        let bb: BBox | null = null
        for (const g of glyphs) {
          if (g.e <= 0) continue
          const q = E.outBack(g.e, 2.2)
          const sz = size * (0.3 + 0.7 * q)
          const dark = shade(sc, g.col, -0.38)
          // 鼓起的边、本体、高光
          env.draw({
            text: g.ch,
            font: P.font,
            size: sz,
            x: g.x,
            y: g.y,
            rot: g.rot,
            color: dark,
            stroke: sz * 0.13,
            strokeColor: dark,
            strokeUnder: true,
            alpha: out,
            ghost: false,
          })
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: g.ch,
              font: P.font,
              size: sz,
              x: g.x,
              y: g.y,
              rot: g.rot,
              color: g.col,
              stroke: sz * 0.065,
              strokeColor: g.col,
              strokeUnder: true,
              plain: true,
              mi: miAt(env, cut, g.t1),
            }),
          )
          env.draw({
            text: g.ch,
            font: P.font,
            size: sz,
            x: g.x - sz * 0.02,
            y: g.y - sz * 0.03,
            rot: g.rot,
            color: lightOf(sc),
            alpha: 0.3 * out * Math.min(1, g.e * 2),
            ghost: false,
            charFn: () => ({ clipY: [-0.75, -0.22], s: 0.93 }),
          })
          env.circle(
            g.x - sz * 0.22,
            g.y - sz * 0.26,
            sz * 0.045,
            lightOf(sc),
            null,
            0,
            0.7 * out * g.e,
            false,
          )
        }
        return bb
      },
    },

    magnets: {
      w: 0.7,
      tags: ['pop', 'graphic'],
      treat: false,
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 2.5, pop: 1.3, drop: 0.8, slice: 0.2, wipe: 0.2, stretch: 0.3 },
      plan: (rng: Rng, _cut, st: StylePack): MagnetsParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        df: rng.pick(fontsOf(st, ['display', 'body'])),
        decoys: rng.int(6, 11),
        handle: rng.pick([1, -1]),
        colOff: rng.int(0, 4),
        tilt: rng.range(6, 12),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as MagnetsParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const chs = slotsOf(cut.text)
        const n = chs.filter((c) => c !== ' ').length
        if (!n) return null
        const out = tout(env)
        const ba = tin(env, 0, 0.45, E.outCubic) * out
        // 冰箱门
        const mx = W * 0.04
        const my = H * 0.05
        const bw = W - mx * 2
        const bh = H - my * 2
        const crad = u * 0.03
        const board = mix(sc.bg, sc.fg, lum(sc.bg) < 0.5 ? 0.07 : 0.06)
        env.rrect(
          mx,
          my + (1 - ba) * H * 0.04,
          bw,
          bh,
          crad,
          board,
          ba,
          false,
          mix(sc.bg, sc.fg, 0.16),
          Math.max(1, u * 0.002),
        )
        if (env.pass === 'main' && ba > 0) {
          const g = ctx.createLinearGradient(mx, my, mx + bw, my + bh)
          g.addColorStop(0, rgba(lightOf(sc), 0.06))
          g.addColorStop(0.45, rgba(lightOf(sc), 0))
          g.addColorStop(0.5, rgba(lightOf(sc), 0.04))
          g.addColorStop(1, rgba(lightOf(sc), 0))
          ctx.save()
          ctx.globalAlpha = ba
          ctx.fillStyle = g
          ctx.beginPath()
          rrPath(ctx, mx, my + (1 - ba) * H * 0.04, bw, bh, crad)
          ctx.fill()
          ctx.restore()
        }
        const hx = P.handle > 0 ? mx + bw - u * 0.05 : mx + u * 0.035
        const hh = bh * 0.34
        env.rrect(hx, H / 2 - hh / 2, u * 0.016, hh, u * 0.008, mix(board, sc.fg, 0.2), ba, false)
        // 歌词分行排布
        const per = port ? 4 : 8
        const rowsT = n > per ? chunksK(flat(cut.text), Math.ceil(n / per)) : [flat(cut.text)]
        const nR = rowsT.length
        let base = Math.min(u * 0.22, (H * 0.56) / (nR * 1.12))
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch) * (isHan(ch) ? 1 : 0.86) * 1.1
          base = Math.min(base, (bw * 0.8) / Math.max(1, a))
        }
        const cols = objCols(sc)
        const items: MagnetItem[] = []
        rowsT.forEach((row, ri) => {
          const chars = [...row]
          const ks = chars.map((ch) =>
            isHan(ch) ? 1 : isPunct(ch) ? 0.6 : isKana(ch) ? 0.7 : 0.86,
          )
          const ads = chars.map((ch, i) => adv(P.font, ch) * base * ks[i] * 1.1)
          const tot = ads.reduce((a, b) => a + b, 0)
          let x = W / 2 - tot / 2
          const y = H / 2 + (ri - (nR - 1) / 2) * base * 1.14
          chars.forEach((ch, i) => {
            const cx = x + ads[i] / 2
            x += ads[i]
            if (ch === ' ') return
            const q = items.length
            items.push({
              ch,
              x: cx + rs(s, q, 1) * base * 0.04,
              y: y + rs(s, q, 2) * base * 0.08,
              size: base * ks[i],
              rot: rs(s, q, 3) * P.tilt,
              col: cols[(q * 7 + P.colOff) % cols.length],
              q,
            })
          })
        })
        // 边缘的干扰磁贴（绝不压到歌词带）
        const bandY0 = H / 2 - nR * base * 0.62
        const bandY1 = H / 2 + nR * base * 0.62
        if (env.pass === 'main') {
          for (let d = 0; d < P.decoys; d++) {
            const ta = 0.05 + d * 0.04
            const e = clamp((lt - ta) / 0.2)
            if (e <= 0) continue
            const top = d % 2 === 0
            const half = Math.ceil(P.decoys / 2)
            const slot = Math.floor(d / 2)
            const sz = Math.min(base * rr(0.36, 0.58, s, d, 14), u * 0.09)
            const y = top
              ? lerp(
                  my + bh * 0.08 + sz * 0.6,
                  Math.max(my + bh * 0.1 + sz * 0.6, bandY0 - sz * 0.8),
                  r(s, d, 11),
                )
              : lerp(
                  Math.min(my + bh * 0.9 - sz * 0.6, bandY1 + sz * 0.8),
                  my + bh * 0.92 - sz * 0.6,
                  r(s, d, 11),
                )
            const x = mx + bw * (0.1 + (0.8 * (slot + 0.2 + 0.6 * r(s, d, 12))) / half)
            const ch = DECOY[hash(s, d, 13) % DECOY.length]
            const rot = rs(s, d, 15) * 25
            const col = cols[(d + 2 + P.colOff) % cols.length]
            const k = 1 + 0.25 * (1 - E.outCubic(e))
            env.draw({
              text: ch,
              font: P.df,
              size: sz * k,
              x: x + sz * 0.05,
              y: y + sz * 0.07,
              rot,
              color: darkOf(sc),
              stroke: sz * 0.08,
              strokeColor: darkOf(sc),
              strokeUnder: true,
              alpha: 0.28 * out * e,
              ghost: false,
            })
            env.draw({
              text: ch,
              font: P.df,
              size: sz * k,
              x,
              y,
              rot,
              color: col,
              stroke: sz * 0.08,
              strokeColor: col,
              strokeUnder: true,
              alpha: 0.85 * out * e,
              ghost: false,
            })
          }
        }
        let bb: BBox | null = null
        const gap = clamp((cut.dur * 0.32) / n, 0.04, 0.1)
        for (const m of items) {
          const t1 = 0.18 + m.q * gap
          const f = (lt - t1) / 0.16
          if (f < 0) continue
          // 吸附：从远处被"啪"地吸到门上，末端微弹
          const snap =
            f < 1
              ? 1.28 - 0.28 * E.inQuad(f)
              : 1 - 0.05 * Math.exp((-(f - 1) * 0.16) / 0.05) * Math.cos((f - 1) * 3)
          const lift = f < 1 ? 1 - f : 0
          const sz = m.size * snap
          env.draw({
            text: m.ch,
            font: P.font,
            size: sz,
            x: m.x + m.size * (0.04 + lift * 0.12),
            y: m.y + m.size * (0.06 + lift * 0.18),
            rot: m.rot,
            color: darkOf(sc),
            stroke: sz * 0.08,
            strokeColor: darkOf(sc),
            strokeUnder: true,
            alpha: (0.3 - lift * 0.15) * out,
            ghost: false,
          })
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: m.ch,
              font: P.font,
              size: sz,
              x: m.x,
              y: m.y,
              rot: m.rot,
              color: m.col,
              stroke: sz * 0.08,
              strokeColor: m.col,
              strokeUnder: true,
              plain: true,
              mi: miAt(env, cut, t1),
            }),
          )
        }
        return bb
      },
    },

    tiles: {
      w: 0.7,
      tags: ['pop', 'editorial', 'graphic'],
      treat: 'safe',
      portrait: 0.7,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 3, pop: 0.8, blur: 0.4, slice: 0.2, wipe: 0.2, stretch: 0.2 },
      plan: (rng: Rng, _cut, st: StylePack): TilesParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        from: rng.pick(['right', 'right', 'drop']),
        rack: rng.pick(['accent', 'ink', 'sub']),
        score: rng.chance(0.75),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as TilesParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const n = glyphCount(cut.text)
        if (!n) return null
        const port = isPort(env)
        const rowsT = rowsOf(cut.text, port ? 5 : 9)
        const rows = rowsT.length
        const per = Math.max(...rowsT.map((row) => row.length))
        const k = Math.min((W * 0.84) / (per * 1.08 + 0.6), (H * 0.62) / (rows * 1.75), u * 0.2)
        const out = tout(env)
        const tileC = mix(lightOf(sc), sc.accent, 0.1)
        const tileT = darkOf(sc)
        const edge = mix(tileC, darkOf(sc), 0.3)
        const hi = mix(tileC, '#FFFFFF', 0.35)
        const rackC = plateCol(
          sc,
          P.rack === 'accent'
            ? [sc.accent, sc.ink]
            : P.rack === 'sub'
              ? [sc.sub, sc.ink]
              : [sc.ink, sc.accent],
        )
        const gap = clamp((cut.dur * 0.36) / n, 0.05, 0.12)
        const fd = 0.28
        let bb: BBox | null = null
        let score = 0
        let total = 0
        const ra = tin(env, 0, 0.4, E.outCubic) * out
        let gi = 0
        for (let r0 = 0; r0 < rows; r0++) {
          const row = rowsT[r0]
          const cnt = row.length
          const rowY = H / 2 + (r0 - (rows - 1) / 2) * k * 1.75
          const rw = cnt * k * 1.08 + k * 0.5
          // 牌架：后槽 + 斜面前唇 + 投影
          const ry = rowY + k * 0.42
          const rw2 = rw * (0.3 + 0.7 * ra)
          env.poly(
            [
              [W / 2 - rw2 / 2 + k * 0.06, ry + k * 0.34],
              [W / 2 + rw2 / 2 + k * 0.06, ry + k * 0.34],
              [W / 2 + rw2 / 2 + k * 0.2, ry + k * 0.42],
              [W / 2 - rw2 / 2 + k * 0.2, ry + k * 0.42],
            ],
            darkOf(sc),
            0.25 * ra,
            false,
          )
          env.rect(W / 2 - rw2 / 2, ry - k * 0.12, rw2, k * 0.14, shade(sc, rackC, -0.3), ra, false)
          for (let j = 0; j < cnt; j++) {
            const ch = row[j]
            if (ch === ' ') continue
            const i = gi++
            const pts = tilePts(ch)
            total += pts
            const x = W / 2 + (j - (cnt - 1) / 2) * k * 1.08
            const y = rowY
            const t1 = 0.12 + i * gap
            const f = clamp((lt - t1) / fd)
            if (f <= 0) continue
            if (f >= 1) score += pts
            const e = E.outCubic(f)
            let tx = x
            let ty: number
            let rot: number
            if (P.from === 'drop') {
              ty = lerp(y - H * 0.5, y, E.inQuad(f))
              rot = (1 - f) * rs(s, i, 2) * 30
              if (f >= 1)
                ty -=
                  k *
                  0.06 *
                  Math.abs(Math.sin((lt - t1 - fd) * 18)) *
                  Math.exp(-(lt - t1 - fd) / 0.08)
            } else {
              tx = lerp(W + k, x, e)
              rot = (1 - e) * 10
              ty = y - Math.sin(Math.PI * f) * k * 0.15
            }
            // 出场：逐行往左滑走
            const po = E.inCubic(clamp(env.pOut * 1.4 - (j / Math.max(1, cnt)) * 0.4))
            tx -= po * (x + k * 2 + k)
            const lean = -k * 0.05
            ctx.save()
            ctx.translate(tx, ty)
            ctx.rotate(rot * DEG)
            env.rrect(-k / 2 + k * 0.03, -k / 2 + k * 0.06 + lean, k, k, k * 0.1, edge, out, false)
            env.rrect(-k / 2, -k / 2 + lean, k, k, k * 0.1, tileC, out, gIn(env))
            env.line(
              [
                [-k / 2 + k * 0.12, -k / 2 + k * 0.05 + lean],
                [k / 2 - k * 0.12, -k / 2 + k * 0.05 + lean],
              ],
              hi,
              Math.max(1, k * 0.025),
              0.7 * out,
              false,
            )
            if (pts > 0)
              env.draw({
                text: String(pts),
                font: monoF(env),
                size: k * 0.17,
                x: k * 0.35,
                y: k * 0.33 + lean,
                color: tileT,
                alpha: 0.85 * out,
                ghost: false,
              })
            ctx.restore()
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: ch,
                  font: P.font,
                  size: k * 0.6,
                  x: -k * 0.06,
                  y: -k * 0.05,
                  color: tileT,
                  noHold: plateHold(cut),
                  mi: miAt(env, cut, t1),
                },
                [
                  Math.cos(rot * DEG),
                  Math.sin(rot * DEG),
                  -Math.sin(rot * DEG),
                  Math.cos(rot * DEG),
                  tx,
                  ty + lean,
                ],
              ),
            )
          }
          env.poly(
            [
              [W / 2 - rw2 / 2, ry + k * 0.02],
              [W / 2 + rw2 / 2, ry + k * 0.02],
              [W / 2 + rw2 / 2 - k * 0.06, ry + k * 0.34],
              [W / 2 - rw2 / 2 + k * 0.06, ry + k * 0.34],
            ],
            rackC,
            ra,
            gIn(env),
          )
          env.line(
            [
              [W / 2 - rw2 / 2, ry + k * 0.02],
              [W / 2 + rw2 / 2, ry + k * 0.02],
            ],
            shade(sc, rackC, 0.3),
            Math.max(1, k * 0.02),
            ra,
            false,
          )
        }
        if (P.score && env.pass === 'main') {
          const fs = Math.max(smallSize(env), k * 0.16)
          const lastY = H / 2 + (rows - 1 - (rows - 1) / 2) * k * 1.75 + k * 0.42 + k * 0.34
          const a = tin(env, 0.2, 0.3, E.outCubic) * out
          env.draw({
            text: 'SCORE',
            font: monoF(env),
            size: fs,
            track: 0.3,
            align: 'left',
            x: W / 2 - Math.min(per, n) * k * 0.54 - k * 0.25,
            y: lastY + fs * 1.6,
            color: sc.sub,
            alpha: a,
            ghost: false,
          })
          env.draw({
            text: String(score).padStart(3, '0'),
            font: monoF(env),
            size: fs * 1.5,
            track: 0.1,
            align: 'right',
            x: W / 2 + Math.min(per, n) * k * 0.54 + k * 0.25,
            y: lastY + fs * 1.6,
            color: score >= total && total > 0 ? sc.accent : sc.fg,
            alpha: a,
            ghost: false,
          })
        }
        return bb
      },
    },
    bulbs: {
      w: 0.8,
      tags: ['pop', 'emotional', 'graphic'],
      treat: 'safe',
      emph: 1.3,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 1.8, flicker: 1.6, pop: 1.2, blur: 0.6, slice: 0.3, wipe: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): BulbsParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        shape: rng.pick(['board', 'board', 'arrow', 'double']),
        chase: rng.pick(['chase', 'chase', 'alt', 'wave']),
        dir: rng.pick([1, -1]),
        sub: rng.chance(0.6),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BulbsParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 5 : 8)
        const o = { track: 0.06, lead: 1.12 }
        const arrow = P.shape === 'arrow' && !port
        const maxW = W * (arrow ? 0.62 : 0.72)
        const maxH = H * (port ? 0.36 : 0.42)
        const m100 = measure({ text, font: P.font, size: 100, ...o })
        const subT = P.sub ? altCopy(cut) : null
        const size = Math.min(
          fitSize(text, P.font, maxW, maxH, o),
          u * 0.24,
          (W * (arrow ? 0.8 : 0.9)) / (m100.w / 100 + 1.5),
          (H * 0.8) / (m100.h / 100 + 1.24 + (subT ? 0.3 : 0)),
        )
        const m = measure({ text, font: P.font, size, ...o })
        const ss = Math.max(smallSize(env), size * 0.16)
        const padX = size * 0.75
        const padY = size * 0.62
        const bw = m.w + padX * 2
        const bh = m.h + padY * 2 + (subT ? ss * 1.8 : 0)
        const ax = arrow ? bh * 0.42 * P.dir : 0
        const cx = W / 2 - ax / 2
        const cy = H / 2
        const x0 = cx - bw / 2
        const y0 = cy - bh / 2
        const out = tout(env)
        const q = E.outBack(clamp(lt / 0.35), 1.4) * (1 - 0.1 * E.inCubic(env.pOut))
        const dark = lum(sc.bg) < 0.4
        const board = dark ? mix(sc.bg, sc.fg, 0.1) : darkOf(sc)
        const bulbC =
          [sc.accent, lightOf(sc), sc.accent2].find((c) => c && contrast(c, board) >= 2) ||
          lightOf(sc)
        const textC =
          [lightOf(sc), sc.fg, sc.accent].find((c) => contrast(c, board) >= 3) || onCol(sc, board)
        // 招牌外轮廓
        let shape: Pt[]
        if (arrow) {
          const tip: Pt = P.dir > 0 ? [x0 + bw + bh * 0.5, cy] : [x0 - bh * 0.5, cy]
          shape =
            P.dir > 0
              ? [
                  [x0, y0],
                  [x0 + bw, y0],
                  [x0 + bw, y0 - bh * 0.12],
                  tip,
                  [x0 + bw, y0 + bh * 1.12],
                  [x0 + bw, y0 + bh],
                  [x0, y0 + bh],
                ]
              : [
                  [x0 + bw, y0],
                  [x0, y0],
                  [x0, y0 - bh * 0.12],
                  tip,
                  [x0, y0 + bh * 1.12],
                  [x0, y0 + bh],
                  [x0 + bw, y0 + bh],
                ]
        } else shape = rrPts(x0, y0, bw, bh, size * 0.3)
        const sp: Pt[] = shape.map(([x, y]) => [cx + (x - cx) * q, cy + (y - cy) * q])
        if (q <= 0.01 || out <= 0) return null
        env.poly(
          sp.map(([x, y]) => [x + u * 0.012, y + u * 0.016] as Pt),
          darkOf(sc),
          0.3 * out,
          false,
        )
        env.poly(sp, board, out, gIn(env))
        outline(env, sp, mix(board, bulbC, 0.35), Math.max(1.5, u * 0.003), out)
        // 沿边的灯泡（'double' 再多一圈）
        const rb = clamp(size * 0.075, 4, u * 0.022)
        const inset = (k: number): Pt[] => {
          if (arrow) return sp.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt)
          const d = size * 0.3 * (1 - k)
          return rrPts(
            x0 + d,
            y0 + d * (bh / bw),
            bw - d * 2,
            bh - d * 2 * (bh / bw),
            size * 0.3 * k,
          ).map(([x, y]) => [cx + (x - cx) * q, cy + (y - cy) * q] as Pt)
        }
        const rings = P.shape === 'double' && !arrow ? [0.95, 0.86] : [arrow ? 0.93 : 0.95]
        const beatFlash = env.beat && env.beat.since < 0.12 ? 1 : 0
        const step = Math.floor(env.ltb * 9)
        rings.forEach((k, ri) => {
          const pts = resample(inset(k), rb * 3.3, 140)
          const N = pts.length
          pts.forEach((p, i) => {
            const on0 =
              i / N < E.inOutCubic(clamp((lt - 0.1 - ri * 0.1) / 0.6)) &&
              i / N >= E.inCubic(env.pOut)
            let lit = 0
            if (on0) {
              const j = (i * P.dir + N * 4) % N
              if (P.chase === 'chase')
                lit = (j + (ri ? 0 : 1) - step + 300 * 3) % 3 === 0 ? 1 : 0.18
              else if (P.chase === 'alt') lit = (i + Math.floor(env.ltb * 3) + ri) % 2 ? 1 : 0.2
              else
                lit =
                  0.2 +
                  0.8 *
                    Math.pow(0.5 + 0.5 * Math.sin((i / N) * TAU * 3 - env.ltb * 5 * P.dir + ri), 2)
              lit = Math.max(lit, beatFlash)
            }
            const col = ri
              ? contrast(sc.accent2 || bulbC, board) > 2
                ? sc.accent2 || bulbC
                : bulbC
              : bulbC
            if (lit > 0.5) env.circle(p[0], p[1], rb * 2.1, col, null, 0, 0.16 * lit * out, false)
            env.circle(
              p[0],
              p[1],
              rb,
              lit > 0 ? mix(mix(board, col, 0.3), col, lit) : mix(board, col, 0.22),
              null,
              0,
              out,
              false,
            )
            if (lit > 0.5)
              env.circle(
                p[0] - rb * 0.25,
                p[1] - rb * 0.3,
                rb * 0.35,
                '#FFFFFF',
                null,
                0,
                0.7 * lit * out,
                false,
              )
          })
        })
        const ty = cy - (subT ? ss * 0.9 : 0)
        const bb = mainDraw(env, {
          text,
          font: P.font,
          size: size * Math.min(1, q),
          x: cx,
          y: ty,
          color: textC,
          noHold: plateHold(cut),
          ...o,
        })
        if (subT) {
          const fs = ss * Math.min(1, q)
          const t = subT.length > 28 ? subT.slice(0, 27) + '…' : subT
          const sz = Math.min(fs, fitSize(t, bodyF(env), bw - padX, ss * 1.2, { track: 0.18 }))
          env.draw({
            text: t,
            font: bodyF(env),
            size: sz,
            x: cx,
            y: cy + m.h / 2 + padY * 0.1,
            track: 0.18,
            color: bulbC,
            alpha: tin(env, 0.3, 0.3) * out,
            ghost: false,
          })
        }
        return bb
      },
    },

    ledScroll: {
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      treat: false,
      portrait: 1.1,
      fits: (n) => n >= 1 && n <= 24,
      enterBias: {
        cut: 4,
        flicker: 0.8,
        type: 0.4,
        blur: 0.2,
        slice: 0.1,
        wipe: 0.2,
        assemble: 0.1,
        scramble: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): LedScrollParams => ({
        font: rng.pick(['pixel', 'pixel', ...fontsOf(st, ['display', 'body'])]),
        col: rng.pick(['accent', 'accent', 'fg', 'accent2']),
        info: rng.pick(['top', 'bottom', 'none', 'bottom']),
        mods: rng.int(3, 6),
        y: rng.pick([0.5, 0.5, 0.42, 0.58]),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as LedScrollParams
        const u = U(env)
        const lt = env.lt
        const text = flat(cut.text)
        const n = glyphCount(text)
        if (!n) return null
        const out = tout(env)
        const fx0 = W * 0.03
        const fw = W * 0.94
        const adv0 = measure({ text, font: P.font, size: 100, track: 0.08 }).w / 100
        const size = clamp(
          ((fw - W * 0.04) * 0.9) / Math.max(0.5, adv0),
          u * 0.1,
          Math.min(u * 0.2, H * 0.2),
        )
        const p = size / 9.5
        const ph = size * 1.36
        const infoH = P.info === 'none' ? 0 : size * 0.56
        const fr = size * 0.2
        const fh = ph + infoH + fr * 2 + (infoH ? fr * 0.6 : 0)
        const fy0 = H * P.y - fh / 2
        const e = E.outCubic(clamp(lt / 0.35))
        const frameC = mix(darkOf(sc), sc.sub, lum(sc.bg) < 0.4 ? 0.25 : 0.2)
        const panel = mix(darkOf(sc), '#000000', 0.5)
        const ledC =
          [
            P.col === 'fg' ? lightOf(sc) : P.col === 'accent2' ? sc.accent2 : sc.accent,
            sc.accent,
            lightOf(sc),
          ].find((c) => c && contrast(c, panel) >= 3) || '#FFFFFF'
        const infoC =
          [sc.accent2, sc.accent, lightOf(sc)].find(
            (c) => c && c !== ledC && contrast(c, panel) >= 3,
          ) || lightOf(sc)
        const hw = (fw / 2) * e
        env.rrect(W / 2 - hw, fy0, hw * 2, fh, fr * 0.6, frameC, out, false)
        if (e < 0.05) return null
        // 模组接缝与螺栓
        const mods = P.mods
        const mw = fw / mods
        for (let i = 1; i < mods; i++) {
          const x = fx0 + i * mw
          if (Math.abs(x - W / 2) < hw)
            env.rect(x - 1, fy0, 2, fh, mix(frameC, '#000000', 0.35), out, false)
        }
        for (let i = 0; i < mods; i++)
          for (const yy of [fy0 + fr * 0.5, fy0 + fh - fr * 0.5])
            for (const xx of [fx0 + i * mw + fr * 0.6, fx0 + (i + 1) * mw - fr * 0.6])
              if (Math.abs(xx - W / 2) < hw)
                env.circle(xx, yy, fr * 0.14, mix(frameC, lightOf(sc), 0.3), null, 0, out, false)
        const panels: { x: number; y: number; w: number; h: number }[] = []
        const mainY = P.info === 'top' ? fy0 + fr + infoH + fr * 0.6 : fy0 + fr
        panels.push({ x: W / 2 - hw + fr, y: mainY, w: hw * 2 - fr * 2, h: ph })
        if (infoH)
          panels.push({
            x: W / 2 - hw + fr,
            y: P.info === 'top' ? fy0 + fr : mainY + ph + fr * 0.6,
            w: hw * 2 - fr * 2,
            h: infoH,
          })
        const snap = (v: number, q: number): number => Math.round(v / q) * q
        const T = Math.max(3, Math.round(p * (env.scale || 1)))
        const pat = (kind: string, col: string, bg: string, x0: number, y0: number) => {
          const tile = ledTile(kind, col, bg, T)
          const cp = ctx.createPattern(tile, 'repeat')
          if (!cp) return null
          try {
            cp.setTransform(new DOMMatrix().translate(x0, y0).scale(p / T))
          } catch {
            /* 老浏览器不支持 setTransform：这一层就不画 */
            return null
          }
          return cp
        }
        // 主面板画出的包围盒（数组包一层，绕开闭包赋值不被流分析跟踪的问题）
        const bbHeld: (BBox | null)[] = [null]
        panels.forEach((pn, pi) => {
          if (pn.w <= 2) return
          const gx = pn.x
          const gy = pn.y
          env.rect(pn.x, pn.y, pn.w, pn.h, panel, out, false)
          if (env.pass === 'main') {
            const pt = pat('dot', mix(panel, pi ? infoC : ledC, 0.13), '', gx, gy)
            if (pt) {
              ctx.save()
              ctx.globalAlpha = out
              ctx.fillStyle = pt
              ctx.fillRect(pn.x, pn.y, pn.w, pn.h)
              ctx.restore()
            }
          }
          ctx.save()
          ctx.beginPath()
          ctx.rect(pn.x, pn.y, pn.w, pn.h)
          ctx.clip()
          if (pi === 0) {
            const m = measure({ text, font: P.font, size, track: 0.08 })
            const fits = m.w <= pn.w * 0.94
            const cyy = pn.y + pn.h / 2
            if (fits) {
              const tIn = clamp(cut.dur * 0.28, 0.35, 0.9)
              const tOut = Math.max(0.2, cut.outDur || 0.3)
              const a = E.outCubic(clamp(lt / tIn))
              const b = E.inCubic(clamp((lt - (cut.dur - tOut)) / tOut))
              const x = lerp(pn.x + pn.w + m.w / 2, W / 2, a) - b * (W / 2 - pn.x + m.w / 2)
              bbHeld[0] = mainDraw(env, {
                text,
                font: P.font,
                size,
                x: snap(x, p),
                y: cyy,
                track: 0.08,
                color: ledC,
                plain: true,
                noHold: true,
              })
            } else {
              // 放不下就滚动
              const per = m.w + size * 2
              const v = Math.max(W * 0.35, per / Math.max(0.8, cut.dur * 0.9))
              const off = pn.x + pn.w - ((env.ltb * v) % per)
              for (let k = 0; k < 3; k++) {
                const x = off + m.w / 2 + k * per
                if (x - m.w / 2 > pn.x + pn.w || x + m.w / 2 < pn.x) continue
                const r0 = mainDraw(env, {
                  text,
                  font: P.font,
                  size,
                  x: snap(x, p),
                  y: cyy,
                  track: 0.08,
                  color: ledC,
                  plain: true,
                  noHold: true,
                  mi: 0,
                })
                bbHeld[0] = bbHeld[0] || r0
              }
            }
          } else if (env.pass === 'main') {
            const ac = altCopy(cut)
            const info = `LINE ${lineNo(cut)}  ◆  ${fmtTime(cut.start)}${/^No\./.test(ac) ? '' : '  ◆  ' + ac}   ◆   `
            const fs = pn.h * 0.72
            const im = measure({ text: info, font: P.font, size: fs, track: 0.1 })
            const off = (env.ltb * size * 2.2) % im.w
            for (let k = 0; k < 4; k++) {
              const x = snap(pn.x - off + k * im.w, p)
              if (x > pn.x + pn.w) break
              env.draw({
                text: info,
                font: P.font,
                size: fs,
                align: 'left',
                x,
                y: pn.y + pn.h / 2,
                track: 0.1,
                color: infoC,
                alpha: out * tin(env, 0.2, 0.3),
                ghost: false,
              })
            }
          }
          ctx.restore()
          // 把 LED 之间的空隙打回面板色
          if (env.pass === 'main') {
            const pt = pat('mask', '', panel, gx, gy)
            if (pt) {
              ctx.save()
              ctx.globalAlpha = out
              ctx.fillStyle = pt
              ctx.fillRect(pn.x, pn.y, pn.w, pn.h)
              ctx.restore()
            }
          }
        })
        const bb = bbHeld[0]
        return bb
          ? box(
              Math.max(panels[0].x, bb.x0),
              panels[0].y,
              Math.min(panels[0].x + panels[0].w, bb.x1),
              panels[0].y + panels[0].h,
            )
          : box(fx0, fy0, fx0 + fw, fy0 + fh)
      },
    },

    billboard: {
      w: 0.8,
      tags: ['pop', 'emotional', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { cut: 1.6, flicker: 1.5, blur: 1, pop: 0.8, slice: 0.4, wipe: 0.6 },
      plan: (rng: Rng, _cut, st: StylePack): BillboardParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        face: rng.pick(['light', 'light', 'accent']),
        lamps: rng.int(3, 4),
        sweep: rng.range(8, 16),
        tag: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BillboardParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 5 : 9)
        const out = tout(env)
        const bw = W * (port ? 0.86 : 0.72)
        const bh = Math.min(H * (port ? 0.3 : 0.42), bw * 0.5)
        const bx = W / 2 - bw / 2
        const by = H * (port ? 0.3 : 0.16)
        const groundY = H * 0.94
        const rise = (1 - E.outCubic(clamp(lt / 0.55))) * H * 0.08 + E.inCubic(env.pOut) * H * 0.05
        const y0 = by + rise
        const a0 = tin(env, 0, 0.35, E.outCubic) * out
        const steel = mix(darkOf(sc), sc.sub, 0.35)
        const faceC =
          P.face === 'accent' || lum(sc.bg) > 0.55
            ? lum(sc.bg) > 0.55
              ? [sc.accent, sc.ink, sc.fg].find((c) => contrast(c, sc.bg) >= 1.8) || sc.fg
              : plateCol(sc, [sc.accent, sc.ink])
            : mix(lightOf(sc), sc.accent, 0.06)
        const tc = onCol(sc, faceC)
        // 支柱、斜撑、检修道
        const pw = bw * 0.035
        for (const px of [bx + bw * 0.22, bx + bw * 0.78])
          env.rect(px - pw / 2, y0 + bh, pw, groundY - y0 - bh, steel, a0, false)
        const lw = Math.max(1.2, u * 0.0025)
        const x1 = bx + bw * 0.22
        const x2 = bx + bw * 0.78
        const yb = y0 + bh + (groundY - y0 - bh) * 0.25
        const yb2 = groundY - (groundY - y0 - bh) * 0.1
        env.line(
          [
            [x1, yb],
            [x2, yb2],
          ],
          steel,
          lw,
          a0,
          false,
        )
        env.line(
          [
            [x2, yb],
            [x1, yb2],
          ],
          steel,
          lw,
          a0,
          false,
        )
        const cwY = y0 + bh + bh * 0.1
        env.rect(bx + bw * 0.04, cwY, bw * 0.92, bh * 0.025, steel, a0, false)
        for (let i = 0; i <= 10; i++)
          env.rect(
            bx + bw * (0.04 + (0.92 * i) / 10) - lw / 2,
            cwY - bh * 0.07,
            lw,
            bh * 0.07,
            steel,
            a0 * 0.8,
            false,
          )
        env.line(
          [
            [bx + bw * 0.04, cwY - bh * 0.07],
            [bx + bw * 0.96, cwY - bh * 0.07],
          ],
          steel,
          lw,
          a0 * 0.8,
          false,
        )
        env.line(
          [
            [W * 0.03, groundY],
            [W * 0.97, groundY],
          ],
          sc.sub,
          lw,
          0.5 * a0,
          false,
        )
        // 牌面
        env.rect(bx - bw * 0.015, y0 - bw * 0.015, bw * 1.03, bh + bw * 0.03, steel, a0, false)
        env.rect(bx, y0, bw, bh, mix(faceC, darkOf(sc), 0.28), a0, gIn(env))
        // 投光灯：一盏盏点亮，光锥扫过牌面
        const L = P.lamps
        const lampOn: number[] = []
        for (let i = 0; i < L; i++) {
          const t1 = 0.15 + i * 0.12
          let on = lt > t1 + 0.25 ? 1 : lt > t1 ? (r(s, i, env.step, 7) < 0.55 ? 1 : 0.1) : 0
          on *= 1 - E.inCubic(clamp(env.pOut * 1.6 - i * 0.12))
          lampOn.push(on)
        }
        if (env.pass === 'main') {
          ctx.save()
          ctx.beginPath()
          ctx.rect(bx, y0, bw, bh)
          ctx.clip()
          for (let i = 0; i < L; i++) {
            if (lampOn[i] <= 0.01) continue
            const lx = bx + (bw * (i + 0.5)) / L
            const ly = y0 + bh + bh * 0.06
            const ang = (-90 + Math.sin(env.ltb * 0.8 + i * 1.7) * P.sweep) * DEG
            const tx = lx + Math.cos(ang) * bh * 1.25
            const ty = ly + Math.sin(ang) * bh * 1.25
            const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, bh * 1.2)
            g.addColorStop(0, rgba(faceC, 0.95 * lampOn[i]))
            g.addColorStop(0.6, rgba(faceC, 0.6 * lampOn[i]))
            g.addColorStop(1, rgba(faceC, 0))
            const spread = (bw / L) * 0.75
            ctx.fillStyle = g
            ctx.beginPath()
            ctx.moveTo(lx - bw * 0.02, ly)
            ctx.lineTo(tx - spread, ty)
            ctx.lineTo(tx + spread, ty)
            ctx.lineTo(lx + bw * 0.02, ly)
            ctx.closePath()
            ctx.fill()
          }
          const lit = lampOn.reduce((a, b) => a + b, 0) / L
          ctx.globalAlpha = 0.55 * lit * a0
          ctx.fillStyle = faceC
          ctx.fillRect(bx, y0, bw, bh)
          ctx.restore()
        }
        // 灯罩
        for (let i = 0; i < L; i++) {
          const lx = bx + (bw * (i + 0.5)) / L
          const ly = y0 + bh + bh * 0.06
          env.line(
            [
              [lx, cwY],
              [lx, ly + bh * 0.02],
            ],
            steel,
            lw * 1.5,
            a0,
            false,
          )
          env.poly(
            [
              [lx - bh * 0.05, ly + bh * 0.03],
              [lx + bh * 0.05, ly + bh * 0.03],
              [lx + bh * 0.035, ly - bh * 0.03],
              [lx - bh * 0.035, ly - bh * 0.03],
            ],
            steel,
            a0,
            false,
          )
          if (lampOn[i] > 0.5)
            env.circle(lx, ly - bh * 0.03, bh * 0.025, lightOf(sc), null, 0, a0, false)
        }
        const size = Math.min(
          fitSize(text, P.font, bw * 0.84, bh * 0.66, { track: 0.04, lead: 1.1 }),
          bh * 0.6,
        )
        const bb = mainDraw(env, {
          text,
          font: P.font,
          size,
          x: W / 2,
          y: y0 + bh / 2 + (P.tag ? bh * 0.03 : 0),
          track: 0.04,
          lead: 1.1,
          color: tc,
          noHold: plateHold(cut),
          mi: miAt(env, cut, 0.3),
        })
        if (P.tag) {
          const fs = Math.max(smallSize(env) * 0.8, bh * 0.05)
          env.draw({
            text: 'No.' + lineNo(cut),
            font: monoF(env),
            size: fs,
            align: 'left',
            track: 0.2,
            x: bx + bw * 0.025,
            y: y0 + fs * 1.1,
            color: tc,
            alpha: 0.7 * a0,
            ghost: false,
          })
          env.draw({
            text: fmtTime(cut.start),
            font: monoF(env),
            size: fs,
            align: 'right',
            track: 0.2,
            x: bx + bw * 0.975,
            y: y0 + fs * 1.1,
            color: tc,
            alpha: 0.7 * a0,
            ghost: false,
          })
        }
        return bb || box(bx, y0, bx + bw, y0 + bh)
      },
    },

    crowdBubbles: {
      w: 0.8,
      tags: ['pop', 'emotional', 'editorial'],
      busy: true,
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { cut: 1.8, pop: 1.6, blur: 0.8, slice: 0.3, wipe: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): CrowdBubblesParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        sf: rng.pick(fontsOf(st, ['body', 'display'])),
        big: rng.pick(['round', 'round', 'rect', 'shout']),
        style: rng.pick(['mixed', 'outline', 'filled']),
        count: rng.int(10, 16),
        side: rng.pick([1, -1]),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CrowdBubblesParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 5 : 8)
        const o = { track: 0.03, lead: 1.15 }
        const size = Math.min(
          fitSize(text, P.font, W * (port ? 0.62 : 0.46), H * (port ? 0.22 : 0.3), o),
          u * 0.15,
        )
        const m = measure({ text, font: P.font, size, ...o })
        const out = tout(env)
        const bw = m.w + size * 1.4
        const bh = m.h + size * 1.1
        const cx = W / 2
        const cy = H / 2 - bh * 0.05
        const bigC = [sc.accent, lightOf(sc)].find((c) => contrast(c, sc.bg) >= 1.8) || lightOf(sc)
        const tc = onCol(sc, bigC)
        // 人群气泡用的碎片
        const words: string[] = []
        for (const w of chunkText(flat(cut.lineText || cut.text)).concat(chunkText(flat(cut.text))))
          for (const q of splitLines(w, 4).split('\n')) if (q && !words.includes(q)) words.push(q)
        const frag = (i: number): string => {
          const k = hash(s, i, 41) % 10
          if (k < 6 && words.length) return words[hash(s, i, 42) % words.length]
          return REACT[hash(s, i, 43) % REACT.length]
        }
        // 大气泡周围的候选位
        const slots: [number, number, number][] = []
        const gxN = port ? 3 : 6
        const gyN = port ? 8 : 5
        for (let gy = 0; gy < gyN; gy++)
          for (let gx = 0; gx < gxN; gx++) {
            const x = W * (0.1 + (0.8 * (gx + 0.5)) / gxN) + rs(s, gx, gy, 1) * W * 0.04
            const y = H * (0.1 + (0.8 * (gy + 0.5)) / gyN) + rs(s, gx, gy, 2) * H * 0.03
            if (
              Math.abs(x - cx) < bw * 0.5 + W * (port ? 0.12 : 0.07) &&
              Math.abs(y - cy) < bh * 0.5 + H * (port ? 0.04 : 0.07)
            )
              continue
            slots.push([x, y, r(s, gx, gy, 3)])
          }
        slots.sort((a, b) => a[2] - b[2])
        const cnt = Math.min(P.count, slots.length)
        const ss = Math.max(smallSize(env) * 1.4, Math.min(size * 0.42, u * 0.05))
        const bubble = (
          x: number,
          y: number,
          w: number,
          h: number,
          kind: string,
          tailDir: number,
          fill: string | null,
          stroke: string | null,
          a: number,
          gh: boolean,
        ) => {
          let pts: Pt[]
          if (kind === 'rect') pts = rrPts(x - w / 2, y - h / 2, w, h, h * 0.35, 4)
          else {
            pts = []
            const N = kind === 'shout' ? 22 : 36
            for (let i = 0; i < N; i++) {
              const t = (i / N) * TAU
              const kk = kind === 'shout' ? (i % 2 ? 0.8 : 1.12) : 1
              pts.push([x + Math.cos(t) * (w / 2) * kk, y + Math.sin(t) * (h / 2) * kk])
            }
          }
          const tx = x + tailDir * w * 0.18
          const ty = y + h * 0.42
          const tail: Pt[] = [
            [tx - w * 0.06 * tailDir, ty - h * 0.05],
            [tx + w * 0.02 * tailDir, ty - h * 0.05],
            [tx - w * 0.1 * tailDir, y + h * 0.5 + h * 0.3],
          ]
          if (fill) {
            env.poly(pts, fill, a, gh)
            env.poly(tail, fill, a, gh)
          }
          if (stroke) {
            outline(env, pts, stroke, Math.max(1.2, u * 0.0025), a)
            env.line([tail[0], tail[2], tail[1]], stroke, Math.max(1.2, u * 0.0025), a, false)
            if (!fill) env.poly(tail, sc.bg, a, false)
          }
        }
        // 人群：每个气泡活一阵子、破掉，下一个补上
        if (env.pass === 'main') {
          const life = clamp(cut.dur * 0.7, 1.2, 3)
          const jx = ((W * 0.8) / gxN) * 0.18
          const jy = ((H * 0.8) / gyN) * 0.14
          for (let i = 0; i < cnt; i++) {
            const t0 = 0.05 + r(s, i, 5) * Math.min(0.6, cut.dur * 0.25)
            if (env.ltb < t0) continue
            const gen = Math.max(0, Math.floor((env.ltb - t0) / life))
            const tl = env.ltb - t0 - gen * life
            const e =
              E.outBack(clamp(tl / 0.22), 2.2) *
              (1 - E.inCubic(clamp((tl - life + 0.2) / 0.2))) *
              out
            if (e <= 0.01) continue
            const sl0 = slots[i]
            const sl: [number, number] = [
              sl0[0] + rs(s, i, gen, 44) * jx,
              sl0[1] + rs(s, i, gen, 45) * jy,
            ]
            const t = frag(i * 7 + gen)
            const fs = ss * rr(0.8, 1.15, s, i, gen)
            const tm = measure({ text: t, font: P.sf, size: fs, track: 0.04 })
            const w = (tm.w + fs * 1.4) * e
            const h = fs * 2 * e
            const filled = P.style === 'filled' || (P.style === 'mixed' && r(s, i, 9) < 0.45)
            const fcol = filled ? mix(sc.bg, sc.fg, 0.14) : null
            bubble(
              sl[0],
              sl[1],
              w,
              h,
              r(s, i, gen, 8) < 0.5 ? 'rect' : 'round',
              sl[0] < cx ? 1 : -1,
              fcol || sc.bg,
              filled ? null : sc.sub,
              0.95,
              false,
            )
            if (e > 0.5)
              env.draw({
                text: t,
                font: P.sf,
                size: fs,
                track: 0.04,
                x: sl[0],
                y: sl[1],
                color: filled ? sc.fg : sc.sub,
                alpha: clamp((e - 0.5) * 2),
                ghost: false,
              })
          }
        }
        // 装着歌词的大气泡
        const q = E.outBack(clamp((lt - 0.05) / 0.3), 1.8) * (1 - 0.2 * E.inCubic(env.pOut))
        const bk = P.big
        bubble(
          cx,
          cy,
          bw * q * (bk === 'shout' ? 1.25 : 1),
          bh * q * (bk === 'shout' ? 1.3 : 1),
          bk,
          P.side,
          bigC,
          null,
          out,
          gIn(env),
        )
        return mainDraw(env, {
          text,
          font: P.font,
          size: size * Math.min(1, q + 0.2),
          x: cx,
          y: cy,
          color: tc,
          noHold: plateHold(cut),
          mi: miAt(env, cut, 0.12),
          ...o,
        })
      },
    },

    crossword: {
      w: 0.7,
      tags: ['editorial', 'graphic', 'pop'],
      treat: 'safe',
      portrait: 0.7,
      fits: (n) => n >= 2 && n <= 16,
      enterBias: {
        cut: 3,
        type: 0.6,
        flicker: 0.6,
        blur: 0.4,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): CrosswordParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        dens: rng.range(0.14, 0.22),
        fill: rng.int(2, 3),
        clue: rng.chance(0.8),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CrosswordParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const chs = [...t0].filter((c) => c !== ' ')
        const n = chs.length
        if (!n) return null
        const maxRow = port ? 7 : 12
        const words =
          n > maxRow
            ? chunksK(t0, Math.ceil(n / maxRow)).map((w) => [...w].filter((c) => c !== ' '))
            : [chs]
        const L = Math.max(...words.map((w) => w.length))
        const C = Math.max(L + 2, port ? 7 : 9)
        const R = words.length > 1 ? 7 : port ? 7 : 5
        const below = P.clue && H > W * 0.7
        const clueW = P.clue && !below ? 0.24 : 0
        const cell = Math.min((W * (0.88 - clueW)) / C, (H * (below ? 0.64 : 0.8)) / R, u * 0.14)
        const gw = C * cell
        const gh = R * cell
        const fsC = Math.max(smallSize(env) * 1.15, cell * 0.24)
        const gx = (W - gw - (clueW ? W * clueW : 0)) / 2
        const gy = (H - gh - (below ? fsC * 5 : 0)) / 2
        const rowsW = words.length > 1 ? [1, 5] : [Math.floor(R / 2)]
        const c0 = words.map(
          (w) =>
            Math.floor((C - w.length) / 2) - (hash(s, w.length) % 2 && C - w.length > 2 ? 1 : 0),
        )
        const key = (row: number, col: number): number => row * 64 + col
        // 黑格：中心对称散布，但保留歌词行（含两端封口）
        const lyr = new Map<number, { ch: string; wi: number; j: number }>()
        words.forEach((w, wi) =>
          w.forEach((ch, j) => lyr.set(key(rowsW[wi], c0[wi] + j), { ch, wi, j })),
        )
        const black = new Set<number>()
        for (let row = 0; row < R; row++)
          for (let col = 0; col < C; col++) {
            const r2 = R - 1 - row
            const c2 = C - 1 - col
            if (lyr.has(key(row, col)) || lyr.has(key(r2, c2))) continue
            if (r(s, Math.min(key(row, col), key(r2, c2)), 3) < P.dens) {
              black.add(key(row, col))
              black.add(key(r2, c2))
            }
          }
        words.forEach((w, wi) => {
          const row = rowsW[wi]
          if (c0[wi] > 0) black.add(key(row, c0[wi] - 1))
          if (c0[wi] + w.length < C) black.add(key(row, c0[wi] + w.length))
        })
        const isW = (row: number, col: number): boolean =>
          row >= 0 && col >= 0 && row < R && col < C && !black.has(key(row, col))
        // 编号
        const num = new Map<number, number>()
        let k = 1
        for (let row = 0; row < R; row++)
          for (let col = 0; col < C; col++) {
            if (!isW(row, col)) continue
            const ac = !isW(row, col - 1) && isW(row, col + 1)
            const dn = !isW(row - 1, col) && isW(row + 1, col)
            if (ac || dn) num.set(key(row, col), k++)
          }
        // 铅笔填过的纵向词
        const pool = poolOf(cut)
        const NP = pool.length
        const pencil = new Map<number, string>()
        let fills = 0
        words.forEach((w, wi) =>
          w.forEach((_ch, j) => {
            if (fills >= P.fill * words.length || r(s, wi, j, 5) > 0.45) return
            const col = c0[wi] + j
            const row = rowsW[wi]
            let a = row
            let b = row
            while (isW(a - 1, col)) a--
            while (isW(b + 1, col)) b++
            if (b - a < 2) return
            fills++
            for (let rr0 = a; rr0 <= b; rr0++)
              if (!lyr.has(key(rr0, col)))
                pencil.set(key(rr0, col), pool[hash(s, rr0, col, 6) % NP])
          }),
        )
        const out = tout(env)
        const ga = tin(env, 0, 0.35, E.outCubic) * out
        const paperC = lightOf(sc)
        const inkC = darkOf(sc)
        const lw = Math.max(1, cell * 0.035)
        env.rect(gx - lw * 2, gy - lw * 2, gw + lw * 4, gh * ga + lw * 4, inkC, out, false)
        env.rect(gx, gy, gw, gh * ga, paperC, out, gIn(env))
        // 填写进度
        const T1 = 0.25
        const per = clamp((cut.dur * 0.4) / n, 0.04, 0.11)
        const typed = Math.floor((lt - T1) / per)
        let cur = -1
        const order: [number, number][] = []
        words.forEach((w, wi) => w.forEach((_ch, j) => order.push([wi, j])))
        if (typed >= 0 && typed < n) cur = typed
        const curWi = cur >= 0 ? order[cur][0] : -1
        for (let row = 0; row < R; row++) {
          const ra = clamp(ga * R - row)
          if (ra <= 0) continue
          for (let col = 0; col < C; col++) {
            const x = gx + col * cell
            const y = gy + row * cell
            const kk = key(row, col)
            if (black.has(kk)) {
              env.rect(x, y, cell, cell, inkC, ra * out, false)
              continue
            }
            const L0 = lyr.get(kk)
            if (L0 && (L0.wi === curWi || typed >= n))
              env.rect(x, y, cell, cell, sc.accent, (L0.wi === curWi ? 0.2 : 0.12) * out, false)
            if (L0 && order[cur] && order[cur][0] === L0.wi && order[cur][1] === L0.j)
              env.rect(x, y, cell, cell, sc.accent, 0.5 * out, false)
            env.line(
              [
                [x, y + cell],
                [x + cell, y + cell],
              ],
              inkC,
              lw * 0.6,
              0.55 * ra * out,
              false,
            )
            env.line(
              [
                [x + cell, y],
                [x + cell, y + cell],
              ],
              inkC,
              lw * 0.6,
              0.55 * ra * out,
              false,
            )
            const nv = num.get(kk)
            if (nv)
              env.draw({
                text: String(nv),
                font: monoF(env),
                size: cell * 0.2,
                align: 'left',
                x: x + cell * 0.07,
                y: y + cell * 0.15,
                color: inkC,
                alpha: 0.8 * ra * out,
                ghost: false,
              })
            const pc = pencil.get(kk)
            if (pc)
              env.draw({
                text: pc,
                font: bodyF(env),
                size: cell * 0.46,
                x: x + cell / 2,
                y: y + cell * 0.56,
                color: mix(paperC, inkC, 0.38),
                alpha: tin(env, 0.3 + row * 0.03, 0.3) * out,
                ghost: false,
              })
          }
        }
        let bb: BBox | null = null
        order.forEach(([wi, j], q) => {
          const ch = words[wi][j]
          const x = gx + (c0[wi] + j + 0.5) * cell
          const y = gy + (rowsW[wi] + 0.56) * cell
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: ch,
              font: P.font,
              size: cell * 0.7,
              x,
              y,
              color: inkC,
              noHold: plateHold(cut),
              mi: miAt(env, cut, T1 + q * per),
            }),
          )
        })
        if (P.clue) {
          const fs = fsC
          const cxl = below ? gx : gx + gw + W * 0.035
          const cyl = below ? gy + gh + fs * 1.6 : gy + fs
          const a = tin(env, 0.35, 0.4, E.outCubic) * out
          const n1 = num.get(key(rowsW[0], c0[0])) || 1
          const lines: [string, string, string][] = [
            ['横向', sc.accent, monoF(env)],
            [n1 + '  ' + (cut.note || romajiOf(cut) || '(' + n + ')'), sc.fg, bodyF(env)],
            ['纵向', sc.accent, monoF(env)],
            [(num.size > 3 ? 3 : 2) + '  ─', sc.sub, bodyF(env)],
          ]
          lines.forEach(([t, col, f], i) => {
            const tt = t.length > 22 ? t.slice(0, 21) + '…' : t
            const yy = below
              ? cyl + (i % 2) * fs * 1.7
              : cyl + i * fs * 1.9 + (i >= 2 ? fs * 0.8 : 0)
            const xx = below && i >= 2 ? cxl + gw * 0.55 : cxl
            env.draw({
              text: tt,
              font: f,
              size: fs,
              align: 'left',
              x: xx,
              y: yy,
              track: 0.08,
              color: col,
              alpha: a,
              ghost: false,
            })
          })
        }
        return bb || box(gx, gy, gx + gw, gy + gh)
      },
    },

    wordSearch: {
      w: 0.7,
      tags: ['pop', 'graphic', 'editorial'],
      treat: 'safe',
      fits: (n) => n >= 2 && n <= 14,
      enterBias: {
        cut: 3,
        flicker: 0.8,
        blur: 0.6,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.2,
        assemble: 0.3,
      },
      plan: (rng: Rng, cut, st: StylePack): WordSearchParams => {
        const port = cut.H > cut.W * 1.08
        const n = cut.n
        const dirs = ['h', 'h']
        if (port && n <= 14) dirs.push('v', 'v', 'v')
        if (n <= 8) dirs.push('d')
        return {
          font: rng.pick(fontsOf(st, ['display', 'body'])),
          gf: rng.pick(fontsOf(st, ['body', 'display'])),
          dir: rng.pick(dirs),
          decoys: rng.int(1, 3),
          pad: rng.int(1, 3),
        }
      },
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as WordSearchParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const chs = [...flat(cut.text)].filter((c) => c !== ' ')
        const n = chs.length
        if (!n) return null
        const port = isPort(env)
        let dir = P.dir
        if (dir === 'v' && n > 14) dir = 'h'
        if (dir === 'd' && n > 9) dir = 'h'
        let C: number
        let R: number
        if (dir === 'h') {
          C = n + P.pad * 2
          R = port ? Math.max(7, Math.round(C * 1.4)) : Math.max(5, Math.round(C * 0.5))
          if (port && C > 9) C = n + 1
        } else if (dir === 'v') {
          R = n + P.pad * 2
          C = Math.max(5, Math.round(R * (W / H) * 1.1))
        } else {
          C = n + 2
          R = n + 2
        }
        C = Math.min(C, 18)
        R = Math.min(
          R,
          18,
          Math.max(dir === 'v' ? n + 1 : dir === 'd' ? n : 5, Math.floor(150 / C)),
        )
        if (dir === 'v') C = Math.min(C, Math.max(5, Math.floor(150 / R)))
        const cell = Math.min((W * 0.86) / C, (H * 0.8) / R, u * 0.16)
        const gx = W / 2 - (C * cell) / 2
        const gy = H / 2 - (R * cell) / 2
        // 歌词所在路径
        let r0: number
        let c0: number
        let dr = 0
        let dc = 1
        if (dir === 'h') {
          r0 = Math.floor(R / 2) + (hash(s, 1) % 3) - 1
          c0 = Math.floor((C - n) / 2)
        } else if (dir === 'v') {
          dr = 1
          dc = 0
          c0 = Math.floor(C / 2) + (hash(s, 1) % 3) - 1
          r0 = Math.floor((R - n) / 2)
        } else {
          dr = 1
          dc = 1
          r0 = Math.floor((R - n) / 2)
          c0 = Math.floor((C - n) / 2)
        }
        r0 = clamp(r0, 0, R - 1 - dr * (n - 1))
        c0 = clamp(c0, 0, C - 1 - dc * (n - 1))
        const onPath = new Map<number, number>()
        chs.forEach((_ch, i) => onPath.set((r0 + dr * i) * 64 + (c0 + dc * i), i))
        const pool = poolOf(cut)
        const NP = pool.length
        const out = tout(env)
        const ga = tin(env, 0, 0.4, E.outCubic) * out
        const panelC = mix(sc.bg, sc.fg, lum(sc.bg) < 0.5 ? 0.06 : 0.05)
        env.rrect(
          gx - cell * 0.35,
          gy - cell * 0.35,
          C * cell + cell * 0.7,
          R * cell + cell * 0.7,
          cell * 0.3,
          panelC,
          ga,
          false,
          mix(sc.bg, sc.fg, 0.2),
          Math.max(1, u * 0.0018),
        )
        // 已经"找到"的词用的胶囊
        const cap = (
          ra: number,
          ca: number,
          rb: number,
          cb: number,
          col: string,
          a: number,
          stroke: boolean,
        ) => {
          const x1 = gx + (ca + 0.5) * cell
          const y1 = gy + (ra + 0.5) * cell
          const x2 = gx + (cb + 0.5) * cell
          const y2 = gy + (rb + 0.5) * cell
          const ang = Math.atan2(y2 - y1, x2 - x1)
          const len = Math.hypot(x2 - x1, y2 - y1)
          const rad = cell * 0.42
          ctx.save()
          ctx.translate(x1, y1)
          ctx.rotate(ang)
          env.rrect(
            -rad,
            -rad,
            len + rad * 2,
            rad * 2,
            rad,
            stroke ? null : col,
            a,
            false,
            stroke ? col : null,
            Math.max(1.5, cell * 0.06),
          )
          ctx.restore()
        }
        for (let d = 0; d < P.decoys; d++) {
          const rr0 = hash(s, d, 21) % R
          const len = 3 + (hash(s, d, 22) % 2)
          const cc = hash(s, d, 23) % Math.max(1, C - len)
          let clash = false
          for (let q = 0; q < len; q++) if (onPath.has(rr0 * 64 + cc + q)) clash = true
          if (clash) continue
          cap(rr0, cc, rr0, cc + len - 1, sc.sub, 0.5 * ga, true)
        }
        // 格子里的字母（一个文字项，字形按格子摆）
        if (env.pass === 'main' && ga > 0) {
          const gs = cell * 0.56
          if ('letterSpacing' in ctx) {
            // 每行一次 fillText：全角字正好推进一个 em，字距补成格子间距
            ctx.save()
            ctx.font = fontCSS(P.gf, gs)
            ctx.letterSpacing = (cell - gs).toFixed(2) + 'px'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = sc.sub
            for (let row = 0; row < R; row++) {
              const a = clamp(ga * (R + 2) - row) * 0.75 * out
              if (a <= 0.01) continue
              let row0 = ''
              for (let col = 0; col < C; col++)
                row0 += onPath.has(row * 64 + col) ? '\u3000' : pool[hash(s, row, col, 9) % NP]
              ctx.globalAlpha = a
              ctx.fillText(row0, gx + (cell - gs) / 2, gy + (row + 0.5) * cell)
            }
            ctx.restore()
          } else {
            const cellsTxt: string[] = []
            const pos: [number, number, number][] = []
            for (let row = 0; row < R; row++)
              for (let col = 0; col < C; col++) {
                if (onPath.has(row * 64 + col)) continue
                cellsTxt.push(pool[hash(s, row, col, 9) % NP])
                pos.push([gx + (col + 0.5) * cell, gy + (row + 0.5) * cell, row])
              }
            const it: TextItem = {
              text: cellsTxt.join(''),
              font: P.gf,
              size: gs,
              x: 0,
              y: 0,
              color: sc.sub,
              ghost: false,
              alpha: 0.75 * out,
            }
            it._lay = layoutText(it)
            it.charFn = (i, g) => {
              const q = pos[i]
              if (!q) return { hide: true }
              return { dx: q[0] - g.x, dy: q[1] - g.y, a: clamp(ga * (R + 2) - q[2]) }
            }
            env.draw(it)
          }
        }
        // 划线找词：胶囊沿歌词扫过，字被逐个点亮
        const T1 = 0.35
        const sweep = clamp(cut.dur * 0.3, 0.35, 0.8)
        const f = E.inOutCubic(clamp((lt - T1) / sweep)) * (1 - E.inCubic(clamp(env.pOut * 1.3)))
        if (f > 0) {
          const endI = (n - 1) * f
          cap(r0, c0, r0 + dr * endI, c0 + dc * endI, sc.accent, 0.3 * out, false)
          cap(r0, c0, r0 + dr * endI, c0 + dc * endI, sc.accent, out, true)
        }
        let bb: BBox | null = null
        chs.forEach((ch, i) => {
          const x = gx + (c0 + dc * i + 0.5) * cell
          const y = gy + (r0 + dr * i + 0.5) * cell
          const lit = clamp(((n > 1 ? f * (n - 1) : f) - i + 0.6) / 0.6)
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: ch,
              font: P.font,
              size: cell * (0.56 + 0.08 * lit),
              x,
              y,
              color: lit > 0.5 ? sc.fg : sc.sub,
              alpha: 0.75 + 0.25 * lit,
              noHold: plateHold(cut),
              mi: miAt(env, cut, 0.1 + i * 0.02),
            }),
          )
        })
        return bb || box(gx, gy, gx + C * cell, gy + R * cell)
      },
    },
    puzzle: {
      w: 0.8,
      tags: ['pop', 'graphic', 'emotional'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 16,
      enterBias: {
        cut: 3,
        blur: 0.5,
        pop: 0.4,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.2,
        assemble: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): PuzzleParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        plate: rng.pick(['accent', 'light', 'ink']),
        rows: rng.pick([2, 2, 3]),
        last: rng.chance(0.65),
        spread: rng.range(0.6, 1),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as PuzzleParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 5 : 8)
        const o = { track: 0.04, lead: 1.12 }
        const size = Math.min(fitSize(text, P.font, W * 0.7, H * (port ? 0.3 : 0.4), o), u * 0.22)
        const m = measure({ text, font: P.font, size, ...o })
        const bw = Math.min(W * 0.92, m.w + size * 1.3)
        const bh = Math.min(H * 0.8, m.h + size * 1.1)
        const x0 = W / 2 - bw / 2
        const y0 = H / 2 - bh / 2
        const R = P.rows
        const C = Math.max(2, Math.round((bw / bh) * R))
        const pw = bw / C
        const phh = bh / R
        const plate =
          P.plate === 'light'
            ? mix(lightOf(sc), sc.accent, 0.08)
            : plateCol(sc, P.plate === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
        const tc = onCol(sc, plate)
        const out = tout(env)
        const hS = (row: number, col: number): number => (hash(s, row, col, 1) & 1 ? 1 : -1)
        const vS = (row: number, col: number): number => (hash(s, row, col, 2) & 1 ? 1 : -1)
        const N = R * C
        const ord: number[] = []
        for (let i = 0; i < N; i++) ord.push(i)
        ord.sort((a, b) => r(s, a, 3) - r(s, b, 3))
        const rank = new Array<number>(N)
        ord.forEach((p, k) => {
          rank[p] = k
        })
        const fd = 0.42
        const span = clamp(cut.dur * 0.3, 0.3, 0.8)
        const tOf = (p: number): number => {
          const k = rank[p]
          if (P.last && k === N - 1) return 0.1 + span + 0.25
          return 0.06 + (N > 1 ? k / (N - 1) : 0) * span * (P.last ? 0.85 : 1)
        }
        const edges = (row: number, col: number): number[] => [
          row === 0 ? 0 : -hS(row - 1, col),
          col === C - 1 ? 0 : vS(row, col),
          row === R - 1 ? 0 : hS(row, col),
          col === 0 ? 0 : -vS(row, col - 1),
        ]
        const path = (g: CanvasRenderingContext2D, row: number, col: number): void => {
          const e = edges(row, col)
          jigPath(g, x0 + col * pw, y0 + row * phh, pw, phh, e[0], e[1], e[2], e[3])
        }
        const drawContent = (): BBox | null => {
          env.rect(x0 - pw * 0.4, y0 - phh * 0.4, bw + pw * 0.8, bh + phh * 0.8, plate, 1, false)
          return mainDraw(env, {
            text,
            font: P.font,
            size,
            x: W / 2,
            y: H / 2,
            color: tc,
            noHold: plateHold(cut),
            mi: 0,
            ...o,
          })
        }
        const settled: [number, number][] = []
        const moving: [number, number, number, number][] = []
        for (let row = 0; row < R; row++)
          for (let col = 0; col < C; col++) {
            const p = row * C + col
            const f = clamp((lt - tOf(p)) / fd)
            const fo = clamp(env.pOut * 1.5 - (rank[p] / N) * 0.5)
            if (f <= 0) continue
            if (f >= 1 && fo <= 0) settled.push([row, col])
            else moving.push([row, col, f, fo])
          }
        let bb: BBox | null = null
        const lw = Math.max(1, u * 0.0018)
        if (settled.length) {
          ctx.save()
          ctx.beginPath()
          for (const [row, col] of settled) path(ctx, row, col)
          ctx.clip()
          bb = drawContent()
          ctx.restore()
          if (env.pass === 'main') {
            ctx.save()
            ctx.beginPath()
            for (const [row, col] of settled) path(ctx, row, col)
            ctx.strokeStyle = mix(plate, darkOf(sc), 0.45)
            ctx.globalAlpha = 0.55 * out
            ctx.lineWidth = lw
            ctx.stroke()
            ctx.restore()
          }
        }
        if (env.pass === 'main') {
          for (const [row, col, f, fo] of moving) {
            const p = row * C + col
            const hx = x0 + (col + 0.5) * pw
            const hy = y0 + (row + 0.5) * phh
            const ang = r(s, p, 4) * TAU
            const dist = Math.hypot(W, H) * 0.45 * P.spread * (0.6 + 0.4 * r(s, p, 5))
            const sx = hx + Math.cos(ang) * dist
            const sy = hy + Math.sin(ang) * dist * 0.7
            const e = f < 1 ? E.outCubic(f) : 1
            const eo = E.inCubic(fo)
            const px = lerp(sx, hx, e) + (hx - W / 2) * eo * 1.4 + Math.cos(ang) * eo * dist * 0.5
            const py = lerp(sy, hy, e) + (hy - H / 2) * eo * 1.4 + Math.sin(ang) * eo * dist * 0.4
            const rot = (rs(s, p, 6) * 70 * (1 - e) + rs(s, p, 7) * 50 * eo) * DEG
            const lift = 1 + 0.08 * (1 - e) + 0.06 * eo
            const a = (1 - eo) * out
            if (a <= 0.01) continue
            ctx.save()
            ctx.translate(px + u * 0.012 * lift, py + u * 0.018 * lift)
            ctx.rotate(rot)
            ctx.scale(lift, lift)
            ctx.translate(-hx, -hy)
            ctx.globalAlpha = 0.3 * a
            ctx.fillStyle = darkOf(sc)
            ctx.beginPath()
            path(ctx, row, col)
            ctx.fill()
            ctx.restore()
            ctx.save()
            ctx.translate(px, py)
            ctx.rotate(rot)
            ctx.scale(lift, lift)
            ctx.translate(-hx, -hy)
            ctx.beginPath()
            path(ctx, row, col)
            ctx.save()
            ctx.clip()
            ctx.globalAlpha = a
            drawContent()
            ctx.globalAlpha = 1
            ctx.restore()
            ctx.strokeStyle = mix(plate, darkOf(sc), 0.4)
            ctx.lineWidth = lw
            ctx.globalAlpha = a
            ctx.stroke()
            ctx.restore()
          }
        }
        // 最后一块落下时闪一下
        if (P.last && N > 1) {
          const p = ord[N - 1]
          const tl = lt - tOf(p) - fd
          if (tl > 0 && tl < 0.35) {
            const row = Math.floor(p / C)
            const col = p % C
            const k = 1 - tl / 0.35
            ctx.save()
            ctx.beginPath()
            path(ctx, row, col)
            if (env.pass === 'main') {
              ctx.strokeStyle = onCol(sc, plate) === tc ? sc.accent : tc
              ctx.lineWidth = Math.max(2, u * 0.006) * k
              ctx.globalAlpha = k * out
              ctx.stroke()
            }
            ctx.restore()
          }
        }
        return bb || box(x0, y0, x0 + bw, y0 + bh)
      },
    },

    shadowPlay: {
      w: 0.9,
      tags: ['emotional', 'calm', 'graphic'],
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 1.2, blur: 1.3, drop: 1.2, pop: 0.6, slice: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): ShadowPlayParams => ({
        font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])),
        mode: rng.pick(['floor', 'floor', 'wall']),
        dir: rng.pick([1, -1]),
        sweep: rng.range(0.7, 1),
        sun: rng.chance(0.8),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ShadowPlayParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const out = tout(env)
        const dark = lum(sc.bg) < 0.45
        const text = brk(cut.text, port ? 5 : 9)
        const o = { track: 0.04, lead: 1.08 }
        const k = clamp(lt / Math.max(0.5, cut.dur), 0, 1)
        const shC = dark ? mix(sc.bg, '#000000', 0.55) : mix(darkOf(sc), sc.bg, 0.25)
        if (P.mode === 'floor') {
          // 日晷：太阳划过天空，地上的投影跟着转
          const size = Math.min(
            fitSize(text, P.font, W * 0.8, H * (port ? 0.22 : 0.3), o),
            u * 0.22,
          )
          const m = measure({ text, font: P.font, size, ...o })
          const yb = H * (port ? 0.56 : 0.6)
          const ty = yb - m.h / 2 - size * 0.04
          const fa = tin(env, 0, 0.5, E.outCubic) * out
          const floorC = mix(sc.bg, sc.fg, dark ? 0.13 : 0.07)
          env.rect(0, yb, W, (H - yb) * fa + 2, floorC, fa, false)
          env.line(
            [
              [W * 0.5 - W * 0.5 * fa, yb],
              [W * 0.5 + W * 0.5 * fa, yb],
            ],
            sc.sub,
            Math.max(1, u * 0.002),
            0.6,
            false,
          )
          const phi = lerp(74, 38, E.inOutSine(k)) * DEG * (0.85 + 0.15 * P.sweep) * P.dir
          if (P.sun) {
            const sr0 = u * 0.045
            const sr = sr0 * tin(env, 0.1, 0.5, E.outBack)
            const sx = W / 2 - Math.sin(phi) * W * 0.4
            let sy = yb - sr0 * 1.6 - (yb - H * 0.1) * Math.cos(phi) * 1.1
            if (Math.abs(sx - W / 2) < m.w / 2 + sr0 * 2.2)
              sy = Math.min(sy, ty - m.h / 2 - sr0 * 2.4)
            if (sr > 0) {
              env.circle(sx, sy, sr * 1.9, sc.accent, null, 0, 0.12 * out, false)
              env.circle(sx, sy, sr, sc.accent, null, 0, out, false)
              for (let i = 0; i < 10; i++) {
                const a = (i / 10) * TAU + env.ltb * 0.4
                env.line(
                  [
                    [sx + Math.cos(a) * sr * 1.35, sy + Math.sin(a) * sr * 1.35],
                    [sx + Math.cos(a) * sr * 1.75, sy + Math.sin(a) * sr * 1.75],
                  ],
                  sc.accent,
                  Math.max(1.5, sr * 0.1),
                  0.8 * out,
                  false,
                )
              }
            }
          }
          const sh = clamp(Math.tan(phi) * 0.75, -1.9, 1.9)
          const d = 0.3 + 0.3 * Math.abs(Math.sin(phi))
          const mS = [1, 0, sh, -d, -sh * yb, (1 + d) * yb]
          const base: TextItem = { text, font: P.font, size, x: W / 2, y: ty, mi: 0, ...o }
          if (env.pass === 'main') {
            ctx.save()
            ctx.beginPath()
            ctx.rect(-W, yb, W * 3, H * 2)
            ctx.clip()
            drawAff(env, { ...base, color: shC, alpha: 0.85, ghost: false, plain: true }, mS)
            // 投影的远端融进地面
            const g = ctx.createLinearGradient(0, yb, 0, yb + m.h * d * 1.15 + size * 0.1)
            g.addColorStop(0, rgba(floorC, 0))
            g.addColorStop(0.35, rgba(floorC, 0))
            g.addColorStop(1, rgba(floorC, 0.7))
            ctx.fillStyle = g
            ctx.fillRect(0, yb, W, H - yb)
            ctx.restore()
          }
          return mainDraw(env, { ...base, color: sc.fg })
        }
        // 墙面：身前的小灯在身后投出一个放大的软影子
        const size = Math.min(fitSize(text, P.font, W * 0.6, H * (port ? 0.2 : 0.26), o), u * 0.17)
        const tx = W / 2
        const ty = H * 0.5
        const lx = W / 2 + Math.sin(env.ltb * 0.45 + (P.dir > 0 ? 0 : 2)) * W * 0.16
        const ly = H * 0.86 + Math.sin(env.ltb * 1.7) * H * 0.006
        const kS = 1.42 + 0.1 * Math.sin(env.ltb * 0.6)
        const flick = 0.92 + 0.08 * r(cut.seed, env.step, 3)
        const la = tin(env, 0, 0.5, E.outCubic) * out
        if (env.pass === 'main' && la > 0) {
          const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.75)
          g.addColorStop(0, rgba(dark ? sc.accent : lightOf(sc), (dark ? 0.2 : 0.35) * flick * la))
          g.addColorStop(0.5, rgba(dark ? sc.accent : lightOf(sc), (dark ? 0.07 : 0.12) * la))
          g.addColorStop(1, rgba(sc.bg, 0))
          ctx.save()
          ctx.fillStyle = g
          ctx.fillRect(0, 0, W, H)
          ctx.restore()
        }
        const mS = [kS, 0, 0, kS, lx * (1 - kS), ly * (1 - kS)]
        const base: TextItem = { text, font: P.font, size, x: tx, y: ty, mi: 0, ...o }
        if (env.pass === 'main')
          drawAff(
            env,
            {
              ...base,
              color: shC,
              alpha: (dark ? 0.9 : 0.55) * la,
              blur: size * 0.04,
              ghost: false,
              plain: true,
            },
            mS,
          )
        // 灯
        const fr = u * 0.02
        env.circle(lx, ly, fr * 3.5, sc.accent, null, 0, 0.15 * la * flick, false)
        env.poly(
          [
            [lx, ly - fr * 2.2 * flick],
            [lx + fr * 0.8, ly - fr * 0.2],
            [lx, ly + fr * 0.6],
            [lx - fr * 0.8, ly - fr * 0.2],
          ],
          sc.accent,
          la,
          false,
        )
        env.rect(lx - fr * 0.9, ly + fr * 0.6, fr * 1.8, fr * 1.6, sc.sub, la, false)
        return mainDraw(env, { ...base, color: sc.fg })
      },
    },

    kaleido: {
      w: 0.8,
      tags: ['glitch', 'emotional', 'graphic'],
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 1.4, zoom: 1.4, spin: 1.3, blur: 1.2, slice: 0.3, wipe: 0.3 },
      plan: (rng: Rng, _cut, st: StylePack): KaleidoParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        N: rng.pick([6, 8, 8, 10, 12]),
        speed: rng.range(4, 10) * rng.pick([1, -1]),
        flow: rng.range(0.15, 0.3),
        center: rng.pick(['disc', 'disc', 'band']),
        tint: rng.pick(['sub', 'accent', 'mixed']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as KaleidoParams
        const u = U(env)
        const lt = env.lt
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const unit = n > 5 ? chunksK(t0, Math.ceil(n / 4))[0] : t0
        const cx = W / 2
        const cy = H / 2
        const N = P.N
        const al = TAU / N
        const Rr = Math.hypot(W, H) * 0.56
        const out = tout(env)
        const e = E.outCubic(clamp(lt / 0.6))
        const rot0 = (env.ltb * P.speed + (1 - e) * 60) * DEG
        const cols =
          P.tint === 'accent'
            ? [sc.accent, sc.sub, sc.sub]
            : P.tint === 'mixed'
              ? [sc.sub, sc.accent, sc.sub, sc.accent2 || sc.sub]
              : [sc.sub, mix(sc.sub, sc.bg, 0.4)]
        if (env.pass === 'main' && e > 0) {
          const M = 4
          const spacing = 1 / M
          const ph = (env.ltb * P.flow) % spacing
          for (let w = 0; w < N; w++) {
            const a0 = rot0 + w * al
            ctx.save()
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + Math.cos(a0) * Rr, cy + Math.sin(a0) * Rr)
            ctx.lineTo(cx + Math.cos(a0 + al) * Rr, cy + Math.sin(a0 + al) * Rr)
            ctx.closePath()
            ctx.clip()
            ctx.translate(cx, cy)
            ctx.rotate(a0 + al / 2)
            if (w % 2) ctx.scale(1, -1)
            for (let j = 0; j < M + 1; j++) {
              const f = j * spacing + ph // 0..1 的半径比例，向外流动
              const rad = Rr * (0.12 + f * 0.95)
              const sz = rad * Math.tan(al / 2) * 1.2
              const a = Math.min(1, f * 4) * (1 - f * 0.55) * out * e
              if (a <= 0.02 || sz < 4) continue
              env.draw({
                text: unit,
                font: P.font,
                size: Math.min(sz, rad * 0.5),
                x: rad,
                y: 0,
                rot: 90,
                color: cols[(j + w) % cols.length],
                alpha: a * 0.5,
                ghost: false,
              })
            }
            env.line(
              [
                [Rr * 0.1, 0],
                [Rr, 0],
              ],
              sc.dim,
              1,
              0.5 * out * e,
              false,
            )
            ctx.restore()
          }
        }
        // 中心：歌词放在圆盘或横带上
        const disc = P.center === 'disc' && n <= (isPort(env) ? 8 : 9)
        const text = disc ? brk(t0, n <= 4 ? 4 : Math.ceil(n / 2)) : brk(t0, isPort(env) ? 5 : 8)
        const o = { track: 0.03, lead: 1.1 }
        let size: number
        if (disc) {
          const Rc = Math.min(W, H) * (n > 5 ? 0.36 : 0.3)
          size = Math.min(fitSize(text, P.font, Rc * 1.55, Rc * 1.2, o), u * 0.16)
          const q = E.outBack(clamp(lt / 0.4), 1.5) * (1 - 0.3 * E.inCubic(env.pOut))
          env.circle(cx, cy, Rc * q, sc.bg, null, 0, out, false)
          env.circle(cx, cy, Rc * q, null, sc.accent, Math.max(2, u * 0.004), out, false)
          env.circle(cx, cy, Rc * q * 1.06, null, sc.sub, 1, 0.6 * out, false)
        } else {
          size = Math.min(fitSize(text, P.font, W * 0.84, H * 0.26, o), u * 0.18)
          const m = measure({ text, font: P.font, size, ...o })
          const bh = (m.h + size * 0.6) * E.outExpo(clamp(lt / 0.4)) * (1 - E.inCubic(env.pOut))
          env.rect(0, cy - bh / 2, W, bh, sc.bg, 1, false)
          env.line(
            [
              [0, cy - bh / 2],
              [W, cy - bh / 2],
            ],
            sc.accent,
            Math.max(2, u * 0.003),
            out,
            false,
          )
          env.line(
            [
              [0, cy + bh / 2],
              [W, cy + bh / 2],
            ],
            sc.accent,
            Math.max(2, u * 0.003),
            out,
            false,
          )
        }
        return mainDraw(env, { text, font: P.font, size, x: cx, y: cy, color: sc.fg, ...o })
      },
    },

    dominoes: {
      w: 0.7,
      tags: ['pop', 'graphic'],
      treat: 'safe',
      portrait: 0.7,
      fits: (n) => n >= 2 && n <= 14,
      enterBias: {
        cut: 3,
        blur: 0.5,
        pop: 0.6,
        slice: 0.2,
        wipe: 0.2,
        stretch: 0.2,
        drop: 0.5,
      },
      plan: (rng: Rng, _cut, st: StylePack): DominoesParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        face: rng.pick(['light', 'light', 'ink']),
        pips: rng.chance(0.8),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as DominoesParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const n = glyphCount(cut.text)
        if (n < 1) return null
        const port = isPort(env)
        const rowsD = rowsOf(cut.text, port ? 5 : n <= 7 ? 7 : Math.ceil(n / 2))
        const rows = rowsD.length
        const per = Math.max(...rowsD.map((row) => row.length))
        const asp = P.pips ? 1.9 : 1.45
        const gapK = 0.5
        const w = Math.min(
          (W * 0.84) / (per + (per - 1) * gapK),
          (H * 0.72) / (rows * asp + (rows - 1) * 0.35),
          u * 0.2,
        )
        const h = w * asp
        const g = w * gapK
        const out = tout(env)
        const faceC =
          P.face === 'ink' ? plateCol(sc, [sc.ink, sc.fg]) : mix(lightOf(sc), sc.accent, 0.06)
        const tc = onCol(sc, faceC)
        const sideC = shade(sc, faceC, -0.35)
        const pipC = mix(faceC, tc, 0.7)
        const thick = w * 0.12
        const lean = Math.asin(clamp((g - thick * 0.2) / h, 0, 0.95)) / DEG
        const T0 = 0.1
        const dT = clamp((cut.dur * 0.3) / n, 0.04, 0.09)
        const rise = 0.26
        const outDur = Math.max(0.3, Math.min(cut.dur * 0.35, (cut.outDur || 0.3) + 0.25))
        const oStart = cut.dur - outDur
        let bb: BBox | null = null
        let gi = 0
        for (let row = 0; row < rows; row++) {
          const rowT = rowsD[row]
          const cnt = rowT.length
          const yF = H / 2 + (row - (rows - 1) / 2) * (h + w * 0.35) + h / 2
          env.line(
            [
              [W / 2 - (cnt * (w + g)) / 2 - w * 0.4, yF],
              [W / 2 + (cnt * (w + g)) / 2 + w * 0.4, yF],
            ],
            sc.sub,
            Math.max(1, u * 0.0018),
            0.5 * tin(env, 0, 0.3) * out,
            false,
          )
          for (let j = 0; j < cnt; j++) {
            if (rowT[j] === ' ') continue
            const i = gi++
            const xc = W / 2 + (j - (cnt - 1) / 2) * (w + g)
            // 从左边一路立起来，收尾时往右连锁倒下
            const ti = T0 + i * dT
            const fu = clamp((lt - ti) / rise)
            let th = 0
            let pivot = 0
            if (fu < 1) {
              th = -(j === 0 ? 88 : lean) * (1 - E.outBack(fu, 1.6))
              pivot = -1
            }
            const fo = (lt - oStart - j * 0.05) / 0.3
            if (fo > 0) {
              th = (j === cnt - 1 ? 88 : lean) * E.inQuad(Math.min(1, fo))
              pivot = 1
            }
            const px = xc + (pivot * w) / 2
            const py = yF
            const ca = Math.cos(th * DEG)
            const sa = Math.sin(th * DEG)
            const M = [ca, sa, -sa, ca, px - (ca * pivot * w) / 2, py - (sa * pivot * w) / 2]
            // 骨牌角（原点在牌底中点）
            const T = (x: number, y: number): Pt => [
              M[0] * x + M[2] * y + M[4],
              M[1] * x + M[3] * y + M[5],
            ]
            const vis =
              clamp((lt - ti + 0.08) / 0.1) * (1 - E.inCubic(clamp((env.pOut - 0.7) / 0.3)))
            if (vis <= 0) continue
            env.poly(
              [
                T(-w / 2, 0),
                T(w / 2, 0),
                T(w / 2 + w * 0.1, w * 0.04),
                T(-w / 2 + w * 0.1, w * 0.04),
              ],
              darkOf(sc),
              0.25 * vis,
              false,
            )
            env.poly(
              [
                T(w / 2, -h + thick * 0.4),
                T(w / 2 + thick, -h + thick * 0.4 + thick * 0.3),
                T(w / 2 + thick, thick * 0.3),
                T(w / 2, 0),
              ],
              sideC,
              vis,
              false,
            )
            ctx.save()
            ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5])
            env.rrect(-w / 2, -h, w, h, w * 0.1, faceC, vis, gIn(env))
            if (P.pips) {
              env.line(
                [
                  [-w * 0.36, -h * 0.47],
                  [w * 0.36, -h * 0.47],
                ],
                mix(faceC, tc, 0.45),
                Math.max(1, w * 0.03),
                vis,
                false,
              )
              const pn = hash(s, i, 11) % 7
              const pr = w * 0.07
              for (const [a, b] of PIPS[pn])
                env.circle(a * w * 0.22, -h * 0.235 + b * w * 0.22, pr, pipC, null, 0, vis, false)
            }
            ctx.restore()
            const cyT = P.pips ? -h * 0.735 : -h / 2
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: rowT[j],
                  font: P.font,
                  size: w * 0.7,
                  x: 0,
                  y: cyT,
                  color: tc,
                  alpha: vis,
                  noHold: plateHold(cut),
                  mi: miAt(env, cut, ti),
                },
                M,
              ),
            )
          }
        }
        return bb
      },
    },

    burst: {
      w: 0.8,
      tags: ['pop', 'graphic', 'emotional'],
      treat: 'safe',
      emph: 1.6,
      fits: (n) => n >= 1 && n <= 12,
      enterBias: {
        cut: 1.6,
        pop: 1.6,
        zoom: 1.4,
        blur: 0.5,
        slice: 0.3,
        wipe: 0.3,
        type: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): BurstParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        spikes: rng.int(13, 19),
        sharp: rng.range(0.66, 0.78),
        tilt: rng.range(-9, 9),
        lines: rng.chance(0.75),
        debris: rng.chance(0.8),
        order: rng.pick(['accent', 'ink']),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BurstParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 4 : 6)
        const o = { track: 0.02, lead: 1.05 }
        const rxM = W * 0.355
        const ryM = Math.min(H * 0.355, rxM * (port ? 1.5 : 1.1))
        const size = Math.min(fitSize(text, P.font, rxM * 1.08, ryM, o), u * 0.24)
        const m = measure({ text, font: P.font, size, ...o })
        const rx = Math.min(rxM, m.w / 2 / 0.54 + size * 0.15)
        const ry = Math.min(ryM, Math.max(m.h / 2 / 0.54 + size * 0.15, rx * 0.55))
        const cx = W / 2
        const cy = H / 2
        const out = tout(env)
        const q =
          E.outBack(clamp(lt / 0.3), 2.2) *
          (1 - 0.6 * E.inCubic(env.pOut)) *
          (1 + 0.015 * Math.sin(env.ltb * 7) * clamp(lt - 0.3))
        const rot =
          (P.tilt + (1 - E.outCubic(clamp(lt / 0.3))) * -25 + E.inCubic(env.pOut) * 20) * DEG
        // 每 3 帧换一次抖动种子 = 手绘"沸腾"线
        const boil = Math.floor(env.step / 3)
        const A = plateCol(sc, P.order === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
        const B =
          [darkOf(sc), lightOf(sc), sc.bg, sc.fg].find((c) => contrast(c, A) >= 2.2 && c !== A) ||
          onCol(sc, A)
        const star = (k: number, scale: number, jit: number): Pt[] => {
          const N = P.spikes
          const pts: Pt[] = []
          for (let i = 0; i < N * 2; i++) {
            const a = (i / (N * 2)) * TAU + rot
            const rad = i % 2 ? P.sharp + rs(s, i, k, boil) * 0.04 : 1 + r(s, i, k, boil) * jit
            pts.push([
              cx + Math.cos(a) * rx * rad * scale * q,
              cy + Math.sin(a) * ry * rad * scale * q,
            ])
          }
          return pts
        }
        // 冲击环 + 速度线 + 碎屑
        const ring = clamp(lt / 0.45)
        if (ring < 1)
          env.circle(
            cx,
            cy,
            Math.max(rx, ry) * (0.6 + ring * 1.1),
            null,
            A,
            Math.max(2, u * 0.012) * (1 - ring),
            (1 - ring) * out,
            false,
          )
        if (P.lines && env.pass === 'main') {
          const Ln = 28
          for (let i = 0; i < Ln; i++) {
            if (r(s, i, env.step, 9) < 0.3) continue
            const a = (i / Ln) * TAU + rs(s, i, 8) * 0.08
            const r0 = 1.25 + r(s, i, env.step, 10) * 0.15
            const r1 = r0 + 0.2 + r(s, i, 11) * 0.25
            env.line(
              [
                [cx + Math.cos(a) * rx * r0 * q, cy + Math.sin(a) * ry * r0 * q],
                [cx + Math.cos(a) * rx * r1 * q, cy + Math.sin(a) * ry * r1 * q],
              ],
              sc.sub,
              Math.max(1.5, u * 0.004),
              0.7 * out,
              false,
            )
          }
        }
        if (P.debris && lt < 0.9) {
          for (let i = 0; i < 12; i++) {
            const a = r(s, i, 21) * TAU
            const sp = rr(0.5, 1.1, s, i, 22)
            const f = E.outCubic(clamp(lt / 0.8))
            const d = 1.05 + f * 0.6 * sp
            const x = cx + Math.cos(a) * rx * d
            const y = cy + Math.sin(a) * ry * d + f * f * H * 0.05
            const sz = u * 0.018 * (1 - f)
            const ang = r(s, i, 23) * TAU + f * 6
            if (sz > 0.5)
              env.poly(
                [
                  [x + Math.cos(ang) * sz, y + Math.sin(ang) * sz],
                  [x + Math.cos(ang + 2.2) * sz, y + Math.sin(ang + 2.2) * sz],
                  [x + Math.cos(ang + 4.1) * sz * 0.7, y + Math.sin(ang + 4.1) * sz * 0.7],
                ],
                i % 2 ? A : B,
                out,
                false,
              )
          }
        }
        if (q <= 0.01) return null
        env.poly(
          star(1, 1.12, 0.22).map(([x, y]) => [x + u * 0.012, y + u * 0.016] as Pt),
          darkOf(sc),
          0.3 * out,
          false,
        )
        env.poly(star(1, 1.12, 0.22), A, out, gIn(env))
        env.poly(star(2, 0.93, 0.12), B, out, false)
        env.poly(star(3, 0.86, 0.08), A, out, false)
        return mainDraw(env, {
          text,
          font: P.font,
          size: size * Math.min(1, q),
          x: cx,
          y: cy,
          rot: (rot / DEG) * 0.6,
          color: onCol(sc, A),
          ...o,
        })
      },
    },

    fisheye: {
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      portrait: 0.7,
      fits: (n) => n >= 3 && n <= 16,
      enterBias: { cut: 1.4, blur: 1.2, pop: 1, slice: 0.4, wipe: 0.6, type: 0.8 },
      plan: (rng: Rng, _cut, st: StylePack): FisheyeParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        mode: rng.pick(['sweep', 'sweep', 'pingpong']),
        glass: rng.pick(['lens', 'lens', 'grid', 'none']),
        amp: rng.range(0.7, 1.1),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as FisheyeParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const rowsT = n > (port ? 6 : 10) ? chunksK(t0, port ? Math.ceil(n / 6) : 2) : [t0]
        const nR = rowsT.length
        const A = P.amp
        let s0 = u * 0.16
        for (const row of rowsT) {
          let a = 0
          for (const ch of row) a += adv(P.font, ch)
          s0 = Math.min(s0, (W * 0.84) / (a + A * 1.6))
        }
        s0 = Math.min(s0, (H * 0.6) / (nR * (1.4 + A * 0.5)))
        const sig = s0 * 1.25
        const out = tout(env)
        // 镜片位置：整段一次扫过（sweep）或每行来回（pingpong）
        const T = clamp((lt - 0.2) / Math.max(0.4, cut.dur - 0.5))
        const lensIn = E.outCubic(clamp((lt - 0.1) / 0.4)) * (1 - E.inCubic(env.pOut))
        let bb: BBox | null = null
        // 镜片当前位置（数组包一层，绕开闭包赋值不被流分析跟踪的问题）
        const lens: ({ x: number; y: number; r: number; k: number } | null)[] = [null]
        rowsT.forEach((row, ri) => {
          const chars = [...row]
          const base = chars.map((ch) => adv(P.font, ch) * s0)
          const tot0 = base.reduce((a, b) => a + b, 0)
          const cy = H / 2 + (ri - (nR - 1) / 2) * s0 * (1.35 + A * 0.55)
          const xL = W / 2 - tot0 / 2
          let lx: number | null
          if (P.mode === 'sweep') {
            const f = T * nR - ri
            lx = f < 0 || f > 1 ? null : xL - sig + (tot0 + sig * 2) * E.inOutSine(f)
          } else lx = xL + tot0 * (0.5 - 0.5 * Math.cos(env.ltb * 1.6 + ri * 1.3))
          // 按静止位置上的隆起缩放每个字，再绕中心重新排这一行
          let acc = 0
          const ks = base.map((wd, _i) => {
            const x = xL + acc + wd / 2
            acc += wd
            return lx == null ? 1 : 1 + A * lensIn * Math.exp(-Math.pow((x - lx) / sig, 2))
          })
          const widths = base.map((wd, i) => wd * ks[i])
          const tot = widths.reduce((a, b) => a + b, 0)
          let x = W / 2 - tot / 2
          if (lx != null) {
            // 重排之后让镜片正好压在最鼓的那个字上
            let acc2 = 0
            let best = 0
            let bw = 0
            base.forEach((_wd, i) => {
              if (ks[i] > bw) {
                bw = ks[i]
                best = i
              }
            })
            widths.forEach((wd, i) => {
              if (i < best) acc2 += wd
            })
            lens[0] = {
              x: x + acc2 + widths[best] / 2,
              y: cy,
              r: s0 * (0.5 + 0.5 * bw) * 0.95,
              k: bw,
            }
          }
          chars.forEach((ch, i) => {
            const wd = widths[i]
            const gx = x + wd / 2
            x += wd
            if (ch === ' ') return
            const k = ks[i]
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: ch,
                font: P.font,
                size: s0 * k,
                x: gx,
                y: cy,
                color: k > 1.35 ? sc.accent : sc.fg,
                mi: ri * 3 + i * 0.5,
              }),
            )
          })
          if (P.glass === 'grid' && lx != null && env.pass === 'main') {
            const gp = s0 * 0.5
            const lw = Math.max(1, u * 0.0012)
            const warp = (px: number, py: number): Pt => {
              const dx = px - lx
              const dy = py - cy
              const rr0 = Math.hypot(dx, dy)
              const f = 1 + 0.9 * A * lensIn * Math.exp(-Math.pow(rr0 / (sig * 1.4), 2))
              return [lx + dx * f, cy + dy * f]
            }
            for (let k = -3; k <= 3; k++) {
              const pts: Pt[] = []
              for (let q = -12; q <= 12; q++) pts.push(warp(lx + q * gp * 0.5, cy + k * gp))
              env.line(pts, sc.sub, lw, 0.35 * out * lensIn, false)
            }
            for (let k = -6; k <= 6; k++) {
              const pts: Pt[] = []
              for (let q = -6; q <= 6; q++) pts.push(warp(lx + k * gp, cy + q * gp * 0.5))
              env.line(pts, sc.sub, lw, 0.35 * out * lensIn, false)
            }
          }
        })
        const lensPos = lens[0]
        if (P.glass === 'lens' && lensPos && lensIn > 0.01) {
          const { x, y } = lensPos
          const R = Math.max(lensPos.r * 1.25, s0 * 1.05)
          const lw = Math.max(2, u * 0.005)
          env.circle(x, y, R, lightOf(sc), null, 0, 0.06 * lensIn, false)
          env.circle(x, y, R, null, sc.sub, lw, lensIn, false)
          env.arc(x, y, R * 0.8, 200, 250, lightOf(sc), lw * 0.8, 0.7 * lensIn, false)
          const a = 50 * DEG
          env.line(
            [
              [x + Math.cos(a) * R, y + Math.sin(a) * R],
              [x + Math.cos(a) * R * 1.75, y + Math.sin(a) * R * 1.75],
            ],
            sc.sub,
            lw * 2.6,
            lensIn,
            false,
          )
        }
        return bb
      },
    },
    wall: {
      w: 0.8,
      tags: ['graphic', 'editorial', 'emotional'],
      busy: true,
      portrait: 0.6,
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { cut: 1.6, blur: 1.2, wipe: 1, slice: 0.5, pop: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): WallParams => ({
        font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])),
        side: rng.pick([1, -1]),
        yaw: rng.range(36, 46),
        orbit: rng.range(8, 14),
        stripe: rng.chance(0.7),
        eye: rng.range(-0.06, 0.06),
        tone: rng.pick(['plate', 'plain']),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as WallParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const side = P.side || 1 // +1：歌词在右墙
        const out = tout(env)
        const fl = Math.max(W, H) * 1.05
        const D = fl
        const a0 = E.outCubic(clamp(lt / 0.9))
        const yaw =
          (P.yaw +
            (1 - a0) * P.orbit * 2.2 +
            Math.sin(env.ltb * 0.35) * P.orbit * 0.15 +
            E.inCubic(env.pOut) * P.orbit * 1.5) *
          DEG
        // 歌词墙从阴角朝 side 方向延伸，另一面墙朝反方向
        const dL: [number, number] = [side * Math.sin(yaw), Math.cos(yaw)]
        const dO: [number, number] = [-side * Math.cos(yaw), Math.sin(yaw)]
        const ccx = W / 2 - side * W * (port ? 0.3 : 0.22)
        const ccy = H * (0.5 + P.eye)
        const prj = (X: number, Y: number, Z: number): Pt => [
          ccx + (fl * X) / Z,
          ccy + (fl * Y) / Z,
        ]
        const Ht = H * (port ? 0.26 : 0.4)
        const Hb = H * (port ? 0.2 : 0.34)
        const LL = D * (port ? 1.5 : 1.15)
        const LO = D * 1.2
        const at = (d: [number, number], sv: number, Y: number): [number, number, number] => [
          d[0] * sv,
          Y,
          D + d[1] * sv,
        ]
        const face = (d: [number, number], L: number, y0: number, y1: number): Pt[] => [
          prj(...at(d, 0, y0)),
          prj(...at(d, L, y0)),
          prj(...at(d, L, y1)),
          prj(...at(d, 0, y1)),
        ]
        const wa = tin(env, 0, 0.5, E.outCubic) * out
        const plate =
          P.tone === 'plate'
            ? plateCol(sc, [sc.ink, sc.fg])
            : mix(sc.bg, sc.fg, lum(sc.bg) < 0.5 ? 0.1 : 0.07)
        const litW = shade(sc, plate, 0.06)
        const dimW = shade(sc, plate, -0.3)
        const tc = P.tone === 'plate' ? onCol(sc, plate) : sc.fg
        // 地面 + 地平线
        env.rect(0, ccy, W, H - ccy, mix(sc.bg, darkOf(sc), 0.35), 0.5 * wa, false)
        env.line(
          [
            [0, ccy],
            [W, ccy],
          ],
          sc.sub,
          1,
          0.25 * wa,
          false,
        )
        env.poly(face(dO, LO * wa, -Ht, Hb), dimW, out, false)
        env.poly(face(dL, LL * wa, -Ht, Hb), litW, out, false)
        const lw = Math.max(1, u * 0.0016)
        env.line([prj(0, -Ht, D), prj(0, Hb, D)], mix(litW, darkOf(sc), 0.3), lw * 1.5, out, false)
        if (P.stripe)
          for (const [d, L] of [
            [dL, LL],
            [dO, LO],
          ] as [[number, number], number][])
            env.poly(face(d, L * wa, Hb * 0.55, Hb * 0.72), sc.accent, 0.9 * out, false)
        // 逐字透视：局部 x 沿墙走，局部 y 是世界竖直方向；数值雅可比即矩阵
        const glyphM = (d: [number, number], sv: number, Y: number, flip: boolean): Mat => {
          const p0 = prj(...at(d, sv, Y))
          const e = 1
          const p1 = prj(...at(d, sv + e * (flip ? -1 : 1), Y))
          const p2 = prj(...at(d, sv, Y + e))
          return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]]
        }
        // 阅读偏移 u → 墙上的位置：向右收敛的墙从阴角往外读，向左收敛的相反
        const posOn = (
          d: [number, number],
          _L: number,
          off: number,
          tot: number,
          m0: number,
        ): number => (d[0] >= 0 ? m0 + off : m0 + tot - off)
        // 另一面墙：整句用小字排几行
        const oc = flat(cut.lineText || cut.text)
        const rowsO = port ? 3 : 4
        const fsO = Ht * 0.12
        if (env.pass === 'main') {
          const fo = bodyF(env)
          const chars = [...(oc + '　・　' + oc + '　・　' + oc)].slice(0, 40)
          const ads = chars.map((ch) => adv(fo, ch) * fsO * 1.1)
          let tot = 0
          let cnt = 0
          for (const a of ads) {
            if (tot + a > LO * 0.86) break
            tot += a
            cnt++
          }
          for (let r0 = 0; r0 < rowsO; r0++) {
            const Y = -Ht * 0.72 + r0 * fsO * 1.9
            let uu = 0
            for (let i = 0; i < cnt; i++) {
              const ch = chars[i]
              const a = ads[i]
              const mid = uu + a / 2
              uu += a
              if (ch === ' ' || ch === '\u3000') continue
              drawAffPlain(
                env,
                {
                  text: ch,
                  font: fo,
                  size: fsO,
                  x: 0,
                  y: 0,
                  color: mix(dimW, onCol(sc, dimW), 0.55),
                  alpha: wa * clamp((lt - 0.2 - r0 * 0.08) / 0.3),
                  ghost: false,
                },
                glyphM(dO, posOn(dO, LO, mid, tot, LO * 0.07), Y, dO[0] < 0),
              )
            }
          }
        }
        // 主墙上的歌词
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const lines = n > (port ? 5 : 8) ? chunksK(t0, port ? Math.ceil(n / 5) : 2) : [t0]
        const nl = lines.length
        let gs = ((Ht + Hb * 0.5) * 0.62) / (nl * 1.15)
        for (const l of lines) {
          let a = 0
          for (const ch of l) a += adv(P.font, ch) * 1.04
          gs = Math.min(gs, (LL * 0.86) / Math.max(1, a))
        }
        let bb: BBox | null = null
        lines.forEach((l, li) => {
          const Y = -Ht * 0.25 + (li - (nl - 1) / 2) * gs * 1.15
          const chars = [...l]
          const ads = chars.map((ch) => adv(P.font, ch) * gs * 1.04)
          const tot = ads.reduce((x, y) => x + y, 0)
          let uu = 0
          chars.forEach((ch, i) => {
            const a = ads[i]
            const mid = uu + a / 2
            uu += a
            if (ch === ' ') return
            const sp = posOn(dL, LL, mid, tot, LL * 0.07)
            if (sp > LL * wa) return
            bb = unionBB(
              bb,
              drawAff(
                env,
                {
                  text: ch,
                  font: P.font,
                  size: gs,
                  x: 0,
                  y: 0,
                  color: tc,
                  noHold: true,
                  mi: li * 3 + i * 0.6,
                },
                glyphM(dL, sp, Y, dL[0] < 0),
              ),
            )
          })
        })
        return bb
      },
    },

    origami: {
      w: 0.8,
      tags: ['calm', 'pop', 'emotional'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 2.5, blur: 0.8, pop: 0.6, slice: 0.2, wipe: 0.3 },
      plan: (rng: Rng, cut, st: StylePack): OrigamiParams => {
        const port = cut.H > cut.W * 1.08
        return {
          font: rng.pick(fontsOf(st, ['serif', 'display'])),
          mode:
            !port && cut.n > 6 && rng.chance(0.6) ? 'gate' : rng.pick(['blintz', 'blintz', 'gate']),
          col: rng.pick(['accent', 'accent', 'ink']),
          order: rng.int(0, 3),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as OrigamiParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const out = tout(env)
        const paper0 = lightOf(sc)
        const back =
          (P.col === 'ink'
            ? [sc.accent2, sc.accent, sc.ink]
            : [sc.accent, sc.accent2, sc.ink]
          ).find((c) => c && contrast(c, paper0) >= 1.5 && contrast(c, sc.bg) >= 1.3) || darkOf(sc)
        const paper = mix(paper0, back, 0.05)
        const tc =
          onCol(sc, paper) === paper
            ? darkOf(sc)
            : contrast(darkOf(sc), paper) > 3
              ? darkOf(sc)
              : onCol(sc, paper)
        const crease = mix(paper, darkOf(sc), 0.22)
        const cx = W / 2
        const cy = H / 2
        const fl = 0.36
        const stg = 0.13 // 单瓣时长 / 逐瓣延迟
        const outF = clamp(env.pOut * 1.3)
        const flapAng = (k: number): number => {
          const tin0 = 0.1 + k * stg
          const tout0 = k * 0.12
          let p = E.inOutCubic(clamp((lt - tin0) / fl)) * 166
          if (outF > 0) p = Math.min(p, 166 * (1 - E.inOutCubic(clamp((outF - tout0 * 0.8) / 0.6))))
          return p * DEG
        }
        const shrink = 1 - E.inCubic(clamp((env.pOut - 0.75) / 0.25))
        const text0 = flat(cut.text)
        const n = glyphCount(text0)
        let bb: BBox | null
        if (P.mode === 'gate' && !port) {
          // 一张横纸，两扇门从中间对开
          const text = brk(text0, 9)
          const o = { track: 0.04, lead: 1.12 }
          const size = Math.min(fitSize(text, P.font, W * 0.66, H * 0.4, o), u * 0.2)
          const m = measure({ text, font: P.font, size, ...o })
          const sw = Math.min(W * 0.86, m.w + size * 1.6) * shrink
          const sh = Math.min(H * 0.72, m.h + size * 1.4) * shrink
          if (sw < 2) return null
          const x0 = cx - sw / 2
          const y0 = cy - sh / 2
          env.rect(x0 + u * 0.012, y0 + u * 0.018, sw, sh, darkOf(sc), 0.3 * out, false)
          env.rect(x0, y0, sw, sh, paper, out, gIn(env))
          env.line(
            [
              [x0 + sw / 4, y0],
              [x0 + sw / 4, y0 + sh],
            ],
            crease,
            1,
            0.8 * out,
            false,
          )
          env.line(
            [
              [x0 + (sw * 3) / 4, y0],
              [x0 + (sw * 3) / 4, y0 + sh],
            ],
            crease,
            1,
            0.8 * out,
            false,
          )
          const drawGate = (under: boolean): void => {
            for (let k = 0; k < 2; k++) {
              const ph = flapAng(k)
              const c = Math.cos(ph)
              if (c < 0 !== under) continue
              const hx = k ? x0 + (sw * 3) / 4 : x0 + sw / 4
              const dir = k ? -1 : 1 // 折痕位置、折页朝哪边倒
              const ex = hx + (dir * sw * c) / 4
              const skew = Math.sin(ph) * sh * 0.05
              const pts: Pt[] = [
                [hx, y0],
                [ex, y0 - skew],
                [ex, y0 + sh + skew],
                [hx, y0 + sh],
              ]
              const col =
                c > 0
                  ? shade(sc, back, -0.25 * (1 - c))
                  : shade(sc, paper, (k ? -0.09 : 0.03) * -c - 0.35 * (1 + c))
              env.poly(pts, col, out, false)
              if (c > 0)
                env.line(
                  [
                    [ex, y0 - skew],
                    [ex, y0 + sh + skew],
                  ],
                  shade(sc, back, 0.25),
                  1.5,
                  out,
                  false,
                )
              else
                env.line(
                  [
                    [hx, y0],
                    [hx, y0 + sh],
                  ],
                  crease,
                  1,
                  out,
                  false,
                )
            }
          }
          drawGate(true)
          bb = mainDraw(env, {
            text,
            font: P.font,
            size: size * shrink,
            x: cx,
            y: cy,
            color: tc,
            noHold: plateHold(cut),
            mi: miAt(env, cut, 0.15),
            ...o,
          })
          drawGate(false)
          return bb || box(x0, y0, x0 + sw, y0 + sh)
        }
        // blintz 折：菱形纸，四角逐一折向中心再展开
        const S = Math.min(W * 0.84, H * 0.84, u * 0.95) * shrink // 纸的对角线
        if (S < 2) return null
        const R = S / 2
        const C: Pt[] = [
          [cx, cy - R],
          [cx + R, cy],
          [cx, cy + R],
          [cx - R, cy],
        ]
        const M: Pt[] = C.map((p, i) => [
          (p[0] + C[(i + 1) % 4][0]) / 2,
          (p[1] + C[(i + 1) % 4][1]) / 2,
        ])
        env.poly(
          C.map(([x, y]) => [x + u * 0.012, y + u * 0.018] as Pt),
          darkOf(sc),
          0.3 * out,
          false,
        )
        env.poly(C, paper, out, gIn(env))
        // 折痕
        for (let i = 0; i < 4; i++) env.line([M[i], M[(i + 1) % 4]], crease, 1, 0.8 * out, false)
        env.line([C[0], C[2]], crease, 1, 0.35 * out, false)
        env.line([C[1], C[3]], crease, 1, 0.35 * out, false)
        const text = n <= 4 ? text0 : brk(text0, n <= 9 ? Math.ceil(n / 2) : Math.ceil(n / 3))
        const o = { track: 0.02, lead: 1.08 }
        const inner = R * 0.94 // 内接（轴对齐）方形的边长 ≈ R
        const size = Math.min(fitSize(text, P.font, inner * 0.84, inner * 0.84, o), u * 0.2)
        // 折页（折痕 = 内方形边，顶点从中心走到角）；展开的压在字下，合上的盖在字上
        const drawFlaps = (under: boolean): void => {
          for (let q = 0; q < 4; q++) {
            const k = (q + P.order) % 4
            const ph = flapAng(q)
            const c = Math.cos(ph)
            if (c < 0 !== under) continue
            const a = M[(k + 3) % 4]
            const b = M[k]
            const hm: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
            const apex: Pt = [hm[0] + (cx - hm[0]) * c, hm[1] + (cy - hm[1]) * c]
            const lk = [0.04, -0.1, -0.05, 0.02][k]
            const col =
              c > 0 ? shade(sc, back, -0.3 * (1 - c)) : shade(sc, paper, lk * -c - 0.32 * (1 + c))
            env.poly([a, b, apex], col, out, false)
            if (c > -0.95)
              env.line([a, apex, b], c > 0 ? shade(sc, back, 0.2) : crease, 1, out, false)
            else env.line([a, b], crease, 1, out, false)
          }
        }
        drawFlaps(true)
        bb = mainDraw(env, {
          text,
          font: P.font,
          size: size * shrink,
          x: cx,
          y: cy,
          color: tc,
          noHold: plateHold(cut),
          mi: miAt(env, cut, 0.12),
          ...o,
        })
        drawFlaps(false)
        return bb || box(cx - R, cy - R, cx + R, cy + R)
      },
    },

    zipper: {
      w: 0.7,
      tags: ['pop', 'graphic', 'emotional'],
      busy: true,
      portrait: 1.1,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 2, blur: 1, pop: 0.8, slice: 0.3, wipe: 0.5 },
      plan: (rng: Rng, _cut, st: StylePack): ZipperParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        cloth: rng.pick(['ink', 'accent', 'ink']),
        dir: rng.pick([1, -1]),
        stitch: rng.chance(0.8),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ZipperParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const t0 = flat(cut.text)
        const n = glyphCount(t0)
        const vert = port && n <= 10 && !hasLatin(t0)
        const out = tout(env)
        // 在"缝线沿 +X"的坐标系里算，竖排时再交换两轴映回屏幕
        const Lw = vert ? H : W
        const Lh = vert ? W : H
        const SM = (a: number, b: number): Pt => (vert ? [b, a] : [a, b])
        const x0 = Lw * 0.05
        const x1 = Lw * 0.95
        const text = vert ? t0 : brk(t0, port ? 5 : 9)
        const o = { track: 0.05, lead: 1.1, vertical: vert }
        const size = Math.min(
          fitSize(text, P.font, vert ? Lh * 0.44 : Lw * 0.66, vert ? Lw * 0.64 : Lh * 0.36, o),
          u * 0.2,
        )
        const m = measure({ text, font: P.font, size, ...o })
        const G = (vert ? m.w : m.h) / 2 + size * 0.55
        const tIn = clamp(cut.dur * 0.3, 0.45, 1)
        const tOut = Math.max(0.3, (cut.outDur || 0.3) + 0.2)
        const cin = E.outCubic(clamp(lt / 0.28))
        const cout = E.inCubic(clamp((lt - (cut.dur - 0.22)) / 0.22))
        const tOut2 = tOut + 0.22
        const sp =
          E.inOutCubic(clamp((lt - 0.22) / tIn)) *
          (1 - E.inOutCubic(clamp((lt - (cut.dur - tOut2)) / tOut)))
        const dir = P.dir || 1
        const xs = dir > 0 ? lerp(x0, x1, sp) : lerp(x1, x0, sp)
        const a = dir > 0 ? x0 : xs
        const b = dir > 0 ? xs : x1
        const gap = (x: number): number =>
          x <= a || x >= b || b - a < 1
            ? 0
            : G *
              Math.pow(Math.sin((Math.PI * (x - a)) / (b - a)), 0.75) *
              (1 + 0.02 * Math.sin(env.ltb * 2))
        const cy = Lh / 2
        const cloth = plateCol(sc, P.cloth === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
        const tape = shade(sc, cloth, -0.25)
        const toothC = mix(sc.sub, lightOf(sc), 0.4)
        // 歌词压在布底下
        const bb = mainDraw(env, {
          text,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          color: sc.fg,
          mi: miAt(env, cut, 0.15),
          ...o,
        })
        const N = 90
        const pts: Pt[] = []
        for (let i = 0; i <= N; i++) {
          const x = lerp(-Lw * 0.02, Lw * 1.02, i / N)
          pts.push([x, gap(x)])
        }
        const tw = u * 0.022
        const pitch = u * 0.02
        const off = (1 - cin + cout) * Lh * 0.62 // 两半从画外滑进来，收尾再滑出去
        if (off > Lh * 0.6) return bb
        for (const s2 of [-1, 1]) {
          const poly: Pt[] = [
            SM(-Lw * 0.05, cy + s2 * (Lh * 0.6 + off)),
            ...pts.map(([x, gp]) => SM(x, cy + s2 * (gp + off))),
            SM(Lw * 1.05, cy + s2 * (Lh * 0.6 + off)),
          ]
          env.poly(poly, cloth, 1, false)
          env.line(
            pts.map(([x, gp]) => SM(x, cy + s2 * (gp + tw * 0.5 + off))),
            tape,
            tw,
            1,
            false,
          )
          if (P.stitch) {
            const st = pts.map(([x, gp]) => SM(x, cy + s2 * (gp + tw * 1.6 + off)))
            if (env.pass === 'main') {
              ctx.save()
              ctx.setLineDash([u * 0.012, u * 0.01])
              env.line(st, shade(sc, cloth, 0.25), Math.max(1, u * 0.0022), 0.8 * out, false)
              ctx.restore()
            }
          }
        }
        // 齿：合上的地方互相咬合，张开的地方各自贴着边
        if (off < 1 && (env.pass === 'main' || gIn(env))) {
          for (let x = x0; x <= x1; x += pitch) {
            const gp = gap(x)
            const k = Math.round((x - x0) / pitch)
            const up = k % 2 ? -1 : 1
            const d = (gap(x + 1) - gap(x - 1)) / 2
            const ang = gp < 0.5 ? 0 : Math.atan(up * d)
            const tl = tw * 0.7
            const th = pitch * 0.34
            const yc = gp < 0.5 ? cy + up * tl * 0.28 : cy + up * (gp + tw * 0.15)
            const ca = Math.cos(ang)
            const sa = Math.sin(ang)
            const q: Pt[] = [
              [-th, -tl / 2],
              [th, -tl / 2],
              [th, tl / 2],
              [-th, tl / 2],
            ].map(([pp, rr0]) => SM(x + pp * ca - rr0 * sa, yc + pp * sa + rr0 * ca))
            env.poly(q, toothC, out, false)
          }
        }
        // 拉头与拉片
        if (off >= 1) return bb
        const sxp = xs
        const syp = cy
        const bw = u * 0.05
        const bh = u * 0.035
        env.poly(
          [
            SM(sxp - bw * 0.6 * dir, syp - bh),
            SM(sxp + bw * 0.5 * dir, syp - bh * 0.7),
            SM(sxp + bw * 0.5 * dir, syp + bh * 0.7),
            SM(sxp - bw * 0.6 * dir, syp + bh),
          ],
          toothC,
          out,
          false,
        )
        const tabL = u * 0.075
        const sw = Math.sin(env.ltb * 3) * 0.15
        const tx = sxp + dir * bw * 0.1
        const ty = syp + bh * 0.4
        const tp: Pt[] = [
          [-bw * 0.28, 0],
          [bw * 0.28, 0],
          [bw * 0.34, tabL],
          [-bw * 0.34, tabL],
        ].map(([pp, rr0]) =>
          SM(
            tx + pp * Math.cos(sw) - rr0 * Math.sin(sw),
            ty + pp * Math.sin(sw) + rr0 * Math.cos(sw),
          ),
        )
        env.poly(tp, mix(toothC, darkOf(sc), 0.15), out, false)
        const hole = SM(tx - Math.sin(sw) * tabL * 0.75, ty + Math.cos(sw) * tabL * 0.75)
        env.circle(hole[0], hole[1], bw * 0.12, cloth, null, 0, out, false)
        return bb
      },
    },

    sliceStack: {
      w: 0.9,
      tags: ['glitch', 'graphic', 'pop'],
      emph: 1.2,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 2, blur: 0.8, flicker: 0.8, slice: 0.2, wipe: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): SliceStackParams => {
        const mode = rng.pick(['blinds', 'blinds', 'stack', 'wave'])
        return {
          font: rng.pick(fontsOf(st, ['display'])),
          mode,
          slices: mode === 'blinds' ? rng.int(6, 9) : rng.int(6, 8),
          gap: rng.range(0.3, 0.55),
          side: rng.pick(['accent', 'accent', 'sub']),
          amp: rng.range(0.08, 0.16),
          dir: rng.pick([1, -1]),
          plate: rng.pick(['ink', 'accent']),
        }
      },
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as SliceStackParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 5 : 8)
        const o = { track: 0.02, lead: 1.02 }
        const blinds = P.mode === 'blinds'
        const size = Math.min(
          fitSize(text, P.font, W * (blinds ? 0.74 : 0.78), H * (blinds ? 0.46 : 0.42), o),
          u * 0.3,
        )
        const m = measure({ text, font: P.font, size, ...o })
        const Sn = P.slices
        const out = tout(env)
        const tbx = W / 2
        const tby = H / 2
        let bb: BBox | null = null
        if (blinds) {
          // 百叶：叶片带着歌词转开、一道涟漪扫过、再转合
          const padX = size * 0.45
          const padY = size * 0.3
          const bh = m.h + padY * 2
          const hs = bh / Sn
          const gp = hs * 0.08
          const x0 = tbx - m.w / 2 - padX
          const w = m.w + padX * 2
          const yTop = tby - bh / 2
          const pc = plateCol(sc, P.plate === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
          const tc = onCol(sc, pc)
          const backC = shade(sc, pc, -0.45)
          const mot = env.fx.motion
          // 拉绳与上轨
          const ra = tin(env, 0, 0.3, E.outCubic) * out
          env.rect(
            x0 - size * 0.08,
            yTop - hs * 0.55,
            w + size * 0.16,
            hs * 0.3,
            shade(sc, pc, -0.2),
            ra,
            false,
          )
          for (const cxr of [x0 + w * 0.2, x0 + w * 0.8])
            env.line(
              [
                [cxr, yTop - hs * 0.3],
                [cxr, yTop + bh * ra],
              ],
              sc.sub,
              Math.max(1, u * 0.0015),
              0.6 * ra,
              false,
            )
          for (let i = 0; i < Sn; i++) {
            const f = Sn > 1 ? i / (Sn - 1) : 0
            let ph = (1 - E.outBack(clamp((lt - 0.05 - f * 0.25) / 0.45), 1.3)) * 90
            ph += Math.sin(env.ltb * 2.4 - i * 0.7) * 16 * mot * clamp((lt - 0.6) / 0.4)
            ph -= E.inCubic(clamp(env.pOut * 1.3 - f * 0.3)) * 90
            const c = Math.cos(ph * DEG)
            const slotY = yTop + i * hs
            const yc = slotY + hs / 2
            const hv = (hs - gp) * Math.abs(c)
            if (hv < 0.6) continue
            const face = c > 0
            env.rect(
              x0,
              yc - hv / 2,
              w,
              hv,
              face ? shade(sc, pc, -0.35 * (1 - c)) : backC,
              out,
              false,
            )
            env.line(
              [
                [x0, yc + hv / 2],
                [x0 + w, yc + hv / 2],
              ],
              darkOf(sc),
              Math.max(1, hs * 0.04),
              0.35 * out,
              false,
            )
            if (!face || c < 0.08) continue
            ctx.save()
            ctx.beginPath()
            ctx.rect(x0, yc - hv / 2, w, hv)
            ctx.clip()
            const by0 = tby - bh / 2 + i * hs
            ctx.translate(0, yc)
            ctx.scale(1, c)
            ctx.translate(0, -yc + (slotY - by0))
            const rp = mainDraw(env, {
              text,
              font: P.font,
              size,
              x: tbx,
              y: tby,
              color: tc,
              noHold: true,
              plain: true,
              mi: 0,
              ...o,
            })
            ctx.restore()
            if (rp) bb = bb || rp
          }
          return bb ? box(x0, yTop, x0 + w, yTop + bh) : null
        }
        const hs = (m.h + size * 0.1) / Sn
        const gp = hs * P.gap
        const totH = Sn * hs + (Sn - 1) * gp
        const y0 = H / 2 - totH / 2
        const sideC = P.side === 'accent' ? sc.accent : mix(sc.fg, sc.bg, 0.55)
        const dep = Math.min(gp * 0.9, size * 0.08)
        const A = size * P.amp * (0.5 + 0.7 * env.fx.motion)
        for (let i = 0; i < Sn; i++) {
          const f = Sn > 1 ? i / (Sn - 1) : 0.5
          let dx: number
          if (P.mode === 'wave') dx = A * Math.sin(f * TAU * 0.9 + env.ltb * 2.2 * P.dir)
          else dx = A * 1.4 * (f - 0.5) * 2 * P.dir * (0.75 + 0.25 * Math.cos(env.ltb * 1.1))
          const ei = clamp((lt - i * 0.025) / 0.45)
          dx += (1 - E.outExpo(ei)) * W * 0.7 * (i % 2 ? 1 : -1)
          dx += E.inCubic(clamp(env.pOut * 1.3 - f * 0.3)) * W * 0.8 * (i % 2 ? -1 : 1)
          const by0 = tby - (Sn * hs) / 2 + i * hs
          const slotY = y0 + i * (hs + gp)
          const dy = slotY - by0
          if (env.pass === 'main') {
            ctx.save()
            ctx.beginPath()
            ctx.rect(-W, slotY + hs - 0.5, W * 3, dep + 0.5)
            ctx.clip()
            ctx.translate(dx + dep * 0.5, dy + dep)
            mainDraw(env, {
              text,
              font: P.font,
              size,
              x: tbx,
              y: tby,
              color: sideC,
              ghost: false,
              noHold: true,
              mi: 0,
              ...o,
            })
            ctx.restore()
          }
          ctx.save()
          ctx.beginPath()
          ctx.rect(-W, slotY, W * 3, hs + 0.5)
          ctx.clip()
          ctx.translate(dx, dy)
          const rp = mainDraw(env, {
            text,
            font: P.font,
            size,
            x: tbx,
            y: tby,
            color: sc.fg,
            noHold: true,
            mi: 0,
            ...o,
          })
          ctx.restore()
          if (rp && !bb) bb = rp
        }
        const w2 = m.w / 2 + A * 1.4
        return bb ? box(tbx - w2, y0, tbx + w2, y0 + totH) : null
      },
    },

    glitchGrid: {
      w: 0.8,
      tags: ['glitch', 'graphic'],
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: {
        cut: 2.5,
        flicker: 1.5,
        scramble: 1.2,
        blur: 0.4,
        slice: 0.8,
        wipe: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): GlitchGridParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        rate: rng.int(3, 6),
        inv: rng.range(0.1, 0.22),
        labels: rng.chance(0.75),
        gut: rng.range(0.008, 0.016),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as GlitchGridParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const sq = !port && W < H * 1.45
        const C = port ? 3 : sq ? 3 : 4
        const R = port ? 5 : 3
        const gut = u * P.gut
        const mx = W * 0.04
        const my = H * 0.05
        const cw = (W - mx * 2 - gut * (C - 1)) / C
        const ch = (H - my * 2 - gut * (R - 1)) / R
        // 干净的格子：竖屏是中间一整行，其余是中间两（三）格
        const cr = Math.floor(R / 2)
        const cc0 = port ? 0 : C === 4 ? 1 : 0
        const cc1 = port ? C - 1 : C === 4 ? 2 : C - 1
        const out = tout(env)
        const text = flat(cut.text)
        const t2 = brk(cut.text, port ? 5 : 8)
        const cols = [sc.fg, sc.accent, sc.sub, sc.ghostA, sc.ghostB].filter(
          (c) => c && contrast(c, sc.bg) > 1.4,
        )
        const lw = Math.max(1, u * 0.0015)
        const cellRect = (r0: number, c0: number, c1: number): number[] => [
          mx + c0 * (cw + gut),
          my + r0 * (ch + gut),
          (c1 - c0 + 1) * cw + (c1 - c0) * gut,
          ch,
        ]
        for (let r0 = 0; r0 < R; r0++)
          for (let c = 0; c < C; c++) {
            if (r0 === cr && c >= cc0 && c <= cc1) continue
            const id = r0 * C + c
            const t1 = 0.03 + r(s, id, 1) * 0.35
            const on =
              lt > t1 &&
              (lt - t1 > 0.12 || r(s, id, env.step, 2) < 0.6) &&
              !(env.pOut > r(s, id, 3) * 0.8 + 0.1)
            if (!on) continue
            const [x, y, w, h] = cellRect(r0, c, c)
            const kk = Math.floor((env.step + (hash(s, id, 4) % 7)) / P.rate)
            const inv = r(s, id, kk, 5) < P.inv
            const col = mix(cols[hash(s, id, kk, 6) % cols.length], sc.bg, 0.25)
            const zoom = rr(1.4, 3.6, s, id, kk, 7)
            const fsz = Math.min(h * 0.9, w * 0.9) * zoom * 0.5
            const ox = rs(s, id, kk, 8) * w * 0.5
            const oy = rs(s, id, kk, 9) * h * 0.3
            if (inv) env.rect(x, y, w, h, col, out * 0.85, false)
            else env.rect(x, y, w, h, mix(sc.bg, sc.fg, 0.04), out, false)
            if (env.pass === 'main') {
              ctx.save()
              ctx.beginPath()
              ctx.rect(x, y, w, h)
              ctx.clip()
              const fresh = (env.step + (hash(s, id, 4) % 7)) % P.rate === 0
              const sl = fresh ? rs(s, id, env.step, 10) * w * 0.12 : 0
              env.draw({
                text,
                font: P.font,
                size: fsz,
                x: x + w / 2 + ox + sl,
                y: y + h / 2 + oy,
                color: inv ? onCol(sc, col) : col,
                alpha: out * (inv ? 0.9 : 0.6),
                ghost: false,
              })
              if (fresh)
                env.rect(
                  x,
                  y + h * r(s, id, env.step, 11),
                  w,
                  h * 0.06,
                  inv ? onCol(sc, col) : col,
                  0.6 * out,
                  false,
                )
              ctx.restore()
              if (P.labels)
                env.draw({
                  text: `CH.${pad2(id + 1)}  x${zoom.toFixed(1)}`,
                  font: monoF(env),
                  size: Math.max(10, u * 0.013),
                  align: 'left',
                  x: x + u * 0.01,
                  y: y + u * 0.016,
                  color: inv ? onCol(sc, col) : sc.sub,
                  alpha: 0.8 * out,
                  ghost: false,
                })
            }
            env.rrect(x, y, w, h, 0, null, out, false, mix(sc.bg, sc.fg, 0.2), lw)
          }
        // 干净的那格
        const [x, y, w, h] = cellRect(cr, cc0, cc1)
        const e = E.outExpo(clamp(lt / 0.35))
        env.rrect(
          x + w / 2 - (w / 2) * e,
          y,
          w * e,
          h,
          0,
          null,
          out,
          false,
          sc.accent,
          Math.max(2, u * 0.003),
        )
        const o = { track: 0.04, lead: 1.1 }
        const size = Math.min(fitSize(t2, P.font, w * 0.88, h * 0.8, o), u * 0.24)
        if (P.labels && env.pass === 'main')
          env.draw({
            text: 'REC ● CLEAN',
            font: monoF(env),
            size: Math.max(10, u * 0.014),
            align: 'left',
            x: x + u * 0.012,
            y: y + u * 0.018,
            color: sc.accent,
            alpha: out * (env.step % 4 < 3 ? 1 : 0.3),
            ghost: false,
          })
        return mainDraw(env, {
          text: t2,
          font: P.font,
          size,
          x: x + w / 2,
          y: y + h / 2,
          color: sc.fg,
          ...o,
        })
      },
    },
    mosaicTiles: {
      w: 0.7,
      tags: ['pop', 'graphic', 'glitch'],
      treat: false,
      fits: (n) => n >= 1 && n <= 12,
      enterBias: {
        cut: 3,
        flicker: 0.8,
        blur: 0.3,
        slice: 0.2,
        wipe: 0.3,
        assemble: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): MosaicTilesParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        D: rng.int(9, 12),
        wave: rng.pick(['diag', 'random', 'center']),
        rot: rng.chance(0.4),
        col: rng.pick(['fg', 'accent', 'fg']),
        floor: rng.chance(0.75),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as MosaicTilesParams
        const s = cut.seed
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 4 : 7)
        const lead = 1.15
        const D = P.D
        const smp = mosaicSample(text, P.font, D, lead)
        if (!smp.lit.length) return null
        const p = Math.min((W * 0.88) / smp.cols, (H * 0.66) / smp.rows)
        const gw = smp.cols * p
        const gh = smp.rows * p
        const gx = W / 2 - gw / 2
        const gy = H / 2 - gh / 2
        const out = tout(env)
        const col = P.col === 'accent' && contrast(sc.accent, sc.bg) > 1.8 ? sc.accent : sc.fg
        const tileW = p * 0.86
        // 灰浆底：整块面板的每个格子都铺一层暗 tile
        if (P.floor && env.pass === 'main') {
          const fa = tin(env, 0, 0.4, E.outCubic) * out
          ctx.save()
          ctx.globalAlpha = fa
          ctx.fillStyle = mix(sc.bg, sc.fg, 0.07)
          ctx.beginPath()
          const pad = 1
          for (let row = -pad; row < smp.rows + pad; row++)
            for (let c = -pad; c < smp.cols + pad; c++) {
              const x = gx + (c + 0.5) * p
              const y = gy + (row + 0.5) * p
              ctx.rect(x - tileW / 2, y - tileW / 2, tileW, tileW)
            }
          ctx.fill()
          ctx.restore()
        }
        // 亮起的贴砖：先做一组（会动的）裁剪路径，再把粗体歌词画进去
        const L = smp.lit
        const span = clamp(cut.dur * 0.3, 0.3, 0.8)
        const ord = (c: number, row: number): number =>
          P.wave === 'diag'
            ? (c + row) / (smp.cols + smp.rows)
            : P.wave === 'center'
              ? Math.hypot(c - smp.cols / 2, row - smp.rows / 2) /
                Math.hypot(smp.cols / 2, smp.rows / 2)
              : r(s, c, row, 3)
        ctx.save()
        ctx.beginPath()
        let any = false
        for (let k = 0; k < L.length; k += 2) {
          const c = L[k]
          const row = L[k + 1]
          const t1 = 0.08 + ord(c, row) * span
          let e = E.outBack(clamp((lt - t1) / 0.22), 1.8)
          const eo = clamp(env.pOut * 1.4 - r(s, c, row, 4) * 0.4)
          e *= 1 - E.inCubic(eo)
          if (e <= 0.02) continue
          const x = gx + (c + 0.5) * p
          const y = gy + (row + 0.5) * p
          const hw = (tileW / 2) * e
          if (P.rot) {
            const a = rs(s, c, row, 5) * 0.2 + (1 - e) * 1.2
            const ca = Math.cos(a) * hw
            const sa = Math.sin(a) * hw
            ctx.moveTo(x - ca + sa, y - sa - ca)
            ctx.lineTo(x + ca + sa, y + sa - ca)
            ctx.lineTo(x + ca - sa, y + sa + ca)
            ctx.lineTo(x - ca - sa, y - sa + ca)
            ctx.closePath()
          } else ctx.rect(x - hw, y - hw, hw * 2, hw * 2)
          any = true
        }
        if (!any) ctx.rect(-10, -10, 1, 1)
        ctx.clip()
        const fsz = D * p
        const bb = mainDraw(env, {
          text,
          font: P.font,
          size: fsz,
          x: W / 2,
          y: H / 2,
          lead,
          color: col,
          stroke: p * 1.2,
          strokeColor: col,
          strokeUnder: true,
          noHold: true,
          mi: 0,
        })
        // 砖与砖之间的色差 + 倒角高光
        if (env.pass === 'main') {
          for (let k = 0; k < L.length; k += 2) {
            const c = L[k]
            const row = L[k + 1]
            const h = r(s, c, row, 6)
            if (h > 0.45) continue
            const x = gx + c * p + (p - tileW) / 2
            const y = gy + row * p + (p - tileW) / 2
            env.rect(
              x,
              y,
              tileW,
              tileW,
              h < 0.18 ? darkOf(sc) : h < 0.3 ? lightOf(sc) : sc.accent2 || sc.accent,
              (h < 0.18 ? 0.16 : 0.14) * out,
              false,
            )
          }
        }
        ctx.restore()
        return bb ? box(gx, gy, gx + gw, gy + gh) : null
      },
    },

    maskReveal: {
      w: 0.9,
      tags: ['graphic', 'pop', 'emotional'],
      treat: false,
      emph: 1.3,
      fits: (n) => n >= 1 && n <= 12,
      enterBias: {
        cut: 1.4,
        blur: 1.2,
        wipe: 1.2,
        slice: 0.8,
        stretch: 0.8,
        pop: 0.6,
        assemble: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): MaskRevealParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        scene: rng.pick(['stripes', 'lines', 'dots', 'shine', 'stripes']),
        ang: rng.range(20, 35) * rng.pick([1, -1]),
        speed: rng.range(0.6, 1.2),
        rim: rng.chance(0.65),
        label: rng.chance(0.6),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as MaskRevealParams
        const u = U(env)
        const port = isPort(env)
        const text = brk(cut.text, port ? 4 : 7)
        const o = { track: 0.0, lead: 1.0 }
        const size = Math.min(
          fitSize(text, P.font, W * 0.88, H * (port ? 0.56 : 0.66), o),
          u * 0.46,
        )
        const m = measure({ text, font: P.font, size, ...o })
        const out = tout(env)
        const A = [sc.accent, sc.fg].find((c) => contrast(c, sc.bg) >= 1.8) || sc.fg
        const B =
          [sc.fg, lightOf(sc), sc.accent2].find((c) => c && c !== A && contrast(c, sc.bg) >= 1.8) ||
          A
        const sk = env.scale || 1
        const tb = env.ltb * P.speed
        // 透过字形看到的画面：以图案/渐变的形式挂在字形空间上（随时间流动）
        const fillOf = (): Paint => {
          if (P.scene === 'shine') {
            const g = ctx.createLinearGradient(-size * 0.6, -size * 0.6, size * 0.6, size * 0.6)
            const ph = (((tb * 0.45) % 1) + 1) % 1
            const cA = sc.grad ? sc.grad[0] : A
            const cB = sc.grad ? sc.grad[1] : B
            for (let k = 0; k <= 6; k++) {
              const f = k / 6
              const v = 0.5 + 0.5 * Math.cos((f - ph) * TAU)
              g.addColorStop(f, mix(cA, cB, v))
            }
            return g
          }
          let tile: HTMLCanvasElement | null
          let per: number
          let m2 = new DOMMatrix()
          if (P.scene === 'stripes') {
            per = size * 0.26
            const T = Math.max(4, Math.round(per * sk))
            tile = tileCv('st' + A + B + T, T, T, (x, w, h) => {
              x.fillStyle = B
              x.fillRect(0, 0, w, h)
              x.fillStyle = A
              x.fillRect(0, 0, w / 2, h)
            })
            m2 = m2
              .rotate(P.ang)
              .translate((tb * size * 0.5) % per, 0)
              .scale(per / T)
          } else if (P.scene === 'dots') {
            per = size * 0.2
            const T = Math.max(4, Math.round(per * sk))
            tile = tileCv('dt' + A + B + T, T, T, (x, w, h) => {
              x.fillStyle = B
              x.fillRect(0, 0, w, h)
              x.fillStyle = A
              x.beginPath()
              x.arc(w / 2, h / 2, w * 0.3, 0, TAU)
              x.fill()
            })
            m2 = m2
              .rotate(P.ang)
              .translate((tb * size * 0.3) % per, (tb * size * 0.3) % per)
              .scale(per / T)
          } else {
            const ls = size * 0.16
            const unit = flat(cut.lineText || cut.text) + '　・　'
            const f = bodyF(env)
            const uw = Math.max(ls, measure({ text: unit, font: f, size: ls }).w)
            const rh = ls * 1.3
            const Tw = Math.max(8, Math.round(uw * sk))
            const Th = Math.max(4, Math.round(rh * 2 * sk))
            tile = tileCv('ln' + unit + f + A + B + Tw + Th, Tw, Th, (x, w, h) => {
              x.fillStyle = B
              x.fillRect(0, 0, w, h)
              x.fillStyle = A
              x.font = fontCSS(f, ls * sk)
              x.textBaseline = 'middle'
              x.textAlign = 'left'
              x.fillText(unit, 0, h * 0.25)
              x.fillText(unit, -w / 2, h * 0.75)
              x.fillText(unit, w / 2, h * 0.75)
            })
            m2 = m2.translate(-((tb * size * 0.5) % uw), 0).scale(uw / Tw, (rh * 2) / Th)
          }
          if (!tile) return A
          const pat = ctx.createPattern(tile, 'repeat')
          if (!pat) return A
          try {
            pat.setTransform(m2)
          } catch {
            /* 不支持 setTransform 就退回不流动 */
          }
          return pat
        }
        const base = (): TextItem => ({
          text,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          color: B,
          mi: 0,
          ...o,
        })
        const bb = mainDraw(env, withFill(base(), fillOf))
        if (P.rim)
          mainDraw(env, {
            ...base(),
            fill: false,
            stroke: Math.max(1.5, size * 0.012),
            strokeColor: A,
            alpha: 0.9,
            ghost: false,
          })
        if (P.label) {
          const ls = smallSize(env)
          const lab = altCopy(cut)
          const a = tin(env, 0.25, 0.4, E.outCubic) * out
          env.draw({
            text: lab.length > 30 ? lab.slice(0, 29) + '…' : lab,
            font: bodyF(env),
            size: ls,
            track: 0.2,
            align: 'left',
            x: W / 2 - m.w / 2,
            y: Math.min(H * 0.95, H / 2 + m.h / 2 + ls * 1.8),
            color: sc.sub,
            alpha: a,
            ghost: false,
          })
        }
        return bb
      },
    },

    contour: {
      w: 0.9,
      tags: ['calm', 'graphic', 'emotional'],
      fits: (n) => n >= 1 && n <= 16,
      enterBias: { blur: 1.3, cut: 1.2, wipe: 1, slice: 0.6 },
      plan: (rng: Rng, _cut, st: StylePack): ContourParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fb: rng.pick(fontsOf(st, ['display'])),
        side: rng.pick([1, -1]),
        rings: rng.int(4, 6),
        speed: rng.range(0.25, 0.5),
        col: rng.pick(['sub', 'accent', 'sub']),
        place: rng.pick(['low', 'center', 'low']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ContourParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const out = tout(env)
        const t0 = strip(cut.text)
        const han = [...t0].filter((c) => isHan(c))
        const big = han.length
          ? han[0]
          : [...t0].filter((c) => !isPunct(c) && !isKana(c))[0] || [...t0][0] || ''
        const bs = Math.min(H * 0.95, W * (port ? 1.05 : 0.7))
        const bx = W / 2 + P.side * W * (port ? 0.12 : 0.2)
        const by = H * 0.5
        const lineC = P.col === 'accent' ? sc.accent : sc.sub
        // 等高线：粗描一根线色、再细一点描一根底色 → 每级只剩一条细线
        const cin = tin(env, 0, 0.5, E.outCubic) * out
        if (env.pass === 'main' && big && cin > 0.01) {
          const K = P.rings
          const gap = bs * 0.03
          const lw = Math.max(1.2, bs * 0.0028)
          const ph = (((env.ltb * P.speed) % 1) + 1) % 1
          const grow = E.outCubic(clamp(lt / 0.9))
          ctx.save()
          ctx.font = fontCSS(P.fb, bs)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineJoin = 'round'
          for (let k = K; k >= 1; k--) {
            const wk = 2 * gap * (k - 1 + ph) * grow + gap * 0.6
            const a = (k === K ? 1 - ph : 1) * (1 - 0.1 * k) * cin
            if (a <= 0.01) continue
            ctx.globalAlpha = a * 0.8
            ctx.strokeStyle = lineC
            ctx.lineWidth = wk + lw
            ctx.strokeText(big, bx, by)
            ctx.globalAlpha = 0.94 * cin
            ctx.strokeStyle = sc.bg
            ctx.lineWidth = Math.max(0.1, wk - lw)
            ctx.strokeText(big, bx, by)
          }
          ctx.globalAlpha = 0.94 * cin
          ctx.fillStyle = sc.bg
          ctx.fillText(big, bx, by)
          ctx.globalAlpha = cin
          ctx.strokeStyle = lineC
          ctx.lineWidth = lw * 1.6
          ctx.strokeText(big, bx, by)
          ctx.restore()
        }
        // 歌词小而不透，落在大字旁边的安静区
        const text = brk(cut.text, port ? 6 : 8)
        const o = { track: 0.06, lead: 1.25 }
        const size = Math.min(fitSize(text, P.font, W * (port ? 0.8 : 0.5), H * 0.3, o), u * 0.12)
        const m = measure({ text, font: P.font, size, ...o })
        const tx = port ? W / 2 : W / 2 - P.side * W * 0.2
        const ty = P.place === 'low' ? H * (port ? 0.78 : 0.7) : H / 2
        const mx = clamp(tx, W * 0.06 + m.w / 2, W * 0.94 - m.w / 2)
        const bb = mainDraw(env, { text, font: P.font, size, x: mx, y: ty, color: sc.fg, ...o })
        const la = tin(env, 0.3, 0.4, E.outCubic) * out
        if (bb && la > 0) {
          const ls = smallSize(env) * 0.9
          env.line(
            [
              [bb.x0, bb.y0 - ls * 1.2],
              [bb.x0 + (bb.x1 - bb.x0) * la, bb.y0 - ls * 1.2],
            ],
            lineC,
            Math.max(1, u * 0.0015),
            0.8,
            false,
          )
          env.draw({
            text: `${big}  ─  No.${lineNo(cut)}`,
            font: monoF(env),
            size: ls,
            track: 0.2,
            align: 'left',
            x: bb.x0,
            y: bb.y0 - ls * 2.3,
            color: sc.sub,
            alpha: la,
            ghost: false,
          })
        }
        return bb
      },
    },

    halftoneBig: {
      w: 0.9,
      tags: ['pop', 'graphic', 'editorial'],
      treat: false,
      emph: 1.3,
      fits: (n) => n >= 1 && n <= 10,
      enterBias: { cut: 1.6, blur: 1, wipe: 1, slice: 0.6, stretch: 0.6, assemble: 0.2 },
      plan: (rng: Rng, _cut, st: StylePack): HalftoneBigParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        mode: rng.pick(['duo', 'duo', 'tone']),
        ang: rng.range(15, 40) * rng.pick([1, -1]),
        shape: rng.pick(['dot', 'dot', 'line']),
        speed: rng.range(0.4, 0.8),
        crop: rng.chance(0.35),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as HalftoneBigParams
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 4 : 5)
        const o = { track: -0.02, lead: 0.98 }
        const fitW = P.crop ? 1.12 : 0.9
        const size = Math.min(fitSize(text, P.font, W * fitW, H * (port ? 0.6 : 0.8), o), u * 0.7)
        const m = measure({ text, font: P.font, size, ...o })
        const dotC = [sc.fg, lightOf(sc)].find((c) => contrast(c, sc.bg) >= 3) || sc.fg
        const duoC =
          [sc.accent, sc.accent2].find((c) => c && contrast(c, sc.bg) >= 1.6 && c !== dotC) ||
          sc.sub
        const it = (): TextItem => ({
          text,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          color: dotC,
          mi: 0,
          ...o,
        })
        if (P.mode === 'duo') {
          const d = size * 0.045
          mainDraw(env, { ...it(), x: W / 2 + d, y: H / 2 + d, color: duoC, ghost: false })
        }
        const cov = coverage(text, P.font, o.lead, o.track)
        if (env.pass !== 'main' || !cov) return mainDraw(env, it())
        // 旋转网屏上的网点：中心落在字里的点才亮，歌词透过这些点画出来
        const pitch = Math.max(6, size * 0.068)
        const a = P.ang * DEG
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        const grow = E.outCubic(clamp(lt / 0.7)) * (1 - 0.6 * E.inCubic(env.pOut))
        const ph = env.ltb * P.speed
        const k = cov.S / size
        const cx = W / 2
        const cy = H / 2
        const R = Math.hypot(m.w, m.h) / 2 + pitch
        const N = Math.ceil(R / pitch)
        ctx.save()
        ctx.beginPath()
        let cnt = 0
        for (let j = -N; j <= N && cnt < 4000; j++)
          for (let i = -N; i <= N && cnt < 4000; i++) {
            const lx = i * pitch
            const ly = j * pitch
            const x = cx + lx * ca - ly * sa
            const y = cy + lx * sa + ly * ca
            const px = Math.round((x - cx) * k + cov.cw / 2)
            const py = Math.round((y - cy) * k + cov.ch / 2)
            if (px < 0 || py < 0 || px >= cov.cw || py >= cov.ch || cov.a[py * cov.cw + px] < 60)
              continue
            const f = (lx / R) * 0.5 + 0.5
            const tone = clamp(0.3 + 0.7 * (0.5 + 0.5 * Math.sin((f * 1.6 - ph) * Math.PI)))
            const rd = pitch * 0.66 * Math.sqrt(tone) * grow
            if (rd < 0.4) continue
            if (P.shape === 'line') {
              const hw = pitch * 0.5
              const hh = rd * 0.72
              ctx.moveTo(x - hw * ca + hh * sa, y - hw * sa - hh * ca)
              ctx.lineTo(x + hw * ca + hh * sa, y + hw * sa - hh * ca)
              ctx.lineTo(x + hw * ca - hh * sa, y + hw * sa + hh * ca)
              ctx.lineTo(x - hw * ca - hh * sa, y - hw * sa + hh * ca)
              ctx.closePath()
            } else {
              ctx.moveTo(x + rd, y)
              ctx.arc(x, y, rd, 0, TAU)
            }
            cnt++
          }
        if (!cnt) ctx.rect(-10, -10, 1, 1)
        ctx.clip()
        const bb = mainDraw(env, {
          ...it(),
          stroke: pitch * 0.5,
          strokeColor: dotC,
          strokeUnder: true,
        })
        ctx.restore()
        return bb
      },
    },

    stencil: {
      w: 0.8,
      tags: ['graphic', 'pop', 'editorial'],
      treat: false,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 1.8, wipe: 1.4, blur: 0.8, slice: 0.4, pop: 0.4, assemble: 0.2 },
      plan: (rng: Rng, _cut, st: StylePack): StencilParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        col: rng.pick(['accent', 'fg', 'accent']),
        drips: rng.int(1, 3),
        marks: rng.chance(0.75),
        dir: rng.pick([1, -1]),
        tilt: rng.range(-3, 3),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as StencilParams
        const s = cut.seed
        const u = U(env)
        const lt = env.lt
        const port = isPort(env)
        const text = brk(cut.text, port ? 4 : 7)
        const o = { track: 0.08, lead: 1.12 }
        const size = Math.min(fitSize(text, P.font, W * 0.84, H * (port ? 0.5 : 0.56), o), u * 0.32)
        const m = measure({ text, font: P.font, size, ...o })
        const out = tout(env)
        const col = P.col === 'accent' && contrast(sc.accent, sc.bg) >= 1.8 ? sc.accent : sc.fg
        const it = (): TextItem => ({
          text,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          rot: P.tilt,
          color: col,
          mi: 0,
          ...o,
        })
        const x0 = W / 2 - m.w / 2
        const x1 = W / 2 + m.w / 2
        const y0 = H / 2 - m.h / 2
        const y1 = H / 2 + m.h / 2
        // 静止态的字形框（项目空间 → 设计空间，带上倾角）
        const lay = m.lay
        const tr = P.tilt * DEG
        const ct = Math.cos(tr)
        const st2 = Math.sin(tr)
        type Box0 = { lx: number; ly: number; w: number; h: number; x: number; y: number }
        const boxes: Box0[] = []
        for (const g of lay)
          if (g.ch !== ' ' && g.ch !== '\u3000' && !isPunct(g.ch))
            boxes.push({
              lx: g.x,
              ly: g.y,
              w: g.w,
              h: g.h,
              x: W / 2 + g.x * ct - g.y * st2,
              y: H / 2 + g.x * st2 + g.y * ct,
            })
        const sw = clamp(cut.dur * 0.3, 0.35, 0.9)
        const f = E.inOutSine(clamp((lt - 0.05) / sw))
        const head =
          P.dir > 0
            ? lerp(x0 - size * 0.3, x1 + size * 0.3, f)
            : lerp(x1 + size * 0.3, x0 - size * 0.3, f)
        if (P.marks) {
          const a = tin(env, 0, 0.35, E.outCubic) * out
          const L = size * 0.18
          const lw = Math.max(1, u * 0.0016)
          const pm = size * 0.28
          for (const [cx, cy] of [
            [x0 - pm, y0 - pm],
            [x1 + pm, y0 - pm],
            [x1 + pm, y1 + pm],
            [x0 - pm, y1 + pm],
          ] as Pt[]) {
            env.line(
              [
                [cx - L, cy],
                [cx + L, cy],
              ],
              sc.sub,
              lw,
              a,
              false,
            )
            env.line(
              [
                [cx, cy - L],
                [cx, cy + L],
              ],
              sc.sub,
              lw,
              a,
              false,
            )
            env.circle(cx, cy, L * 0.45, null, sc.sub, lw, a, false)
          }
          env.draw({
            text: `No.${lineNo(cut)}  /  ${fmtTime(cut.start)}`,
            font: monoF(env),
            size: smallSize(env),
            track: 0.25,
            align: 'left',
            x: x0 - pm + L * 1.4,
            y: y0 - pm,
            color: sc.sub,
            alpha: a,
            ghost: false,
          })
        }
        // 裁剪：喷嘴已喷到的一侧，再挖掉模板的桥（偶奇规则成洞）
        ctx.save()
        ctx.beginPath()
        if (P.dir > 0) ctx.rect(-W, -H, head + W, H * 3)
        else ctx.rect(head, -H, W * 2, H * 3)
        ctx.clip()
        ctx.beginPath()
        ctx.rect(-W, -H, W * 3, H * 3)
        ctx.translate(W / 2, H / 2)
        ctx.rotate(tr)
        const bw = size * 0.05
        boxes.forEach((b, i) => {
          const vx = b.lx + ((i % 3) - 1) * b.w * 0.06
          ctx.rect(vx - bw / 2, b.ly - b.h * 0.62, bw, b.h * 1.24)
          if (i % 2) {
            const hy = b.ly - b.h * 0.06 - bw / 2
            ctx.rect(b.lx - b.w * 0.62, hy, vx - bw / 2 - (b.lx - b.w * 0.62), bw)
            ctx.rect(vx + bw / 2, hy, b.lx + b.w * 0.62 - (vx + bw / 2), bw)
          }
        })
        ctx.setTransform(
          ctx
            .getTransform()
            .rotate(-P.tilt)
            .translate(-W / 2, -H / 2),
        )
        ctx.clip('evenodd')
        const bb = mainDraw(env, it())
        ctx.restore()
        if (env.pass !== 'main') return bb
        // 过喷的雾、流挂，以及正在喷的那一团
        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.rotate(tr)
        ctx.translate(-W / 2, -H / 2)
        ctx.fillStyle = col
        ctx.globalAlpha = 0.5 * out
        ctx.beginPath()
        boxes.forEach((b, i) => {
          for (let k = 0; k < 22; k++) {
            const ang = r(s, i, k, 1) * TAU
            const rad = 0.5 + r(s, i, k, 2) * 0.35
            const x = W / 2 + b.lx + Math.cos(ang) * b.w * rad * 0.62
            const y = H / 2 + b.ly + Math.sin(ang) * b.h * rad * 0.62
            if ((P.dir > 0 && x > head) || (P.dir < 0 && x < head)) continue
            const rd = size * (0.004 + r(s, i, k, 3) * 0.008)
            ctx.moveTo(x + rd, y)
            ctx.arc(x, y, rd, 0, TAU)
          }
        })
        ctx.fill()
        ctx.globalAlpha = out
        for (let d = 0; d < P.drips && boxes.length; d++) {
          const b = boxes[hash(s, d, 7) % boxes.length]
          const dx = W / 2 + b.lx + rs(s, d, 8) * b.w * 0.3
          const top = H / 2 + b.ly + b.h * 0.35
          const t1 =
            0.3 +
            d * 0.25 +
            (P.dir > 0 ? (dx - x0) / Math.max(1, x1 - x0) : (x1 - dx) / Math.max(1, x1 - x0)) * sw
          const L = size * rr(0.25, 0.55, s, d, 9) * E.outCubic(clamp((lt - t1) / 1.4))
          if (L <= 1) continue
          const w0 = size * 0.035
          ctx.beginPath()
          ctx.moveTo(dx - w0 / 2, top)
          ctx.lineTo(dx + w0 / 2, top)
          ctx.lineTo(dx + w0 * 0.35, top + L)
          ctx.lineTo(dx - w0 * 0.35, top + L)
          ctx.closePath()
          ctx.fill()
          ctx.beginPath()
          ctx.arc(dx, top + L, w0 * 0.6, 0, TAU)
          ctx.fill()
        }
        ctx.restore()
        if (f > 0 && f < 1) {
          for (let k = 0; k < 24; k++) {
            const yy = lerp(y0, y1, r(s, k, env.step, 11))
            const xx = head + rs(s, k, env.step, 12) * size * 0.25
            env.circle(xx, yy, size * (0.01 + r(s, k, 13) * 0.02), col, null, 0, 0.35 * out, false)
          }
        }
        return bb
      },
    },
  },
}
