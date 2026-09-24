/**
 * 字形度量与字形分解。
 *
 * decompose() 把一个字按 2 的幂分辨率栅格化，取 alpha 通道做 8 邻域连通域分析，
 * 得到"笔画/部件"级碎片精灵图；反锯齿边缘像素用两轮膨胀归入邻近碎片，细碎点并入
 * 最近的大碎片。碎片以 em 坐标记录中心与尺寸，因此任何字号都能按比例摆放。
 * 这是"分解→集合""爆散""崩落"等逐笔动效的基础。
 */
import type { Fragment, Glyph, GlyphPiece } from './types'
import { ctxOf, makeCanvas } from './canvas'
import { fontCSS } from './fonts'
import { rs } from './util'

const ALPHA_THRESHOLD = 60

/** 量字宽用的离屏画布：懒创建，这样纯逻辑（分词/规划）在 node 里也能 import */
let _measureCtx: CanvasRenderingContext2D | null = null
function measureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = ctxOf(makeCanvas(2, 2))
  return _measureCtx
}

/** 字符前进宽度（em 为单位，按 字体+字符 缓存） */
export const metrics = {
  m: new Map<string, number>(),
  clear(): void {
    this.m.clear()
  },
  adv(fontKey: string, ch: string): number {
    const key = `${fontKey}\u0000${ch}`
    const hit = this.m.get(key)
    if (hit !== undefined) return hit
    measureCtx().font = fontCSS(fontKey, 100)
    let v = measureCtx().measureText(ch).width / 100
    if (!(v > 0)) v = ch === ' ' ? 0.3 : 1
    this.m.set(key, v)
    return v
  },
}

type Box = { x0: number; y0: number; x1: number; y1: number; area: number }

let pieceId = 0

function rasterise(fontKey: string, ch: string, res: number): { alpha: Uint8Array; size: number } {
  const size = Math.ceil(res * 1.45)
  const cv = makeCanvas(size, size)
  const x = ctxOf(cv, { willReadFrequently: true })
  x.font = fontCSS(fontKey, res)
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillStyle = '#fff'
  x.fillText(ch, size / 2, size / 2)
  const img = x.getImageData(0, 0, size, size).data
  const alpha = new Uint8Array(size * size)
  for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3]
  return { alpha, size }
}

/** 连通域标记：返回标签图与每个碎片的包围盒（下标从 1 开始） */
function components(alpha: Uint8Array, size: number): { labels: Int32Array; boxes: Box[] } {
  const N = size * size
  const labels = new Int32Array(N)
  const stack = new Int32Array(N)
  const boxes: Box[] = []
  let nl = 0
  for (let i = 0; i < N; i++) {
    if (alpha[i] < ALPHA_THRESHOLD || labels[i]) continue
    nl += 1
    let sp = 0
    stack[sp++] = i
    labels[i] = nl
    let x0 = size
    let y0 = size
    let x1 = 0
    let y1 = 0
    let area = 0
    while (sp) {
      const p = stack[--sp]
      const px = p % size
      const py = (p / size) | 0
      area += 1
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy
        if (yy < 0 || yy >= size) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx
          if (xx < 0 || xx >= size) continue
          const q = yy * size + xx
          if (!labels[q] && alpha[q] >= ALPHA_THRESHOLD) {
            labels[q] = nl
            stack[sp++] = q
          }
        }
      }
    }
    boxes.push({ x0, y0, x1, y1, area })
  }
  boxes.unshift({ x0: 0, y0: 0, x1: 0, y1: 0, area: 0 })
  return { labels, boxes }
}

/** 把抗锯齿边缘像素并到相邻碎片上（两轮膨胀），包围盒随之扩大 */
function dilate(labels: Int32Array, alpha: Uint8Array, boxes: Box[], size: number): void {
  const N = size * size
  for (let pass = 0; pass < 2; pass++) {
    const next = labels.slice()
    for (let p = 0; p < N; p++) {
      if (labels[p] || !alpha[p]) continue
      const px = p % size
      const py = (p / size) | 0
      let lab = 0
      if (px > 0 && labels[p - 1]) lab = labels[p - 1]
      else if (px < size - 1 && labels[p + 1]) lab = labels[p + 1]
      else if (py > 0 && labels[p - size]) lab = labels[p - size]
      else if (py < size - 1 && labels[p + size]) lab = labels[p + size]
      if (!lab) continue
      next[p] = lab
      const b = boxes[lab]
      if (px < b.x0) b.x0 = px
      if (px > b.x1) b.x1 = px
      if (py < b.y0) b.y0 = py
      if (py > b.y1) b.y1 = py
    }
    labels.set(next)
  }
}

/** 噪点并入最近的大碎片，返回 原标签 -> 归并后标签 的映射 */
function mergeSpecks(boxes: Box[], nl: number, res: number): Int32Array {
  const minArea = res * res * 0.0012
  const remap = new Int32Array(nl + 1)
  for (let l = 1; l <= nl; l++) remap[l] = l
  for (let l = 1; l <= nl; l++) {
    const b = boxes[l]
    if (b.area >= minArea) continue
    let best = 0
    let bd = Number.POSITIVE_INFINITY
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    for (let m = 1; m <= nl; m++) {
      if (m === l || boxes[m].area < minArea) continue
      const o = boxes[m]
      const dx = Math.max(o.x0 - cx, 0, cx - o.x1)
      const dy = Math.max(o.y0 - cy, 0, cy - o.y1)
      const d = dx * dx + dy * dy
      if (d < bd) {
        bd = d
        best = m
      }
    }
    if (!best) continue
    remap[l] = best
    const o = boxes[best]
    o.x0 = Math.min(o.x0, b.x0)
    o.y0 = Math.min(o.y0, b.y0)
    o.x1 = Math.max(o.x1, b.x1)
    o.y1 = Math.max(o.y1, b.y1)
  }
  return remap
}

function pieceSprite(
  box: Box,
  labels: Int32Array,
  alpha: Uint8Array,
  size: number,
  label: number,
  res: number,
): GlyphPiece {
  const w = box.x1 - box.x0 + 1
  const h = box.y1 - box.y0 + 1
  const cv = makeCanvas(w, h)
  const x = ctxOf(cv)
  const id = x.createImageData(w, h)
  const d = id.data
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const p = (box.y0 + yy) * size + (box.x0 + xx)
      if (labels[p] === label) {
        const o = (yy * w + xx) * 4
        d[o] = d[o + 1] = d[o + 2] = 255
        d[o + 3] = alpha[p]
      }
    }
  }
  x.putImageData(id, 0, 0)
  pieceId += 1
  return {
    id: pieceId,
    cv,
    res,
    cx: ((box.x0 + box.x1 + 1) / 2 - size / 2) / res,
    cy: ((box.y0 + box.y1 + 1) / 2 - size / 2) / res,
    w: w / res,
    h: h / res,
    area: box.area / (res * res),
    frags: null,
  }
}

/** 把一个字形拆成笔画碎片精灵图 */
export function decompose(fontKey: string, ch: string, res: number): Glyph {
  const { alpha, size } = rasterise(fontKey, ch, res)
  const { labels, boxes } = components(alpha, size)
  const nl = boxes.length - 1
  dilate(labels, alpha, boxes, size)
  const remap = mergeSpecks(boxes, nl, res)
  for (let p = 0; p < labels.length; p++) {
    if (labels[p]) labels[p] = remap[labels[p]]
  }
  const pieces: GlyphPiece[] = []
  for (let l = 1; l <= nl; l++) {
    if (remap[l] !== l) continue
    pieces.push(pieceSprite(boxes[l], labels, alpha, size, l, res))
  }
  pieces.sort((a, b) => b.area - a.area)
  return { ch, res, pieces, frags: null }
}

function clipHalf(
  poly: readonly (readonly [number, number])[],
  nx: number,
  ny: number,
  d0: number,
  sgn: number,
): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = sgn * (nx * a[0] + ny * a[1] - d0)
    const db = sgn * (nx * b[0] + ny * b[1] - d0)
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** 把一个大碎片切成至多 3 块凸多边形（爆散用），坐标为围绕碎片中心的 em */
export function fragmentsOf(pc: GlyphPiece, seed: number): Fragment[] {
  if (pc.frags) return pc.frags
  const { w, h } = pc
  type Poly = readonly (readonly [number, number])[]
  let polys: Poly[] = [
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ],
  ]
  const cuts = Math.max(w, h) > 0.42 ? 2 : Math.max(w, h) > 0.2 ? 1 : 0
  for (let c = 0; c < cuts; c++) {
    const next: Poly[] = []
    for (const poly of polys) {
      const ang = (w > h ? Math.PI / 2 : 0) + rs(seed, pc.id, c) * 0.5
      const nx = Math.cos(ang)
      const ny = Math.sin(ang)
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
      const d0 = nx * cx + ny * cy + rs(seed, pc.id, c, 7) * 0.12 * Math.max(w, h)
      next.push(clipHalf(poly, nx, ny, d0, 1), clipHalf(poly, nx, ny, d0, -1))
    }
    polys = next.filter((p) => p.length >= 3)
  }
  pc.frags = polys.map((p) => ({
    poly: p,
    cx: p.reduce((s, q) => s + q[0], 0) / p.length,
    cy: p.reduce((s, q) => s + q[1], 0) / p.length,
  }))
  return pc.frags
}

/** 一个字形所有碎片（可选再切成爆散碎片） */
export function shatterList(glyph: Glyph, seed: number): GlyphPiece[] {
  if (glyph.frags) return glyph.frags
  const out: GlyphPiece[] = []
  for (const p of glyph.pieces) {
    const fr = fragmentsOf(p, seed)
    if (fr.length <= 1) {
      out.push(p)
      continue
    }
    for (const f of fr) {
      out.push({
        ...p,
        id: p.id * 8 + out.length,
        cx: p.cx + f.cx,
        cy: p.cy + f.cy,
        area: p.area / fr.length,
        frags: null,
        clip: f.poly,
        clipOx: f.cx,
        clipOy: f.cy,
      })
    }
  }
  glyph.frags = out
  return out
}

/**
 * 字形碎片缓存：按 (字体, 字符, 分辨率档) 缓存，超出上限批量淘汰。
 * sprite() 另存一层着色副本，色散三 pass 下同一碎片不换色就只生成一次。
 */
export class GlyphCache {
  private map = new Map<string, Glyph>()
  private tint = new Map<number, Map<string, HTMLCanvasElement>>()
  maxRes = 512

  clear(): void {
    this.map.clear()
    this.tint.clear()
  }

  /** 分辨率取 2 的幂档，让相邻字号共用同一份碎片 */
  bucket(px: number): number {
    let res = 64
    while (res < px && res < this.maxRes) res *= 2
    return res
  }

  get(fontKey: string, ch: string, px: number): Glyph {
    const res = this.bucket(px)
    const key = `${fontKey}|${ch}|${res}`
    let g = this.map.get(key)
    if (!g) {
      g = decompose(fontKey, ch, res)
      this.map.set(key, g)
      if (this.map.size > 1800) this.evict()
    }
    return g
  }

  private evict(): void {
    let n = 0
    for (const k of this.map.keys()) {
      this.map.delete(k)
      n += 1
      if (n > 600) break
    }
    this.tint.clear()
  }

  sprite(piece: GlyphPiece, color: string): HTMLCanvasElement {
    if (color === '#ffffff' || color === '#fff') return piece.cv
    let byColor = this.tint.get(piece.id)
    if (!byColor) {
      byColor = new Map()
      this.tint.set(piece.id, byColor)
    }
    let cv = byColor.get(color)
    if (!cv) {
      cv = makeCanvas(piece.cv.width, piece.cv.height)
      const x = ctxOf(cv)
      x.drawImage(piece.cv, 0, 0)
      x.globalCompositeOperation = 'source-in'
      x.fillStyle = color
      x.fillRect(0, 0, cv.width, cv.height)
      byColor.set(color, cv)
    }
    return cv
  }
}

export const glyphs = new GlyphCache()

/** 字体重新加载后清空所有依赖字形渲染结果的缓存 */
export function clearFontCaches(): void {
  metrics.clear()
  glyphs.clear()
}
