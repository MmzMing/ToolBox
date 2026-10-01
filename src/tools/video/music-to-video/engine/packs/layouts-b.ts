/**
 * 表达式包 layoutsB：动力学 / 版式设计取向的构图（文字雨、吊挂、环绕、隧道、
 * 词云、贴纸、键帽、翻页牌、点阵屏、胶带…），移植自 JIZURA 的 src/11p_layoutsB.js。
 *
 * 1:1 约束：部件 key、w/tags/busy/portrait/emph/treat/enterBias 与全部数值常量、
 * 缓动、hash 种子都照搬原实现——同 seed + 同歌词必须渲染出同一支视频。
 * 包名 `layoutsB` 由 registry.ts 统一写进 def.pack，这里不手写。
 */
import type {
  BBox,
  CharT,
  Cut,
  Env,
  LaidGlyph,
  PackParts,
  Rng,
  Scheme,
  StylePack,
  TextItem,
} from '../types'
import { ENTER, EXIT } from '../anim'
import { ctxOf, makeCanvas } from '../canvas'
import { itemBox } from '../draw'
import { FONTS, fontCSS } from '../fonts'
import { metrics } from '../glyphs'
import { fontsOf, mainDraw, unionBB } from '../layouts'
import { chunkText, fitSize, layoutText, measure, segments, splitLines } from '../text-layout'
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
  noise1,
  r,
  rgba,
  rr,
  rs,
  smooth,
} from '../util'

/* ------------------------------------------------------------------ 助手 */

/** 去掉所有空白 */
const clean = (t: string): string => String(t || '').replace(/\s+/g, '')

/** 逐字槽位：保留拉丁歌词的词间空格，值为 ' ' 的槽位表示空一拍（不画字） */
const slotsOf = (t: string): string[] => [
  ...String(t || '')
    .trim()
    .replace(/\s+/g, ' '),
]

/**
 * 一行小号副标题。JIZURA这里是「假名转罗马音」，中文没有对应物，
 * 按 note → lineText 兜底（角色不变：仍是一行与主文字不同的小字）。
 */
const romaOf = (cut: Cut): string | null => {
  const t = ((cut.note || '').trim() || clean(cut.lineText || '')).trim()
  return t && t !== clean(cut.text) ? t.toUpperCase() : null
}

/** splitLines 的变体：绝不让一行只剩下标点 */
const splitL = (t: string, per: number): string => {
  const ls = splitLines(t, per).split('\n')
  const out: string[] = []
  for (const l of ls) {
    if (out.length && [...l].every((c) => isPunct(c) || c === ' ')) out[out.length - 1] += l
    else out.push(l)
  }
  return out.join('\n')
}

const monoF = (env: Env): string => env.st.fonts.mono[0] || 'mono'
const inE = (env: Env, d = 0.35, delay = 0): number => E.outExpo(clamp((env.lt - delay) / d))
const outK = (env: Env): number => 1 - E.inCubic(env.pOut)
/** 大块底板只在飞入的那一瞬带色散残影（绝不拖进下一个镜头） */
const gIn = (env: Env): boolean => env.lt < 0.6 && env.pOut <= 0
/** 字待在自己的键帽 / 格子 / 底板里时，只能配不让它位移的保持动效 */
const plateHold = (env: Env): boolean =>
  !['still', 'jitter', 'breathe', 'glitchtick'].includes(env.cut?.hold || 'still')
const bbRect = (x0: number, y0: number, x1: number, y1: number): BBox => ({
  x0,
  y0,
  x1,
  y1,
  cx: (x0 + x1) / 2,
  cy: (y0 + y1) / 2,
  boxes: [],
})
/** 让 mainDraw 在本地时间 t 才开始这一项的入场，所需的运动序号 */
const miAt = (env: Env, t: number): number =>
  Math.max(0, t) / Math.max(0.005, env.cut?.stagger || 0.04)

/** 颜色 `fill` 底板上对比度最好的配色方案色 */
const _onc = new Map<string, string>()
const onCol = (sc: Scheme, fill: string): string => {
  const key = fill + sc.bg + sc.fg + sc.ink + sc.accent
  const hit = _onc.get(key)
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
  if (_onc.size > 200) _onc.clear()
  _onc.set(key, v)
  return v
}

/** 从配色里挑一个读得过背景的颜色（做底板、色带） */
const plateCol = (sc: Scheme, pref: readonly string[]): string => {
  for (const c of pref) if (c && contrast(c, sc.bg) >= 1.6) return c
  return sc.fg
}

type GlyphPt = {
  ch: string
  x: number
  y: number
  w: number
  h: number
  li: number
  ci: number
  i: number
}

/** 排好版的文字项的字形中心（设计空间，未旋转） */
const glyphPts = (it: TextItem): GlyphPt[] => {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const out: GlyphPt[] = []
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue
    out.push({
      ch: g.ch,
      x: it.x + g.x * sx,
      y: it.y + g.y * sy,
      w: g.w * sx,
      h: g.h * sy,
      li: g.li,
      ci: g.ci,
      i: out.length,
    })
  }
  return out
}

type PathPoint = { x: number; y: number; rot?: number; s?: number; a?: number; color?: string }

/** 一串字形各自按 fn(i) 定位（只有一项、只走主通道） */
const pathText = (
  env: Env,
  chars: string[],
  font: string,
  size: number,
  fn: (i: number, g: LaidGlyph) => PathPoint | null,
  extra?: Partial<TextItem>,
): void => {
  if (!chars.length || size < 1) return
  const it: TextItem = { text: chars.join(''), font, size, x: 0, y: 0, ghost: false, ...extra }
  it._lay = layoutText(it)
  it.charFn = (i, g): CharT => {
    const q = fn(i, g)
    if (!q) return { hide: true }
    return {
      dx: q.x - g.x,
      dy: q.y - g.y,
      rot: q.rot || 0,
      s: q.s ?? 1,
      a: q.a ?? 1,
      color: q.color,
    }
  }
  env.draw(it)
}

/** 主文字断行：竖屏用短行 */
const mainLines = (text: string, W: number, H: number, perL = 11, perP = 5): string => {
  const t = String(text || '').trim()
  const n = glyphCount(t)
  const per = W < H ? perP : perL
  if (n <= per) return t
  return splitL(t, Math.ceil(n / Math.ceil(n / per)))
}

/**
 * 滚动杂字池：JIZURA取片假名表的一半，这里换成《千字文》起手的常用汉字，
 * 角色相同（雨柱 / 老虎机 / 翻页板上滚动的无意义字）。
 */
const SCRAMBLE =
  '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈'

const _pool = new Map<string, string[]>()
const poolOf = (cut: Cut): string[] => {
  const key = cut.lineText + '|' + cut.text
  let p = _pool.get(key)
  if (!p) {
    const own = [...clean((cut.lineText || '') + cut.text)].filter(
      (c) => !isLatin(c) && !isPunct(c),
    )
    p = own.concat([...SCRAMBLE].filter((_c, i) => i % 2 === 0))
    if (_pool.size > 100) _pool.clear()
    _pool.set(key, p)
  }
  return p
}

/** ctx 上的圆角矩形路径（只建路径，不绘制） */
const rrPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void => {
  const q = Math.max(0, Math.min(rad, w / 2, h / 2))
  ctx.moveTo(x + q, y)
  ctx.arcTo(x + w, y, x + w, y + h, q)
  ctx.arcTo(x + w, y + h, x, y + h, q)
  ctx.arcTo(x, y + h, x, y, q)
  ctx.arcTo(x, y, x + w, y, q)
  ctx.closePath()
}

type Cell = { i: number; ch: string; x: number; y: number; row: number; col: number }

/** 逐字版式用的等大格子行：返回格心坐标与格子边长 */
const cellRows = (
  chs: string[],
  W: number,
  H: number,
  maxPerRow: number,
  cellAsp: number,
  maxK: number,
  gapK = 0.14,
  stagger = false,
): { cells: Cell[]; k: number; rows: number } => {
  const n = chs.length
  const rows = Math.ceil(n / maxPerRow)
  const per = Math.ceil(n / rows)
  const wk = per + (per - 1) * gapK + (stagger && rows > 1 ? 0.5 : 0)
  const hk = rows * cellAsp + (rows - 1) * gapK * 1.6
  const k = Math.min((W * 0.86) / wk, (H * 0.7) / hk, maxK)
  const out: Cell[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per)
    const j = i - row * per
    const cnt = Math.min(per, n - row * per)
    const x =
      W / 2 +
      (j - (cnt - 1) / 2) * k * (1 + gapK) +
      (stagger && rows > 1 ? (row % 2 ? 0.25 : -0.25) * k : 0)
    const y = H / 2 + (row - (rows - 1) / 2) * k * (cellAsp + gapK * 1.6)
    out.push({ i, ch: chs[i], x, y, row, col: j })
  }
  return { cells: out, k, rows }
}

const stickerPath = (
  ctx: CanvasRenderingContext2D,
  shape: string,
  w: number,
  h: number,
  grow: number,
  _seed: number,
): void => {
  const x = -w / 2 - grow
  const y = -h / 2 - grow
  const W2 = w + grow * 2
  const H2 = h + grow * 2
  ctx.beginPath()
  if (shape === 'circle') ctx.arc(0, 0, Math.max(W2, H2) / 2, 0, TAU)
  else if (shape === 'burst') {
    const R = (Math.max(W2, H2) / 2) * 1.08
    const m = 16
    for (let i = 0; i < m * 2; i++) {
      const a = (i / (m * 2)) * TAU
      const rad = i % 2 ? R * 0.84 : R
      if (i) ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
      else ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad)
    }
    ctx.closePath()
  } else rrPath(ctx, x, y, W2, H2, shape === 'pill' ? H2 / 2 : Math.min(W2, H2) * 0.2)
}

type CloudWord = {
  text: string
  font: string
  size: number
  x: number
  y: number
  vertical: boolean
  delay: number
  col: string
  a: number
  outline: boolean
}

/** 单词云的一次布局（耗时，按 seed+尺寸+文字缓存） */
function buildCloud(env: Env, cut: Cut, mt: string, size: number): CloudWord[] {
  const { W, H } = env
  const P = cut.params as unknown as WordCloudParams
  const s = cut.seed
  const M = Math.min(W, H)
  const txt = clean(cut.text)
  const pool: string[] = []
  const add = (w0: string): void => {
    const w = String(w0 || '').trim()
    if (w && glyphCount(w) <= 14 && !pool.includes(w) && ![...w].every((c) => isPunct(c)))
      pool.push(w)
  }
  chunkText(cut.lineText || cut.text).forEach(add)
  ;(cut.words || []).forEach(add)
  segments(cut.lineText || cut.text).forEach((g) => {
    const g2 = g.trim()
    if (glyphCount(g2) >= 2 || [...g2].some((c) => isHan(c))) add(g2)
  })
  const rom = romaOf(cut)
  if (rom) add(rom)
  if (cut.note) add(cut.note)
  add(txt)
  ;[...txt].filter((c) => isHan(c)).forEach(add)
  if (glyphCount(cut.lineText || '') <= 14) add(cut.lineText)
  if (!pool.length) pool.push(txt || '·')
  const mm = measure({ text: mt, font: P.font, size, track: 0.03, lead: 1.1 })
  const boxes = [
    [
      W / 2 - mm.w / 2 - size * 0.25,
      H / 2 - mm.h / 2 - size * 0.18,
      W / 2 + mm.w / 2 + size * 0.25,
      H / 2 + mm.h / 2 + size * 0.18,
    ],
  ]
  const out: CloudWord[] = []
  const port = W < H
  const stretchX = port ? 0.75 : P.wide
  const stretchY = port ? 1.3 : 1
  const maxR = Math.hypot(W, H) * 0.55
  let acc = 0
  for (let k = 0; k < 70 && out.length < 44; k++) {
    const word = pool[k % pool.length]
    const latin = /[A-Za-z]/.test(word)
    const vertical = !latin && glyphCount(word) <= 6 && r(s, k, 3) < P.vert
    const tier = Math.pow(0.95, out.length)
    let fs = Math.max(
      M * 0.018,
      Math.min(
        (W * 0.4) / Math.max(1.5, glyphCount(word)),
        size * 0.6,
        M * 0.125 * tier * (0.65 + 0.7 * r(s, k, 4)),
      ),
    )
    const font = P.fonts[k % P.fonts.length]
    const it = { text: word, font, size: fs, track: 0.02, vertical }
    let m = measure(it)
    const maxW = W * 0.9
    const maxH = H * 0.9
    if (m.w > maxW || m.h > maxH) {
      const f = Math.min(maxW / m.w, maxH / m.h)
      fs *= f
      it.size = fs
      m = measure(it)
    }
    const pad = fs * 0.12
    const w2 = m.w / 2 + pad
    const h2 = m.h / 2 + pad
    const a0 = r(s, k, 5) * TAU
    let placed: number[] | null = null
    for (let t = 0; t < 520; t++) {
      const ang = a0 + t * 0.42
      const rad = (t / 520) * maxR
      const x = W / 2 + Math.cos(ang) * rad * stretchX
      const y = H / 2 + Math.sin(ang) * rad * stretchY * 0.8
      if (x - w2 < W * 0.035 || x + w2 > W * 0.965 || y - h2 < H * 0.045 || y + h2 > H * 0.955)
        continue
      let hit = false
      for (const b of boxes)
        if (x - w2 < b[2] && x + w2 > b[0] && y - h2 < b[3] && y + h2 > b[1]) {
          hit = true
          break
        }
      if (!hit) {
        placed = [x, y]
        break
      }
    }
    if (!placed) {
      acc++
      if (acc > 16) break
      continue
    }
    boxes.push([placed[0] - w2, placed[1] - h2, placed[0] + w2, placed[1] + h2])
    const d = Math.hypot((placed[0] - W / 2) / W, (placed[1] - H / 2) / H)
    const idx = out.length
    out.push({
      text: word,
      font,
      size: fs,
      x: placed[0],
      y: placed[1],
      vertical,
      delay: 0.06 + d * 0.9 + idx * 0.012,
      col:
        [4, 9, 15].indexOf(idx) >= 0 && [4, 9, 15].indexOf(idx) < P.accentN
          ? 'a'
          : idx % 2
            ? 's'
            : 'f',
      a: idx % 2 ? 0.8 : 0.5 + 0.2 * tier,
      outline: r(s, k, 7) < P.outlineK,
    })
  }
  return out
}

const _cloud = new Map<string, CloudWord[]>()

/* ---------- dotMatrix 的 LED 点阵采样 ---------- */

type DotTile = { cv: HTMLCanvasElement; T: number }
type DotSample = { cols: number; rows: number; lit: number[]; fscale: number; D: number }

const _dm = new Map<string, DotSample>()
const _dmGrid = new Map<string, DotTile>()
let _dmCv: HTMLCanvasElement | null = null

/** 未点亮的 LED 网格：一种颜色/形状一张小图，靠 pattern 平铺对齐网格 */
const dotTile = (col: string, shape: string): DotTile => {
  const key = col + '|' + shape
  const hit = _dmGrid.get(key)
  if (hit) return hit
  const T = 64
  const cv = makeCanvas(T, T)
  const x = ctxOf(cv)
  x.fillStyle = col
  x.beginPath()
  const rad = T * (shape === 'round' ? 0.38 : 0.4)
  if (shape === 'round') x.arc(T / 2, T / 2, rad, 0, TAU)
  else x.rect(T / 2 - rad, T / 2 - rad, rad * 2, rad * 2)
  x.fill()
  if (_dmGrid.size > 24) _dmGrid.clear()
  const t: DotTile = { cv, T }
  _dmGrid.set(key, t)
  return t
}

/** 把文字栅格化后按 D 像素一格采样出亮点坐标（缓存，避免逐帧 getImageData） */
const dotSample = (mt: string, font: string, D: number, lead: number): DotSample => {
  const key = mt + '|' + font + '|' + D + '|' + lead
  const hit = _dm.get(key)
  if (hit) return hit
  const SS = 4
  const fpx = D * SS * 0.94
  const lay = layoutText({ text: mt, font, size: fpx, lead })
  const cols = Math.ceil(lay.W / SS) + 2
  const rows = Math.ceil(lay.H / SS) + 2
  const cw = cols * SS
  const ch = rows * SS
  if (!_dmCv) _dmCv = makeCanvas(cw, ch)
  const cv = _dmCv
  cv.width = cw
  cv.height = ch
  const x = ctxOf(cv, { willReadFrequently: true })
  x.clearRect(0, 0, cw, ch)
  x.font = fontCSS(font, fpx)
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillStyle = '#fff'
  for (const g of lay) {
    if (g.ch !== ' ' && g.ch !== '　') x.fillText(g.ch, cw / 2 + g.x, ch / 2 + g.y)
  }
  const id = x.getImageData(0, 0, cw, ch).data
  const lit: number[] = []
  for (let r0 = 0; r0 < rows; r0++)
    for (let c0 = 0; c0 < cols; c0++) {
      let a = 0
      for (let yy = 0; yy < SS; yy++)
        for (let xx = 0; xx < SS; xx++) a += id[((r0 * SS + yy) * cw + c0 * SS + xx) * 4 + 3]
      if (a / (SS * SS * 255) > 0.38) lit.push(c0, r0)
    }
  const res: DotSample = { cols, rows, lit, fscale: 0.94 * D, D }
  if (_dm.size > 40) _dm.clear()
  _dm.set(key, res)
  return res
}

/* ---------- 胶带：从 x=0 到 x=L 的撕口纸带路径 ---------- */

const tapePath = (
  ctx: CanvasRenderingContext2D,
  L: number,
  h: number,
  seed: number,
  k: number,
): void => {
  const m = 7
  const tooth = h * 0.09
  ctx.beginPath()
  ctx.moveTo(0, -h / 2)
  ctx.lineTo(L, -h / 2)
  for (let i = 1; i <= m; i++)
    ctx.lineTo(
      L + (i % 2 ? tooth : -tooth * 0.3) * (0.6 + 0.8 * r(seed, k, i, 1)),
      -h / 2 + (h * i) / m,
    )
  ctx.lineTo(0, h / 2)
  for (let i = m - 1; i >= 1; i--)
    ctx.lineTo(
      (i % 2 ? -tooth : tooth * 0.3) * (0.6 + 0.8 * r(seed, k, i, 2)),
      -h / 2 + (h * i) / m,
    )
  ctx.closePath()
}

/* ---------- 书体见本用的展示字体池 ---------- */

/** 本仓库字体目录里的等价物（JIZURA是一串日文面） */
const SPEC_FONTS = [
  'sans_black',
  'serif',
  'kuaile',
  'pixel',
  'mashan',
  'qingke',
  'xiaowei',
  'liujian',
  'serif_light',
  'sans_light',
  'serif_black',
  'zhimang',
  'serif_bold',
]

/* ---------------------------------------------------------- 各版式参数 */

type RainParams = {
  font: string
  rf: string
  orient: string
  density: number
  speed: number
  tint: string
  order: string
}
type HangingParams = {
  font: string
  shape: string
  dir: number
  tag: boolean
  rail: boolean
  amp: number
  kick: number
  ph: number
}
type OrbitParams = {
  font: string
  fo: string
  variant: string
  tilt: number
  speed: number
  unit: string
}
type TunnelParams = {
  font: string
  fontC: string
  q: number
  speed: number
  style: string
  unit: string
  persp: boolean
}
type WordCloudParams = {
  font: string
  fonts: string[]
  vert: number
  accentN: number
  outlineK: number
  wide: number
}
type BounceLineParams = {
  font: string
  mode: string
  hop: number
  tempo: number
  shadow: boolean
  line: string
  tilt: boolean
}
type ElasticParams = {
  font: string
  orient: string
  ang: number
  every: number
  amp: number
  anchor: string
}
type CrossBandsParams = {
  font: string
  fb: string
  ang: number
  plate: string
  speed: number
  swap: boolean
  sep: string
}
type StickerBombParams = {
  font: string
  fs: string
  main: string
  cnt: number
  rot: number
  spin: number
}
type NeonParams = {
  font: string
  tube: string
  frame: string
  flick: boolean
  sub: boolean
}
type KeycapsParams = {
  font: string
  style: string
  stagger: boolean
  accent: number
  legend: boolean
  plate: boolean
}
type BubblesParams = {
  font: string
  style: string
  rise: number
  wob: number
  motes: boolean
}
type SlotMachineParams = {
  font: string
  style: string
  v: number
  line: boolean
}
type FlipBoardParams = {
  font: string
  header: boolean
  flips: number
  style: string
}
type CreditsParams = {
  font: string
  fc: string
  variant: string
  speed: number
  off: number
}
type ZoomRepeatParams = {
  font: string
  dir: number
  style: string
  twist: number
  q: number
  speed: number
}
type SplitHalvesParams = {
  font: string
  variant: string
  dir: number
  line: string
  gap: number
}
type ColumnsBigParams = {
  font: string
  fs: string
  side: string
  rule: boolean
  mark: string
  off: number
}
type CircleWordsParams = {
  font: string
  fr: string
  rings: number
  speed: number
  dir: number
  ticks: boolean
  guides: boolean
}
type DotMatrixParams = {
  font: string
  reveal: string
  panel: boolean
  col: string
  shape: string
}
type DepthStackParams = {
  font: string
  ang: number
  copies: number
  dist: number
  style: string
  sway: boolean
}
type TypeSpecimenParams = {
  main: string
  fonts: string[]
  grid: string
  num: number
}
type KanjiFocusParams = {
  font: string
  fs: string
  mode: string
  pos: string
  low: boolean
  dots: boolean
  dir: number
}
type HalfVerticalParams = { font: string; shape: string; guide: string }
type CurtainParams = {
  font: string
  variant: string
  col: string
  drape: boolean
  pleats: boolean
}
type EqualizerParams = {
  font: string
  style: string
  thin: number
  peaks: boolean
  col: string
  tempo: number
}
type TapeParams = {
  font: string
  fs: string
  variant: string
  ang: number
  col: string
  piece: boolean
  lines: boolean
}

export const pack: PackParts = {
  layout: {
    /* ============================================================ 1 文字雨 */
    rain: {
      w: 0.9,
      tags: ['glitch', 'graphic', 'emotional'],
      busy: true,
      fits: (n) => n >= 1 && n <= 16,
      enterBias: {
        cut: 2.4,
        flicker: 1.4,
        scramble: 1.4,
        blur: 1.1,
        type: 0.3,
        wipe: 0.4,
        slice: 0.4,
        stretch: 0.5,
        assemble: 0.5,
      },
      plan: (rng: Rng, cut, st: StylePack): RainParams => {
        const port = cut.H > cut.W
        // 旧 'dot' 面在本仓库叫 'pixel'
        const monos = st.fonts.mono.filter((k) => k === 'pixel')
        return {
          font: rng.pick(fontsOf(st, ['display', 'serif'])),
          rf: monos.length && rng.chance(0.5) ? 'pixel' : rng.pick(fontsOf(st, ['body'])),
          orient: cut.n <= 7 && rng.chance(port ? 0.6 : 0.3) ? 'v' : 'h',
          density: rng.range(0.5, 0.72),
          speed: rng.range(0.85, 1.25),
          tint: rng.pick(['sub', 'sub', 'accent']),
          order: rng.pick(['ltr', 'random', 'random']),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as RainParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const vert = P.orient === 'v'
        const mt = vert ? clean(cut.text) : mainLines(cut.text, W, H, 11, 6)
        const geom = { track: 0.1, lead: 1.25, vertical: vert }
        const size = Math.min(
          fitSize(mt, P.font, W * (vert ? 0.5 : 0.84), H * (vert ? 0.8 : 0.5), geom),
          vert ? H * 0.15 : H * 0.24,
        )
        const base: TextItem = { text: mt, font: P.font, size, x: W / 2, y: H / 2, ...geom }
        const gl = glyphPts(base)
        const n = gl.length
        const lb = itemBox(base)
        const kx0 = lb.x0 - size * 0.3
        const kx1 = lb.x1 + size * 0.3
        const ky0 = lb.y0 - size * 0.3
        const ky1 = lb.y1 + size * 0.3
        // --- 背景雨柱：静止字形网格 + 每列一个向下扫过的亮头
        const pool = poolOf(cut)
        const NP = pool.length
        const cell = clamp(M * 0.036, 16, 64)
        const cols = Math.floor(W / cell)
        const rows = Math.ceil(H / cell)
        const ox = (W - cols * cell) / 2
        const bgA = E.outCubic(clamp(env.ltb / 0.35)) * outK(env)
        const rsize = cell * 0.72
        const trk = (cell - rsize) / rsize
        const tail = P.tint === 'accent' ? sc.accent : sc.sub
        if (bgA > 0.01) {
          for (let c = 0; c < cols; c++) {
            if (r(s, c, 1) > P.density) continue
            const v = rr(8, 16, s, c, 2) * P.speed
            const Ls = rr(6, 15, s, c, 3)
            const per = rows + Ls + rr(2, rows * 0.8, s, c, 4)
            const hy = ((env.ltb * v + r(s, c, 5) * per) % per) - 1
            const r0 = Math.max(0, Math.ceil(hy - Ls))
            const r1 = Math.min(rows - 1, Math.floor(hy))
            if (r1 < r0) continue
            const x = ox + (c + 0.5) * cell
            const chs: string[] = []
            for (let k = r0; k <= r1; k++)
              chs.push(pool[hash(s, c, k, Math.floor((env.step + (hash(s, k, c) & 15)) / 14)) % NP])
            const inK = x > kx0 && x < kx1
            env.draw({
              text: chs.join(''),
              font: P.rf,
              size: rsize,
              track: trk,
              vertical: true,
              align: 'left',
              x,
              y: r0 * cell + cell * 0.5 - rsize * 0.5,
              color: sc.sub,
              ghost: false,
              alpha: bgA,
              charFn: (i) => {
                const k = r0 + i
                const d = hy - k
                let a = d < 1 ? 1 : 0.1 + Math.pow(1 - d / Ls, 1.4) * 0.6
                const cy = (k + 0.5) * cell
                if (inK && cy > ky0 && cy < ky1) a *= 0.22
                return d < 1 ? { a, color: sc.fg } : { a }
              },
            })
          }
        }
        // --- 歌词：每个字由自己的雨柱送到位置后锁死
        const span = clamp(cut.dur * 0.2, 0.1, 0.5)
        const fd = clamp(cut.dur * 0.1, 0.14, 0.26)
        const rank = gl.map((_g, i) => i)
        if (P.order === 'random') rank.sort((a, b) => r(s, a, 31) - r(s, b, 31))
        const pos = new Array<number>(n)
        rank.forEach((gi, k) => {
          pos[gi] = k
        })
        let bb: BBox | null = null
        const trailN = 8
        const ts = clamp(size * 0.32, cell * 0.8, cell * 1.5)
        const tsp = ts * 1.12
        gl.forEach((g, i) => {
          const k = vert ? n - 1 - i : pos[i]
          const ta = 0.05 + fd + (n > 1 ? k / (n - 1) : 0) * span
          const u = (lt - (ta - fd)) / fd
          if (u > 0 && u < 2) {
            const e = E.inQuad(Math.min(1, u))
            const yh = lerp(-tsp * 2, g.y, e)
            const fade = u < 1 ? 1 : 1 - (u - 1)
            const chs: string[] = []
            for (let j = trailN - 1; j >= 0; j--) chs.push(pool[hash(s, i, j, env.step >> 1) % NP])
            const hs = u < 1 ? lerp(ts, size, Math.pow(u, 3)) : size
            env.draw({
              text: chs.join(''),
              font: P.rf,
              size: ts,
              track: 0.12,
              vertical: true,
              align: 'left',
              x: g.x,
              y: yh - hs * 0.5 - trailN * tsp,
              color: tail,
              ghost: false,
              alpha: fade * outK(env),
              charFn: (j) => ({ a: Math.pow((j + 1) / trailN, 1.6) * 0.95 }),
            })
            if (u < 1)
              env.draw({
                text: g.ch,
                font: P.font,
                size: hs,
                x: g.x,
                y: yh,
                vertical: vert,
                color: sc.fg,
                ghost: false,
                alpha: 0.6 + 0.4 * u,
              })
          }
          const fl = clamp((lt - ta) / 0.45)
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: g.ch,
              font: P.font,
              size,
              x: g.x,
              y: g.y,
              vertical: vert,
              color: fl < 1 ? mix(sc.accent, sc.fg, E.outCubic(fl)) : sc.fg,
              mi: miAt(env, ta),
            }),
          )
        })
        return bb
      },
    },

    /* ============================================================ 2 吊挂 */
    hanging: {
      w: 0.9,
      tags: ['pop', 'calm', 'emotional'],
      treat: 'safe',
      portrait: 0.8,
      fits: (n) => n >= 2 && n <= 12,
      enterBias: { drop: 1.8, pop: 1.3, cut: 1.5, slice: 0.3, wipe: 0.3, stretch: 0.4 },
      plan: (rng: Rng, _cut, st: StylePack): HangingParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        shape: rng.pick(['arc', 'wave', 'random', 'stair']),
        dir: rng.pick([1, -1]),
        tag: rng.chance(0.35),
        rail: rng.chance(0.6),
        amp: rng.range(0.06, 0.11),
        kick: rng.range(0.16, 0.26),
        ph: rng.range(0, 6),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as HangingParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const chars = slotsOf(cut.text)
        const n = chars.length
        if (!n) return null
        const rowsN = W < H && n > 5 ? 2 : 1
        const per = Math.ceil(n / rowsN)
        const sp = W * (rowsN > 1 ? 0.84 / (per + 0.5) : 0.88 / per)
        const size = Math.min(sp * (P.tag ? 0.76 : 0.84), M * 0.19)
        const tagW = size * 1.12
        const tagH = size * 1.36
        const csize = P.tag ? size * 0.8 : size
        const railY = P.rail ? H * 0.075 : -2
        const out = outK(env)
        const inA = inE(env, 0.45)
        if (P.rail) {
          env.line(
            [
              [W * 0.5 - W * 0.52 * inA, railY],
              [W * 0.5 + W * 0.52 * inA, railY],
            ],
            sc.sub,
            Math.max(1.2, M * 0.0022),
            0.8 * out,
            false,
          )
        }
        const gap = clamp((cut.dur * 0.35) / n, 0.03, 0.08)
        let bb: BBox | null = null
        const strokeW = Math.max(1, M * 0.0016)
        const items: {
          i: number
          ccx: number
          ccy: number
          th: number
          ta: number
          tau: number
        }[] = []
        for (let i = 0; i < n; i++) {
          if (chars[i] === ' ') continue
          const row = Math.floor(i / per)
          const j = i - row * per
          const cnt = Math.min(per, n - row * per)
          const u = cnt > 1 ? j / (cnt - 1) : 0.5
          const amp = rowsN > 1 ? 0.45 : 1
          let dev
          if (P.shape === 'arc') dev = (Math.sin(Math.PI * u) - 0.55) * H * 0.13 * P.dir
          else if (P.shape === 'wave') dev = Math.sin(u * TAU * 1.1 + P.ph) * H * 0.08
          else if (P.shape === 'stair') dev = (u - 0.5) * H * 0.2 * P.dir
          else dev = rs(s, i, 3) * H * 0.08
          dev = Math.max(-H * 0.14, Math.min(H * 0.14, dev * amp))
          const ax = W / 2 + (j - (cnt - 1) / 2) * sp + (rowsN > 1 ? (row ? 0.25 : -0.25) * sp : 0)
          const cy = rowsN > 1 ? (row ? H * 0.64 : H * 0.4) + dev * 0.5 : H * 0.52 + dev
          const attach = P.tag ? tagH * 0.5 - tagH * 0.1 : size * 0.56
          const L = Math.max(H * 0.06, cy - attach - railY)
          const T = 1.5 * Math.sqrt(L / (H * 0.45))
          const w = TAU / T
          const ta = 0.12 + i * gap
          const tau = lt - ta
          const ampK = rowsN > 1 && row === 1 ? 0.5 : 1
          const dk = sp / L / DEG // 横向走一个字符间距对应的角度（度）
          let th = P.amp * dk * ampK * Math.sin(w * env.ltb + r(s, i, 5) * 6)
          if (tau > 0)
            th +=
              P.kick *
              dk *
              ampK *
              (r(s, i, 6) < 0.5 ? 1 : -1) *
              Math.exp(-tau / 0.7) *
              Math.sin(w * tau * 1.3)
          const bounce = tau > 0 ? 1 + 0.05 * Math.exp(-tau / 0.18) * Math.cos(tau * 30) : 1
          const rot = th * DEG
          const grow = E.outCubic(clamp((lt - (ta - 0.3)) / 0.3))
          const Ls = L * bounce * grow
          const ex = ax + Math.sin(rot) * Ls
          const ey = railY + Math.cos(rot) * Ls
          if (grow > 0) {
            env.line(
              [
                [ax, railY],
                [ex, ey],
              ],
              sc.sub,
              strokeW,
              0.9 * out,
              false,
            )
            if (P.rail) env.circle(ax, railY, Math.max(2.5, M * 0.004), sc.fg, null, 0, out, false)
          }
          items.push({
            i,
            ccx: ax + Math.sin(rot) * (Ls + attach),
            ccy: railY + Math.cos(rot) * (Ls + attach),
            th,
            ta,
            tau,
          })
        }
        for (const q of items) {
          if (q.tau < 0) continue
          if (P.tag) {
            const pc = q.i % 2 ? plateCol(sc, [sc.accent, sc.ink]) : plateCol(sc, [sc.ink, sc.fg])
            const e = E.outBack(clamp(q.tau / 0.18), 1.4) * out
            if (e > 0) {
              ctx.save()
              ctx.translate(q.ccx, q.ccy)
              ctx.rotate(-q.th * DEG)
              ctx.scale(e, e)
              env.rrect(-tagW / 2, -tagH / 2, tagW, tagH, tagW * 0.12, pc, 1, gIn(env))
              env.circle(
                0,
                -tagH / 2 + tagH * 0.1,
                Math.max(2, size * 0.055),
                sc.bg,
                null,
                0,
                1,
                false,
              )
              ctx.restore()
            }
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: chars[q.i],
                font: P.font,
                size: csize,
                x: q.ccx + Math.sin(q.th * DEG) * tagH * 0.06,
                y: q.ccy + Math.cos(q.th * DEG) * tagH * 0.06,
                rot: -q.th,
                color: onCol(sc, pc),
                plain: true,
                noHold: plateHold(env),
                mi: miAt(env, q.ta),
              }),
            )
          } else {
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: chars[q.i],
                font: P.font,
                size: csize,
                x: q.ccx,
                y: q.ccy,
                rot: -q.th,
                color: sc.fg,
                mi: miAt(env, q.ta),
              }),
            )
          }
        }
        return bb
      },
    },

    /* ============================================================ 3 公转 */
    orbit: {
      w: 1,
      tags: ['calm', 'graphic', 'emotional'],
      fits: (n) => n >= 1 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): OrbitParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fo: rng.pick(fontsOf(st, ['body', 'serif', 'display'])),
        variant: rng.pick(['ring', 'ring', 'atom', 'wide']),
        tilt: rng.range(5, 13) * rng.pick([1, -1]),
        speed: rng.range(22, 40) * rng.pick([1, -1]),
        unit: rng.pick(['line', 'self', 'line']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as OrbitParams
        const s = cut.seed
        const M = Math.min(W, H)
        const mt = mainLines(cut.text, W, H, 10, 5)
        const port = W < H
        const size = Math.min(
          fitSize(mt, P.font, W * (port ? 0.64 : 0.54), H * 0.3, { track: 0.04, lead: 1.15 }),
          H * 0.19,
        )
        const mm = measure({ text: mt, font: P.font, size, track: 0.04, lead: 1.15 })
        const cx = W / 2
        const cy = H / 2
        const e = inE(env, 0.7)
        const out = outK(env)
        const txt = clean(cut.text)
        const line = clean(cut.lineText || '')
        const rom = romaOf(cut)
        const units: string[] = []
        units.push(
          P.unit === 'line' && line && line !== txt && [...line].length <= 40
            ? line + '·'
            : txt + '·',
        )
        units.push(
          rom
            ? rom + ' · '
            : cut.words && cut.words.length > 1
              ? cut.words.join('·') + '·'
              : txt + ' · ',
        )
        const nR = P.variant === 'atom' ? 2 : 1
        type Ring = {
          rx: number
          ry: number
          tilt: number
          os: number
          unit: string[]
          cnt: number
          sp: number
          font: string
        }
        const rings: Ring[] = []
        for (let k = 0; k < nR; k++) {
          const wide = P.variant === 'wide'
          const rx0 = clamp(
            Math.max(mm.w / 2 + size * (wide ? 1.4 : 1.05), M * (wide ? 0.44 : 0.36)),
            M * 0.2,
            W * 0.47,
          )
          const ry0 = Math.min(
            rx0 * 0.62,
            Math.max(
              rx0 * (P.variant === 'atom' ? 0.36 : wide ? 0.2 : 0.27),
              mm.h / 2 + size * (k ? 0.75 : 0.5),
            ),
          )
          const grow = (0.7 + 0.3 * e) * (1 + 0.25 * env.pOut)
          const rx = rx0 * grow
          const ry = ry0 * grow
          const tilt =
            (P.variant === 'atom' ? (k ? -1 : 1) * (Math.abs(P.tilt) * 0.6 + 8) : P.tilt) * DEG
          const os = clamp(M * (wide ? 0.05 : 0.042), 14, 64) * (k ? 0.82 : 1)
          const unit = [...units[k]]
          const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
          const cnt = Math.max(
            Math.min(unit.length, 44),
            Math.min(44, Math.floor(perim / (os * 1.7))),
          )
          rings.push({
            rx,
            ry,
            tilt,
            os,
            unit,
            cnt,
            sp: P.speed * (k ? -0.8 : 1),
            font: k ? monoF(env) : P.fo,
          })
        }
        const drawRing = (R: Ring, front: boolean): void => {
          const cT = Math.cos(R.tilt)
          const sT = Math.sin(R.tilt)
          const a0 = env.ltb * R.sp * DEG + r(s, 9) * TAU
          const chars: string[] = []
          for (let j = 0; j < R.cnt; j++) chars.push(R.unit[j % R.unit.length])
          pathText(env, chars, R.font, R.os, (j) => {
            const a = a0 + (j / R.cnt) * TAU
            const z = Math.sin(a)
            if (z >= 0 !== front) return null
            const lx = Math.cos(a) * R.rx
            const ly = z * R.ry
            const d = (z + 1) / 2
            const sep = chars[j] === '·'
            return {
              x: cx + lx * cT - ly * sT,
              y: cy + lx * sT + ly * cT,
              s: 0.55 + 0.62 * d,
              a: (0.18 + 0.82 * Math.pow(d, 1.3)) * e * out,
              color: sep ? sc.accent : d > 0.5 ? sc.fg : sc.sub,
            }
          })
        }
        const ellipse = (R: Ring, front: boolean): [number, number][] => {
          const pts: [number, number][] = []
          const cT = Math.cos(R.tilt)
          const sT = Math.sin(R.tilt)
          for (let j = 0; j <= 40; j++) {
            const a = front ? (j / 40) * Math.PI : Math.PI + (j / 40) * Math.PI
            const lx = Math.cos(a) * R.rx * 1.0
            const ly = Math.sin(a) * R.ry
            pts.push([cx + lx * cT - ly * sT, cy + lx * sT + ly * cT])
          }
          return pts
        }
        const lw = Math.max(1, M * 0.0016)
        for (const R of rings) {
          env.line(ellipse(R, false), sc.sub, lw, 0.4 * e * out, false)
          drawRing(R, false)
        }
        const bb = mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: cx,
          y: cy,
          track: 0.04,
          lead: 1.15,
          color: sc.fg,
        })
        const wb = bb || bbRect(cx - mm.w / 2, cy - mm.h / 2, cx + mm.w / 2, cy + mm.h / 2)
        for (const R of rings) {
          if (env.pass === 'main') {
            // 前弧在歌词块上"断开"：用偶数填充把文字区域挖掉
            ctx.save()
            ctx.beginPath()
            ctx.rect(-W, -H, W * 3, H * 3)
            ctx.rect(
              wb.x0 - size * 0.12,
              wb.y0 - size * 0.1,
              wb.x1 - wb.x0 + size * 0.24,
              wb.y1 - wb.y0 + size * 0.2,
            )
            ctx.clip('evenodd')
            env.line(ellipse(R, true), sc.sub, lw, 0.65 * e * out, false)
            ctx.restore()
          }
          drawRing(R, true)
        }
        return bb
      },
    },

    /* ============================================================ 4 隧道 */
    tunnel: {
      w: 0.9,
      tags: ['glitch', 'graphic', 'emotional'],
      emph: 1.3,
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): TunnelParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        fontC: rng.pick(fontsOf(st, ['display', 'serif'])),
        q: rng.range(1.42, 1.62),
        speed: rng.range(0.22, 0.42) * rng.pick([1, 1, -1]),
        style: rng.pick(['outline', 'fill', 'alt']),
        unit: rng.pick(['line', 'text', 'line']),
        persp: rng.chance(0.65),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as TunnelParams
        const M = Math.min(W, H)
        const cx = W / 2
        const cy = H / 2
        const mt = mainLines(cut.text, W, H, 10, 5)
        const size = Math.min(
          fitSize(mt, P.fontC, W * (W < H ? 0.44 : 0.5), H * 0.26, { track: 0.05, lead: 1.15 }),
          H * 0.16,
        )
        const mm = measure({ text: mt, font: P.fontC, size, track: 0.05, lead: 1.15 })
        const hw = mm.w / 2 + size * 0.55
        const hh = mm.h / 2 + size * 0.5
        // 取景框比例：横屏取画面比例；竖屏往文字块收一点（否则框永远看不见）
        const ra = W < H ? Math.min(0.95, Math.sqrt((hw / hh) * (W / H))) : W / H
        const A = W / 2
        const B = A / ra
        const s0 = Math.max(hw / A, hh / B, 0.12)
        const q = P.q
        const Lmax = Math.log(Math.max((W * 0.66) / A, (H * 0.66) / B) / s0) / Math.log(q)
        const e = inE(env, 0.6)
        const out = outK(env)
        const phase0 = env.ltb * P.speed + (1 - e) * 1.2 * Math.sign(P.speed || 1)
        const ph = ((phase0 % 1) + 1) % 1
        const unit = [
          ...((P.unit === 'line' && cut.lineText && clean(cut.lineText) !== clean(cut.text)
            ? cut.lineText
            : cut.text
          )
            .replace(/\s+/g, ' ')
            .trim() + '　'),
        ]
        const NU = unit.length
        const lw = Math.max(1, M * 0.0015)
        // 从画面四角连到最内层框的透视轨
        if (P.persp) {
          const a0 = s0 * A
          const b0 = s0 * B
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ])
            env.line(
              [
                [cx + sx * W * 0.75, cy + sy * H * 0.75],
                [cx + sx * a0, cy + sy * b0],
              ],
              sc.sub,
              lw,
              0.28 * e * out,
              false,
            )
        }
        const K = Math.ceil(Lmax) + 1
        for (let k = K; k >= 0; k--) {
          const L = k + ph - 1
          if (L < 0 || L > Lmax + 0.2) continue
          const sc1 = s0 * Math.pow(q, L)
          const a = sc1 * A
          const b = sc1 * B
          const f = Math.min(sc1 * Math.min(A, B) * 0.15, M * 0.11)
          if (f < 3) continue
          const alpha = smooth(0, 0.9, L) * (0.3 + 0.7 * clamp((L / Lmax) * 1.4)) * e * out
          if (alpha < 0.02) continue
          const outline =
            P.style === 'outline' || (P.style === 'alt' && (k + Math.floor(phase0)) % 2 === 0)
          const col = (k + Math.floor(phase0)) % 3 === 0 ? sc.accent : sc.fg
          const inset = f * 0.62
          let gi = (k * 7 + Math.floor(phase0) * 3) % NU
          const edge = (len: number): string => {
            // 塞得进 len 长度的字
            const chars: string[] = []
            let acc = 0
            for (let t = 0; t < 80; t++) {
              const ch = unit[(gi + t) % NU]
              const ad = metrics.adv(P.font, ch) * f * 1.06
              if (acc + ad > len) {
                gi += t
                break
              }
              acc += ad
              chars.push(ch)
            }
            return chars.join('')
          }
          const it: TextItem = {
            text: '',
            font: P.font,
            size: f,
            x: cx,
            y: cy,
            track: 0.06,
            ghost: false,
            alpha,
            color: col,
          }
          if (outline) {
            it.fill = false
            it.stroke = Math.max(1, f * 0.035)
            it.strokeColor = col
          }
          const hl = 2 * a - inset * 2.4
          const vl = 2 * b - inset * 2.4
          env.draw({ ...it, text: edge(hl), x: cx, y: cy - b + inset })
          env.draw({ ...it, text: edge(vl), x: cx + a - inset, y: cy, rot: 90 })
          env.draw({ ...it, text: edge(hl), x: cx, y: cy + b - inset, rot: 180 })
          env.draw({ ...it, text: edge(vl), x: cx - a + inset, y: cy, rot: -90 })
          env.rect(cx - a, cy - b, a * 2, lw, sc.sub, alpha * 0.5, false)
          env.rect(cx - a, cy + b - lw, a * 2, lw, sc.sub, alpha * 0.5, false)
        }
        return mainDraw(env, {
          text: mt,
          font: P.fontC,
          size,
          x: cx,
          y: cy,
          track: 0.05,
          lead: 1.15,
          color: sc.fg,
        })
      },
    },

    /* ======================================================== 5 词云 */
    wordCloud: {
      w: 0.9,
      tags: ['pop', 'editorial', 'graphic'],
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): WordCloudParams => {
        const pool = fontsOf(st, ['display', 'serif', 'body'])
        return {
          font: rng.pick(fontsOf(st, ['display'])),
          fonts: [rng.pick(pool), rng.pick(pool), rng.pick(fontsOf(st, ['body', 'serif']))],
          vert: rng.pick([0, 0.3, 0.5]),
          accentN: rng.int(1, 3),
          outlineK: rng.pick([0, 0.2, 0.35]),
          wide: rng.range(1.2, 1.7),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as WordCloudParams
        const s = cut.seed
        const M = Math.min(W, H)
        const mt = mainLines(cut.text, W, H, 9, 5)
        const size = Math.min(
          fitSize(mt, P.font, W * (W < H ? 0.7 : 0.52), H * 0.24, { track: 0.03, lead: 1.1 }),
          H * 0.18,
        )
        const key = s + '|' + W + 'x' + H + '|' + cut.text
        let lay = _cloud.get(key)
        if (!lay) {
          lay = buildCloud(env, cut, mt, size)
          if (_cloud.size > 60) _cloud.clear()
          _cloud.set(key, lay)
        }
        const out = outK(env)
        lay.forEach((w, k) => {
          const q = clamp((env.lt - w.delay) / 0.32)
          if (q <= 0) return
          const sq = E.outBack(q, 1.7) * (1 - 0.25 * E.inCubic(env.pOut))
          const dx = noise1(env.ltb * 0.35 + k * 3.1, s) * M * 0.004
          const dy = noise1(env.ltb * 0.3 + k * 5.7, s + 1) * M * 0.004
          const it: TextItem = {
            text: w.text,
            font: w.font,
            size: w.size * sq,
            x: w.x + dx,
            y: w.y + dy,
            vertical: w.vertical,
            track: 0.02,
            color: w.col === 'a' ? sc.accent : w.col === 'f' ? sc.fg : sc.sub,
            alpha: Math.min(1, q * 2.5) * out * w.a,
            ghost: false,
          }
          if (w.outline) {
            it.fill = false
            it.stroke = Math.max(1, w.size * 0.03)
            it.strokeColor = it.color
          }
          env.draw(it)
        })
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          track: 0.03,
          lead: 1.1,
          color: sc.fg,
        })
      },
    },

    /* ============================================================ 6 跳跃 */
    bounceLine: {
      w: 1,
      tags: ['pop'],
      fits: (n) => n >= 2 && n <= 16,
      enterBias: { drop: 1.8, pop: 1.5, cut: 1.2, slice: 0.4, stretch: 0.5 },
      plan: (rng: Rng, _cut, st: StylePack): BounceLineParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        mode: rng.pick(['wave', 'wave', 'beat', 'hop']),
        hop: rng.range(0.38, 0.6),
        tempo: rng.range(0.42, 0.6),
        shadow: rng.chance(0.7),
        line: rng.pick(['line', 'line', 'dots', 'none']),
        tilt: rng.chance(0.5),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BounceLineParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 11, 6)
        const nL = mt.split('\n').length
        const geom = { track: 0.1, lead: 2.0 }
        const size = Math.min(
          fitSize(mt, P.font, W * 0.84, H * (nL > 1 ? 0.52 : 0.3), geom),
          H * 0.2,
        )
        const base: TextItem = {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2 + (nL > 1 ? 0 : H * 0.03),
          ...geom,
        }
        const gl = glyphPts(base)
        const n = gl.length
        const out = outK(env)
        const inA = inE(env, 0.5)
        const hopH = size * P.hop
        const hd = clamp(P.tempo * 0.62, 0.22, 0.34)
        const sq = 0.13
        // 跳跃曲线：τ = 起跳后的时间
        const prof = (tau: number): { h: number; sx: number; sy: number } => {
          if (tau < -0.07 || tau > hd + sq) return { h: 0, sx: 1, sy: 1 }
          if (tau < 0) {
            const k = Math.sin((Math.PI * (tau + 0.07)) / 0.07)
            return { h: 0, sx: 1 + 0.08 * k, sy: 1 - 0.1 * k }
          }
          if (tau < hd) {
            const u = tau / hd
            return { h: 4 * u * (1 - u), sx: 0.94, sy: 1.08 }
          }
          const k = Math.sin((Math.PI * (tau - hd)) / sq)
          return { h: 0, sx: 1 + 0.2 * k, sy: 1 - 0.24 * k }
        }
        const start = 0.25
        let bb: BBox | null = null
        const lines = new Map<number, { x0: number; x1: number; y: number }>()
        gl.forEach((g, i) => {
          let tau = -1
          const t = lt - start
          if (t > -0.1) {
            if (P.mode === 'wave') {
              const gap = Math.min(0.09, 0.9 / n)
              const period = Math.max(P.tempo * 2.2, n * gap + hd + 0.35)
              const tt = t - i * gap
              tau = tt < -0.1 ? -1 : ((tt + 0.07) % period) - 0.07
            } else if (P.mode === 'beat') {
              if (env.beat && env.beat.len > 0.2) {
                tau = env.beat.index % n === i ? env.beat.since : -1
              } else {
                const k = Math.floor(t / P.tempo)
                tau = ((k % n) + n) % n === i ? t - k * P.tempo : -1
              }
            } else {
              const period = rr(0.9, 1.7, s, i, 7)
              const ph = r(s, i, 8) * period
              tau = ((t + ph) % period) - 0.07
              if (t + ph < period - 0.07) tau = -1
            }
          }
          const pr = prof(tau)
          const yb = g.y + size * 0.5
          const own = lines.get(g.li)
          if (!own) lines.set(g.li, { x0: g.x - g.w / 2, x1: g.x + g.w / 2, y: yb })
          else {
            own.x0 = Math.min(own.x0, g.x - g.w / 2)
            own.x1 = Math.max(own.x1, g.x + g.w / 2)
          }
          if (P.shadow) {
            const k = 1 - pr.h * 0.55
            ctx.save()
            ctx.translate(g.x, yb + size * 0.06)
            ctx.scale(1, 0.2)
            env.circle(0, 0, size * 0.34 * k * pr.sx, sc.sub, null, 0, 0.28 * k * out * inA, false)
            ctx.restore()
          }
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: g.ch,
              font: P.font,
              size,
              x: g.x,
              y: yb - size * 0.5 * pr.sy - pr.h * hopH,
              sx: pr.sx,
              sy: pr.sy,
              rot:
                P.tilt && pr.h > 0 ? Math.sin((tau / hd) * Math.PI * 2) * 7 * (i % 2 ? 1 : -1) : 0,
              color: P.mode === 'beat' && pr.h > 0 ? sc.accent : sc.fg,
              mi: i,
            }),
          )
        })
        const lw = Math.max(1.5, M * 0.0022)
        for (const L of lines.values()) {
          const pad = size * 0.35
          const x0 = L.x0 - pad
          const x1 = L.x1 + pad
          const y = L.y + size * 0.1
          if (P.line === 'line')
            env.line(
              [
                [x0, y],
                [lerp(x0, x1, inA), y],
              ],
              sc.sub,
              lw,
              0.7 * out,
              false,
            )
          else if (P.line === 'dots') {
            const m = Math.max(4, Math.round((x1 - x0) / (size * 0.25)))
            for (let j = 0; j <= m; j++)
              if (j / m <= inA)
                env.circle(lerp(x0, x1, j / m), y, lw * 1.2, sc.sub, null, 0, 0.8 * out, false)
          }
        }
        return bb
      },
    },

    /* ============================================================ 7 橡皮 */
    elastic: {
      w: 0.9,
      tags: ['pop', 'graphic'],
      portrait: 0.85,
      fits: (n) => n >= 2 && n <= 12,
      enterBias: { cut: 1.6, stretch: 0.3, pop: 1.2 },
      plan: (rng: Rng, cut, st: StylePack): ElasticParams => {
        const port = cut.H > cut.W
        return {
          font: rng.pick(fontsOf(st, ['display', 'serif'])),
          orient: port
            ? cut.n <= 5
              ? rng.pick(['v', 'v', 'h'])
              : 'v'
            : rng.pick(['h', 'h', 'diag']),
          ang: rng.range(6, 12) * rng.pick([1, -1]),
          every: rng.range(1.1, 1.6),
          amp: rng.range(0.3, 0.45),
          anchor: rng.pick(['dot', 'ring', 'pin']),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ElasticParams
        const lt = env.lt
        const vert = P.orient === 'v'
        const txt = vert ? clean(cut.text) : String(cut.text).trim()
        const ang = P.orient === 'diag' ? P.ang : 0
        const avail = vert ? H * 0.58 : W < H ? W * 0.7 : W * 0.62
        const geom = { track: 0.08, vertical: vert }
        const size = Math.min(
          fitSize(txt, P.font, vert ? W * 0.3 : avail, vert ? avail : H * 0.22, geom),
          H * 0.2,
        )
        const base: TextItem = { text: txt, font: P.font, size, x: 0, y: 0, ...geom }
        const gl = glyphPts(base)
        const n = gl.length
        if (!n) return null
        const along = (g: GlyphPt): number => (vert ? g.y : g.x)
        const a0 = along(gl[0]) - (vert ? gl[0].h : gl[0].w) / 2
        const a1 = along(gl[n - 1]) + (vert ? gl[n - 1].h : gl[n - 1].w) / 2
        const gap = size * 0.85
        const half = (a1 - a0) / 2 + gap
        // 弹簧：两个锚点从中心甩出去并回弹
        const te = lt - 0.02
        const spr = te <= 0 ? 0 : 1 - Math.exp(-te / 0.1) * Math.cos(te * 15)
        const k = Math.max(0.04, spr) * (1 + 0.6 * E.inCubic(env.pOut))
        // 拨弦：横跨整条弦的驻波
        let tau = -1
        let ampK = 1
        if (env.beat && env.beat.len > 0.2 && lt > 0.5) {
          tau = env.beat.since
          ampK = env.beat.index % 2 ? 0.55 : 1
        } else if (lt > 0.45) tau = (lt - 0.45) % P.every
        const A = size * P.amp * ampK * (lt < 0.45 ? 0 : 1)
        const wv = (u: number): number =>
          tau < 0 ? 0 : A * Math.sin(Math.PI * u) * Math.cos(tau * 22) * Math.exp(-tau / 0.42)
        const cx = W / 2
        const cy = H / 2
        const cr = Math.cos(ang * DEG)
        const sr = Math.sin(ang * DEG)
        // 沿弦 / 垂直弦 → 屏幕坐标
        const P2 = (a: number, d: number): [number, number] =>
          vert ? [cx + d, cy + a] : [cx + a * cr - d * sr, cy + a * sr + d * cr]
        const aA = -half * k
        const aB = half * k
        const uOf = (a: number): number => (a - aA) / Math.max(1, aB - aA)
        const out = outK(env)
        const inA = inE(env, 0.3)
        const lw = Math.max(1.5, size * 0.03)
        const seg = (from: number, to: number): [number, number][] => {
          const pts: [number, number][] = []
          for (let j = 0; j <= 12; j++) {
            const a = lerp(from, to, j / 12)
            pts.push(P2(a, wv(uOf(a))))
          }
          return pts
        }
        const tA = a0 * k - size * 0.12
        const tB = a1 * k + size * 0.12
        env.line(seg(aA, tA), sc.sub, lw, 0.9 * out * inA, false)
        env.line(seg(tB, aB), sc.sub, lw, 0.9 * out * inA, false)
        let bb: BBox | null = null
        gl.forEach((g, i) => {
          const a = along(g) * k
          const u = uOf(a)
          const d = wv(u)
          const slope = (wv(u + 0.01) - wv(u - 0.01)) / (0.02 * Math.max(1, aB - aA))
          const [x, y] = P2(a, d)
          const st = clamp(k, 0.15, 1.6)
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: g.ch,
              font: P.font,
              size,
              x,
              y,
              vertical: vert,
              sx: vert ? 1 / Math.sqrt(st) : st,
              sy: vert ? st : 1 / Math.sqrt(st),
              rot: (vert ? -Math.atan(slope) : Math.atan(slope)) / DEG + ang,
              color: sc.fg,
              mi: i * 0.5,
            }),
          )
        })
        // 两端锚点
        const R = Math.max(5, size * 0.1)
        for (const a of [aA, aB]) {
          const [x, y] = P2(a, 0)
          const q = E.outBack(clamp(lt / 0.2), 2) * out
          if (q <= 0) continue
          if (P.anchor === 'dot') env.circle(x, y, R * q, sc.accent, null, 0, 1, true)
          else if (P.anchor === 'ring') {
            env.circle(x, y, R * 1.3 * q, null, sc.accent, lw * 1.3, 1, true)
            env.circle(x, y, R * 0.45 * q, sc.fg, null, 0, 1, false)
          } else {
            const [px, py] = P2(a, -R * 3.2)
            env.line(
              [
                [px, py],
                [x, y],
              ],
              sc.fg,
              lw,
              q,
              false,
            )
            env.circle(px, py, R * 0.9 * q, sc.accent, null, 0, 1, true)
            env.circle(x, y, R * 0.4 * q, sc.fg, null, 0, 1, false)
          }
        }
        return bb
      },
    },

    /* ========================================================= 8 交叉带 */
    crossBands: {
      w: 1,
      tags: ['graphic', 'pop', 'glitch'],
      treat: 'safe',
      busy: true,
      fits: (n) => n >= 1 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): CrossBandsParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        fb: rng.pick(fontsOf(st, ['body', 'display'])),
        ang: rng.range(13, 22),
        plate: rng.pick(['box', 'double', 'shadow']),
        speed: rng.range(0.7, 1.2),
        swap: rng.chance(0.5),
        sep: rng.pick(['／', '·', '　', '×']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CrossBandsParams
        const M = Math.min(W, H)
        const lt = env.lt
        const port = W < H
        const ang = port ? P.ang + 16 : P.ang
        const bh = M * (port ? 0.12 : 0.105)
        const cols = [plateCol(sc, [sc.ink, sc.fg]), plateCol(sc, [sc.accent, sc.accent2, sc.sub])]
        if (P.swap) cols.reverse()
        const len = Math.hypot(W, H) * 1.15
        const unit = (cut.lineText || cut.text).replace(/\s+/g, ' ').trim() + '　' + P.sep + '　'
        const fsz = bh * 0.46
        const per = measure({ text: unit, font: P.fb, size: fsz, track: 0.08 }).w
        const reps = Math.min(40, Math.ceil((len * 1.2) / Math.max(1, per)) + 2)
        const outE = E.inCubic(env.pOut)
        ;[0, 1].forEach((b) => {
          const e = E.outExpo(clamp((lt - b * 0.08) / 0.5)) * (1 - outE)
          if (e <= 0) return
          const a = (b ? -ang : ang) * DEG
          const dir = b ? -1 : 1
          ctx.save()
          ctx.translate(W / 2, H / 2)
          ctx.rotate(a)
          const L = len * e
          const x0 = dir > 0 ? -len / 2 : len / 2 - L
          env.rect(x0, -bh / 2, L, bh, cols[b], 1, lt < 0.6)
          ctx.beginPath()
          ctx.rect(x0, -bh / 2, L, bh)
          ctx.save()
          ctx.clip()
          const off = (((env.ltb * P.speed * M * 0.12 * dir) % per) + per) % per
          env.draw({
            text: unit.repeat(reps),
            font: P.fb,
            size: fsz,
            track: 0.08,
            align: 'left',
            x: -len * 0.6 - per + off,
            y: 0,
            color: onCol(sc, cols[b]),
            ghost: false,
          })
          ctx.restore()
          ctx.restore()
        })
        // 交叉处的歌词底板
        const mt = mainLines(cut.text, W, H, 9, 5)
        const size = Math.min(
          fitSize(mt, P.font, W * (port ? 0.66 : 0.5), H * 0.24, { track: 0.04, lead: 1.12 }),
          H * 0.17,
        )
        const mm = measure({ text: mt, font: P.font, size, track: 0.04, lead: 1.12 })
        const pw = mm.w + size * 0.9
        const ph = mm.h + size * 0.7
        const q = E.outBack(clamp((lt - 0.1) / 0.28), 1.6) * (1 - outE)
        if (q > 0) {
          const lw = Math.max(2, size * 0.035)
          ctx.save()
          ctx.translate(W / 2, H / 2)
          ctx.scale(q, q)
          if (P.plate === 'shadow') {
            const o = size * 0.12
            env.rect(-pw / 2 + o, -ph / 2 + o, pw, ph, cols[1], 1, false)
          }
          env.rect(-pw / 2, -ph / 2, pw, ph, sc.bg, 1, false)
          env.rrect(-pw / 2, -ph / 2, pw, ph, 0, null, 1, false, sc.fg, lw)
          if (P.plate === 'double') {
            const o = lw * 2.6
            env.rrect(
              -pw / 2 + o,
              -ph / 2 + o,
              pw - o * 2,
              ph - o * 2,
              0,
              null,
              1,
              false,
              sc.fg,
              lw * 0.5,
            )
          }
          ctx.restore()
        }
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          track: 0.04,
          lead: 1.12,
          color: sc.fg,
        })
      },
    },

    /* ======================================================= 9 贴纸炸弹 */
    stickerBomb: {
      w: 0.9,
      tags: ['pop', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 12,
      enterBias: { cut: 2, pop: 1.2, slice: 0.4, wipe: 0.5, assemble: 0.4 },
      plan: (rng: Rng, cut, st: StylePack): StickerBombParams => {
        const n = cut.n
        return {
          font: rng.pick(fontsOf(st, ['display'])),
          fs: rng.pick(fontsOf(st, ['body', 'display'])),
          main:
            n <= 3
              ? rng.pick(['circle', 'burst', 'rrect'])
              : n <= 5
                ? rng.pick(['rrect', 'burst', 'pill'])
                : rng.pick(['rrect', 'pill']),
          cnt: rng.int(4, 6),
          rot: rng.range(-5, 5),
          spin: rng.range(0, 6),
        }
      },
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as StickerBombParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const port = W < H
        const mt = mainLines(cut.text, W, H, 8, 5)
        const size = Math.min(
          fitSize(mt, P.font, W * (port ? 0.64 : 0.5), H * 0.26, { track: 0.03, lead: 1.1 }),
          H * (P.main === 'circle' || P.main === 'burst' ? 0.15 : 0.19),
        )
        const mm = measure({ text: mt, font: P.font, size, track: 0.03, lead: 1.1 })
        const pw = mm.w + size * 0.8
        const ph = mm.h + size * 0.6
        const dark = lum(sc.bg) < 0.45
        const border = dark ? sc.fg : sc.bg
        const bw = Math.max(4, size * 0.09)
        const out = 1 - E.inCubic(env.pOut)
        const grow = 1 + 0.08 * E.outCubic(env.pOut)
        const slap = (t0: number): { s: number; a: number; r: number } | null => {
          const q = clamp((lt - t0) / 0.16)
          if (q <= 0) return null
          return {
            s: 1 + 0.3 * Math.pow(1 - q, 2) - 0.06 * Math.sin(Math.PI * q) * (q < 1 ? 1 : 0),
            a: Math.min(1, q * 3),
            r: (1 - E.outCubic(q)) * 14,
          }
        }
        const drawSticker = (
          x: number,
          y: number,
          rot: number,
          sh: string,
          w: number,
          h: number,
          fill: string,
          q: { s: number; a: number; r: number },
        ): void => {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((rot + q.r) * DEG)
          ctx.scale(q.s * grow, q.s * grow)
          if (env.pass === 'main') {
            if (!dark) {
              ctx.save()
              ctx.translate(bw * 0.5, bw * 0.7)
              stickerPath(ctx, sh, w, h, bw, s)
              ctx.globalAlpha = 0.22 * q.a * out
              ctx.fillStyle = sc.fg
              ctx.fill()
              ctx.restore()
            }
            stickerPath(ctx, sh, w, h, bw, s)
            ctx.globalAlpha = q.a * out
            ctx.fillStyle = border
            ctx.fill()
            stickerPath(ctx, sh, w, h, 0, s)
            ctx.fillStyle = fill
            ctx.fill()
            ctx.globalAlpha = 1
          } else if (env.passColor && gIn(env)) {
            stickerPath(ctx, sh, w, h, bw, s)
            ctx.globalAlpha = q.a
            ctx.fillStyle = env.passColor
            ctx.fill()
            ctx.globalAlpha = 1
          }
          ctx.restore()
        }
        // 配角贴纸
        const txt = clean(cut.text)
        const pool: string[] = []
        const add = (w0: string): void => {
          const w = String(w0 || '').trim()
          if (w && w !== txt && glyphCount(w) <= 12 && !pool.includes(w)) pool.push(w)
        }
        ;(cut.words || []).forEach(add)
        const rom = romaOf(cut)
        if (rom) add(rom)
        chunkText(cut.lineText || '').forEach(add)
        add('No.' + String((cut.line | 0) + 1).padStart(2, '0'))
        add('♡')
        add('!!')
        const fills = [sc.accent, sc.ink, sc.accent2, sc.fg].map((c) => plateCol(sc, [c]))
        const mainFill = plateCol(sc, [sc.ink, sc.accent])
        const cnt = P.cnt
        const hw = pw / 2
        const hh = ph / 2
        const items: {
          word: string
          sh: string
          fsz: number
          w: number
          h: number
          x: number
          y: number
          rot: number
          fill: string
          t0: number
        }[] = []
        for (let k = 0; k < cnt; k++) {
          const word = pool[k % pool.length]
          const glyphs = glyphCount(word)
          const sh =
            glyphs <= 2
              ? r(s, k, 2) < 0.5
                ? 'circle'
                : 'burst'
              : r(s, k, 2) < 0.5
                ? 'pill'
                : 'rrect'
          const fsz = clamp(M * rr(0.042, 0.06, s, k, 3), 12, 80)
          const m = measure({ text: word, font: P.fs, size: fsz, track: 0.06 })
          let w = m.w + fsz * 1.0
          let h = fsz * 1.7
          if (sh === 'circle' || sh === 'burst') w = h = Math.max(m.w, fsz) + fsz * 1.2
          const a = (k / cnt) * TAU + rs(s, k, 4) * 0.35 + P.spin
          let x = W / 2 + Math.cos(a) * (hw + w * 0.32)
          let y = H / 2 + Math.sin(a) * (hh + h * 0.4)
          x = clamp(x, W * 0.05 + w / 2, W * 0.95 - w / 2)
          y = clamp(y, H * 0.06 + h / 2, H * 0.94 - h / 2)
          items.push({
            word,
            sh,
            fsz,
            w,
            h,
            x,
            y,
            rot: rs(s, k, 5) * 18,
            fill:
              fills[k % fills.length] === mainFill
                ? fills[(k + 1) % fills.length]
                : fills[k % fills.length],
            t0: 0.14 + k * 0.07,
          })
        }
        for (const it of items) {
          const q = slap(it.t0)
          if (!q) continue
          drawSticker(it.x, it.y, it.rot, it.sh, it.w, it.h, it.fill, q)
          ctx.save()
          ctx.translate(it.x, it.y)
          ctx.rotate((it.rot + q.r) * DEG)
          ctx.scale(q.s * grow, q.s * grow)
          env.draw({
            text: it.word,
            font: P.fs,
            size: it.fsz,
            track: 0.06,
            x: 0,
            y: 0,
            color: onCol(sc, it.fill),
            alpha: q.a * out,
            ghost: false,
          })
          ctx.restore()
        }
        // 主贴纸最后画（压在最上层）
        const q = slap(0.02)
        if (!q) return null
        const sh = P.main
        let w = pw
        let h = ph
        if (sh === 'circle' || sh === 'burst') {
          w = h = Math.max(pw, ph) * 1.02
        }
        drawSticker(W / 2, H / 2, P.rot, sh, w, h, mainFill, q)
        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.rotate((P.rot + q.r) * DEG)
        ctx.scale(q.s, q.s)
        const lb = mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: 0,
          y: 0,
          track: 0.03,
          lead: 1.1,
          color: onCol(sc, mainFill),
          noHold: plateHold(env),
        })
        ctx.restore()
        return lb ? bbRect(W / 2 - w / 2, H / 2 - h / 2, W / 2 + w / 2, H / 2 + h / 2) : null
      },
    },

    /* ============================================================ 10 霓虹 */
    neon: {
      w: 1,
      tags: ['calm', 'emotional'],
      treat: false,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: {
        flicker: 2.6,
        blur: 1.4,
        cut: 1.3,
        assemble: 0.3,
        slice: 0.5,
        scramble: 0.6,
      },
      plan: (rng: Rng, _cut, st: StylePack): NeonParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        tube: rng.pick(['accent', 'accent', 'accent2', 'fg']),
        frame: rng.pick(['box', 'under', 'bracket', 'none']),
        flick: rng.chance(0.75),
        sub: rng.chance(0.5),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as NeonParams
        const s = cut.seed
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 9, 5)
        const geom = { track: 0.08, lead: 1.25 }
        const size = Math.min(fitSize(mt, P.font, W * 0.72, H * 0.34, geom), H * 0.19)
        const base: TextItem = { text: mt, font: P.font, size, x: W / 2, y: H / 2, ...geom }
        const dark = lum(sc.bg) < 0.45
        const cand =
          P.tube === 'accent2'
            ? [sc.accent2, sc.accent, sc.fg]
            : P.tube === 'fg'
              ? [sc.fg, sc.accent]
              : [sc.accent, sc.accent2, sc.fg]
        const tube = cand.find((c) => c && contrast(c, sc.bg) >= 2.2) || sc.fg
        const core = dark ? mix(tube, '#FFFFFF', 0.72) : mix(tube, '#FFFFFF', 0.35)
        const EN = ENTER[cut.enter]
        const EX = EXIT[cut.exit]
        // 碎片类入场/出场逐块搬运，辉光会糊成一片，这时只描实心
        const solid = (EN && EN.pieces && env.pIn < 1) || (EX && EX.pieces && env.pOut > 0)
        const gl = glyphPts(base)
        const tw = Math.max(1.5, size * (dark ? 0.05 : 0.06))
        const cw = Math.max(1, size * 0.018)
        const glow = {
          color: rgba(tube, dark ? 0.95 : 0.55),
          blur: Math.min(60, size * (dark ? 0.24 : 0.14)),
        }
        let bb: BBox | null = null
        // 点亮过程 + 偶发闪烁（按 ≤24Hz 的 step 时钟取随机）
        const on = (i: number, t0: number): number => {
          const t = lt - t0
          if (t < 0) return 0
          if (t < 0.32) return r(s, i, env.step, 3) < 0.25 + t * 2 ? 1 : 0.12
          if (P.flick && r(s, i, Math.floor(env.step / 2), 4) < 0.007) return 0.2
          return 1
        }
        gl.forEach((g, i) => {
          const t0 = 0.04 + r(s, i, 5) * 0.28
          const k = on(i, t0)
          if (k <= 0) return
          const common: TextItem = {
            text: g.ch,
            font: P.font,
            size,
            x: g.x,
            y: g.y,
            mi: i * 0.4,
          }
          if (solid) {
            bb = unionBB(bb, mainDraw(env, { ...common, color: tube, shadow: glow, alpha: k }))
            return
          }
          const res = mainDraw(env, {
            ...common,
            fill: false,
            stroke: tw,
            strokeColor: tube,
            color: tube,
            shadow: k > 0.5 ? glow : undefined,
            alpha: k,
          })
          mainDraw(env, {
            ...common,
            fill: false,
            stroke: cw,
            strokeColor: core,
            color: core,
            alpha: k > 0.5 ? 1 : 0.3,
            ghost: false,
          })
          bb = unionBB(bb, res)
        })
        // 霓虹灯框
        const fb = bb || bbRect(W / 2 - 10, H / 2 - 10, W / 2 + 10, H / 2 + 10)
        const fk = on(99, 0.22) * (1 - E.inCubic(env.pOut))
        if (P.frame !== 'none' && fk > 0 && bb) {
          const px = size * 0.55
          const py = size * 0.42
          const x0 = fb.x0 - px
          const x1 = fb.x1 + px
          const y0 = fb.y0 - py
          const y1 = fb.y1 + py
          const lw = Math.max(1.5, size * 0.035)
          const path: [number, number][][] = []
          if (P.frame === 'under')
            path.push([
              [x0 + px * 0.5, y1],
              [x1 - px * 0.5, y1],
            ])
          else if (P.frame === 'bracket') {
            const c = size * 0.5
            path.push(
              [
                [x0, y0 + c],
                [x0, y0],
                [x0 + c, y0],
              ],
              [
                [x1 - c, y0],
                [x1, y0],
                [x1, y0 + c],
              ],
              [
                [x1, y1 - c],
                [x1, y1],
                [x1 - c, y1],
              ],
              [
                [x0 + c, y1],
                [x0, y1],
                [x0, y1 - c],
              ],
            )
          }
          if (env.pass === 'main') {
            ctx.save()
            ctx.shadowColor = glow.color
            ctx.shadowBlur = glow.blur * 0.8 * env.scale
            ctx.lineCap = 'round'
            if (P.frame === 'box')
              env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, false, tube, lw)
            else path.forEach((p) => env.line(p, tube, lw, fk, false))
            ctx.restore()
            if (P.frame === 'box')
              env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, false, core, lw * 0.35)
            else path.forEach((p) => env.line(p, core, lw * 0.35, fk, false))
          } else {
            if (P.frame === 'box')
              env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, true, tube, lw)
            else path.forEach((p) => env.line(p, tube, lw, fk, true))
          }
          if (P.sub && env.pass === 'main') {
            const sub2 = romaOf(cut) || (cut.lineText !== cut.text ? cut.lineText : null)
            if (sub2) {
              const fs = clamp(size * 0.2, 12, 34)
              const c2 =
                [sc.accent2, sc.fg, sc.sub].find(
                  (c) => c && c !== tube && contrast(c, sc.bg) >= 2,
                ) || sc.sub
              ctx.save()
              ctx.shadowColor = rgba(c2, 0.9)
              ctx.shadowBlur = fs * 0.6 * env.scale
              env.draw({
                text: sub2,
                font: monoF(env),
                size: fs,
                track: 0.3,
                x: (x0 + x1) / 2,
                y: y1 + fs * 1.6,
                color: c2,
                alpha: fk * on(98, 0.4),
                ghost: false,
              })
              ctx.restore()
            }
          }
        }
        return bb
      },
    },

    /* ========================================================== 11 键帽 */
    keycaps: {
      w: 0.6,
      tags: ['pop', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 10,
      enterBias: {
        cut: 2.5,
        pop: 1.2,
        blur: 0.6,
        slice: 0.3,
        wipe: 0.3,
        stretch: 0.3,
        assemble: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): KeycapsParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        style: rng.pick(['light', 'light', 'dark']),
        stagger: rng.chance(0.6),
        accent: rng.int(0, 20),
        legend: rng.chance(0.7),
        plate: rng.chance(0.45),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as KeycapsParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const chs = slotsOf(cut.text)
        const n = chs.length
        if (!n) return null
        const port = W < H
        const { cells, k } = cellRows(
          chs,
          W,
          H,
          port ? 4 : n > 8 ? 5 : 10,
          1.06,
          M * 0.26,
          0.16,
          P.stagger,
        )
        const lightC = lum(sc.fg) > lum(sc.bg) ? sc.fg : sc.bg
        const darkC = lightC === sc.fg ? sc.bg : sc.fg
        const d = k * 0.15
        const rad = k * 0.16
        const out = outK(env)
        const gap = clamp((cut.dur * 0.38) / n, 0.05, 0.13)
        const acc = n > 2 ? P.accent % n : -1
        let bb: BBox | null = null
        if (P.plate) {
          const e = inE(env, 0.35) * out
          let x0 = 1e9
          let x1 = -1e9
          let y0 = 1e9
          let y1 = -1e9
          for (const c of cells) {
            x0 = Math.min(x0, c.x - k / 2)
            x1 = Math.max(x1, c.x + k / 2)
            y0 = Math.min(y0, c.y - k / 2)
            y1 = Math.max(y1, c.y + k / 2 + d)
          }
          const p = k * 0.22
          env.rrect(
            x0 - p,
            y0 - p,
            x1 - x0 + p * 2,
            (y1 - y0 + p * 2) * e,
            rad * 1.4,
            mix(sc.bg, darkC === sc.bg ? lightC : darkC, 0.1),
            1,
            false,
            sc.sub,
            1,
          )
        }
        for (const c of cells) {
          if (c.ch === ' ') continue
          const ti = 0.14 + c.i * gap
          const q = E.outBack(clamp((lt - c.i * 0.025) / 0.2), 1.6)
          if (q <= 0 || out <= 0) continue
          const gh = gIn(env)
          // 按下：打字时先来一次，之后偶尔再敲一下
          const press = (t: number): number =>
            t < 0 ? 0 : t < 0.05 ? t / 0.05 : t < 0.09 ? 1 : t < 0.22 ? 1 - (t - 0.09) / 0.13 : 0
          let pr = press(lt - ti)
          const re = lt - (0.14 + n * gap + 0.3)
          if (re > 0) {
            if (env.beat && env.beat.len > 0.2) {
              if (hash(s, env.beat.index, 3) % n === c.i) pr = Math.max(pr, press(env.beat.since))
            } else {
              const P0 = 0.55
              const kk = Math.floor(re / P0)
              if (hash(s, kk, 3) % n === c.i) pr = Math.max(pr, press(re - kk * P0))
            }
          }
          const isA = c.i === acc
          let top
          let side
          let leg
          if (isA) {
            top = plateCol(sc, [sc.accent, sc.ink])
            side = mix(top, darkC, 0.4)
            leg = onCol(sc, top)
          } else if (P.style === 'light') {
            top = lightC
            side = mix(lightC, darkC, 0.32)
            leg = darkC
          } else {
            top = mix(darkC, lightC, 0.16)
            side = mix(darkC, lightC, 0.06)
            leg = lightC
          }
          ctx.save()
          ctx.translate(c.x, c.y)
          ctx.scale(q, q)
          const dy = pr * d * 0.75
          env.rrect(-k / 2, -k / 2 + d * 0.35, k, k + d * 0.65, rad, side, out, gh)
          const ins = k * 0.09
          env.rrect(
            -k / 2 + ins * 0.5,
            -k / 2 + dy,
            k - ins,
            k - ins * 0.9,
            rad * 0.85,
            mix(top, side, 0.35),
            out,
            false,
          )
          env.rrect(
            -k / 2 + ins,
            -k / 2 + dy + ins * 0.35,
            k - ins * 2,
            k - ins * 2.1,
            rad * 0.7,
            top,
            out,
            false,
            P.style === 'dark' && !isA ? sc.sub : null,
            1,
          )
          if (P.legend && lt > ti) {
            // 旧版这里是这一格的罗马音；中文取副标题兜底链的前几个字符
            const lab = romaOf(cut)
            if (lab)
              env.draw({
                text: lab.slice(0, 8),
                font: monoF(env),
                size: k * 0.13,
                align: 'left',
                x: -k / 2 + ins * 1.9,
                y: -k / 2 + dy + ins * 1.7,
                color: leg,
                alpha: 0.7 * out,
                ghost: false,
              })
          }
          ctx.restore()
          const it: TextItem = {
            text: c.ch,
            font: P.font,
            size: k * 0.52,
            x: c.x,
            y: c.y - k * 0.03 + dy * q,
            color: leg,
            noHold: plateHold(env),
            mi: miAt(env, ti),
          }
          if (q < 1) {
            it.size *= q
            it.y = c.y + (it.y - c.y) * q
          }
          bb = unionBB(bb, mainDraw(env, it))
        }
        return bb
      },
    },

    /* ============================================================ 12 气泡 */
    bubbles: {
      w: 0.8,
      tags: ['pop', 'calm'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 12,
      enterBias: { pop: 1.6, cut: 1.5, blur: 1.2, slice: 0.3, wipe: 0.3, stretch: 0.3 },
      plan: (rng: Rng, _cut, st: StylePack): BubblesParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        style: rng.pick(['soap', 'soap', 'solid', 'mixed']),
        rise: rng.range(0.018, 0.035),
        wob: rng.range(0.6, 1.2),
        motes: rng.chance(0.75),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as BubblesParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const chs = slotsOf(cut.text)
        const n = chs.length
        if (!n) return null
        const port = W < H
        const { cells, k } = cellRows(chs, W, H, port ? 4 : 7, 1.1, M * 0.3, 0.12, true)
        const out = outK(env)
        const popK = 1 + 0.35 * E.outCubic(env.pOut)
        const lift = -H * P.rise * env.ltb
        // 背景上浮的小泡
        if (P.motes) {
          for (let m = 0; m < 14; m++) {
            const sp = rr(0.05, 0.12, s, m, 1) * H
            const per = (H * 1.2) / sp
            const t = (env.ltb + r(s, m, 2) * per) % per
            const y = H * 1.08 - t * sp
            const x = rr(0.04, 0.96, s, m, 3) * W + Math.sin(env.ltb * 1.7 + m) * M * 0.012
            const rad = rr(0.006, 0.02, s, m, 4) * M
            env.circle(
              x,
              y,
              rad,
              null,
              sc.sub,
              Math.max(1, rad * 0.12),
              0.45 * out * inE(env, 0.5),
              false,
            )
          }
        }
        let bb: BBox | null = null
        for (const c of cells) {
          if (c.ch === ' ') continue
          const kind = isHan(c.ch) ? 1 : isKana(c.ch) || isPunct(c.ch) ? 0.7 : 0.86
          const R = k * 0.5 * kind * (0.94 + 0.12 * r(s, c.i, 5))
          const t0 = 0.04 + c.i * 0.05 + r(s, c.i, 6) * 0.08
          const q0 = clamp((lt - t0) / 0.3)
          if (q0 <= 0) continue
          const q = E.outBack(q0, 2.2)
          const ph = r(s, c.i, 7) * TAU
          const x = c.x + Math.sin(env.ltb * 1.6 * P.wob + ph) * R * 0.1 + rs(s, c.i, 8) * k * 0.1
          const y =
            c.y +
            lift * (0.7 + 0.6 * r(s, c.i, 9)) +
            Math.cos(env.ltb * 1.2 + ph) * R * 0.06 +
            rs(s, c.i, 10) * k * 0.14
          const solid = P.style === 'solid' || (P.style === 'mixed' && r(s, c.i, 11) < 0.4)
          const Rr = R * q * popK
          let tc = sc.fg
          if (solid) {
            const f =
              c.i % 3 === 1 ? plateCol(sc, [sc.accent, sc.ink]) : plateCol(sc, [sc.ink, sc.accent])
            env.circle(x, y, Rr, f, null, 0, out, gIn(env))
            tc = onCol(sc, f)
          } else {
            env.circle(x, y, Rr, sc.fg, null, 0, 0.07 * out, false)
            env.circle(x, y, Rr, null, sc.fg, Math.max(1.2, R * 0.035), 0.85 * out, gIn(env))
            env.arc(x, y, Rr * 0.78, 200, 245, sc.fg, Math.max(1.5, R * 0.07), 0.9 * out, false)
            env.circle(
              x + Rr * 0.52,
              y - Rr * 0.52,
              Math.max(1.5, R * 0.05),
              sc.fg,
              null,
              0,
              0.9 * out,
              false,
            )
          }
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: c.ch,
              font: P.font,
              size: R * 1.05 * Math.min(1, q),
              x,
              y,
              color: tc,
              noHold: plateHold(env),
              mi: miAt(env, t0),
            }),
          )
        }
        return bb
      },
    },

    /* ========================================================== 13 老虎机 */
    slotMachine: {
      w: 0.6,
      tags: ['pop', 'glitch'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 10,
      enterBias: {
        cut: 3,
        flicker: 0.6,
        blur: 0.5,
        slice: 0.2,
        wipe: 0.2,
        assemble: 0.2,
        type: 0.2,
      },
      plan: (rng: Rng, _cut, st: StylePack): SlotMachineParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        style: rng.pick(['cabinet', 'window', 'cabinet']),
        v: rng.range(13, 18),
        line: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as SlotMachineParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const chs = slotsOf(cut.text)
        const n = chs.length
        if (!n) return null
        const port = W < H
        const { cells, k } = cellRows(chs, W, H, port ? 5 : 10, 1.34, M * 0.24, 0.1)
        const w = k
        const h = k * 1.34
        const step = k * 0.92
        const gsz = k * 0.7
        const pool = poolOf(cut)
        const NP = pool.length
        const out = outK(env)
        const inA = inE(env, 0.25)
        const gap = clamp((cut.dur * 0.3) / n, 0.08, 0.2)
        const t1 = clamp(cut.dur * 0.16, 0.2, 0.45)
        const cab = P.style === 'cabinet'
        const panel = plateCol(sc, [sc.ink, sc.fg])
        const winC = cab ? (onCol(sc, panel) === sc.bg ? sc.bg : mix(sc.bg, sc.fg, 0.06)) : sc.bg
        const glyC = contrast(sc.fg, winC) > 2.5 ? sc.fg : onCol(sc, winC)
        let x0 = 1e9
        let x1 = -1e9
        let y0 = 1e9
        let y1 = -1e9
        for (const c of cells) {
          x0 = Math.min(x0, c.x - w / 2)
          x1 = Math.max(x1, c.x + w / 2)
          y0 = Math.min(y0, c.y - h / 2)
          y1 = Math.max(y1, c.y + h / 2)
        }
        if (cab) {
          const p = k * 0.22
          env.rrect(
            x0 - p,
            y0 - p,
            x1 - x0 + p * 2,
            y1 - y0 + p * 2,
            p * 1.2,
            panel,
            out * inA,
            gIn(env),
          )
        }
        let bb: BBox | null = null
        for (const c of cells) {
          if (c.ch === ' ') continue
          const ts = t1 + c.i * gap
          const tau = ts - lt
          const FIN = 1000
          const p =
            tau > 0 ? FIN - P.v * tau : FIN + 0.22 * Math.sin(-tau * 30) * Math.exp(tau / 0.08)
          const wx = c.x - w / 2
          const wy = c.y - h / 2
          env.rect(wx, wy, w, h * inA, winC, out, false)
          ctx.save()
          ctx.beginPath()
          ctx.rect(wx, wy, w, h)
          ctx.clip()
          const fast = tau > 0.05
          const j0 = Math.floor(p) - 1
          const j1 = Math.ceil(p) + 1
          for (let j = j0; j <= j1; j++) {
            const y = c.y + (j - p) * step
            if (j === FIN && tau <= 0) continue
            const ch = j === FIN ? c.ch : pool[hash(s, c.i, j) % NP]
            if (fast) {
              // 廉价的运动模糊：同一个（已缓存的）字沿卷轴拖影
              for (const o of [-0.16, 0.16])
                env.draw({
                  text: ch,
                  font: P.font,
                  size: gsz,
                  x: c.x,
                  y: y + o * step,
                  color: glyC,
                  alpha: 0.22 * out,
                  ghost: false,
                })
              env.draw({
                text: ch,
                font: P.font,
                size: gsz,
                x: c.x,
                y,
                color: glyC,
                alpha: 0.5 * out,
                ghost: false,
              })
            } else
              env.draw({
                text: ch,
                font: P.font,
                size: gsz,
                x: c.x,
                y,
                color: glyC,
                alpha: 0.9 * out,
                ghost: false,
              })
          }
          if (tau <= 0)
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: c.ch,
                font: P.font,
                size: gsz,
                x: c.x,
                y: c.y + (FIN - p) * step,
                color: glyC,
                noHold: plateHold(env),
                mi: miAt(env, ts),
              }),
            )
          ctx.restore()
          if (env.pass === 'main') {
            // 滚筒明暗
            const g = ctx.createLinearGradient(0, wy, 0, wy + h)
            g.addColorStop(0, rgba(winC, 0.95))
            g.addColorStop(0.3, rgba(winC, 0))
            g.addColorStop(0.7, rgba(winC, 0))
            g.addColorStop(1, rgba(winC, 0.95))
            ctx.save()
            ctx.globalAlpha = out
            ctx.fillStyle = g
            ctx.fillRect(wx, wy, w, h)
            ctx.restore()
          }
          env.rrect(
            wx,
            wy,
            w,
            h,
            k * 0.06,
            null,
            out * inA,
            false,
            cab ? mix(panel, winC, 0.5) : sc.fg,
            Math.max(1.5, k * 0.02),
          )
        }
        if (P.line) {
          const rowsY = [...new Set(cells.map((c) => c.y))]
          for (const y of rowsY) {
            const tri = k * 0.1
            const xa = x0 - k * 0.12
            const xb = x1 + k * 0.12
            env.line(
              [
                [xa, y],
                [lerp(xa, xb, inA), y],
              ],
              sc.accent,
              Math.max(1.2, k * 0.012),
              0.7 * out,
              false,
            )
            env.poly(
              [
                [xa - tri * 1.6, y - tri],
                [xa, y],
                [xa - tri * 1.6, y + tri],
              ],
              sc.accent,
              out * inA,
              false,
            )
            env.poly(
              [
                [xb + tri * 1.6, y - tri],
                [xb, y],
                [xb + tri * 1.6, y + tri],
              ],
              sc.accent,
              out * inA,
              false,
            )
          }
        }
        return bb || bbRect(x0, y0, x1, y1)
      },
    },

    /* ========================================================== 14 翻页牌 */
    flipBoard: {
      w: 0.7,
      tags: ['graphic', 'editorial'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 12,
      enterBias: {
        cut: 3,
        flicker: 0.5,
        blur: 0.4,
        slice: 0.2,
        wipe: 0.3,
        assemble: 0.2,
        type: 0.3,
      },
      plan: (rng: Rng, _cut, st: StylePack): FlipBoardParams => ({
        font: rng.pick(fontsOf(st, ['display', 'body'])),
        header: rng.chance(0.65),
        flips: rng.int(3, 5),
        style: rng.pick(['ink', 'ink', 'fg']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as FlipBoardParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const chs = [...String(cut.text).trim()].filter((c) => c !== '　')
        const n = chs.length
        if (!n) return null
        const port = W < H
        const { cells, k } = cellRows(chs, W, H, port ? 5 : 12, 1.32, M * 0.24, 0.08)
        const w = k
        const h = k * 1.32
        const gsz = k * 0.78
        const panel = plateCol(sc, P.style === 'fg' ? [sc.fg, sc.ink] : [sc.ink, sc.fg])
        const flap = mix(panel, sc.bg, 0.08)
        const gc = onCol(sc, panel)
        const pool = poolOf(cut)
        const NP = pool.length
        const fd = 0.065
        const t0 = 0.06
        const out = outK(env)
        const inA = inE(env, 0.2)
        const lw = Math.max(1.5, k * 0.018)
        let bb: BBox | null = null
        let x0 = 1e9
        let x1 = -1e9
        let y0 = 1e9
        for (const c of cells) {
          x0 = Math.min(x0, c.x - w / 2)
          x1 = Math.max(x1, c.x + w / 2)
          y0 = Math.min(y0, c.y - h / 2)
          const q = E.outCubic(clamp((lt - c.i * 0.02) / 0.18)) * out
          if (q <= 0) continue
          const wx = c.x - w / 2
          const wy = c.y - h / 2
          env.rrect(wx, wy, w, h, k * 0.07, panel, q, gIn(env))
          const F = P.flips + (c.i % 3) + Math.floor(c.i * 0.7)
          const settle = t0 + F * fd
          const space = c.ch === ' '
          const chAt = (m: number): string =>
            m <= 0 ? '' : m >= F ? c.ch : pool[hash(s, c.i, m) % NP]
          const u = (lt - t0) / fd
          const g: TextItem = {
            text: '',
            font: P.font,
            size: gsz,
            x: c.x,
            y: c.y,
            color: gc,
            ghost: false,
            alpha: q,
          }
          const half = (ch: string, top: boolean, sy: number): void => {
            if (!ch || ch === ' ' || sy <= 0.01) return
            const clipY: readonly [number, number] = top ? [-0.75, 0] : [0, 0.75]
            env.draw({ ...g, text: ch, charFn: () => ({ clipY, sy }) })
          }
          if (lt >= settle) {
            if (!space)
              bb = unionBB(
                bb,
                mainDraw(env, {
                  text: c.ch,
                  font: P.font,
                  size: gsz,
                  x: c.x,
                  y: c.y,
                  color: gc,
                  alpha: q,
                  noHold: plateHold(env),
                  mi: miAt(env, settle),
                }),
              )
          } else if (u > 0) {
            const m = Math.floor(u)
            const f = u - m
            const A = chAt(m)
            const B = chAt(m + 1)
            half(B, true, 1)
            half(A, false, 1)
            // 落下的一半：量化缩放比，压扁后的字形才进得了缓存
            const sy = Math.round(Math.abs(Math.cos(f * Math.PI)) * 6) / 6
            ctx.save()
            if (f < 0.5) {
              env.rect(wx, c.y - (h / 2) * sy, w, (h / 2) * sy, flap, q, false)
              half(A, true, sy)
              env.rect(wx, c.y - (h / 2) * sy, w, (h / 2) * sy, sc.bg, q * f * 0.5, false)
            } else {
              env.rect(wx, c.y, w, (h / 2) * sy, flap, q, false)
              half(B, false, sy)
              env.rect(wx, c.y, w, (h / 2) * sy, sc.bg, q * (1 - f) * 0.5, false)
            }
            ctx.restore()
          }
          env.rect(wx, c.y - lw / 2, w, lw, sc.bg, q, false)
          env.rect(
            wx - lw * 0.6,
            c.y - h * 0.07,
            lw * 1.2,
            h * 0.14,
            mix(panel, sc.bg, 0.5),
            q,
            false,
          )
          env.rect(
            wx + w - lw * 0.6,
            c.y - h * 0.07,
            lw * 1.2,
            h * 0.14,
            mix(panel, sc.bg, 0.5),
            q,
            false,
          )
        }
        if (P.header) {
          const fs = clamp(k * 0.2, 12, 30)
          const lab = `LINE ${String((cut.line | 0) + 1).padStart(2, '0')}`
          const tm = fmtTime(cut.start)
          const a = inA * out
          env.draw({
            text: lab,
            font: monoF(env),
            size: fs,
            track: 0.2,
            align: 'left',
            x: x0,
            y: y0 - fs * 1.4,
            color: sc.sub,
            alpha: a,
            ghost: false,
          })
          env.draw({
            text: tm,
            font: monoF(env),
            size: fs,
            track: 0.2,
            align: 'right',
            x: x1,
            y: y0 - fs * 1.4,
            color: sc.accent,
            alpha: a,
            ghost: false,
          })
        }
        return bb
      },
    },

    /* ========================================================== 15 滚动字幕 */
    credits: {
      w: 1,
      tags: ['calm', 'editorial', 'emotional'],
      fits: (n) => n >= 1 && n <= 16,
      plan: (rng: Rng, _cut, st: StylePack): CreditsParams => ({
        font: rng.pick(fontsOf(st, ['serif', 'display'])),
        fc: rng.pick(fontsOf(st, ['serif', 'body'])),
        variant: rng.pick(['center', 'center', 'side', 'single']),
        speed: rng.range(0.035, 0.06),
        off: rng.range(0, 10),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CreditsParams
        const M = Math.min(W, H)
        const port = W < H
        const variant = port && P.variant === 'side' ? 'center' : P.variant
        const side = variant === 'side'
        const mt = mainLines(cut.text, W, H, side ? 6 : 10, 5)
        const size = Math.min(
          fitSize(mt, P.font, side ? W * 0.44 : W * 0.72, H * 0.26, { track: 0.06, lead: 1.2 }),
          H * 0.16,
        )
        const mx = side ? W * 0.3 : W / 2
        // 职员表式的字条
        const rom = romaOf(cut)
        const vals: [string, string][] = []
        const seen = new Set<string>()
        const add = (role: string, v0: string): void => {
          const v = String(v0 || '').trim()
          if (v && !seen.has(v)) {
            seen.add(v)
            vals.push([role, v])
          }
        }
        const line = cut.lineText || cut.text
        add('词', line)
        chunkText(line).forEach((c, i) => add(i === 0 ? '语' : '', c))
        segments(line).forEach((g) => {
          if (glyphCount(g) >= 2) add('', g)
        })
        if (rom) add('READING', rom)
        if (cut.note) add('NOTE', cut.note)
        add('LINE', String((cut.line | 0) + 1).padStart(2, '0'))
        add('TIME', fmtTime(cut.start))
        const fs = clamp(M * 0.026, 14, 36)
        const rowH = fs * 2.3
        const block = vals.length * rowH + rowH * 2
        const scroll = (env.ltb + P.off) * P.speed * H
        const a0 = inE(env, 0.6) * outK(env)
        const cx = side ? W * 0.74 : W / 2
        const bandH = side ? 0 : (size * mt.split('\n').length * 1.25) / 2 + fs * 2.2
        const lw = Math.max(1, M * 0.0012)
        for (
          let y = H * 1.05 - (scroll % block) - block * Math.ceil((H * 1.1) / block), rep = 0;
          y < H * 1.05 && rep < 12;
          y += block, rep++
        ) {
          vals.forEach(([role, v], i) => {
            const yy = y + i * rowH
            if (yy < -rowH || yy > H + rowH) return
            const edge = smooth(H * 0.02, H * 0.14, yy) * smooth(H * 0.98, H * 0.86, yy)
            const band = side ? 1 : smooth(bandH, bandH + fs * 2, Math.abs(yy - H / 2))
            const a = a0 * edge * band
            if (a < 0.01) return
            if (variant === 'single') {
              if (role)
                env.draw({
                  text: role,
                  font: monoF(env),
                  size: fs * 0.62,
                  track: 0.3,
                  x: cx,
                  y: yy - fs * 0.95,
                  color: sc.sub,
                  alpha: a * 0.8,
                  ghost: false,
                })
              env.draw({
                text: v,
                font: P.fc,
                size: fs,
                track: 0.12,
                x: cx,
                y: yy,
                color: sc.fg,
                alpha: a * 0.85,
                ghost: false,
              })
            } else {
              const g = fs * 0.9
              if (role)
                env.draw({
                  text: role,
                  font: /[A-Z]/.test(role) ? monoF(env) : P.fc,
                  size: fs * 0.72,
                  track: 0.25,
                  align: 'right',
                  x: cx - g,
                  y: yy,
                  color: sc.sub,
                  alpha: a * 0.85,
                  ghost: false,
                })
              env.draw({
                text: v,
                font: P.fc,
                size: fs,
                track: 0.1,
                align: 'left',
                x: cx + g,
                y: yy,
                color: sc.fg,
                alpha: a * 0.85,
                ghost: false,
              })
            }
          })
        }
        if (side)
          env.line(
            [
              [W * 0.52, H * 0.2],
              [W * 0.52, H * 0.2 + H * 0.6 * inE(env, 0.8)],
            ],
            sc.sub,
            lw,
            0.5 * outK(env),
            false,
          )
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: mx,
          y: H / 2,
          track: 0.06,
          lead: 1.2,
          color: sc.fg,
        })
      },
    },

    /* ======================================================== 16 连续放大 */
    zoomRepeat: {
      w: 0.9,
      tags: ['glitch', 'emotional', 'graphic'],
      emph: 1.5,
      busy: true,
      fits: (n) => n >= 1 && n <= 12,
      plan: (rng: Rng, _cut, st: StylePack): ZoomRepeatParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        dir: rng.pick([1, 1, -1]),
        style: rng.pick(['alt', 'alt', 'outline', 'fill']),
        twist: rng.chance(0.35) ? rng.range(3, 7) * rng.pick([1, -1]) : 0,
        q: rng.range(1.38, 1.6),
        speed: rng.range(0.35, 0.6),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ZoomRepeatParams
        const mt = mainLines(cut.text, W, H, 9, 5)
        const size = Math.min(
          fitSize(mt, P.font, W * 0.64, H * 0.3, { track: 0.03, lead: 1.1 }),
          H * 0.2,
        )
        const mm = measure({ text: mt, font: P.font, size, track: 0.03, lead: 1.1 })
        const q = P.q
        const Lmax = Math.log(Math.max(W / mm.w, H / mm.h) * 2.6) / Math.log(q)
        const e = inE(env, 0.5)
        const out = outK(env)
        const ph0 = env.ltb * P.speed * P.dir + (1 - e) * 1.5 * P.dir
        const ph = ((ph0 % 1) + 1) % 1
        const base = Math.floor(ph0)
        const K = Math.min(9, Math.ceil(Lmax) + 1)
        for (let k = K; k >= 0; k--) {
          const L = k + ph
          if (L < 0.3 || L > Lmax) continue
          const fs = size * Math.pow(q, L)
          const a = smooth(0.3, 0.95, L) * (1 - smooth(Lmax * 0.35, Lmax, L)) * e * out * 0.7
          if (a < 0.02) continue
          const idx = k - base
          const outline = P.style === 'outline' || (P.style === 'alt' && ((idx % 2) + 2) % 2 === 0)
          const it: TextItem = {
            text: mt,
            font: P.font,
            size: fs,
            x: W / 2,
            y: H / 2,
            track: 0.03,
            lead: 1.1,
            rot: P.twist * L,
            ghost: false,
          }
          if (outline) {
            it.fill = false
            it.stroke = Math.max(1.2, fs * 0.01)
            it.strokeColor = sc.sub
            it.alpha = a * 0.75
          } else {
            it.color = mix(sc.bg, sc.sub, 0.16)
            it.alpha = a
          }
          env.draw(it)
        }
        mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          track: 0.03,
          lead: 1.1,
          fill: false,
          stroke: size * 0.2,
          strokeColor: sc.bg,
          ghost: false,
          plain: true,
        })
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          track: 0.03,
          lead: 1.1,
          color: sc.fg,
        })
      },
    },

    /* ======================================================== 17 上下分割 */
    splitHalves: {
      w: 1,
      tags: ['graphic', 'glitch', 'editorial'],
      emph: 1.2,
      fits: (n) => n >= 1 && n <= 14,
      enterBias: { cut: 1.8, slice: 0.3, wipe: 0.6 },
      plan: (rng: Rng, _cut, st: StylePack): SplitHalvesParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        variant: rng.pick(['slide', 'slide', 'shear', 'duo']),
        dir: rng.pick([1, -1]),
        line: rng.pick(['full', 'short']),
        gap: rng.pick([0.07, 0.1, 0.13]),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as SplitHalvesParams
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 11, 5)
        const lines = mt.split('\n')
        const size = Math.min(
          fitSize(mt, P.font, W * 0.84, H * 0.5, { track: 0.04, lead: 1.3 }),
          H * 0.24,
        )
        const lead = size * 1.3 + P.gap * size
        const D = W * 0.32
        const e = E.outExpo(clamp((lt - 0.04) / 0.7))
        const ex = E.inExpo(env.pOut)
        const lw = Math.max(1.5, size * 0.016)
        let bb: BBox | null = null
        lines.forEach((ln, li) => {
          const y = H / 2 + (li - (lines.length - 1) / 2) * lead
          const m = measure({ text: ln, font: P.font, size, track: 0.04 })
          const dirL = P.dir * (li % 2 ? -1 : 1)
          const off =
            D * (1 - e) +
            (P.variant === 'shear' ? size * 0.14 * e * (1 + 0.25 * Math.sin(env.ltb * 1.7)) : 0) +
            W * 0.4 * ex
          const g = (P.gap * size) / 2
          ;[0, 1].forEach((h) => {
            const dx = (h ? -1 : 1) * off * dirL
            ctx.save()
            ctx.beginPath()
            if (h === 0) ctx.rect(-W, y - size * 2 - g, W * 3, size * 2)
            else ctx.rect(-W, y + g, W * 3, size * 2)
            ctx.clip()
            const it: TextItem = {
              text: ln,
              font: P.font,
              size,
              x: W / 2 + dx,
              y: y + (h ? g : -g),
              track: 0.04,
              color: sc.fg,
              mi: li * 2 + h,
            }
            if (P.variant === 'duo' && h) it.color = sc.accent
            const res = mainDraw(env, it)
            ctx.restore()
            if (res) bb = unionBB(bb, res)
          })
          // 那一道切线
          const le = E.outExpo(clamp((lt - 0.1) / 0.6)) * (1 - E.inCubic(env.pOut))
          if (le > 0) {
            const half = P.line === 'full' ? W * 0.5 : m.w / 2 + size * 0.7
            env.line(
              [
                [W / 2 - half * le, y],
                [W / 2 + half * le, y],
              ],
              sc.accent,
              lw,
              1,
              true,
            )
            if (P.line === 'short') {
              env.circle(W / 2 - half * le, y, lw * 1.6, sc.accent, null, 0, 1, false)
              env.circle(W / 2 + half * le, y, lw * 1.6, sc.accent, null, 0, 1, false)
            }
          }
        })
        return bb
      },
    },

    /* ====================================================== 18 大小纵排 */
    columnsBig: {
      w: 1,
      tags: ['editorial', 'calm', 'emotional'],
      portrait: 1.4,
      fits: (n) => n >= 1 && n <= 10,
      plan: (rng: Rng, _cut, st: StylePack): ColumnsBigParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fs: rng.pick(fontsOf(st, ['serif', 'body'])),
        side: rng.pick(['left', 'left', 'right']),
        rule: rng.chance(0.7),
        mark: rng.pick(['bar', 'dot', 'none']),
        off: rng.range(-0.05, 0.05),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as ColumnsBigParams
        const M = Math.min(W, H)
        const lt = env.lt
        const port = W < H
        const txt = String(cut.text).trim().replace(/\s+/g, ' ')
        const size = Math.min(
          fitSize(txt, P.font, port ? W * 0.44 : W * 0.3, H * 0.84, {
            vertical: true,
            track: 0.02,
          }),
          H * 0.42,
        )
        const colH = measure({ text: txt, font: P.font, size, vertical: true, track: 0.02 }).h
        const left = P.side === 'left' // 注文列在左边（先读大列再读注）
        const hx = W * (port ? (left ? 0.62 : 0.38) : left ? 0.58 : 0.4) + P.off * W
        const top = H / 2 - colH / 2
        const bb = mainDraw(env, {
          text: txt,
          font: P.font,
          size,
          x: hx,
          y: H / 2,
          vertical: true,
          track: 0.02,
          color: sc.fg,
        })
        const fs = clamp(M * 0.031, 14, 44)
        const perCol = Math.max(4, Math.floor((colH * 0.92) / (fs * 1.08)))
        const line = String(cut.lineText || cut.text).replace(/\s+/g, '')
        const lineT = splitL(line, perCol)
        const rom = romaOf(cut)
        const sub2 = rom
          ? rom
          : cut.note
            ? String(cut.note)
            : `No.${String((cut.line | 0) + 1).padStart(2, '0')} ${fmtTime(cut.start)}`
        const sgn = left ? -1 : 1
        const gap = size * 0.5 + fs * 1.9
        const x1 = hx + sgn * gap
        const nL = lineT.split('\n').length
        const x2 = x1 + sgn * (nL * fs * 1.7 + fs * 0.6)
        const reveal = (t0: number, cnt: number) => {
          const k = Math.floor(clamp((lt - t0) / 0.7) * (cnt + 0.99))
          return (i: number): CharT | null => (i >= k ? { hide: true } : null)
        }
        const out = outK(env)
        const c1 = glyphCount(lineT)
        // 注文块：多列竖排文字从首列开始由右往左长出来
        env.draw({
          text: lineT,
          font: P.fs,
          size: fs,
          vertical: true,
          align: 'left',
          lead: 1.7,
          track: 0.06,
          x: x1 + sgn * (nL - 1) * fs * 0.85,
          y: top,
          color: sc.fg,
          alpha: 0.9 * out,
          ghost: false,
          charFn: reveal(0.18, c1),
        })
        env.draw({
          text: sub2,
          font: rom ? monoF(env) : P.fs,
          size: fs * 0.72,
          vertical: true,
          align: 'left',
          track: 0.18,
          x: x2,
          y: top,
          color: sc.sub,
          alpha: 0.9 * out,
          ghost: false,
          charFn: reveal(0.35, glyphCount(sub2) + 2),
        })
        const lw = Math.max(1, M * 0.0014)
        if (P.rule) {
          const rx = hx + sgn * (size * 0.5 + fs * 0.85)
          env.line(
            [
              [rx, top],
              [rx, top + colH * E.outCubic(clamp((lt - 0.1) / 0.6))],
            ],
            sc.sub,
            lw,
            0.7 * out,
            false,
          )
        }
        if (P.mark !== 'none') {
          const q = E.outBack(clamp((lt - 0.15) / 0.3), 2) * out
          if (P.mark === 'bar')
            env.rect(
              hx - size * 0.5,
              top - size * 0.28,
              size * q,
              Math.max(3, size * 0.06),
              sc.accent,
              1,
              true,
            )
          else
            env.circle(
              hx + (size * 0.5 + fs * 0.85) * sgn,
              top - fs * 0.9,
              fs * 0.28 * q,
              sc.accent,
              null,
              0,
              1,
              true,
            )
        }
        return bb
      },
    },

    /* ======================================================== 19 同心圆字 */
    circleWords: {
      w: 1,
      tags: ['graphic', 'calm', 'editorial'],
      fits: (n) => n >= 1 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): CircleWordsParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fr: rng.pick(fontsOf(st, ['body', 'serif'])),
        rings: rng.pick([2, 3, 3]),
        speed: rng.range(7, 13),
        dir: rng.pick([1, -1]),
        ticks: rng.chance(0.6),
        guides: rng.chance(0.7),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CircleWordsParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const cx = W / 2
        const cy = H / 2
        const Rmax = Math.min(W, H) * 0.46
        const gapR = M * 0.072
        const R0 = Rmax - gapR * (P.rings - 1)
        const txt = String(cut.text).trim().replace(/\s+/g, ' ')
        const n = glyphCount(txt)
        const mt = n <= 4 ? txt : splitL(txt, Math.ceil(n / Math.ceil(n / 5)))
        const size = Math.min(
          fitSize(mt, P.font, R0 * 1.45, R0 * 1.05, { track: 0.03, lead: 1.1 }),
          R0 * 0.55,
        )
        const rom = romaOf(cut)
        const units = [
          String(cut.lineText || cut.text)
            .replace(/\s+/g, ' ')
            .trim() + '　✦　',
          (rom || (cut.words || []).join(' / ') || txt) + '  —  ',
          clean(txt) + '·',
        ]
        const out = outK(env)
        const lw = Math.max(1, M * 0.0014)
        for (let k = 0; k < P.rings; k++) {
          const e = E.outExpo(clamp((lt - k * 0.08) / 0.7))
          if (e <= 0) continue
          const R = (R0 + k * gapR) * (0.9 + 0.1 * e)
          const f = clamp(gapR * 0.46 * (k === 1 ? 0.8 : 1), 10, 52)
          const font = k === 1 && rom ? monoF(env) : P.fr
          const unit = [...units[k % units.length]]
          let uAdv = 0
          for (const ch of unit) uAdv += metrics.adv(font, ch) * f * 1.08
          const reps = Math.max(1, Math.min(12, Math.round((TAU * R) / Math.max(1, uAdv))))
          const chars: string[] = []
          for (let j = 0; j < reps; j++) chars.push(...unit)
          if (chars.length > 160) chars.length = 160
          const tot = chars.reduce((a, ch) => a + metrics.adv(font, ch) * f * 1.08, 0)
          const kk = (TAU * R) / Math.max(1, tot)
          const a0 = (env.ltb * P.speed * (k % 2 ? -1 : 1) * P.dir + r(s, k, 3) * 360) * DEG
          let acc = 0
          const pos = chars.map((ch) => {
            const ad = metrics.adv(font, ch) * f * 1.08 * kk
            const a = a0 + (acc + ad / 2) / R
            acc += ad
            return a
          })
          const col = k === 0 ? sc.fg : sc.sub
          pathText(env, chars, font, f, (i) => {
            const a = pos[i]
            return {
              x: cx + Math.sin(a) * R,
              y: cy - Math.cos(a) * R,
              rot: a / DEG,
              a: 0.9 * e * out,
              color: chars[i] === '✦' ? sc.accent : col,
            }
          })
          if (P.guides) env.circle(cx, cy, R + gapR * 0.5, null, sc.sub, lw, 0.35 * e * out, false)
          if (k === 0 && P.guides)
            env.circle(cx, cy, R - gapR * 0.5, null, sc.sub, lw, 0.35 * e * out, false)
        }
        if (P.ticks) {
          const Rt = R0 + (P.rings - 1) * gapR + gapR * 0.5
          const e = inE(env, 0.9) * out
          const m = 72
          for (let i = 0; i < m; i++) {
            if (i / m > e) break
            const a = (i / m) * 360 - env.ltb * P.speed * 0.5 * P.dir
            const L = i % 6 === 0 ? gapR * 0.3 : gapR * 0.14
            env.line(
              [
                [cx + Math.sin(a * DEG) * Rt, cy - Math.cos(a * DEG) * Rt],
                [cx + Math.sin(a * DEG) * (Rt + L), cy - Math.cos(a * DEG) * (Rt + L)],
              ],
              i % 18 === 0 ? sc.accent : sc.sub,
              lw,
              0.6,
              false,
            )
          }
        }
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: cx,
          y: cy,
          track: 0.03,
          lead: 1.1,
          color: sc.fg,
        })
      },
    },

    /* ========================================================== 20 点阵屏 */
    dotMatrix: {
      w: 0.7,
      tags: ['graphic', 'glitch', 'pop'],
      treat: false,
      fits: (n) => n >= 1 && n <= 12,
      enterBias: { cut: 2.5, flicker: 1.6, scramble: 0.2, assemble: 0.2, type: 1.2 },
      plan: (rng: Rng, _cut, _st: StylePack): DotMatrixParams => ({
        font: rng.pick(['pixel', 'sans_black', 'pixel']),
        reveal: rng.pick(['sweep', 'sweep', 'scroll', 'random']),
        panel: rng.chance(0.7),
        col: rng.pick(['accent', 'accent', 'fg']),
        shape: rng.pick(['round', 'round', 'square']),
      }),
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as DotMatrixParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 8, 4)
        const lines = mt.split('\n')
        const maxL = Math.max(...lines.map((l) => glyphCount(l) || 1))
        const D = clamp(Math.floor((W * 0.86) / (maxL * M * 0.011)), 10, 16)
        const lead = 1.3
        const sm = dotSample(mt, P.font, D, lead)
        const p = Math.min((W * 0.88) / sm.cols, (H * 0.62) / sm.rows)
        const gw = sm.cols * p
        const gh = sm.rows * p
        const gx = W / 2 - gw / 2
        const gy = H / 2 - gh / 2
        const dark = lum(sc.bg) < 0.45
        const panel = P.panel
          ? dark
            ? mix(sc.bg, sc.fg, 0.05)
            : lum(sc.fg) < lum(sc.ink)
              ? sc.fg
              : sc.ink
          : sc.bg
        const litC =
          [P.col === 'accent' ? sc.accent : sc.fg, sc.accent, sc.fg, sc.accent2, sc.bg].find(
            (c) => c && contrast(c, panel) >= 2.5,
          ) || onCol(sc, panel)
        const offC = mix(panel, litC, 0.13)
        const out = outK(env)
        const inA = inE(env, 0.3)
        const rad = p * (P.shape === 'round' ? 0.38 : 0.4)
        const dot = (x: number, y: number): void => {
          if (P.shape === 'round') {
            ctx.moveTo(x + rad, y)
            ctx.arc(x, y, rad, 0, TAU)
          } else ctx.rect(x - rad, y - rad, rad * 2, rad * 2)
        }
        // LED 屏不带色散残影（也省下裁剪的开销）
        if (env.pass !== 'main') return null
        if (out > 0) {
          if (P.panel) {
            const pd = p * 1.2
            env.rrect(
              gx - pd,
              gy - pd,
              gw + pd * 2,
              gh + pd * 2,
              p * 1.2,
              panel,
              inA * out,
              false,
              mix(panel, litC, 0.3),
              Math.max(1, p * 0.12),
            )
          }
          const tile = dotTile(offC, P.shape)
          const fr = clamp(lt / 0.3)
          if (fr > 0) {
            const pat = ctx.createPattern(tile.cv, 'repeat')
            let ok = !!pat
            try {
              pat?.setTransform(new DOMMatrix().translate(gx, gy).scale(p / tile.T))
            } catch {
              ok = false
            }
            if (ok && pat) {
              ctx.save()
              ctx.globalAlpha = inA * out
              ctx.fillStyle = pat
              ctx.fillRect(gx, gy, gw * fr, gh)
              ctx.restore()
            }
          }
        }
        // 亮点：歌词透过它自己采样出的点阵模板画出来
        const T = clamp(cut.dur * 0.3, 0.25, 0.7)
        const t0 = 0.12
        const u = clamp((lt - t0) / T)
        let shift = 0
        if (P.reveal === 'scroll') shift = Math.round((1 - E.outCubic(u)) * sm.cols)
        const front = P.reveal === 'sweep' ? u * (sm.cols + 4) - 2 : 1e9
        const L = sm.lit
        ctx.save()
        ctx.beginPath()
        let any = false
        for (let k = 0; k < L.length; k += 2) {
          const col = L[k] + shift
          const row = L[k + 1]
          if (col >= sm.cols || col > front) continue
          if (P.reveal === 'random' && r(s, L[k], row, 7) > u * 1.05) continue
          dot(gx + (col + 0.5) * p, gy + (row + 0.5) * p)
          any = true
        }
        if (!any) ctx.rect(-10, -10, 1, 1)
        ctx.clip()
        const fsz = sm.fscale * p
        const bb = mainDraw(env, {
          text: mt,
          font: P.font,
          size: fsz,
          x: W / 2 + shift * p,
          y: H / 2,
          lead,
          color: litC,
          stroke: p * 0.9,
          strokeColor: litC,
          strokeUnder: true,
          noHold: true,
          ghost: false,
          mi: miAt(env, t0),
        })
        ctx.restore()
        // 扫掠前沿的亮列
        if (P.reveal === 'sweep' && u > 0 && u < 1) {
          const fc = Math.floor(front)
          ctx.save()
          ctx.globalAlpha = 0.9 * out
          ctx.fillStyle = sc.fg
          ctx.beginPath()
          for (let k = 0; k < L.length; k += 2)
            if (L[k] === fc) dot(gx + (L[k] + 0.5) * p, gy + (L[k + 1] + 0.5) * p)
          ctx.fill()
          ctx.restore()
        }
        return bb ? bbRect(gx, gy, gx + gw, gy + gh) : null
      },
    },

    /* ======================================================== 21 纵深叠字 */
    depthStack: {
      w: 1,
      tags: ['graphic', 'emotional', 'glitch'],
      emph: 1.3,
      fits: (n) => n >= 1 && n <= 12,
      plan: (rng: Rng, _cut, st: StylePack): DepthStackParams => {
        const a = rng.pick([-150, -120, -60, -30, 30, 60, 120, 150, -90, 90]) + rng.range(-12, 12)
        return {
          font: rng.pick(fontsOf(st, ['display', 'serif'])),
          ang: a,
          copies: rng.int(5, 8),
          dist: rng.range(0.42, 0.62),
          style: rng.pick(['outline', 'outline', 'dim', 'lines']),
          sway: rng.chance(0.7),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as DepthStackParams
        const M = Math.min(W, H)
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 9, 5)
        const size = Math.min(
          fitSize(mt, P.font, W * 0.66, H * 0.3, { track: 0.03, lead: 1.1 }),
          H * 0.2,
        )
        const a = P.ang * DEG
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        const cx = W / 2 - dx * M * 0.05
        const cy = H / 2 - dy * M * 0.05
        let vx = cx + dx * M * P.dist
        let vy = cy + dy * M * P.dist
        if (P.sway) {
          vx += Math.sin(env.ltb * 0.7) * M * 0.05
          vy += Math.cos(env.ltb * 0.55) * M * 0.035
        }
        const N = P.copies
        const e = E.outCubic(clamp(lt / 0.7))
        const out = 1 - E.inCubic(env.pOut)
        const depth = e * out
        const mm = measure({ text: mt, font: P.font, size, track: 0.03, lead: 1.1 })
        if (P.style === 'lines' && depth > 0.01) {
          const sN = 1 / (1 + N * 0.26 * depth)
          for (const [ox, oy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            const x0 = cx + (ox * mm.w) / 2
            const y0 = cy + (oy * mm.h) / 2
            const x1 = lerp(cx, vx, 1 - sN) + ((ox * mm.w) / 2) * sN
            const y1 = lerp(cy, vy, 1 - sN) + ((oy * mm.h) / 2) * sN
            env.line(
              [
                [x0, y0],
                [x1, y1],
              ],
              sc.sub,
              Math.max(1, M * 0.0013),
              0.5 * out,
              false,
            )
          }
        }
        for (let k = N; k >= 1; k--) {
          const s1 = 1 / (1 + k * 0.26 * depth)
          if (depth <= 0.001) break
          const x = lerp(cx, vx, 1 - s1)
          const y = lerp(cy, vy, 1 - s1)
          const f = k / N
          const it: TextItem = {
            text: mt,
            font: P.font,
            size: size * s1,
            x,
            y,
            track: 0.03,
            lead: 1.1,
            ghost: false,
          }
          if (P.style === 'dim') {
            it.color = mix(sc.bg, sc.sub, 0.55 - 0.4 * f)
            it.alpha = out
          } else {
            it.fill = false
            it.stroke = Math.max(1, size * s1 * 0.014)
            it.strokeColor = k === 1 ? sc.accent : sc.sub
            it.alpha = (0.85 - 0.6 * f) * out
          }
          env.draw(it)
        }
        return mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: cx,
          y: cy,
          track: 0.03,
          lead: 1.1,
          color: sc.fg,
        })
      },
    },

    /* ======================================================== 22 书体见本 */
    typeSpecimen: {
      w: 0.8,
      tags: ['editorial', 'graphic'],
      fits: (n) => n >= 1 && n <= 8,
      plan: (rng: Rng, cut, st: StylePack): TypeSpecimenParams => {
        const main = rng.pick(fontsOf(st, ['display', 'serif']))
        const pool = SPEC_FONTS.filter((k) => k !== main && FONTS[k])
        for (let i = pool.length - 1; i > 0; i--) {
          const j = rng.int(0, i)
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        const port = cut.H > cut.W
        return {
          main,
          fonts: pool.slice(0, 6),
          grid: port ? 'list' : rng.pick(['g2', 'g3', 'list']),
          num: rng.int(1, 30),
        }
      },
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as TypeSpecimenParams
        const M = Math.min(W, H)
        const lt = env.lt
        const txt = String(cut.text).trim()
        const out = outK(env)
        const lw = Math.max(1, M * 0.0014)
        const cap = clamp(M * 0.017, 11, 24)
        const mono = monoF(env)
        const cells: { x: number; y: number; w: number; h: number; font: string; main: boolean }[] =
          []
        const mx = W * 0.07
        const my = H * 0.1
        const gw = W - mx * 2
        const gh = H - my * 2
        if (P.grid === 'g2') {
          const g = M * 0.02
          const cw = (gw - g) / 2
          const ch = (gh - g) / 2
          for (let i = 0; i < 4; i++)
            cells.push({
              x: mx + (i % 2) * (cw + g),
              y: my + Math.floor(i / 2) * (ch + g),
              w: cw,
              h: ch,
              font: i === 0 ? P.main : P.fonts[i - 1],
              main: i === 0,
            })
        } else if (P.grid === 'g3') {
          const g = M * 0.018
          const cw = (gw - g * 2) / 3
          const ch = (gh - g * 2) / 3
          cells.push({ x: mx, y: my, w: cw * 2 + g, h: ch * 2 + g, font: P.main, main: true })
          const rest = [
            [2, 0],
            [2, 1],
            [0, 2],
            [1, 2],
            [2, 2],
          ]
          rest.forEach(([c, rw], i) =>
            cells.push({
              x: mx + c * (cw + g),
              y: my + rw * (ch + g),
              w: cw,
              h: ch,
              font: P.fonts[i],
              main: false,
            }),
          )
        } else {
          const rowsN = W < H ? 5 : 4
          const hs = [2.2]
          for (let i = 1; i < rowsN; i++) hs.push(1)
          const tot = hs.reduce((a2, b) => a2 + b, 0)
          let y = my
          hs.forEach((hh, i) => {
            const h = (gh * hh) / tot
            cells.push({
              x: mx,
              y,
              w: gw,
              h,
              font: i === 0 ? P.main : P.fonts[i - 1],
              main: i === 0,
            })
            y += h
          })
        }
        let bb: BBox | null = null
        cells.forEach((c, i) => {
          const d = 0.06 + i * 0.07
          const e = E.outCubic(clamp((lt - d) / 0.4)) * out
          if (e <= 0) return
          // 每格顶上一道规则线 + 字体说明
          env.line(
            [
              [c.x, c.y],
              [c.x + c.w * E.outExpo(clamp((lt - d) / 0.5)), c.y],
            ],
            c.main ? sc.accent : sc.sub,
            c.main ? lw * 3 : lw,
            (c.main ? 1 : 0.6) * out,
            false,
          )
          const F = FONTS[c.font]
          const label = `${String(P.num + i).padStart(2, '0')}  ${(F ? F.label : c.font).toUpperCase()}  ${F ? F.weight : ''}`
          env.draw({
            text: label,
            font: mono,
            size: cap,
            align: 'left',
            track: 0.08,
            x: c.x,
            y: c.y + cap * 1.1,
            color: c.main ? sc.accent : sc.sub,
            alpha: e,
            ghost: false,
          })
          const list = P.grid === 'list'
          const tw = list ? c.w * (c.main ? 1 : 0.8) : c.w * 0.9
          const th = c.h - cap * (list ? 1.8 : 2.8)
          const fsz = Math.min(
            fitSize(txt, c.font, tw, th * (list ? 0.78 : 0.7), { track: 0.02 }),
            c.main ? H * 0.3 : H * 0.14,
          )
          const it: TextItem = {
            text: txt,
            font: c.font,
            size: fsz,
            track: 0.02,
            x: list ? c.x : c.x + c.w / 2,
            y: c.y + cap * (list ? 1.8 : 2.2) + th / 2,
            align: list ? 'left' : 'center',
            color: sc.fg,
          }
          if (list && !c.main) {
            it.x = c.x + c.w * 0.2
            it.y = c.y + c.h / 2 + cap * 0.3
          }
          if (c.main) bb = mainDraw(env, it)
          else
            env.draw({
              ...it,
              color: sc.sub,
              alpha: e * 0.9,
              y: it.y + (1 - e) * cap * 1.5,
              ghost: false,
            })
        })
        return bb
      },
    },

    /* ======================================================== 23 一字强调 */
    kanjiFocus: {
      w: 1,
      tags: ['emotional', 'editorial', 'calm'],
      emph: 1.6,
      fits: (n) => n >= 2 && n <= 16,
      plan: (rng: Rng, _cut, st: StylePack): KanjiFocusParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        fs: rng.pick(fontsOf(st, ['serif', 'display', 'body'])),
        mode: rng.pick(['dim', 'outline', 'tint']),
        pos: rng.pick(['center', 'side', 'side']),
        low: rng.chance(0.45),
        dots: rng.chance(0.7),
        dir: rng.pick([1, -1]),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as KanjiFocusParams
        const M = Math.min(W, H)
        const lt = env.lt
        const port = W < H
        const raw = String(cut.text).trim()
        const chs = [...raw]
        let fi = chs.findIndex((c) => isHan(c))
        if (fi < 0) fi = chs.findIndex((c) => c.trim() && !isPunct(c) && !isKana(c))
        if (fi < 0) fi = 0
        const fch = chs[fi]
        // 撑满画面的那只大字
        const big = port ? W * 1.05 : H * 1.02
        const side = !port && P.pos === 'side'
        const bx = side ? W / 2 + P.dir * W * 0.2 : W / 2
        const by = H / 2
        const u = clamp(lt / Math.max(0.5, cut.dur))
        const e = E.outCubic(clamp(lt / 0.8))
        const out = outK(env)
        const sz = big * (1.08 - 0.08 * E.outCubic(u)) * (1 + 0.04 * E.inCubic(env.pOut))
        const bi: TextItem = {
          text: fch,
          font: P.font,
          size: sz,
          x: bx,
          y: by,
          ghost: false,
          alpha: e * out,
        }
        if (P.mode === 'dim') bi.color = mix(sc.bg, sc.fg, 0.13)
        else if (P.mode === 'tint') bi.color = mix(sc.bg, sc.accent, 0.22)
        else {
          bi.fill = false
          bi.stroke = Math.max(1.2, sz * 0.004)
          bi.strokeColor = sc.sub
          bi.alpha = e * out * 0.7
        }
        env.draw(bi)
        // 压在上面的整句小字
        const mt = mainLines(raw, W, H, 16, 8)
        const geom = { track: 0.14, lead: 1.5 }
        const size = Math.min(
          fitSize(mt, P.fs, side ? W * 0.44 : W * 0.7, H * 0.2, geom),
          M * 0.075,
        )
        const base: TextItem = {
          text: mt,
          font: P.fs,
          size,
          x: side ? W / 2 - P.dir * W * 0.12 : W / 2,
          y: P.low ? H * 0.74 : H / 2,
          ...geom,
        }
        const gl = glyphPts(base)
        const skip = [...raw.slice(0, fi)].filter((c) => c === ' ' || c === '　').length
        let bb: BBox | null = null
        gl.forEach((g, i) => {
          const isF = i === fi - skip
          bb = unionBB(
            bb,
            mainDraw(env, {
              text: g.ch,
              font: P.fs,
              size,
              x: g.x,
              y: g.y,
              color: isF ? sc.accent : sc.fg,
              mi: i * 0.6,
            }),
          )
          if (isF && P.dots) {
            const q = E.outBack(clamp((lt - 0.35) / 0.25), 2) * out
            env.circle(g.x, g.y - size * 0.78, size * 0.075 * q, sc.accent, null, 0, 1, true)
          }
        })
        if (bb) {
          const box: BBox = bb
          const le = E.outExpo(clamp((lt - 0.2) / 0.6)) * out
          const y = box.y1 + size * 0.7
          env.line(
            [
              [box.x0, y],
              [lerp(box.x0, box.x1, le), y],
            ],
            sc.sub,
            Math.max(1, M * 0.0013),
            0.6,
            false,
          )
        }
        return bb
      },
    },

    /* ======================================================== 24 横竖混排 */
    halfVertical: {
      w: 1,
      tags: ['editorial', 'graphic'],
      fits: (n) => n >= 3 && n <= 14,
      plan: (rng: Rng, _cut, st: StylePack): HalfVerticalParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        shape: rng.pick(['rowCol', 'rowCol', 'colRow']),
        guide: rng.pick(['bracket', 'tick', 'bracket']),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as HalfVerticalParams
        const M = Math.min(W, H)
        const lt = env.lt
        const txt = String(cut.text).trim().replace(/\s+/g, ' ')
        const arr = [...txt]
        const n = arr.length
        const rowCol = P.shape === 'rowCol'
        const port = W < H
        // 沿着画面长边伸出的那一臂分到的字更多；在附近找一个自然的断点
        const tgt = n * (port ? (rowCol ? 0.38 : 0.62) : rowCol ? 0.6 : 0.4)
        const segB = new Set<number>()
        let acc = 0
        for (const g of segments(txt)) {
          acc += [...g].length
          segB.add(acc)
        }
        let cutAt = Math.max(1, Math.round(tgt))
        let bs = -1e9
        for (let k = 1; k < n; k++) {
          const pa = arr[k - 1]
          const pb = arr[k]
          let score = -Math.abs(k - tgt) * 1.2
          if (segB.has(k)) score += 2
          if (pa === ' ' || pb === ' ') score += 3
          if (isKana(pb) || isPunct(pb)) score -= 8
          if (isKana(pa)) score -= 3
          if (isKana(pa) && !isKana(pb)) score += 1.5
          if (score > bs) {
            bs = score
            cutAt = k
          }
        }
        const A = arr.slice(0, cutAt).join('').trim() || arr[0]
        const B = arr.slice(cutAt).join('').trim() || ''
        const tr = 0.06
        const mA = measure({ text: A, font: P.font, size: 100, track: tr, vertical: !rowCol })
        const mB = measure({ text: B, font: P.font, size: 100, track: tr, vertical: rowCol })
        // 以「字号」为单位量出整体占位
        const wU = rowCol ? mA.w / 100 : 1.25 + mB.w / 100
        const hU = rowCol ? 1.25 + mB.h / 100 : mA.h / 100
        const size = Math.min((W * 0.82) / wU, (H * 0.8) / hU, M * 0.26)
        const x0 = W / 2 - (wU * size) / 2
        const y0 = H / 2 - (hU * size) / 2
        let bb: BBox | null = null
        const out = outK(env)
        let corner: [number, number]
        if (rowCol) {
          const itA: TextItem = {
            text: A,
            font: P.font,
            size,
            x: x0,
            y: y0 + size / 2,
            align: 'left',
            track: tr,
            color: sc.fg,
            mi: 0,
          }
          const gA = glyphPts(itA)
          const last = gA[gA.length - 1] || { x: x0 + size / 2 }
          bb = unionBB(bb, mainDraw(env, itA))
          if (B)
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: B,
                font: P.font,
                size,
                x: last.x,
                y: y0 + size * 1.25,
                vertical: true,
                align: 'left',
                track: tr,
                color: sc.fg,
                mi: 3,
              }),
            )
          corner = [last.x, y0 + size / 2]
        } else {
          const itA: TextItem = {
            text: A,
            font: P.font,
            size,
            x: x0 + size / 2,
            y: y0,
            vertical: true,
            align: 'left',
            track: tr,
            color: sc.fg,
            mi: 0,
          }
          const gA = glyphPts(itA)
          const last = gA[gA.length - 1] || { y: y0 + size / 2 }
          bb = unionBB(bb, mainDraw(env, itA))
          if (B)
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: B,
                font: P.font,
                size,
                x: x0 + size * 1.25,
                y: last.y,
                align: 'left',
                track: tr,
                color: sc.fg,
                mi: 3,
              }),
            )
          corner = [x0 + size / 2, last.y]
        }
        // 贴着拐角外侧的细引导线
        const g = size * 0.42
        const lw = Math.max(1.2, M * 0.0016)
        const le = E.outCubic(clamp((lt - 0.15) / 0.7)) * out
        if (P.guide === 'bracket' && le > 0) {
          const pts: [number, number][] = rowCol
            ? [
                [x0 - g * 0.3, y0 - g * 0.55],
                [corner[0] + size / 2 + g * 0.55, y0 - g * 0.55],
                [corner[0] + size / 2 + g * 0.55, y0 + hU * size + g * 0.3],
              ]
            : [
                [x0 - g * 0.55, y0 - g * 0.3],
                [x0 - g * 0.55, corner[1] + size / 2 + g * 0.55],
                [x0 + wU * size + g * 0.3, corner[1] + size / 2 + g * 0.55],
              ]
          env.polyPartial(pts, le, sc.sub, lw, 0.8, false)
        }
        const q = E.outBack(clamp((lt - 0.3) / 0.25), 2) * out
        if (q > 0) {
          const cs = size * 0.12
          const px = rowCol ? corner[0] + size / 2 + g * 0.55 : x0 - g * 0.55
          const py = rowCol ? y0 - g * 0.55 : corner[1] + size / 2 + g * 0.55
          env.rect(px - (cs / 2) * q, py - (cs / 2) * q, cs * q, cs * q, sc.accent, 1, true)
        }
        return bb
      },
    },

    /* ============================================================ 25 幕布 */
    curtain: {
      w: 0.9,
      tags: ['emotional', 'pop', 'graphic'],
      emph: 1.4,
      fits: (n) => n >= 1 && n <= 16,
      plan: (rng: Rng, _cut, st: StylePack): CurtainParams => ({
        font: rng.pick(fontsOf(st, ['display', 'serif'])),
        variant: rng.pick(['side', 'side', 'shutter', 'rise']),
        col: rng.pick(['velvet', 'velvet', 'accent', 'ink']),
        drape: rng.chance(0.7),
        pleats: rng.chance(0.75),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as CurtainParams
        const M = Math.min(W, H)
        const lt = env.lt
        const mt = mainLines(cut.text, W, H, 10, 5)
        const size = Math.min(
          fitSize(
            mt,
            P.font,
            W * (P.drape && P.variant === 'side' ? 0.7 : 0.8),
            H * (P.variant === 'shutter' ? 0.34 : 0.44),
            {
              track: 0.05,
              lead: 1.15,
            },
          ),
          H * 0.2,
        )
        const t0 = 0.02
        const T = clamp(cut.dur * 0.16, 0.22, 0.48)
        const bb = mainDraw(env, {
          text: mt,
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          track: 0.05,
          lead: 1.15,
          color: sc.fg,
          mi: miAt(env, t0 + T * 0.25),
        })
        const open = E.inOutCubic(clamp((lt - t0) / T)) * (1 - E.inOutCubic(env.pOut))
        const dark = lum(sc.bg) < 0.45
        const panel =
          P.col === 'velvet'
            ? mix(sc.bg, sc.accent, dark ? 0.38 : 0.6)
            : plateCol(sc, P.col === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
        const shade = mix(panel, sc.bg, 0.22)
        const lite = mix(panel, onCol(sc, panel), 0.12)
        const moving = false // 大块移动的幕布：不带色散残影
        const lw = Math.max(1, M * 0.002)
        // 竖向褶皱，随幕布宽度一起压缩
        const pleat = (x0: number, x1: number, y0: number, y1: number, k: number): void => {
          if (!P.pleats || env.pass !== 'main') return
          const m = 7
          const w = x1 - x0
          if (w < 4) return
          for (let i = 1; i < m; i++) {
            const x = x0 + (w * i) / m
            env.rect(x - lw * 1.5, y0, lw * 3, y1 - y0, i % 2 ? shade : lite, 0.55 * k, false)
          }
        }
        if (P.variant === 'side') {
          const rest = P.drape ? W * 0.075 : -W * 0.02
          const xl = lerp(W / 2, rest, open)
          const xr = lerp(W / 2, W - rest, open)
          const bulge = Math.sin(Math.PI * clamp(open)) * W * 0.02
          const L: [number, number][] = [
            [-5, -5],
            [xl, -5],
            [xl + bulge, H * 0.5],
            [xl, H + 5],
            [-5, H + 5],
          ]
          const R: [number, number][] = [
            [W + 5, -5],
            [xr, -5],
            [xr - bulge, H * 0.5],
            [xr, H + 5],
            [W + 5, H + 5],
          ]
          env.poly(L, panel, 1, moving)
          env.poly(R, panel, 1, moving)
          pleat(0, xl, 0, H, 1)
          pleat(xr, W, 0, H, 1)
          if (P.drape && open > 0.5) {
            // 系带
            const q = clamp((open - 0.5) * 2)
            env.rect(
              xl - W * 0.012,
              H * 0.62,
              W * 0.012 + 2,
              H * 0.018,
              sc.accent === panel ? sc.fg : sc.accent,
              q,
              false,
            )
            env.rect(
              xr - 2,
              H * 0.62,
              W * 0.012 + 2,
              H * 0.018,
              sc.accent === panel ? sc.fg : sc.accent,
              q,
              false,
            )
          }
        } else if (P.variant === 'shutter') {
          const rest = P.drape ? H * 0.12 : -H * 0.02
          const yt = lerp(H / 2, rest, open)
          const yb = lerp(H / 2, H - rest, open)
          env.rect(-5, -5, W + 10, yt + 5, panel, 1, moving)
          env.rect(-5, yb, W + 10, H - yb + 5, panel, 1, moving)
          if (P.drape && open > 0.9) {
            const fs = clamp(H * 0.018, 11, 22)
            const a = clamp((open - 0.9) * 10)
            env.draw({
              text: `${String((cut.line | 0) + 1).padStart(2, '0')} ／ ${fmtTime(cut.start)}`,
              font: monoF(env),
              size: fs,
              track: 0.3,
              align: 'left',
              x: W * 0.05,
              y: yt / 2,
              color: onCol(sc, panel),
              alpha: a,
              ghost: false,
            })
          }
        } else {
          // 剧场大幕升起，留下一道波浪褶边
          const rest = P.drape ? H * 0.1 : -H * 0.05
          const yb = lerp(H + 5, rest, open)
          const m = 9
          const sw = W / m
          const dip = Math.min(H * 0.035, Math.max(0, yb) * 0.5)
          const pts: [number, number][] = [
            [-5, -5],
            [W + 5, -5],
            [W + 5, yb],
          ]
          for (let i = m; i >= 0; i--) {
            pts.push([i * sw, yb])
            if (i > 0) pts.push([i * sw - sw / 2, yb + dip])
          }
          env.poly(pts, panel, 1, moving)
          pleat(0, W, 0, Math.max(0, yb), 1)
        }
        return bb
      },
    },

    /* ========================================================== 26 均衡器 */
    equalizer: {
      w: 0.8,
      tags: ['pop', 'graphic', 'glitch'],
      portrait: 0.9,
      fits: (n) => n >= 1 && n <= 12,
      enterBias: { cut: 1.5, pop: 1.3, drop: 1.2, slice: 0.4, wipe: 0.5 },
      plan: (rng: Rng, _cut, st: StylePack): EqualizerParams => ({
        font: rng.pick(fontsOf(st, ['display'])),
        style: rng.pick(['bars', 'blocks', 'blocks', 'mirror']),
        thin: rng.pick([0, 2, 3]),
        peaks: rng.chance(0.7),
        col: rng.pick(['accent', 'accent', 'duo', 'fg']),
        tempo: rng.range(0.42, 0.55),
      }),
      render(env) {
        const { W, H, sc } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as EqualizerParams
        const s = cut.seed
        const M = Math.min(W, H)
        const chs = slotsOf(cut.text)
        const n = chs.length
        if (!n) return null
        const port = W < H
        const rows = port && n > 6 ? 2 : 1
        const per = Math.ceil(n / rows)
        const sw = (W * 0.86) / per
        const size = Math.min(sw * 0.78, H * (rows > 1 ? 0.1 : 0.14))
        const bw = Math.min(sw * 0.6, size * 1.15)
        const e = inE(env, 0.45)
        const out = outK(env)
        const colA = plateCol(sc, [sc.accent, sc.fg])
        const colB = plateCol(sc, [sc.accent2, sc.sub, sc.fg])
        // 第 x 条（连续下标）在 t 时刻的电平
        const level = (x: number, t: number): number => {
          let v = 0.5 + 0.5 * noise1(t * 3.1 + x * 0.83, s)
          v = 0.25 + 0.6 * v
          let pulse
          if (env.beat && env.beat.len > 0.2) {
            pulse =
              Math.exp(-env.beat.since * 7) * (0.4 + 0.6 * r(s, env.beat.index, Math.round(x * 3)))
          } else {
            const k = Math.floor(t / P.tempo)
            const ph = t - k * P.tempo
            pulse = Math.exp(-ph * 7) * (0.3 + 0.7 * r(s, k, Math.round(x * 3)))
          }
          v = v * 0.75 + pulse * 0.45
          if (env.energy != null) v = v * (0.45 + 0.75 * env.energy)
          return clamp(v, 0.06, 1)
        }
        const lw = Math.max(1, M * 0.0016)
        let bb: BBox | null = null
        for (let ri = 0; ri < rows; ri++) {
          const cnt = Math.min(per, n - ri * per)
          const yb = rows > 1 ? (ri ? H * 0.84 : H * 0.47) : H * 0.74
          const hmax = (rows > 1 ? H * 0.26 : H * 0.44) - size * 0.4
          const x0 = W / 2 - (cnt * sw) / 2
          env.line(
            [
              [x0 - sw * 0.2, yb],
              [x0 - sw * 0.2 + (cnt * sw + sw * 0.4) * e, yb],
            ],
            sc.sub,
            lw,
            0.7 * out,
            false,
          )
          const drawBar = (x: number, w: number, h: number, col: string, a: number): void => {
            if (h <= 0.5) return
            if (P.style === 'blocks') {
              const seg = Math.max(4, sw * 0.14)
              const gap = seg * 0.28
              const m = Math.floor(h / seg)
              for (let k = 0; k < m; k++)
                env.rect(
                  x - w / 2,
                  yb - (k + 1) * seg + gap / 2,
                  w,
                  seg - gap,
                  k > (hmax / seg) * 0.72 ? colB : col,
                  a,
                  false,
                )
            } else env.rect(x - w / 2, yb - h, w, h, col, a, false)
            if (P.style === 'mirror')
              env.rect(x - w / 2, yb + lw * 2, w, h * 0.35, col, a * 0.22, false)
          }
          // 有字的柱子之间夹几根细频谱
          if (P.thin)
            for (let j = 0; j <= cnt; j++)
              for (let q = 1; q <= P.thin; q++) {
                if (j === cnt && q > 0) break
                const xi = j + q / (P.thin + 1)
                const x = x0 + xi * sw
                drawBar(
                  x,
                  sw * 0.06,
                  hmax * 0.8 * level(xi + ri * 7 + 0.5, env.ltb) * e * out,
                  sc.sub,
                  0.55,
                )
              }
          for (let j = 0; j < cnt; j++) {
            const i = ri * per + j
            if (chs[i] === ' ') continue
            const x = x0 + (j + 0.5) * sw
            const lv = level(j + 0.5 + ri * 7, env.ltb)
            const h = hmax * lv * e * out
            const col = P.col === 'duo' ? (j % 2 ? colB : colA) : P.col === 'fg' ? sc.fg : colA
            drawBar(x, bw, h, col, P.col === 'fg' ? 0.35 : 0.9)
            if (P.peaks) {
              let pk = 0
              for (let k = 0; k < 6; k++) {
                const tau = k * 0.1
                pk = Math.max(pk, level(j + 0.5 + ri * 7, env.ltb - tau) - tau * 0.55)
              }
              const ph = hmax * pk * e * out
              env.rect(
                x - bw / 2,
                yb - ph - Math.max(3, sw * 0.05) - sw * 0.04,
                bw,
                Math.max(3, sw * 0.05),
                sc.fg,
                0.9 * out * e,
                false,
              )
            }
            bb = unionBB(
              bb,
              mainDraw(env, {
                text: chs[i],
                font: P.font,
                size,
                x,
                y: yb - h - size * 0.62 - (P.peaks ? sw * 0.1 : 0),
                color: sc.fg,
                mi: i,
              }),
            )
          }
        }
        return bb
      },
    },

    /* ============================================================ 27 胶带 */
    tape: {
      w: 1,
      tags: ['pop', 'editorial', 'graphic'],
      treat: 'safe',
      fits: (n) => n >= 1 && n <= 16,
      plan: (rng: Rng, cut, st: StylePack): TapeParams => {
        const n = cut.n
        const port = cut.H > cut.W
        return {
          font: rng.pick(fontsOf(st, ['display', 'body'])),
          fs: rng.pick(fontsOf(st, ['body', 'serif'])),
          variant:
            n > 9 || (port && n > 5)
              ? rng.pick(['stack', 'stack', 'single'])
              : rng.pick(['single', 'cross', 'stack']),
          ang: rng.range(4, 11) * rng.pick([1, -1]),
          col: rng.pick(['accent', 'ink', 'accent']),
          piece: rng.chance(0.75),
          lines: rng.chance(0.6),
        }
      },
      render(env) {
        const { W, H, sc, ctx } = env
        const cut = env.cut
        if (!cut) return null
        const P = cut.params as unknown as TapeParams
        const s = cut.seed
        const M = Math.min(W, H)
        const lt = env.lt
        const port = W < H
        const out = outK(env)
        const dark = lum(sc.bg) < 0.45
        const tapeC = plateCol(sc, P.col === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent])
        const tapeC2 =
          P.col === 'accent' ? plateCol(sc, [sc.ink, sc.fg]) : plateCol(sc, [sc.accent, sc.fg])
        const txtC = onCol(sc, tapeC)
        const strip = (
          x: number,
          y: number,
          ang: number,
          L: number,
          h: number,
          col: string,
          k: number,
          t0: number,
          dur: number,
          content?: (cx2: number, cy2: number) => BBox | null,
        ): BBox | null => {
          const u = E.outCubic(clamp((lt - t0) / dur))
          if (u <= 0) return null
          const vis = L * u
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(ang * DEG)
          ctx.translate(-L / 2, 0)
          if (env.pass === 'main') {
            ctx.save()
            ctx.beginPath()
            ctx.rect(-h, -h, vis + h * (u >= 1 ? 2 : 0), h * 2)
            ctx.clip()
            tapePath(ctx, L, h, s, k)
            ctx.globalAlpha = 0.9 * out
            ctx.fillStyle = col
            ctx.fill()
            if (P.lines) {
              ctx.globalAlpha = 0.07 * out
              ctx.fillStyle = onCol(sc, col)
              for (let j = 1; j < 6; j++)
                ctx.fillRect(0, -h / 2 + (h * j) / 6, L, Math.max(1, h * 0.012))
            }
            ctx.globalAlpha = 0.12 * out
            ctx.fillStyle = dark ? '#000000' : '#FFFFFF'
            ctx.fillRect(0, -h / 2, L, h * 0.08)
            ctx.fillRect(0, h / 2 - h * 0.08, L, h * 0.08)
            ctx.restore()
          }
          let res: BBox | null = null
          if (content) {
            ctx.save()
            ctx.beginPath()
            ctx.rect(-h, -h * 2, vis + h * (u >= 1 ? 2 : 0), h * 4)
            ctx.clip()
            res = content(L / 2, 0)
            ctx.restore()
          }
          ctx.restore()
          return res
        }
        let bb: BBox | null = null
        const txt = String(cut.text).trim()
        if (P.variant === 'stack') {
          let parts = (cut.words && cut.words.length > 1 ? cut.words : [txt])
            .map((p) => p.trim())
            .filter(Boolean)
          if (parts.length > 4) {
            const kk = Math.ceil(parts.length / 4)
            const q: string[] = []
            for (let i = 0; i < parts.length; i += kk) q.push(parts.slice(i, i + kk).join(''))
            parts = q
          }
          if (parts.length === 1 && glyphCount(txt) > (port ? 5 : 9))
            parts = splitLines(txt, Math.ceil(glyphCount(txt) / 2)).split('\n')
          const np = parts.length
          const longest = parts.reduce(
            (a, p) =>
              Math.max(a, measure({ text: p, font: P.font, size: 100, track: 0.05 }).w / 100),
            1,
          )
          const size = Math.min((W * 0.72) / longest, (H * 0.62) / (np * 1.75), M * 0.17)
          const h = size * 1.5
          parts.forEach((p, i) => {
            const m = measure({ text: p, font: P.font, size, track: 0.05 })
            const L = m.w + size * 1.2
            const y = H / 2 + (i - (np - 1) / 2) * h * 1.12
            const x = W / 2 + rs(s, i, 3) * W * 0.05
            const ang = (i % 2 ? -1 : 1) * Math.abs(P.ang) * 0.45 + rs(s, i, 4) * 1.5
            const res = strip(
              x,
              y,
              ang,
              L,
              h,
              i % 3 === 1 ? tapeC2 : tapeC,
              i,
              0.03 + i * 0.12,
              0.3,
              (cx2, cy2) =>
                mainDraw(env, {
                  text: p,
                  font: P.font,
                  size,
                  x: cx2,
                  y: cy2,
                  track: 0.05,
                  color: onCol(sc, i % 3 === 1 ? tapeC2 : tapeC),
                  noHold: plateHold(env),
                  mi: miAt(env, 0.05 + i * 0.12),
                }),
            )
            if (res) bb = unionBB(bb, bbRect(x - L / 2, y - h / 2, x + L / 2, y + h / 2))
          })
          return bb
        }
        const mt = mainLines(txt, W, H, 11, 6)
        const size = Math.min(
          fitSize(mt, P.font, W * 0.7, H * 0.3, { track: 0.05, lead: 1.15 }),
          H * 0.17,
        )
        const mm = measure({ text: mt, font: P.font, size, track: 0.05, lead: 1.15 })
        const L = mm.w + size * 1.6
        const h = mm.h + size * 0.75
        if (P.variant === 'cross') {
          const unit = String(cut.lineText || cut.text)
            .replace(/\s+/g, ' ')
            .trim()
          const fs = h * 0.26
          const L2 = Math.min(
            Math.hypot(W, H) * 0.9,
            measure({ text: unit, font: P.fs, size: fs, track: 0.1 }).w * 1.3 + fs * 6,
          )
          strip(
            W / 2 + L * 0.15,
            H / 2 + h * 0.1,
            -P.ang * 2.4,
            L2,
            h * 0.5,
            tapeC2,
            9,
            0.0,
            0.4,
            (cx2, cy2) =>
              env.draw({
                text: unit,
                font: P.fs,
                size: fs,
                track: 0.1,
                x: cx2,
                y: cy2,
                color: onCol(sc, tapeC2),
                alpha: out,
                ghost: false,
              }),
          )
        }
        const res = strip(W / 2, H / 2, P.ang, L, h, tapeC, 0, 0.06, 0.34, (cx2, cy2) =>
          mainDraw(env, {
            text: mt,
            font: P.font,
            size,
            x: cx2,
            y: cy2,
            track: 0.05,
            lead: 1.15,
            color: txtC,
            noHold: plateHold(env),
            mi: miAt(env, 0.1),
          }),
        )
        if (P.piece) {
          const ph = h * 0.42
          const pl = ph * 2.6
          const ex = W / 2 + Math.cos(P.ang * DEG) * L * 0.5
          const ey = H / 2 + Math.sin(P.ang * DEG) * L * 0.5
          const rom = romaOf(cut)
          const lab = rom ? rom.slice(0, 12) : 'No.' + String((cut.line | 0) + 1).padStart(2, '0')
          strip(
            ex - ph * 0.3,
            ey - ph * 0.4,
            P.ang - 38 * Math.sign(P.ang || 1),
            pl,
            ph,
            tapeC2,
            5,
            0.32,
            0.18,
            (cx2, cy2) =>
              env.draw({
                text: lab,
                font: monoF(env),
                size: Math.min(ph * 0.34, ((pl * 0.7) / Math.max(3, lab.length)) * 1.6),
                track: 0.12,
                x: cx2,
                y: cy2,
                color: onCol(sc, tapeC2),
                alpha: out,
                ghost: false,
              }),
          )
        }
        return res ? bbRect(W / 2 - L / 2, H / 2 - h / 2, W / 2 + L / 2, H / 2 + h / 2) : null
      },
    },
  },
}
