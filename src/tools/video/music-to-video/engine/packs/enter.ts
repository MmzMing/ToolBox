/**
 * 部件包 enter：40 个入场动效（字形遮罩、翻转折叠、挤压拉伸、图形擦除、故障、霓虹、盖章）。
 *
 * 逐条移植自 JIZURA 的 src/11p_enter.js（MIT）：常量、缓动曲线、hash 种子、几何与时长一律
 * 照搬，保证同 seed + 同歌词渲染出同一支视频。key 与注册顺序由 registry 锁定，不要改名、不要增删。
 *
 * 中文适配与两处必要的偏离（见移植契约）：
 * - 「解码」入场的乱码池原为日文假名串，换成等价的汉字 + 全角符号池（抽取方式与节奏不变）；
 * - 旧包每个逐字函数都要靠 `mergeChar` 重合并一次，因为旧 combineChar 只认位移/缩放/颜色；
 *   本仓库 anim.ts 的 combineChar 已合并 clipX/clipY/skew/blur/outline，故不再挂 `_enterFix` 钩子，
 *   只在 outlineFill 里直接复用 combineChar 合并"排除主体函数"的那一组。
 */
import type { BBox, CharFn, CharT, Env, LaidGlyph, LaidText, PackParts, TextItem } from '../types'
import { combineChar } from '../anim'
import { drawItem } from '../draw'
import { layoutText, measure } from '../text-layout'
import { DEG, E, TAU, clamp, hash, lerp, lum, mix, r, rgba, rs, smooth } from '../util'

const PI = Math.PI

/** 隐藏该字形（共享同一个只读对象，调用方不会改写它） */
const HIDE: CharT = { hide: true }

/* ---------------------------------------------------------------- 缓动 */

const oQuart = (x: number): number => 1 - Math.pow(1 - clamp(x), 4)
const oQuint = (x: number): number => 1 - Math.pow(1 - clamp(x), 5)
const ioQuart = (x: number): number => {
  const v = clamp(x)
  return v < 0.5 ? 8 * v * v * v * v : 1 - Math.pow(-2 * v + 2, 4) / 2
}
const oBack = (x: number, s: number): number => E.outBack(clamp(x), s)

/* ---------------------------------------------------------------- 错帧 */

/** p = 入场进度，k = 0..1 的字序位置，spread = 入场时长里用于错帧的比例 */
const stg = (p: number, k: number, spread: number): number => clamp((p - spread * k) / (1 - spread))
/** 从左到右的字序 */
const ordLR = (i: number, n: number): number => (n > 1 ? i / (n - 1) : 0)
/** 从中间向两侧的字序 */
const ordC = (i: number, n: number): number =>
  n > 1 ? Math.abs(i - (n - 1) / 2) / ((n - 1) / 2) : 0

/* ---------------------------------------------------------------- 颜色与随机 */

const isHex = (c: string | undefined): c is string =>
  typeof c === 'string' && c[0] === '#' && (c.length === 7 || c.length === 4)
const colOf = (it: TextItem): string => (isHex(it.color) ? it.color : '#ffffff')
/** 方案字段在类型上都是必填，但配色可能被裁剪成空串，逐个兜底 */
const pickHex = (...cs: (string | undefined)[]): string => cs.find(isHex) || '#ffffff'

/** planner 必定注入 seed；缺省时退化为 0，与旧代码的 `undefined | 0` 一致 */
const cutSeed = (env: Env): number => (env.cut?.seed ?? 0) | 0
const itemSeed = (it: TextItem): number => (it.seed ?? 0) | 0
const dirOf = (env: Env, salt: number): number => (r(cutSeed(env), salt, 5) < 0.5 ? -1 : 1)
const glyphN = (it: TextItem): number => [...String(it.text || '').replace(/\s/g, '')].length

/* ---------------------------------------------------------------- 逐字函数入队 */

function glyphs(it: TextItem, fn: CharFn): CharFn {
  ;(it.charFns ??= []).push(fn)
  return fn
}

function addPre(it: TextItem, fn: (env: Env, x: TextItem) => void): void {
  const prev = it.pre
  it.pre = prev
    ? (env, x) => {
        prev(env, x)
        fn(env, x)
      }
    : fn
}

function addPost(it: TextItem, fn: (env: Env, x: TextItem, bb: BBox | null) => void): void {
  const prev = it.post
  it.post = prev
    ? (env, x, bb) => {
        prev(env, x, bb)
        fn(env, x, bb)
      }
    : fn
}

/* ---------------------------------------------------------------- 几何 */

/** 项目局部坐标系（原点在 it.x/it.y，旋转之前）里的包围盒 */
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
type Band = readonly [number, number, number]
type Pt = readonly [number, number]
/** diagWipe 的斜切几何：u = 阅读方向，v = 垂直方向 */
type WipeGeo = { uc: number; vc: number; hv: number; L: number; T: number; big: number }

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

/** 把画布变换搬到项目局部系（与 drawItem 内部的变换一致） */
function toLocal(ctx: CanvasRenderingContext2D, it: TextItem): void {
  ctx.translate(it.x, it.y)
  if (it.rot) ctx.rotate(it.rot * DEG)
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0)
}

/** 追加裁剪路径，坐标为项目局部系：fn(ctx, box, item, env) */
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

/** 画在项目之后的图形，坐标同样是项目局部系：fn(env, box, item, itemAlpha) */
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

/** 局部盒在设计空间里的投影（考虑旋转） */
function dRange(it: TextItem, b: ItemBox): { x0: number; x1: number; y0: number; y1: number } {
  const rot = (it.rot || 0) * DEG
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  let x0 = 1e9
  let x1 = -1e9
  let y0 = 1e9
  let y1 = -1e9
  const corners: readonly (readonly [number, number])[] = [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x0, b.y1],
    [b.x1, b.y1],
  ]
  for (const [u, v] of corners) {
    const X = it.x + c * u - s * v
    const Y = it.y + s * u + c * v
    x0 = Math.min(x0, X)
    x1 = Math.max(x1, X)
    y0 = Math.min(y0, Y)
    y1 = Math.max(y1, Y)
  }
  return { x0, x1, y0, y1 }
}

/** 绕自身盒中心缩放（有些构图把项目锚在左侧 / 顶部，不能只改 size） */
function scaleAbout(it: TextItem, k: number, b?: ItemBox): void {
  if (k === 1) return
  const bb = b || box(it)
  it.size *= k
  const cx = bb.cx * (k - 1)
  const cy = bb.cy * (k - 1)
  if (cx || cy) {
    const rot = (it.rot || 0) * DEG
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    it.x -= c * cx - s * cy
    it.y -= s * cx + c * cy
  }
}

/** 改字距但保持盒中心不动 */
function setTrack(it: TextItem, tr: number): void {
  const b0 = box(it)
  it.track = tr
  const b1 = box(it)
  const cx = b1.cx - b0.cx
  const cy = b1.cy - b0.cy
  if (cx || cy) {
    const rot = (it.rot || 0) * DEG
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    it.x -= c * cx - s * cy
    it.y -= s * cx + c * cy
  }
}

/** 覆盖项目竖向范围的横向切片（设计空间） */
function hBands(it: TextItem, n: number, dxFn: (i: number) => number): Band[] {
  const R = dRange(it, box(it))
  const pad = it.size * 0.3
  const y0 = R.y0 - pad
  const h = R.y1 - R.y0 + pad * 2
  const cuts = [0]
  for (let i = 1; i < n; i++) cuts.push(r(itemSeed(it), n, i, 3))
  cuts.push(1)
  cuts.sort((a, b) => a - b)
  const out: Band[] = []
  for (let i = 0; i < cuts.length - 1; i++)
    out.push([y0 + cuts[i] * h, y0 + cuts[i + 1] * h, dxFn(i)])
  return out
}

/**
 * 停在字形静止盒上的遮罩：字被位移了 (fx, fy) 个"字宽/字高"，
 * 裁剪窗口留在原地，于是只露出正在进入的那一部分。
 */
function masked(g: LaidGlyph, fx: number, fy: number, isx: number, isy: number): CharT {
  const o: CharT = { dx: fx * g.w * isx, dy: fy * g.h * isy }
  if (g.r90) {
    o.a = clamp(1 - Math.max(Math.abs(fx), Math.abs(fy)) * 1.4)
    return o
  }
  o.clipX = [-2 - fx, 2 - fx]
  o.clipY = [-0.66 - fy, 0.66 - fy]
  if (fx) o.clipX = [-0.62 - fx, 0.62 - fx]
  if (!fy) o.clipY = [-2, 2]
  return o
}

/** 字形静止位置（设计像素，含 sx/sy） */
const glyphPos = (g: LaidGlyph, isx: number, isy: number): Pt => [
  (g.x + g.vx) * isx,
  (g.y + g.vy) * isy,
]

/** 解码入场未定字时滚动的乱码池（旧包是假名串，这里换成汉字 + 全角符号，尾部符号照搬） */
const SIGNS = '光影星雨梦碎虚妄时空缘念火冰风雷声泪心夜晨花草雪雾路' + '＃＊＋＝／＜＞※◇◆□△○01'

/* ================================================================ */

export const pack: PackParts = {
  enter: {
    /* ---------- 字形遮罩 ---------- */
    riseMask: {
      w: 1.4,
      tags: ['editorial', 'graphic', 'calm', 'emotional'],
      apply(_env, it, p) {
        const isx = it.sx || 1
        const isy = it.sy || 1
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return masked(g, 0, 1.15 * (1 - oQuint(q)), isx, isy)
        })
      },
    },

    dropMask: {
      w: 1.2,
      tags: ['editorial', 'graphic', 'pop'],
      apply(_env, it, p) {
        const isx = it.sx || 1
        const isy = it.sy || 1
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return masked(g, 0, -1.15 * (1 - oBack(q, 1.35)), isx, isy)
        })
      },
    },

    /* ---------- 滑动 ---------- */
    slideL: {
      w: 1,
      tags: ['editorial', 'calm', 'pop'],
      apply(_env, it, p) {
        const size = it.size
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.5)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const e = oQuint(q)
          return { dx: -(1 - e) * size * 0.85, a: Math.pow(clamp(q * 1.6), 1.6) }
        })
      },
    },

    slideR: {
      // 每个字在自己的盒子里从右侧滑进来
      w: 1,
      tags: ['editorial', 'graphic', 'pop'],
      apply(_env, it, p) {
        const isx = it.sx || 1
        const isy = it.sy || 1
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return masked(g, 1.2 * (1 - oQuint(q)), 0, isx, isy)
        })
      },
    },

    slideWhole: {
      w: 0.9,
      tags: ['pop', 'graphic'],
      apply(env, it, p) {
        const dir = dirOf(env, 11)
        const e = oBack(p, 1.7)
        const D = it.size * (glyphN(it) <= 1 ? 1.3 : 3.2) * (0.7 + 0.6 * env.fx.motion)
        if (it.vertical) it.y += dir * D * (1 - e)
        else it.x += dir * D * (1 - e)
        it.alpha = (it.alpha ?? 1) * clamp(p * 4)
      },
    },

    /* ---------- 翻转与折叠 ---------- */
    flipX: {
      // 绕竖轴翻牌：一块色块转过来，背面翻完才把字露出来
      w: 1,
      tags: ['pop', 'graphic', 'editorial'],
      apply(env, it, p) {
        const col = colOf(it)
        const bg = pickHex(env.sc.bg)
        const back =
          it.color === env.sc.accent
            ? pickHex(env.sc.accent2, env.sc.fg)
            : pickHex(env.sc.accent, env.sc.fg)
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const pop = oBack(q / 0.22, 1.6)
          const th = (1 - oBack((q - 0.22) / 0.78, 1.25)) * 180 * DEG
          const c = Math.cos(th)
          const sh = Math.abs(Math.sin(th))
          if (c < 0)
            return {
              ch: '■',
              sx: Math.max(0.04, -c),
              s: 1.02 * pop,
              color: mix(back, bg, sh * 0.35),
              a: clamp(q * 8),
            }
          return { sx: Math.max(0.04, c), color: mix(col, bg, Math.min(0.5, sh * 0.5)) }
        })
      },
    },

    flipY: {
      // 绕横轴翻 3/4 圈，中途露一次镜像背面
      w: 0.9,
      tags: ['pop', 'graphic'],
      apply(env, it, p) {
        const col = colOf(it)
        const bg = pickHex(env.sc.bg)
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordC(i, n), 0.4)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const th = (1 - oQuart(q)) * 270 * DEG
          let c = Math.cos(th)
          if (Math.abs(c) < 0.04) c = c < 0 ? -0.04 : 0.04
          return {
            sy: c,
            a: clamp(q * 3),
            color: mix(col, bg, Math.min(0.75, Math.abs(Math.sin(th)) * 0.6 + (c < 0 ? 0.2 : 0))),
          }
        })
      },
    },

    domino: {
      w: 0.7,
      tags: ['pop'],
      minDur: 0.5,
      inDur: (dur) => clamp(dur * 0.42, 0.15, 0.75),
      apply(_env, it, p) {
        const isx = it.sx || 1
        const isy = it.sy || 1
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.55)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          // 从向右躺倒立起来，支点是右下角
          const th = (1 - oBack(q, 1.5)) * 90 * DEG
          const hw = (g.w * isx) / 2
          const hh = (g.h * isy) / 2
          const vx = -hw
          const vy = -hh
          const c = Math.cos(th)
          const s = Math.sin(th)
          return {
            dx: c * vx - s * vy - vx,
            dy: s * vx + c * vy - vy,
            rot: th / DEG,
            a: clamp(q * 4),
          }
        })
      },
    },

    fold: {
      // 手风琴：奇偶字各从上边 / 下边展开
      w: 0.9,
      tags: ['graphic', 'editorial'],
      apply(env, it, p) {
        const isy = it.sy || 1
        const col = colOf(it)
        const bg = pickHex(env.sc.bg)
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.5)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const sy = Math.max(0.02, oBack(q, 1.6))
          const dy = ((i % 2 ? 1 : -1) * ((1 - sy) * g.h * isy)) / 2
          return { sy, dy, a: clamp(q * 4), color: mix(col, bg, clamp(1 - sy) * 0.6) }
        })
      },
    },

    unroll: {
      w: 0.9,
      tags: ['calm', 'editorial', 'emotional'],
      apply(_env, it, p) {
        const vert = !!it.vertical
        const isx = it.sx || 1
        const isy = it.sy || 1
        const size = it.size
        const q = (i: number, n: number): number => stg(p, ordLR(i, n), 0.5)
        glyphs(it, (i, g, n) => {
          const u = q(i, n)
          if (u <= 0) return HIDE
          if (u >= 1) return null
          const e = E.outCubic(u)
          const k = lerp(0.3, 1, e)
          const r0 = lerp(-0.62, 0.62, e)
          return vert
            ? { sy: k, dy: -((1 - k) * g.h * isy) / 2, clipY: [-2, r0], clipX: [-2, 2] }
            : { sx: k, dx: -((1 - k) * g.w * isx) / 2, clipX: [-2, r0], clipY: [-2, 2] }
        })
        // 卷边：一条随字缩放的强调色细线，跟着卷口走
        postLocal(it, (env2, _b, x, A) => {
          const lay = layoutText(x)
          const n = lay.N
          const t = Math.max(1.5, size * 0.028)
          for (const g of lay) {
            if (g.ch === ' ' || g.ch === '　') continue
            const u = q(g.i, n)
            if (u <= 0 || u >= 1) continue
            const e = E.outCubic(u)
            const k = lerp(0.3, 1, e)
            const r0 = lerp(-0.62, 0.62, e)
            const a = Math.pow(1 - e, 0.6) * A
            const [gx, gy] = glyphPos(g, isx, isy)
            if (vert) {
              const y = gy - ((1 - k) * g.h * isy) / 2 + r0 * g.h * isy * k
              env2.rect(
                gx - g.w * isx * 0.56,
                y - t / 2,
                g.w * isx * 1.12,
                t,
                env2.sc.accent,
                a,
                false,
              )
            } else {
              const X = gx - ((1 - k) * g.w * isx) / 2 + r0 * g.w * isx * k
              env2.rect(
                X - t / 2,
                gy - g.h * isy * 0.56,
                t,
                g.h * isy * 1.12,
                env2.sc.accent,
                a,
                false,
              )
            }
          }
        })
      },
    },

    /* ---------- 线条勾勒 ---------- */
    strokeDraw: {
      w: 1,
      tags: ['calm', 'emotional', 'editorial'],
      minDur: 0.8,
      inDur: (dur) => clamp(dur * 0.5, 0.2, 0.95),
      apply(_env, it, p) {
        it.dash = E.outQuad(clamp(p / 0.86))
        it.fillAlpha = (it.fillAlpha ?? 1) * smooth(0.42, 0.9, p)
        if (!((it.stroke ?? 0) > 0))
          it.stroke = Math.max(0.6, it.size * 0.032 * (1 - smooth(0.55, 0.86, p)))
      },
    },

    outlineFill: {
      w: 1,
      tags: ['graphic', 'pop', 'editorial'],
      minDur: 0.7,
      inDur: (dur) => clamp(dur * 0.5, 0.2, 0.9),
      apply(_env, it, p) {
        const sw = it.stroke && it.stroke > 0 ? it.stroke : Math.max(1.2, it.size * 0.028)
        const hasFill = it.fill !== false
        const q = (i: number, n: number): number => stg(p, ordLR(i, n), 0.4)
        const fnOut: CharFn = (i, _g, n) => {
          const u = q(i, n)
          if (u <= 0 || (hasFill && u >= 0.9)) return HIDE
          const e = oQuint(u / 0.35)
          return {
            outline: true,
            s: lerp(1.3, 1, e),
            a: clamp(u * 5) * (1 - smooth(0.68, 0.9, u)),
          }
        }
        if (!hasFill) {
          glyphs(it, (i, _g, n) => {
            const u = q(i, n)
            if (u <= 0) return HIDE
            if (u >= 1) return null
            return { s: lerp(1.3, 1, oQuint(u / 0.35)), a: clamp(u * 5) }
          })
          return
        }
        // 主体：轮廓先画一遍（pre 里），再由下往上的遮罩填入
        const main = glyphs(it, (i, g, n) => {
          const u = q(i, n)
          if (u <= 0.3) return HIDE
          if (u >= 1) return null
          if (g.r90) return { a: clamp((u - 0.3) / 0.55) }
          const f = ioQuart((u - 0.3) / 0.55)
          if (f >= 1) return null
          return { clipY: [lerp(0.66, -0.68, f), 0.72], clipX: [-2, 2] }
        })
        addPre(it, (env2, x) => {
          const others = (x.charFns || []).filter((f) => f !== main)
          const c: TextItem = {
            ...x,
            charFn: others.length ? combineChar(others.concat([fnOut])) : fnOut,
            stroke: sw,
            strokeColor: x.strokeColor || x.color,
            shadow: undefined,
            extrude: undefined,
            dash: null,
            pattern: undefined,
            gradient: undefined,
            pieceFn: null,
            blur: 0,
          }
          drawItem(env2, c)
        })
      },
    },

    splitJoin: {
      // 每个字上下两半从相反方向滑进各自的盒子
      w: 0.9,
      tags: ['graphic', 'editorial'],
      apply(env, it, p) {
        const vert = !!it.vertical
        const isx = it.sx || 1
        const isy = it.sy || 1
        const dir = dirOf(env, 13)
        const q = (i: number, n: number): number => stg(p, ordLR(i, n), 0.4)
        const half = (g: LaidGlyph, u: number, sgn: number): CharT => {
          const f = sgn * dir * 1.1 * (1 - oQuint(u))
          if (g.r90) return { a: clamp(u * 2) }
          return vert
            ? {
                dy: f * g.h * isy,
                clipY: [-0.62 - f, 0.62 - f],
                clipX: sgn < 0 ? [0, 2] : [-2, 0.004],
              }
            : {
                dx: f * g.w * isx,
                clipX: [-0.62 - f, 0.62 - f],
                clipY: sgn < 0 ? [-2, 0.004] : [0, 2],
              }
        }
        glyphs(it, (i, g, n) => {
          const u = q(i, n)
          if (u <= 0) return HIDE
          if (u >= 1) return null
          return half(g, u, -1)
        })
        const fnB: CharFn = (i, g, n) => {
          const u = q(i, n)
          if (u <= 0 || u >= 1 || g.r90) return HIDE
          return half(g, u, 1)
        }
        addPre(it, (env2, x) => {
          drawItem(env2, { ...x, charFn: fnB, shadow: undefined, pieceFn: null })
        })
      },
    },

    /* ---------- 图形遮罩 ---------- */
    vSlice: {
      w: 1,
      tags: ['graphic', 'glitch'],
      apply(_env, it, p) {
        const b = box(it)
        const R = dRange(it, b)
        const size = it.size
        const pad = size * 0.3
        const X0 = R.x0 - pad
        const X1 = R.x1 + pad
        const n = clamp(Math.round((X1 - X0) / (size * 0.55)), 4, 8)
        const w = (X1 - X0) / n
        const dist = (R.y1 - R.y0) * 0.9 + size * 1.4
        const vb: Band[] = []
        for (let k = 0; k < n; k++) {
          const e = oQuint(stg(p, ordC(k, n), 0.5))
          vb.push([X0 + k * w, X0 + (k + 1) * w + 0.6, (k % 2 ? 1 : -1) * dist * (1 - e)])
        }
        it.vbands = vb
        it.alpha = (it.alpha ?? 1) * clamp(p * 3)
      },
    },

    shutter: {
      w: 1,
      tags: ['graphic', 'editorial'],
      apply(_env, it, p) {
        const vert = !!it.vertical
        const size = it.size
        const grow = oQuint(p / 0.32)
        const open = ioQuart((p - 0.18) / 0.82)
        const m = size * 0.2
        clipLocal(it, (ctx, b) => {
          if (open <= 0) {
            ctx.rect(0, 0, 0, 0)
            return
          }
          if (vert) {
            const hw = (b.w / 2 + m) * open
            ctx.rect(b.cx - hw, b.y0 - m, hw * 2, b.h + m * 2)
          } else {
            const hh = (b.h / 2 + m) * open
            ctx.rect(b.x0 - m, b.cy - hh, b.w + m * 2, hh * 2)
          }
        })
        // 两片快门叶：随开口张开外移，随后淡出
        postLocal(it, (env2, b, _x, A) => {
          const a = (1 - smooth(0.6, 0.9, p)) * A
          if (a <= 0) return
          const t = Math.max(2, size * 0.03)
          const col = env2.sc.accent
          if (vert) {
            const L = (b.h + m * 2) * grow
            const y = b.cy - L / 2
            const hw = (b.w / 2 + m) * open
            env2.rect(b.cx - hw - t / 2, y, t, L, col, a, false)
            if (open > 0) env2.rect(b.cx + hw - t / 2, y, t, L, col, a, false)
          } else {
            const L = (b.w + m * 2) * grow
            const x = b.cx - L / 2
            const hh = (b.h / 2 + m) * open
            env2.rect(x, b.cy - hh - t / 2, L, t, col, a, false)
            if (open > 0) env2.rect(x, b.cy + hh - t / 2, L, t, col, a, false)
          }
        })
      },
    },

    iris: {
      w: 0.8,
      tags: ['pop', 'emotional', 'graphic'],
      apply(_env, it, p) {
        const e = oQuart(p)
        scaleAbout(it, lerp(1.14, 1, e))
        const radius = (b: ItemBox): number => (Math.hypot(b.w, b.h) / 2 + it.size * 0.25) * e
        clipLocal(it, (ctx, b) => {
          const rad = Math.max(0.01, radius(b))
          ctx.moveTo(b.cx + rad, b.cy)
          ctx.arc(b.cx, b.cy, rad, 0, TAU)
        })
        postLocal(it, (env2, b, _x, A) => {
          const a = (1 - smooth(0.3, 0.8, p)) * A
          if (a <= 0) return
          env2.circle(
            b.cx,
            b.cy,
            radius(b),
            null,
            env2.sc.accent,
            Math.max(2, it.size * 0.03),
            a,
            false,
          )
        })
      },
    },

    diagWipe: {
      // 一块斜切的色块扫进来盖住整行，再退开，字留在它走过的地方
      w: 1,
      tags: ['graphic', 'editorial', 'pop'],
      apply(env, it, p) {
        const vert = !!it.vertical
        const size = it.size
        const dir = dirOf(env, 17)
        const k = 0.5
        const eL = oQuart(p / 0.5)
        const eT = E.inOutCubic((p - 0.18) / 0.74)
        // (u, v)：u 沿阅读方向，v 垂直于阅读方向
        const geo = (b: ItemBox): WipeGeo => {
          const U0 = vert ? b.y0 : b.x0
          const U1 = vert ? b.y1 : b.x1
          const V0 = vert ? b.x0 : b.y0
          const V1 = vert ? b.x1 : b.y1
          const m = size * 0.16
          const hv = (V1 - V0) / 2 + m
          const half = (U1 - U0) / 2 + m + k * hv
          return {
            uc: (U0 + U1) / 2,
            vc: (V0 + V1) / 2,
            hv,
            L: lerp(-half, half, eL),
            T: lerp(-half, half, eT),
            big: U1 - U0 + size * 4,
          }
        }
        const pt = (G: WipeGeo, du: number, dv: number): Pt => {
          const u = G.uc + dir * du
          const v = G.vc + dv
          return vert ? [v, u] : [u, v]
        }
        const para = (G: WipeGeo, a0: number, a1: number): Pt[] => [
          pt(G, a0 - k * G.hv, -G.hv),
          pt(G, a1 - k * G.hv, -G.hv),
          pt(G, a1 + k * G.hv, G.hv),
          pt(G, a0 + k * G.hv, G.hv),
        ]
        clipLocal(it, (ctx, b) => {
          const G = geo(b)
          para(G, -G.big, G.T).forEach((q, i) =>
            i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]),
          )
          ctx.closePath()
        })
        postLocal(it, (env2, b, _x, A) => {
          const G = geo(b)
          if (G.L - G.T < 0.5) return
          env2.poly(para(G, G.T, G.L), env2.sc.accent, A, false)
        })
      },
    },

    blinds: {
      w: 0.8,
      tags: ['graphic', 'editorial'],
      apply(_env, it, p) {
        const vert = !!it.vertical
        const size = it.size
        clipLocal(it, (ctx, b) => {
          const m = size * 0.2
          const V0 = (vert ? b.x0 : b.y0) - m
          const V1 = (vert ? b.x1 : b.y1) + m
          const U0 = (vert ? b.y0 : b.x0) - m
          const U1 = (vert ? b.y1 : b.x1) + m
          const pitch = Math.max(size * 0.2, (V1 - V0) / 40)
          const N = Math.max(1, Math.ceil((V1 - V0) / pitch))
          let any = false
          for (let k = 0; k < N; k++) {
            const e = oQuart(stg(p, ordLR(vert ? N - 1 - k : k, N), 0.55))
            if (e <= 0) continue
            const c = V0 + (k + 0.5) * pitch
            const hw = pitch * 0.5 * e + 0.4
            if (vert) ctx.rect(c - hw, U0, hw * 2, U1 - U0)
            else ctx.rect(U0, c - hw, U1 - U0, hw * 2)
            any = true
          }
          if (!any) ctx.rect(0, 0, 0, 0)
        })
      },
    },

    checker: {
      w: 0.7,
      tags: ['graphic', 'glitch', 'pop'],
      apply(env, it, p) {
        const size = it.size
        const seed = cutSeed(env)
        const tiles = (
          b: ItemBox,
          fn: (cx: number, cy: number, cell: number, u: number) => void,
        ): void => {
          const m = size * 0.15
          const W = b.w + m * 2
          const H = b.h + m * 2
          let cell = size * 0.34
          // 格子总数封顶，长句也不至于画上万次
          while ((W / cell) * (H / cell) > 320) cell *= 1.25
          const nx = Math.ceil(W / cell)
          const ny = Math.ceil(H / cell)
          const ox = b.cx - (nx * cell) / 2
          const oy = b.cy - (ny * cell) / 2
          for (let iy = 0; iy < ny; iy++)
            for (let ix = 0; ix < nx; ix++) {
              const d = ((ix + iy) & 1) * 0.25 + ordLR(ix, nx) * 0.3 + r(seed, ix, iy, 7) * 0.08
              const u = clamp((p - d) / 0.22)
              if (u > 0) fn(ox + (ix + 0.5) * cell, oy + (iy + 0.5) * cell, cell, u)
            }
        }
        clipLocal(it, (ctx, b) => {
          let any = false
          tiles(b, (cx, cy, cell, u) => {
            const hs = cell * 0.5 * oQuart(u) + 0.5
            ctx.rect(cx - hs, cy - hs, hs * 2, hs * 2)
            any = true
          })
          if (!any) ctx.rect(0, 0, 0, 0)
        })
        postLocal(it, (env2, b, _x, A) => {
          tiles(b, (cx, cy, cell, u) => {
            if (u >= 0.75) return
            const hs = cell * 0.5 * (1 - E.inCubic(u / 0.75)) * Math.min(1, u * 6)
            if (hs > 0.5)
              env2.rect(cx - hs, cy - hs, hs * 2, hs * 2, env2.sc.accent, 0.9 * A, false)
          })
        })
      },
    },

    randomOrder: {
      w: 1,
      tags: ['pop', 'glitch'],
      apply(env, it, p) {
        const seed = itemSeed(it)
        const fl =
          it.color === env.sc.accent
            ? pickHex(env.sc.accent2, env.sc.fg)
            : pickHex(env.sc.accent, env.sc.fg)
        glyphs(it, (i) => {
          const d = r(seed, i, 61) * 0.62
          const u = clamp((p - d) / 0.38)
          if (u <= 0) return HIDE
          if (u >= 1) return null
          const o: CharT = { s: lerp(1.45, 1, oQuint(u)), a: clamp(u * 6) }
          if (u < 0.42) o.color = fl
          return o
        })
      },
    },

    /* ---------- 挤压与拉伸 ---------- */
    bounceBig: {
      w: 0.7,
      tags: ['pop'],
      minDur: 0.7,
      inDur: (dur) => clamp(dur * 0.5, 0.2, 0.95),
      apply(_env, it, p) {
        const isy = it.sy || 1
        const seed = itemSeed(it)
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.35)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          let y: number
          let rot = 0
          if (q < 0.5) {
            const s = q / 0.5
            y = 7.666 * s * s - 9.266 * s + 1.6
            rot = rs(seed, i, 21) * 28 * Math.sin(PI * s)
          } else if (q < 0.76) {
            const s = (q - 0.5) / 0.26
            y = -0.24 * 4 * s * (1 - s)
          } else if (q < 0.9) {
            const s = (q - 0.76) / 0.14
            y = -0.06 * 4 * s * (1 - s)
          } else y = 0
          // 落地瞬间的压扁脉冲
          const imp =
            Math.exp(-Math.pow((q - 0.5) / 0.035, 2)) +
            0.6 * Math.exp(-Math.pow((q - 0.76) / 0.03, 2))
          const sy = 1 - 0.3 * imp
          const sx = 1 + 0.24 * imp
          const h = g.h * isy
          return { dy: y * h + ((1 - sy) * h) / 2, sy, sx, rot, a: clamp(q * 7) }
        })
      },
    },

    squashDrop: {
      w: 0.8,
      tags: ['pop'],
      minDur: 0.5,
      inDur: (dur) => clamp(dur * 0.42, 0.15, 0.75),
      apply(_env, it, p) {
        const isy = it.sy || 1
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.4)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const h = g.h * isy
          const tA = 0.22
          let dy = 0
          let sy: number
          if (q < tA) {
            const t = q / tA
            dy = -(1 - t * t) * h * 1.7
            sy = 1 + 0.4 * t
          } else {
            const t = (q - tA) / (1 - tA)
            sy = 1 - 0.58 * Math.exp(-3 * t) * Math.cos(t * 6.2) * (1 - t)
          }
          const sx = 1 / Math.pow(sy, 0.8)
          return { dy: dy + ((1 - sy) * h) / 2, sy, sx, a: clamp(q * 10) }
        })
      },
    },

    rubber: {
      w: 0.8,
      tags: ['pop'],
      minDur: 0.45,
      inDur: (dur) => clamp(dur * 0.42, 0.15, 0.75),
      apply(_env, it, p) {
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.4)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const f = Math.pow(1 - q, 2) * Math.cos(q * 3.5 * PI)
          const sx = Math.max(0.03, 1 - f)
          return { sx, sy: clamp(1 + (1 - sx) * 0.45, 0.72, 1.45), a: clamp(q * 6) }
        })
      },
    },

    /* ---------- 数字感 ---------- */
    glitchIn: {
      w: 1.2,
      tags: ['glitch'],
      apply(env, it, p) {
        const seed = itemSeed(it)
        const step = env.step
        const size = it.size
        const sc = env.sc
        const cols = [sc.accent, sc.ghostA, sc.ghostB, sc.accent2].filter(isHex)
        glyphs(it, (i) => {
          const settle = 0.38 + 0.52 * r(seed, i, 71)
          if (p >= settle) return null
          const u = p / settle
          if (r(seed, i, step, 72) > 0.25 * clamp(p * 12) + 0.75 * u) return HIDE
          const k = 1 - u
          const o: CharT = {
            dx: rs(seed, i, step, 73) * size * 0.5 * k,
            dy: rs(seed, i, step, 74) * size * 0.14 * k,
          }
          if (cols.length && r(seed, i, step, 75) < 0.55)
            o.color = cols[hash(seed, i, step, 76) % cols.length]
          if (r(seed, i, step, 77) < 0.35) o.sx = lerp(0.55, 1.9, r(seed, i, step, 78))
          return o
        })
        const k = Math.pow(1 - p, 1.2)
        if (p < 0.85 && r(seed, step, 79) < 0.6)
          it.bands = hBands(it, 5, (b) =>
            r(seed, step, b, 80) < 0.7 ? rs(seed, step, b, 81) * size * 0.6 * k : 0,
          )
      },
    },

    echoIn: {
      // 每个字的三层同心轮廓由外向内套拢，字本体同时淡入
      w: 1,
      tags: ['graphic', 'emotional', 'pop'],
      apply(env, it, p) {
        const col = pickHex(env.sc.accent, env.sc.fg)
        const qf = (i: number, n: number): number => stg(p, ordLR(i, n), 0.35)
        glyphs(it, (i, _g, n) => {
          const q = qf(i, n)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return { a: clamp(q * 2.2), s: lerp(0.88, 1, oQuart(q)) }
        })
        addPre(it, (env2, x) => {
          for (let m = 3; m >= 1; m--) {
            const fn: CharFn = (i, _g, n) => {
              const q = qf(i, n)
              if (q <= 0 || q >= 1) return HIDE
              const k = 1 - oQuart(q)
              return {
                outline: true,
                s: 1 + m * 0.3 * k,
                a: (0.95 - m * 0.2) * Math.min(1, k * 1.8) * clamp(q * 6),
              }
            }
            drawItem(env2, {
              ...x,
              charFn: fn,
              fill: false,
              stroke: Math.max(1.4, x.size * 0.02),
              strokeColor: col,
              color: col,
              shadow: undefined,
              extrude: undefined,
              pattern: undefined,
              gradient: undefined,
              dash: null,
              pieceFn: null,
              blur: 0,
            })
          }
        })
      },
    },

    /* ---------- 运动 ---------- */
    whip: {
      w: 1,
      tags: ['pop', 'graphic'],
      inDur: (dur) => clamp(dur * 0.3, 0.12, 0.45),
      apply(env, it, p) {
        const dir = dirOf(env, 19)
        const b = box(it)
        const D = Math.max(it.size * 4.5, b.w * 0.9)
        const e = E.outExpo(p)
        it.x += dir * D * (1 - e)
        // 前倾 + 到位时的反向回摆
        const lean = dir * 34 * Math.pow(1 - e, 0.7)
        const follow = -dir * 14 * Math.sin(PI * clamp((p - 0.3) / 0.7)) * (1 - smooth(0.6, 1, p))
        it.skew = (it.skew || 0) + lean + follow
        it.streak = { n: 6, dx: dir * it.size * 0.42 * (1 - e), dy: 0, a: 0.5 * (1 - e) }
        it.alpha = (it.alpha ?? 1) * clamp(p * 8)
      },
    },

    skewIn: {
      w: 0.9,
      tags: ['editorial', 'graphic'],
      apply(env, it, p) {
        const dir = dirOf(env, 23)
        const isy = it.sy || 1
        const size = it.size
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.45)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const sk = clamp(dir * 60 * (1 - oBack(q, 1.6)), -66, 66)
          return {
            skew: sk,
            dx: -Math.tan(sk * DEG) * ((g.h * isy) / 2) + dir * (1 - oQuint(q)) * size * 0.7,
            a: clamp(q * 3),
          }
        })
      },
    },

    trackIn: {
      w: 1.2,
      tags: ['calm', 'editorial', 'emotional'],
      apply(env, it, p) {
        const e = oQuint(p)
        if (glyphN(it) <= 1) it.x = env.W / 2 + (it.x - env.W / 2) * (1 + 0.9 * (1 - e))
        else setTrack(it, (it.track || 0) + 1.6 * (1 - e))
        it.alpha = (it.alpha ?? 1) * E.outCubic(clamp(p * 1.7))
      },
    },

    trackOut: {
      w: 1,
      tags: ['calm', 'editorial', 'pop'],
      apply(env, it, p) {
        const e = oQuint(p)
        if (glyphN(it) <= 1) {
          it.x = lerp(env.W / 2, it.x, e)
          it.y = lerp(env.H / 2, it.y, e)
        } else setTrack(it, (it.track || 0) - 0.72 * (1 - e))
        it.alpha = (it.alpha ?? 1) * clamp(p * 2.5)
        glyphs(it, () => ({ a: lerp(0.55, 1, e) }))
      },
    },

    /* ---------- 柔和 ---------- */
    blurStagger: {
      w: 1.2,
      tags: ['calm', 'emotional'],
      apply(_env, it, p) {
        const size = it.size
        const bl = Math.min(42, size * 0.14)
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.55)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const e = E.outCubic(q)
          return {
            blur: bl * (1 - e),
            a: Math.pow(e, 0.6),
            s: lerp(1.35, 1, e),
            dy: -(1 - e) * size * 0.16,
          }
        })
      },
    },

    fadeStagger: {
      w: 1.2,
      tags: ['calm', 'emotional'],
      inDur: (dur) => clamp(dur * 0.45, 0.15, 0.85),
      apply(_env, it, p) {
        const size = it.size
        glyphs(it, (i, _g, n) => {
          const q = stg(p, ordLR(i, n), 0.62)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          return { a: E.inOutSine(q), dy: (1 - E.outCubic(q)) * size * 0.07 }
        })
      },
    },

    waveIn: {
      w: 0.9,
      tags: ['pop', 'emotional'],
      minDur: 0.5,
      inDur: (dur) => clamp(dur * 0.45, 0.15, 0.85),
      apply(_env, it, p) {
        const size = it.size
        const damp = Math.pow(1 - p, 1.6)
        glyphs(it, (i, _g, n) => {
          const a = clamp(p * 2.4 - ordLR(i, n) * 1.3)
          if (a <= 0) return HIDE
          const ph = p * 3.6 * PI - i * 0.8
          return { dy: -Math.sin(ph) * size * 0.66 * damp, rot: Math.cos(ph) * 13 * damp, a }
        })
      },
    },

    spiralIn: {
      w: 0.7,
      tags: ['pop', 'emotional'],
      minDur: 0.5,
      inDur: (dur) => clamp(dur * 0.42, 0.15, 0.75),
      apply(env, it, p) {
        const b = box(it)
        const isx = it.sx || 1
        const isy = it.sy || 1
        const size = it.size
        const dir = dirOf(env, 29)
        const seed = cutSeed(env)
        glyphs(it, (i, g, n) => {
          const q = stg(p, ordLR(i, n), 0.15)
          if (q <= 0) return HIDE
          if (q >= 1) return null
          const e = E.outCubic(q)
          const k = 1 - e
          const [gx, gy] = glyphPos(g, isx, isy)
          const px = gx - b.cx
          const py = gy - b.cy
          const ang = dir * k * 200 * DEG
          const c = Math.cos(ang)
          const s = Math.sin(ang)
          const r0 = 1 + 0.7 * k
          const th = r(seed, i, 31) * TAU + ang
          const orb = size * 1.0 * k
          const nx = (c * px - s * py) * r0 + Math.cos(th) * orb
          const ny = (s * px + c * py) * r0 + Math.sin(th) * orb
          return {
            dx: nx - px,
            dy: ny - py,
            rot: dir * k * 320,
            s: lerp(0.45, 1, e),
            a: clamp(q * 5),
          }
        })
      },
    },

    zoomOut: {
      w: 1,
      tags: ['pop', 'graphic', 'glitch'],
      apply(_env, it, p) {
        const e = E.outExpo(p)
        // 收拢途中轻微反缩一下，避免纯指数衰减显得软
        const dip = 0.035 * Math.sin(PI * clamp((p - 0.22) / 0.58))
        scaleAbout(it, 1 + 3.4 * (1 - e) - dip)
        it.alpha = (it.alpha ?? 1) * clamp(p * 6)
      },
    },

    /* ---------- 揭示装置 ---------- */
    resolve: {
      w: 0.9,
      tags: ['glitch', 'editorial'],
      minDur: 0.6,
      inDur: (dur, n) => clamp(0.2 + n * 0.045, 0.3, Math.max(0.3, Math.min(0.95, dur * 0.55))),
      apply(env, it, p) {
        const seed = itemSeed(it)
        const step = env.step
        const sc = env.sc
        const isx = it.sx || 1
        const isy = it.sy || 1
        const lay = layoutText(it)
        const N = lay.N
        const f = p * (N + 1.8)
        const front = Math.floor(f)
        const hi = pickHex(sc.accent, sc.fg)
        const dim = pickHex(sc.sub, sc.fg)
        if (p < 0.03) {
          glyphs(it, () => HIDE)
          return
        }
        glyphs(it, (i) => {
          if (i < front) return f - i - 1 < 0.6 ? { color: hi } : null
          if (i === front) return HIDE
          if (i <= front + 4)
            return { ch: SIGNS[hash(seed, i, step, 51) % SIGNS.length], a: 0.5, color: dim }
          return HIDE
        })
        // 色块停在"正在被解码"的那个字位上
        if (front < N) {
          const g = lay[front]
          postLocal(it, (env2, _b, _x, A) => {
            const [gx, gy] = glyphPos(g, isx, isy)
            const w = g.w * isx * 0.9
            const h = g.h * isy * 0.98
            env2.rect(gx - w / 2, gy - h / 2, w, h, sc.accent, A, false)
          })
        }
      },
    },

    magnet: {
      w: 0.8,
      tags: ['pop', 'graphic'],
      minDur: 0.6,
      inDur: (dur) => clamp(dur * 0.48, 0.2, 0.85),
      apply(_env, it, p) {
        const seed = itemSeed(it)
        const size = it.size
        glyphs(it, (i, _g, n) => {
          const d = n > 1 ? r(seed, i, 81) * 0.3 : 0
          const u = clamp((p - d) / 0.7)
          if (u <= 0) return HIDE
          if (u >= 1) return null
          const ang = r(seed, i, 82) * TAU
          const dist = size * (1.3 + 1.5 * r(seed, i, 83))
          const rot0 = rs(seed, i, 84) * 55
          let f: number
          let a: number
          // 靠近 → 吸附过冲 → 回弹
          if (u < 0.36) {
            f = 1 - 0.16 * E.outCubic(u / 0.36)
            a = 0.5 * clamp(u * 8)
          } else if (u < 0.6) {
            const t = (u - 0.36) / 0.24
            f = 0.84 * (1 - E.inCubic(t))
            a = lerp(0.5, 1, clamp(t * 3))
          } else {
            const t = (u - 0.6) / 0.4
            f = -0.1 * Math.sin(t * TAU) * (1 - t)
            a = 1
          }
          const s = 1 + 0.14 * Math.exp(-Math.pow((u - 0.6) / 0.05, 2))
          return {
            dx: Math.cos(ang) * dist * f,
            dy: Math.sin(ang) * dist * f,
            rot: rot0 * f,
            s,
            a,
          }
        })
      },
    },

    inkBleed: {
      w: 1,
      tags: ['calm', 'emotional'],
      inDur: (dur) => clamp(dur * 0.45, 0.15, 0.8),
      apply(_env, it, p) {
        const seed = itemSeed(it)
        const size = it.size
        const bl = Math.min(36, size * 0.16)
        glyphs(it, (i, _g, n) => {
          const d = n > 1 ? r(seed, i, 91) * 0.45 : 0
          const u = clamp((p - d) / 0.55)
          if (u <= 0) return HIDE
          if (u >= 1) return null
          const e = E.outCubic(u)
          return {
            s: lerp(0.5, 1, oBack(u, 1.1)),
            blur: bl * Math.pow(1 - e, 1.3),
            a: clamp(u * 3.2),
          }
        })
        const h = 1 - smooth(0.2, 0.88, p)
        if (!it.shadow && h > 0.02)
          it.shadow = { color: rgba(colOf(it), 0.55 * h), blur: size * 0.3 * h, dx: 0, dy: 0 }
      },
    },

    neonOn: {
      w: 0.8,
      tags: ['glitch', 'emotional', 'pop'],
      minDur: 0.6,
      inDur: (dur) => clamp(dur * 0.5, 0.2, 0.9),
      apply(env, it, p) {
        const seed = itemSeed(it)
        const step = env.step
        glyphs(it, (i) => {
          const ig = 0.3 + 0.45 * r(seed, i, 101)
          if (p >= ig + 0.12) return null
          if (p < ig - 0.22) return { a: 0.1 * clamp(p * 8) }
          const on = r(seed, i, step, 102) < 0.25 + 0.75 * clamp((p - ig + 0.22) / 0.34)
          return on ? null : { a: 0.1 }
        })
        const glow = smooth(0.1, 0.4, p) * (1 - smooth(0.62, 0.92, p))
        const gc = lum(colOf(it)) > 0.35 ? colOf(it) : pickHex(env.sc.accent, colOf(it))
        if (glow > 0.01 && !it.shadow)
          it.shadow = {
            color: rgba(gc, 0.95),
            blur: Math.min(80, it.size * 0.32) * glow,
            dx: 0,
            dy: 0,
          }
      },
    },

    cursorSweep: {
      w: 1,
      tags: ['editorial', 'graphic'],
      inDur: (dur) => clamp(dur * 0.4, 0.14, 0.7),
      apply(_env, it, p) {
        const vert = !!it.vertical
        const size = it.size
        const isx = it.sx || 1
        const isy = it.sy || 1
        const b0 = box(it)
        const bw = size * 0.28 * (vert ? isy : isx)
        const U0 = (vert ? b0.y0 : b0.x0) - bw
        const U1 = (vert ? b0.y1 : b0.x1) + bw * 1.5
        const pos = lerp(U0, U1, E.outQuad(clamp(p / 0.85)))
        glyphs(it, (_i, g) => {
          const [gx, gy] = glyphPos(g, isx, isy)
          const gu = vert ? gy : gx
          const hs = (vert ? g.h * isy : g.w * isx) / 2
          const u = clamp((pos - bw / 2 - (gu - hs)) / (hs * 2 + size * 0.2))
          if (u <= 0) return HIDE
          if (u >= 1) return null
          const e = oQuint(u)
          const o: CharT = { a: clamp(u * 3), s: lerp(0.7, 1, e) }
          if (vert) o.dy = (1 - e) * size * 0.3
          else o.dx = (1 - e) * size * 0.3
          return o
        })
        // 扫描线本身：越过末尾后随剩余进度收细
        postLocal(it, (env2, b, _x, A) => {
          const t = bw * (1 - smooth(0.78, 0.94, p))
          if (t < 0.5) return
          const m = size * 0.15
          if (vert) env2.rect(b.x0 - m, pos - t / 2, b.w + m * 2, t, env2.sc.accent, A, false)
          else env2.rect(pos - t / 2, b.y0 - m, t, b.h + m * 2, env2.sc.accent, A, false)
        })
      },
    },

    stamp: {
      w: 0.9,
      tags: ['pop', 'graphic'],
      inDur: (dur) => clamp(dur * 0.4, 0.14, 0.7),
      apply(env, it, p) {
        const tI = 0.42
        const dir = dirOf(env, 37)
        const b = box(it)
        const size = it.size
        if (p < tI) {
          const t = E.inQuad(p / tI)
          scaleAbout(it, lerp(2.3, 1, t), b)
          it.rot = (it.rot || 0) + dir * -22 * (1 - t)
          it.alpha = (it.alpha ?? 1) * clamp((p / tI) * 3)
        } else {
          const t = (p - tI) / (1 - tI)
          const dec = Math.pow(1 - t, 2)
          it.x += rs(cutSeed(env), env.step, 1) * size * 0.05 * dec
          it.y += rs(cutSeed(env), env.step, 2) * size * 0.03 * dec
          scaleAbout(it, 1 - 0.05 * Math.exp(-t * 9) * (1 - t), b)
          const lt = clamp(t / 0.7)
          // 盖章的冲击线：一圈短线向外扩散并变淡
          if (lt < 1)
            postLocal(it, (env2, bb, x, A) => {
              const m = size * 0.28
              const rx = bb.w / 2 + m
              const ry = bb.h / 2 + m
              const e = oQuart(lt)
              const a = (1 - lt) * A
              const L = size * 0.42
              const lw = Math.max(2, size * 0.05)
              const N = glyphN(x) <= 1 ? 6 : 12
              for (let k = 0; k < N; k++) {
                const an = (k / N) * TAU + 0.26
                const c = Math.cos(an)
                const s = Math.sin(an)
                const r0 = 1 + 0.08 * e
                const x0 = bb.cx + c * rx * r0 + c * L * 0.6 * e
                const y0 = bb.cy + s * ry * r0 + s * L * 0.6 * e
                env2.line(
                  [
                    [x0, y0],
                    [x0 + c * L * (1 - e * 0.6), y0 + s * L * (1 - e * 0.6)],
                  ],
                  env2.sc.accent,
                  lw,
                  a,
                  false,
                )
              }
            })
        }
      },
    },
  },
}
