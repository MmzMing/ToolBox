/**
 * 部件包 fxB：34 件后期特效（光学 / 故障 / 印刷 / 画面运动 / 胶片 / 漫画），
 * 逐条移植自 JIZURA 的 src/11p_fxB.js（MIT）。数值常量、缓动曲线、hash 种子、
 * 坐标、时长一律照搬：同 seed + 同歌词必然渲染出同一支视频。
 * key 与注册顺序由 registry 锁定，不要改名、不要增删。
 *
 * 契约要点：
 * - 旧 `fx()` 注册器给每件包一层 save/restore 并把 k 收进 0..1，本文件用同名助手复刻；
 * - `ae` 是旧 AE 导出面板用的"最接近的内置事件名"，本仓库暂无该映射，但按契约照搬进数据；
 * - 界面名走 fx-b.names.json（旧日文原名），def 上不留 name；
 * - 旧代码把 alpha 先 toFixed(3) 再拼进 rgba 串，本文件 `al()` 做同样的三位小数收敛。
 *
 * 离屏缓冲与旧项目一样是模块级复用（buf(i,w,h)，尺寸变了才重建，索引编号也保持一致）；
 * 网点、隔行条纹、Bayer 矩阵、雪花噪点各自带一张缓存表。
 */
import type { FxDef, FxInfo, PackParts, PlanEvent, Scheme } from '../types'
import { ctxOf, ensure, makeCanvas } from '../canvas'
import {
  DEG,
  E,
  TAU,
  clamp,
  contrast,
  hash,
  hexToRgb,
  hsl,
  lerp,
  lum,
  mix,
  noise1,
  r,
  rgba,
  rr,
  rs,
  toHex,
  toHsl,
} from '../util'

type Ctx = CanvasRenderingContext2D
/** 设计空间里的一个点（玻璃碎裂的碎片顶点用） */
type Pt = readonly [number, number]
/** 一片玻璃：顶点、重心、位移与自转 */
type Shard = { pts: Pt[]; cxm: number; cym: number; ox: number; oy: number; rot: number }

/** 核心 FxDef 再带一个 ae：旧 AE 导出面板按它把新特效折成最接近的内置事件（少数件没有） */
type FxPackDef = FxDef & {
  ae?: string
  draw: (ctx: Ctx, ev: PlanEvent, k: number, I: FxInfo) => void
}

/** 旧 fx() 注册器：每件都包一层 save/restore，并把 k 收进 0..1 */
const fx = (d: FxPackDef): FxPackDef => ({
  ...d,
  draw(ctx, ev, k2, I) {
    ctx.save()
    try {
      d.draw(ctx, ev, clamp(k2), I)
    } finally {
      ctx.restore()
    }
  },
})

/* ================= helpers ================= */

const isDark = (c: string): boolean => lum(c) < 0.45
/** 0→1→0 的钟形包络 */
const bell = (k: number): number => Math.sin(Math.PI * clamp(k))
/** 事件时刻（毫秒）当种子：同一次事件内所有随机数固定 */
const evS = (ev: PlanEvent): number => hash(Math.round(ev.t * 1000), 9127)
const ampOf = (ev: PlanEvent): number => clamp(ev.amp ?? 1, 0.3, 1.6)
/** 进场 (0..a) → 保持 → 离场 (b..1) */
const ahr = (k: number, a: number, b: number, inE = E.outCubic, outE = E.inCubic): number =>
  k < a ? inE(k / a) : k > b ? 1 - outE((k - b) / Math.max(1e-3, 1 - b)) : 1
/** 色相距离 0..180 */
const hueD = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}
/** alpha 统一到三位小数（旧代码用 toFixed(3) 拼串） */
const al = (v: number): number => Number(v.toFixed(3))
const lightest = (list: readonly string[]): string =>
  list.filter(Boolean).reduce((a, b) => (lum(b) > lum(a) ? b : a))
const darkest = (list: readonly string[]): string =>
  list.filter(Boolean).reduce((a, b) => (lum(b) < lum(a) ? b : a))
/** 漫画线稿用的"墨色"：暗色方案取最亮、亮色方案取最暗 */
const inkCol = (sc: Scheme): string =>
  isDark(sc.bg) ? lightest([sc.fg, sc.ink, '#FFFFFF']) : darkest([sc.fg, sc.ink, '#111111'])

/** 配色里最"艳"的一个（单色方案兜底成冷蓝） */
const vivid = (sc: Scheme, fb = '#4FB8FF'): string => {
  let best: string | null = null
  let bv = 0.18
  for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg]) {
    if (!c) continue
    const [, s, l] = toHsl(c)
    const v = s * (1 - Math.abs(l - 0.55) * 1.1)
    if (v > bv) {
      bv = v
      best = c
    }
  }
  return best || fb
}

/** 双色调的两个色相：最艳的色相 + 一个明显拉开的次色相 */
const huePair = (sc: Scheme): [number, number] => {
  const cs = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg, sc.bg]
    .filter(Boolean)
    .map((c) => {
      const [h, s, l] = toHsl(c)
      return { h, v: s * (1 - Math.abs(l - 0.5) * 1.2) }
    })
    .sort((p, q) => q.v - p.v)
  if (!cs.length || cs[0].v < 0.15) return [330, 195]
  const B = cs.find((p) => p.v > 0.15 && hueD(p.h, cs[0].h) > 50)
  return [cs[0].h, B ? B.h : cs[0].h + 170]
}

/** 模块级离屏缓冲：只在输出尺寸变化时重建（索引编号与旧项目一一对应） */
const BUF: HTMLCanvasElement[] = []
const buf = (i: number, w: number, h: number): HTMLCanvasElement => {
  const nw = Math.max(1, w | 0)
  const nh = Math.max(1, h | 0)
  let c = BUF[i]
  if (!c) {
    c = makeCanvas(nw, nh)
    BUF[i] = c
  } else {
    ensure(c, nw, nh)
  }
  return c
}

/** 取上下文并清掉上一件特效可能留下的状态 */
const cx2 = (c: HTMLCanvasElement): Ctx => {
  const x = ctxOf(c)
  x.setTransform(1, 0, 0, 1, 0, 0)
  x.globalAlpha = 1
  x.globalCompositeOperation = 'source-over'
  x.filter = 'none'
  x.imageSmoothingEnabled = true
  return x
}

/** |画面 - 底色| 的灰度遮罩：暗色方案是黑底亮墨，亮色方案反之 */
const greyMask = (
  T: HTMLCanvasElement,
  S: HTMLCanvasElement,
  sc: Scheme,
  w: number,
  h: number,
  dk: boolean,
): HTMLCanvasElement => {
  const x = cx2(T)
  x.globalCompositeOperation = 'copy'
  x.drawImage(S, 0, 0, w, h)
  x.globalCompositeOperation = 'difference'
  x.fillStyle = sc.bg
  x.fillRect(0, 0, w, h)
  x.globalCompositeOperation = 'saturation'
  x.fillStyle = '#808080'
  x.fillRect(0, 0, w, h)
  if (!dk) {
    x.globalCompositeOperation = 'difference'
    x.fillStyle = '#ffffff'
    x.fillRect(0, 0, w, h)
  }
  return T
}

/** 把灰度遮罩染成 col（暗色方案用 screen 叠、亮色方案用 multiply 叠） */
const tintMask = (
  T: HTMLCanvasElement,
  M: HTMLCanvasElement,
  col: string,
  dk: boolean,
): HTMLCanvasElement => {
  const x = cx2(T)
  const w = T.width
  const h = T.height
  x.globalCompositeOperation = 'copy'
  x.drawImage(M, 0, 0)
  x.globalCompositeOperation = dk ? 'multiply' : 'screen'
  x.fillStyle = col
  x.fillRect(0, 0, w, h)
  return T
}

/** 以 (cx,cy) 为锚点按 s 缩放绘制 img */
const drawScaled = (
  ctx: Ctx,
  img: HTMLCanvasElement,
  s: number,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): void => {
  ctx.drawImage(img, 0, 0, img.width, img.height, cx - cx * s, cy - cy * s, cw * s, ch * s)
}

/** createPattern 仅在源画布尺寸为 0 时返回 null（这里不会发生）；抛错由 renderer 兜住 */
const patternOf = (c: Ctx, t: HTMLCanvasElement): CanvasPattern => {
  const p = c.createPattern(t, 'repeat')
  if (!p) throw new Error('createPattern returned null')
  return p
}

/** 反色一个 #rrggbb（亮色方案下把墨线遮罩翻成底纸线） */
const invHex = (h: string): string => {
  const [r0, g0, b0] = hexToRgb(h)
  return toHex(255 - r0, 255 - g0, 255 - b0)
}

const ROWS = new Map<number, HTMLCanvasElement>()
/** 隔行扫描用的 1px 宽条纹：上黑下透，L = 一条扫描线高度 */
const rowTile = (L: number): HTMLCanvasElement => {
  const hit = ROWS.get(L)
  if (hit) return hit
  const t = makeCanvas(1, 2 * L)
  const x = ctxOf(t)
  x.fillStyle = '#000'
  x.fillRect(0, 0, 1, L)
  ROWS.set(L, t)
  return t
}

const DOT = new Map<string, HTMLCanvasElement>()
/** 45° 网点 tile：半径 r 的黑点铺在 c 的方格上（含跨界副本） */
const dotTile = (c: number, r0: number): HTMLCanvasElement => {
  const key = c + '|' + r0
  const hit = DOT.get(key)
  if (hit) return hit
  const t = makeCanvas(c, c)
  const x = ctxOf(t)
  x.fillStyle = '#000'
  x.beginPath()
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      x.moveTo(c / 2 + i * c + r0, c / 2 + j * c)
      x.arc(c / 2 + i * c, c / 2 + j * c, r0, 0, TAU)
    }
  }
  x.fill()
  if (DOT.size > 64) DOT.clear()
  DOT.set(key, t)
  return t
}

let BAYER: HTMLCanvasElement | null = null
/** 8×8 Bayer 有序抖动矩阵，画成灰度 tile */
const bayerTile = (): HTMLCanvasElement => {
  if (BAYER) return BAYER
  let M = [[0]]
  while (M.length < 8) {
    const n = M.length
    const N: number[][] = []
    for (let y = 0; y < 2 * n; y++) {
      N.push([])
      for (let x = 0; x < 2 * n; x++) {
        const v = 4 * M[y % n][x % n]
        N[y].push(
          v +
            [
              [0, 2],
              [3, 1],
            ][y < n ? 0 : 1][x < n ? 0 : 1],
        )
      }
    }
    M = N
  }
  const c = makeCanvas(8, 8)
  const x = ctxOf(c)
  for (let y = 0; y < 8; y++) {
    for (let i = 0; i < 8; i++) {
      const g = Math.round(((M[y][i] + 0.5) / 64) * 127.5)
      x.fillStyle = `rgb(${g},${g},${g})`
      x.fillRect(i, y, 1, 1)
    }
  }
  BAYER = c
  return c
}

let STATIC: HTMLCanvasElement | null = null
/** 256² 雪花噪点，幂函数压暗后循环平铺 */
const staticTex = (): HTMLCanvasElement => {
  if (STATIC) return STATIC
  const n = 256
  const c = makeCanvas(n, n)
  const x = ctxOf(c)
  const id = x.createImageData(n, n)
  for (let y = 0; y < n; y++) {
    for (let i = 0; i < n; i++) {
      const v = Math.pow(r(i, y, 77), 1.3) * 255
      const q = (y * n + i) * 4
      id.data[q] = v
      id.data[q + 1] = v
      id.data[q + 2] = v
      id.data[q + 3] = 255
    }
  }
  x.putImageData(id, 0, 0)
  STATIC = c
  return c
}

/** 圆角矩形路径（胶片齿孔用） */
const rrectPath = (ctx: Ctx, x: number, y: number, w: number, h: number, rad: number): void => {
  const k = Math.min(rad, w / 2, h / 2)
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

const DEFS: Record<string, FxPackDef> = {
  /* ================= 镜头 / 光学 ================= */
  radialChroma: fx({
    tags: ['glitch', 'emotional', 'pop'],
    w: 0.9,
    dur: 4,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'chroma',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const dk = isDark(sc.bg)
      const s = evS(ev)
      const d =
        (0.03 + 0.016 * r(s, 1)) *
        ampOf(ev) *
        (0.4 + 0.6 * E.outQuad(k)) *
        (k > 0.8 ? 1 - (k - 0.8) * 2.5 : 1)
      const w = Math.max(2, Math.round(cw / 3))
      const h = Math.max(2, Math.round(ch / 3))
      const M = greyMask(buf(0, w, h), S, sc, w, h, dk)
      const R = tintMask(buf(1, w, h), M, '#FF3020', dk)
      const C = tintMask(buf(2, w, h), M, '#18E0FF', dk)
      const cx = cw / 2
      const cy = ch / 2
      ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
      ctx.globalAlpha = 0.95
      drawScaled(ctx, R, 1 + d, cx, cy, cw, ch)
      drawScaled(ctx, C, 1 - d * 0.7, cx, cy, cw, ch)
      ctx.globalAlpha = 0.45
      drawScaled(ctx, R, 1 + d * 2.2, cx, cy, cw, ch)
    },
  }),

  bloomFlash: fx({
    tags: ['pop', 'emotional', 'calm'],
    w: 1,
    dur: 6,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const a =
        clamp(ampOf(ev), 0.5, 1.3) *
        (k < 0.12 ? E.outCubic(k / 0.12) : Math.pow(1 - (k - 0.12) / 0.88, 1.5))
      if (a < 0.02) return
      const dk = isDark(sc.bg)
      const w1 = Math.max(4, Math.round(cw / 6))
      const h1 = Math.max(4, Math.round(ch / 6))
      const w2 = Math.max(2, Math.round(cw / 24))
      const h2 = Math.max(2, Math.round(ch / 24))
      const T1 = buf(0, w1, h1)
      const x1 = cx2(T1)
      x1.globalCompositeOperation = 'copy'
      if (I.allowFilter) x1.filter = `blur(${Math.max(1, w1 / 220).toFixed(1)}px)`
      x1.drawImage(S, 0, 0, w1, h1)
      x1.filter = 'none'
      const T2 = buf(1, w2, h2)
      const x2 = cx2(T2)
      x2.globalCompositeOperation = 'copy'
      if (I.allowFilter) x2.filter = 'blur(1.5px)'
      x2.drawImage(T1, 0, 0, w2, h2)
      x2.filter = 'none'
      const cx = cw / 2
      const cy = ch / 2
      if (dk) {
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = a
        ctx.drawImage(T1, 0, 0, cw, ch)
        ctx.globalAlpha = Math.min(1, a * 1.25)
        drawScaled(ctx, T2, 1.05, cx, cy, cw, ch)
        ctx.globalAlpha = 1
        ctx.fillStyle = rgba(sc.fg, al(0.1 * a))
        ctx.fillRect(0, 0, cw, ch)
      } else {
        // 亮色方案：过曝——亮纸把墨盖过去，整幅往白 Lift
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.75 * a
        ctx.drawImage(T1, 0, 0, cw, ch)
        ctx.globalAlpha = 0.5 * a
        drawScaled(ctx, T2, 1.04, cx, cy, cw, ch)
      }
    },
  }),

  /** 可分离的镜头形变：先列后行，分段线性条带拼接（无缝） */
  bulge: fx({
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.8,
    dur: 5,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const s = evS(ev)
      const pinch = r(s, 1) < 0.25
      const amt = k < 0.3 ? E.outCubic(k / 0.3) : 1 - E.inOutCubic((k - 0.3) / 0.7)
      const A = clamp((pinch ? -0.26 : 0.27) * clamp(ampOf(ev), 0.5, 1.35) * amt, -0.36, 0.38)
      if (Math.abs(A) < 0.004) return
      const cx = cw * (0.5 + rs(s, 2) * 0.05)
      const cy = ch * (0.5 + rs(s, 3) * 0.04)
      const g = (u: number): number => u * (1 - A * (1 - u * u))
      const map = (u: number, c: number, L: number): number => c + u * (u < 0 ? c : L - c)
      const N = 40
      const T = buf(0, cw, ch)
      const x = cx2(T)
      x.clearRect(0, 0, cw, ch)
      let p = 0
      let ps = 0
      for (let i = 1; i <= N; i++) {
        const u = -1 + (2 * i) / N
        const d = i === N ? cw : Math.round(map(u, cx, cw))
        const sx = i === N ? cw : map(g(u), cx, cw)
        if (d > p && sx > ps) x.drawImage(S, ps, 0, sx - ps, ch, p, 0, d - p, ch)
        p = d
        ps = sx
      }
      ctx.clearRect(0, 0, cw, ch)
      p = 0
      ps = 0
      for (let i = 1; i <= N; i++) {
        const u = -1 + (2 * i) / N
        const d = i === N ? ch : Math.round(map(u, cy, ch))
        const sy = i === N ? ch : map(g(u), cy, ch)
        if (d > p && sy > ps) ctx.drawImage(T, 0, ps, cw, sy - ps, 0, p, cw, d - p)
        p = d
        ps = sy
      }
    },
  }),

  /* ================= 故障 ================= */
  /** 竖向"熔化"：一批列的取窗被拉长（向下或向上），用平滑噪声保持连贯 */
  pixelSort: fx({
    tags: ['glitch'],
    w: 0.8,
    dur: 3,
    amp: 1,
    glitchy: true,
    mid: true,
    scratch: true,
    ae: 'slice',
    draw(ctx, ev, _k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const a = ampOf(ev)
      const s = evS(ev)
      const st = I.step * 19 + s
      const up = r(s, 1) < 0.3
      const xa = cw * rr(0.02, 0.35, st, 1)
      const xb = Math.min(cw, xa + cw * rr(0.4, 0.7, st, 2))
      let x = Math.round(xa)
      let i = 0
      while (x < xb && i < 200) {
        const wr = Math.max(1, Math.round(cw * rr(0.002, 0.009, st, i, 3)))
        const on = noise1((x / cw) * 9, st + 5) > -0.25 && r(st, i, 4) < 0.85
        if (on) {
          const n1 = noise1((x / cw) * 7, st + 9) * 0.5 + 0.5
          const n2 = noise1((x / cw) * 23, st + 13) * 0.5 + 0.5
          const win = ch * (0.08 + 0.12 * n1)
          const str = 1 + (0.5 + 2 * n2) * a
          if (!up) {
            const y0 = ch * (0.36 + 0.12 * n2)
            const dh = Math.min(ch - y0, win * str)
            ctx.drawImage(S, x, y0, wr, win, x, y0, wr, dh)
          } else {
            const y1 = ch * (0.64 - 0.12 * n2)
            const dh = Math.min(y1, win * str)
            ctx.drawImage(S, x, y1 - win, wr, win, x, y1 - dh, wr, dh)
          }
        }
        x += wr
        i++
      }
    },
  }),

  interlace: fx({
    tags: ['glitch', 'emotional'],
    w: 0.7,
    dur: 3,
    amp: 1,
    glitchy: true,
    mid: true,
    scratch: true,
    ae: 'slice',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const a = ampOf(ev)
      const st = I.step * 7 + evS(ev)
      const L = Math.max(1, Math.round(ch / 200))
      const dx = (r(st, 1) < 0.5 ? 1 : -1) * cw * (0.012 + 0.02 * r(st, 2)) * a * (1 - 0.45 * k)
      ctx.fillStyle = sc.bg
      ctx.fillRect(0, 0, cw, ch)
      ctx.drawImage(S, Math.round(-dx * 0.35), 0)
      const T = buf(0, cw, ch)
      const x = cx2(T)
      x.clearRect(0, 0, cw, ch)
      x.drawImage(S, Math.round(dx), 0)
      x.globalCompositeOperation = 'destination-in'
      const pat = patternOf(x, rowTile(L))
      try {
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, 0, (I.step % 2) * L]))
      } catch {
        /* 老引擎没有 setTransform：退化为不隔相 */
      }
      x.fillStyle = pat
      x.fillRect(0, 0, cw, ch)
      ctx.drawImage(T, 0, 0)
    },
  }),

  /** 压缩伪影：网格对齐的方块变平、从上沿向下涂抹、量化或错位 */
  macroBlock: fx({
    tags: ['glitch'],
    w: 0.8,
    dur: 3,
    amp: 1,
    glitchy: true,
    mid: true,
    scratch: true,
    ae: 'block',
    draw(ctx, ev, _k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const a = ampOf(ev)
      const st = I.step * 23 + evS(ev)
      const B = Math.max(6, Math.round(Math.min(cw, ch) / 18))
      const nx = Math.ceil(cw / B)
      const ny = Math.ceil(ch / B)
      const T = buf(3, 3, 3)
      const tx = cx2(T)
      tx.globalCompositeOperation = 'copy'
      const nC = 2 + (hash(st, 1) % 3)
      for (let c = 0; c < nC; c++) {
        const gw = Math.min(nx, 3 + (hash(st, c, 2) % 7))
        const gh = 1 + (hash(st, c, 3) % 3)
        const i0 = Math.floor(r(st, c, 4) * (nx - gw + 1))
        const j0 = Math.round(ny * (0.38 + 0.24 * r(st, c, 5)) - gh / 2)
        for (let j = 0; j < gh; j++) {
          for (let i = 0; i < gw; i++) {
            const id = i * 16 + j
            if (r(st, c, id, 6) < 0.12) continue
            const bx = (i0 + i) * B
            const by = clamp(j0 + j, 0, ny - 1) * B
            const bw = Math.min(B, cw - bx)
            const bh = Math.min(B, ch - by)
            const m = r(st, c, id, 7)
            if (bw < 1 || bh < 1) continue
            if (m < 0.42) {
              // datamosh 拖影：方块上沿向下抹 1..3 格
              const n = 1 + (hash(st, c, id, 9) % 3)
              ctx.drawImage(S, bx, by, bw, 1, bx, by, bw, Math.min(ch - by, B * n))
            } else if (m < 0.7) {
              // 量化成 3×3 平色小格
              tx.drawImage(S, bx, by, bw, bh, 0, 0, 3, 3)
              ctx.imageSmoothingEnabled = false
              ctx.drawImage(T, 0, 0, 3, 3, bx, by, bw, bh)
              ctx.imageSmoothingEnabled = true
            } else if (m < 0.9) {
              // 滑动：从相邻方块抄一份
              const sx = clamp(
                bx + (r(st, c, id, 10) < 0.5 ? -1 : 1) * (1 + (hash(st, c, id, 12) % 2)) * B,
                0,
                cw - bw,
              )
              ctx.drawImage(S, sx, by, bw, bh, bx, by, bw, bh)
            } else {
              // 整块平色
              ctx.drawImage(
                S,
                Math.min(cw - 1, bx + bw / 2),
                Math.min(ch - 1, by + bh / 2),
                1,
                1,
                bx,
                by,
                bw,
                bh,
              )
            }
            if (m >= 0.42 && r(st, c, id, 8) < 0.06 * a) {
              ctx.globalCompositeOperation = 'difference'
              ctx.globalAlpha = 0.3
              ctx.fillStyle = r(st, c, id, 11) < 0.5 ? sc.ghostA : sc.ghostB
              ctx.fillRect(bx, by, bw, bh)
              ctx.globalCompositeOperation = 'source-over'
              ctx.globalAlpha = 1
            }
          }
        }
      }
    },
  }),

  /* ================= 印刷 / 风格化 ================= */
  halftone: fx({
    tags: ['pop', 'graphic', 'editorial'],
    w: 0.9,
    dur: 5,
    amp: 1,
    mid: true,
    ae: 'mosaic',
    draw(ctx, _ev, k, I) {
      const { cw, ch, sc } = I
      const c = Math.max(5, Math.round(Math.min(cw, ch) / 44))
      const amt = ahr(k, 0.3, 0.72)
      const rad = Math.round(c * lerp(0.72, 0.42, amt) * 4) / 4
      if (rad >= c * 0.71) return
      const pat = patternOf(ctx, dotTile(c, rad))
      try {
        const q = 45 * DEG
        pat.setTransform(
          new DOMMatrix([Math.cos(q), Math.sin(q), -Math.sin(q), Math.cos(q), cw / 2, ch / 2]),
        )
      } catch {
        /* 不支持旋转的引擎就按正交网点铺 */
      }
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = pat
      ctx.fillRect(0, 0, cw, ch)
      if (I.opt.transparent) return
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = mix(sc.bg, sc.fg, 0.16)
      ctx.fillRect(0, 0, cw, ch)
    },
  }),

  duotone: fx({
    tags: ['pop', 'emotional', 'graphic'],
    w: 0.8,
    dur: 4,
    amp: 1,
    mid: true,
    ae: 'chroma',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const a = clamp(ampOf(ev), 0.6, 1) * ahr(k, 0.12, 0.7)
      if (a < 0.02) return
      let [h1, h2] = huePair(sc)
      if (r(s, 1) < 0.4) {
        const t = h1
        h1 = h2
        h2 = t
      }
      const dark = hsl(h1, 0.8, 0.15)
      const light = hsl(h2, 1, 0.76)
      ctx.globalAlpha = a
      ctx.globalCompositeOperation = 'saturation'
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = light
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = dark
      ctx.fillRect(0, 0, cw, ch)
    },
  }),

  /** 有序抖动 → 硬阈值（contrast 滤镜）→ 映射到配色最深 / 最浅的两色 */
  ditherBit: fx({
    tags: ['glitch', 'graphic', 'pop'],
    w: 0.7,
    dur: 3,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'mosaic',
    draw(ctx, _ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const p = Math.max(2, Math.round(ch / 200) * (k < 0.34 ? 2 : 1))
      const w = Math.ceil(cw / p)
      const h = Math.ceil(ch / p)
      const T = buf(2, w, h)
      const x = cx2(T)
      x.globalCompositeOperation = 'copy'
      x.fillStyle = patternOf(x, bayerTile())
      x.fillRect(0, 0, w, h)
      x.globalCompositeOperation = 'lighter'
      x.globalAlpha = 0.5
      x.drawImage(S, 0, 0, w, h)
      x.globalAlpha = 1
      x.globalCompositeOperation = 'saturation'
      x.fillStyle = '#808080'
      x.fillRect(0, 0, w, h)
      const T2 = buf(3, w, h)
      const y = cx2(T2)
      y.globalCompositeOperation = 'copy'
      if (I.allowFilter) y.filter = 'contrast(60)'
      y.drawImage(T, 0, 0)
      y.filter = 'none'
      const c0 = darkest([sc.bg, sc.fg, sc.ink])
      const c1 = lightest([sc.bg, sc.fg, sc.ink])
      y.globalCompositeOperation = 'multiply'
      y.fillStyle = c1
      y.fillRect(0, 0, w, h)
      y.globalCompositeOperation = 'screen'
      y.fillStyle = c0
      y.fillRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(T2, 0, 0, w, h, 0, 0, w * p, h * p)
      ctx.imageSmoothingEnabled = true
    },
  }),

  /* ================= 画面运动 ================= */
  rotateSnap: fx({
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.9,
    dur: 5,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'shake',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const dir = r(s, 1) < 0.5 ? 1 : -1
      // 首帧直接 snap 到位，之后阻尼弹簧回平
      const e = k < 0.12 ? 1 : Math.exp(-4.5 * (k - 0.12)) * Math.cos((k - 0.12) * Math.PI * 2.4)
      const th = dir * (3 + 2 * r(s, 2)) * clamp(ampOf(ev), 0.5, 1.3) * e * DEG
      if (Math.abs(th) < 0.0006) return
      const c = Math.abs(Math.cos(th))
      const sn = Math.abs(Math.sin(th))
      const z =
        Math.max((cw * c + ch * sn) / cw, (cw * sn + ch * c) / ch) * (1 + 0.025 * Math.abs(e))
      ctx.fillStyle = sc.bg
      ctx.fillRect(0, 0, cw, ch)
      ctx.translate(cw / 2, ch / 2)
      ctx.rotate(th)
      ctx.scale(z, z)
      ctx.drawImage(S, -cw / 2, -ch / 2)
      if (k < 0.12) {
        ctx.globalAlpha = 0.35
        ctx.rotate(-th * 0.45)
        ctx.drawImage(S, -cw / 2, -ch / 2)
      }
    },
  }),

  /** 逐档退色的残像：暗色方案用 lighten、亮色方案用 darken，底色不受影响 */
  echoFrames: fx({
    tags: ['emotional', 'pop', 'glitch'],
    w: 0.9,
    dur: 6,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const dk = isDark(sc.bg)
      const a = clamp(ampOf(ev), 0.5, 1.3)
      const ang =
        r(s, 1) < 0.65
          ? r(s, 2) < 0.5
            ? 0
            : Math.PI
          : (r(s, 3) < 0.5 ? 0.25 : 0.75) * Math.PI + (r(s, 2) < 0.5 ? 0 : Math.PI)
      const d = Math.min(cw, ch) * (0.02 + 0.035 * E.outCubic(k)) * a
      const fade = k < 0.1 ? 1 : 1 - E.inQuad((k - 0.1) / 0.9)
      if (fade < 0.02) return
      ctx.globalCompositeOperation = dk ? 'lighten' : 'darken'
      for (let i = 4; i >= 1; i--) {
        ctx.globalAlpha = fade * (0.64 - i * 0.12)
        ctx.drawImage(S, Math.round(Math.cos(ang) * d * i), Math.round(Math.sin(ang) * d * i))
      }
    },
  }),

  /** 绕心的 n 面镜像扇区（真万华镜，不是轴对称） */
  kaleido: fx({
    tags: ['pop', 'graphic', 'emotional'],
    w: 0.6,
    dur: 4,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'block',
    draw(ctx, ev, k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const s = evS(ev)
      const n = r(s, 1) < 0.5 ? 6 : 8
      const th = TAU / n
      const R = Math.hypot(cw, ch)
      const cx = cw / 2
      const cy = ch / 2
      const rot = r(s, 2) * TAU + k * 0.5 * (r(s, 3) < 0.5 ? 1 : -1)
      const src = r(s, 4) < 0.5 ? 0 : Math.PI
      const z = 1.05 + 0.12 * k
      ctx.globalAlpha = k > 0.75 ? 1 - ((k - 0.75) / 0.25) * 0.5 : 1
      for (let i = 0; i < n; i++) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot + i * th)
        if (i % 2) ctx.scale(1, -1)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, R, -th / 2 - 0.006, th / 2 + 0.006)
        ctx.closePath()
        ctx.clip()
        ctx.rotate(-src)
        ctx.scale(z, z)
        ctx.drawImage(S, -cx, -cy)
        ctx.restore()
      }
    },
  }),

  /* ================= 反相 / 光 ================= */
  bandInvert: fx({
    tags: ['glitch', 'graphic'],
    w: 0.7,
    dur: 3,
    amp: 1,
    glitchy: true,
    mid: true,
    ae: 'invert',
    draw(ctx, ev, _k, I) {
      const { cw, ch } = I
      const s = evS(ev)
      const st = I.step * 13 + s
      const n = 2 + (hash(st, 1) % 4)
      const vert = r(s, 2) < 0.22
      const L = vert ? cw : ch
      const M = vert ? ch : cw
      const a = clamp(ampOf(ev), 0.6, 1.3)
      ctx.globalCompositeOperation = 'difference'
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < n; i++) {
        const h = Math.max(2, L * rr(0.012, 0.12, st, i, 3) * a)
        const y = Math.round(L * rr(0.12, 0.88, st, i, 4) - h / 2)
        const part = r(st, i, 5) < 0.35
        const x0 = part ? M * rr(0, 0.5, st, i, 6) : 0
        const w = part ? M * rr(0.25, 0.6, st, i, 7) : M
        if (vert) ctx.fillRect(y, x0, h, w)
        else ctx.fillRect(x0, y, w, h)
      }
    },
  }),

  lightRays: fx({
    tags: ['emotional', 'pop', 'calm'],
    w: 0.9,
    dur: 8,
    amp: 1,
    mid: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const dk = isDark(sc.bg)
      const a = clamp(ampOf(ev), 0.5, 1.2) * Math.pow(bell(k), 0.6) * (0.9 + 0.1 * r(I.step, 5))
      if (a < 0.02) return
      const cx = cw * (0.5 + rs(s, 1) * 0.12)
      const cy = ch * (0.42 + rs(s, 2) * 0.1)
      const M = Math.min(cw, ch)
      const R = Math.hypot(cw, ch) * (0.4 + 0.6 * E.outCubic(k))
      const n = 12 + (hash(s, 3) % 8)
      const rot = r(s, 4) * TAU + k * 0.22 * (r(s, 7) < 0.5 ? 1 : -1)
      const col = dk ? mix(sc.fg, '#ffffff', 0.3) : mix(vivid(sc), '#ffffff', 0.35)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      g.addColorStop(0, rgba(col, al(0.55 * a)))
      g.addColorStop(0.3, rgba(col, al(0.24 * a)))
      g.addColorStop(1, rgba(col, al(0)))
      ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
      ctx.fillStyle = g
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const an = rot + (i / n) * TAU + rs(s, i, 5) * 0.12
        const w = (TAU / n) * rr(0.14, 0.45, s, i, 6)
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(an - w / 2) * R, cy + Math.sin(an - w / 2) * R)
        ctx.lineTo(cx + Math.cos(an + w / 2) * R, cy + Math.sin(an + w / 2) * R)
        ctx.closePath()
      }
      ctx.fill()
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, M * 0.3)
      g2.addColorStop(0, rgba(col, al(0.4 * a)))
      g2.addColorStop(1, rgba(col, al(0)))
      ctx.fillStyle = g2
      ctx.fillRect(cx - M * 0.3, cy - M * 0.3, M * 0.6, M * 0.6)
    },
  }),

  anamorphic: fx({
    tags: ['emotional', 'pop', 'calm'],
    w: 0.8,
    dur: 7,
    amp: 1,
    mid: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const dk = isDark(sc.bg)
      const a = clamp(ampOf(ev), 0.5, 1.2) * Math.pow(bell(k), 0.5) * (0.88 + 0.12 * r(I.step, 7))
      if (a < 0.02) return
      const col = vivid(sc)
      const M = Math.min(cw, ch)
      const dir = r(s, 3) < 0.5 ? 1 : -1
      const y = ch * (0.5 + rs(s, 1) * 0.1)
      const x = cw * (0.5 + rs(s, 2) * 0.22) + (k - 0.5) * cw * 0.14 * dir
      const ell = (sx: number, sy: number, stops: readonly (readonly [number, string])[]): void => {
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(sx, sy)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
        for (const [o, c] of stops) g.addColorStop(o, c)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(0, 0, 1, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
      if (dk) {
        ctx.globalCompositeOperation = 'screen'
        ell(cw * 0.8, M * 0.05, [
          [0, rgba(col, al(0.55 * a))],
          [0.4, rgba(col, al(0.18 * a))],
          [1, rgba(col, al(0))],
        ])
        ell(cw * 0.62, M * 0.0065, [
          [0, `rgba(255,255,255,${(0.95 * a).toFixed(3)})`],
          [0.5, rgba(mix(col, '#ffffff', 0.5), al(0.6 * a))],
          [1, rgba(col, al(0))],
        ])
        ell(M * 0.07, M * 0.07, [
          [0, `rgba(255,255,255,${(0.8 * a).toFixed(3)})`],
          [1, 'rgba(255,255,255,0)'],
        ])
        // 沿"画面中心—光点"连线排布的镜片鬼影
        for (let j = 0; j < 3; j++) {
          const f = [0.55, 1.1, 1.7][j]
          const gx = cw / 2 + (cw / 2 - x) * f
          const gy = ch / 2 + (ch / 2 - y) * f
          const rr0 = M * [0.03, 0.06, 0.02][j]
          ctx.fillStyle = rgba(col, al(0.14 * a))
          ctx.beginPath()
          ctx.arc(gx, gy, rr0, 0, TAU)
          ctx.fill()
        }
      } else {
        const c2 = mix(col, '#ffffff', 0.2)
        ctx.globalCompositeOperation = 'multiply'
        ell(cw * 0.85, M * 0.06, [
          [0, rgba(c2, al(0.7 * a))],
          [0.45, rgba(c2, al(0.25 * a))],
          [1, rgba(c2, al(0))],
        ])
        ell(cw * 0.65, M * 0.008, [
          [0, rgba(col, al(a))],
          [0.6, rgba(col, al(0.6 * a))],
          [1, rgba(col, al(0))],
        ])
        ell(M * 0.05, M * 0.05, [
          [0, rgba(col, al(0.5 * a))],
          [1, rgba(col, al(0))],
        ])
      }
    },
  }),

  /** 双击脉动：彩色暗角收两次，每次带一点推镜 */
  heartbeat: fx({
    tags: ['emotional', 'calm'],
    w: 0.8,
    dur: 10,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const pulse = (x: number, c: number, w: number): number => {
        const u = (x - c) / w
        return u < 0 || u > 1
          ? 0
          : u < 0.22
            ? E.outCubic(u / 0.22)
            : 1 - E.inOutCubic((u - 0.22) / 0.78)
      }
      const p = Math.max(pulse(k, 0, 0.36), 0.8 * pulse(k, 0.44, 0.56)) * clamp(ampOf(ev), 0.5, 1.2)
      if (p < 0.01) return
      const dk = isDark(sc.bg)
      const M = Math.min(cw, ch)
      const R = Math.hypot(cw, ch) / 2
      drawScaled(ctx, S, 1 + 0.03 * p, cw / 2, ch / 2, cw, ch)
      const col = dk ? mix(vivid(sc), '#000000', 0.1) : mix(vivid(sc), '#000000', 0.25)
      const g = ctx.createRadialGradient(cw / 2, ch / 2, M * (0.52 - 0.2 * p), cw / 2, ch / 2, R)
      const pk = dk ? 0.55 : 0.8
      g.addColorStop(0, rgba(col, al(0)))
      g.addColorStop(0.6, rgba(col, al(0.4 * pk * p)))
      g.addColorStop(1, rgba(col, al(pk * p)))
      ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, cw, ch)
    },
  }),

  /* ================= 胶片 / 电视 ================= */
  tvStatic: fx({
    tags: ['glitch', 'emotional'],
    w: 0.6,
    dur: 5,
    pre: 2,
    amp: 1,
    glitchy: true,
    ae: 'block',
    draw(ctx, ev, k, I) {
      const { cw, ch } = I
      const st = I.step * 3 + evS(ev)
      const b = 0.4
      const cov =
        (k < b ? 0.5 + 0.5 * E.outQuad(k / b) : 1 - E.outQuad((k - b) / (1 - b))) *
        clamp(ampOf(ev), 0.7, 1.1)
      if (cov < 0.02) return
      const N = staticTex()
      const sz = Math.max(1, Math.round(ch / 540))
      const pat = patternOf(ctx, N)
      try {
        pat.setTransform(
          new DOMMatrix([
            sz * 2,
            0,
            0,
            sz,
            -Math.floor(r(st, 1) * 256) * sz * 2,
            -Math.floor(r(st, 2) * 256) * sz,
          ]),
        )
      } catch {
        /* 不支持位移就铺原位噪点 */
      }
      ctx.imageSmoothingEnabled = false
      ctx.globalAlpha = Math.min(1, cov)
      ctx.fillStyle = pat
      ctx.fillRect(0, 0, cw, ch)
      ctx.globalAlpha = 0.3 * cov
      ctx.fillStyle = '#000000'
      const by = (r(st, 3) * 1.2 - 0.1) * ch
      ctx.fillRect(0, by, cw, ch * 0.16)
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.5 * cov
      for (let i = 0; i < 4; i++) ctx.fillRect(0, r(st, i, 4) * ch, cw, Math.max(1, ch * 0.003))
    },
  }),

  dustScratches: fx({
    tags: ['emotional', 'calm', 'editorial'],
    w: 0.8,
    dur: 8,
    amp: 1,
    mid: true,
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const st = I.step * 31 + s
      const dk = isDark(sc.bg)
      const a = ahr(k, 0.08, 0.7) * clamp(ampOf(ev), 0.6, 1.2)
      if (a < 0.02) return
      const M = Math.min(cw, ch)
      const lw = Math.max(1, M * 0.0017)
      const LT = 'rgba(255,253,245,'
      const DK = 'rgba(24,16,8,'
      ctx.fillStyle = (r(st, 1) < 0.5 ? LT : DK) + (0.06 * a * r(st, 2)).toFixed(3) + ')'
      ctx.fillRect(0, 0, cw, ch)
      ctx.lineCap = 'round'
      const nS = 1 + (hash(s, 3) % 3)
      for (let i = 0; i < nS; i++) {
        if (r(st, i, 4) < 0.18) continue
        const x = cw * (0.1 + 0.8 * r(s, i, 5)) + rs(st, i, 6) * M * 0.012
        const y0 = r(s, i, 7) < 0.5 ? -2 : ch * 0.5 * r(st, i, 8)
        const y1 = r(s, i, 9) < 0.5 ? ch + 2 : y0 + ch * rr(0.3, 0.7, st, i, 10)
        ctx.strokeStyle = (dk ? LT : DK) + (0.55 * a).toFixed(3) + ')'
        ctx.lineWidth = lw * rr(0.7, 1.7, s, i, 11)
        ctx.beginPath()
        ctx.moveTo(x, y0)
        ctx.quadraticCurveTo(
          x + rs(st, i, 12) * M * 0.008,
          (y0 + y1) / 2,
          x + rs(s, i, 13) * M * 0.006,
          y1,
        )
        ctx.stroke()
      }
      const nD = 7 + (hash(st, 14) % 9)
      for (let i = 0; i < nD; i++) {
        const x = r(st, i, 15) * cw
        const y = r(st, i, 16) * ch
        const rad = M * rr(0.0018, 0.007, st, i, 17)
        const c =
          (r(st, i, 18) < (dk ? 0.7 : 0.25) ? LT : DK) +
          (rr(0.45, 0.9, st, i, 19) * a).toFixed(3) +
          ')'
        if (r(st, i, 20) < 0.72) {
          ctx.fillStyle = c
          ctx.beginPath()
          ctx.ellipse(x, y, rad, rad * rr(0.45, 1, st, i, 21), r(st, i, 22) * TAU, 0, TAU)
          ctx.fill()
        } else {
          const L = M * rr(0.02, 0.06, st, i, 23)
          const an = r(st, i, 24) * TAU
          ctx.strokeStyle = c
          ctx.lineWidth = lw * 0.8
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.bezierCurveTo(
            x + Math.cos(an) * L * 0.4 + rs(st, i, 25) * L * 0.4,
            y + Math.sin(an) * L * 0.4,
            x + Math.cos(an + 0.8) * L * 0.8,
            y + Math.sin(an + 0.8) * L * 0.8,
            x + Math.cos(an + 0.3) * L,
            y + Math.sin(an + 0.3) * L,
          )
          ctx.stroke()
        }
      }
    },
  }),

  /* ================= 胶片条 / 3D / 水 ================= */
  /** 画面缩成一条带齿孔的胶片，然后被往前拽一格 */
  filmAdvance: fx({
    tags: ['emotional', 'editorial', 'calm'],
    w: 0.6,
    dur: 9,
    pre: 4,
    amp: 1,
    scratch: true,
    ae: 'slice',
    draw(ctx, ev, k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const s = evS(ev)
      const dir = r(s, 1) < 0.7 ? 1 : -1
      const pull = ahr(k, 0.22, 0.78, E.inOutCubic, E.inOutCubic)
      if (pull < 0.002) return
      const z = 1 - 0.17 * pull
      const fw = cw * z
      const fh = ch * z
      const x0 = (cw - fw) / 2
      const gap = Math.max(2, ch * 0.03)
      const pitch = fh + gap
      const off = E.inOutCubic(clamp((k - 0.2) / 0.6)) * pitch * dir
      const yc = (ch - fh) / 2 - off
      ctx.fillStyle = '#0d0b09'
      ctx.fillRect(0, 0, cw, ch)
      for (let j = -2; j <= 2; j++) {
        const y = yc + j * pitch
        if (y > ch || y + fh < 0) continue
        ctx.drawImage(S, x0, y, fw, fh)
      }
      if (x0 > 3) {
        const hp = pitch / 4
        const hw = x0 * 0.42
        const hh = hp * 0.46
        ctx.fillStyle = `rgba(236,230,218,${(0.9 * pull).toFixed(3)})`
        ctx.beginPath()
        for (let y = (((yc % hp) + hp) % hp) - hp; y < ch; y += hp) {
          rrectPath(ctx, x0 * 0.29, y + (hp - hh) / 2, hw, hh, hw * 0.2)
          rrectPath(ctx, cw - x0 * 0.29 - hw, y + (hp - hh) / 2, hw, hh, hw * 0.2)
        }
        ctx.fill()
      }
    },
  }),

  /** 画面绕竖（或横）轴做 3D 摆动：投影出的条带拼成透视梯形 */
  perspectiveTilt: fx({
    tags: ['pop', 'graphic', 'emotional'],
    w: 0.8,
    dur: 8,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'shake',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const cols = r(s, 1) < (cw >= ch ? 0.7 : 0.35)
      const dir = r(s, 2) < 0.5 ? 1 : -1
      const e =
        k < 0.25
          ? E.outCubic(k / 0.25)
          : Math.cos(((k - 0.25) / 0.75) * Math.PI * 1.5) * Math.exp((-2.6 * (k - 0.25)) / 0.75)
      const phi = dir * (30 + 10 * r(s, 3)) * clamp(ampOf(ev), 0.5, 1.2) * e * DEG
      if (Math.abs(phi) < 0.002) return
      const L = cols ? cw : ch
      const Mx = cols ? ch : cw
      const hl = L / 2
      const D = 1.15 * Math.max(cw, ch)
      const co = Math.cos(phi)
      const si = Math.sin(phi)
      ctx.fillStyle = isDark(sc.bg) ? sc.bg : mix(sc.bg, sc.fg, 0.1)
      ctx.fillRect(0, 0, cw, ch)
      const N = 48
      const sw = L / N
      let pd: [number, number] | null = null
      for (let i = 0; i <= N; i++) {
        const u = -1 + (2 * i) / N
        const p = D / (D + u * hl * si)
        const d = hl + u * hl * co * p
        if (pd) {
          const h = (Mx * (pd[1] + p)) / 2
          const x = pd[0]
          const w = d - pd[0] + 0.7
          const s0 = (i - 1) * sw
          if (cols) ctx.drawImage(S, s0, 0, sw, ch, x, (ch - h) / 2, w, h)
          else ctx.drawImage(S, 0, s0, cw, sw, (cw - h) / 2, x, h, w)
        }
        pd = [d, p]
      }
    },
  }),

  /** 水波：落点周围一圈圈环带各自略微缩放重绘（径向位移） */
  ripple: fx({
    tags: ['emotional', 'calm', 'pop'],
    w: 0.8,
    dur: 10,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const cx = cw * (0.5 + rs(s, 1) * 0.1)
      const cy = ch * (0.5 + rs(s, 2) * 0.08)
      const M = Math.min(cw, ch)
      const dk = isDark(sc.bg)
      const Rmax = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy))
      const lam = M * 0.1
      const front = (0.05 + 0.95 * E.outQuad(k)) * Rmax * 1.05
      const A = M * 0.022 * clamp(ampOf(ev), 0.5, 1.3) * (1 - 0.7 * k)
      const dr = lam / 5
      const r0 = Math.max(0, front - 2.6 * lam)
      for (let rad = r0, n = 0; rad < front + dr && n < 40; rad += dr, n++) {
        const rm = rad + dr / 2
        const ph = (front - rm) / lam
        const gain = Math.exp(-ph * 0.8) * clamp(ph * 4 + 1)
        const disp = A * Math.sin(ph * TAU) * gain
        if (Math.abs(disp) < 0.3 || rm < 2) continue
        const m = clamp(rm / Math.max(1, rm - disp), 0.7, 1.4)
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, rad + dr + 0.6, 0, TAU)
        ctx.arc(cx, cy, Math.max(0, rad - 0.6), 0, TAU, true)
        ctx.clip()
        ctx.drawImage(S, cx - cx * m, cy - cy * m, cw * m, ch * m)
        ctx.restore()
      }
      // 波峰高光
      ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
      ctx.lineWidth = Math.max(1, dr * 0.9)
      for (let j = 0; j < 3; j++) {
        const rc = front - lam * (j + 0.25)
        if (rc <= 2) continue
        const a = 0.16 * Math.exp(-j * 0.9) * (1 - 0.6 * k)
        ctx.strokeStyle = dk
          ? `rgba(255,255,255,${a.toFixed(3)})`
          : rgba(mix(sc.fg, sc.bg, 0.4), al(a))
        ctx.beginPath()
        ctx.arc(cx, cy, rc, 0, TAU)
        ctx.stroke()
      }
    },
  }),

  /* ================= 漫画 / 图形叠加 ================= */
  /** 集中线：细三角楔向中心收拢，逐帧重画出手绘抽帧的抖动感 */
  focusLines: fx({
    tags: ['pop', 'graphic', 'emotional'],
    w: 0.9,
    dur: 6,
    amp: 1,
    mid: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const st = I.step * 5 + s
      const a = ahr(k, 0.1, 0.72)
      if (a < 0.02) return
      const cx = cw / 2 + rs(s, 1) * cw * 0.03
      const cy = ch / 2 + rs(s, 2) * ch * 0.03
      const M = Math.min(cw, ch)
      const rx = cw * (0.4 + 0.06 * (1 - a))
      const ry = ch * (0.34 + 0.06 * (1 - a))
      const R = Math.hypot(cw, ch) * 0.75
      const n = 90 + (hash(s, 3) % 50)
      ctx.fillStyle = inkCol(sc)
      ctx.globalAlpha = 0.85 * a
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const an = ((i + r(st, i, 4) * 0.8) / n) * TAU
        const w = M * rr(0.002, 0.011, st, i, 5)
        const tip = rr(1.0, 1.45, st, i, 6)
        const tx = cx + Math.cos(an) * rx * tip
        const ty = cy + Math.sin(an) * ry * tip
        const nx = -Math.sin(an)
        const ny = Math.cos(an)
        const ox = cx + Math.cos(an) * R
        const oy = cy + Math.sin(an) * R
        ctx.moveTo(tx, ty)
        ctx.lineTo(ox + nx * w, oy + ny * w)
        ctx.lineTo(ox - nx * w, oy - ny * w)
        ctx.closePath()
      }
      ctx.fill()
    },
  }),

  /** 流线：收尖的条带横穿画面（让开中间的字） */
  speedLines: fx({
    tags: ['pop', 'graphic'],
    w: 0.8,
    dur: 6,
    amp: 1,
    mid: true,
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const a = ahr(k, 0.12, 0.7)
      if (a < 0.02) return
      const vert = cw < ch ? r(s, 1) < 0.5 : r(s, 1) < 0.15
      const dir = r(s, 2) < 0.5 ? 1 : -1
      const L = vert ? ch : cw
      const M = vert ? cw : ch
      const n = 22 + (hash(s, 3) % 12)
      const c1 = inkCol(sc)
      const c2 = vivid(sc)
      for (let i = 0; i < n; i++) {
        let q = r(s, i, 4)
        if (Math.abs(q - 0.5) < 0.12 && r(s, i, 9) < 0.8)
          q = q < 0.5 ? 0.38 - r(s, i, 10) * 0.33 : 0.62 + r(s, i, 10) * 0.33
        const p = q * M
        const len = L * rr(0.15, 0.55, s, i, 5)
        const th = Math.max(1, M * rr(0.002, 0.008, s, i, 6))
        const sp = rr(1.3, 2.6, s, i, 7)
        const f = (r(s, i, 8) + k * sp) % 1
        const head = -len * 0.2 + f * (L + len * 1.2)
        const tail = head - len
        const H = dir > 0 ? head : L - head
        const Tl = dir > 0 ? tail : L - tail
        ctx.globalAlpha = a * rr(0.4, 0.9, s, i, 11)
        ctx.fillStyle = r(s, i, 12) < 0.22 ? c2 : c1
        ctx.beginPath()
        if (!vert) {
          ctx.moveTo(Tl, p)
          ctx.lineTo(H, p - th / 2)
          ctx.lineTo(H, p + th / 2)
        } else {
          ctx.moveTo(p, Tl)
          ctx.lineTo(p - th / 2, H)
          ctx.lineTo(p + th / 2, H)
        }
        ctx.closePath()
        ctx.fill()
      }
    },
  }),

  /** 闪光：8 角星依次在歌词带周围弹出 */
  starGlint: fx({
    tags: ['pop', 'emotional'],
    w: 0.8,
    dur: 9,
    amp: 1,
    mid: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const dk = isDark(sc.bg)
      const M = Math.min(cw, ch)
      const col = vivid(sc)
      const n = 2 + (hash(s, 1) % 3)
      const port = ch > cw
      for (let i = 0; i < n; i++) {
        const t0 = i * 0.16 + r(s, i, 4) * 0.06
        const u = (k - t0) / 0.55
        if (u <= 0 || u >= 1) continue
        const g = Math.pow(Math.sin(Math.PI * u), 0.8)
        const R = M * (0.1 + 0.07 * r(s, i, 5)) * g * clamp(ampOf(ev), 0.6, 1.3)
        const x = cw * (0.5 + rs(s, i, 2) * (port ? 0.3 : 0.34))
        const y = ch * (0.5 + rs(s, i, 3) * (port ? 0.14 : 0.1))
        const rot = (rs(s, i, 6) * 12 + u * 30) * DEG
        if (R < 0.5) continue
        const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 0.6)
        glow.addColorStop(0, rgba(col, al(0.55 * g)))
        glow.addColorStop(1, rgba(col, al(0)))
        ctx.globalCompositeOperation = dk ? 'screen' : 'source-over'
        ctx.fillStyle = glow
        ctx.fillRect(x - R, y - R, 2 * R, 2 * R)
        ctx.beginPath()
        for (let j = 0; j < 16; j++) {
          const an = rot + (j * Math.PI) / 8
          const rad = j % 2 ? R * 0.07 : j % 4 === 0 ? R : R * 0.42
          if (j) ctx.lineTo(x + Math.cos(an) * rad, y + Math.sin(an) * rad)
          else ctx.moveTo(x + Math.cos(an) * rad, y + Math.sin(an) * rad)
        }
        ctx.closePath()
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = dk ? '#FFFFFF' : col
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.arc(x, y, R * 0.08, 0, TAU)
        ctx.fill()
      }
    },
  }),

  /** 细长的配色条带以不同速度扫过画面 */
  colorBars: fx({
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.8,
    dur: 6,
    amp: 1,
    mid: true,
    ae: 'slice',
    draw(ctx, ev, k, I) {
      const { cw, ch, sc } = I
      const s = evS(ev)
      const vert = r(s, 1) < (cw >= ch ? 0.35 : 0.15)
      const dir = r(s, 2) < 0.5 ? 1 : -1
      const cols = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg].filter(
        (c) => c && contrast(c, sc.bg) > 1.35,
      )
      const use = cols.length ? cols : [inkCol(sc)]
      const L = vert ? cw : ch
      const M = vert ? ch : cw
      const n = 4 + (hash(s, 3) % 4)
      for (let i = 0; i < n; i++) {
        const th = Math.max(2, L * rr(0.008, 0.045, s, i, 4))
        const d = r(s, i, 5) * 0.4
        const sp = rr(0.9, 1.5, s, i, 6)
        const u = clamp(((k - d) / (1 - d)) * sp)
        if (u <= 0 || u >= 1) continue
        let pos = lerp(-th, L + th, u)
        if (dir < 0) pos = L - pos
        const part = r(s, i, 7) < 0.4
        const m0 = part ? M * rr(0, 0.5, s, i, 8) : 0
        const mw = part ? M * rr(0.3, 0.6, s, i, 9) : M
        ctx.globalAlpha = 0.92
        ctx.fillStyle = use[(i + (hash(s, 10) % use.length)) % use.length]
        if (vert) ctx.fillRect(pos - th / 2, m0, th, mw)
        else ctx.fillRect(m0, pos - th / 2, mw, th)
      }
    },
  }),

  /** 三档硬切推镜（哒哒哒），每档各自偏一点焦点，最后弹回 */
  zoomStutter: fx({
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.8,
    dur: 6,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const s = evS(ev)
      const j = Math.min(2, Math.floor(k * 3))
      const a = clamp(ampOf(ev), 0.5, 1.3)
      const z = 1 + (j + 1) * (0.035 + 0.012 * r(s, 1)) * a
      drawScaled(
        ctx,
        S,
        z,
        cw * (0.5 + rs(s, 2, j) * 0.04),
        ch * (0.5 + rs(s, 3, j) * 0.04),
        cw,
        ch,
      )
    },
  }),

  /* ================= 图形反相 / 风格化 ================= */
  /** 反相环（圆或菱形）从中心炸开，后面跟一圈更细的回声 */
  negativeRing: fx({
    tags: ['graphic', 'pop', 'glitch'],
    w: 0.8,
    dur: 6,
    amp: 1,
    mid: true,
    ae: 'invert',
    draw(ctx, ev, k, I) {
      const { cw, ch } = I
      const s = evS(ev)
      const M = Math.min(cw, ch)
      const dia = r(s, 1) < 0.35
      const cx = cw / 2 + rs(s, 2) * cw * 0.05
      const cy = ch / 2 + rs(s, 3) * ch * 0.05
      const Rm = Math.hypot(cw, ch) * (dia ? 0.75 : 0.56)
      const shape = (rad: number): void => {
        if (dia) {
          ctx.moveTo(cx, cy - rad)
          ctx.lineTo(cx + rad, cy)
          ctx.lineTo(cx, cy + rad)
          ctx.lineTo(cx - rad, cy)
          ctx.closePath()
        } else {
          ctx.moveTo(cx + rad, cy)
          ctx.arc(cx, cy, rad, 0, TAU)
        }
      }
      const ring = (p: number, th: number): void => {
        if (p <= 0 || p >= 1) return
        const rad = E.outCubic(p) * Rm
        const rad0 = Math.max(0, rad - th * (1 - 0.55 * p))
        ctx.beginPath()
        shape(rad)
        if (rad0 > 0.5) shape(rad0)
        ctx.fill('evenodd')
      }
      ctx.globalCompositeOperation = 'difference'
      ctx.fillStyle = '#ffffff'
      const a = clamp(ampOf(ev), 0.6, 1.3)
      ring(k * 1.05 + 0.04, M * 0.16 * a)
      ring((k - 0.22) * 1.35, M * 0.05 * a)
    },
  }),

  /** 边缘检测：|画面 - 平移后的画面| → 暗色方案出霓虹描边，亮色方案出墨线稿 */
  edgeDetect: fx({
    tags: ['graphic', 'glitch', 'editorial'],
    w: 0.7,
    dur: 4,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'invert',
    draw(ctx, _ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const dk = isDark(sc.bg)
      const a = ahr(k, 0.1, 0.72)
      if (a < 0.02) return
      const w = Math.max(2, Math.round(cw / 2))
      const h = Math.max(2, Math.round(ch / 2))
      const o = Math.max(1, Math.round(h / 320))
      const T = buf(0, w, h)
      const x = cx2(T)
      x.globalCompositeOperation = 'copy'
      x.drawImage(S, 0, 0, w, h)
      x.globalCompositeOperation = 'difference'
      x.drawImage(S, 0, 0, cw, ch, o, o, w, h)
      x.globalCompositeOperation = 'saturation'
      x.fillStyle = '#808080'
      x.fillRect(0, 0, w, h)
      const T2 = buf(1, w, h)
      const y = cx2(T2)
      // 噪声底：与浅灰 color-burn 等于 max(0,(v-0.07)/0.93)，抹掉抖动渐变的台阶；再 ×4 增益
      y.globalCompositeOperation = 'copy'
      y.drawImage(T, 0, 0)
      y.globalCompositeOperation = 'color-burn'
      y.fillStyle = '#EDEDED'
      y.fillRect(0, 0, w, h)
      y.globalCompositeOperation = 'lighter'
      y.drawImage(T2, 0, 0)
      y.drawImage(T2, 0, 0)
      const edge = dk ? mix(vivid(sc), '#ffffff', 0.45) : darkest([sc.fg, sc.ink, '#111111'])
      // 半分辨率上色后一次性放大：暗底霓虹线 / 纸色墨线
      y.globalCompositeOperation = 'multiply'
      y.fillStyle = dk ? edge : invHex(edge)
      y.fillRect(0, 0, w, h)
      if (dk) {
        y.globalCompositeOperation = 'screen'
        y.fillStyle = mix(sc.bg, '#000000', 0.6)
        y.fillRect(0, 0, w, h)
      } else {
        y.globalCompositeOperation = 'difference'
        y.fillStyle = '#ffffff'
        y.fillRect(0, 0, w, h)
        y.globalCompositeOperation = 'multiply'
        y.fillStyle = sc.bg
        y.fillRect(0, 0, w, h)
      }
      ctx.globalAlpha = a
      ctx.drawImage(T2, 0, 0, w, h, 0, 0, cw, ch)
    },
  }),

  /** 玻璃碎裂：旧帧上先出裂纹，新帧以碎片形式飘开再拼回 */
  shatter: fx({
    tags: ['glitch', 'pop', 'emotional'],
    w: 0.5,
    dur: 8,
    pre: 1,
    amp: 1,
    scratch: true,
    ae: 'block',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const M = Math.min(cw, ch)
      const dk = isDark(sc.bg)
      const a = clamp(ampOf(ev), 0.6, 1.3)
      const px = cw * (0.5 + rs(s, 1) * 0.15)
      const py = ch * (0.5 + rs(s, 2) * 0.12)
      const n = 9 + (hash(s, 3) % 4)
      const radii = [0, M * rr(0.1, 0.17, s, 4), M * rr(0.32, 0.45, s, 5), Math.hypot(cw, ch) * 1.1]
      const ang: number[] = []
      for (let i = 0; i < n; i++) ang.push(((i + rs(s, i, 6) * 0.35) / n) * TAU)
      const V = (i: number, j: number): Pt => {
        if (!j) return [px, py]
        const q = ang[i % n] + rs(s, i % n, j, 7) * 0.12
        const rad = radii[j] * (j < 3 ? 1 + rs(s, i % n, j, 8) * 0.18 : 1)
        return [px + Math.cos(q) * rad, py + Math.sin(q) * rad]
      }
      const b = 1 / 8
      const u = (k - b) / (1 - b)
      const sep = u <= 0 ? 0 : u < 0.28 ? E.outCubic(u / 0.28) : 1 - E.inOutCubic((u - 0.28) / 0.72)
      const crack = u <= 0 ? 1 : Math.max(0, 1 - u * 1.4)
      const shards: Shard[] = []
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 3; j++) {
          const pts: Pt[] = j
            ? [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)]
            : [V(i, 0), V(i, 1), V(i + 1, 1)]
          const cxm = pts.reduce((t, p) => t + p[0], 0) / pts.length
          const cym = pts.reduce((t, p) => t + p[1], 0) / pts.length
          const dx = cxm - px
          const dy = cym - py
          const dl = Math.hypot(dx, dy) || 1
          const d = sep * M * (dk ? 0.04 : 0.028) * a * (0.5 + 0.3 * j + 0.5 * r(s, i, j, 9))
          shards.push({
            pts,
            cxm,
            cym,
            ox: (dx / dl) * d,
            oy: (dy / dl) * d,
            rot: sep * rs(s, i, j, 10) * 4 * DEG,
          })
        }
      }
      if (sep > 0.002) {
        ctx.fillStyle = dk ? '#000000' : mix(sc.bg, '#000000', 0.55)
        ctx.fillRect(0, 0, cw, ch)
        for (const sh of shards) {
          ctx.save()
          ctx.translate(sh.cxm + sh.ox, sh.cym + sh.oy)
          ctx.rotate(sh.rot)
          ctx.translate(-sh.cxm, -sh.cym)
          ctx.beginPath()
          sh.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
          ctx.closePath()
          ctx.clip()
          ctx.drawImage(S, 0, 0)
          ctx.restore()
        }
      }
      const la = Math.max(crack, sep * 0.6)
      if (la > 0.02) {
        ctx.strokeStyle = dk
          ? `rgba(255,255,255,${(0.75 * la).toFixed(3)})`
          : rgba(darkest([sc.fg, sc.ink]), al(0.6 * la))
        ctx.lineWidth = Math.max(1, M * 0.0022)
        ctx.lineJoin = 'round'
        ctx.beginPath()
        for (const sh of shards) {
          const c = Math.cos(sh.rot)
          const si = Math.sin(sh.rot)
          sh.pts.forEach((p, i) => {
            const X = sh.cxm + sh.ox + (p[0] - sh.cxm) * c - (p[1] - sh.cym) * si
            const Y = sh.cym + sh.oy + (p[0] - sh.cxm) * si + (p[1] - sh.cym) * c
            if (i) ctx.lineTo(X, Y)
            else ctx.moveTo(X, Y)
          })
          ctx.closePath()
        }
        ctx.stroke()
      }
      if (k < b * 1.5) {
        // 撞击白闪
        const f = 1 - k / (b * 1.5)
        const g = ctx.createRadialGradient(px, py, 0, px, py, M * 0.25)
        g.addColorStop(0, `rgba(255,255,255,${(0.85 * f).toFixed(3)})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalCompositeOperation = dk ? 'screen' : 'source-over'
        ctx.fillStyle = g
        ctx.fillRect(px - M * 0.25, py - M * 0.25, M * 0.5, M * 0.5)
      }
    },
  }),

  /** 抽焦：画面在切点处失焦最重，然后弹回清晰 */
  defocus: fx({
    tags: ['emotional', 'calm', 'editorial'],
    w: 0.9,
    dur: 8,
    pre: 4,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S } = I
      if (!S) return
      const amt =
        (k < 0.5 ? E.inOutCubic(k / 0.5) : 1 - E.inOutCubic((k - 0.5) / 0.5)) *
        clamp(ampOf(ev), 0.6, 1.2)
      if (amt < 0.01) return
      const w = Math.max(2, Math.ceil(cw / 4))
      const h = Math.max(2, Math.ceil(ch / 4))
      const T = buf(0, w, h)
      const x = cx2(T)
      x.globalCompositeOperation = 'copy'
      if (I.allowFilter) {
        x.filter = `blur(${((amt * h) / 55).toFixed(2)}px)`
        x.drawImage(S, 0, 0, w, h)
        x.filter = 'none'
      } else {
        const w2 = Math.max(2, Math.ceil(w / (1 + 3 * amt)))
        const h2 = Math.max(2, Math.ceil(h / (1 + 3 * amt)))
        const T2 = buf(1, w2, h2)
        const y = cx2(T2)
        y.globalCompositeOperation = 'copy'
        y.drawImage(S, 0, 0, w2, h2)
        x.drawImage(T2, 0, 0, w, h)
      }
      ctx.globalAlpha = Math.min(1, amt * 1.8)
      drawScaled(ctx, T, 1 + 0.025 * amt, cw / 2, ch / 2, cw, ch)
    },
  }),

  /** 快门：白闪之后画面变成一张斜放的拍立得，压在压暗的底色上，再 zoom 回去 */
  snapshot: fx({
    tags: ['pop', 'emotional', 'editorial'],
    w: 0.6,
    dur: 10,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const M = Math.min(cw, ch)
      const snap =
        k < 0.16 ? E.outBack(k / 0.16, 1.4) : k > 0.8 ? 1 - E.inOutCubic((k - 0.8) / 0.2) : 1
      if (snap > 0.002) {
        const z = 1 - 0.15 * snap
        const rot = (r(s, 1) < 0.5 ? -1 : 1) * (2 + 2.5 * r(s, 2)) * snap * DEG
        const bw = M * 0.024 * clamp(snap, 0, 1)
        const fw = cw * z
        const fh = ch * z
        const bb = bw * 3.2
        ctx.globalAlpha = clamp(snap * 1.2)
        ctx.fillStyle = mix(sc.bg, '#000000', isDark(sc.bg) ? 0.5 : 0.45)
        ctx.fillRect(0, 0, cw, ch)
        ctx.globalAlpha = 1
        ctx.translate(cw / 2, ch / 2)
        ctx.rotate(rot)
        ctx.fillStyle = `rgba(0,0,0,${(0.3 * snap).toFixed(3)})`
        ctx.fillRect(-fw / 2 - bw + M * 0.012, -fh / 2 - bw + M * 0.02, fw + 2 * bw, fh + bw + bb)
        ctx.fillStyle = '#F7F5F0'
        ctx.fillRect(-fw / 2 - bw, -fh / 2 - bw, fw + 2 * bw, fh + bw + bb)
        ctx.drawImage(S, -fw / 2, -fh / 2, fw, fh)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }
      if (k < 0.22) {
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - k / 0.22)).toFixed(3)})`
        ctx.fillRect(0, 0, cw, ch)
      }
    },
  }),

  /** 整幅画面的弹性挤压拉伸（阻尼弹簧） */
  squash: fx({
    tags: ['pop', 'graphic'],
    w: 0.8,
    dur: 6,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'zoom',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const hor = r(s, 1) < 0.6
      const e = Math.cos(k * Math.PI * 2.5) * Math.exp(-1.8 * k) * (1 - Math.pow(k, 6))
      const a = 0.17 * clamp(ampOf(ev), 0.5, 1.3) * e
      if (Math.abs(a) < 0.002) return
      const sx = hor ? 1 + a : 1 - a * 0.6
      const sy = hor ? 1 - a * 0.6 : 1 + a
      ctx.fillStyle = sc.bg
      ctx.fillRect(0, 0, cw, ch)
      ctx.drawImage(S, cw / 2 - (cw * sx) / 2, ch / 2 - (ch * sy) / 2, cw * sx, ch * sy)
    },
  }),

  /** 扫描仪：发光条带扫过画面，没扫到的压暗，紧跟着的几行错位 */
  scanBar: fx({
    tags: ['graphic', 'editorial', 'glitch'],
    w: 0.7,
    dur: 8,
    amp: 1,
    mid: true,
    scratch: true,
    ae: 'flash',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const dk = isDark(sc.bg)
      const down = r(s, 1) < 0.7
      const st = I.step * 3 + s
      const bh = ch * 0.05
      const yy = -bh + k * (ch + 2 * bh)
      const y = down ? yy : ch - yy
      const y0 = down ? Math.max(0, y) : 0
      const y1 = down ? ch : Math.min(ch, y)
      if (y1 > y0) {
        ctx.fillStyle = dk ? 'rgba(0,0,0,0.6)' : rgba(sc.bg, 0.7)
        ctx.fillRect(0, y0, cw, y1 - y0)
      }
      const band = ch * 0.035
      const sy = clamp(down ? y - band : y, 0, ch - 1)
      const sh = Math.min(band, ch - sy)
      if (sh > 1)
        for (let i = 0; i < 3; i++) {
          const hh = sh / 3
          const y2 = sy + i * hh
          ctx.drawImage(S, 0, y2, cw, hh, rs(st, i, 2) * cw * 0.012, y2, cw, hh)
        }
      const col = dk ? mix(vivid(sc), '#ffffff', 0.4) : vivid(sc)
      const g = ctx.createLinearGradient(0, y - bh, 0, y + bh)
      g.addColorStop(0, rgba(col, al(0)))
      g.addColorStop(0.5, rgba(col, al(dk ? 0.5 : 0.35)))
      g.addColorStop(1, rgba(col, al(0)))
      ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'
      ctx.fillStyle = g
      ctx.fillRect(0, y - bh, cw, bh * 2)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = dk ? '#FFFFFF' : col
      ctx.globalAlpha = 0.9
      ctx.fillRect(0, y - Math.max(1, ch * 0.0015), cw, Math.max(2, ch * 0.003))
    },
  }),

  /** 整幅画面平移一整幅宽（环绕），带运动模糊——结束时恰好回到原位 */
  loopScroll: fx({
    tags: ['pop', 'graphic', 'glitch'],
    w: 0.7,
    dur: 6,
    pre: 3,
    amp: 1,
    scratch: true,
    ae: 'slice',
    draw(ctx, ev, k, I) {
      const { cw, ch, S, sc } = I
      if (!S) return
      const s = evS(ev)
      const vert = cw < ch ? r(s, 1) < 0.6 : r(s, 1) < 0.2
      const dir = r(s, 2) < 0.5 ? 1 : -1
      const L = vert ? ch : cw
      const q = E.inOutCubic(k)
      const o = (((q * L * dir) % L) + L) % L
      // d(inOutCubic)/dk，范围 0..3
      const v = k < 0.5 ? 12 * k * k : 12 * (1 - k) * (1 - k)
      const blur = (L * 0.05 * v) / 3
      const wrap = (c: Ctx, img: HTMLCanvasElement, off: number, W: number, H: number): void => {
        if (vert) {
          c.drawImage(img, 0, off - H, W, H)
          c.drawImage(img, 0, off, W, H)
        } else {
          c.drawImage(img, off - W, 0, W, H)
          c.drawImage(img, off, 0, W, H)
        }
      }
      if (blur < 2) {
        wrap(ctx, S, o, cw, ch)
        return
      }
      const w = Math.max(2, Math.round(cw / 2))
      const h = Math.max(2, Math.round(ch / 2))
      const T = buf(0, w, h)
      const x = cx2(T)
      x.globalCompositeOperation = 'copy'
      x.fillStyle = sc.bg
      x.fillRect(0, 0, w, h)
      x.globalCompositeOperation = 'source-over'
      wrap(x, S, o / 2, w, h)
      const T2 = buf(1, w, h)
      const y = cx2(T2)
      y.globalCompositeOperation = 'copy'
      y.drawImage(T, 0, 0)
      y.globalCompositeOperation = 'source-over'
      const n = 6
      for (let i = 1; i < n; i++) {
        const d = (i / (n - 1) - 0.5) * (blur / 2) * dir
        y.globalAlpha = 1 / (i + 1)
        if (vert) {
          y.drawImage(T, 0, d)
          y.drawImage(T, 0, d - Math.sign(d || 1) * h)
        } else {
          y.drawImage(T, d, 0)
          y.drawImage(T, d - Math.sign(d || 1) * w, 0)
        }
      }
      ctx.drawImage(T2, 0, 0, w, h, 0, 0, cw, ch)
    },
  }),
}

export const pack: PackParts = { fx: DEFS }
