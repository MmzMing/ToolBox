/**
 * 部件包 typo（1/3）：文字PV 构图——关键字、交叉、罫线、网格、级数对比、裁切与批注。
 *
 * 源自 JIZURA 的 src/11p_typo1.js（MIT）：数值常量、缓动曲线、hash 种子、坐标、时长保持一致，
 * 同一组参数渲出同一支视频。key 与注册顺序由 registry 锁定，不要改名、不要增删；
 * 集合归属（set）由 engine/sets.ts 按包名写入，这里不手写。
 */
import type { PackParts, StylePack, Cut, Env, Scheme, TextItem, BBox, LaidGlyph } from '../types'
import { E, clamp, lerp, mix, lum, contrast, fmtTime } from '../util'
import { isHan, isKana, isPunct, glyphCount } from '../script'
import { segments, splitLines, layoutText, measure, fitSize } from '../text-layout'
import { mainDraw, unionBB, fontsOf as styleFonts } from '../layouts'
import { layoutsOf } from '../define'

const out: PackParts = {}
const reg = layoutsOf(out)

/** 假名罗马字副读：本工具面向中文，没有假名层，结果恒为 null（判空分支保留，几何与随机数消耗不变） */
const romajiOf = (_c: string): string | null => null

/** 版式/装饰只在画 cut 时被调用，此时 env.cut 必定存在 */
const cutOf = (env: Env): Cut => env.cut as Cut

/* ------------------------------------------------------------------ helpers */
const clean = (t: string) => String(t || '').replace(/\s+/g, '')
/* glyph slots keeping single word gaps (latin lyrics) */
const slotsOf = (t: string) => [
  ...String(t || '')
    .trim()
    .replace(/[\s\u3000]+/g, ' '),
]
const isSp = (c: string) => c === ' ' || c === '　'
const fontsOf = (st: StylePack, roles: readonly string[]) => styleFonts(st, roles)
const monoF = (env: Env) => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono'
const bodyF = (env: Env) => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med'
const outK = (env: Env) => 1 - E.inCubic(env.pOut)
const pad2 = (n: number) => String(n).padStart(2, '0')
const hair = (env: Env) => Math.max(1, Math.min(env.W, env.H) * 0.0014)
const bbRect = (x0: number, y0: number, x1: number, y1: number) => ({
  x0,
  y0,
  x1,
  y1,
  cx: (x0 + x1) / 2,
  cy: (y0 + y1) / 2,
  boxes: [],
})
const U = unionBB
const romaOf = (t: string) => {
  const c = clean(t)
  if (!/[ぁ-ヿ]/.test(c)) return null
  const r = romajiOf(c)
  return r ? r.toUpperCase() : null
}
/* splitLines, but never leave a line of punctuation only */
const splitL = (t: string, per: number) => {
  const ls = splitLines(t, Math.max(1, per)).split('\n')
  const out: string[] = []
  for (const l of ls) {
    if (out.length && [...l].every((c) => isPunct(c) || c === ' ')) out[out.length - 1] += l
    else out.push(l)
  }
  return out.join('\n')
}
/* main-text lines for a width budget: portrait → short lines */
const mainLines = (text: string, W: number, H: number, perL = 11, perP = 5) => {
  const t = String(text || '').trim(),
    n = glyphCount(t)
  const per = W < H ? perP : perL
  if (n <= per) return t
  return splitL(t, Math.ceil(n / Math.ceil(n / per)))
}
/* glyph centres of a laid-out text item (design space, before rotation) */
/** 一个文字项里每个非空白字形的落点（下标与排版一致，去掉空白后重排） */
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
const glyphPts = (it: TextItem): GlyphPt[] => {
  const lay = layoutText(it),
    sx = it.sx || 1,
    sy = it.sy || 1,
    out: GlyphPt[] = []
  for (const g of lay) {
    if (isSp(g.ch)) continue
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
/* index of the "key" glyph: first kanji of the longest kanji run, else the first plain glyph */
const keyIndex = (arr: readonly string[], mode: string) => {
  const ok = (c: string) => c && !isSp(c) && !isPunct(c) && !isKana(c)
  if (mode === 'mid') {
    const mid = Math.floor((arr.length - 1) / 2)
    for (let d = 0; d < arr.length; d++) {
      if (ok(arr[mid + d])) return mid + d
      if (ok(arr[mid - d])) return mid - d
    }
  }
  let best = -1,
    bl = 0
  for (let i = 0; i < arr.length; i++) {
    if (!isHan(arr[i])) continue
    let j = i
    while (j < arr.length && isHan(arr[j])) j++
    if (j - i > bl) {
      bl = j - i
      best = i
    }
    i = j
  }
  if (best >= 0) return best
  for (let i = 0; i < arr.length; i++) if (ok(arr[i])) return i
  return 0
}
/* best-contrast scheme colour for text on a plate */
const onCol = (sc: Scheme, fill: string) => {
  let best = null,
    bv = 0
  for (const c of [sc.bg, sc.fg, sc.ink, sc.accent, sc.sub]) {
    if (!c || c === fill) continue
    const k = contrast(c, fill)
    if (k > bv) {
      bv = k
      best = c
    }
  }
  return bv >= 2.4 ? best : lum(fill) > 0.5 ? '#111111' : '#FFFFFF'
}
const plateCol = (sc: Scheme, pref: readonly string[]) => {
  for (const c of pref) if (c && contrast(c, sc.bg) >= 1.6) return c
  return sc.fg
}
const accentOn = (sc: Scheme) => (contrast(sc.accent, sc.bg) >= 1.8 ? sc.accent : sc.fg)
/* small annotation label (main pass only) */
const label = (
  env: Env,
  text: string,
  x: number,
  y: number,
  o: Partial<TextItem> & { extra?: Partial<TextItem> } = {},
) =>
  env.draw(
    Object.assign(
      {
        text: String(text),
        font: o.font || monoF(env),
        size: o.size || clamp(Math.min(env.W, env.H) * 0.018, 11, 22),
        x,
        y,
        align: o.align || 'left',
        track: o.track ?? 0.12,
        color: o.color || env.sc.sub,
        alpha: o.alpha ?? 1,
        ghost: false,
      },
      o.extra || {},
    ),
  )
const isLatinT = (t: string) =>
  /[A-Za-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(t)
const labelSize = (env: Env) => clamp(Math.min(env.W, env.H) * 0.018, 11, 22)

/* ================================================================== 1 tyKeySplit — 大字挟み */
/** tyKeySplit 的 plan 产物 */
type TyKeySplitParams = {
  font: string
  fs: string
  mode: string
  big: string
  rule: boolean
}

reg('tyKeySplit', {
  tags: ['editorial', 'graphic', 'emotional'],
  ae: 'mixed',
  w: 1.1,
  emph: 1.4,
  fits: (n: number) => n >= 2 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      fs: rng.pick(fontsOf(st, ['serif', 'body', 'display'])),
      mode: rng.pick(['kanji', 'kanji', 'mid']),
      big: rng.pick(['fill', 'fill', 'accent', 'outline']),
      rule: rng.chance(0.75),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyKeySplitParams,
      lt = env.lt
    const port = W < H
    const arr = slotsOf(cut.text)
    let ki = keyIndex(arr, Pm.mode),
      key = arr[ki] || '?'
    let before = arr.slice(0, ki).join('').trim(),
      after = arr
        .slice(ki + 1)
        .join('')
        .trim()
    if (isLatinT(cut.text)) {
      // latin: the longest word is the key
      const ws = String(cut.text).trim().split(/\s+/)
      let wi = 0
      ws.forEach((w, i: number) => {
        if (w.length > ws[wi].length) wi = i
      })
      key = ws[wi]
      before = ws.slice(0, wi).join(' ')
      after = ws.slice(wi + 1).join(' ')
      ki = ws.slice(0, wi).join(' ').length + (wi ? 1 : 0)
    }
    let bigS = port ? Math.min(W * 0.66, H * 0.36) : Math.min(H * 0.64, W * 0.34)
    bigS = Math.min(bigS, fitSize(key, Pm.font, port ? W * 0.84 : W * 0.5, 1e6))
    const bw = measure({ text: key, font: Pm.font, size: bigS }).w
    const gap = bigS * 0.12
    const per = port ? 6 : 5
    const bt = before ? splitL(before, per) : '',
      at = after ? splitL(after, per) : ''
    const o = { track: 0.04, lead: 1.2 }
    let ss
    if (port) {
      const avail = (H * 0.86 - bigS) / 2 - gap
      ss = Math.min(
        bt ? fitSize(bt, Pm.fs, W * 0.84, avail, o) : 1e9,
        at ? fitSize(at, Pm.fs, W * 0.84, avail, o) : 1e9,
        bigS * 0.3,
      )
    } else {
      const side = (W * 0.9 - bw - gap * 2) / ((bt ? 1 : 0) + (at ? 1 : 0) || 1)
      ss = Math.min(
        bt ? fitSize(bt, Pm.fs, side, bigS * 0.62, o) : 1e9,
        at ? fitSize(at, Pm.fs, side, bigS * 0.62, o) : 1e9,
        bigS * 0.3,
      )
    }
    const mB = bt ? measure(Object.assign({ text: bt, font: Pm.fs, size: ss }, o)) : { w: 0, h: 0 }
    const mA = at ? measure(Object.assign({ text: at, font: Pm.fs, size: ss }, o)) : { w: 0, h: 0 }
    // bx / by 由下面横竖版两个分支给出
    let bx: number,
      by: number,
      itB: TextItem | null = null,
      itA: TextItem | null = null
    const bigTop = () => by - bigS * 0.46,
      bigBot = () => by + bigS * 0.46
    if (!port) {
      const tot = (bt ? mB.w + gap : 0) + bw + (at ? mA.w + gap : 0)
      const x0 = W / 2 - tot / 2
      bx = x0 + (bt ? mB.w + gap : 0) + bw / 2
      by = H / 2
      if (bt)
        itB = Object.assign(
          {
            text: bt,
            font: Pm.fs,
            size: ss,
            align: 'right',
            x: bx - bw / 2 - gap,
            y: bigTop() + mB.h / 2,
            color: sc.fg,
            mi: 0,
          },
          o,
        ) as TextItem
      if (at)
        itA = Object.assign(
          {
            text: at,
            font: Pm.fs,
            size: ss,
            align: 'left',
            x: bx + bw / 2 + gap,
            y: bigBot() - mA.h / 2,
            color: sc.fg,
            mi: 4,
          },
          o,
        ) as TextItem
    } else {
      const tot = (bt ? mB.h + gap : 0) + bigS + (at ? mA.h + gap : 0)
      const y0 = H / 2 - tot / 2
      bx = W / 2
      by = y0 + (bt ? mB.h + gap : 0) + bigS / 2
      const L = W / 2 - Math.max(bw, mB.w, mA.w) / 2,
        R = W / 2 + Math.max(bw, mB.w, mA.w) / 2
      if (bt)
        itB = Object.assign(
          {
            text: bt,
            font: Pm.fs,
            size: ss,
            align: 'left',
            x: Math.max(W * 0.08, Math.min(L, bx - bw / 2)),
            y: by - bigS / 2 - gap - mB.h / 2,
            color: sc.fg,
            mi: 0,
          },
          o,
        ) as TextItem
      if (at)
        itA = Object.assign(
          {
            text: at,
            font: Pm.fs,
            size: ss,
            align: 'right',
            x: Math.min(W * 0.92, Math.max(R, bx + bw / 2)),
            y: by + bigS / 2 + gap + mA.h / 2,
            color: sc.fg,
            mi: 4,
          },
          o,
        ) as TextItem
    }
    const out = outK(env),
      lw = hair(env)
    // hairlines linking the small blocks to the key glyph
    if (Pm.rule) {
      const e = E.outCubic(clamp((lt - 0.2) / 0.6)) * out
      if (e > 0 && itB) {
        const y = port ? itB.y + mB.h / 2 + gap * 0.5 : itB.y + mB.h / 2 + ss * 0.35
        const xa = port ? itB.x : itB.x - mB.w,
          xb = port ? itB.x + Math.max(mB.w, bw) : bx + bw * 0.5
        env.line(
          [
            [xa, y],
            [lerp(xa, xb, e), y],
          ],
          sc.sub,
          lw,
          0.7,
          false,
        )
      }
      if (e > 0 && itA) {
        const y = port ? itA.y - mA.h / 2 - gap * 0.5 : itA.y - mA.h / 2 - ss * 0.35
        const xb = port ? itA.x : itA.x + mA.w,
          xa = port ? itA.x - Math.max(mA.w, bw) : bx - bw * 0.5
        env.line(
          [
            [xb, y],
            [lerp(xb, xa, e), y],
          ],
          sc.sub,
          lw,
          0.7,
          false,
        )
      }
    }
    const big = {
      text: key,
      font: Pm.font,
      size: bigS,
      x: bx,
      y: by,
      color: Pm.big === 'accent' ? accentOn(sc) : sc.fg,
      mi: 2,
    }
    if (Pm.big === 'outline')
      Object.assign(big, { fill: false, stroke: Math.max(1.5, bigS * 0.014), strokeColor: sc.fg })
    let bb: BBox | null = mainDraw(env, big)
    if (itB) bb = U(bb, mainDraw(env, itB))
    if (itA) bb = U(bb, mainDraw(env, itA))
    const la = E.outCubic(clamp((lt - 0.3) / 0.3)) * out
    const nG = arr.filter((c) => !isSp(c)).length,
      kiG = arr.slice(0, ki).filter((c) => !isSp(c)).length
    if (la > 0)
      label(
        env,
        `${pad2(kiG + 1)} / ${pad2(nG)}`,
        port ? bx - bw / 2 : bx - bw / 2,
        by + bigS * 0.56,
        { alpha: la, size: labelSize(env) * 0.9 },
      )
    return bb
  },
})

/* ================================================================== 2 tyCropGiant — 見切れ大文字 */
/** tyCropGiant 的 plan 产物 */
type TyCropGiantParams = {
  font: string
  fm: string
  edge: string
  style: string
  dir: number
}

reg('tyCropGiant', {
  tags: ['graphic', 'editorial', 'pop'],
  ae: 'huge',
  w: 1,
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      fm: rng.pick(fontsOf(st, ['display', 'serif'])),
      edge: rng.pick(['a', 'b']),
      style: rng.pick(['dim', 'dim', 'outline']),
      dir: rng.pick([1, -1]),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyCropGiantParams,
      lt = env.lt
    const port = W < H,
      txt = String(cut.text).trim()
    const u = clamp(lt / Math.max(0.5, cut.dur))
    const inG = E.outCubic(clamp(lt / 0.8)),
      outG = E.inCubic(env.pOut)
    const lowEdge = Pm.edge === 'a' // landscape: bottom edge / portrait: right edge
    // the giant copy, cropped by the frame edge
    // 大字底本：size / x / y 在下面按横竖版各自补上（与JIZURA一致）
    const gi = { text: port ? clean(txt) : txt, font: Pm.font, ghost: false, alpha: 1 } as TextItem
    if (!port) {
      const G = H * 0.66
      Object.assign(gi, {
        size: G,
        x: W / 2 + (0.5 - u) * W * 0.14 * Pm.dir,
        y: (lowEdge ? H + G * 0.03 : -G * 0.03) + (lowEdge ? 1 : -1) * (1 - inG + outG) * G * 0.45,
      })
    } else {
      const G = W * 0.62
      Object.assign(gi, {
        size: G,
        vertical: true,
        x: (lowEdge ? W + G * 0.03 : -G * 0.03) + (lowEdge ? 1 : -1) * (1 - inG + outG) * G * 0.45,
        y: H / 2 + (0.5 - u) * H * 0.1 * Pm.dir,
      })
    }
    if (Pm.style === 'outline')
      Object.assign(gi, {
        fill: false,
        stroke: Math.max(1.4, gi.size * 0.006),
        strokeColor: sc.sub,
        color: sc.sub,
        alpha: 0.65,
      })
    else gi.color = mix(sc.bg, sc.fg, 0.16)
    env.draw(gi)
    // the readable lyric on the free side
    const mt = mainLines(txt, W, H, 10, 6)
    const o = { lead: 1.18, track: 0.03 }
    let it: TextItem
    if (!port) {
      const size = Math.min(fitSize(mt, Pm.fm, W * 0.74, H * 0.34, o), H * 0.19)
      it = Object.assign(
        {
          text: mt,
          font: Pm.fm,
          size,
          align: 'left',
          x: W * 0.08,
          y: lowEdge ? H * 0.38 : H * 0.62,
          color: sc.fg,
        },
        o,
      ) as TextItem
    } else {
      const size = Math.min(fitSize(mt, Pm.fm, W * 0.58, H * 0.5, o), W * 0.2)
      it = Object.assign(
        {
          text: mt,
          font: Pm.fm,
          size,
          align: lowEdge ? 'left' : 'right',
          x: lowEdge ? W * 0.08 : W * 0.92,
          y: H / 2,
          color: sc.fg,
        },
        o,
      ) as TextItem
    }
    const bb = mainDraw(env, it)
    const m = measure(it)
    const la = E.outCubic(clamp((lt - 0.2) / 0.35)) * outK(env),
      ls = labelSize(env)
    if (la > 0) {
      const ty = it.y - m.h / 2 - ls * 1.6
      const x0 = it.align === 'right' ? it.x - m.w : it.x
      label(env, `No.${pad2((cut.line | 0) + 1)}`, x0, ty, { alpha: la, color: accentOn(sc) })
      env.line(
        [
          [x0 + ls * 4, ty],
          [x0 + ls * 4 + Math.min(m.w, W * 0.3) * E.outExpo(clamp((lt - 0.25) / 0.5)), ty],
        ],
        sc.sub,
        hair(env),
        0.7 * la,
        false,
      )
    }
    return bb
  },
})

/* ================================================================== 3 tyCross — 十字組 */
/** tyCross 的 plan 产物 */
type TyCrossParams = {
  font: string
  mode: string
  rules: boolean
  key: string
}

reg('tyCross', {
  tags: ['graphic', 'editorial'],
  ae: 'vcols',
  w: 0.9,
  fits: (n: number) => n >= 3 && n <= 11,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      mode: rng.pick(['kanji', 'mid', 'mid']),
      rules: rng.chance(0.8),
      key: rng.pick(['accent', 'accent', 'fg']),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyCrossParams,
      lt = env.lt,
      M = Math.min(W, H)
    const arr = slotsOf(cut.text),
      n = arr.length
    if (!n) return null
    const ki = keyIndex(arr, Pm.mode),
      tr = 0.08
    const A = arr.slice(0, ki).join('').trim(),
      K = arr[ki],
      B = arr
        .slice(ki + 1)
        .join('')
        .trim()
    const w100 = (s: string) =>
      s ? measure({ text: s, font: Pm.font, size: 100, track: tr }).w : 0
    const h100 = (s: string) =>
      s ? measure({ text: s, font: Pm.font, size: 100, track: tr, vertical: true }).h : 0
    const kw = w100(K),
      g100 = 100 * tr + 6
    const Lx = (A ? w100(A) + g100 : 0) + kw / 2,
      Rx = (B ? w100(B) + g100 : 0) + kw / 2
    const Ty = (A ? h100(A) + g100 : 0) + 50,
      By = (B ? h100(B) + g100 : 0) + 50
    const size = Math.min((W * 0.86) / ((Lx + Rx) / 100), (H * 0.86) / ((Ty + By) / 100), M * 0.2)
    const k = size / 100
    const cx = W / 2 - ((Rx - Lx) * k) / 2,
      cy = H / 2 - ((By - Ty) * k) / 2
    const out = outK(env),
      lw = hair(env)
    if (Pm.rules) {
      const e = E.outExpo(clamp((lt - 0.1) / 0.7)) * out
      if (e > 0) {
        env.line(
          [
            [cx - W * e, cy],
            [cx + W * e, cy],
          ],
          sc.sub,
          lw,
          0.28,
          false,
        )
        env.line(
          [
            [cx, cy - H * e],
            [cx, cy + H * e],
          ],
          sc.sub,
          lw,
          0.28,
          false,
        )
        env.circle(cx, cy, size * 0.78 * (0.6 + 0.4 * e), null, sc.sub, lw, 0.5 * e, false)
      }
    }
    const g = size * tr + 6 * k
    const base = { font: Pm.font, size, track: tr, color: sc.fg }
    let bb: BBox | null = null
    if (A)
      bb = U(
        bb,
        mainDraw(
          env,
          Object.assign({}, base, {
            text: A,
            align: 'right',
            x: cx - (kw * k) / 2 - g,
            y: cy,
            mi: 0,
          }) as TextItem,
        ),
      )
    const kb = mainDraw(
      env,
      Object.assign({}, base, {
        text: K,
        x: cx,
        y: cy,
        color: Pm.key === 'accent' ? accentOn(sc) : sc.fg,
        mi: 1,
      }) as TextItem,
    )
    bb = U(bb, kb)
    if (B)
      bb = U(
        bb,
        mainDraw(
          env,
          Object.assign({}, base, {
            text: B,
            align: 'left',
            x: cx + (kw * k) / 2 + g,
            y: cy,
            mi: 2,
          }) as TextItem,
        ),
      )
    if (A) {
      const h = h100(A) * k
      bb = U(
        bb,
        mainDraw(
          env,
          Object.assign({}, base, {
            text: A,
            vertical: true,
            x: cx,
            y: cy - size / 2 - g - h / 2,
            mi: 3,
          }) as TextItem,
        ),
      )
    }
    if (B) {
      const h = h100(B) * k
      bb = U(
        bb,
        mainDraw(
          env,
          Object.assign({}, base, {
            text: B,
            vertical: true,
            x: cx,
            y: cy + size / 2 + g + h / 2,
            mi: 4,
          }) as TextItem,
        ),
      )
    }
    const la = E.outCubic(clamp((lt - 0.35) / 0.3)) * out
    if (la > 0)
      label(env, `${pad2(ki + 1)}×${pad2(ki + 1)}`, cx + size * 0.62, cy - size * 0.62, {
        alpha: la,
        size: labelSize(env) * 0.9,
      })
    return bb
  },
})

/* ================================================================== 4 tyBandHide — 帯隠れ */
/** tyBandHide 的 plan 产物 */
type TyBandHideParams = {
  font: string
  band: string
  pos: string
  speed: number
  dir: number
  k: number
}

reg('tyBandHide', {
  tags: ['graphic', 'pop', 'editorial'],
  ae: 'diag',
  w: 1,
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      band: rng.pick(['ink', 'accent', 'fg']),
      pos: rng.pick(['low', 'low', 'high']),
      speed: rng.range(40, 90),
      dir: rng.pick([1, -1]),
      k: rng.range(0.3, 0.38),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyBandHideParams,
      lt = env.lt
    const txt = String(cut.text).trim()
    const mt = mainLines(txt, W, H, 10, 5),
      L = mt.split('\n').length,
      lead = 1.32
    const size = Math.min(fitSize(mt, Pm.font, W * 0.8, H * 0.66, { lead, track: 0.02 }), H * 0.3)
    const bb = mainDraw(env, {
      text: mt,
      font: Pm.font,
      size,
      x: W / 2,
      y: H / 2,
      lead,
      track: 0.02,
      color: sc.fg,
    })
    const bandC = plateCol(
      sc,
      Pm.band === 'accent'
        ? [sc.accent, sc.ink, sc.fg]
        : Pm.band === 'ink'
          ? [sc.ink, sc.accent, sc.fg]
          : [sc.fg, sc.accent],
    )
    const tc = onCol(sc, bandC)
    const unit =
      String(cut.lineText || txt)
        .replace(/\s+/g, ' ')
        .trim() + '　／　'
    const out = 1 - E.inExpo(env.pOut)
    for (let li = 0; li < L; li++) {
      const e = E.outExpo(clamp((lt - 0.12 - li * 0.08) / 0.5)) * out
      if (e <= 0) continue
      const yl = H / 2 + (li - (L - 1) / 2) * size * lead
      const h = size * (Pm.k + 0.08)
      const y0 = Pm.pos === 'low' ? yl + size * (0.5 - Pm.k) : yl - size * 0.58
      const d = (li % 2 ? -1 : 1) * Pm.dir
      const bw = (W + 20) * e,
        x0 = d > 0 ? -10 : W + 10 - bw
      env.rect(x0, y0, bw, h, bandC, 1, false)
      if (env.pass === 'main') {
        const fs = h * 0.44
        const per = measure({ text: unit, font: bodyF(env), size: fs, track: 0.12 }).w
        if (per > 1) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(x0, y0, bw, h)
          ctx.clip()
          const off = (((env.ltb * Pm.speed * d) % per) + per) % per
          env.draw({
            text: unit.repeat(Math.min(40, Math.ceil((W * 2) / per) + 2)),
            font: bodyF(env),
            size: fs,
            track: 0.12,
            align: 'left',
            x: -per + off,
            y: y0 + h / 2,
            color: tc ?? undefined,
            ghost: false,
          })
          ctx.restore()
        }
      }
    }
    return bb
  },
})

/* ================================================================== 5 tyRuby — ルビ振り */
/** tyRuby 的 plan 产物 */
type TyRubyParams = {
  font: string
  idx: boolean
  up: boolean
}

reg('tyRuby', {
  tags: ['editorial', 'calm', 'emotional'],
  ae: 'gloss',
  w: 1,
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      idx: rng.chance(0.7),
      up: rng.chance(0.5),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyRubyParams,
      lt = env.lt
    const txt = String(cut.text).trim()
    const mt = mainLines(txt, W, H, 9, 5)
    const o = { track: 0.16, lead: 2.0 }
    const size = Math.min(fitSize(mt, Pm.font, W * 0.84, H * 0.62, o), H * 0.2, W * 0.24)
    const it = Object.assign(
      { text: mt, font: Pm.font, size, x: W / 2, y: H / 2 + size * 0.1, color: sc.fg },
      o,
    ) as TextItem
    const bb = mainDraw(env, it)
    const gl = glyphPts(it),
      out = outK(env),
      mono = monoF(env),
      lw = hair(env)
    const rs = Math.max(10, size * 0.3)
    gl.forEach((g, i: number) => {
      const a = E.outCubic(clamp((lt - 0.18 - i * 0.045) / 0.3)) * out
      if (a <= 0) return
      const ry = g.y - size * 0.74
      let rt = isKana(g.ch) || isKana(g.ch) ? romajiOf(g.ch) : null
      if (rt === '') rt = null
      if (rt) {
        const w0 = measure({ text: rt, font: mono, size: rs, track: 0.02 }).w
        const fs = w0 > g.w * 1.05 ? (rs * g.w * 1.05) / w0 : rs
        env.draw({
          text: Pm.up ? rt.toUpperCase() : rt,
          font: mono,
          size: fs,
          track: 0.02,
          x: g.x,
          y: ry + (1 - a) * rs * 0.5,
          color: sc.sub,
          alpha: a,
          ghost: false,
        })
      } else if (isHan(g.ch)) {
        const w = g.w * 0.5 * a
        env.line(
          [
            [g.x - w, ry + rs * 0.2],
            [g.x - w, ry - rs * 0.15],
            [g.x + w, ry - rs * 0.15],
            [g.x + w, ry + rs * 0.2],
          ],
          accentOn(sc),
          Math.max(1.2, lw * 1.2),
          a,
          false,
        )
      }
      if (Pm.idx) {
        const iy = g.y + size * 0.72
        env.line(
          [
            [g.x, iy - rs * 0.55],
            [g.x, iy - rs * 0.2],
          ],
          sc.sub,
          lw,
          0.6 * a,
          false,
        )
        env.draw({
          text: pad2(i + 1),
          font: mono,
          size: rs * 0.72,
          x: g.x,
          y: iy + rs * 0.12,
          color: sc.sub,
          alpha: 0.75 * a,
          ghost: false,
        })
      }
    })
    return bb
  },
})

/* ================================================================== 6 tyBaseline — 罫線組 */
/** tyBaseline 的 plan 产物 */
type TyBaselineParams = {
  font: string
  nl: number
  key: boolean
  right: boolean
}

reg('tyBaseline', {
  tags: ['editorial', 'calm', 'graphic'],
  ae: 'type',
  w: 1.1,
  fits: (n: number) => n >= 2 && n <= 18,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display', 'body'])),
      nl: rng.pick([2, 3, 3]),
      key: rng.chance(0.8),
      right: rng.chance(0.5),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyBaselineParams,
      lt = env.lt
    const port = W < H,
      txt = String(cut.text).trim(),
      nG = glyphCount(txt)
    const per = port ? 4 : Math.max(4, Math.ceil(nG / Pm.nl))
    let lines = (nG <= 4 ? txt : splitL(txt, per)).split('\n').slice(0, 6)
    if (isLatinT(txt)) {
      const ws = txt.split(/\s+/)
      lines = groupLines(
        ws.map((w: string, i: number) => (i ? ' ' : '') + w),
        Math.min(ws.length, port ? 4 : Pm.nl),
      )
    }
    const L = lines.length,
      leadK = 1.62
    let size = Math.min((H * 0.7) / (L * leadK), port ? W * 0.17 : H * 0.16)
    for (const l of lines)
      size = Math.min(size, fitSize(l, Pm.font, port ? W * 0.76 : W * 0.74, 1e6, { track: 0.04 }))
    const x0 = port ? W * 0.16 : W * 0.14,
      mx = W * 0.06,
      out = outK(env),
      lw = hair(env),
      mono = monoF(env),
      ls = labelSize(env)
    // key glyph (for the accent mark on its baseline)
    const all = lines.join(''),
      arr = [...all]
    const ki = keyIndex(arr, 'kanji')
    let kEnd = ki
    while (kEnd + 1 < arr.length && isHan(arr[kEnd + 1]) && isHan(arr[ki])) kEnd++
    let acc = 0,
      bb: BBox | null = null
    lines.forEach((ln, li: number) => {
      const y = H / 2 + (li - (L - 1) / 2) * size * leadK
      const yb = y + size * 0.6
      const e = E.outExpo(clamp((lt - li * 0.1) / 0.6)) * out
      if (e > 0) {
        env.line(
          [
            [mx, yb],
            [lerp(mx, W - mx, e), yb],
          ],
          sc.sub,
          lw,
          0.55,
          false,
        )
        label(env, pad2(li + 1), mx, y + size * 0.2, { alpha: e, size: ls * 0.9, font: mono })
        if (Pm.right)
          label(env, `${glyphCount(ln)}`, W - mx, y + size * 0.2, {
            alpha: e * 0.8,
            size: ls * 0.9,
            align: 'right',
          })
      }
      const it: TextItem = {
        text: ln,
        font: Pm.font,
        size,
        align: 'left',
        x: x0,
        y,
        track: 0.04,
        color: sc.fg,
        mi: li * 4,
      }
      bb = U(bb, mainDraw(env, it))
      const n = [...ln].length
      if (Pm.key && ki >= acc && ki < acc + n && e > 0) {
        const gp = glyphPts(it).filter((_g) => true)
        const idx0 = [...ln].slice(0, ki - acc).filter((c) => !isSp(c)).length,
          idx1 = Math.min(gp.length - 1, idx0 + Math.min(kEnd, acc + n - 1) - ki)
        if (gp[idx0]) {
          const a0 = gp[idx0].x - gp[idx0].w / 2,
            a1 = gp[idx1].x + gp[idx1].w / 2
          const q = E.outExpo(clamp((lt - 0.35 - li * 0.1) / 0.45)) * out
          env.rect(
            a0,
            yb - Math.max(2, size * 0.035),
            (a1 - a0) * q,
            Math.max(3, size * 0.07),
            accentOn(sc),
            1,
            false,
          )
        }
      }
      acc += n
    })
    return bb
  },
})

/* ================================================================== 7 tyScaleSteps — 級数上げ */
/** tyScaleSteps 的 plan 产物 */
type TyScaleStepsParams = {
  font: string
  dir: string
  labels: boolean
  ratio: number
}

reg('tyScaleSteps', {
  tags: ['graphic', 'editorial', 'pop'],
  ae: 'mixed',
  w: 1,
  fits: (n: number) => n >= 2 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      dir: rng.pick(['up', 'up', 'down']),
      labels: rng.chance(0.8),
      ratio: rng.range(2.0, 2.8),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyScaleStepsParams,
      lt = env.lt,
      M = Math.min(W, H)
    const port = W < H,
      txt = String(cut.text).trim()
    let units = (cut.words || []).map((w) => String(w).trim()).filter(Boolean)
    const chars = slotsOf(txt).filter((c) => !isSp(c))
    if (units.length < 2 || units.length > 7) {
      if (chars.length <= 7) units = chars
      else {
        const k = Math.min(5, Math.ceil(chars.length / 3))
        units = splitL(txt, Math.ceil(chars.length / k)).split('\n')
      }
    }
    const k = units.length
    const f = units.map((_u, i: number) => {
      const t = k > 1 ? i / (k - 1) : 1
      return Math.pow(Pm.ratio, Pm.dir === 'up' ? t : 1 - t)
    })
    const fmax = Math.max(...f)
    const tr = 0.02,
      out = outK(env),
      lw = hair(env),
      ls = labelSize(env)
    const wOf = (u: string, s: number) => measure({ text: u, font: Pm.font, size: s, track: tr }).w
    let bb: BBox | null = null
    const items: (TextItem & { _w: number; _yb: number })[] = []
    if (!port) {
      const gapK = 0.16,
        latin = isLatinT(txt) && units.length > 1 && units.length < chars.length
      let tot = 0
      units.forEach((u: string, i: number) => {
        tot += wOf(u, 100 * f[i]) + (i ? 100 * gapK * f[i] * (latin ? 1.6 : 0.6) : 0)
      })
      const base = Math.min(((W * 0.86) / tot) * 100, (H * 0.52) / fmax)
      let x = W / 2 - (tot * base) / 100 / 2
      const yb = H / 2 + base * fmax * 0.36
      units.forEach((u: string, i: number) => {
        const s = base * f[i]
        if (i) x += s * gapK * (latin ? 1.6 : 0.6)
        items.push({
          text: u,
          font: Pm.font,
          size: s,
          align: 'left',
          x,
          y: yb - s * 0.46,
          track: tr,
          color: sc.fg,
          mi: i * 2,
          _w: wOf(u, s),
          _yb: yb,
        })
        x += wOf(u, s)
      })
      const e = E.outExpo(clamp((lt - 0.05) / 0.7)) * out
      const xa = items[0].x,
        xb = x
      if (e > 0)
        env.line(
          [
            [xa, yb + base * 0.08],
            [lerp(xa, xb, e), yb + base * 0.08],
          ],
          sc.sub,
          lw,
          0.6,
          false,
        )
    } else {
      let tot = 0
      units.forEach((_u: string, i: number) => {
        tot += 100 * f[i] * 1.12
      })
      let base = ((H * 0.78) / tot) * 100
      units.forEach((u: string, i: number) => {
        base = Math.min(base, (W * 0.8) / Math.max(0.01, wOf(u, 100 * f[i]) / 100))
      })
      base = Math.min(base, (W * 0.5) / fmax)
      let y = H / 2 - (tot * base) / 100 / 2
      units.forEach((u: string, i: number) => {
        const s = base * f[i]
        items.push({
          text: u,
          font: Pm.font,
          size: s,
          align: 'left',
          x: W * 0.1,
          y: y + s * 0.56,
          track: tr,
          color: sc.fg,
          mi: i * 2,
          _w: wOf(u, s),
          _yb: y + s * 1.06,
        })
        y += s * 1.12
      })
    }
    items.forEach((it, i: number) => {
      const IW = it as TextItem & { _w?: number; _yb?: number }
      const w = IW._w ?? 0,
        yb = IW._yb ?? 0
      delete IW._w
      delete IW._yb
      bb = U(bb, mainDraw(env, it))
      if (Pm.labels) {
        const a = E.outCubic(clamp((lt - 0.25 - i * 0.07) / 0.3)) * out
        if (a > 0) {
          const pt = Math.round((it.size / (M / 1080)) * 0.75)
          if (!port) label(env, `${pt}pt`, it.x, yb + ls * 1.3, { alpha: a, size: ls * 0.85 })
          else
            label(env, `${pt}pt`, it.x + w + ls * 0.8, yb - ls * 0.6, { alpha: a, size: ls * 0.85 })
        }
      }
    })
    return bb
  },
})

/* ================================================================== 8 tyJustify — 幅揃え */
const groupLines = (units: readonly string[], L: number) => {
  const lens = units.map((u) => glyphCount(u)),
    tot = lens.reduce((a: number, b: number) => a + b, 0),
    out: string[] = []
  let cur = '',
    acc = 0
  units.forEach((u: string, i: number) => {
    cur += u
    acc += lens[i]
    const target = (tot * (out.length + 1)) / L
    if (out.length < L - 1 && acc >= target - lens[i] * 0.4 && i < units.length - 1) {
      out.push(cur.trim())
      cur = ''
    }
  })
  if (cur.trim()) out.push(cur.trim())
  return out
}
/** tyJustify 的 plan 产物 */
type TyJustifyParams = {
  font: string
  rules: boolean
  acc: number
  align: string
}

reg('tyJustify', {
  tags: ['graphic', 'pop', 'editorial'],
  ae: 'stack',
  w: 1.1,
  fits: (n: number) => n >= 3 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      rules: rng.chance(0.7),
      acc: rng.int(0, 3),
      align: rng.pick(['center', 'left']),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyJustifyParams,
      lt = env.lt
    const port = W < H,
      txt = String(cut.text).trim(),
      n = glyphCount(txt)
    let L = n <= 5 ? 2 : n <= 10 ? 3 : 4
    let units = (cut.words || []).map((w) => String(w)).filter((w) => w.trim())
    if (isLatinT(txt)) units = txt.split(/\s+/).map((w, i: number) => (i ? ' ' : '') + w)
    else {
      if (units.length < 2) units = (segments(txt) || []).filter((w) => w.trim())
      if (units.length < 2) units = [...txt]
    }
    L = Math.min(L, units.length)
    let lines: string[] = groupLines(units, L)
    for (let i = 1; i < lines.length; i++) {
      while (lines[i] && isPunct([...lines[i]][0])) {
        const c = [...lines[i]][0]
        lines[i - 1] += c
        lines[i] = lines[i].slice(c.length).trim()
      }
    }
    lines = lines.filter(Boolean)
    if (lines.length < 2 && !isLatinT(txt)) lines = splitL(txt, Math.ceil(n / 2)).split('\n')
    const Wb = port ? W * 0.84 : Math.min(W * 0.62, H * 1.15)
    const tr = 0.01,
      gapK = 0.1
    let sizes = lines.map((l) => Math.min(fitSize(l, Pm.font, Wb, 1e6, { track: tr }), H * 0.36))
    let tot = sizes.reduce((a, s) => a + s * (1 + gapK), 0) - sizes[sizes.length - 1] * gapK
    const k = Math.min(1, (H * 0.84) / tot)
    sizes = sizes.map((s) => s * k)
    tot *= k
    const x0 = W / 2 - (Wb * k) / 2,
      out = outK(env),
      lw = hair(env)
    let y = H / 2 - tot / 2,
      bb: BBox | null = null
    const accI = Pm.acc % lines.length
    lines.forEach((l, li: number) => {
      const s = sizes[li]
      const it: TextItem = {
        text: l,
        font: Pm.font,
        size: s,
        x: Pm.align === 'left' ? x0 : W / 2,
        align: Pm.align === 'left' ? 'left' : 'center',
        y: y + s / 2,
        track: tr,
        color: li === accI && lines.length > 2 ? accentOn(sc) : sc.fg,
        mi: li * 3,
      }
      bb = U(bb, mainDraw(env, it))
      if (Pm.rules && li < lines.length - 1) {
        const e = E.outExpo(clamp((lt - 0.15 - li * 0.08) / 0.6)) * out
        const ry = y + s + s * gapK * k * 0.5
        if (e > 0)
          env.line(
            [
              [W / 2 - ((Wb * k) / 2) * e, ry],
              [W / 2 + ((Wb * k) / 2) * e, ry],
            ],
            sc.sub,
            lw,
            0.55,
            false,
          )
      }
      y += s * (1 + gapK)
    })
    return bb
  },
})

/* ================================================================== 9 tyIndexTable — 一覧表 */
/** tyIndexTable 的 plan 产物 */
type TyIndexTableParams = {
  font: string
  info: string
  head: boolean
}

reg('tyIndexTable', {
  tags: ['editorial', 'graphic', 'calm'],
  ae: 'gloss',
  w: 0.8,
  portrait: 1.3,
  fits: (n: number) => n >= 2 && n <= 9,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      info: rng.pick(['roma', 'roma', 'code']),
      head: rng.chance(0.8),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyIndexTableParams,
      lt = env.lt,
      M = Math.min(W, H)
    const port = W < H
    const chars = [...clean(cut.text)],
      n = chars.length
    if (!n) return null
    const rowH = Math.min((H * 0.78) / n, M * 0.2),
      gs = rowH * 0.86
    const Wt = port ? W * 0.84 : Math.min(W * 0.56, H * 1.0)
    const x0 = W / 2 - Wt / 2,
      x1 = W / 2 + Wt / 2,
      xg = x0 + Wt * 0.24
    const top = H / 2 - (n * rowH) / 2
    const out = outK(env),
      lw = hair(env),
      mono = monoF(env)
    const fs = clamp(rowH * 0.3, 11, 34)
    const e0 = E.outExpo(clamp(lt / 0.6)) * out
    if (e0 > 0) {
      env.line(
        [
          [x0, top],
          [lerp(x0, x1, e0), top],
        ],
        sc.fg,
        lw * 2,
        0.9,
        false,
      )
      env.line(
        [
          [x0, top + n * rowH],
          [lerp(x0, x1, e0), top + n * rowH],
        ],
        sc.fg,
        lw * 2,
        0.9,
        false,
      )
      if (Pm.head) {
        label(env, 'No.', x0, top - fs * 0.9, { alpha: e0, size: fs * 0.8 })
        label(env, Pm.info === 'code' ? 'CODE' : 'READING', x1, top - fs * 0.9, {
          alpha: e0,
          size: fs * 0.8,
          align: 'right',
        })
      }
    }
    let bb: BBox | null = null
    chars.forEach((ch, i: number) => {
      const y = top + (i + 0.5) * rowH
      bb = U(
        bb,
        mainDraw(env, { text: ch, font: Pm.font, size: gs, x: xg, y, color: sc.fg, mi: i }),
      )
      const a = E.outCubic(clamp((lt - 0.12 - i * 0.06) / 0.3)) * out
      if (a <= 0) return
      label(env, pad2(i + 1), x0, y, { alpha: a, size: fs, color: i === 0 ? accentOn(sc) : sc.sub })
      let info = null
      if (Pm.info !== 'code' && (isKana(ch) || isKana(ch))) {
        const r = romajiOf(ch)
        if (r) info = r.toUpperCase()
      }
      if (!info) info = 'U+' + (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
      const iw = measure({ text: info, font: mono, size: fs, track: 0.12 }).w
      label(env, info, x1, y, { alpha: a, size: fs, align: 'right' })
      const la = xg + gs * 0.72,
        lb = x1 - iw - fs * 0.8
      if (lb > la && env.pass === 'main') {
        ctx.save()
        ctx.setLineDash([Math.max(2, lw * 2), Math.max(5, fs * 0.5)])
        env.line(
          [
            [la, y + fs * 0.2],
            [lerp(la, lb, a), y + fs * 0.2],
          ],
          sc.sub,
          Math.max(2, lw * 2),
          a,
          false,
        )
        ctx.restore()
      }
      if (i < n - 1)
        env.line(
          [
            [x0, top + (i + 1) * rowH],
            [x1, top + (i + 1) * rowH],
          ],
          sc.sub,
          lw,
          0.22 * a,
          false,
        )
    })
    return bb
  },
})

/* ================================================================== 10 tySplitType — 断ち割り */
/** tySplitType 的 plan 产物 */
type TySplitTypeParams = {
  font: string
  off: number
  cutY: number
  cap: boolean
}

reg('tySplitType', {
  tags: ['graphic', 'glitch', 'pop'],
  ae: 'center',
  w: 1,
  fits: (n: number) => n >= 1 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      off: rng.range(0.08, 0.15) * rng.pick([1, -1]),
      cutY: rng.pick([0.02, -0.06, 0.08]),
      cap: rng.chance(0.75),
    }
  },
  render(env) {
    const { W, H, sc, ctx } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TySplitTypeParams,
      lt = env.lt
    const txt = String(cut.text).trim()
    const mt = mainLines(txt, W, H, 11, 5),
      L = mt.split('\n').length,
      lead = 1.16
    const size = Math.min(fitSize(mt, Pm.font, W * 0.76, H * 0.56, { lead, track: 0.03 }), H * 0.3)
    const e = E.outExpo(clamp((lt - 0.12) / 0.7))
    const d = size * Pm.off * e,
      gy = size * 0.05 * e
    const base = { text: mt, font: Pm.font, size, y: H / 2, lead, track: 0.03, color: sc.fg, mi: 0 }
    const ys: number[] = []
    for (let li = 0; li < L; li++)
      ys.push(H / 2 + (li - (L - 1) / 2) * size * lead + size * Pm.cutY)
    const part = (top: boolean) => {
      ctx.save()
      ctx.beginPath()
      ys.forEach((yc, li) => {
        const a = yc - (size * lead) / 2,
          b = yc + (size * lead) / 2
        if (top) ctx.rect(-W, li ? a : -H, W * 3, yc - (li ? a : -H))
        else ctx.rect(-W, yc, W * 3, (li < L - 1 ? b : H * 2) - yc)
      })
      ctx.clip()
      const r = mainDraw(
        env,
        Object.assign({}, base, {
          x: W / 2 + (top ? d : -d),
          y: H / 2 + (top ? -gy : gy),
        }) as TextItem,
      )
      ctx.restore()
      return r
    }
    const bb = U(part(true), part(false))
    const out = outK(env),
      lw = hair(env)
    if (e * out > 0.01) {
      ys.forEach((yc, li) => {
        const q = E.outExpo(clamp((lt - 0.2 - li * 0.08) / 0.6)) * out
        env.line(
          [
            [W * 0.04, yc],
            [lerp(W * 0.04, W * 0.96, q), yc],
          ],
          accentOn(sc),
          Math.max(1.2, lw * 1.2),
          0.9,
          false,
        )
      })
      if (Pm.cap) {
        const ls = labelSize(env) * 0.85,
          cap = (romaOf(txt) || String(cut.lineText || txt)).slice(0, 48)
        label(env, cap, W * 0.96, ys[ys.length - 1] + ls * 0.9, {
          align: 'right',
          alpha: out * E.outCubic(clamp((lt - 0.4) / 0.3)),
          size: ls,
          track: 0.2,
        })
      }
    }
    return bb
  },
})

/* ================================================================== 11 tyErode — 削り反復 */
/** tyErode 的 plan 产物 */
type TyErodeParams = {
  font: string
  mode: string
  idx: boolean
}

reg('tyErode', {
  tags: ['emotional', 'editorial', 'calm'],
  ae: 'stack',
  w: 0.9,
  portrait: 0.6,
  fits: (n: number) => n >= 3 && n <= 12,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      mode: rng.pick(['grow', 'grow', 'erode']),
      idx: rng.chance(0.7),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyErodeParams,
      lt = env.lt
    const arr = slotsOf(cut.text),
      nS = arr.length
    const R = Math.min(5, Math.max(2, arr.filter((c) => !isSp(c)).length))
    const lens: number[] = []
    for (let r = 0; r < R; r++) {
      const l = Math.max(1, Math.round((nS * (r + 1)) / R))
      if (!lens.includes(l)) lens.push(l)
    }
    if (Pm.mode === 'erode') lens.reverse()
    const rows = lens.map((l) => arr.slice(0, l).join('').trim()).filter(Boolean)
    const Rn = rows.length,
      full = arr.join(''),
      leadK = 1.34
    const size = Math.min(
      fitSize(full, Pm.font, W * 0.74, 1e6, { track: 0.04 }),
      (H * 0.8) / (Rn * leadK),
      H * 0.16,
    )
    const fw = measure({ text: full, font: Pm.font, size, track: 0.04 }).w
    const x0 = W / 2 - fw / 2,
      out = outK(env),
      mainR = Pm.mode === 'erode' ? 0 : Rn - 1
    let bb: BBox | null = null
    rows.forEach((t, r) => {
      const y = H / 2 + (r - (Rn - 1) / 2) * size * leadK
      const it: TextItem = { text: t, font: Pm.font, size, align: 'left', x: x0, y, track: 0.04 }
      const tIn = r * 0.11
      if (r === mainR) bb = mainDraw(env, Object.assign(it, { color: sc.fg, mi: r * 2.5 }))
      else {
        const dist = Math.abs(r - mainR) / Math.max(1, Rn - 1)
        const a = clamp((lt - tIn) / 0.12) * out * (0.75 - 0.45 * dist)
        if (a > 0) env.draw(Object.assign(it, { color: sc.sub, alpha: a, ghost: false }))
      }
      if (Pm.idx) {
        const a = clamp((lt - tIn) / 0.12) * out
        if (a > 0)
          label(env, pad2(glyphCount(t)), x0 + fw + size * 0.5, y, {
            alpha: a * 0.85,
            size: Math.min(labelSize(env), size * 0.4),
            color: r === mainR ? accentOn(sc) : sc.sub,
          })
      }
    })
    return bb
  },
})

/* ================================================================== 12 tyVRuler — 縦目盛り */
/** tyVRuler 的 plan 产物 */
type TyVRulerParams = {
  font: string
  side: number
  lab: string
}

reg('tyVRuler', {
  tags: ['editorial', 'calm', 'graphic'],
  ae: 'vcols',
  w: 0.9,
  portrait: 1.3,
  fits: (n: number) => n >= 1 && n <= 12,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display'])),
      side: rng.pick([1, -1]),
      lab: rng.pick(['time', 'time', 'roma']),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyVRulerParams,
      lt = env.lt
    const txt = String(cut.text)
      .trim()
      .replace(/[\s\u3000]+/g, '　')
    const tr = 0.14
    const size = Math.min(
      fitSize(txt, Pm.font, W * 0.3, H * 0.78, { vertical: true, track: tr }),
      W * 0.2,
      H * 0.2,
    )
    const cx = W / 2 - Pm.side * size * 0.9
    const it: TextItem = {
      text: txt,
      font: Pm.font,
      size,
      x: cx,
      y: H / 2,
      vertical: true,
      track: tr,
      color: sc.fg,
    }
    const bb = mainDraw(env, it)
    const gl = glyphPts(it)
    if (!gl.length) return bb
    const out = outK(env),
      lw = hair(env)
    const rx = cx + Pm.side * size * 0.85
    const y0 = gl[0].y - size * 0.7,
      y1 = gl[gl.length - 1].y + size * 0.7
    const e = E.outExpo(clamp(lt / 0.7)) * out
    if (e <= 0) return bb
    env.line(
      [
        [rx, y0],
        [rx, lerp(y0, y1, e)],
      ],
      sc.sub,
      lw,
      0.8,
      false,
    )
    const fs = clamp(size * 0.2, 10, 24),
      n = gl.length
    const rom = Pm.lab === 'roma'
    gl.forEach((g, i: number) => {
      const a = E.outCubic(clamp((lt - 0.1 - i * 0.05) / 0.25)) * out
      if (a <= 0) return
      env.line(
        [
          [rx, g.y],
          [rx + Pm.side * size * 0.3, g.y],
        ],
        sc.sub,
        lw,
        0.9 * a,
        false,
      )
      if (i < n - 1) {
        const ym = (g.y + gl[i + 1].y) / 2
        env.line(
          [
            [rx, ym],
            [rx + Pm.side * size * 0.14, ym],
          ],
          sc.sub,
          lw,
          0.5 * a,
          false,
        )
      }
      let t = null
      if (rom && (isKana(g.ch) || isKana(g.ch))) t = (romajiOf(g.ch) || '').toUpperCase() || null
      if (!t) t = fmtTime(cut.start + (cut.dur * i) / n)
      label(env, t, rx + Pm.side * size * 0.45, g.y, {
        alpha: a,
        size: fs,
        align: Pm.side > 0 ? 'left' : 'right',
      })
    })
    // playhead
    const u = clamp(lt / Math.max(0.3, cut.dur * 0.92))
    const py = lerp(gl[0].y, gl[n - 1].y, u),
      ts = fs * 0.7,
      ac = accentOn(sc)
    env.poly(
      [
        [rx - Pm.side * 2, py],
        [rx - Pm.side * (ts * 1.4), py - ts],
        [rx - Pm.side * (ts * 1.4), py + ts],
      ],
      ac,
      e,
      false,
    )
    return bb
  },
})

/* ================================================================== 13 tyFullTrack — 全幅字送り */
/** tyFullTrack 的 plan 产物 */
type TyFullTrackParams = {
  font: string
  caps: boolean
  rule: boolean
}

reg('tyFullTrack', {
  tags: ['editorial', 'calm', 'graphic'],
  ae: 'center',
  w: 1,
  fits: (n: number) => n >= 3 && n <= 14,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif', 'body'])),
      caps: rng.chance(0.8),
      rule: rng.chance(0.75),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyFullTrackParams,
      lt = env.lt
    const port = W < H
    const s = slotsOf(cut.text),
      k = s.length
    const m0 = port ? H * 0.08 : W * 0.06
    const size = port
      ? Math.min(W * 0.24, (((port ? H : W) - m0 * 2) / k) * 0.8, H * 0.11)
      : Math.min(H * 0.2, ((W - m0 * 2) / k) * 0.8)
    const m = m0 + size * 0.5
    const span = (port ? H : W) - m * 2
    const out = outK(env),
      lw = hair(env)
    let bb: BBox | null = null,
      gi = 0
    s.forEach((ch, i: number) => {
      if (isSp(ch)) return
      const u = k > 1 ? i / (k - 1) : 0.5
      const x = port ? W / 2 : m + span * u,
        y = port ? m + span * u : H / 2
      bb = U(bb, mainDraw(env, { text: ch, font: Pm.font, size, x, y, color: sc.fg, mi: gi++ }))
    })
    const e = E.outExpo(clamp((lt - 0.05) / 0.8)) * out
    if (e > 0) {
      if (Pm.rule) {
        if (!port) {
          const y = H / 2 + size * 0.68
          env.line(
            [
              [W / 2 - (span / 2) * e, y],
              [W / 2 + (span / 2) * e, y],
            ],
            sc.sub,
            lw,
            0.6,
            false,
          )
        } else {
          const x = W / 2 + size * 0.7
          env.line(
            [
              [x, H / 2 - (span / 2) * e],
              [x, H / 2 + (span / 2) * e],
            ],
            sc.sub,
            lw,
            0.6,
            false,
          )
        }
      }
      if (Pm.caps) {
        const ls = labelSize(env)
        const cap = String(cut.lineText || cut.text)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
        if (!port) {
          label(env, cap, m, H / 2 - size * 0.62 - ls, {
            alpha: e * 0.9,
            size: ls,
            font: bodyF(env),
            track: 0.14,
          })
          label(
            env,
            `No.${pad2((cut.line | 0) + 1)}  ${fmtTime(cut.start)}`,
            W - m,
            H / 2 - size * 0.62 - ls,
            { alpha: e * 0.9, size: ls, align: 'right' },
          )
        } else {
          label(env, `No.${pad2((cut.line | 0) + 1)}`, W / 2 - size * 0.7, m - size * 0.9, {
            alpha: e * 0.9,
            size: ls,
            align: 'right',
          })
          label(env, fmtTime(cut.start), W / 2 + size * 0.7, H - m + size * 0.9, {
            alpha: e * 0.9,
            size: ls,
          })
        }
      }
    }
    return bb
  },
})

/* ================================================================== 14 tyStatCount — 字数表示 */
/** tyStatCount 的 plan 产物 */
type TyStatCountParams = {
  font: string
  nf: string
  acc: boolean
}

reg('tyStatCount', {
  tags: ['editorial', 'graphic'],
  ae: 'type',
  w: 0.8,
  fits: (n: number) => n >= 1 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      nf: rng.pick(fontsOf(st, ['display', 'mono'])),
      acc: rng.chance(0.5),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyStatCountParams,
      lt = env.lt
    const port = W < H,
      txt = String(cut.text).trim(),
      nG = glyphCount(txt)
    const mt = mainLines(txt, W, H, 8, 5),
      o = { lead: 1.2, track: 0.03 }
    const out = outK(env),
      lw = hair(env),
      ls = labelSize(env)
    const latin = ![...txt].some((ch) => ch.charCodeAt(0) > 0x7f)
    const cnt = Math.round(nG * E.outCubic(clamp((lt - 0.1) / 0.9)))
    const e = E.outExpo(clamp((lt - 0.05) / 0.7)) * out
    let it, nx, ny, ns
    if (!port) {
      const size = Math.min(fitSize(mt, Pm.font, W * 0.5, H * 0.54, o), H * 0.2)
      it = Object.assign(
        { text: mt, font: Pm.font, size, align: 'left', x: W * 0.08, y: H / 2, color: sc.fg },
        o,
      ) as TextItem
      const rx = W * 0.65
      if (e > 0)
        env.line(
          [
            [rx, H / 2 - H * 0.22 * e],
            [rx, H / 2 + H * 0.22 * e],
          ],
          sc.sub,
          lw,
          0.7,
          false,
        )
      nx = rx + W * 0.04
      ny = H / 2 - H * 0.05
      ns = H * 0.26
    } else {
      const size = Math.min(fitSize(mt, Pm.font, W * 0.84, H * 0.42, o), W * 0.18)
      it = Object.assign(
        { text: mt, font: Pm.font, size, align: 'left', x: W * 0.08, y: H * 0.36, color: sc.fg },
        o,
      ) as TextItem
      const ry = H * 0.62
      if (e > 0)
        env.line(
          [
            [W * 0.08, ry],
            [W * 0.08 + W * 0.84 * e, ry],
          ],
          sc.sub,
          lw,
          0.7,
          false,
        )
      nx = W * 0.08
      ny = ry + H * 0.1
      ns = W * 0.3
    }
    const bb = mainDraw(env, it)
    ns = Math.min(
      ns,
      (W * 0.93 - nx) / Math.max(0.3, measure({ text: '00', font: Pm.nf, size: 1 }).w),
    )
    if (e > 0) {
      env.draw({
        text: pad2(cnt),
        font: Pm.nf,
        size: ns,
        align: 'left',
        x: nx,
        y: ny,
        color: Pm.acc ? accentOn(sc) : sc.fg,
        alpha: e,
        ghost: false,
      })
      const y2 = ny + ns * 0.62
      label(env, latin ? 'CHARACTERS' : '文字 / CHARACTERS', nx, y2, {
        alpha: e,
        size: ls,
        font: latin ? monoF(env) : bodyF(env),
      })
      label(env, `LINE ${pad2((cut.line | 0) + 1)}  ─  ${fmtTime(cut.start)}`, nx, y2 + ls * 1.8, {
        alpha: e * 0.8,
        size: ls * 0.85,
      })
    }
    return bb
  },
})

/* ================================================================== 15 tyMargin — 余白 */
/** tyMargin 的 plan 产物 */
type TyMarginParams = {
  font: string
  pos: string
  mark: boolean
}

reg('tyMargin', {
  tags: ['calm', 'editorial', 'emotional'],
  ae: 'center',
  w: 0.8,
  emph: 0.4,
  fits: (n: number) => n >= 1 && n <= 18,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'body', 'display'])),
      pos: rng.pick(['bl', 'bl', 'tr', 'br', 'lc']),
      mark: rng.chance(0.7),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyMarginParams,
      lt = env.lt,
      M = Math.min(W, H)
    const port = W < H,
      txt = String(cut.text).trim()
    const mt = glyphCount(txt) > (port ? 9 : 14) ? splitL(txt, port ? 8 : 12) : txt
    const size = Math.min(
      M * 0.068,
      fitSize(mt, Pm.font, W * 0.66, H * 0.22, { track: 0.1, lead: 1.4 }),
    )
    const right = Pm.pos === 'tr' || Pm.pos === 'br'
    const y = Pm.pos === 'tr' ? H * 0.2 : Pm.pos === 'lc' ? H * 0.5 : H * 0.8
    const x = right ? W * 0.92 : W * 0.08
    const it: TextItem = {
      text: mt,
      font: Pm.font,
      size,
      x,
      y,
      align: right ? 'right' : 'left',
      track: 0.1,
      lead: 1.4,
      color: sc.fg,
    }
    const bb = mainDraw(env, it)
    const m = measure(it),
      out = outK(env),
      lw = hair(env),
      ls = labelSize(env) * 0.9
    const e = E.outExpo(clamp((lt - 0.2) / 0.9)) * out
    if (e > 0) {
      const tx0 = right ? x - m.w : x,
        tx1 = right ? x : x + m.w
      const ly = y - m.h / 2 - ls * 1.4
      label(env, `${pad2((cut.line | 0) + 1)}  —  ${fmtTime(cut.start)}`, right ? x : x, ly, {
        alpha: e * 0.9,
        size: ls,
        align: right ? 'right' : 'left',
      })
      const a0 = right ? tx0 - size * 0.8 : tx1 + size * 0.8,
        a1 = right ? W * 0.08 : W * 0.92
      if ((a1 - a0) * (right ? -1 : 1) > W * 0.05) {
        const yl = y + (glyphCount(mt) > 0 ? 0 : 0)
        env.line(
          [
            [a0, yl],
            [lerp(a0, a1, e), yl],
          ],
          sc.sub,
          lw,
          0.6,
          false,
        )
        if (Pm.mark) {
          const q = size * 0.16
          env.rect(lerp(a0, a1, e) - q / 2, yl - q / 2, q, q, accentOn(sc), e, false)
        }
      }
      const rom = romaOf(txt)
      if (rom)
        label(env, rom, right ? x : x, y + m.h / 2 + ls * 1.3, {
          alpha: e * 0.75,
          size: ls * 0.9,
          align: right ? 'right' : 'left',
          track: 0.3,
        })
    }
    return bb
  },
})

/* ================================================================== 16 tyRotBlock — 回転ブロック */
/** tyRotBlock 的 plan 产物 */
type TyRotBlockParams = {
  font: string
  fb: string
  rot: number
  accent: boolean
  rule: boolean
}

reg('tyRotBlock', {
  tags: ['graphic', 'pop', 'editorial'],
  ae: 'sideways',
  w: 1,
  fits: (n: number) => n >= 4 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      fb: rng.pick(fontsOf(st, ['display', 'serif'])),
      rot: rng.pick([-90, -90, 90]),
      accent: rng.chance(0.5),
      rule: rng.chance(0.8),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyRotBlockParams,
      lt = env.lt
    const port = W < H
    const arr = slotsOf(cut.text),
      n = arr.length
    const ws = (cut.words || []).map(String)
    let cutAt = Math.max(1, Math.round(n * 0.36))
    if (ws.length >= 2) {
      const l0 = [...ws[0].trim()].length
      if (l0 >= 1 && l0 <= Math.ceil(n * 0.55)) cutAt = l0
    }
    while (cutAt < n - 1 && (isKana(arr[cutAt]) || isPunct(arr[cutAt]))) cutAt++
    let A = arr.slice(0, cutAt).join('').trim() || arr[0],
      B = arr.slice(cutAt).join('').trim() || arr[n - 1]
    let labelA = false
    if (isLatinT(cut.text)) {
      // latin: split at a word gap; one word → the rotated block is a small line label
      const t = String(cut.text).trim(),
        sp = t.indexOf(' ')
      if (sp > 0) {
        A = t.slice(0, sp)
        B = t.slice(sp + 1).trim()
      } else {
        A = `LINE ${pad2((cut.line | 0) + 1)}`
        B = t
        labelA = true
      }
    }
    const Hb = port ? H * 0.44 : H * 0.62
    const wA100 = measure({ text: A, font: Pm.font, size: 100, track: 0.02 }).w
    const sizeA = Math.min(
      (Hb / wA100) * 100,
      port ? W * 0.3 : W * 0.24,
      labelA ? Math.min(W, H) * 0.06 : 1e9,
    )
    const gap = sizeA * 0.28
    const Wb = (port ? W * 0.86 : Math.min(W * 0.84, Hb * 2.4)) - sizeA - gap
    let best = null
    const nB = glyphCount(B)
    for (let Lc = 1; Lc <= 3; Lc++) {
      if (Lc > nB) break
      let bt = Lc === 1 ? B : splitL(B, Math.ceil(nB / Lc))
      if (Lc > 1 && isLatinT(B)) {
        const ws = B.split(/\s+/)
        if (ws.length < Lc) break
        bt = groupLines(
          ws.map((w: string, i: number) => (i ? ' ' : '') + w),
          Lc,
        ).join('\n')
      }
      const s = Math.min(fitSize(bt, Pm.fb, Wb, Hb, { lead: 1.08, track: 0.02 }), Hb * 0.6)
      if (!best || s > best.s * 1.05) best = { bt, s }
    }
    const B2 = best as NonNullable<typeof best>
    const mB = measure({ text: B2.bt, font: Pm.fb, size: B2.s, lead: 1.08, track: 0.02 })
    const wA = (wA100 * sizeA) / 100
    const tot = sizeA + gap + mB.w
    const xA = W / 2 - tot / 2 + sizeA / 2,
      xB = xA + sizeA / 2 + gap
    const out = outK(env),
      lw = hair(env)
    const bh = Math.max(wA, mB.h)
    if (Pm.rule) {
      const e = E.outExpo(clamp((lt - 0.1) / 0.6)) * out
      if (e > 0)
        env.line(
          [
            [xA + sizeA / 2 + gap / 2, H / 2 - (bh / 2) * e],
            [xA + sizeA / 2 + gap / 2, H / 2 + (bh / 2) * e],
          ],
          sc.sub,
          lw,
          0.7,
          false,
        )
    }
    const itA = {
      text: A,
      font: Pm.font,
      size: sizeA,
      x: xA,
      y: H / 2,
      rot: Pm.rot,
      track: 0.02,
      color: Pm.accent ? accentOn(sc) : sc.fg,
      mi: 0,
    }
    if (labelA)
      env.draw(
        Object.assign(itA, {
          font: monoF(env),
          color: sc.sub,
          alpha: E.outCubic(clamp(lt / 0.4)) * out,
          ghost: false,
        }),
      )
    else mainDraw(env, itA)
    mainDraw(env, {
      text: B2.bt,
      font: Pm.fb,
      size: B2.s,
      x: xB,
      y: H / 2,
      align: 'left',
      lead: 1.08,
      track: 0.02,
      color: sc.fg,
      mi: 3,
    })
    return bbRect(xA - sizeA / 2, H / 2 - bh / 2, xB + mB.w, H / 2 + bh / 2)
  },
})

/* ================================================================== 17 tySquare — 方形組 */
/** tySquare 的 plan 产物 */
type TySquareParams = {
  font: string
  order: string
  frame: boolean
  acc: boolean
}

reg('tySquare', {
  tags: ['graphic', 'editorial', 'pop'],
  ae: 'gridCells',
  w: 1,
  fits: (n: number) => n >= 3 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      order: rng.pick(['yoko', 'yoko', 'tate']),
      frame: rng.chance(0.75),
      acc: rng.chance(0.7),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TySquareParams,
      lt = env.lt,
      M = Math.min(W, H)
    const chars = [...clean(cut.text)],
      n = chars.length
    if (!n) return null
    const tate = Pm.order === 'tate'
    const a = Math.ceil(Math.sqrt(n)),
      b = Math.ceil(n / a)
    const cols = tate ? b : a,
      rows = tate ? a : b
    const cell = Math.min((W * 0.78) / cols, (H * 0.74) / rows, M * 0.3)
    const x0 = W / 2 - (cols * cell) / 2,
      y0 = H / 2 - (rows * cell) / 2
    const ki = keyIndex(chars, 'kanji')
    const out = outK(env),
      lw = hair(env),
      ls = labelSize(env)
    let bb: BBox | null = null
    const pos = (i: number) =>
      tate ? [cols - 1 - Math.floor(i / rows), i % rows] : [i % cols, Math.floor(i / cols)]
    for (let i = 0; i < cols * rows; i++) {
      const [c, r] = pos(i),
        x = x0 + (c + 0.5) * cell,
        y = y0 + (r + 0.5) * cell
      if (i < n)
        bb = U(
          bb,
          mainDraw(env, {
            text: chars[i],
            font: Pm.font,
            size: cell * 0.9,
            x,
            y,
            vertical: tate,
            color: Pm.acc && i === ki ? accentOn(sc) : sc.fg,
            mi: i,
          }),
        )
      else {
        const q = E.outBack(clamp((lt - 0.2 - i * 0.03) / 0.3), 2) * out,
          s = cell * 0.08
        if (q > 0) {
          env.line(
            [
              [x - s * q, y],
              [x + s * q, y],
            ],
            sc.sub,
            lw,
            0.8,
            false,
          )
          env.line(
            [
              [x, y - s * q],
              [x, y + s * q],
            ],
            sc.sub,
            lw,
            0.8,
            false,
          )
        }
      }
    }
    if (Pm.frame) {
      const e = E.outExpo(clamp((lt - 0.05) / 0.7)) * out
      if (e > 0) {
        const xa = x0,
          xb = x0 + cols * cell,
          g = cell * 0.12
        env.line(
          [
            [xa, y0 - g],
            [lerp(xa, xb, e), y0 - g],
          ],
          sc.fg,
          Math.max(2, lw * 2.4),
          0.9,
          false,
        )
        env.line(
          [
            [xb, y0 + rows * cell + g],
            [lerp(xb, xa, e), y0 + rows * cell + g],
          ],
          sc.sub,
          lw,
          0.8,
          false,
        )
        label(env, `${cols}×${rows}`, xb, y0 + rows * cell + g + ls * 1.1, {
          align: 'right',
          alpha: e,
          size: ls * 0.9,
        })
        label(env, tate ? '縦組' : 'YOKO', xa, y0 + rows * cell + g + ls * 1.1, {
          alpha: e * 0.8,
          size: ls * 0.9,
          font: tate ? bodyF(env) : monoF(env),
        })
      }
    }
    return bb
  },
})

/* ================================================================== 18 tyLineFocus — 行中強調 */
/** tyLineFocus 的 plan 产物 */
type TyLineFocusParams = {
  font: string
  mark: string
}

reg('tyLineFocus', {
  tags: ['editorial', 'emotional', 'calm'],
  ae: 'center',
  w: 1,
  fits: (n: number) => n >= 1 && n <= 16,
  plan(rng, _cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['serif', 'display', 'body'])),
      mark: rng.pick(['bar', 'bar', 'dot', 'box']),
    }
  },
  render(env) {
    const { W, H, sc } = env,
      cut = cutOf(env),
      Pm = cut.params as unknown as TyLineFocusParams,
      lt = env.lt,
      M = Math.min(W, H)
    const port = W < H
    const cutT = String(cut.text).trim()
    let line = String(cut.lineText || cutT).trim()
    if (glyphCount(line) > 36) line = cutT
    const nsI = (s: string, end: number) => [...s].slice(0, end).filter((c) => !/\s/.test(c)).length
    let s0,
      s1,
      same = false
    const at = line.indexOf(cutT)
    if (at < 0 || line === cutT) {
      line = cutT
      same = true
      const arr = [...line]
      let ki = keyIndex(arr, 'kanji')
      let ke = ki
      if (isHan(arr[ki])) while (ke + 1 < arr.length && isHan(arr[ke + 1])) ke++
      else {
        while (ke + 1 < arr.length && ke - ki < 2 && !isSp(arr[ke + 1]) && !isPunct(arr[ke + 1]))
          ke++
      }
      if (isLatinT(line)) {
        const re = /\S+/g
        let m,
          best = null
        while ((m = re.exec(line))) if (!best || m[0].length > best[0].length) best = m
        if (best) {
          ki = [...line.slice(0, best.index)].length
          ke = ki + [...best[0]].length - 1
        }
      }
      s0 = nsI(line, ki)
      s1 = nsI(line, ke + 1)
    } else {
      const pre = [...line.slice(0, at)].length
      s0 = nsI(line, pre)
      s1 = s0 + glyphCount(cutT)
    }
    const nAll = glyphCount(line)
    const mt =
      nAll > (port ? 7 : 12)
        ? splitL(line, Math.ceil(nAll / Math.ceil(nAll / (port ? 6 : 11))))
        : line
    const o = { lead: 1.7, track: 0.08 }
    const size = Math.min(fitSize(mt, Pm.font, W * 0.82, H * 0.56, o), M * 0.12)
    const it = Object.assign({ text: mt, font: Pm.font, size, x: W / 2, y: H / 2 }, o) as TextItem
    const gl = glyphPts(it),
      out = outK(env),
      ac = accentOn(sc)
    const dimA = E.outCubic(clamp(lt / 0.3)) * out
    let bb: BBox | null = null,
      j = 0
    const spanBy = new Map()
    gl.forEach((g, i: number) => {
      if (i >= s0 && i < s1) {
        bb = U(
          bb,
          mainDraw(env, { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: sc.fg, mi: j++ }),
        )
        const L = spanBy.get(g.li) || { a: 1e9, b: -1e9, g: [] }
        L.a = Math.min(L.a, g.x - g.w / 2)
        L.b = Math.max(L.b, g.x + g.w / 2)
        L.g.push(g)
        spanBy.set(g.li, L)
      } else if (dimA > 0)
        env.draw({
          text: g.ch,
          font: Pm.font,
          size,
          x: g.x,
          y: g.y,
          color: same ? sc.fg : sc.sub,
          alpha: dimA * (same ? 0.5 : 0.42),
          ghost: false,
        })
    })
    let k = 0
    for (const L of spanBy.values()) {
      const q = E.outExpo(clamp((lt - 0.25 - k * 0.1) / 0.5)) * out
      k++
      if (q <= 0) continue
      const y = L.g[0].y
      if (Pm.mark === 'bar')
        env.rect(L.a, y + size * 0.62, (L.b - L.a) * q, Math.max(3, size * 0.07), ac, 1, false)
      else if (Pm.mark === 'dot')
        L.g.forEach((g: LaidGlyph) =>
          env.circle(g.x, g.y - size * 0.72, size * 0.07 * q, ac, null, 0, 1, false),
        )
      else
        env.rrect(
          L.a - size * 0.14,
          y - size * 0.64,
          L.b - L.a + size * 0.28,
          size * 1.28,
          0,
          null,
          q,
          false,
          ac,
          Math.max(1.5, size * 0.03),
        )
    }
    return bb || bbRect(W * 0.3, H * 0.4, W * 0.7, H * 0.6)
  },
})

export const pack: PackParts = out
