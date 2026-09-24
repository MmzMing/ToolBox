/**
 * 文本项绘制：逐字形变换 / 碎片模式 / 描边·立体·图案填充 / 分层模糊。
 *
 * 性能要点：模糊与投影只在 main pass 生效，并且整项先画进离屏层再一次模糊——
 * 对每个字形都设 filter 再乘上三条色散 pass，画一条多字歌词就要掉帧。
 */
import type { BBox, Env, GlyphPiece, LaidText, TextItem } from './types'
import { ctxOf, makeCanvas } from './canvas'
import { fontCSS } from './fonts'
import { glyphs, shatterList } from './glyphs'
import { DEG, TAU, clamp } from './util'
import { layoutText, measure } from './text-layout'

/** 图案填充缓存 */
const patternCache = new Map<string, HTMLCanvasElement>()

export function textPattern(
  ctx: CanvasRenderingContext2D,
  kind: NonNullable<TextItem['pattern']>,
  color: string,
  bg: string | undefined,
  size: number,
  scale: number,
): CanvasPattern | null {
  const cell = Math.max(3, Math.round(size * (kind === 'dots' ? 0.075 : 0.06)))
  const px = Math.max(2, Math.round(cell * scale))
  const key = `${kind}${color}${bg ?? ''}${px}`
  let cv = patternCache.get(key)
  if (!cv) {
    cv = makeCanvas(px, px)
    const x = ctxOf(cv)
    if (bg) {
      x.fillStyle = bg
      x.fillRect(0, 0, px, px)
    }
    x.fillStyle = color
    x.strokeStyle = color
    if (kind === 'dots') {
      x.beginPath()
      x.arc(px / 2, px / 2, px * 0.34, 0, TAU)
      x.fill()
    } else if (kind === 'stripes') {
      x.lineWidth = px * 0.38
      x.beginPath()
      x.moveTo(-px, px * 2)
      x.lineTo(px * 2, -px)
      x.moveTo(-px, px)
      x.lineTo(px, -px)
      x.moveTo(0, px * 2)
      x.lineTo(px * 2, 0)
      x.stroke()
    } else if (kind === 'hatch') {
      x.lineWidth = Math.max(1, px * 0.16)
      x.beginPath()
      x.moveTo(0, 0)
      x.lineTo(px, px)
      x.moveTo(px, 0)
      x.lineTo(0, px)
      x.stroke()
    } else if (kind === 'grid') {
      x.fillRect(0, 0, px, Math.max(1, px * 0.18))
      x.fillRect(0, 0, Math.max(1, px * 0.18), px)
    } else {
      x.fillRect(0, 0, px, Math.max(1, px * 0.45))
    }
    if (patternCache.size > 80) patternCache.clear()
    patternCache.set(key, cv)
  }
  const pat = ctx.createPattern(cv, 'repeat')
  if (pat && scale !== 1) pat.setTransform(new DOMMatrix().scale(1 / scale))
  return pat
}

/** 碎片模式：返回 true 表示确实按碎片画了（即存在位移） */
function drawPieces(
  env: Env,
  it: TextItem,
  g: LaidText[number],
  ch: string,
  gx: number,
  gy: number,
  crot: number,
  sx: number,
  sy: number,
  col: string,
  alpha: number,
  px: number,
): boolean {
  const fn = it.pieceFn
  if (!fn) return false
  const glyph = glyphs.get(it.font, ch, px)
  const list = it.shatter ? shatterList(glyph, it.seed || 1) : glyph.pieces
  if (!list.length) return false
  const size = it.size
  const res = glyph.res
  const cr = Math.cos(crot * DEG)
  const sr = Math.sin(crot * DEG)
  const moves: {
    t: ReturnType<NonNullable<TextItem['pieceFn']>>
    ox: number
    oy: number
    p: GlyphPiece
  }[] = []
  let moving = false
  for (let j = 0; j < list.length; j++) {
    const p = list[j]
    const ex = p.cx * size * sx
    const ey = p.cy * size * sy
    const ox = gx + ex * cr - ey * sr
    const oy = gy + ex * sr + ey * cr
    const t = fn(g.i, j, p, ox, oy, g)
    if (t !== null && t !== undefined) {
      const idle = t.dx === 0 && t.dy === 0 && t.rot === 0 && t.s === 1 && t.st === 1 && t.a === 1
      if (!idle) moving = true
    } else {
      moving = true
    }
    moves.push({ t, ox, oy, p })
  }
  if (!moving) return false
  const ctx = env.ctx
  for (const { t, ox, oy, p } of moves) {
    if (!t || t.a <= 0.003) continue
    const spr = glyphs.sprite(p, col)
    ctx.save()
    ctx.translate(ox + t.dx, oy + t.dy)
    if (t.st !== 1) {
      const d = t.sdir * DEG
      ctx.rotate(d)
      ctx.scale(t.st, 1 / Math.sqrt(t.st))
      ctx.rotate(-d)
    }
    ctx.rotate((crot + t.rot) * DEG)
    const k = (size / res) * t.s
    ctx.scale(sx * k, sy * k)
    ctx.globalAlpha = alpha * t.a
    if (p.clip) {
      ctx.beginPath()
      p.clip.forEach((q, qi) => {
        const X = (q[0] - (p.clipOx ?? 0)) * res
        const Y = (q[1] - (p.clipOy ?? 0)) * res
        if (qi) ctx.lineTo(X, Y)
        else ctx.moveTo(X, Y)
      })
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(
        spr,
        -(p.clipOx ?? 0) * res - (p.w * res) / 2,
        -(p.clipOy ?? 0) * res - (p.h * res) / 2,
      )
    } else {
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2)
    }
    ctx.restore()
  }
  return true
}

let layerCv: HTMLCanvasElement | null = null

/** 模糊/投影项：先整体画进离屏层，再对整层做一次滤镜 */
function drawItemLayered(env: Env, it: TextItem): BBox | null | undefined {
  const ctx = env.ctx
  const lay = it._lay || layoutText(it)
  const size = it.size
  const sx = it.sx || 1
  const sy = it.sy || 1
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const g of lay) {
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null
    if (c?.hide) continue
    const s = c && c.s != null ? Math.abs(c.s) : 1
    const gw = g.w * sx * s * (c?.sx ? Math.abs(c.sx) : 1)
    const gh = g.h * sy * s * (c?.sy ? Math.abs(c.sy) : 1)
    const rr = Math.max(gw, gh) * (c?.rot ? 0.75 : 0.55)
    const gx = g.x * sx + g.vx * sx + (c?.dx || 0)
    const gy = g.y * sy + g.vy * sy + (c?.dy || 0)
    x0 = Math.min(x0, gx - rr)
    x1 = Math.max(x1, gx + rr)
    y0 = Math.min(y0, gy - rr)
    y1 = Math.max(y1, gy + rr)
  }
  if (x0 > x1) return null
  const sh = it.shadow
  const ex = it.extrude
  const extra =
    (it.blur || 0) * 2.6 +
    size * 0.12 +
    (it.stroke || 0) +
    (sh ? (sh.blur || 0) * 1.3 + Math.abs(sh.dx || 0) + Math.abs(sh.dy || 0) : 0) +
    (ex ? Math.abs(ex.dx || 0) + Math.abs(ex.dy || 0) : 0)
  x0 -= extra
  y0 -= extra
  x1 += extra
  y1 += extra
  const T = ctx.getTransform()
  const k = Math.max(0.05, Math.hypot(T.a, T.b))
  const ow = Math.ceil((x1 - x0) * k)
  const oh = Math.ceil((y1 - y0) * k)
  if (ow < 2 || oh < 2 || ow * oh > ctx.canvas.width * ctx.canvas.height * 1.6) return undefined
  if (!layerCv) layerCv = makeCanvas(ow, oh)
  if (layerCv.width < ow || layerCv.height < oh) {
    layerCv.width = Math.max(ow, layerCv.width)
    layerCv.height = Math.max(oh, layerCv.height)
  }
  const L = ctxOf(layerCv)
  L.setTransform(1, 0, 0, 1, 0, 0)
  L.globalAlpha = 1
  L.globalCompositeOperation = 'source-over'
  L.filter = 'none'
  L.clearRect(0, 0, ow, oh)
  L.setTransform(k, 0, 0, k, -x0 * k, -y0 * k)
  const inner: TextItem = {
    ...it,
    x: 0,
    y: 0,
    rot: 0,
    skew: 0,
    blur: 0,
    shadow: undefined,
    _lay: lay,
  }
  const bb = drawItem({ ...env, ctx: L, inLayer: true, scale: k }, inner)
  ctx.save()
  ctx.translate(it.x, it.y)
  if (it.rot) ctx.rotate(it.rot * DEG)
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0)
  if (it.blend) ctx.globalCompositeOperation = it.blend
  if ((it.blur || 0) > 0.4) ctx.filter = `blur(${((it.blur || 0) * env.scale).toFixed(1)}px)`
  if (sh && env.pass === 'main') {
    ctx.shadowColor = sh.color || 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = (sh.blur || 0) * env.scale
    ctx.shadowOffsetX = (sh.dx || 0) * env.scale
    ctx.shadowOffsetY = (sh.dy || 0) * env.scale
  }
  ctx.drawImage(layerCv, 0, 0, ow, oh, x0, y0, ow / k, oh / k)
  ctx.restore()
  if (!bb) return null
  return {
    ...bb,
    x0: bb.x0 + it.x,
    y0: bb.y0 + it.y,
    x1: bb.x1 + it.x,
    y1: bb.y1 + it.y,
    cx: it.x,
    cy: it.y,
  }
}

/**
 * 画一个文本项，返回设计空间包围盒与逐字框（供 decor 定位）。
 * ghost pass（色散残影）只画轮廓色，跳过渐变/图案/投影等主层效果。
 */
export function drawItem(env: Env, it: TextItem): BBox | null {
  const ctx = env.ctx
  const ghostPass = env.pass !== 'main'
  if (ghostPass && it.ghost === false) return null
  if (!it.text || it.size <= 0.5) return null
  const blurPx = it.blur || 0
  const shadowPx = it.shadow && !ghostPass ? (it.shadow.blur || 0) * (env.scale || 1) : 0
  if (!env.inLayer && env.allowFilter && !it.pieceFn && (blurPx > 0.4 || shadowPx > 6)) {
    const r = drawItemLayered(env, it)
    if (r !== undefined) return r
  }
  const lay = it._lay || layoutText(it)
  const size = it.size
  const sx = it.sx || 1
  const sy = it.sy || 1
  const baseAlpha = (it.alpha ?? 1) * (ghostPass ? (it.ghostAlpha ?? 1) : 1)
  if (baseAlpha <= 0.002) return null
  const col = ghostPass ? env.passColor : it.color || '#fff'
  const sCol = ghostPass ? env.passColor : it.strokeColor || it.color || '#fff'
  if (!col || !sCol) return null
  const fill = it.fill !== false
  ctx.save()
  ctx.translate(it.x, it.y)
  if (it.rot) ctx.rotate(it.rot * DEG)
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0)
  if (it.blend) ctx.globalCompositeOperation = it.blend
  if (blurPx > 0.4 && env.allowFilter) ctx.filter = `blur(${(blurPx * env.scale).toFixed(1)}px)`
  ctx.font = fontCSS(it.font, size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let grad: CanvasGradient | CanvasPattern | null = null
  if (!ghostPass && it.gradient && fill) {
    const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5)
    const first = it.gradient[0]
    if (it.gradient.length === 2 && typeof first === 'string') {
      g.addColorStop(0, it.gradient[0] as string)
      g.addColorStop(1, it.gradient[1] as string)
    } else {
      for (const stop of it.gradient as readonly (readonly [number, string])[])
        g.addColorStop(stop[0], stop[1])
    }
    grad = g
  }
  if (!ghostPass && it.pattern && fill && !grad) {
    grad = textPattern(
      ctx,
      it.pattern,
      it.patternColor || it.color || '#fff',
      it.patternBg,
      size,
      env.scale || 1,
    )
  }
  const fillA = it.fillAlpha ?? 1
  const shadow = !ghostPass && it.shadow
  if (shadow) {
    const k = env.scale || 1
    ctx.shadowColor = shadow.color || 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = env.allowFilter ? (shadow.blur || 0) * k : 0
    ctx.shadowOffsetX = (shadow.dx || 0) * k
    ctx.shadowOffsetY = (shadow.dy || 0) * k
  }
  const ext = !ghostPass && it.extrude && it.extrude.n > 0 ? it.extrude : null
  const dash = it.dash != null && it.dash < 1 ? it.dash : null
  const boxes: BBox['boxes'] = []
  const pxScale = size * Math.max(sx, sy) * (env.scale || 1)
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null
    if (c?.hide) continue
    const a = baseAlpha * (c?.a ?? 1)
    if (a <= 0.002) continue
    const ch = c?.ch || g.ch
    const cs = c?.s ?? 1
    const gx = g.x * sx + g.vx * sx + (c?.dx || 0)
    const gy = g.y * sy + g.vy * sy + (c?.dy || 0)
    const crot = (c?.rot || 0) + (g.r90 ? 90 : 0)
    const csx = sx * cs * (c?.sx || 1)
    const csy = sy * cs * (c?.sy || 1)
    const gcol = (!ghostPass && c?.color) || col
    boxes.push({ x: gx, y: gy, w: g.w * sx * cs, h: g.h * sy * cs })
    const canPiece =
      !!it.pieceFn &&
      fill &&
      !c?.ch &&
      !it.gradient &&
      dash === null &&
      !(c && (c.clipY || c.clipX || c.outline))
    if (canPiece && drawPieces(env, it, g, ch, gx, gy, crot, csx, csy, gcol, a, pxScale * cs))
      continue
    ctx.save()
    ctx.translate(gx, gy)
    if (crot) ctx.rotate(crot * DEG)
    if (c?.skew) ctx.transform(1, 0, Math.tan(c.skew * DEG), 1, 0, 0)
    if (csx !== 1 || csy !== 1) ctx.scale(csx, csy)
    if (c && (c.clipY || c.clipX)) {
      const cy = c.clipY || [-0.7, 0.7]
      const cx = c.clipX || [-0.7, 0.7]
      ctx.beginPath()
      ctx.rect(cx[0] * g.w, cy[0] * g.h, (cx[1] - cx[0]) * g.w, (cy[1] - cy[0]) * g.h)
      ctx.clip()
    }
    if (c && (c.blur || 0) > 0.4 && env.allowFilter)
      ctx.filter = `blur(${((c.blur || 0) * env.scale).toFixed(1)}px)`
    ctx.globalAlpha = a
    const outlineOnly = !!c?.outline
    if (ext && !outlineOnly) {
      ctx.fillStyle = ext.color || '#000'
      const ea = ext.a ?? 1
      for (let k = ext.n; k >= 1; k--) {
        ctx.globalAlpha = a * ea * (ext.fade ? 1 - ((k - 1) / ext.n) * 0.85 : 1)
        ctx.fillText(ch, (ext.dx * k) / ext.n / csx, (ext.dy * k) / ext.n / csy)
      }
      ctx.globalAlpha = a
    }
    if (fill && !outlineOnly && fillA > 0.002 && dash === null) {
      ctx.globalAlpha = a * fillA
      ctx.fillStyle = grad || gcol
      ctx.fillText(ch, 0, 0)
      ctx.globalAlpha = a
    }
    if ((it.stroke || 0) > 0 || outlineOnly || dash !== null) {
      if (shadow && fill) ctx.shadowColor = 'rgba(0,0,0,0)'
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.lineWidth =
        (it.stroke && it.stroke > 0 ? it.stroke : Math.max(1, size * 0.02)) /
        Math.sqrt(Math.abs(csx * csy))
      ctx.strokeStyle = (!ghostPass && c?.color) || sCol
      if (dash !== null) {
        const L = size * 3.2
        ctx.setLineDash([Math.max(0.01, L * dash), L])
        ctx.lineDashOffset = 0
      } else if (it.strokeDash) ctx.setLineDash(it.strokeDash)
      ctx.strokeText(ch, 0, 0)
      ctx.setLineDash([])
      if (fill && !outlineOnly && (it.strokeUnder || (dash !== null && fillA > 0.002))) {
        ctx.globalAlpha = a * (dash !== null ? fillA : 1)
        ctx.fillStyle = grad || gcol
        ctx.fillText(ch, 0, 0)
      }
    }
    ctx.restore()
  }
  ctx.restore()
  if (!boxes.length) return null
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const b of boxes) {
    x0 = Math.min(x0, b.x - b.w / 2)
    x1 = Math.max(x1, b.x + b.w / 2)
    y0 = Math.min(y0, b.y - b.h / 2)
    y1 = Math.max(y1, b.y + b.h / 2)
  }
  return { x0: it.x + x0, y0: it.y + y0, x1: it.x + x1, y1: it.y + y1, boxes, cx: it.x, cy: it.y }
}

/** 项目包围盒（设计空间，未旋转） */
export function itemBox(it: TextItem): {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  h: number
  cx: number
  cy: number
} {
  const m = it._m || measure(it)
  const x0 = it.vertical
    ? it.x - m.w / 2
    : it.align === 'left'
      ? it.x
      : it.align === 'right'
        ? it.x - m.w
        : it.x - m.w / 2
  const y0 = it.vertical && it.align === 'left' ? it.y : it.y - m.h / 2
  return { x0, y0, x1: x0 + m.w, y1: y0 + m.h, w: m.w, h: m.h, cx: x0 + m.w / 2, cy: y0 + m.h / 2 }
}

export { clamp }
