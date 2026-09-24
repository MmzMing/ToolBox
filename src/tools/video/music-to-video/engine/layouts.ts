/**
 * 版式库（layout）：决定一句歌词在屏幕上怎么摆。
 *
 * 每个版式两部分：
 * - plan(rng, cut, st)：镜头生成期跑一次，把随机挑到的构图参数写进 cut.params
 *   （同一份 params 还会导出给 AE，所以只能放可序列化的标量）；
 * - render(env)：逐帧跑，读 env.cut.params 作画，返回主文字包围盒供装饰定位。
 *
 * 主文字一律走 mainDraw（负责入场/保持/出场/文字加工），底纹与陪衬文字直接 env.draw。
 */
import type {
  AnimCtx,
  BBox,
  CharFn,
  Cut,
  Env,
  LayoutDef,
  PieceFn,
  StylePack,
  TextItem,
} from './types'
import { FONTS } from './fonts'
import { TREAT } from './parts'
import { charKind, glyphCount, isPunct } from './script'
import { fitSize, measure, splitLines } from './text-layout'
import { drawItem } from './draw'
import { metrics } from './glyphs'
import { ENTER, EXIT, HOLD, combineChar, combinePiece } from './anim'
import { DEG, E, TAU, clamp, fmtTime, hash, lerp, lum, mix, r, rgba, rr, rs } from './util'

/** 单个文字项可以覆盖本 cut 的动效选择（TextItem 未声明这三项，故局部扩展） */
type ItemWithAnim = TextItem & { enter?: string; hold?: string; exit?: string }

/** 版式只在 renderer.drawCut 里被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

/**
 * 字符的视觉宽度档：中文排版里汉字算满格、拉丁与数字算窄、标点最小。
 * （JIZURA 原按汉字/片假名/平假名分档，中文没有假名层。）
 */
function charCls(ch: string): 'full' | 'narrow' | 'punct' | 'other' {
  const k = charKind(ch)
  if (k === 'han' || k === 'kana') return 'full'
  if (k === 'latin' || k === 'digit') return 'narrow'
  if (k === 'punct') return 'punct'
  return 'other'
}

/** 主文字管线：入场 → 保持 → 出场，逐字/逐碎片函数在这里汇合 */
export function mainDraw(env: Env, it: TextItem): BBox | null {
  const cut = cutOf(env)
  const ov = it as ItemWithAnim
  if (it.seed == null) it.seed = hash(cut.seed, (it.mi || 0) + 1, 7)
  const charFns: CharFn[] = []
  const pieceFns: PieceFn[] = []
  it.charFns = charFns
  it.pieceFns = pieceFns
  const stagger = cut.stagger || 0
  it.delay = (it.mi || 0) * stagger
  const actx: AnimCtx = { dur: cut.dur, inDur: cut.inDur, outDur: cut.outDur }
  const lt0 = env.lt
  const ltI = lt0 - it.delay
  const pIn = clamp(ltI / Math.max(0.01, cut.inDur))
  const outStart = cut.dur - cut.outDur
  const pOut = cut.outDur > 0 ? clamp((lt0 - outStart) / cut.outDur) : 0
  const en = ENTER[ov.enter || cut.enter] || ENTER.cut
  const ex = EXIT[ov.exit || cut.exit] || EXIT.cut
  const ho = HOLD[ov.hold || cut.hold] || HOLD.still
  // 文字加工（描边/立体/荧光笔…）；自己画底板的版式用 it.plain 退出加工
  if (cut.treat && !it.plain && TREAT[cut.treat]) {
    try {
      TREAT[cut.treat].apply(env, it, cut.treatP || {})
    } catch (e) {
      console.warn('treat', cut.treat, e)
    }
  }
  // 硬切入场：没到进场时刻就整块不画（没有逐字动画可以回溯）
  if (ltI < 0 && en === ENTER.cut) return null
  if (en !== ENTER.cut && (pIn < 1 || en.pieces)) {
    env.lt = ltI
    en.apply(env, it, pIn, actx)
    env.lt = lt0
  }
  if (ltI < 0 && !en.pieces) return null
  const amt = clamp((ltI - cut.inDur * 0.85) / 0.25) * (1 - pOut)
  if (amt > 0 && !it.noHold) ho.apply(env, it, amt, actx)
  if (pOut > 0 && ex !== EXIT.cut) ex.apply(env, it, pOut, actx)
  it.charFn = combineChar(charFns)
  it.pieceFn = combinePiece(pieceFns)
  return drawFx(env, it)
}

/** 画一个文字项：处理条带错位 / 裁剪 / 拖影 / 回声 / 擦除条 / 光标 */
export function drawFx(env: Env, it: TextItem): BBox | null {
  const ctx = env.ctx
  let bb: BBox | null = null
  const draw = (): BBox | null => {
    const sk = it.streak
    if (sk && sk.a > 0.01) {
      for (let k = sk.n; k >= 1; k--) {
        drawItem(env, {
          ...it,
          x: it.x + sk.dx * k,
          y: it.y + (sk.dy || 0) * k,
          alpha: (it.alpha ?? 1) * sk.a * (1 - k / (sk.n + 1)),
          pieceFn: null,
          streak: null,
          echo: null,
          pre: undefined,
          post: undefined,
          shadow: undefined,
          extrude: undefined,
        })
      }
    }
    // 阶梯状副本：垫在主体后面，只描边或单色
    const ec = it.echo
    if (ec && ec.n > 0) {
      for (let k = ec.n; k >= 1; k--) {
        const c: TextItem = {
          ...it,
          x: it.x + (ec.dx || 0) * k,
          y: it.y + (ec.dy || 0) * k,
          size: it.size * (ec.scale ?? 1) ** k,
          rot: (it.rot || 0) + (ec.rot || 0) * k,
          alpha: (it.alpha ?? 1) * (ec.a ?? 0.5) * (ec.decay ?? 0.7) ** (k - 1),
          pieceFn: null,
          streak: null,
          echo: null,
          pre: undefined,
          post: undefined,
          shadow: undefined,
          extrude: undefined,
          pattern: undefined,
          gradient: undefined,
          color: ec.color || it.color,
          _lay: undefined,
          _m: undefined,
        }
        if (ec.outline) {
          c.fill = false
          c.stroke = Math.max(1, it.size * 0.012)
          c.strokeColor = ec.color || it.color
        }
        drawItem(env, c)
      }
    }
    return drawItem(env, it)
  }
  if (it.pre) {
    try {
      it.pre(env, it)
    } catch (e) {
      console.warn(e)
    }
  }
  if (it.clip) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(it.clip[0], -env.H, it.clip[1] - it.clip[0], env.H * 3)
    ctx.clip()
  }
  if (it.clipY) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(-env.W, it.clipY[0], env.W * 3, it.clipY[1] - it.clipY[0])
    ctx.clip()
  }
  if (it.clipFn) {
    ctx.save()
    ctx.beginPath()
    it.clipFn(ctx, env, it)
    ctx.clip()
  }
  // 条带只是裁剪/位移同一文字，包围盒取最后一次成功绘制的结果
  if (it.vbands) {
    for (const [x0, x1, dy] of it.vbands) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, -env.H * 2, x1 - x0, env.H * 5)
      ctx.clip()
      ctx.translate(0, dy)
      bb = draw() ?? bb
      ctx.restore()
    }
  } else if (it.bands) {
    for (const [y0, y1, dx] of it.bands) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(-env.W * 2, y0, env.W * 5, y1 - y0)
      ctx.clip()
      ctx.translate(dx, 0)
      bb = draw() ?? bb
      ctx.restore()
    }
    // 条带范围之外的部分照常画（不位移）
    const lo = it.bands[0][0]
    const hi = it.bands[it.bands.length - 1][1]
    ctx.save()
    ctx.beginPath()
    ctx.rect(-env.W * 2, -env.H * 3, env.W * 5, lo + env.H * 3)
    ctx.rect(-env.W * 2, hi, env.W * 5, env.H * 4)
    ctx.clip()
    bb = draw() ?? bb
    ctx.restore()
  } else {
    bb = draw() ?? bb
  }
  if (it.clipFn) ctx.restore()
  if (it.clipY) ctx.restore()
  if (it.clip) ctx.restore()
  if (it.post) {
    try {
      it.post(env, it, bb)
    } catch (e) {
      console.warn(e)
    }
  }
  if (it.wipeBar) {
    env.rect(
      it.wipeBar.x - Math.max(4, it.size * 0.035),
      it.y - it.wipeBar.h / 2,
      Math.max(8, it.size * 0.07),
      it.wipeBar.h,
      env.sc.accent,
      1,
      false,
    )
  }
  if (it.cursorAt != null && it.cursorAt >= 0) {
    const m = it._m || measure(it)
    // 光标跑到末尾时改成闪烁，否则常亮
    const blink = it.cursorAt >= m.lay.N ? env.step % 2 === 0 : true
    if (blink) {
      let x: number
      const box: BBox | null = bb
      if (box && box.boxes.length) {
        const last = box.boxes[box.boxes.length - 1]
        x = it.x + last.x + last.w / 2 + it.size * 0.08
      } else {
        x = it.align === 'left' ? it.x : it.x - m.w / 2
      }
      env.rect(x, it.y - it.size * 0.45, it.size * 0.5, it.size * 0.9, env.sc.accent, 1)
    }
  }
  return bb
}

/** 合并两个包围盒；合并结果不再保留逐字框（装饰只关心整体范围） */
export function unionBB(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b
  if (!b) return a
  const x0 = Math.min(a.x0, b.x0)
  const y0 = Math.min(a.y0, b.y0)
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  return { x0, y0, x1, y1, boxes: [], cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

/** 没画出文字时的兜底框（画面中央一小块） */
export function centerBB(env: Env, bb: BBox | null): BBox {
  return (
    bb || {
      x0: env.W * 0.35,
      x1: env.W * 0.65,
      y0: env.H * 0.4,
      y1: env.H * 0.6,
      cx: env.W / 2,
      cy: env.H / 2,
      boxes: [],
    }
  )
}

/** 按角色取可用字体；一个都不在字体表里时退回 display */
export function fontsOf(st: StylePack, roles: readonly string[]): string[] {
  const byRole: Record<string, string[] | undefined> = { ...st.fonts }
  const f = roles.flatMap((role) => byRole[role] ?? []).filter((k) => !!FONTS[k])
  return f.length ? f : st.fonts.display.length ? st.fonts.display : ['sans_black']
}

/* ---------- 各版式的 params：plan 产出、render 消费 ---------- */

type CenterParams = {
  font: string
  sx: number
  track: number
  sub: boolean
  under: boolean
  accent: boolean
  ox: number
  oy: number
}
type MixedParams = {
  fontBig: string
  fontSmall: string
  mode: string
  rotAmp: number
  smallK: number
  accentIdx: number
}
type VcolsParams = { variant: string; cols: number; font: string; side: string; perCol: number }
type MarqueeParams = { rows: number; rowStyle: string; speed: number; font: string; sx: number }
type TileParams = {
  unit: string
  knock: string
  flicker: boolean
  font: string
  tileFont: string
  rowsN: number
}
type ScatterParams = { font: string; fontB: string; extras: boolean }
type RingParams = {
  orient: string
  center: string
  speed: number
  R: number
  font: string
  fontC: string
}
type WaveParams = { amp: number; freq: number; trail: number; font: string; travel: number }
type HugeParams = { font: string; grad: boolean; dir: number; label: boolean }
type LabelsParams = { variant: string; unit: string; center: string; font: string; fontC: string }
type CondensedParams = { count: number; sx: number; sy: number; font: string }
type GlossParams = { font: string; side: string; bgText: boolean; vertNote: boolean }
type TypeParams = { font: string; align: string; prompt: boolean }
type DiagParams = { ang: number; band: string; second: boolean; font: string }
type CircleParams = { variant: string; vertical: boolean; font: string; off: number }
type StackParams = {
  copies: number
  dir: number
  style: string
  font: string
  gap: number
  xs: number
}
type PillParams = { grad: boolean; font: string; smalls: boolean }
type TitleParams = { font: string }
type InterludeParams = { variant: string }

export const LAYOUTS: Record<string, LayoutDef> = {
  /* 居中主标题 + 可选副行与下划线 */
  center: {
    fits: () => true,
    plan: (rng, _cut, st): CenterParams => ({
      font: rng.pick(fontsOf(st, rng.chance(0.7) ? ['display'] : ['serif'])),
      sx: rng.pick([1, 1, 1, 1.25, 1.45, 0.78]),
      track: rng.range(0.02, 0.14),
      sub: rng.chance(0.45),
      under: rng.chance(0.3),
      accent: rng.chance(0.18),
      ox: rng.range(-0.05, 0.05),
      oy: rng.range(-0.06, 0.06),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as CenterParams
      const text = splitLines(cut.text, W < H ? 5 : 11)
      const size = Math.min(
        fitSize(text, P.font, W * 0.84, H * 0.5, { sx: P.sx, track: P.track, lead: 1.2 }),
        H * 0.33,
      )
      const bb = mainDraw(env, {
        text,
        font: P.font,
        size,
        x: W / 2 + P.ox * W,
        y: H / 2 + P.oy * H,
        sx: P.sx,
        track: P.track,
        lead: 1.2,
        color: P.accent ? sc.accent : sc.fg,
      })
      if (bb && P.sub && cut.lineText !== cut.text) {
        env.draw({
          text: cut.lineText,
          font: env.st.fonts.body[0],
          size: clamp(H * 0.026, 16, 34),
          x: W / 2 + P.ox * W,
          y: bb.y1 + H * 0.07,
          track: 0.22,
          color: sc.sub,
          alpha: E.outCubic(env.pIn),
          ghost: false,
        })
      }
      if (bb && P.under) {
        // 进出场各用一条缓动：入是从左展，出是从左收
        const e = E.outExpo(env.pIn * 1.2 - 0.2)
        const o = E.inCubic(env.pOut)
        if (e > 0 && o < 1) {
          env.line(
            [
              [lerp(bb.x0, bb.x1, o), bb.y1 + size * 0.14],
              [lerp(bb.x0, bb.x1, e), bb.y1 + size * 0.14],
            ],
            sc.accent,
            Math.max(2, size * 0.03),
            1,
          )
        }
      }
      return bb
    },
  },

  /* 逐字大小组合：汉字满格、拉丁缩小，四种排法 */
  mixed: {
    fits: (n) => n >= 2 && n <= 16,
    plan: (rng, _cut, st): MixedParams => ({
      fontBig: rng.pick(fontsOf(st, ['display', 'serif'])),
      fontSmall: rng.pick(fontsOf(st, ['serif', 'body'])),
      mode: rng.pick(['line', 'stair', 'line', 'wave']),
      rotAmp: rng.range(2, 10),
      smallK: rng.range(0.42, 0.6),
      accentIdx: rng.int(0, 20),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as MixedParams
      const chars = [...cut.text.replace(/\s+/g, '')]
      const n = chars.length
      const rows = n > 9 ? 2 : 1
      const perRow = Math.ceil(n / rows)
      const items = chars.map((ch, i) => {
        const cls = charCls(ch)
        const k =
          cls === 'full'
            ? 1
            : cls === 'narrow'
              ? 0.8
              : cls === 'punct'
                ? 0.42
                : P.smallK + r(cut.seed, i, 3) * 0.14
        const font = cls === 'full' ? P.fontBig : r(cut.seed, i, 4) < 0.55 ? P.fontSmall : P.fontBig
        return { ch, cls, k, font, w: metrics.adv(font, ch) * k * 0.96 }
      })
      let bbAll: BBox | null = null
      for (let ri = 0; ri < rows; ri++) {
        const row = items.slice(ri * perRow, (ri + 1) * perRow)
        const sumW = row.reduce((s, c) => s + c.w, 0)
        const base = Math.min((W * 0.86) / sumW, H * (rows > 1 ? 0.3 : 0.4))
        let x = W / 2 - (sumW * base) / 2
        const baseline = H / 2 + base * 0.38 + (ri - (rows - 1) / 2) * base * 1.05
        row.forEach((c, j) => {
          const i = ri * perRow + j
          const size = c.k * base
          let y = baseline - size / 2 + rs(cut.seed, i, 5) * base * 0.06
          if (P.mode === 'stair') y += (j - (row.length - 1) / 2) * base * 0.12
          if (P.mode === 'wave') y += Math.sin(j * 1.1) * base * 0.1
          bbAll = unionBB(
            bbAll,
            mainDraw(env, {
              text: c.ch,
              font: c.font,
              size,
              x: x + (c.w * base) / 2,
              y,
              rot: rs(cut.seed, i, 6) * P.rotAmp,
              color: i === P.accentIdx % n && c.cls !== 'full' ? sc.accent : sc.fg,
              mi: i,
            }),
          )
          x += c.w * base
        })
      }
      return bbAll
    },
  },

  /* 竖排多列（中文直排），repeat = 同句并排几列，split = 分列断句 */
  vcols: {
    fits: (n) => n <= 18,
    plan: (rng, cut, st): VcolsParams => {
      const n = cut.n
      const variant =
        n <= 5
          ? rng.pick(['repeat', 'repeat', 'split'])
          : n <= 9
            ? rng.pick(['split', 'repeat'])
            : 'split'
      return {
        variant,
        cols: n <= 4 ? rng.pick([3, 5, 5]) : 3,
        font: rng.pick(fontsOf(st, ['serif', 'serif', 'display'])),
        side: rng.pick(['same', 'outline', 'dim']),
        perCol: rng.int(3, 6),
      }
    },
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as VcolsParams
      const text = cut.text.replace(/\s+/g, '')
      const n = glyphCount(text)
      if (P.variant === 'repeat' && n <= 9) {
        const cols = P.cols
        const size = Math.min((H * 0.8) / (n * 1.04), (W * 0.86) / (cols * 1.75))
        let bb: BBox | null = null
        const mid = (cols - 1) / 2
        for (let i = 0; i < cols; i++) {
          const side = i !== Math.round(mid)
          const it: TextItem = {
            text,
            font: P.font,
            size,
            x: W / 2 + (i - mid) * size * 1.75,
            y: H / 2,
            vertical: true,
            track: 0.04,
            color: sc.fg,
            mi: Math.abs(i - mid) * 2,
          }
          if (side && P.side === 'outline') {
            it.fill = false
            it.stroke = Math.max(1.2, size * 0.012)
          }
          if (side && P.side === 'dim') it.alpha = 0.38
          const b = mainDraw(env, it)
          if (!side) bb = b
        }
        return bb
      }
      const per = Math.max(2, Math.min(P.perCol + 1, Math.ceil(n / Math.ceil(n / 7))))
      const arr = [...text]
      const colsArr: string[] = []
      for (let i = 0; i < arr.length; i += per) colsArr.push(arr.slice(i, i + per).join(''))
      const t2 = colsArr.join('\n')
      const size = Math.min((H * 0.78) / (per * 1.03), (W * 0.8) / (colsArr.length * 1.4))
      const colH = per * size * 1.03
      return mainDraw(env, {
        text: t2,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2 - colH / 2,
        vertical: true,
        lead: 1.4,
        align: 'left',
        track: 0.03,
        color: sc.fg,
      })
    },
  },

  /* 主标题上下各配几条滚动字幕带 */
  marquee: {
    fits: (n) => n <= 12,
    plan: (rng, _cut, st): MarqueeParams => ({
      rows: rng.pick([2, 4, 4, 2]),
      rowStyle: rng.pick(['outline', 'dim', 'box']),
      speed: rng.range(0.5, 1.2),
      font: rng.pick(fontsOf(st, ['display'])),
      sx: rng.pick([1.25, 1.45, 1.6]),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as MarqueeParams
      const text = cut.text
      const lb = env.ltb
      const size = Math.min(
        fitSize(text, P.font, W * 0.84, H * 0.3, { sx: P.sx, track: 0.05 }),
        H * 0.3,
      )
      const bs = size * 0.42
      const unit = text + '　'
      const period =
        measure({ text: unit, font: P.font, size: bs, sx: P.sx, track: 0.05 }).w + bs * 0.05
      const reps = Math.ceil((W * 2.4) / period) + 1
      const ys = P.rows === 2 ? [-1, 1] : [-2, -1, 1, 2]
      ys.forEach((k, ri) => {
        const y =
          H / 2 +
          Math.sign(k) * (size * 0.5 + bs * 0.95) +
          (Math.abs(k) - 1) * Math.sign(k) * bs * 1.25
        const a = clamp((lb - Math.abs(k) * 0.05) / 0.12)
        if (a <= 0) return
        const dir = ri % 2 ? 1 : -1
        const off =
          ((((lb * P.speed * W * 0.22 * dir + ri * period * 0.37) % period) + period) % period) -
          period / 2
        const row: TextItem = {
          text: unit.repeat(reps),
          font: P.font,
          size: bs,
          sx: P.sx,
          track: 0.05,
          x: W / 2 + off,
          y,
          ghost: false,
          alpha: a,
        }
        if (P.rowStyle === 'outline') {
          row.fill = false
          row.stroke = Math.max(1.2, bs * 0.02)
          row.strokeColor = sc.fg
          row.alpha = a * 0.9
        } else if (P.rowStyle === 'dim') {
          row.color = sc.sub
          row.alpha = a * 0.35
        } else {
          env.rect(-10, y - bs * 0.62, W + 20, bs * 1.24, sc.ink, a, false)
          row.color = sc.bg
        }
        env.draw(row)
      })
      return mainDraw(env, {
        text,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2,
        sx: P.sx,
        track: 0.05,
        color: sc.fg,
      })
    },
  },

  /* 满屏滚动小字打底，主文字用描边或色块"敲"出来 */
  tile: {
    fits: (n) => n <= 12,
    plan: (rng, _cut, st): TileParams => ({
      unit: rng.pick(['chunk', 'line', 'chunk']),
      knock: rng.pick(['stroke', 'box']),
      flicker: rng.chance(0.6),
      font: rng.pick(fontsOf(st, ['display'])),
      tileFont: rng.pick(fontsOf(st, ['serif', 'body', 'display'])),
      rowsN: rng.pick([12, 14, 16, 18]),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as TileParams
      const text = cut.text
      const lb = env.ltb
      const unitText = (P.unit === 'line' ? cut.lineText : text) + '　'
      const rowH = H / P.rowsN
      const ts = rowH * 0.72
      const period = measure({ text: unitText, font: P.tileFont, size: ts, track: 0.02 }).w
      const reps = Math.ceil((W * 1.6) / period) + 2
      for (let ri = 0; ri <= P.rowsN; ri++) {
        const ap = r(cut.seed, ri, 91) * cut.inDur * 1.6
        if (lb < ap) continue
        if (P.flicker && r(cut.seed, env.step, ri, 92) < 0.16) continue
        const dir = ri % 2 ? 1 : -1
        const off = ((((ri % 2) * period * 0.5 + lb * 26 * dir) % period) + period) % period
        env.draw({
          text: unitText.repeat(reps),
          font: P.tileFont,
          size: ts,
          track: 0.02,
          align: 'left',
          x: -period + off - period * 0.5,
          y: (ri + 0.5) * rowH,
          color: sc.sub,
          alpha: 0.42 * clamp((lb - ap) / 0.1),
          ghost: false,
        })
      }
      const mt = W < H ? splitLines(text, 5) : text
      const size = Math.min(
        fitSize(mt, P.font, W * 0.8, H * 0.34, { track: 0.04, lead: 1.15 }),
        H * 0.3,
      )
      const it: TextItem = {
        text: mt,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2,
        track: 0.04,
        lead: 1.15,
        color: sc.fg,
      }
      if (P.knock === 'box') {
        // 色块遮住底纹；宽度随入场缓动从中心撑开
        const m = measure(it)
        const e = E.outExpo(env.pIn * 1.4)
        env.rect(
          W / 2 - (m.w / 2 + size * 0.35) * e,
          H / 2 - m.h / 2 - size * 0.28,
          (m.w + size * 0.7) * e,
          m.h + size * 0.56,
          sc.bg,
          1,
          false,
        )
      } else {
        mainDraw(env, { ...it, fill: false, stroke: size * 0.16, strokeColor: sc.bg, ghost: false })
      }
      return mainDraw(env, it)
    },
  },

  /* 逐字散点排布 + 可选整句小字配页 */
  scatter: {
    fits: (n) => n >= 2 && n <= 14,
    plan: (rng, _cut, st): ScatterParams => ({
      font: rng.pick(fontsOf(st, ['display'])),
      fontB: rng.pick(fontsOf(st, ['serif', 'display'])),
      extras: rng.chance(0.65),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as ScatterParams
      const s = cut.seed
      const chars = [...cut.text.replace(/\s+/g, '')]
      const n = chars.length
      if (P.extras) {
        for (let k = 0; k < 9; k++) {
          const ap = r(s, k, 81) * cut.dur * 0.5
          if (env.ltb < ap) continue
          const top = r(s, k, 82) < 0.5
          env.draw({
            text: cut.text,
            font: env.st.fonts.body[0],
            size: rr(H * 0.022, H * 0.045, s, k, 83),
            x: rr(W * 0.08, W * 0.92, s, k, 84),
            y: top ? rr(H * 0.08, H * 0.26, s, k, 85) : rr(H * 0.74, H * 0.92, s, k, 85),
            rot: rs(s, k, 86) * 18,
            color: sc.sub,
            alpha: 0.75,
            ghost: false,
          })
        }
      }
      const base = Math.min(H * 0.3, ((W * 0.9) / n) * 1.15)
      let bb: BBox | null = null
      chars.forEach((ch, i) => {
        const x = W * (0.1 + (0.8 * (i + 0.5)) / n) + rs(s, i, 71) * W * 0.035
        const y = H / 2 + rs(s, i, 72) * H * 0.18
        const k = 0.62 + r(s, i, 73) * 0.85 * (charCls(ch) === 'full' ? 1 : 0.7)
        bb = unionBB(
          bb,
          mainDraw(env, {
            text: ch,
            font: i % 3 === 1 ? P.fontB : P.font,
            size: base * k,
            x,
            y,
            rot: rs(s, i, 74) * 24,
            color: r(s, i, 75) < 0.15 ? sc.accent : sc.fg,
            mi: i,
          }),
        )
      })
      return bb
    },
  },

  /* 字沿圆环排布并旋转，圆心可选放整句 */
  ring: {
    fits: (n) => n >= 2 && n <= 16,
    plan: (rng, _cut, st): RingParams => ({
      orient: rng.pick(['tangent', 'tangent', 'upright']),
      center: rng.pick(['word', 'disc', 'word', 'none']),
      speed: rng.range(4, 12) * rng.pick([1, -1]),
      R: rng.range(0.28, 0.35),
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      fontC: rng.pick(fontsOf(st, ['display', 'serif'])),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as RingParams
      const text = cut.text.replace(/\s+/g, '')
      const R = Math.min(H * P.R, W * 0.4)
      const cx = W / 2
      const cy = H / 2
      const lb = env.ltb
      const n = glyphCount(text)
      const unit = [...`${text}・`]
      const sizeRing = Math.min(H * 0.07, (TAU * R) / ((n + 1) * 1.25))
      const cnt = Math.max(unit.length, Math.min(44, Math.floor((TAU * R) / (sizeRing * 1.2))))
      env.circle(cx, cy, R * 0.86, null, sc.sub, 1.2, 0.55, false)
      env.circle(cx, cy, R * 1.15, null, sc.sub, 1.2, 0.35, false)
      let bb: BBox | null = null
      if (P.center === 'disc') {
        const e = E.outBack(clamp(env.lt / (cut.inDur * 0.9)), 1.6) * (1 - E.inCubic(env.pOut))
        env.circle(cx, cy, R * 0.72 * e, sc.accent, null, 0, 1, true)
        const size = fitSize(text, P.fontC, R * 1.15, R * 0.8)
        bb = mainDraw(env, {
          text,
          font: P.fontC,
          size: Math.min(size, H * 0.2),
          x: cx,
          y: cy,
          color: sc.bg,
          mi: 0,
        })
      } else if (P.center === 'word') {
        const size = fitSize(text, P.fontC, R * 1.3, R * 0.85)
        bb = mainDraw(env, {
          text,
          font: P.fontC,
          size: Math.min(size, H * 0.22),
          x: cx,
          y: cy,
          color: sc.fg,
          mi: 0,
        })
      }
      for (let i = 0; i < cnt; i++) {
        const ch = unit[i % unit.length]
        const ang = (i / cnt) * 360 + lb * P.speed - 90
        const rad = ang * DEG
        const b = mainDraw(env, {
          text: ch,
          font: P.font,
          size: sizeRing,
          x: cx + Math.cos(rad) * R,
          y: cy + Math.sin(rad) * R,
          rot: P.orient === 'tangent' ? ang + 90 : 0,
          color: ch === '・' ? sc.accent : sc.fg,
          mi: i * 0.25,
          noHold: true,
        })
        if (!bb) bb = unionBB(bb, b)
      }
      return bb || { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R, cx, cy, boxes: [] }
    },
  },

  /* 整句沿正弦曲线横移，后面拖一串淡出副本 */
  wave: {
    fits: (n) => n >= 2 && n <= 16,
    plan: (rng, _cut, st): WaveParams => ({
      amp: rng.range(0.08, 0.17),
      freq: rng.range(0.8, 1.6),
      trail: rng.pick([5, 7, 9]),
      font: rng.pick(fontsOf(st, ['display'])),
      travel: rng.range(0.25, 0.5) * rng.pick([1, -1]),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as WaveParams
      const chars = [...cut.text.replace(/\s+/g, '')]
      const n = chars.length
      const size = Math.min(H * 0.2, (W * 0.72) / n)
      const du = (size * 1.05) / W
      const lb = env.ltb
      const u0 = 0.5 - (env.lt / cut.dur - 0.5) * P.travel
      const path = (u: number): [number, number] => [
        W * u,
        H / 2 + H * P.amp * Math.sin(TAU * P.freq * u + lb * 1.3),
      ]
      const angAt = (u: number): number => {
        const a = path(u - 0.002)
        const b = path(u + 0.002)
        return Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG
      }
      let bb: BBox | null = null
      for (let k = P.trail; k >= 1; k--) {
        chars.forEach((ch, i) => {
          const u = u0 + (i - (n - 1) / 2) * du + k * du * 0.2 * Math.sign(P.travel)
          const [x, y] = path(u)
          env.draw({
            text: ch,
            font: P.font,
            size: size * (1 - k * 0.035),
            x,
            y,
            rot: angAt(u),
            color: sc.sub,
            alpha: 0.5 * (1 - k / (P.trail + 1)) * E.outCubic(env.pIn),
            ghost: false,
          })
        })
      }
      chars.forEach((ch, i) => {
        const u = u0 + (i - (n - 1) / 2) * du
        const [x, y] = path(u)
        bb = unionBB(
          bb,
          mainDraw(env, {
            text: ch,
            font: P.font,
            size,
            x,
            y,
            rot: angAt(u),
            color: sc.fg,
            mi: i * 0.5,
          }),
        )
      })
      return bb
    },
  },

  /* 单句撑满画面，配左下角标签 */
  huge: {
    fits: (n) => n <= 8,
    plan: (rng, _cut, st): HugeParams => ({
      font: rng.pick(fontsOf(st, ['display'])),
      grad: !!st.useGrad && rng.chance(0.75),
      dir: rng.pick([1, -1]),
      label: rng.chance(0.8),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as HugeParams
      const text0 = cut.text.replace(/\s+/g, '')
      const n = glyphCount(text0)
      const text = n >= 5 ? splitLines(text0, Math.ceil(n / 2)) : text0
      const lines = text.split('\n').length
      const size =
        lines > 1
          ? Math.min(H * 0.56, (W * 1.2) / (Math.ceil(n / 2) * 0.98))
          : Math.min(H * 0.98, (W * 1.3) / (n * 0.96))
      const u = env.lt / cut.dur
      const bb = mainDraw(env, {
        text,
        font: P.font,
        size,
        x: W / 2 + (0.5 - u) * W * 0.16 * P.dir,
        y: H / 2 + H * 0.02,
        lead: 0.98,
        track: -0.02,
        color: sc.fg,
        gradient: P.grad && sc.grad ? sc.grad : undefined,
      })
      if (P.label) {
        const ls = clamp(H * 0.028, 16, 30)
        const a = E.outCubic(clamp((env.lt - cut.inDur * 0.5) / 0.2)) * (1 - env.pOut)
        const lw = measure({ text: cut.text, font: env.st.fonts.body[0], size: ls, track: 0.12 }).w
        env.rect(W * 0.05, H * 0.86 - ls, lw + ls * 1.4, ls * 2, sc.ink, a, false)
        env.draw({
          text: cut.text,
          font: env.st.fonts.body[0],
          size: ls,
          track: 0.12,
          align: 'left',
          x: W * 0.05 + ls * 0.7,
          y: H * 0.86,
          color: sc.bg,
          alpha: a,
          ghost: false,
        })
      }
      return bb
    },
  },

  /* 把词块贴成一枚枚小标签（径向 / 堆叠 / 散落） */
  labels: {
    fits: (n) => n >= 1 && n <= 16,
    plan: (rng, cut, st): LabelsParams => ({
      variant: rng.pick(['radial', 'rows', 'scatter']),
      unit: cut.n <= 6 ? 'char' : rng.pick(['char', 'word']),
      center: rng.pick(['orb', 'word', 'none']),
      font: rng.pick(fontsOf(st, ['display', 'body'])),
      fontC: rng.pick(fontsOf(st, ['display'])),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as LabelsParams
      const s = cut.seed
      const lb = env.ltb
      const text = cut.text.replace(/\s+/g, '')
      let units =
        P.unit === 'char'
          ? [...text].filter((c) => !isPunct(c))
          : cut.words.length
            ? cut.words
            : [text]
      if (!units.length) units = [text]
      const out = 1 - E.inCubic(env.pOut)
      const drawLabel = (
        u: string,
        x: number,
        y: number,
        rot: number,
        fs: number,
        q: number,
      ): void => {
        if (q <= 0) return
        const w = measure({ text: u, font: P.font, size: fs, track: 0.04 }).w + fs * 0.7
        const h = fs * 1.36
        const ctx = env.ctx
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot * DEG)
        ctx.scale(q, q)
        env.rect(-w / 2, -h / 2, w, h, sc.ink, 1)
        env.draw({
          text: u,
          font: P.font,
          size: fs,
          track: 0.04,
          x: 0,
          y: 0,
          color: sc.bg,
          ghost: false,
        })
        ctx.restore()
      }
      let bb: BBox | null = null
      if (P.variant === 'radial') {
        const m = Math.max(units.length, 10)
        const R = Math.min(H * 0.3, W * 0.36)
        const fs = Math.min(H * 0.062, W * 0.052)
        if (P.center === 'orb') {
          const e = E.outBack(clamp(env.lt / 0.35), 1.4) * out
          env.circle(W / 2, H / 2, R * 0.52 * e, sc.accent, null, 0, 1, true)
        }
        for (let i = 0; i < m; i++) {
          const ang = (i / m) * 360 + lb * 7 - 90
          const q = E.outBack(clamp((env.lt - i * 0.025) / 0.22), 2) * out
          drawLabel(
            units[i % units.length],
            W / 2 + Math.cos(ang * DEG) * R,
            H / 2 + Math.sin(ang * DEG) * R,
            ang,
            fs,
            q,
          )
        }
        if (P.center === 'word') {
          bb = mainDraw(env, {
            text,
            font: P.fontC,
            size: Math.min(fitSize(text, P.fontC, R * 1.1, R * 0.7), H * 0.18),
            x: W / 2,
            y: H / 2,
            color: sc.fg,
          })
        }
        return (
          bb || {
            x0: W / 2 - R,
            x1: W / 2 + R,
            y0: H / 2 - R,
            y1: H / 2 + R,
            cx: W / 2,
            cy: H / 2,
            boxes: [],
          }
        )
      }
      if (P.variant === 'rows') {
        const k = units.length
        const fs = Math.min(H * 0.1, (H * 0.7) / (k * 1.5))
        units.forEach((u, i) => {
          const q = E.outBack(clamp((env.lt - i * 0.05) / 0.22), 2) * out
          drawLabel(
            u,
            W / 2 + rs(s, i, 5) * W * 0.12,
            H / 2 + (i - (k - 1) / 2) * fs * 1.55,
            rs(s, i, 6) * 4,
            fs,
            q,
          )
        })
        return {
          x0: W * 0.3,
          x1: W * 0.7,
          y0: H / 2 - k * fs * 0.8,
          y1: H / 2 + k * fs * 0.8,
          cx: W / 2,
          cy: H / 2,
          boxes: [],
        }
      }
      const fs = H * 0.085
      units.forEach((u, i) => {
        const q = E.outBack(clamp((env.lt - i * 0.05) / 0.22), 2) * out
        drawLabel(
          u,
          W * (0.15 + 0.7 * ((i + 0.5) / units.length)) + rs(s, i, 7) * W * 0.04,
          H / 2 + rs(s, i, 8) * H * 0.25,
          rs(s, i, 9) * 22,
          fs * (0.8 + r(s, i, 10) * 0.5),
          q,
        )
      })
      return {
        x0: W * 0.15,
        x1: W * 0.85,
        y0: H * 0.3,
        y1: H * 0.7,
        cx: W / 2,
        cy: H / 2,
        boxes: [],
      }
    },
  },

  /* 横向压扁、纵向拉伸，重复几次形成回声柱 */
  condensed: {
    fits: (n) => n <= 10,
    plan: (rng, cut, st): CondensedParams => {
      const n = cut.n
      return {
        count: n <= 4 ? rng.pick([3, 2, 1]) : n <= 7 ? rng.pick([2, 1]) : 1,
        sx: rng.range(0.42, 0.58),
        sy: rng.range(1.1, 1.3),
        font: rng.pick(fontsOf(st, ['display', 'body'])),
      }
    },
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as CondensedParams
      const text = cut.text.replace(/\s+/g, '')
      const slot = (W * 0.92) / P.count
      const size = Math.min(
        fitSize(text, P.font, slot * 0.94, H * 0.8, { sx: P.sx, sy: P.sy, track: 0.04 }),
        H * 0.62,
      )
      let bb: BBox | null = null
      // 中间那列先出、两侧后出
      const order = [1, 0, 2, 3]
      for (let i = 0; i < P.count; i++) {
        bb = unionBB(
          bb,
          mainDraw(env, {
            text,
            font: P.font,
            size,
            sx: P.sx,
            sy: P.sy,
            track: 0.04,
            x: W / 2 + (i - (P.count - 1) / 2) * slot,
            y: H / 2,
            color: sc.fg,
            mi: P.count > 1 ? order[i] * 2 : 0,
          }),
        )
      }
      return bb
    },
  },

  /* 主文字偏置一侧，另一侧牵一条注释引线（无拼音引擎，注释用歌词自带的 `|` 备注） */
  gloss: {
    fits: (n) => n <= 12,
    plan: (rng, _cut, st): GlossParams => ({
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      side: rng.pick(['right', 'left']),
      bgText: rng.chance(0.6),
      vertNote: rng.chance(0.45),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as GlossParams
      const text = cut.text
      const lb = env.ltb
      if (P.bgText) {
        for (let ri = 0; ri < 3; ri++) {
          const bs = H * 0.3
          env.draw({
            text: text.replace(/\s+/g, '').repeat(6),
            font: P.font,
            size: bs,
            x: W / 2 + ((lb * 20 * (ri % 2 ? 1 : -1)) % (bs * 2)),
            y: H * (0.18 + ri * 0.32),
            color: sc.dim,
            alpha: 1,
            ghost: false,
          })
        }
      }
      const right = P.side === 'right'
      const size = Math.min(fitSize(text, P.font, W * 0.5, H * 0.3, { track: 0.03 }), H * 0.24)
      const bb = mainDraw(env, {
        text,
        font: P.font,
        size,
        x: right ? W * 0.4 : W * 0.6,
        y: H * 0.54,
        track: 0.03,
        color: sc.fg,
      })
      if (!bb) return bb
      const e = E.outExpo(clamp((env.lt - cut.inDur * 0.4) / 0.45)) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return bb
      const ax = right ? bb.x1 + size * 0.1 : bb.x0 - size * 0.1
      const ay = bb.y0 + size * 0.2
      const nx = right ? Math.min(W * 0.9, bb.x1 + W * 0.1) : Math.max(W * 0.1, bb.x0 - W * 0.1)
      const ny = Math.max(H * 0.12, bb.y0 - H * 0.12)
      const mx = lerp(ax, nx, 0.45)
      env.polyPartial(
        [
          [ax, ay],
          [mx, ay],
          [nx, ny],
        ],
        e,
        sc.sub,
        1.3,
        1,
        false,
      )
      env.circle(ax, ay, 4, sc.accent, null, 0, e, false)
      const note = cut.note || cut.lineText
      const ns = clamp(H * 0.024, 14, 26)
      const body = env.st.fonts.body[0]
      const serif = env.st.fonts.serif[0]
      const al = right ? 'left' : 'right'
      env.draw({
        text: `【${text.replace(/\s+/g, '')}】`,
        font: serif,
        size: ns * 1.2,
        align: al,
        x: nx,
        y: ny - ns * 1.2,
        color: sc.fg,
        alpha: e,
        ghost: false,
      })
      if (P.vertNote) {
        env.draw({
          text: cut.lineText,
          font: serif,
          size: ns,
          vertical: true,
          align: 'left',
          x: nx + (right ? ns : -ns),
          y: ny + ns * 0.8,
          color: sc.sub,
          alpha: e,
          ghost: false,
        })
      } else {
        env.draw({
          text: note,
          font: body,
          size: ns,
          align: al,
          x: nx,
          y: ny + ns * 0.4,
          track: 0.08,
          color: sc.sub,
          alpha: e,
          ghost: false,
        })
      }
      env.draw({
        text: `No.${String((cut.line | 0) + 1).padStart(2, '0')}`,
        font: env.st.fonts.mono[0] || 'mono',
        size: ns * 0.8,
        align: al,
        x: nx,
        y: ny + ns * 2,
        color: sc.accent,
        alpha: e,
        ghost: false,
      })
      return bb
    },
  },

  /* 终端风：等宽小字逐字打出，配行号与时间码 */
  type: {
    fits: (n) => n <= 28,
    plan: (rng, _cut, st): TypeParams => ({
      font: rng.pick(fontsOf(st, ['body', 'serif', 'mono'])),
      align: rng.pick(['left', 'center']),
      prompt: rng.chance(0.6),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as TypeParams
      const text = splitLines(cut.text, 14)
      const size = Math.min(
        H * 0.11,
        fitSize(text, P.font, W * 0.74, H * 0.36, { track: 0.06, lead: 1.35 }),
      )
      const left = P.align === 'left'
      const x = left ? W * 0.13 : W / 2
      if (P.prompt) {
        env.draw({
          text: '>',
          font: env.st.fonts.mono[0] || 'mono',
          size: size * 0.8,
          x: (left ? x : x - measure({ text, font: P.font, size, track: 0.06 }).w / 2) - size * 0.9,
          y: H / 2 - (text.split('\n').length - 1) * size * 0.67,
          color: sc.accent,
          ghost: false,
        })
      }
      const it: ItemWithAnim = {
        text,
        font: P.font,
        size,
        x,
        y: H / 2,
        align: left ? 'left' : 'center',
        track: 0.06,
        lead: 1.35,
        color: sc.fg,
        // 这一版式默认就是打字机，除非用户锁了硬切
        enter: cut.enter === 'cut' ? 'type' : undefined,
      }
      const bb = mainDraw(env, it)
      const ms = clamp(H * 0.02, 12, 20)
      env.draw({
        text: `LINE ${String((cut.line | 0) + 1).padStart(2, '0')} ─ ${fmtTime(env.t)}`,
        font: env.st.fonts.mono[0] || 'mono',
        size: ms,
        align: 'left',
        x: W * 0.13,
        y: H * 0.8,
        color: sc.sub,
        alpha: 0.8,
        ghost: false,
      })
      return bb
    },
  },

  /* 一条倾斜色带横穿画面，文字压在带上 */
  diag: {
    fits: (n) => n <= 14,
    plan: (rng, _cut, st): DiagParams => ({
      ang: rng.range(10, 22) * rng.pick([1, -1]),
      band: rng.pick(['accent', 'ink']),
      second: rng.chance(0.7),
      font: rng.pick(fontsOf(st, ['display'])),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as DiagParams
      const text = cut.text
      const lb = env.ltb
      const ctx = env.ctx
      const bandCol = P.band === 'accent' ? sc.accent : sc.ink
      // 带上文字要与会切换的配色保持可读
      const txtCol =
        lum(bandCol) > 0.5
          ? lum(sc.bg) < 0.5
            ? sc.bg
            : '#111111'
          : lum(sc.fg) > 0.5
            ? sc.fg
            : '#FFFFFF'
      const size = Math.min(fitSize(text, P.font, W * 0.72, H * 0.24, { track: 0.05 }), H * 0.2)
      const bh = size * 1.6
      const e = E.outExpo(clamp(env.lt / (cut.inDur * 0.8))) * (1 - E.inExpo(env.pOut))
      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.rotate(-P.ang * DEG)
      env.rect(-W * 1.2, (-bh / 2) * e, W * 2.4, bh * e, bandCol, 1)
      if (P.second) {
        const y2 = bh * 0.95
        const h2 = bh * 0.32
        env.rect(-W * 1.2, y2 - h2 / 2, W * 2.4 * e, h2, sc.fg, 0.9, false)
        const unit = cut.lineText + '　／　'
        const period = measure({
          text: unit,
          font: env.st.fonts.body[0],
          size: h2 * 0.55,
          track: 0.1,
        }).w
        env.draw({
          text: unit.repeat(Math.ceil((W * 3) / period)),
          font: env.st.fonts.body[0],
          size: h2 * 0.55,
          track: 0.1,
          x: -((lb * 120) % period),
          y: y2,
          color: sc.bg,
          ghost: false,
          alpha: e,
        })
      }
      ctx.restore()
      return mainDraw(env, {
        text,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2,
        rot: -P.ang,
        track: 0.05,
        color: txtCol,
      })
    },
  },

  /* 圆形窗口：实心圆盘 / 月食遮罩 / 描边圆环 */
  circle: {
    fits: (n) => n <= 10,
    plan: (rng, cut, st): CircleParams => ({
      variant: rng.pick(['disc', 'eclipse', 'ring']),
      vertical: cut.n <= 4 && rng.chance(0.5),
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      off: rng.range(-0.12, 0.12),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as CircleParams
      const text = cut.text.replace(/\s+/g, '')
      const ctx = env.ctx
      const cx = W / 2 + P.off * W
      const cy = H / 2
      const out = 1 - E.inCubic(env.pOut)
      if (P.variant === 'eclipse') {
        const size = Math.min(fitSize(text, P.font, W * 0.82, H * 0.46, { track: 0.02 }), H * 0.36)
        const bb = mainDraw(env, {
          text: splitLines(text, 6),
          font: P.font,
          size,
          x: W / 2,
          y: H / 2,
          lead: 1.05,
          color: sc.fg,
        })
        const R = H * 0.19
        const u = env.lt / cut.dur
        const ex = W / 2 + lerp(-0.08, 0.08, u) * W
        const ey = H / 2 + H * 0.12
        // 只在主层画遮罩圆，色散三 pass 会把它糊成一团
        if (env.pass === 'main') {
          ctx.save()
          ctx.shadowColor = rgba(sc.fg, 0.9)
          ctx.shadowBlur = 38 * env.scale
          env.circle(ex, ey, R * 1.01 * out, null, sc.fg, 3, 0.9, false)
          ctx.restore()
          env.circle(ex, ey, R * out, mix(sc.bg, '#000000', 0.35), null, 0, 1, false)
        }
        return bb
      }
      const R = Math.min(H * 0.3, W * 0.4)
      const e = E.outBack(clamp(env.lt / (cut.inDur * 0.9)), 1.5) * out
      if (P.variant === 'disc') env.circle(cx, cy, R * e, sc.accent, null, 0, 1, true)
      else
        env.arc(
          cx,
          cy,
          R,
          -90,
          -90 + 360 * E.outExpo(clamp(env.lt / (cut.inDur * 1.3))) * out,
          sc.fg,
          3,
          1,
        )
      const size = P.vertical
        ? Math.min(fitSize(text, P.font, R * 1.1, R * 1.35, { vertical: true }), R * 0.9)
        : Math.min(fitSize(text, P.font, R * 1.45, R * 0.9), R * 0.8)
      return mainDraw(env, {
        text,
        font: P.font,
        size,
        x: cx,
        y: cy,
        vertical: P.vertical,
        color: P.variant === 'disc' ? sc.bg : sc.fg,
      })
    },
  },

  /* 同句纵向叠成几层，逐层淡出或只留描边 */
  stack: {
    fits: (n) => n <= 12,
    plan: (rng, _cut, st): StackParams => ({
      copies: rng.pick([3, 4, 5]),
      dir: rng.pick([1, -1]),
      style: rng.pick(['fade', 'outline', 'fade']),
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      gap: rng.range(0.82, 1.02),
      xs: rng.range(-0.04, 0.04),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as StackParams
      const text = cut.text
      const size = Math.min(fitSize(text, P.font, W * 0.8, H * 0.22, { track: 0.03 }), H * 0.19)
      const step = size * P.gap
      const n = P.copies
      const y0 = H / 2 - (P.dir * (n - 1) * step) / 2
      let bb: BBox | null = null
      for (let k = n - 1; k >= 0; k--) {
        const it: TextItem = {
          text,
          font: P.font,
          size,
          x: W / 2 + P.xs * W * k,
          y: y0 + P.dir * k * step,
          track: 0.03,
          color: sc.fg,
          mi: k * 1.2,
        }
        if (k > 0) {
          if (P.style === 'outline') {
            it.fill = false
            it.stroke = Math.max(1.2, size * 0.014)
            it.alpha = 0.85
          } else {
            it.alpha = 0.6 * 0.58 ** (k - 1)
          }
        }
        const r0 = mainDraw(env, it)
        if (k === 0) bb = r0
      }
      return bb
    },
  },

  /* 文字压在胶囊色块上，色块从中心横向撑开 */
  pill: {
    fits: (n) => n <= 14,
    plan: (rng, _cut, st): PillParams => ({
      grad: !!st.useGrad || rng.chance(0.35),
      font: rng.pick(fontsOf(st, ['display', 'body'])),
      smalls: rng.chance(0.75),
    }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as PillParams
      const text = cut.text
      const ctx = env.ctx
      const size = Math.min(fitSize(text, P.font, W * 0.62, H * 0.2, { track: 0.04 }), H * 0.17)
      const w = measure({ text, font: P.font, size, track: 0.04 }).w + size * 1.3
      const h = size * 1.6
      const e = E.outExpo(clamp(env.lt / (cut.inDur * 0.9))) * (1 - E.inExpo(env.pOut))
      const fillC: readonly [string, string] = P.grad && sc.grad ? sc.grad : [sc.accent, sc.accent]
      const ww = Math.max(h, w * e)
      if (env.pass === 'main') {
        const g = ctx.createLinearGradient(W / 2 - ww / 2, 0, W / 2 + ww / 2, 0)
        g.addColorStop(0, fillC[0])
        g.addColorStop(1, fillC[1])
        env.rrect(W / 2 - ww / 2, H / 2 - h / 2, ww, h, h / 2, g, 1, true)
      } else {
        env.rrect(W / 2 - ww / 2, H / 2 - h / 2, ww, h, h / 2, sc.accent, 1, true)
      }
      const tc = lum(fillC[0]) > 0.55 ? '#111111' : '#FFFFFF'
      ctx.save()
      ctx.beginPath()
      ctx.rect(W / 2 - ww / 2, 0, ww, H)
      ctx.clip()
      const bb = mainDraw(env, {
        text,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2,
        track: 0.04,
        color: tc,
      })
      ctx.restore()
      if (P.smalls) {
        const labs = [
          cut.note || cut.lineText,
          `No.${String((cut.line | 0) + 1).padStart(2, '0')}`,
          fmtTime(cut.start),
        ]
        const fs = clamp(H * 0.022, 13, 24)
        labs.forEach((l, i) => {
          const q = E.outBack(clamp((env.lt - 0.15 - i * 0.06) / 0.25), 2) * (1 - env.pOut)
          if (q <= 0) return
          const mw = measure({ text: l, font: env.st.fonts.body[0], size: fs, track: 0.1 }).w
          const px = W / 2 + (i === 0 ? -w * 0.3 : i === 1 ? w * 0.42 : w * 0.1)
          const py = H / 2 + (i === 1 ? -h * 0.95 : h * 0.95)
          env.rrect(
            px - (mw / 2 + fs * 0.8) * q,
            py - fs * 0.85,
            (mw + fs * 1.6) * q,
            fs * 1.7,
            fs * 0.85,
            null,
            1,
            false,
            sc.fg,
            1.3,
          )
          env.draw({
            text: l,
            font: env.st.fonts.body[0],
            size: fs,
            track: 0.1,
            x: px,
            y: py,
            color: sc.fg,
            alpha: q,
            ghost: false,
          })
        })
      }
      return bb
    },
  },

  /* 特例：片头标题卡 */
  title: {
    special: true,
    fits: () => false,
    plan: (rng, _cut, st): TitleParams => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])) }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as TitleParams
      const size = Math.min(fitSize(cut.text, P.font, W * 0.7, H * 0.2, { track: 0.08 }), H * 0.16)
      const bb = mainDraw(env, {
        text: cut.text,
        font: P.font,
        size,
        x: W / 2,
        y: H / 2,
        track: 0.08,
        color: sc.fg,
      })
      if (cut.note) {
        env.draw({
          text: cut.note,
          font: env.st.fonts.body[0],
          size: clamp(H * 0.03, 16, 32),
          x: W / 2,
          y: H / 2 + size * 0.95,
          track: 0.3,
          color: sc.sub,
          alpha: E.outCubic(clamp((env.lt - 0.3) / 0.4)) * (1 - env.pOut),
          ghost: false,
        })
      }
      return bb
    },
  },

  /* 特例：间奏填空（倒计时或呼吸圆环） */
  interlude: {
    special: true,
    fits: () => false,
    plan: (rng): InterludeParams => ({ variant: rng.pick(['counter', 'rings']) }),
    render(env) {
      const { W, H, sc } = env
      const cut = cutOf(env)
      const P = cut.params as unknown as InterludeParams
      const lb = env.ltb
      const fs = clamp(H * 0.022, 12, 22)
      if (P.variant === 'counter') {
        const remain = Math.max(0, cut.dur - env.lt)
        env.draw({
          text: remain.toFixed(1),
          font: env.st.fonts.display[0],
          size: H * 0.36,
          x: W / 2,
          y: H / 2,
          color: sc.fg,
          alpha: 0.9,
        })
      }
      for (let k = 0; k < 3; k++) {
        env.circle(
          W / 2,
          H / 2,
          H * (0.2 + k * 0.1) * (1 + 0.04 * Math.sin(lb * 2 + k)),
          null,
          sc.sub,
          1.2,
          0.5,
          false,
        )
      }
      env.draw({
        text: cut.text || '— interlude —',
        font: env.st.fonts.body[0],
        size: fs,
        x: W / 2,
        y: H * 0.82,
        track: 0.4,
        color: sc.sub,
        ghost: false,
      })
      return {
        x0: W * 0.35,
        x1: W * 0.65,
        y0: H * 0.3,
        y1: H * 0.7,
        cx: W / 2,
        cy: H / 2,
        boxes: [],
      }
    },
  },
}

/** 随机挑选顺序（special 版式由 planner 单独安排，不在表内） */
export const LAYOUT_ORDER = [
  'center',
  'mixed',
  'vcols',
  'marquee',
  'tile',
  'scatter',
  'ring',
  'wave',
  'huge',
  'labels',
  'condensed',
  'gloss',
  'type',
  'diag',
  'circle',
  'stack',
  'pill',
]
