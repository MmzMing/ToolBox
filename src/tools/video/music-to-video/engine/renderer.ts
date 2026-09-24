/**
 * 逐帧渲染器：背景 → 背景图形 → 三条色散 pass 的内容层 → 转场 → HUD → 后期。
 *
 * 两个关键约定：
 *  1) 动作量化到"画格"（koma，默认 12 张/秒），所以 24/30/60fps 输出看起来都是
 *     手绘逐格动画的质感；抖动类随机数锁在 24Hz 时钟上，不随输出帧率变快。
 *  2) 色散用三个 pass 画同一镜：B 层滞后 1.6/24s、A 层滞后 0.8/24s、主层不滞后，
 *     A/B 只画轮廓色并按错位量偏移，于是快速动作自然带出红蓝边。
 */
import type {
  BeatInfo,
  BBox,
  CamState,
  Cut,
  Env,
  FrameOptions,
  Paint,
  Plan,
  Scheme,
  TextItem,
} from './types'
import { ctxOf, ensure, makeCanvas } from './canvas'
import { drawItem } from './draw'
import { komaOf, stepDur } from './planner'
import { BG, CAMERA, DECOR, FXE, LAYOUTS, TRANS } from './registry'
import { drawHUD } from './decor'
import { DEG, TAU, clamp, lum, r, rs } from './util'

/** 二分查找：t 落在哪个镜头里 */
function cutAt(plan: Plan, t: number): Cut | null {
  const cs = plan.cuts
  let lo = 0
  let hi = cs.length - 1
  let ans = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (cs[m].start <= t) {
      ans = m
      lo = m + 1
    } else hi = m - 1
  }
  if (ans < 0) return null
  const c = cs[ans]
  return t < c.end ? c : null
}

/** 节拍上下文：距上一拍多久、拍长、序号 */
export function beatAt(beats: number[], t: number): BeatInfo | null {
  let lo = 0
  let hi = beats.length - 1
  let i = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (beats[m] <= t) {
      i = m
      lo = m + 1
    } else hi = m - 1
  }
  if (i < 0) return null
  const len = i + 1 < beats.length ? beats[i + 1] - beats[i] : i > 0 ? beats[i] - beats[i - 1] : 0.5
  return { since: t - beats[i], len: Math.max(0.2, len), index: i }
}

function prevBeat(beats: number[], t: number): number | null {
  let lo = 0
  let hi = beats.length - 1
  let ans: number | null = null
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (beats[m] <= t) {
      ans = beats[m]
      lo = m + 1
    } else hi = m - 1
  }
  return ans
}

export class Renderer {
  private scratch = makeCanvas(2, 2)
  private small = makeCanvas(2, 2)
  private tiny = makeCanvas(2, 2)
  private camLayer: HTMLCanvasElement | null = null
  private transA: HTMLCanvasElement | null = null
  private transB: HTMLCanvasElement | null = null
  private transC: HTMLCanvasElement | null = null
  private paperCache = new Map<string, HTMLCanvasElement>()
  private grain: HTMLCanvasElement[] = []
  private scan: HTMLCanvasElement
  /** 部分浏览器/软件渲染下 ctx.filter 不可用，探测一次 */
  private filterOK: boolean

  constructor() {
    for (let k = 0; k < 4; k++) {
      const g = makeCanvas(256, 256)
      const x = ctxOf(g)
      const id = x.createImageData(256, 256)
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.random() * 255
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v
        id.data[i + 3] = 255
      }
      x.putImageData(id, 0, 0)
      this.grain.push(g)
    }
    this.scan = makeCanvas(1, 4)
    const sx = ctxOf(this.scan)
    sx.fillStyle = '#fff'
    sx.fillRect(0, 0, 1, 4)
    sx.fillStyle = '#000'
    sx.fillRect(0, 3, 1, 1)
    this.filterOK = (() => {
      try {
        const c = ctxOf(makeCanvas(4, 4))
        c.filter = 'blur(2px)'
        return c.filter === 'blur(2px)'
      } catch {
        return false
      }
    })()
  }

  ensure = ensure

  /** 纸张纹理（浅色风格用），按尺寸缓存 */
  paper(W: number, H: number): HTMLCanvasElement {
    const key = `${W}x${H}`
    const hit = this.paperCache.get(key)
    if (hit) return hit
    const w = Math.round(W / 2)
    const h = Math.round(H / 2)
    const p = makeCanvas(w, h)
    // 这张纸纹画完就要 getImageData 逐像素掺噪点，声明一次免得浏览器反复回读走慢路径
    const x = ctxOf(p, { willReadFrequently: true })
    x.fillStyle = '#fff'
    x.fillRect(0, 0, w, h)
    const lo = makeCanvas(Math.ceil(w / 24), Math.ceil(h / 24))
    const lx = ctxOf(lo)
    const ld = lx.createImageData(lo.width, lo.height)
    for (let i = 0; i < ld.data.length; i += 4) {
      const v = 225 + Math.random() * 30
      ld.data[i] = v
      ld.data[i + 1] = v - 2
      ld.data[i + 2] = v - 6
      ld.data[i + 3] = 255
    }
    lx.putImageData(ld, 0, 0)
    x.imageSmoothingEnabled = true
    x.globalAlpha = 0.9
    x.drawImage(lo, 0, 0, w, h)
    x.globalAlpha = 1
    const id = x.getImageData(0, 0, w, h)
    for (let i = 0; i < id.data.length; i += 4) {
      const nz = (Math.random() - 0.5) * 22
      id.data[i] += nz
      id.data[i + 1] += nz
      id.data[i + 2] += nz
    }
    x.putImageData(id, 0, 0)
    x.strokeStyle = 'rgba(120,110,100,0.18)'
    x.lineWidth = 0.7
    for (let i = 0; i < 900; i++) {
      const X = Math.random() * w
      const Y = Math.random() * h
      const a = Math.random() * TAU
      const L = 4 + Math.random() * 14
      x.beginPath()
      x.moveTo(X, Y)
      x.quadraticCurveTo(
        X + Math.cos(a + 0.5) * (L / 2),
        Y + Math.sin(a + 0.5) * (L / 2),
        X + Math.cos(a) * L,
        Y + Math.sin(a) * L,
      )
      x.stroke()
    }
    x.fillStyle = 'rgba(60,50,40,0.25)'
    for (let i = 0; i < 1400; i++)
      x.fillRect(Math.random() * w, Math.random() * h, Math.random() * 1.6, Math.random() * 1.6)
    this.paperCache.set(key, p)
    return p
  }

  /** 组装一次绘制所需的全部上下文与绘图原语 */
  private makeEnv(
    ctx: CanvasRenderingContext2D,
    plan: Plan,
    cut: Cut | null,
    sc: Scheme,
    o: {
      pass: 'main' | 'A' | 'B'
      passColor?: string | null
      t: number
      lt: number
      ltb: number
      step: number
      scale: number
      allowFilter: boolean
      energy: number | null
      beat: BeatInfo | null
      bgOnly?: boolean
    },
  ): Env {
    const W = plan.W
    const H = plan.H
    const ghost = o.pass !== 'main'
    /** g=false 表示该图元不参与色散残影（细线、标注之类保持原色） */
    const colOf = (c: Paint, g: boolean): Paint | null =>
      ghost ? (g ? (o.passColor ?? null) : null) : c
    const env: Env = {
      ctx,
      W,
      H,
      sc,
      st: plan.style,
      fx: plan.fx,
      fps: plan.fps,
      cut,
      plan,
      bgOnly: o.bgOnly,
      ...o,
      passColor: o.passColor ?? null,
      pIn: 1,
      pOut: 0,
      draw: (it: TextItem) => drawItem(env, it),
      rect: (x, y, w, h, c, a = 1, g = true) => {
        const col = colOf(c, g)
        if (!col || a <= 0) return
        ctx.globalAlpha = a
        ctx.fillStyle = col
        ctx.fillRect(x, y, w, h)
        ctx.globalAlpha = 1
      },
      line: (pts, c, lw = 1, a = 1, g = true) => {
        const col = colOf(c, g)
        if (!col || a <= 0 || pts.length < 2) return
        ctx.globalAlpha = a
        ctx.strokeStyle = col
        ctx.lineWidth = lw
        ctx.lineJoin = 'miter'
        ctx.lineCap = 'butt'
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
        ctx.stroke()
        ctx.globalAlpha = 1
      },
      polyPartial: (pts, e, c, lw = 1, a = 1, g = true) => {
        if (e <= 0) return
        let total = 0
        const seg: number[] = []
        for (let i = 1; i < pts.length; i++) {
          const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
          seg.push(d)
          total += d
        }
        let rem = total * clamp(e)
        const out: (readonly [number, number])[] = [pts[0]]
        for (let i = 1; i < pts.length && rem > 0; i++) {
          const d = seg[i - 1]
          if (rem >= d) {
            out.push(pts[i])
            rem -= d
          } else {
            const k = rem / d
            out.push([
              pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
            ])
            rem = 0
          }
        }
        env.line(out, c, lw, a, g)
      },
      circle: (cx, cy, rad, fill, stroke, lw = 1, a = 1, g = true) => {
        if (rad <= 0 || a <= 0) return
        const f = fill ? colOf(fill, g) : null
        const s = stroke ? colOf(stroke, g) : null
        if (!f && !s) return
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(cx, cy, rad, 0, TAU)
        if (f) {
          ctx.fillStyle = f
          ctx.fill()
        }
        if (s) {
          ctx.strokeStyle = s
          ctx.lineWidth = lw
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      },
      arc: (cx, cy, rad, a0, a1, c, lw = 1, a = 1, g = true) => {
        const col = colOf(c, g)
        if (!col || a <= 0 || rad <= 0) return
        ctx.globalAlpha = a
        ctx.strokeStyle = col
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.arc(cx, cy, rad, a0 * DEG, a1 * DEG)
        ctx.stroke()
        ctx.globalAlpha = 1
      },
      rrect: (x, y, w, h, rad, fill, a = 1, g = true, stroke = null, lw = 1) => {
        if (a <= 0 || w <= 0 || h <= 0) return
        const f = fill ? (ghost ? colOf(fill, g) : fill) : null
        const s = stroke ? colOf(stroke, g) : null
        if (!f && !s) return
        const rr = Math.min(rad, w / 2, h / 2)
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.moveTo(x + rr, y)
        ctx.arcTo(x + w, y, x + w, y + h, rr)
        ctx.arcTo(x + w, y + h, x, y + h, rr)
        ctx.arcTo(x, y + h, x, y, rr)
        ctx.arcTo(x, y, x + w, y, rr)
        ctx.closePath()
        if (f) {
          ctx.fillStyle = f
          ctx.fill()
        }
        if (s) {
          ctx.strokeStyle = s
          ctx.lineWidth = lw
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      },
      poly: (pts, c, a = 1, g = true) => {
        const col = colOf(c, g)
        if (!col || a <= 0) return
        ctx.globalAlpha = a
        ctx.fillStyle = col
        ctx.beginPath()
        pts.forEach((p2, i) => (i ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1])))
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      },
      blob: (pts, c, a = 1, g = true) => {
        const col = colOf(c, g)
        if (!col || a <= 0) return
        ctx.globalAlpha = a
        ctx.fillStyle = col
        ctx.beginPath()
        const n = pts.length
        const mid = (i: number): [number, number] => [
          (pts[i % n][0] + pts[(i + 1) % n][0]) / 2,
          (pts[i % n][1] + pts[(i + 1) % n][1]) / 2,
        ]
        const m0 = mid(0)
        ctx.moveTo(m0[0], m0[1])
        for (let i = 1; i <= n; i++) {
          const p2 = pts[i % n]
          const m = mid(i)
          ctx.quadraticCurveTo(p2[0], p2[1], m[0], m[1])
        }
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
      },
    }
    if (cut) {
      env.pIn = clamp(o.lt / Math.max(0.01, cut.inDur))
      env.pOut = cut.outDur > 0 ? clamp((o.lt - (cut.dur - cut.outDur)) / cut.outDur) : 0
    }
    return env
  }

  /** 一个镜头：后层装饰 → 构图 → 前层装饰 */
  private drawCut(env: Env): BBox | null {
    const cut = env.cut
    if (!cut) return null
    const L = LAYOUTS[cut.layout] ?? LAYOUTS.center
    const decor = cut.decor || []
    for (const d of decor) {
      const D = DECOR[d.id]
      if (D && D.layer === 'back') {
        try {
          D.draw(env, null, d)
        } catch (e) {
          console.warn('decor', d.id, e)
        }
      }
    }
    let bb: BBox | null = null
    try {
      bb = L.render(env)
    } catch (e) {
      console.warn('layout', cut.layout, e)
    }
    for (const d of decor) {
      const D = DECOR[d.id]
      if (D && D.layer === 'front') {
        try {
          D.draw(env, bb, d)
        } catch (e) {
          console.warn('decor', d.id, e)
        }
      }
    }
    return bb
  }

  /**
   * 主入口：把 t 时刻的画面画进 ctx（画布像素 = 设计尺寸 × scale）。
   * opt.fast 关掉一切滤镜以换取预览帧率；noPost/noHud/noTrans 供转场递归取"上一镜静帧"时用。
   */
  frame(ctx: CanvasRenderingContext2D, plan: Plan, t: number, opt: FrameOptions = {}): void {
    const W = plan.W
    const H = plan.H
    const scale = opt.scale || 1
    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const fx = plan.fx
    const st = plan.style
    const stepD = stepDur(fx, plan.fps)
    const clock = komaOf(fx) > 0 ? stepD : 1 / 24
    const tq = Math.floor(t / stepD + 1e-6) * stepD
    const mainCut = cutAt(plan, tq)
    const schemeIdx = mainCut ? mainCut.scheme % st.schemes.length : 0
    const sc = st.schemes[schemeIdx] ?? st.schemes[0]
    const allowFilter = this.filterOK && !opt.fast
    const u = H / 1080
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.clearRect(0, 0, cw, ch)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)

    if (!opt.transparent) {
      ctx.fillStyle = sc.bg
      ctx.fillRect(0, 0, W, H)
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6)
      g.addColorStop(0, lum(sc.bg) < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.10)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      const paperAmt = (sc.paper ? 1 : st.texture.paper || 0) * fx.texture
      if (paperAmt > 0.02) {
        const dark = lum(sc.bg) < 0.4
        ctx.globalCompositeOperation = dark ? 'screen' : 'multiply'
        ctx.globalAlpha = dark ? paperAmt * 0.06 : paperAmt * 0.85
        if (dark) ctx.filter = 'invert(1)'
        ctx.drawImage(this.paper(W, H), 0, 0, W, H)
        ctx.filter = 'none'
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }
    }

    // 事件叠加：色散与抖动按指数衰减，节拍脉冲单独算
    let spike = 0
    let shake = 0
    let beatPulse = 0
    for (const ev of plan.events) {
      if (ev.t > t) break
      const dt = (t - ev.t) * 24
      if (dt > 14) continue
      if (ev.type === 'chroma') spike += ev.amp * 0.55 ** dt
      else if (ev.type === 'shake') shake += ev.amp * 0.62 ** dt
    }
    if (plan.beats.length) {
      const b = prevBeat(plan.beats, t)
      if (b != null && t - b < 0.25) beatPulse = 0.9 * Math.exp(-(t - b) * 16)
    }
    const chroma = fx.chroma * (st.ghost ?? 1) * (1 + spike + beatPulse)
    const step = Math.floor(tq / clock + 1e-6)
    const beatInfo = plan.beats.length ? beatAt(plan.beats, tq) : null
    const energy = plan.energy
      ? plan.energy[clamp(Math.floor(t * plan.energyRate), 0, plan.energy.length - 1)]
      : null

    if (!opt.transparent && mainCut && mainCut.bg !== 'none' && BG[mainCut.bg]) {
      const env = this.makeEnv(ctx, plan, mainCut, sc, {
        pass: 'main',
        t: tq,
        lt: tq - mainCut.start,
        ltb: tq - mainCut.start,
        step,
        scale,
        allowFilter,
        energy,
        beat: beatInfo,
        bgOnly: true,
      })
      ctx.save()
      try {
        BG[mainCut.bg].draw(env, mainCut.bgP || {})
      } catch (e) {
        console.warn('bg', mainCut.bg, e)
      }
      ctx.restore()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.filter = 'none'
    }

    const shx = rs(step, 71) * shake * 16 * u
    const shy = rs(step, 72) * shake * 11 * u
    const passes: { pass: 'main' | 'A' | 'B'; lag: number; off: [number, number] }[] = [
      { pass: 'B', lag: 1.6 / 24, off: [-3.4 * chroma * u, -1.3 * chroma * u] },
      { pass: 'A', lag: 0.8 / 24, off: [3.2 * chroma * u, 1.9 * chroma * u] },
      { pass: 'main', lag: 0, off: [0, 0] },
    ]
    const ghostOn = fx.chroma > 0.02 && (st.ghost ?? 1) > 0.02 && !opt.noGhost

    // 相机模糊（焦点拉回）只对整个内容层做一次滤镜：逐字加 filter 在多条文字行时会直接卡死
    let layerBlur = 0
    let LX: CanvasRenderingContext2D | null = null
    if (allowFilter && mainCut && mainCut.cam !== 'push' && CAMERA[mainCut.cam]) {
      try {
        const e0 = this.makeEnv(ctx, plan, mainCut, sc, {
          pass: 'main',
          t: tq,
          lt: tq - mainCut.start,
          ltb: tq - mainCut.start,
          step,
          scale,
          allowFilter,
          energy,
          beat: beatInfo,
        })
        const c0 = CAMERA[mainCut.cam].get(e0, mainCut.camP || {})
        if (c0.blur && c0.blur > 0.4) layerBlur = c0.blur
      } catch {
        layerBlur = 0
      }
      if (layerBlur) {
        const layer = ensure(this.camLayer || (this.camLayer = makeCanvas(2, 2)), cw, ch)
        LX = ctxOf(layer)
        LX.setTransform(1, 0, 0, 1, 0, 0)
        LX.globalAlpha = 1
        LX.globalCompositeOperation = 'source-over'
        LX.filter = 'none'
        LX.clearRect(0, 0, cw, ch)
        LX.setTransform(scale, 0, 0, scale, 0, 0)
      }
    }

    for (const P of passes) {
      if (P.pass !== 'main' && !ghostOn) continue
      const tp = Math.max(0, tq - P.lag)
      const cut = P.lag ? cutAt(plan, tp) : mainCut
      if (!cut) continue
      const csc = st.schemes[cut.scheme % st.schemes.length] ?? st.schemes[0]
      const lt = tp - cut.start
      const X = LX || ctx
      const env = this.makeEnv(X, plan, cut, csc, {
        pass: P.pass,
        passColor: P.pass === 'A' ? csc.ghostA : P.pass === 'B' ? csc.ghostB : null,
        t: tp,
        lt,
        ltb: lt + P.lag,
        step: Math.floor(tp / clock + 1e-6),
        scale,
        allowFilter,
        energy,
        beat: beatInfo,
      })
      X.save()
      let cam: CamState
      const CD = CAMERA[cut.cam] || CAMERA.push
      try {
        cam = CD.get(env, cut.camP || {})
      } catch {
        cam = {}
      }
      const cs = cam.s ?? 1
      X.translate(W / 2 + shx + P.off[0] + (cam.x || 0), H / 2 + shy + P.off[1] + (cam.y || 0))
      if (cam.rot) X.rotate(cam.rot * DEG)
      if (cam.skx) X.transform(1, 0, Math.tan(cam.skx * DEG), 1, 0, 0)
      X.scale(cs * (cam.sx ?? 1), cs * (cam.sy ?? 1))
      X.translate(-W / 2, -H / 2)
      if (P.pass !== 'main')
        X.globalCompositeOperation = lum(csc.bg) > 0.55 ? 'multiply' : 'source-over'
      this.drawCut(env)
      X.restore()
    }
    if (LX) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.filter = `blur(${(layerBlur * scale).toFixed(1)}px)`
      ctx.drawImage(LX.canvas, 0, 0)
      ctx.restore()
    }

    // 转场：把上一镜的静帧与本镜画到两张离屏画布上再合成
    if (!opt.noTrans && mainCut && mainCut.trans && TRANS[mainCut.trans] && mainCut.index) {
      const lt = tq - mainCut.start
      const dur = mainCut.transDur || 0.35
      const prev = plan.cuts[mainCut.index - 1]
      if (lt < dur && prev && Math.abs(prev.end - mainCut.start) < 0.06) {
        const A = ensure(this.transA || (this.transA = makeCanvas(2, 2)), cw, ch)
        const B = ensure(this.transB || (this.transB = makeCanvas(2, 2)), cw, ch)
        const bx = ctxOf(B)
        bx.setTransform(1, 0, 0, 1, 0, 0)
        bx.globalCompositeOperation = 'copy'
        bx.drawImage(ctx.canvas, 0, 0)
        bx.globalCompositeOperation = 'source-over'
        this.frame(ctxOf(A), plan, Math.max(prev.start, prev.end - 1e-3), {
          ...opt,
          noTrans: true,
          noPost: true,
          noHud: true,
        })
        const psc = st.schemes[prev.scheme % st.schemes.length] ?? st.schemes[0]
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.filter = 'none'
        try {
          TRANS[mainCut.trans].draw(ctx, A, B, clamp(lt / dur), {
            cw,
            ch,
            sc,
            scPrev: psc,
            st,
            P: mainCut.transP || {},
            step,
            t,
            scale,
            allowFilter,
            seed: mainCut.seed | 0,
            tmp: (w, h) => ensure(this.transC || (this.transC = makeCanvas(2, 2)), w, h),
          })
        } catch (e) {
          console.warn('trans', mainCut.trans, e)
        }
        ctx.restore()
      }
    }

    if (plan.hud && !opt.noHud) {
      const env = this.makeEnv(ctx, plan, mainCut, sc, {
        pass: 'main',
        t: tq,
        lt: 0,
        ltb: 0,
        step,
        scale,
        allowFilter,
        energy,
        beat: beatInfo,
      })
      drawHUD(env, plan)
    }
    ctx.restore()
    if (!opt.noPost) this.post(ctx, plan, t, step, sc, scale, opt, allowFilter)
  }

  /** 后期：切片/色块/反相/闪白/变焦/马赛克 + 辉光 + 扫描线 + 颗粒 + 暗角 */
  private post(
    ctx: CanvasRenderingContext2D,
    plan: Plan,
    t: number,
    step: number,
    sc: Scheme,
    scale: number,
    opt: FrameOptions,
    allowFilter: boolean,
  ): void {
    const cw = ctx.canvas.width
    const ch = ctx.canvas.height
    const fx = plan.fx
    const st = plan.style
    const active = plan.events.filter(
      (ev) => t >= ev.t && t < ev.t + Math.max(ev.dur, 1 / plan.fps),
    )
    const needScratch =
      active.some(
        (ev) => ['slice', 'block', 'zoom', 'mosaic'].includes(ev.type) || FXE[ev.type]?.scratch,
      ) ||
      (!opt.fast && (st.glow || 0) > 0)
    const S = needScratch ? ensure(this.scratch, cw, ch) : null
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const copy = () => {
      if (!S) return
      const sx = ctxOf(S)
      sx.globalCompositeOperation = 'copy'
      sx.drawImage(ctx.canvas, 0, 0)
      sx.globalCompositeOperation = 'source-over'
    }
    // 随机抖动锁在 24Hz：输出 60fps 也不会让噪点跑得更快
    const clock24 = Math.floor(t * 24)
    for (const ev of active) {
      const k = (t - ev.t) / Math.max(ev.dur, 1e-3)
      const D = FXE[ev.type]
      if (D?.draw) {
        if (D.scratch) copy()
        try {
          D.draw(ctx, ev, k, {
            cw,
            ch,
            S,
            sc,
            st,
            step: clock24,
            t,
            scale,
            renderer: this,
            allowFilter,
            opt,
            tmp: (w, h) => ensure(this.tiny, w, h),
          })
        } catch (e) {
          console.warn('fx', ev.type, e)
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.filter = 'none'
        ctx.imageSmoothingEnabled = true
        continue
      }
      if (ev.type === 'slice' && S) {
        copy()
        const n = 6 + (clock24 % 7)
        let y = 0
        for (let i = 0; i < n && y < ch; i++) {
          const h = Math.max(2, ch * clamp(-0.06 + 0.12 * r(clock24, i, 1) + 0.06, 0.01, 0.12))
          const dx = r(clock24, i, 2) < 0.55 ? rs(clock24, i, 3) * cw * 0.06 * ev.amp : 0
          if (dx) ctx.drawImage(S, 0, y, cw, h, dx, y, cw, h)
          y += h + ch * clamp(r(clock24, i, 4) * 0.08, 0, 0.08)
        }
      } else if (ev.type === 'block' && S) {
        copy()
        for (let i = 0; i < 9; i++) {
          const w = cw * (0.05 + 0.25 * r(clock24, i, 5))
          const h = ch * (0.01 + 0.06 * r(clock24, i, 6))
          const x = r(clock24, i, 7) * (cw - w)
          const yy = r(clock24, i, 8) * (ch - h)
          const sx = clamp(x + rs(clock24, i, 9) * cw * 0.08, 0, cw - w)
          const sy = clamp(yy + rs(clock24, i, 10) * ch * 0.04, 0, ch - h)
          ctx.drawImage(S, sx, sy, w, h, x, yy, w, h)
          if (r(clock24, i, 11) < 0.35) {
            ctx.globalCompositeOperation = 'difference'
            ctx.fillStyle = r(clock24, i, 12) < 0.5 ? sc.ghostA : sc.ghostB
            ctx.fillRect(x, yy, w, h)
            ctx.globalCompositeOperation = 'source-over'
          }
        }
      } else if (ev.type === 'invert') {
        ctx.globalCompositeOperation = 'difference'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, cw, ch)
        ctx.globalCompositeOperation = 'source-over'
      } else if (ev.type === 'flash') {
        ctx.globalAlpha = (1 - k) ** 1.5 * 0.92
        ctx.fillStyle = lum(sc.bg) < 0.5 ? sc.fg : '#ffffff'
        ctx.fillRect(0, 0, cw, ch)
        ctx.globalAlpha = 1
      } else if (ev.type === 'zoom' && S) {
        copy()
        const a = ev.amp * (1 - k)
        for (let i = 1; i <= 6; i++) {
          const s = 1 + i * 0.022 * a
          ctx.globalAlpha = 0.2 * (1 - i / 7) * Math.min(1, a * 1.3)
          ctx.drawImage(S, cw / 2 - (cw * s) / 2, ch / 2 - (ch * s) / 2, cw * s, ch * s)
        }
        ctx.globalAlpha = 1
      } else if (ev.type === 'mosaic' && S) {
        copy()
        const T = ensure(
          this.tiny,
          Math.max(8, Math.round(cw / 42)),
          Math.max(8, Math.round(ch / 42)),
        )
        const tx = ctxOf(T)
        tx.imageSmoothingEnabled = true
        tx.drawImage(S, 0, 0, T.width, T.height)
        ctx.imageSmoothingEnabled = false
        ctx.globalAlpha = 0.85 * (1 - k)
        ctx.drawImage(T, 0, 0, cw, ch)
        ctx.globalAlpha = 1
        ctx.imageSmoothingEnabled = true
      }
    }
    const glow = (st.glow || 0.6) * 0.5 * fx.texture
    if (!opt.fast && allowFilter && glow > 0.05 && !opt.transparent) {
      const sw = Math.round(cw / 4)
      const sh = Math.round(ch / 4)
      const Sm = ensure(this.small, sw, sh)
      const sx = ctxOf(Sm)
      sx.filter = `blur(${Math.max(2, Math.round(sw / 160))}px)`
      sx.globalCompositeOperation = 'copy'
      sx.drawImage(ctx.canvas, 0, 0, sw, sh)
      sx.filter = 'none'
      sx.globalCompositeOperation = 'source-over'
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = glow * 0.55
      ctx.drawImage(Sm, 0, 0, cw, ch)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    if (!opt.transparent) {
      const scan = (st.texture.scan || 0) * fx.texture
      if (scan > 0.03) {
        const pat = ctx.createPattern(this.scan, 'repeat')
        const k = Math.max(1, Math.round(ch / 540))
        ctx.save()
        ctx.scale(k, k)
        ctx.globalCompositeOperation = 'multiply'
        ctx.globalAlpha = scan * 0.28
        if (pat) ctx.fillStyle = pat
        ctx.fillRect(0, 0, cw / k, ch / k)
        ctx.restore()
      }
      const gr = (st.texture.grain || 0) * fx.texture
      if (gr > 0.02) {
        const img = this.grain[((step % 4) + 4) % 4]
        const pat = ctx.createPattern(img, 'repeat')
        const k = Math.max(1, ch / 1080)
        const ox = r(step, 1) * 256
        const oy = r(step, 2) * 256
        ctx.save()
        ctx.scale(k, k)
        ctx.translate(-ox, -oy)
        if (pat) ctx.fillStyle = pat
        ctx.globalCompositeOperation = 'overlay'
        ctx.globalAlpha = gr * 0.2
        ctx.fillRect(0, 0, cw / k + 256, ch / k + 256)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = gr * 0.035
        ctx.fillRect(0, 0, cw / k + 256, ch / k + 256)
        ctx.restore()
      }
      const vg = ctx.createRadialGradient(
        cw / 2,
        ch / 2,
        Math.min(cw, ch) * 0.35,
        cw / 2,
        ch / 2,
        Math.hypot(cw, ch) * 0.62,
      )
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, `rgba(0,0,0,${0.28 * fx.texture})`)
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, cw, ch)
    }
    ctx.restore()
  }
}
