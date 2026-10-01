/**
 * 部件包 treattrans：27 个文字加工（treat）+ 20 个镜间转场（trans）。
 *
 * 逐条移植自 JIZURA 的 src/11p_treattrans.js（MIT）：常量、缓动、hash 种子、
 * 时长、权重与 tags 一律照搬，保证同 seed + 同歌词渲染出同一支视频。
 * key 与注册顺序由 registry 锁定，不要改名、不要增删。
 *
 * 结构约定：
 * - treat 只改写传进来的 TextItem（fill / stroke / gradient / charFns）并挂 pre / post
 *   钩子，额外绘制的副本一律用 `bare()` 剥掉钩子与自身效果，避免递归；
 * - 需要在文字自身的裁剪 / 条带 / 模糊环境下画图形的，走 `withFx()`，它与
 *   layouts.drawFx 的处理逐条对齐；
 * - trans 由 `trReg()` 统一包一层：p<=0 就是上一镜静帧、p>=1 就是本镜，收尾还原 ctx。
 *
 * 中文适配（见移植契约）：
 * - JIZURA的 isKanji / isKata 判定换成 ../script 的 isHan / isKana（中文歌词不含假名，
 *   假名分支实际不会命中，保留判定形状）；
 * - `env.cut` 在本仓库是 `Cut | null`，逐处取局部变量判空；pre / post 钩子与本镜同帧执行，
 *   直接闭包引用 apply 里已经判过空的 `cut`；
 * - 碎片类入场/出场的查询走 ../anim 的核心注册表（不得 import 兄弟 pack 与 registry）。
 */
import type {
  CharFn,
  Env,
  LaidGlyph,
  PackParts,
  Params,
  Rng,
  Scheme,
  TextItem,
  TransDef,
  TransInfo,
  TreatDef,
} from '../types'
import { ENTER, EXIT, combineChar, itemBands } from '../anim'
import { drawItem } from '../draw'
import { layoutText, measure } from '../text-layout'
import { ctxOf } from '../canvas'
import { isHan, isKana, isLatin, isPunct } from '../script'
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
  r,
  rgba,
  rr,
  rs,
  smooth,
} from '../util'

/** 二维方向 / 偏移对 */
type Dir2 = readonly [number, number]
type Pt = readonly [number, number]
type PreFn = NonNullable<TextItem['pre']>
type PostFn = NonNullable<TextItem['post']>
/** 单个文字项可以覆盖本 cut 的动效选择（TextItem 未声明这三项） */
type ItemWithAnim = TextItem & { enter?: string; hold?: string; exit?: string }

/* ============================== 配色助手 ============================== */

const isDark = (c: string): boolean => lum(c) < 0.45
/** 第一个通过校验的颜色，全都不行就用兜底色 */
const firstOK = (list: readonly string[], test: (c: string) => boolean, fb: string): string => {
  for (const c of list) if (c && test(c)) return c
  return fb
}
/** 在一组候选里挑与 against 对比度最高的 */
const best = (list: readonly string[], against: string): string => {
  let b = list[0]
  let bv = -1
  for (const c of list) {
    if (!c) continue
    const v = contrast(c, against)
    if (v > bv) {
      bv = v
      b = c
    }
  }
  return b
}
/** 与 col 不同、同时在方案底色上也读得清的强调色 */
const accentFor = (sc: Scheme, col: string, min = 1.6): string =>
  firstOK(
    [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
    (c) => contrast(c, col) >= min && contrast(c, sc.bg) >= 1.5,
    fitContrast(sc.accent, col, min + 0.3),
  )
/** 底板上的文字色：pref 读得清就用 pref，否则换方案里最合适的 */
const textOn = (box: string, pref: string, sc: Scheme): string =>
  contrast(pref, box) >= 3 ? pref : best([sc.bg, sc.fg, sc.ink, '#111111', '#FFFFFF'], box)
/** 画在文字旁边的记号色（与方案底色拉开对比） */
const markCol = (sc: Scheme, col: string): string =>
  firstOK([sc.accent, sc.accent2, col], (c) => contrast(c, sc.bg) >= 2, col)
/** 全透明：渐变里"这段不上色"的写法 */
const TR = 'rgba(0,0,0,0)'
/** 文字色与底色同族（版画在自带底板的版式上）：描色、记号都会糊掉 */
const onPlate = (sc: Scheme, col: string): boolean => contrast(col, sc.bg) < 1.5

/* ============================== 文字项助手 ============================== */

const alive = (it: TextItem, amin = 0.9): boolean =>
  it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1
const colOf = (env: Env, it: TextItem): string => it.color || env.sc.fg

/** 串接 pre 钩子（先原有、后新增） */
const addPre = (it: TextItem, f: PreFn): void => {
  const p = it.pre
  it.pre = p
    ? (e, i) => {
        p(e, i)
        f(e, i)
      }
    : f
}
/** 串接 post 钩子 */
const addPost = (it: TextItem, f: PostFn): void => {
  const p = it.post
  it.post = p
    ? (e, i, b) => {
        p(e, i, b)
        f(e, i, b)
      }
    : f
}
/** 依赖字号的字段：现在就设一次，并在每次绘制前（enter/hold/exit 改过字号之后）再刷一次 */
const sized = (it: TextItem, env: Env, f: (i: TextItem, e: Env) => void): void => {
  f(it, env)
  addPre(it, (e, i) => f(i, e))
}
/** 入场之后的进度：lt 越过 delay + d 之后在 len 秒内走完 */
const inP = (env: Env, it: TextItem, d: number, len: number): number =>
  clamp((env.lt - (it.delay || 0) - d) / len)
const glyphN = (t: string): number => [...String(t || '')].filter((c) => c.trim()).length
/** 运动序号：装饰 / 单字项可能缺省，`| 0` 与旧代码一样收敛到 0 */
const miOf = (it: TextItem): number => (it.mi ?? 0) | 0
const isSp = (ch: string): boolean => ch === ' ' || ch === '\u3000'
/** 碎片类入场/出场是否正在跑：那期间渐变、无填充、副本都会跟碎片打架 */
const inPieces = (env: Env, it: TextItem): boolean => {
  const c = env.cut
  if (!c) return false
  const ov = it as ItemWithAnim
  const en = ENTER[ov.enter || c.enter]
  const ex = EXIT[ov.exit || c.exit]
  if (en && en.pieces && env.lt - (it.delay || 0) < c.inDur * 1.3 + 0.05) return true
  if (ex && ex.pieces && c.outDur > 0 && env.lt > c.dur - c.outDur - 0.3) return true
  return false
}
/** 在与 drawFx 相同的裁剪 / 条带 / 模糊下执行 fn；local=true 时先移到项目坐标系 */
const withFx = (env: Env, it: TextItem, fn: () => void, local = true): void => {
  const ctx = env.ctx
  const W = env.W
  const H = env.H
  const blur = it.blur || 0
  ctx.save()
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
      // 条带之外的部分照常画（不位移）
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
/** 逐行（竖排逐列）在静态排版下的范围，项目空间；被 charFn 藏掉的字形不计入 */
type Span = { li: number; a0: number; a1: number; c: number; n: number }
const lineSpans = (it: TextItem): Span[] => {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const map = new Map<number, Span>()
  for (const g of lay) {
    if (isSp(g.ch)) continue
    if (it.charFn) {
      const c = it.charFn(g.i, g, lay.N)
      if (c && (c.hide || (c.a != null && c.a < 0.05))) continue
    }
    const a0 = it.vertical ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx
    const a1 = it.vertical ? (g.y + g.h / 2) * sy : (g.x + g.w / 2) * sx
    const L = map.get(g.li)
    if (!L) map.set(g.li, { li: g.li, a0, a1, c: it.vertical ? g.x * sx : g.y * sy, n: 1 })
    else {
      L.a0 = Math.min(L.a0, a0)
      L.a1 = Math.max(L.a1, a1)
      L.n++
    }
  }
  return [...map.values()].sort((a, b) => a.li - b.li)
}
/** 可见字形的项目空间位置，跟随 enter/hold/exit 的逐字位移、缩放、旋转 */
type Placed = {
  g: LaidGlyph
  x: number
  y: number
  w: number
  h: number
  s: number
  rot: number
  a: number
}
const glyphList = (it: TextItem): Placed[] => {
  const lay = layoutText(it)
  const sx = it.sx || 1
  const sy = it.sy || 1
  const out: Placed[] = []
  for (const g of lay) {
    if (isSp(g.ch)) continue
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null
    if (c && c.hide) continue
    out.push({
      g,
      x: g.x * sx + g.vx * sx + ((c && c.dx) || 0),
      y: g.y * sy + g.vy * sy + ((c && c.dy) || 0),
      w: g.w * sx,
      h: g.h * sy,
      s: c && c.s != null ? c.s : 1,
      rot: (c && c.rot) || 0,
      a: c && c.a != null ? c.a : 1,
    })
  }
  return out
}
/** 额外绘制通道（投影、描边…）用的干净副本：不带钩子、也不带自身效果 */
const bare = (i: TextItem, extra?: Partial<TextItem>): TextItem => ({
  ...i,
  pre: undefined,
  post: undefined,
  echo: undefined,
  streak: undefined,
  shadow: undefined,
  extrude: undefined,
  pattern: undefined,
  patternBg: undefined,
  gradient: undefined,
  pieceFn: undefined,
  strokeDash: undefined,
  strokeUnder: undefined,
  wipeBar: undefined,
  cursorAt: undefined,
  bands: undefined,
  vbands: undefined,
  clip: undefined,
  clipY: undefined,
  clipFn: undefined,
  blend: undefined,
  _lay: undefined,
  ...extra,
})
/** 是否处在"笔画描绘"途中：按填充做的副本会露馅 */
const tracing = (i: TextItem): boolean => i.dash != null && i.dash < 1

/* ============================== treat 参数类型 ============================== */

type NeonOutlineParams = { k: number; fl: boolean }
type ChromeParams = { v: string; h: number }
type RainbowParams = { v: string; sp: number; dir: number }
type GlitchSplitParams = { d: number; up: boolean }
type ShadowStackParams = { d: number; dir: Dir2; n: number }
type StencilGapParams = { v: string; at: number; g: number }
type WaterlineParams = { lvl: number; c: number; k: number }
type KaraokeParams = { sp: number; ol: boolean }
type SizeWaveParams = { v: string; k: number; rev: boolean }
type RotateAltParams = { a: number; v: string }
type BaselineShiftParams = { v: string; k: number; dir: number }
type FauxBoldParams = { k: number }
type CircledParams = { v: string; k: number }
type BracketsQuoteParams = { v: string; k: number }
type ReflectionParams = { k: number; a: number; gap: number }
type InlineParams = { a: number; b: number; c: boolean }
type StickerParams = { k: number; rot: number; sh: number }
type GradientSweepParams = { v: string; per: number; ph: number }
type KerningWideParams = { t: number; grow: number }
type MonoGridParams = { pitch: number; c: number }
type OutlineOffsetParams = { d: number; dir: Dir2; k: number }
type ToneShadowParams = { v: 'dots' | 'stripes' | 'hatch'; d: number; dir: Dir2 }
type FadeCharsParams = { v: string; lo: number }
type CutShiftParams = { at: number; d: number; line: boolean }
type FocusPullParams = { b: number; rev: boolean }
type SpotCharParams = { v: string; k: number; r: number }
type RansomParams = { s: number }

/** 切り貼り文字每张纸片的随机外观 */
type Scrap = {
  pc: string
  tc: string
  rot: number
  s: number
  dy: number
  pad: number[]
  j: number[]
}
/** 一次 drawCut 之内共享的状态：整句歌词只配一对括号、只打一个 spotlight */
const QUOTED = new WeakMap<Env, boolean>()
const SPOT = new WeakMap<Env, boolean>()

/* ============================== 文字加工 ============================== */

const TREAT: Record<string, TreatDef> = {
  /* ---- 霓虹管：细亮描边 + 彩色辉光，不填充，偶尔闪一下 ---- */
  neonOutline: {
    tags: ['glitch', 'emotional', 'pop'],
    w: 0.8,
    plan: (rng) => ({ k: rng.range(0.024, 0.032), fl: rng.chance(0.75) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as NeonOutlineParams
      if (!cut || !alive(it, 0.5) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const dk = isDark(sc.bg)
      const gc = dk
        ? firstOK(
            [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
            (c) => lum(c) > lum(sc.bg) + 0.15 && contrast(c, col) >= 1.2,
            col,
          )
        : firstOK(
            [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
            (c) => contrast(c, sc.bg) >= 1.8,
            col,
          )
      const tube = dk ? mix(col, '#FFFFFF', 0.4) : col
      it.fill = false
      it.strokeColor = tube
      sized(it, env, (i) => {
        i.stroke = Math.max(1.4, i.size * P.k)
        i.shadow = { color: rgba(gc, dk ? 1 : 0.7), blur: i.size * 0.07, dx: 0, dy: 0 }
      })
      addPre(it, (e, i) => {
        // 灯管下面垫一层大范围柔光（只主层画）
        if (e.pass !== 'main' || tracing(i)) return
        const s = i.size
        const c = bare(i, {
          fill: false,
          stroke: s * P.k * 4.5,
          strokeColor: gc,
          alpha: (i.alpha ?? 1) * (dk ? 0.22 : 0.16),
          shadow: { color: rgba(gc, 0.9), blur: s * 0.16, dx: 0, dy: 0 },
        })
        withFx(e, i, () => drawItem(e, c), false)
      })
      if (P.fl) {
        const s0 = hash(cut.seed, miOf(it) + 3, 41)
        ;(it.charFns ??= []).push((gi) => {
          const v = r(s0, gi, env.step)
          return v < 0.03 ? { a: 0.22 } : v < 0.05 ? { a: 0.6 } : null
        })
      }
    },
  },

  /* ---- 铬字：多段金属渐变 + 硬地平线 + 细描边 ---- */
  chrome: {
    tags: ['pop', 'graphic'],
    w: 0.7,
    plan: (rng) => ({ v: rng.pick(['silver', 'silver', 'sunset']), h: rng.range(0.5, 0.56) }),
    apply(env, it, p) {
      const P = p as unknown as ChromeParams
      if (!alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const light = lum(col) > 0.42
      const h = P.h
      const acc = accentFor(sc, col, 1.3)
      const top0 = light ? '#FFFFFF' : mix(col, '#FFFFFF', 0.55)
      const top1 = light ? mix(col, '#000000', 0.42) : col
      const band = mix(col, '#000000', light ? 0.62 : 0.45)
      const low0 =
        P.v === 'sunset' ? mix(acc, '#FFFFFF', 0.5) : mix(col, '#FFFFFF', light ? 0.75 : 0.42)
      const low1 = P.v === 'sunset' ? acc : mix(col, '#000000', light ? 0.12 : 0.25)
      const grad: readonly (readonly [number, string])[] = [
        [0.08, top0],
        [h, top1],
        [h, band],
        [h + 0.03, band],
        [h + 0.03, low0],
        [0.94, low1],
      ]
      it.gradient = grad
      it.strokeColor = light ? mix(col, '#000000', 0.7) : mix(col, '#000000', 0.35)
      sized(it, env, (i) => {
        i.stroke = Math.max(1.2, i.size * 0.022)
      })
    },
  },

  /* ---- 虹色：字形颜色沿方案色板漂移 ---- */
  rainbow: {
    tags: ['pop', 'emotional'],
    w: 0.7,
    plan: (rng) => ({
      v: rng.pick(['drift', 'drift', 'steps']),
      sp: rng.range(0.28, 0.45),
      dir: rng.chance(0.5) ? 1 : -1,
    }),
    apply(env, it, p) {
      const P = p as unknown as RainbowParams
      if (!alive(it)) return
      const sc = env.sc
      const col = colOf(env, it)
      if (onPlate(sc, col)) return
      const pal = [col]
      for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub])
        if (c && contrast(c, sc.bg) >= 1.8 && pal.every((q) => contrast(q, c) >= 1.25)) pal.push(c)
      if (pal.length < 3) pal.push(fitContrast(mix(sc.accent, sc.accent2 || sc.fg, 0.5), sc.bg, 2))
      const L = pal.length
      const off = miOf(it)
      ;(it.charFns ??= []).push((gi) => {
        if (P.v === 'steps') {
          const k = (((gi + off + Math.floor(env.ltb * 2.2) * P.dir) % L) + L) % L
          return { color: pal[k] }
        }
        const u = (gi + off) * P.sp - env.ltb * 0.75 * P.dir
        const k = ((u % L) + L) % L
        const a = Math.floor(k)
        const f = smooth(0.3, 0.7, k - a)
        return { color: mix(pal[a], pal[(a + 1) % L], f) }
      })
    },
  },

  /* ---- 色版错位：两份偏色副本横向错开，glitch 拍上抖动 ---- */
  glitchSplit: {
    tags: ['glitch', 'pop'],
    w: 0.8,
    plan: (rng) => ({ d: rng.range(0.06, 0.08), up: rng.chance(0.3) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as GlitchSplitParams
      if (!cut || !alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const dk = isDark(sc.bg)
      const cands = [sc.ghostA, sc.ghostB, sc.accent, sc.accent2].filter(
        (c) => c && contrast(c, sc.bg) >= 1.4 && contrast(c, col) >= 1.15,
      )
      const cA = cands[0] || accentFor(sc, col, 1.4)
      const cB = cands.find((c) => contrast(c, cA) >= 1.3) || mix(cA, sc.bg, 0.4)
      const s0 = hash(cut.seed, miOf(it) + 5, 43)
      addPre(it, (e, i) => {
        const rv = r(s0, e.step)
        const hit = rv < 0.2 && e.lt > cut.inDur * 0.5
        if (hit && !i.bands && !i.vbands && e.pass === 'main') {
          const s = i.size
          i.bands = itemBands(e, i, 4, (k) =>
            r(s0, e.step, k, 7) < 0.55 ? rs(s0, e.step, k, 8) * s * 0.16 : 0,
          )
        }
        if (e.pass !== 'main' || tracing(i)) return
        const s = i.size
        const d = s * P.d * (hit ? 1.8 + r(s0, e.step, 2) : 1)
        const dy = (P.up ? d * 0.45 : 0) + (hit ? rs(s0, e.step, 3) * s * 0.02 : 0)
        const cp = (c: string, k: number): TextItem =>
          bare(i, {
            x: i.x + d * k,
            y: i.y + dy * k,
            color: c,
            strokeColor: c,
            stroke: 0,
            blend: dk ? 'screen' : 'multiply',
            alpha: (i.alpha ?? 1) * 0.95,
          })
        withFx(
          e,
          i,
          () => {
            drawItem(e, cp(cA, -1))
            drawItem(e, cp(cB, 1))
          },
          false,
        )
      })
    },
  },

  /* ---- 多重影：三份分离的异色副本 ---- */
  shadowStack: {
    tags: ['pop', 'graphic'],
    w: 0.8,
    plan: (rng) => ({
      d: rng.range(0.04, 0.055),
      dir: rng.pick([
        [1, 1],
        [1, 1],
        [-1, 1],
        [1, 0.5],
        [0, 1],
      ] as const),
      n: rng.pick([3, 3, 4]),
    }),
    apply(env, it, p) {
      const P = p as unknown as ShadowStackParams
      if (!alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const cols: string[] = []
      for (const c of [sc.accent, sc.accent2, sc.ghostB, sc.ghostA, sc.ink, sc.sub, sc.fg])
        if (
          c &&
          contrast(c, sc.bg) >= 1.4 &&
          contrast(c, col) >= 1.12 &&
          cols.every((q) => contrast(q, c) >= 1.12)
        )
          cols.push(c)
      while (cols.length < P.n)
        cols.push(mix(cols.length ? cols[cols.length - 1] : accentFor(sc, col), sc.bg, 0.35))
      it.strokeColor = sc.bg
      it.strokeUnder = true
      sized(it, env, (i) => {
        i.stroke = Math.max(1.5, i.size * 0.028)
      })
      addPre(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i)) return
        const s = i.size
        const d = s * P.d
        withFx(
          e,
          i,
          () => {
            for (let k = P.n; k >= 1; k--) {
              drawItem(
                e,
                bare(i, {
                  x: i.x + P.dir[0] * d * k,
                  y: i.y + P.dir[1] * d * k,
                  color: cols[k - 1],
                  stroke: Math.max(1.5, s * 0.028),
                  strokeColor: sc.bg,
                  strokeUnder: true,
                }),
              )
            }
          },
          false,
        )
      })
    },
  },

  /* ---- Stencil：每道切口横穿字形（逐字裁剪，色散副本也吃得到）；入场时切口张开 ---- */
  stencilGap: {
    tags: ['graphic', 'editorial', 'glitch'],
    w: 0.6,
    plan: (rng) => ({
      v: rng.pick(['one', 'one', 'two']),
      at: rng.range(-0.05, 0.06),
      g: rng.range(0.034, 0.048),
    }),
    apply(env, it, p) {
      const P = p as unknown as StencilGapParams
      if (!alive(it) || inPieces(env, it)) return
      const g = P.g * E.outCubic(inP(env, it, 0.04, 0.4)) * (1 - E.inCubic(env.pOut))
      if (g < 0.003) return
      const cuts = P.v === 'two' ? [-0.13, 0.13] : [P.at]
      const vert = false
      const parts: Dir2[] = []
      let lo = -0.8
      for (const c of cuts) {
        parts.push([lo, c - g])
        lo = c + g
      }
      parts.push([lo, 0.8])
      const fns: CharFn[] = parts.map(
        (pr): CharFn =>
          () =>
            vert ? { clipX: pr } : { clipY: pr },
      )
      ;(it.charFns ??= []).push(fns[0])
      addPre(it, (e, i) => {
        if (tracing(i)) return
        const rest = (i.charFns ?? []).filter((f) => f !== fns[0])
        withFx(
          e,
          i,
          () => {
            for (let k = 1; k < fns.length; k++)
              drawItem(e, bare(i, { charFn: combineChar(rest.concat([fns[k]])) }))
          },
          false,
        )
      })
    },
  },

  /* ---- 水位：袋文字从下往上灌满颜色，水面轻微起伏，出场时退干 ---- */
  waterline: {
    tags: ['emotional', 'pop', 'calm'],
    w: 0.6,
    plan: (rng) => ({ lvl: rng.range(0.46, 0.58), c: rng.int(0, 1), k: rng.range(0.02, 0.026) }),
    apply(env, it, p) {
      const P = p as unknown as WaterlineParams
      if (!alive(it, 0.5) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const liq = P.c ? accentFor(sc, col, 1.3) : col
      const q = E.inOutCubic(inP(env, it, 0.05, 0.8)) * (1 - E.inCubic(env.pOut))
      const L = lerp(1.02, P.lvl, q) + Math.sin(env.ltb * 2.6 + miOf(it)) * 0.022 * q
      const surf = mix(liq, '#FFFFFF', isDark(liq) ? 0.35 : 0.5)
      const grad: readonly (readonly [number, string])[] = [
        [0, TR],
        [clamp(L - 0.001), TR],
        [clamp(L), surf],
        [clamp(L + 0.025), surf],
        [clamp(L + 0.025), liq],
        [1, liq],
      ]
      it.gradient = grad
      it.strokeColor = col
      sized(it, env, (i, e) => {
        i.stroke = Math.max(1.3, i.size * P.k)
        if (e.pass !== 'main') i.fill = false
      })
    },
  },

  /* ---- 卡拉OK：彩色擦除沿歌词推进，走完整个镜头 ---- */
  karaoke: {
    tags: ['emotional', 'pop', 'editorial'],
    w: 0.9,
    plan: (rng) => ({ sp: rng.range(0.7, 0.85), ol: rng.chance(0.55) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as KaraokeParams
      if (!cut || !alive(it, 0.9)) return
      const sc = env.sc
      const col = colOf(env, it)
      const hot = accentFor(sc, col, 1.8)
      if (onPlate(sc, col)) return
      if (P.ol) {
        const oc = best([sc.bg, sc.ink, '#111111', '#FFFFFF'], col)
        it.strokeColor = oc
        it.strokeUnder = true
        sized(it, env, (i) => {
          i.stroke = Math.max(1.5, i.size * 0.06)
        })
      }
      addPost(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i)) return
        const t0 = cut.inDur * 0.6
        const T = Math.max(0.3, (cut.dur - cut.outDur - t0) * P.sp)
        const q = E.inOutSine(clamp((e.lt - (i.delay || 0) - t0) / T))
        if (q <= 0) return
        const spans = lineSpans(i)
        if (!spans.length) return
        const s = i.size
        const sx = i.sx || 1
        const sy = i.sy || 1
        const pad = s * 0.12
        const tot = spans.reduce((a, L) => a + (L.a1 - L.a0), 0)
        let rem = q * tot
        const c = bare(i, {
          x: 0,
          y: 0,
          rot: 0,
          skew: 0,
          color: hot,
          blur: 0,
          strokeUnder: i.strokeUnder,
        })
        withFx(e, i, () => {
          const ctx = e.ctx
          ctx.save()
          ctx.beginPath()
          for (const L of spans) {
            if (rem <= 0) break
            const len = L.a1 - L.a0
            const take = Math.min(len, rem)
            rem -= take
            const a0 = L.a0 - pad
            const a1 = L.a0 + take + (take >= len - 0.01 ? pad : 0)
            const cr = s * (i.vertical ? sx : sy) * 0.72
            if (i.vertical) ctx.rect(L.c - cr, a0, cr * 2, a1 - a0)
            else ctx.rect(a0, L.c - cr, a1 - a0, cr * 2)
          }
          ctx.clip()
          drawItem(e, c)
          ctx.restore()
        })
      })
    },
  },

  /* ---- 大小节奏：字形按奇偶 / 脚本 / 斜坡交替缩放，并按共享基线重新紧排 ---- */
  sizeWave: {
    tags: ['pop', 'graphic', 'editorial'],
    w: 0.7,
    plan: (rng) => ({
      v: rng.pick(['alt', 'kanji', 'kanji', 'ramp', 'wave']),
      k: rng.range(0.64, 0.74),
      rev: rng.chance(0.4),
    }),
    apply(_env, it, p) {
      const P = p as unknown as SizeWaveParams
      if (!alive(it, 0.5)) return
      const lay = layoutText(it)
      const N = lay.N
      const off = miOf(it)
      if (!N) return
      const chars = lay.map((g) => g.ch).filter((c) => c.trim())
      // JIZURA分「汉字 / 片假名 / 拉丁」，这里取「汉字 / 假名 / 拉丁」
      const isK = (c: string) => isHan(c) || isKana(c) || isLatin(c)
      let v = P.v
      if (v === 'kanji' && !(chars.some(isK) && chars.some((c) => !isK(c)))) v = 'alt'
      if ((v === 'ramp' || v === 'wave') && chars.length < 3) v = 'alt'
      const S = new Array<number>(N).fill(1)
      for (const g of lay) {
        const u = g.n > 1 ? g.ci / (g.n - 1) : 0.5
        let s: number
        if (v === 'alt') s = (g.ci + g.li + off) % 2 ? P.k : 1.04
        else if (v === 'kanji') s = isK(g.ch) ? 1.08 : P.k + 0.04
        else if (v === 'ramp') s = lerp(1.1, P.k, P.rev ? 1 - u : u)
        else s = 0.87 + 0.17 * Math.sin(g.ci * 1.25 + off)
        if (isPunct(g.ch)) s = Math.min(s, 0.9)
        S[g.i] = s
      }
      // 沿每行重新排布，让小字形靠拢（偏移按 em 存）
      const F = new Array<number>(N).fill(0)
      const size0 = it.size
      const tr = (it.track || 0) * size0
      const vert = !!it.vertical
      const byLine = new Map<number, LaidGlyph[]>()
      for (const g of lay) {
        let arr = byLine.get(g.li)
        if (!arr) byLine.set(g.li, (arr = []))
        arr.push(g)
      }
      for (const gs of byLine.values()) {
        const ext = (g: LaidGlyph) => (vert ? g.h : g.w)
        const pos = (g: LaidGlyph) => (vert ? g.y : g.x)
        const tot = gs.reduce((a, g) => a + ext(g) * S[g.i], 0) + tr * (gs.length - 1)
        const old0 = pos(gs[0]) - ext(gs[0]) / 2
        const old1 = pos(gs[gs.length - 1]) + ext(gs[gs.length - 1]) / 2
        let cur =
          it.align === 'left'
            ? old0
            : it.align === 'right' && !vert
              ? old1 - tot
              : (old0 + old1) / 2 - tot / 2
        for (const g of gs) {
          const w = ext(g) * S[g.i]
          F[g.i] = (cur + w / 2 - pos(g)) / size0
          cur += w + tr
        }
      }
      ;(it.charFns ??= []).push((gi, g) => {
        const s = S[gi]
        if (s == null) return null
        if (vert) return { s, dy: F[gi] * g.w * (it.sy || 1) }
        return { s, dx: F[gi] * g.h * (it.sx || 1), dy: (1 - s) * 0.4 * g.h * (it.sy || 1) }
      })
    },
  },

  /* ---- 揺れ字：奇偶左右倾斜，像手排活字 ---- */
  rotateAlt: {
    tags: ['pop', 'emotional'],
    w: 0.7,
    safe: true,
    plan: (rng) => ({ a: rng.range(9, 14), v: rng.pick(['alt', 'alt', 'rand']) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as RotateAltParams
      if (!cut || !alive(it, 0.5)) return
      const off = miOf(it)
      const s0 = hash(cut.seed, off + 9, 47)
      ;(it.charFns ??= []).push((gi, g) => {
        if (isPunct(g.ch)) return null
        const sg = (gi + off) % 2 ? 1 : -1
        const r0 = P.v === 'rand' ? sg * P.a * rr(0.45, 1.25, s0, gi) : sg * P.a
        return { rot: r0, s: 0.94 }
      })
    },
  },

  /* ---- 段違い：基线上下交替，或阶梯、或拱形 ---- */
  baselineShift: {
    tags: ['pop', 'graphic'],
    w: 0.7,
    safe: true,
    plan: (rng) => ({
      v: rng.pick(['alt', 'alt', 'stairs', 'arc']),
      k: rng.range(0.08, 0.11),
      dir: rng.chance(0.5) ? 1 : -1,
    }),
    apply(_env, it, p) {
      const P = p as unknown as BaselineShiftParams
      if (!alive(it, 0.5)) return
      const off = miOf(it)
      const vert = !!it.vertical
      const kk = String(it.text).includes('\n') ? 0.7 : 1
      ;(it.charFns ??= []).push((_gi, g) => {
        const u = g.n > 1 ? g.ci / (g.n - 1) : 0.5
        let o: number
        if (P.v === 'stairs') o = (u - 0.5) * P.k * Math.min(3.2, g.n * 0.55) * P.dir
        else if (P.v === 'arc') o = (Math.sin(Math.PI * u) - 0.6) * P.k * 2.2
        else o = ((g.ci + off) % 2 ? 1 : -1) * P.k
        return vert ? { dx: o * kk * g.w * (it.sx || 1) } : { dy: -o * kk * g.h * (it.sy || 1) }
      })
    },
  },

  /* ---- 极太：同色描边把每一根笔画加粗 ---- */
  fauxBold: {
    tags: ['graphic', 'pop', 'editorial'],
    w: 0.5,
    safe: true,
    plan: (rng) => ({ k: rng.range(0.035, 0.05) }),
    apply(env, it, p) {
      const P = p as unknown as FauxBoldParams
      if (!alive(it)) return
      it.strokeColor = colOf(env, it)
      it.track = (it.track || 0) + P.k
      sized(it, env, (i, e) => {
        i.stroke = inPieces(e, i) ? 0 : Math.max(1, i.size * P.k)
      })
    },
  },

  /* ---- 丸囲み：每个字各自套一个圆环（或实心圆盘） ---- */
  circled: {
    tags: ['pop', 'graphic', 'editorial'],
    w: 0.6,
    plan: (rng) => ({ v: rng.pick(['ring', 'ring', 'disc']), k: rng.range(0.68, 0.74) }),
    apply(env, it, p) {
      const P = p as unknown as CircledParams
      if (!alive(it, 0.9)) return
      const sc = env.sc
      const col = colOf(env, it)
      const disc = P.v === 'disc'
      if (onPlate(sc, col)) return
      const rc = disc
        ? firstOK(
            [sc.accent, sc.accent2, sc.ink, sc.fg],
            (c) => contrast(c, sc.bg) >= 2 && contrast(c, col) >= 1.3,
            sc.fg,
          )
        : markCol(sc, col)
      const tc = disc ? textOn(rc, col, sc) : col
      const qOf = (e: Env, gi: number): number =>
        E.outBack(clamp((e.lt - (it.delay || 0) - gi * 0.04) / 0.26), 1.6) *
        (1 - E.inCubic(clamp(e.pOut * 1.4 - gi * 0.03)))
      ;(it.charFns ??= []).push((gi, g) =>
        isPunct(g.ch)
          ? null
          : disc && tc !== col && qOf(env, gi) > 0.55
            ? { s: P.k, color: tc }
            : { s: P.k },
      )
      addPre(it, (e, i) =>
        withFx(e, i, () => {
          const s = i.size
          const a = i.alpha ?? 1
          const m = Math.min(i.sx || 1, i.sy || 1)
          for (const G of glyphList(i)) {
            if (isPunct(G.g.ch)) continue
            const q = qOf(e, G.g.i)
            if (q <= 0.01) continue
            const r0 = s * 0.49 * m * (G.s / P.k) * q
            if (disc) e.circle(G.x, G.y, r0, rc, null, 0, a * G.a, true)
            else e.circle(G.x, G.y, r0 * 0.97, null, rc, Math.max(1.5, s * 0.045), a * G.a, true)
          }
        }),
      )
    },
  },

  /* ---- 引括号：整句歌词外面画一对「」 ---- */
  bracketsQuote: {
    tags: ['editorial', 'emotional', 'calm'],
    w: 0.6,
    plan: (rng) => ({ v: rng.pick(['single', 'single', 'double']), k: rng.range(0.05, 0.065) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as BracketsQuoteParams
      if (!cut || !alive(it, 0.9)) return
      const norm = (t: string) => String(t || '').replace(/[\s\u3000]/g, '')
      const whole = norm(cut.text)
      const mine = norm(it.text)
      if (!mine || !whole) return
      let open = whole.startsWith(mine)
      let close = whole.endsWith(mine)
      if (!open && !close) return
      if (mine === whole) QUOTED.set(env, true)
      else if ([...mine].length === 1) {
        // 单字项（mixed / scatter…）：只认运动序号首个 / 末个，整句已经配对了就不再配
        const n = [...whole].length
        const mi = it.mi
        if (QUOTED.get(env) || mi == null || mi !== Math.round(mi)) return
        open = open && mi === 0
        close = close && mi === n - 1
        if (!open && !close) return
      }
      const sc = env.sc
      const lc = markCol(sc, colOf(env, it))
      // 给括号腾位置
      const m = measure(it)
      const along = it.vertical ? m.h : m.w
      const room = it.size * 1.1
      const cap = (it.vertical ? env.H : env.W) * 0.92
      if (along + room > cap && along < cap * 1.05) it.size *= Math.max(0.72, cap / (along + room))
      addPost(it, (e, i) =>
        withFx(e, i, () => {
          const spans = lineSpans(i)
          if (!spans.length) return
          const s = i.size * Math.min(i.sx || 1, i.sy || 1)
          const a = i.alpha ?? 1
          const q = E.outCubic(inP(e, i, cut.inDur * 0.45, 0.35)) * (1 - E.inCubic(e.pOut))
          if (q <= 0.01) return
          const L0 = spans[0]
          const L1 = spans[spans.length - 1]
          const lw = Math.max(1.5, s * P.k)
          const g = s * 0.3
          const arm = s * 0.36
          const leg = s * 0.74
          const draw = (pts: readonly Pt[]): void => e.polyPartial(pts, q, lc, lw, a, false)
          const one = (d: number): void => {
            if (!i.vertical) {
              const xL = L0.a0 - g - d
              const yT = L0.c - s * 0.52 - d
              const xR = L1.a1 + g + d
              const yB = L1.c + s * 0.52 + d
              if (open)
                draw([
                  [xL + arm, yT],
                  [xL, yT],
                  [xL, yT + leg],
                ])
              if (close)
                draw([
                  [xR - arm, yB],
                  [xR, yB],
                  [xR, yB - leg],
                ])
            } else {
              const xR = L0.c + s * 0.52 + d
              const yT = L0.a0 - g - d
              const xL = L1.c - s * 0.52 - d
              const yB = L1.a1 + g + d
              if (open)
                draw([
                  [xR, yT + arm],
                  [xR, yT],
                  [xR - leg, yT],
                ])
              if (close)
                draw([
                  [xL, yB - arm],
                  [xL, yB],
                  [xL + leg, yB],
                ])
            }
          }
          one(0)
          if (P.v === 'double') one(-lw * 2.2)
        }),
      )
    },
  },

  /* ---- 映り込み：末行在假想地面上留一份翻转渐隐的倒影 ---- */
  reflection: {
    tags: ['emotional', 'calm', 'editorial'],
    w: 0.6,
    plan: (rng) => ({
      k: rng.range(0.6, 0.78),
      a: rng.range(0.34, 0.46),
      gap: rng.range(0.04, 0.09),
    }),
    apply(env, it, p) {
      const P = p as unknown as ReflectionParams
      if (!alive(it, 0.9)) return
      const col = colOf(env, it)
      addPre(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return
        const m = measure(i)
        const s = i.size
        const sy = i.sy || 1
        const k = P.k
        const yb = i.vertical && i.align === 'left' ? m.h : m.h / 2
        const gap = s * sy * P.gap
        const cf = i.charFn
        const c = bare(i, {
          x: 0,
          y: yb + gap + yb * k,
          rot: 0,
          skew: 0,
          sy: -sy * k,
          blur: 0,
          gradient: [
            [0, TR],
            [0.42, rgba(col, 0.12)],
            [1, rgba(col, 1)],
          ] as readonly (readonly [number, string])[],
          alpha: (i.alpha ?? 1) * P.a,
          charFn: cf
            ? (gi, g, n) => {
                const r0 = cf(gi, g, n)
                // 倒影里逐字位移与旋转都要翻过来，逐字换色则不算
                return r0
                  ? { ...r0, dy: -(r0.dy || 0) * k, rot: -(r0.rot || 0), color: undefined }
                  : r0
              }
            : null,
        })
        withFx(e, i, () => {
          const ctx = e.ctx
          ctx.save()
          ctx.beginPath()
          ctx.rect(-e.W * 3, yb + gap * 0.5, e.W * 6, gap * 0.5 + s * sy * k * 1.05)
          ctx.clip()
          drawItem(e, c)
          ctx.restore()
        })
      })
    },
  },

  /* ---- 内描线（インライン）：沿每条笔画内侧走一道底色细线 ---- */
  inline: {
    tags: ['editorial', 'pop', 'graphic'],
    w: 0.6,
    plan: (rng) => ({
      a: rng.range(0.017, 0.022),
      b: rng.range(0.016, 0.021),
      c: rng.chance(0.3),
    }),
    apply(env, it, p) {
      const P = p as unknown as InlineParams
      if (!alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const line = P.c
        ? firstOK([sc.accent, sc.accent2], (c) => contrast(c, col) >= 2, sc.bg)
        : sc.bg
      addPost(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return
        const s = i.size
        const cut = bare(i, { fill: false, stroke: s * (P.a + P.b) * 2, strokeColor: line })
        const rim = bare(i, { fill: false, stroke: s * P.a * 2, strokeColor: col })
        withFx(
          e,
          i,
          () => {
            drawItem(e, cut)
            drawItem(e, rim)
          },
          false,
        )
      })
    },
  },

  /* ---- シール縁：厚白纸条料边框（浅色文字再加一道 keyline）+ 软投影 + 轻微旋转 ---- */
  sticker: {
    tags: ['pop', 'graphic'],
    w: 0.8,
    plan: (rng) => ({
      k: rng.range(0.13, 0.17),
      rot: rng.range(2, 4) * (rng.chance(0.5) ? 1 : -1),
      sh: rng.range(0.035, 0.05),
    }),
    apply(env, it, p) {
      const P = p as unknown as StickerParams
      if (!alive(it, 0.9)) return
      const sc = env.sc
      const col = colOf(env, it)
      const dk = isDark(sc.bg)
      const paper = firstOK([sc.ink, sc.fg, sc.sub], (c) => lum(c) > 0.78, '#FFFFFF')
      const key =
        contrast(col, paper) < 2.5
          ? firstOK(
              [sc.accent, sc.accent2, sc.ghostB, sc.ghostA],
              (c) => contrast(c, paper) >= 2.2 && contrast(c, col) >= 1.8,
              '#111111',
            )
          : null
      const edge = mix(paper, '#000000', 0.16)
      if (!it.vertical || glyphN(it.text) <= 4)
        it.rot = (it.rot || 0) + P.rot * (miOf(it) % 2 ? -0.7 : 1)
      addPre(it, (e, i) => {
        if (e.pass !== 'main' || inPieces(e, i)) return
        const s = i.size
        const rim = bare(i, {
          fill: false,
          stroke: s * (P.k + 0.016),
          strokeColor: edge,
          shadow: {
            color: `rgba(0,0,0,${dk ? 0.6 : 0.32})`,
            blur: s * 0.05,
            dx: s * 0.015,
            dy: s * P.sh,
          },
        })
        const pap = bare(i, { fill: false, stroke: s * P.k, strokeColor: paper })
        withFx(
          e,
          i,
          () => {
            drawItem(e, rim)
            drawItem(e, pap)
            if (key) drawItem(e, bare(i, { fill: false, stroke: s * 0.07, strokeColor: key }))
          },
          false,
        )
      })
    },
  },

  /* ---- 光泽扫过 / 潮线：一段动画渐变穿过字形 ---- */
  gradientSweep: {
    tags: ['pop', 'emotional'],
    w: 0.7,
    plan: (rng) => ({
      v: rng.pick(['glint', 'glint', 'tide']),
      per: rng.range(1.5, 2.3),
      ph: rng.range(0, 1),
    }),
    apply(env, it, p) {
      const P = p as unknown as GradientSweepParams
      if (!alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const t = env.ltb / P.per + P.ph
      if (P.v === 'tide') {
        const c2 = accentFor(sc, col, 1.5)
        const u = 0.52 + 0.3 * Math.sin(t * TAU)
        const line = mix(c2, '#FFFFFF', 0.45)
        const grad: readonly (readonly [number, string])[] = [
          [0, col],
          [u - 0.02, col],
          [u - 0.02, line],
          [u + 0.01, line],
          [u + 0.01, c2],
          [1, c2],
        ]
        it.gradient = grad
        return
      }
      const hl =
        lum(col) > 0.6
          ? firstOK(
              [sc.accent, sc.accent2, sc.ghostA, sc.ghostB],
              (c) => lum(c) > 0.3 && contrast(c, col) >= 1.3,
              mix(col, sc.bg, 0.45),
            )
          : mix(col, '#FFFFFF', 0.72)
      const u = (t % 1) * 1.7 - 0.35
      const w = 0.13
      const grad: readonly (readonly [number, string])[] = [
        [0, col],
        [clamp(u - w), col],
        [clamp(u), hl],
        [clamp(u + w * 0.35), hl],
        [clamp(u + w * 1.2), col],
        [1, col],
      ]
      it.gradient = grad
    },
  },

  /* ---- 字間広め：加大字距、缩一号（编辑副标题的样子） ---- */
  kerningWide: {
    tags: ['editorial', 'calm', 'emotional'],
    w: 0.6,
    safe: true,
    plan: (rng) => ({ t: rng.range(0.32, 0.55), grow: rng.range(1.04, 1.14) }),
    apply(env, it, p) {
      const P = p as unknown as KerningWideParams
      if (!it.text || glyphN(it.text) < 2) return
      const m0 = measure(it)
      const a0 = it.vertical ? m0.h : m0.w
      it.track = (it.track || 0) + (it.vertical ? P.t * 0.7 : P.t)
      const m1 = measure(it)
      const a1 = it.vertical ? m1.h : m1.w
      const cap = (it.vertical ? env.H : env.W) * 0.9
      let k = Math.min(1, (a0 * P.grow) / Math.max(1, a1))
      if (a1 * k > cap && a0 <= cap) k = Math.min(k, cap / a1)
      it.size *= Math.max(0.55, k)
    },
  },

  /* ---- 原稿用紙：字形吸进等大的方格，格线随入场推开 ---- */
  monoGrid: {
    tags: ['editorial', 'calm', 'emotional'],
    w: 0.5,
    plan: (rng) => ({ pitch: rng.range(1.18, 1.26), c: rng.chance(0.65) ? 1 : 0 }),
    apply(env, it, p) {
      const P = p as unknown as MonoGridParams
      if (!alive(it, 0.9)) return
      const sc = env.sc
      const col = colOf(env, it)
      const vert = !!it.vertical
      const lc = P.c
        ? firstOK([sc.accent, sc.accent2], (c) => contrast(c, sc.bg) >= 1.5, sc.sub)
        : sc.sub
      const lines = String(it.text).split('\n')
      const nMax = Math.max(1, ...lines.map((l) => [...l].length))
      const m0 = measure(it)
      const along0 = vert ? m0.h : m0.w
      const along1 = nMax * P.pitch * it.size * (vert ? it.sy || 1 : it.sx || 1)
      if (along1 > along0 * 1.06) it.size *= (along0 * 1.06) / along1
      it.lead = Math.max(it.lead || 1.3, P.pitch + 0.16)
      /** 第 ci 个字形在格网上的目标位置（沿行方向） */
      const tgt = (g: { ci: number; n: number }, sz: number): number => {
        const q = P.pitch * sz
        if (it.align === 'left') return (g.ci + 0.5) * q
        if (it.align === 'right' && !vert) return -(g.n - g.ci - 0.5) * q
        return (g.ci - (g.n - 1) / 2) * q
      }
      ;(it.charFns ??= []).push((_gi, g) =>
        vert
          ? { dy: (tgt(g, g.w) - g.y) * (it.sy || 1), s: 0.86 }
          : { dx: (tgt(g, g.h) - g.x) * (it.sx || 1), s: 0.86 },
      )
      // 单字项（scatter…）与自带底板的文字：只要吸进格子就够
      if (glyphN(it.text) < 2 || onPlate(sc, col)) return
      const tint = mix(sc.bg, lc, isDark(sc.bg) ? 0.1 : 0.08)
      addPre(it, (e, i) =>
        withFx(e, i, () => {
          const q = E.outCubic(inP(e, i, 0, 0.45)) * (1 - E.inCubic(e.pOut))
          if (q <= 0.01) return
          const lay = layoutText(i)
          const s = i.size
          const sx = i.sx || 1
          const sy = i.sy || 1
          const a = (i.alpha ?? 1) * q
          const ctx = e.ctx
          const main = e.pass === 'main'
          const cell = P.pitch * s
          const lw = Math.max(1, s * 0.013)
          const gut = cell * 0.24
          const rows = new Map<number, LaidGlyph>()
          for (const g of lay) if (!rows.has(g.li)) rows.set(g.li, g)
          // 项目空间矩形：沿行方向 u0..u1，跨行方向 v0..v1
          const R = (
            u0: number,
            u1: number,
            v0: number,
            v1: number,
          ): readonly [number, number, number, number] =>
            vert
              ? [v0 * sx, u0 * sy, (v1 - v0) * sx, (u1 - u0) * sy]
              : [u0 * sx, v0 * sy, (u1 - u0) * sx, (v1 - v0) * sy]
          const L = (u0: number, u1: number, v: number): [Pt, Pt] =>
            vert
              ? [
                  [v * sx, u0 * sy],
                  [v * sx, u1 * sy],
                ]
              : [
                  [u0 * sx, v * sy],
                  [u1 * sx, v * sy],
                ]
          for (const g of rows.values()) {
            const n = g.n
            if (!n) continue
            const c0 = tgt({ ci: 0, n }, s) - cell / 2
            const len = n * cell * q
            const cross = vert ? g.x : g.y
            const v0 = cross - cell / 2
            const v1 = cross + cell / 2
            if (main) {
              const r0 = R(c0, c0 + len, v0, v1)
              ctx.globalAlpha = a * 0.9
              ctx.fillStyle = tint
              ctx.fillRect(r0[0], r0[1], r0[2], r0[3])
              ctx.globalAlpha = 1
            }
            e.line(L(c0, c0 + len, v0), lc, lw, a * 0.85, false)
            e.line(L(c0, c0 + len, v1), lc, lw, a * 0.85, false)
            // 注音格：行侧再走一道规线（横排在上方，竖排在右方）
            e.line(
              L(c0 - cell * 0.1, c0 + len + cell * 0.1, vert ? v1 + gut : v0 - gut),
              lc,
              lw,
              a * 0.55,
              false,
            )
            for (let k = 0; k <= n; k++) {
              const q2 = c0 + k * cell
              if (q2 - c0 > len + 0.5) break
              e.line(
                vert
                  ? [
                      [v0 * sx, q2 * sy],
                      [v1 * sx, q2 * sy],
                    ]
                  : [
                      [q2 * sx, v0 * sy],
                      [q2 * sx, v1 * sy],
                    ],
                lc,
                lw,
                a * 0.85,
                false,
              )
            }
          }
        }),
      )
    },
  },

  /* ---- 版ズレ袋文字：空心描边压在原位，实心色块偏版印出去 ---- */
  outlineOffset: {
    tags: ['pop', 'graphic', 'editorial'],
    w: 0.8,
    plan: (rng) => ({
      d: rng.range(0.055, 0.08),
      dir: rng.pick([
        [1, 1],
        [1, 1],
        [-1, 1],
        [1, 0.35],
        [0.4, 1],
      ] as const),
      k: rng.range(0.022, 0.03),
    }),
    apply(env, it, p) {
      const P = p as unknown as OutlineOffsetParams
      if (!alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const fc = accentFor(sc, col, 1.4)
      it.fill = false
      it.strokeColor = col
      sized(it, env, (i) => {
        i.stroke = Math.max(1.4, i.size * P.k)
      })
      addPre(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i)) return
        const d = i.size * P.d
        withFx(
          e,
          i,
          () =>
            drawItem(
              e,
              bare(i, {
                fill: true,
                stroke: 0,
                color: fc,
                x: i.x + P.dir[0] * d,
                y: i.y + P.dir[1] * d,
              }),
            ),
          false,
        )
      })
    },
  },

  /* ---- トーン影：偏位投影用网点 / 排线印出来（漫画网点纸） ---- */
  toneShadow: {
    tags: ['pop', 'graphic', 'editorial'],
    w: 0.7,
    plan: (rng) => ({
      v: rng.pick(['dots', 'dots', 'hatch', 'stripes']),
      d: rng.range(0.09, 0.12),
      dir: rng.pick([
        [1, 1],
        [1, 1],
        [-1, 1],
        [1, 0.6],
      ] as const),
    }),
    apply(env, it, p) {
      const P = p as unknown as ToneShadowParams
      if (!alive(it)) return
      const sc = env.sc
      const col = colOf(env, it)
      const tc = firstOK(
        [sc.accent, sc.accent2, sc.fg, sc.ink],
        (c) => contrast(c, sc.bg) >= 2.2 && contrast(c, col) >= 1.3,
        markCol(sc, col),
      )
      addPre(it, (e, i) => {
        if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return
        const d = i.size * P.d
        withFx(
          e,
          i,
          () =>
            drawItem(
              e,
              bare(i, {
                x: i.x + P.dir[0] * d,
                y: i.y + P.dir[1] * d,
                color: tc,
                stroke: 0,
                pattern: P.v,
                patternColor: tc,
                patternBg: undefined,
              }),
            ),
          false,
        )
      })
    },
  },

  /* ---- 余韻：沿行方向（或向两端）衰减字形透明度 ---- */
  fadeChars: {
    tags: ['emotional', 'calm'],
    w: 0.5,
    safe: true,
    plan: (rng) => ({ v: rng.pick(['tail', 'tail', 'both', 'head']), lo: rng.range(0.3, 0.4) }),
    apply(_env, it, p) {
      const P = p as unknown as FadeCharsParams
      if (!alive(it, 0.9)) return
      ;(it.charFns ??= []).push((_gi, g) => {
        if (g.n < 3) return null
        const u = g.ci / (g.n - 1)
        const f =
          P.v === 'both'
            ? Math.pow(Math.abs(u - 0.5) * 2, 1.4)
            : P.v === 'head'
              ? E.inQuad(1 - u)
              : E.inQuad(u)
        return { a: 1 - (1 - P.lo) * f }
      })
    },
  },

  /* ---- 断ち切り：每个字形横向切断，下半（竖排：右半）滑开 ---- */
  cutShift: {
    tags: ['graphic', 'glitch', 'pop'],
    w: 0.7,
    plan: (rng) => ({
      at: rng.range(-0.08, 0.06),
      d: rng.range(0.11, 0.16) * (rng.chance(0.5) ? 1 : -1),
      line: rng.chance(0.6),
    }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as CutShiftParams
      if (!cut || !alive(it) || inPieces(env, it)) return
      const sc = env.sc
      const vert = !!it.vertical
      const lc = accentFor(sc, colOf(env, it), 1.6)
      const topFn: CharFn = () => (vert ? { clipX: [-0.75, P.at] } : { clipY: [-0.75, P.at] })
      ;(it.charFns ??= []).push(topFn)
      const amt = (e: Env): number =>
        E.outBack(inP(e, it, cut.inDur * 0.55, 0.3), 2.2) * (1 - E.inCubic(e.pOut))
      addPre(it, (e, i) => {
        if (tracing(i)) return
        const q = amt(e)
        const s = i.size
        const d = s * P.d * q
        const botFn: CharFn = () =>
          vert ? { clipX: [P.at, 0.75], dy: d } : { clipY: [P.at, 0.75], dx: d }
        const c = bare(i, {
          charFn: combineChar((i.charFns ?? []).filter((f) => f !== topFn).concat([botFn])),
        })
        withFx(e, i, () => drawItem(e, c), false)
        if (P.line && e.pass === 'main' && q > 0.02) {
          withFx(e, i, () => {
            const lw = Math.max(1.2, s * 0.012)
            const ex = s * 0.35 * q
            for (const L of lineSpans(i)) {
              const cp = L.c + P.at * s * (vert ? i.sx || 1 : i.sy || 1)
              const a = (i.alpha ?? 1) * Math.min(1, q)
              if (vert)
                e.line(
                  [
                    [cp, L.a0 - ex],
                    [cp, L.a1 + ex + d],
                  ],
                  lc,
                  lw,
                  a,
                  false,
                )
              else
                e.line(
                  [
                    [L.a0 - ex, cp],
                    [L.a1 + ex + d, cp],
                  ],
                  lc,
                  lw,
                  a,
                  false,
                )
            }
          })
        }
      })
    },
  },

  /* ---- ぼかし送り：一条清晰带沿歌词移动，其余发虚 ---- */
  focusPull: {
    tags: ['emotional', 'calm', 'editorial'],
    w: 0.6,
    plan: (rng) => ({ b: rng.range(0.035, 0.05), rev: rng.chance(0.3) }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as FocusPullParams
      if (!cut || !alive(it, 0.9)) return
      const lay = layoutText(it)
      const N = lay.N
      const whole = glyphN(cut.text)
      const mi = it.mi
      // 字形在整句歌词里的位置 0..1：整项时按项内序号，单字项时按运动序号
      let pos: (gi: number) => number
      if (N >= 3) pos = (gi) => gi / (N - 1)
      else if (whole >= 3 && mi != null && mi === Math.round(mi) && mi < whole)
        pos = () => mi / (whole - 1)
      else return
      const f0 = clamp(
        (env.lt - cut.inDur * 0.4) / Math.max(0.4, cut.dur - cut.outDur - cut.inDur * 0.4),
      )
      const f = lerp(-0.15, 1.15, P.rev ? 1 - f0 : f0)
      ;(it.charFns ??= []).push((gi, g) => {
        const d = clamp(Math.abs(pos(gi) - f) * 2.4 - 0.2)
        if (d <= 0.02) return null
        return { blur: Math.min(g.w, g.h) * P.b * d, a: 1 - 0.35 * d }
      })
    },
  },

  /* ---- 一字マーク：挑一个字（优先汉字）压进强调色圆盘 / 方牌 / 菱形 ---- */
  spotChar: {
    tags: ['pop', 'graphic', 'editorial', 'emotional'],
    w: 0.7,
    plan: (rng) => ({
      v: rng.pick(['disc', 'disc', 'square', 'diamond']),
      k: rng.range(1.06, 1.14),
      r: rng.range(0, 1),
    }),
    apply(env, it, p) {
      const cut = env.cut
      const P = p as unknown as SpotCharParams
      if (!cut || !alive(it, 0.9)) return
      if (SPOT.get(env)) return // 整句歌词只打一个 spotlight
      const lay = layoutText(it)
      const gs = lay.filter((g) => !isSp(g.ch) && !isPunct(g.ch))
      if (!gs.length) return
      const choose = <T extends { ch: string; i: number }>(list: T[]): T => {
        const k = list.filter((g) => isHan(g.ch))
        const t = list.filter((g) => isKana(g.ch))
        const pool = k.length ? k : t.length ? t : list
        return pool[Math.floor(P.r * pool.length) % pool.length]
      }
      let T: number
      if (gs.length === 1) {
        // 单字项（mixed / scatter）：只有持有整句被选中那个字的项才配
        const all = [...String(cut.text)]
          .filter((c) => !isSp(c))
          .map((ch, i) => ({ ch, i }))
          .filter((g) => !isPunct(g.ch))
        if (!all.length) return
        const chosen = choose(all)
        if (it.mi !== chosen.i || gs[0].ch !== chosen.ch) return
        T = gs[0].i
      } else T = choose(gs).i
      SPOT.set(env, true)
      const sc = env.sc
      const col = colOf(env, it)
      if (onPlate(sc, col)) return
      const pc = firstOK(
        [sc.accent, sc.accent2, sc.ink, sc.fg],
        (c) => contrast(c, sc.bg) >= 2 && contrast(c, col) >= 1.4,
        accentFor(sc, col, 1.6),
      )
      const tc = textOn(pc, col, sc)
      const qOf = (e: Env): number =>
        E.outBack(inP(e, it, cut.inDur * 0.5, 0.3), 1.8) * (1 - E.inCubic(clamp(e.pOut * 1.3)))
      ;(it.charFns ??= []).push((gi) =>
        gi !== T ? null : qOf(env) > 0.5 && tc !== col ? { s: P.k, color: tc } : { s: P.k },
      )
      addPre(it, (e, i) =>
        withFx(e, i, () => {
          const G = glyphList(i).find((x) => x.g.i === T)
          if (!G) return
          const q = qOf(e)
          if (q <= 0.01) return
          const s = i.size * Math.min(i.sx || 1, i.sy || 1) * (G.s / P.k) * P.k
          const a = (i.alpha ?? 1) * G.a
          const ctx = e.ctx
          if (P.v === 'disc') {
            e.circle(G.x, G.y, s * 0.64 * q, pc, null, 0, a, true)
            return
          }
          ctx.save()
          ctx.translate(G.x, G.y)
          ctx.rotate(((P.v === 'diamond' ? 45 : -6) + G.rot + (1 - q) * 40) * DEG)
          const h = s * (P.v === 'diamond' ? 0.68 : 0.6) * q
          e.rect(-h, -h, h * 2, h * 2, pc, a, true)
          ctx.restore()
        }),
      )
    },
  },

  /* ---- 切り貼り文字：每个字贴在自己那张歪斜、大小不一的纸片上 ---- */
  ransom: {
    tags: ['pop', 'glitch', 'graphic'],
    w: 0.6,
    plan: (rng) => ({ s: rng.int(1, 1e6) }),
    apply(env, it, p) {
      const P = p as unknown as RansomParams
      if (!alive(it, 0.9)) return
      const sc = env.sc
      const col = colOf(env, it)
      const s0 = hash(P.s, miOf(it), 53)
      if (onPlate(sc, col)) return
      const plates: string[] = []
      for (const c of [sc.ink, sc.fg, sc.accent, sc.accent2, sc.sub, sc.ghostB])
        if (c && contrast(c, sc.bg) >= 1.5 && plates.every((q) => contrast(q, c) >= 1.2))
          plates.push(c)
      if (!plates.length) plates.push(fitContrast(sc.accent, sc.bg, 2))
      const lay = layoutText(it)
      const N = lay.N
      const R: Scrap[] = []
      for (let k = 0; k < N; k++) {
        const pc = plates[hash(s0, k, 1) % plates.length]
        const alt = best(
          [sc.bg, col, sc.fg, sc.ink, '#111111', '#FFFFFF'].filter((c) => c !== pc),
          pc,
        )
        R.push({
          pc,
          tc: contrast(col, pc) >= 3 && r(s0, k, 2) < 0.5 ? col : alt,
          rot: rs(s0, k, 3) * 8,
          s: rr(0.84, 1.02, s0, k, 4),
          dy: rs(s0, k, 5) * 0.05,
          pad: [
            rr(0.06, 0.16, s0, k, 6),
            rr(0.06, 0.16, s0, k, 7),
            rr(0.06, 0.16, s0, k, 8),
            rr(0.06, 0.16, s0, k, 9),
          ],
          j: [0, 1, 2, 3].map((q) => rs(s0, k, 10 + q) * 0.06),
        })
      }
      const qOf = (e: Env, gi: number): number =>
        E.outBack(clamp((e.lt - (it.delay || 0) - gi * 0.03) / 0.22), 1.5) *
        (1 - E.inCubic(clamp(e.pOut * 1.4 - gi * 0.03)))
      ;(it.charFns ??= []).push((gi, g) => {
        const r0 = R[gi]
        if (!r0 || isSp(g.ch)) return null
        return {
          rot: r0.rot,
          s: r0.s,
          dy: r0.dy * g.h,
          color: qOf(env, gi) > 0.5 ? r0.tc : undefined,
        }
      })
      addPre(it, (e, i) =>
        withFx(e, i, () => {
          const ctx = e.ctx
          const a = i.alpha ?? 1
          for (const G of glyphList(i)) {
            const r0 = R[G.g.i]
            if (!r0) continue
            const q = qOf(e, G.g.i)
            if (q <= 0.01) continue
            const w = Math.max(G.w, i.size * 0.55 * (i.sx || 1)) / 2
            const h = (i.size * (i.sy || 1)) / 2
            const pad = r0.pad
            const jj = r0.j
            const S = i.size
            ctx.save()
            ctx.translate(G.x, G.y)
            ctx.rotate(G.rot * DEG)
            ctx.scale(G.s * q, G.s * q)
            e.poly(
              [
                [-w - pad[0] * S, -h - pad[1] * S + jj[0] * S],
                [w + pad[2] * S, -h - pad[1] * S + jj[1] * S],
                [w + pad[2] * S + jj[2] * S, h + pad[3] * S],
                [-w - pad[0] * S + jj[3] * S, h + pad[3] * S],
              ],
              r0.pc,
              a * G.a,
              true,
            )
            ctx.restore()
          }
        }),
      )
    },
  },
}

/* ============================== trans 参数类型 ============================== */

type WipeParams = { dir: string }
type DiagonalWipeParams = { k: number; rev: boolean }
type ClockWipeParams = { dir: number; a0: number }
type IrisOpenParams = { x: number; y: number }
type PushSlideParams = { dir: string }
type CoverParams = { dir: string }
type UncoverParams = { dir: string }
type ZoomThroughParams = { z: number }
type DoorsOpenParams = { vert: boolean }
type BlindsParams = { n: number; vert: boolean; rev: boolean }
type CheckerParams = { n: number; rev: boolean }
type BlockDissolveParams = { n: number; side: number }
type WhipPanParams = { dir: number; vert: boolean }
type SpinOutParams = { rot: number }
type InkBlobParams = { x: number; y: number }
type ShatterTilesParams = { n: number; x: number; y: number }
type SliceShiftParams = { n: number; vert: boolean }
type CubeTurnParams = { dir: number }
type FlashCrossParams = { c: string }
type PixelateParams = { k: number }

/* ============================== 转场 ============================== */

/** draw(ctx, A, B, p, I)：A = 上一镜的静帧，B = 本镜的画面，都是设备像素画布 */
type InnerDraw = (
  ctx: CanvasRenderingContext2D,
  A: HTMLCanvasElement,
  B: HTMLCanvasElement,
  p: number,
  I: TransInfo,
  P: Params,
) => void
type TransSpec = Omit<TransDef, 'draw'> & { draw: InnerDraw }
/** 瓦片崩落里一块正在下落的碎块 */
type Tile = { x0: number; y0: number; x1: number; y1: number; t: number; i: number; j: number }

/** 正弦钟形：中途最响，两端归零 */
const bell = (k: number): number => Math.sin(Math.PI * clamp(k))
const ioQuart = (k: number): number => (k < 0.5 ? 8 * k * k * k * k : 1 - 8 * Math.pow(1 - k, 4))
const minD = (I: TransInfo): number => Math.min(I.cw, I.ch)
const lwOf = (I: TransInfo, k = 0.006): number => Math.max(2, minD(I) * k)
/** 在新旧两套底色上都读得清的强调色 */
const tAcc = (I: TransInfo, second?: boolean): string => {
  const sc = I.sc
  const pb = (I.scPrev || sc).bg
  const list = second ? [sc.accent2, sc.accent, sc.fg] : [sc.accent, sc.accent2, sc.fg]
  return firstOK(list, (c) => contrast(c, sc.bg) >= 1.8 && contrast(c, pb) >= 1.4, sc.fg)
}
/** 把画布 C 的 (x, y, w, h) 拷到同一位置 + (dx, dy)，越界部分裁掉 */
const part = (
  ctx: CanvasRenderingContext2D,
  C: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  dx = 0,
  dy = 0,
): void => {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(C.width, Math.ceil(x + w))
  const y1 = Math.min(C.height, Math.ceil(y + h))
  if (x1 - x0 < 1 || y1 - y0 < 1) return
  ctx.drawImage(C, x0, y0, x1 - x0, y1 - y0, x0 + dx, y0 + dy, x1 - x0, y1 - y0)
}
/** 以 (cx, cy) 为锚点缩放着整帧铺开 */
const scaled = (
  ctx: CanvasRenderingContext2D,
  C: HTMLCanvasElement,
  cw: number,
  ch: number,
  s: number,
  cx = cw / 2,
  cy = ch / 2,
): void => {
  ctx.drawImage(C, cx - cx * s, cy - cy * s, cw * s, ch * s)
}
/** 统一包一层：p<=0 就是 A、p>=1 就是 B，收尾保证 ctx 状态干净 */
const trReg = (d: TransSpec): TransDef => ({
  ...d,
  draw: (ctx, A, B, p, I) => {
    ctx.save()
    try {
      if (!(p > 0)) ctx.drawImage(A, 0, 0)
      else if (p >= 1) ctx.drawImage(B, 0, 0)
      else d.draw(ctx, A, B, p, I, I.P || {})
    } finally {
      ctx.restore()
    }
  },
})
/** 加权方向抽样 */
const dirPick = (
  rng: Rng,
  list: readonly string[] = ['L', 'R', 'U', 'D'],
  w?: readonly number[],
): string => (w ? rng.wpick(list.map((k, i) => [k, w[i]] as const)) : rng.pick(list))
/** 不规则墨团轮廓：三段正弦扰动半径后用二次曲线连成闭合环 */
const blobPath = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  s0: number,
  ph: number,
  n = 56,
): void => {
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const w =
      1 +
      0.13 * Math.sin(a * 3 + r(s0, 1) * 6 + ph) +
      0.08 * Math.sin(a * 5 + r(s0, 2) * 6 - ph * 1.3) +
      0.05 * Math.sin(a * 9 + r(s0, 3) * 6 + ph * 0.7)
    pts.push([cx + Math.cos(a) * r0 * w, cy + Math.sin(a) * r0 * w])
  }
  ctx.beginPath()
  const mid = (i: number): Pt => [
    (pts[i % n][0] + pts[(i + 1) % n][0]) / 2,
    (pts[i % n][1] + pts[(i + 1) % n][1]) / 2,
  ]
  const m0 = mid(0)
  ctx.moveTo(m0[0], m0[1])
  for (let i = 1; i <= n; i++) {
    const q = pts[i % n]
    const m = mid(i)
    ctx.quadraticCurveTo(q[0], q[1], m[0], m[1])
  }
  ctx.closePath()
}

const TRANS: Record<string, TransDef> = {
  /* ---- 边缘擦除：亮色前缘推着新镜进来 ---- */
  wipe: trReg({
    tags: ['graphic', 'editorial', 'pop'],
    w: 1.2,
    dur: 0.35,
    plan: (rng) => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [3, 2, 1.4, 0.8]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as WipeParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const lw = lwOf(I, 0.007)
      const ac = tAcc(I)
      ctx.drawImage(A, 0, 0)
      let bar: [number, number, number, number, number]
      if (P.dir === 'R') {
        const x = cw * e
        part(ctx, B, 0, 0, x, ch)
        bar = [x - lw / 2, 0, lw, ch, -1]
      } else if (P.dir === 'U') {
        const y = ch * (1 - e)
        part(ctx, B, 0, y, cw, ch - y)
        bar = [0, y - lw / 2, cw, lw, 1]
      } else if (P.dir === 'D') {
        const y = ch * e
        part(ctx, B, 0, 0, cw, y)
        bar = [0, y - lw / 2, cw, lw, -1]
      } else {
        const x = cw * (1 - e)
        part(ctx, B, x, 0, cw - x, ch)
        bar = [x - lw / 2, 0, lw, ch, 1]
      }
      const a = Math.pow(bell(p), 0.6)
      ctx.globalAlpha = a
      ctx.fillStyle = ac
      ctx.fillRect(bar[0], bar[1], bar[2], bar[3])
      // B 侧再拖一道极细的尾线
      const off = lw * 3.2 * bar[4]
      ctx.globalAlpha = a * 0.5
      if (bar[2] === lw) ctx.fillRect(bar[0] + off, 0, Math.max(1, lw * 0.35), ch)
      else ctx.fillRect(0, bar[1] + off, cw, Math.max(1, lw * 0.35))
    },
  }),

  /* ---- 斜带擦除：一条强调色斜带跑在新镜前面 ---- */
  diagonalWipe: trReg({
    tags: ['pop', 'graphic'],
    w: 1,
    dur: 0.35,
    plan: (rng) => ({
      k: rng.range(0.3, 0.55) * (rng.chance(0.5) ? 1 : -1),
      rev: rng.chance(0.4),
    }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as DiagonalWipeParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const sl = P.k * ch
      const band = minD(I) * 0.07 * bell(p)
      const span = cw + Math.abs(sl) + band * 2 + 4
      // 分界线：B 在它左边
      const X = -Math.abs(sl) / 2 - band - 2 + span * e
      const poly = (x0: number, x1: number): void => {
        ctx.beginPath()
        ctx.moveTo(x0 - sl / 2, 0)
        ctx.lineTo(x1 - sl / 2, 0)
        ctx.lineTo(x1 + sl / 2, ch)
        ctx.lineTo(x0 + sl / 2, ch)
        ctx.closePath()
      }
      ctx.drawImage(A, 0, 0)
      if (P.rev) {
        // 只镜像几何，下面两张图仍按原方向画
        ctx.translate(cw, 0)
        ctx.scale(-1, 1)
      }
      ctx.save()
      poly(-cw * 2, X)
      ctx.clip()
      if (P.rev) {
        ctx.translate(cw, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(B, 0, 0)
      ctx.restore()
      if (band > 0.5) {
        ctx.fillStyle = tAcc(I)
        poly(X, X + band)
        ctx.fill()
        ctx.fillStyle = tAcc(I, true)
        ctx.globalAlpha = 0.85
        poly(X + band * 1.35, X + band * 1.6)
        ctx.fill()
      }
    },
  }),

  /* ---- 钟表擦除：从 12 点方向径向扫过 ---- */
  clockWipe: trReg({
    tags: ['graphic', 'pop', 'editorial'],
    w: 0.7,
    dur: 0.45,
    plan: (rng) => ({ dir: rng.chance(0.7) ? 1 : -1, a0: rng.pick([-90, -90, 0, 180]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as ClockWipeParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const cx = cw / 2
      const cy = ch / 2
      const R = Math.hypot(cw, ch) / 2 + 4
      const a0 = P.a0 * DEG
      const a1 = a0 + e * TAU * P.dir
      ctx.drawImage(A, 0, 0)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, R, a0, a1, P.dir < 0)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(B, 0, 0)
      ctx.restore()
      const a = Math.pow(bell(p), 0.5)
      const lw = lwOf(I, 0.006)
      ctx.globalAlpha = a
      ctx.strokeStyle = tAcc(I)
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R)
      ctx.stroke()
      ctx.fillStyle = tAcc(I)
      ctx.beginPath()
      ctx.arc(cx, cy, lw * 2.2, 0, TAU)
      ctx.fill()
    },
  }),

  /* ---- 光圈：新镜从一只圆里张开，边缘套两道强调色环 ---- */
  irisOpen: trReg({
    tags: ['emotional', 'pop', 'editorial'],
    w: 0.8,
    dur: 0.4,
    plan: (rng) => ({
      x: 0.5 + rng.range(-0.12, 0.12),
      y: 0.5 + rng.range(-0.1, 0.1),
    }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as IrisOpenParams
      const { cw, ch } = I
      const cx = cw * P.x
      const cy = ch * P.y
      const e = E.inOutCubic(p)
      const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) + 4
      const r0 = R * e
      ctx.drawImage(A, 0, 0)
      if (r0 > 0.5) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r0, 0, TAU)
        ctx.clip()
        ctx.drawImage(B, 0, 0)
        ctx.restore()
      }
      const a = Math.pow(bell(p), 0.6)
      const lw = lwOf(I, 0.009)
      ctx.globalAlpha = a
      ctx.strokeStyle = tAcc(I)
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.arc(cx, cy, r0 + lw / 2, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = a * 0.6
      ctx.strokeStyle = tAcc(I, true)
      ctx.lineWidth = lw * 0.4
      ctx.beginPath()
      ctx.arc(cx, cy, r0 * 1.06 + lw * 2.5, 0, TAU)
      ctx.stroke()
    },
  }),

  /* ---- 推镜：新镜把旧镜挤出去 ---- */
  pushSlide: trReg({
    tags: ['graphic', 'pop', 'editorial'],
    w: 1,
    dur: 0.35,
    plan: (rng) => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [3, 1.6, 1.4, 0.6]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as PushSlideParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const h = P.dir === 'L' || P.dir === 'R'
      const L = h ? cw : ch
      const sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1
      const off = Math.round(e * L) * sg
      if (h) {
        ctx.drawImage(A, off, 0)
        ctx.drawImage(B, off - sg * cw, 0)
      } else {
        ctx.drawImage(A, 0, off)
        ctx.drawImage(B, 0, off - sg * ch)
      }
      const lw = lwOf(I, 0.005)
      const q = h ? (sg < 0 ? cw + off : off) : sg < 0 ? ch + off : off
      ctx.globalAlpha = Math.pow(bell(p), 0.6)
      ctx.fillStyle = tAcc(I)
      if (h) ctx.fillRect(q - lw / 2, 0, lw, ch)
      else ctx.fillRect(0, q - lw / 2, cw, lw)
    },
  }),

  /* ---- 覆盖：新镜压在旧镜上面滑进来，旧镜变暗后撤 ---- */
  cover: trReg({
    tags: ['editorial', 'graphic', 'calm'],
    w: 0.9,
    dur: 0.35,
    plan: (rng) => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [2, 2, 1.5, 1]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as CoverParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const h = P.dir === 'L' || P.dir === 'R'
      const sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1
      const L = h ? cw : ch
      const bo = Math.round((1 - e) * L) * -sg
      const ao = Math.round(e * L * 0.18) * sg
      if (h) ctx.drawImage(A, ao, 0)
      else ctx.drawImage(A, 0, ao)
      ctx.fillStyle = '#000000'
      ctx.globalAlpha = 0.45 * e
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
      // 进入边前面的一道软影
      const sw = minD(I) * 0.06
      const edge = h ? (sg > 0 ? cw + bo : bo) : sg > 0 ? ch + bo : bo
      const g = h
        ? ctx.createLinearGradient(edge, 0, edge + sg * sw, 0)
        : ctx.createLinearGradient(0, edge, 0, edge + sg * sw)
      g.addColorStop(0, 'rgba(0,0,0,0.45)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.globalAlpha = bell(p)
      if (h) ctx.fillRect(sg > 0 ? edge : edge - sw, 0, sw, ch)
      else ctx.fillRect(0, sg > 0 ? edge : edge - sw, cw, sw)
      ctx.globalAlpha = 1
      if (h) ctx.drawImage(B, bo, 0)
      else ctx.drawImage(B, 0, bo)
    },
  }),

  /* ---- 揭开：旧镜滑走，露出垫在下面的新镜 ---- */
  uncover: trReg({
    tags: ['editorial', 'calm', 'emotional'],
    w: 0.8,
    dur: 0.35,
    plan: (rng) => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [2, 2, 1.6, 1]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as UncoverParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const h = P.dir === 'L' || P.dir === 'R'
      const sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1
      const s = 1.05 - 0.05 * E.outCubic(p)
      ctx.fillStyle = I.sc.bg
      ctx.fillRect(0, 0, cw, ch)
      scaled(ctx, B, cw, ch, s)
      ctx.fillStyle = '#000000'
      ctx.globalAlpha = 0.4 * (1 - e)
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
      const L = h ? cw : ch
      const ao = Math.round(e * L) * sg
      const edge = h ? (sg > 0 ? ao : cw + ao) : sg > 0 ? ao : ch + ao
      const sw = minD(I) * 0.07
      const g = h
        ? ctx.createLinearGradient(edge, 0, edge - sg * sw, 0)
        : ctx.createLinearGradient(0, edge, 0, edge - sg * sw)
      g.addColorStop(0, 'rgba(0,0,0,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.globalAlpha = bell(p)
      if (h) ctx.fillRect(sg > 0 ? edge - sw : edge, 0, sw, ch)
      else ctx.fillRect(0, sg > 0 ? edge - sw : edge, cw, sw)
      ctx.globalAlpha = 1
      if (h) ctx.drawImage(A, ao, 0)
      else ctx.drawImage(A, 0, ao)
    },
  }),

  /* ---- 变焦穿过：旧镜冲出镜头，新镜同时落位 ---- */
  zoomThrough: trReg({
    tags: ['pop', 'emotional', 'glitch'],
    w: 1,
    dur: 0.35,
    plan: (rng) => ({ z: rng.range(1.5, 2.2) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as ZoomThroughParams
      const { cw, ch } = I
      const sa = 1 + (P.z - 1) * Math.pow(p, 1.4)
      const aa = 1 - E.inCubic(clamp(p * 1.12))
      const sb = 0.86 + 0.14 * E.outCubic(p)
      ctx.fillStyle = I.sc.bg
      ctx.fillRect(0, 0, cw, ch)
      scaled(ctx, B, cw, ch, sb)
      if (aa > 0.003) {
        ctx.globalAlpha = aa
        scaled(ctx, A, cw, ch, sa)
        if (I.allowFilter && p > 0.08 && aa > 0.15) {
          ctx.globalAlpha = aa * 0.35
          scaled(ctx, A, cw, ch, sa * (1 + 0.08 * p))
        }
      }
    },
  }),

  /* ---- 观音开：旧镜从中线裂开向两边推走 ---- */
  doorsOpen: trReg({
    tags: ['graphic', 'pop', 'emotional'],
    w: 0.7,
    dur: 0.4,
    plan: (rng) => ({ vert: rng.chance(0.3) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as DoorsOpenParams
      const { cw, ch } = I
      const e = E.inOutCubic(p)
      const lw = lwOf(I, 0.005)
      const ac = tAcc(I)
      const sb = 0.93 + 0.07 * E.outCubic(p)
      ctx.fillStyle = I.sc.bg
      ctx.fillRect(0, 0, cw, ch)
      scaled(ctx, B, cw, ch, sb)
      ctx.fillStyle = '#000000'
      ctx.globalAlpha = 0.35 * (1 - e)
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
      const a = Math.pow(bell(p), 0.5)
      if (!P.vert) {
        const hw = Math.floor(cw / 2)
        const off = Math.round(e * (cw - hw + lw * 2))
        part(ctx, A, 0, 0, hw, ch, -off, 0)
        part(ctx, A, hw, 0, cw - hw, ch, off, 0)
        ctx.globalAlpha = a
        ctx.fillStyle = ac
        ctx.fillRect(hw - off - lw, 0, lw, ch)
        ctx.fillRect(hw + off, 0, lw, ch)
      } else {
        const hh = Math.floor(ch / 2)
        const off = Math.round(e * (ch - hh + lw * 2))
        part(ctx, A, 0, 0, cw, hh, 0, -off)
        part(ctx, A, 0, hh, cw, ch - hh, 0, off)
        ctx.globalAlpha = a
        ctx.fillStyle = ac
        ctx.fillRect(0, hh - off - lw, cw, lw)
        ctx.fillRect(0, hh + off, cw, lw)
      }
    },
  }),

  /* ---- 百叶：一片叶片依次翻过去 ---- */
  blinds: trReg({
    tags: ['graphic', 'editorial', 'calm'],
    w: 0.7,
    dur: 0.4,
    plan: (rng) => ({
      n: rng.int(7, 12),
      vert: rng.chance(0.35),
      rev: rng.chance(0.4),
    }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as BlindsParams
      const { cw, ch } = I
      const n = P.n
      const L = P.vert ? cw : ch
      const lw = Math.max(1, lwOf(I, 0.003))
      const ac = tAcc(I)
      ctx.drawImage(A, 0, 0)
      ctx.fillStyle = ac
      for (let i = 0; i < n; i++) {
        const k = P.rev ? n - 1 - i : i
        const q = E.inOutCubic(clamp(p * 1.55 - (k / n) * 0.55))
        const a0 = Math.round((i * L) / n)
        const a1 = Math.round(((i + 1) * L) / n)
        if (q <= 0) continue
        const len = q >= 1 ? a1 - a0 : (a1 - a0) * q
        if (P.vert) part(ctx, B, a0, 0, len, ch)
        else part(ctx, B, 0, a0, cw, len)
        if (q < 1) {
          ctx.globalAlpha = 1 - q
          if (P.vert) ctx.fillRect(a0 + len, 0, lw, ch)
          else ctx.fillRect(0, a0 + len, cw, lw)
          ctx.globalAlpha = 1
        }
      }
    },
  }),

  /* ---- 市松：方格按两套交错的水波打开 ---- */
  checker: trReg({
    tags: ['pop', 'graphic'],
    w: 0.6,
    dur: 0.45,
    plan: (rng) => ({ n: rng.int(4, 6), rev: rng.chance(0.5) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as CheckerParams
      const { cw, ch } = I
      const cell = minD(I) / P.n
      const cols = Math.ceil(cw / cell)
      const rows = Math.ceil(ch / cell)
      ctx.drawImage(A, 0, 0)
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const d =
            ((i + j) % 2) * 0.32 +
            (0.18 * ((P.rev ? cols - 1 - i : i) + j)) / Math.max(1, cols + rows - 2)
          const t = clamp((p - d) / 0.5)
          if (t <= 0) continue
          const x0 = Math.round((i * cw) / cols)
          const x1 = Math.round(((i + 1) * cw) / cols)
          const y0 = Math.round((j * ch) / rows)
          const y1 = Math.round(((j + 1) * ch) / rows)
          if (t >= 1) {
            part(ctx, B, x0, y0, x1 - x0, y1 - y0)
            continue
          }
          const q = E.outCubic(t)
          if (q > 0.97) {
            part(ctx, B, x0, y0, x1 - x0, y1 - y0)
            continue
          }
          const w = (x1 - x0) * q
          const h = (y1 - y0) * q
          part(ctx, B, (x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h)
        }
    },
  }),

  /* ---- 积木崩解：随机方块翻到新镜，每块落地时闪一下强调色 ---- */
  blockDissolve: trReg({
    tags: ['glitch', 'graphic'],
    w: 0.8,
    dur: 0.4,
    plan: (rng) => ({ n: rng.int(7, 11), side: rng.pick([0, 0, 1, 2]) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as BlockDissolveParams
      const { cw, ch } = I
      const cell = minD(I) / P.n
      const cols = Math.ceil(cw / cell)
      const rows = Math.ceil(ch / cell)
      const s0 = I.seed | 0
      const ac = tAcc(I)
      ctx.drawImage(A, 0, 0)
      ctx.fillStyle = ac
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const bias =
            P.side === 1
              ? i / Math.max(1, cols - 1)
              : P.side === 2
                ? j / Math.max(1, rows - 1)
                : 0.5
          const rv = 0.02 + 0.84 * (P.side ? 0.55 * r(s0, i, j, 5) + 0.45 * bias : r(s0, i, j, 5))
          if (p < rv) continue
          const x0 = Math.round((i * cw) / cols)
          const x1 = Math.round(((i + 1) * cw) / cols)
          const y0 = Math.round((j * ch) / rows)
          const y1 = Math.round(((j + 1) * ch) / rows)
          part(ctx, B, x0, y0, x1 - x0, y1 - y0)
          const f = 1 - (p - rv) / 0.1
          if (f > 0) {
            ctx.globalAlpha = f * 0.75
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
            ctx.globalAlpha = 1
          }
        }
    },
  }),

  /* ---- 甩镜：两帧一起横冲出去，用运动模糊拖糊 ---- */
  whipPan: trReg({
    tags: ['pop', 'emotional', 'glitch'],
    w: 1,
    dur: 0.3,
    plan: (rng) => ({ dir: rng.chance(0.65) ? -1 : 1, vert: rng.chance(0.2) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as WhipPanParams
      const { cw, ch } = I
      const e = ioQuart(p)
      const L = P.vert ? ch : cw
      const off = e * L * P.dir
      const blur = L * 0.13 * Math.pow(bell(p), 2)
      const put = (x2: CanvasRenderingContext2D, C: HTMLCanvasElement, o: number, k: number) => {
        if (P.vert) x2.drawImage(C, 0, o * k, cw * k, ch * k)
        else x2.drawImage(C, o * k, 0, cw * k, ch * k)
      }
      if (blur < 3) {
        ctx.fillStyle = I.sc.bg
        ctx.fillRect(0, 0, cw, ch)
        put(ctx, A, off, 1)
        put(ctx, B, off - L * P.dir, 1)
        return
      }
      const k = 1 / 3
      const w = Math.max(2, Math.round(cw * k))
      const h = Math.max(2, Math.round(ch * k))
      const T = I.tmp(w, h)
      const x = ctxOf(T)
      x.save()
      x.setTransform(1, 0, 0, 1, 0, 0)
      x.globalCompositeOperation = 'source-over'
      x.globalAlpha = 1
      x.filter = 'none'
      x.fillStyle = I.sc.bg
      x.fillRect(0, 0, w, h)
      const n = I.allowFilter ? 12 : 6 // 快速预览时少采几个抽头
      for (let i = 0; i < n; i++) {
        const o = (i / (n - 1) - 0.5) * blur
        x.globalAlpha = 1 / (i + 1)
        put(x, A, off + o, k)
        put(x, B, off - L * P.dir + o, k)
      }
      x.restore()
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(T, 0, 0, w, h, 0, 0, cw, ch)
    },
  }),

  /* ---- 旋转退出：旧镜边转边缩向远处，露出新镜 ---- */
  spinOut: trReg({
    tags: ['pop', 'glitch'],
    w: 0.6,
    dur: 0.45,
    plan: (rng) => ({ rot: rng.range(100, 200) * (rng.chance(0.5) ? 1 : -1) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as SpinOutParams
      const { cw, ch } = I
      const e = E.inCubic(p)
      const s = 1 - e
      const sb = 1.08 - 0.08 * E.outCubic(p)
      ctx.fillStyle = I.sc.bg
      ctx.fillRect(0, 0, cw, ch)
      scaled(ctx, B, cw, ch, sb)
      ctx.fillStyle = '#000000'
      ctx.globalAlpha = 0.4 * (1 - E.outCubic(p))
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
      if (s < 0.004) return
      ctx.translate(cw / 2, ch / 2)
      ctx.rotate(P.rot * e * DEG)
      ctx.scale(s, s)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(-cw / 2 + minD(I) * 0.02, -ch / 2 + minD(I) * 0.03, cw, ch)
      ctx.drawImage(A, -cw / 2, -ch / 2)
      const lw = lwOf(I, 0.008) / s
      ctx.globalAlpha = Math.min(1, p * 6)
      ctx.strokeStyle = tAcc(I)
      ctx.lineWidth = lw
      ctx.strokeRect(-cw / 2 + lw / 2, -ch / 2 + lw / 2, cw - lw, ch - lw)
    },
  }),

  /* ---- 墨：一摊有机形状的墨从一点晕开，边缘镶强调色 ---- */
  inkBlob: trReg({
    tags: ['emotional', 'calm', 'pop'],
    w: 0.7,
    dur: 0.5,
    plan: (rng) => ({
      x: rng.pick([0.5, 0.5, 0.15, 0.85]) + rng.range(-0.08, 0.08),
      y: rng.pick([0.5, 0.25, 0.8]) + rng.range(-0.06, 0.06),
    }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as InkBlobParams
      const { cw, ch } = I
      const cx = cw * P.x
      const cy = ch * P.y
      const s0 = I.seed | 0
      const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) * 1.36
      const e = E.inOutSine(p)
      const r0 = R * e
      const ph = p * 2.4
      ctx.drawImage(A, 0, 0)
      const rimA = 1 - smooth(0.75, 0.98, p)
      const rim = minD(I) * 0.035 * (0.4 + e)
      if (rimA > 0.01) {
        ctx.globalAlpha = rimA
        ctx.fillStyle = tAcc(I)
        blobPath(ctx, cx, cy, r0 + rim, s0, ph)
        ctx.fill()
        for (let k = 0; k < 6; k++) {
          // 溅在前面的墨点
          const a = r(s0, k, 7) * TAU
          const d = r0 * (1.12 + 0.3 * r(s0, k, 8)) + rim
          const rr0 = minD(I) * (0.008 + 0.02 * r(s0, k, 9)) * clamp(p * 4)
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr0, 0, TAU)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      if (r0 > 0.5) {
        ctx.save()
        blobPath(ctx, cx, cy, r0, s0, ph)
        ctx.clip()
        ctx.drawImage(B, 0, 0)
        ctx.restore()
      }
    },
  }),

  /* ---- 瓦片崩落：旧镜碎成瓦片往下掉 ---- */
  shatterTiles: trReg({
    tags: ['glitch', 'pop', 'emotional'],
    w: 0.6,
    dur: 0.5,
    plan: (rng) => ({
      n: rng.int(6, 9),
      x: rng.range(0.3, 0.7),
      y: rng.range(0.3, 0.6),
    }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as ShatterTilesParams
      const { cw, ch } = I
      const cell = Math.max(cw, ch) / P.n
      const cols = Math.ceil(cw / cell)
      const rows = Math.ceil(ch / cell)
      const s0 = I.seed | 0
      ctx.drawImage(B, 0, 0)
      ctx.fillStyle = '#000000'
      ctx.globalAlpha = 0.3 * (1 - E.outCubic(p))
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 1
      const cx = cw * P.x
      const cy = ch * P.y
      const D = Math.hypot(cw, ch)
      const moving: Tile[] = []
      ctx.save()
      ctx.beginPath()
      let any = false
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x0 = Math.round((i * cw) / cols)
          const x1 = Math.round(((i + 1) * cw) / cols)
          const y0 = Math.round((j * ch) / rows)
          const y1 = Math.round(((j + 1) * ch) / rows)
          const d =
            ((0.5 * Math.hypot((x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy)) / D) * 1.4 +
            0.08 * r(s0, i, j, 3)
          const t = clamp((p - Math.min(0.55, d)) / 0.45)
          if (t <= 0) {
            ctx.rect(x0, y0, x1 - x0, y1 - y0)
            any = true
          } else moving.push({ x0, y0, x1, y1, t, i, j })
        }
      if (any) {
        ctx.clip()
        ctx.drawImage(A, 0, 0)
      }
      ctx.restore()
      const lw = Math.max(1, lwOf(I, 0.002))
      for (const m of moving) {
        const { x0, y0, x1, y1, t, i, j } = m
        const w = x1 - x0
        const h = y1 - y0
        const a = 1 - smooth(0.7, 1, t)
        if (a <= 0.003) continue
        const dx = rs(s0, i, j, 4) * cw * 0.12 * t
        const dy = (t * t * 1.25 - r(s0, i, j, 6) * 0.08 * t) * ch
        const rot = rs(s0, i, j, 5) * 70 * t
        const s = 1 - 0.25 * t
        ctx.save()
        ctx.globalAlpha = a
        ctx.translate(x0 + w / 2 + dx, y0 + h / 2 + dy)
        ctx.rotate(rot * DEG)
        ctx.scale(s, s)
        ctx.drawImage(A, x0, y0, w, h, -w / 2, -h / 2, w, h)
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = lw
        ctx.strokeRect(-w / 2, -h / 2, w, h)
        ctx.restore()
      }
    },
  }),

  /* ---- 短册推移：横条（或竖条）交替方向滑，把旧镜换成新镜 ---- */
  sliceShift: trReg({
    tags: ['glitch', 'graphic', 'pop'],
    w: 0.8,
    dur: 0.35,
    plan: (rng) => ({ n: rng.int(5, 9), vert: rng.chance(0.25) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as SliceShiftParams
      const { cw, ch } = I
      const n = P.n
      const L = P.vert ? cw : ch
      const M = P.vert ? ch : cw
      const lw = Math.max(1, lwOf(I, 0.003))
      const ac = tAcc(I)
      for (let i = 0; i < n; i++) {
        const a0 = Math.round((i * L) / n)
        const a1 = Math.round(((i + 1) * L) / n)
        const sg = i % 2 ? 1 : -1
        const t = E.inOutCubic(clamp((p - (i / Math.max(1, n - 1)) * 0.3) / 0.7))
        const o = Math.round(t * M) * sg
        if (P.vert) {
          part(ctx, A, a0, 0, a1 - a0, ch, 0, o)
          part(ctx, B, a0, 0, a1 - a0, ch, 0, o - sg * ch)
        } else {
          part(ctx, A, 0, a0, cw, a1 - a0, o, 0)
          part(ctx, B, 0, a0, cw, a1 - a0, o - sg * cw, 0)
        }
      }
      ctx.globalAlpha = Math.pow(bell(p), 0.7) * 0.9
      ctx.fillStyle = ac
      for (let i = 1; i < n; i++) {
        const a = Math.round((i * L) / n)
        if (P.vert) ctx.fillRect(a - lw / 2, 0, lw, ch)
        else ctx.fillRect(0, a - lw / 2, cw, lw)
      }
    },
  }),

  /* ---- 立方：伪 3D 转动 —— 旧镜转过去，下一个面同时转进来 ---- */
  cubeTurn: trReg({
    tags: ['graphic', 'pop'],
    w: 0.6,
    dur: 0.45,
    plan: (rng) => ({ dir: rng.chance(0.6) ? 1 : -1 }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as CubeTurnParams
      const { cw, ch } = I
      const phi = (E.inOutCubic(p) * Math.PI) / 2
      const D = 3.4
      const f = D - 1
      const cs = Math.cos(phi)
      const sn = Math.sin(phi)
      const back = mix(mix((I.scPrev || I.sc).bg, I.sc.bg, p), '#000000', 0.55)
      ctx.fillStyle = back
      ctx.fillRect(0, 0, cw, ch)
      // 立方体竖直棱的 (x, z) 绕 Y 轴旋转后投影成屏幕 x 与半高
      const prj = (x: number, z: number): Pt => {
        const xr = (x * cs - z * sn) * P.dir
        const zr = x * sn + z * cs
        const k = f / (D - zr)
        return [cw / 2 + (xr * k * cw) / 2, (k * ch) / 2]
      }
      const face = (C: HTMLCanvasElement, e0: Pt, e1: Pt, shade: number): void => {
        const N = I.allowFilter ? 28 : 14
        const q0 = prj(e0[0], e0[1])
        const q1 = prj(e1[0], e1[1])
        if ((q1[0] - q0[0]) * P.dir <= 0.5) return
        let prev = q0
        for (let k = 1; k <= N; k++) {
          const u = k / N
          const q = prj(lerp(e0[0], e1[0], u), lerp(e0[1], e1[1], u))
          const xa = Math.min(prev[0], q[0])
          const xb = Math.max(prev[0], q[0])
          const hh = (prev[1] + q[1]) / 2
          const su = P.dir > 0 ? (k - 1) / N : 1 - k / N
          ctx.drawImage(
            C,
            su * cw,
            0,
            cw / N,
            ch,
            Math.floor(xa),
            ch / 2 - hh,
            Math.ceil(xb) - Math.floor(xa) + 1,
            hh * 2,
          )
          prev = q
        }
        if (shade > 0.005) {
          ctx.fillStyle = '#000000'
          ctx.globalAlpha = shade
          ctx.beginPath()
          ctx.moveTo(q0[0], ch / 2 - q0[1])
          ctx.lineTo(q1[0], ch / 2 - q1[1])
          ctx.lineTo(q1[0], ch / 2 + q1[1])
          ctx.lineTo(q0[0], ch / 2 + q0[1])
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
      // A = 正面（棱 (-1,1)→(1,1)）；B = 侧面（(1,1)→(1,-1)）；dir<0 时左右镜像
      face(A, [-1, 1], [1, 1], 0.55 * (1 - cs))
      face(B, [1, 1], [1, -1], 0.55 * (1 - sn))
    },
  }),

  /* ---- 闪光转换：一道强光把两镜接过去 ---- */
  flashCross: trReg({
    tags: ['emotional', 'pop', 'calm'],
    w: 0.9,
    dur: 0.3,
    plan: (rng) => ({ c: rng.chance(0.3) ? 'accent' : 'white' }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as FlashCrossParams
      const { cw, ch } = I
      const pb = (I.scPrev || I.sc).bg
      const light = lum(pb) > 0.62 && lum(I.sc.bg) > 0.62
      const fl = P.c === 'accent' || light ? tAcc(I) : '#FFFFFF'
      const x = smooth(0.3, 0.62, p)
      ctx.drawImage(A, 0, 0)
      if (x > 0) {
        ctx.globalAlpha = x
        ctx.drawImage(B, 0, 0)
        ctx.globalAlpha = 1
      }
      const a = p < 0.45 ? E.inQuad(p / 0.45) : 1 - E.outCubic((p - 0.45) / 0.55)
      if (a > 0.003) {
        ctx.globalAlpha = a * 0.92
        ctx.fillStyle = fl
        ctx.fillRect(0, 0, cw, ch)
      }
    },
  }),

  /* ---- 马赛克：旧镜化成大像素，新镜从像素里显影 ---- */
  pixelate: trReg({
    tags: ['glitch', 'pop'],
    w: 0.6,
    dur: 0.4,
    plan: (rng) => ({ k: rng.range(11, 17) }),
    draw(ctx, A, B, p, I, pr) {
      const P = pr as unknown as PixelateParams
      const { cw, ch } = I
      const maxB = minD(I) / P.k
      const pix = (C: HTMLCanvasElement, t: number, alpha: number): void => {
        const bs = 1 + (maxB - 1) * t
        if (alpha <= 0.003) return
        ctx.globalAlpha = alpha
        if (bs < 1.6) {
          ctx.drawImage(C, 0, 0)
          ctx.globalAlpha = 1
          return
        }
        const w = Math.max(1, Math.ceil(cw / bs))
        const h = Math.max(1, Math.ceil(ch / bs))
        const T = I.tmp(w, h)
        const x = ctxOf(T)
        x.setTransform(1, 0, 0, 1, 0, 0)
        x.globalAlpha = 1
        x.globalCompositeOperation = 'copy'
        x.imageSmoothingEnabled = true
        x.drawImage(C, 0, 0, w, h)
        x.globalCompositeOperation = 'source-over'
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(T, 0, 0, w, h, 0, 0, w * bs, h * bs)
        ctx.imageSmoothingEnabled = true
        ctx.globalAlpha = 1
      }
      const ta = E.inCubic(clamp(p / 0.55))
      const tb = E.inCubic(clamp((1 - p) / 0.55))
      const x = smooth(0.4, 0.6, p)
      pix(A, ta, 1)
      pix(B, tb, x)
    },
  }),
}

export const pack: PackParts = { treat: TREAT, trans: TRANS }
