/**
 * 图形装饰层（decor）+ HUD 叠层。
 *
 * 装饰是挂在单个镜头（cut）上的一次性图形部件：back 层在文字之前画（拿不到包围盒），
 * front 层在文字画完后拿包围盒画。每个实例的参数（seed / 数量 / 靠边 / 强调色…）由
 * planner 生成，绘制过程完全确定性，所以同一 seed 必然画出同一套图形（逐帧导出可复现）。
 */
import type { BBox, DecorDef, Env, Plan } from './types'
import { DEG, E, TAU, clamp, fmtTime, hash, lerp, noise1, r, rr, rs } from './util'

/** 装饰只关心包围盒的四边与中心（fallback 框没有逐字框） */
type Box = Pick<BBox, 'x0' | 'y0' | 'x1' | 'y1' | 'cx' | 'cy'>
type Pt = readonly [number, number]

/** 没有文字包围盒时的默认锚点框：画面中央 */
function center(env: Env, bb: BBox | null): Box {
  return (
    bb ?? {
      x0: env.W * 0.35,
      x1: env.W * 0.65,
      y0: env.H * 0.4,
      y1: env.H * 0.6,
      cx: env.W / 2,
      cy: env.H / 2,
    }
  )
}

/** 等宽字体（坐标读数、条码、HUD 都用它） */
function monoF(env: Env): string {
  return env.st.fonts.mono[0] || 'mono'
}

/** 通用出现曲线：入场缓出 ×（尚未开始出场） */
function inOut(env: Env): number {
  return E.outCubic(clamp(env.lt / 0.3)) * (1 - E.inCubic(env.pOut))
}

/** 核心形状池（cross 不在池内，留给参数化变体） */
const SHAPE_POOL = ['circle', 'square', 'tri', 'halftone', 'halftone', 'ring', 'ring'] as const

export const DECOR: Record<string, DecorDef> = {
  /* ---------------- 背层 ---------------- */

  /* 网格：等距细线铺满整屏 */
  grid: {
    layer: 'back',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const g = H / (p.n || 8)
      const a = 0.12 * inOut(env)
      if (a <= 0) return
      for (let x = (W / 2) % g; x < W; x += g)
        env.line(
          [
            [x, 0],
            [x, H],
          ],
          sc.sub,
          1,
          a,
          false,
        )
      for (let y = (H / 2) % g; y < H; y += g)
        env.line(
          [
            [0, y],
            [W, y],
          ],
          sc.sub,
          1,
          a,
          false,
        )
    },
  },

  /* 斜条纹：角落里一组 -35° 平行带，随拍横向流动 */
  stripes: {
    layer: 'back',
    draw(env, _bb, p) {
      const { W, H, sc, ctx } = env
      const e = inOut(env)
      if (e <= 0) return
      ctx.save()
      ctx.translate(p.corner ? W * 0.85 : W * 0.15, p.corner ? H * 0.15 : H * 0.85)
      ctx.rotate(-35 * DEG)
      const w = H * 0.04
      for (let i = -6; i <= 6; i++) {
        const x = i * w * 2 - w / 2 + ((env.ltb * 40) % (w * 2))
        env.rect(x, -H * 0.18 * e, w, H * 0.36 * e, p.accent ? sc.accent : sc.dim, 0.9, false)
      }
      ctx.restore()
    },
  },

  /* 墨渍：边缘随机抖动的有机色块 */
  blobs: {
    layer: 'back',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const s = p.seed
      const e = E.outBack(clamp(env.lt / 0.35), 1.2) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return
      for (let k = 0; k < (p.n || 2); k++) {
        const cx = rr(W * 0.12, W * 0.88, s, k, 1)
        const cy = rr(H * 0.15, H * 0.85, s, k, 2)
        const R = rr(H * 0.06, H * 0.16, s, k, 3) * e
        const m = 14
        const pts: Pt[] = []
        for (let i = 0; i < m; i++) {
          const a = (i / m) * TAU
          const rad = R * (0.72 + 0.5 * r(s, k, i, 4) + 0.08 * Math.sin(env.ltb * 3 + i))
          pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad])
        }
        env.blob(pts, k % 2 ? sc.accent : sc.accent2 || sc.accent, 0.95, true)
      }
    },
  },

  /* 粗带：从画面左右边缘探进来的手绘感横条，首条用强调色 */
  bars: {
    layer: 'back',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const s = p.seed
      const n = p.n || 3
      for (let k = 0; k < n; k++) {
        const e = E.outExpo(clamp((env.lt - k * 0.05) / 0.3)) * (1 - E.inExpo(env.pOut))
        if (e <= 0) continue
        const y = H * (r(s, k, 11) < 0.5 ? rr(0.1, 0.27, s, k, 1) : rr(0.73, 0.9, s, k, 1))
        const h = H * rr(0.03, 0.08, s, k, 2)
        const fromL = r(s, k, 3) < 0.5
        const w = W * rr(0.35, 0.75, s, k, 4) * e
        const x0 = fromL ? -10 : W + 10 - w
        const pts: Pt[] = []
        const m = 10
        for (let i = 0; i <= m; i++)
          pts.push([x0 + (w * i) / m, y - h / 2 + rs(s, k, i, 5) * h * 0.08])
        pts.push([x0 + w + rs(s, k, 6) * h * 0.4, y + h * 0.1])
        for (let i = m; i >= 0; i--)
          pts.push([x0 + (w * i) / m, y + h / 2 + rs(s, k, i, 7) * h * 0.08])
        env.poly(pts, k === 0 ? sc.accent : sc.ink, 0.92, true)
      }
    },
  },

  /* 形状：上下边缘漂浮的小几何体（圆/方/三角/网点/圆环） */
  shapes: {
    layer: 'back',
    draw(env, _bb, p) {
      const { W, H, sc, ctx } = env
      const s = p.seed
      const n = p.n || 5
      for (let k = 0; k < n; k++) {
        const q =
          E.outBack(clamp((env.lt - r(s, k, 9) * 0.3) / 0.25), 1.8) * (1 - E.inCubic(env.pOut))
        if (q <= 0) continue
        const type: string = SHAPE_POOL[Math.floor(r(s, k, 1) * 7)]
        const top = r(s, k, 4) < 0.5
        const x = rr(W * 0.05, W * 0.95, s, k, 2) + env.ltb * rs(s, k, 3) * 30
        const y =
          (top ? rr(H * 0.06, H * 0.24, s, k, 10) : rr(H * 0.76, H * 0.94, s, k, 10)) +
          env.ltb * rs(s, k, 5) * 20
        const rad = rr(H * 0.018, H * 0.06, s, k, 6) * q
        const rot = (r(s, k, 7) * 360 + env.ltb * rs(s, k, 8) * 60) * DEG
        const col = [sc.accent, sc.accent2 || sc.fg, sc.ink, sc.fg][k % 4]
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        if (type === 'circle') env.circle(0, 0, rad, col, null, 0, 1, true)
        else if (type === 'ring') env.circle(0, 0, rad, null, col, Math.max(2, rad * 0.12), 1, true)
        else if (type === 'square') env.rect(-rad, -rad, rad * 2, rad * 2, col, 1, true)
        else if (type === 'tri')
          env.poly(
            [
              [0, -rad],
              [rad * 0.9, rad * 0.6],
              [-rad * 0.9, rad * 0.6],
            ],
            col,
            1,
            true,
          )
        else if (type === 'cross') {
          env.rect(-rad, -rad * 0.18, rad * 2, rad * 0.36, col, 1, true)
          env.rect(-rad * 0.18, -rad, rad * 0.36, rad * 2, col, 1, true)
        } else {
          // 网点：中心大、向外收小的 7×7 圆点阵
          const d = rad / 3.2
          for (let i = -3; i <= 3; i++) {
            for (let j = -3; j <= 3; j++) {
              const dot = d * 0.45 * (1 - (Math.abs(i) + Math.abs(j)) / 8)
              if (dot > 0.5) env.circle(i * d, j * d, dot, col, null, 0, 1, true)
            }
          }
        }
        ctx.restore()
      }
    },
  },

  /* 大数字：镜头序号，或 from → to 的计数动画 */
  counter: {
    layer: 'back',
    draw(env, _bb, p) {
      const cut = env.cut
      if (!cut) return
      const { W, H, sc } = env
      const a = inOut(env)
      if (a <= 0) return
      const num =
        p.mode === 'count'
          ? String(Math.floor(lerp(p.from, p.to, E.outCubic(clamp(env.lt / (cut.dur * 0.8))))))
          : String(((cut.index ?? 0) | 0) + 1).padStart(2, '0')
      env.draw({
        text: num,
        font: env.st.fonts.display[0],
        size: H * 0.5,
        x: p.right ? W * 0.86 : W * 0.14,
        y: H * (p.low ? 0.72 : 0.3),
        color: p.accent ? sc.accent : sc.dim,
        alpha: a * (p.accent ? 0.9 : 1),
        ghost: false,
      })
    },
  },

  /* ---------------- 前层 ---------------- */

  /* 四角括号：向文字框收拢的取景角标 */
  brackets: {
    layer: 'front',
    draw(env, bb, p) {
      const box = center(env, bb)
      const { sc } = env
      const e = E.outExpo(clamp(env.lt / 0.35)) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return
      const pad = 18 + (box.y1 - box.y0) * 0.12
      const x0 = box.x0 - pad
      const x1 = box.x1 + pad
      const y0 = box.y0 - pad
      const y1 = box.y1 + pad
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const X0 = lerp(cx, x0, e)
      const X1 = lerp(cx, x1, e)
      const Y0 = lerp(cy, y0, e)
      const Y1 = lerp(cy, y1, e)
      const L = Math.min(x1 - x0, y1 - y0) * 0.16 + 8
      const c = p.accent ? sc.accent : sc.fg
      const w = 2.2
      env.line(
        [
          [X0, Y0 + L],
          [X0, Y0],
          [X0 + L, Y0],
        ],
        c,
        w,
        1,
      )
      env.line(
        [
          [X1 - L, Y0],
          [X1, Y0],
          [X1, Y0 + L],
        ],
        c,
        w,
        1,
      )
      env.line(
        [
          [X0, Y1 - L],
          [X0, Y1],
          [X0 + L, Y1],
        ],
        c,
        w,
        1,
      )
      env.line(
        [
          [X1 - L, Y1],
          [X1, Y1],
          [X1, Y1 - L],
        ],
        c,
        w,
        1,
      )
    },
  },

  /* 坐标圆：环绕文字的开口圆弧，圆点上标 X/Y 读数 */
  rings: {
    layer: 'front',
    draw(env, bb, p) {
      const box = center(env, bb)
      const { H, sc } = env
      const s = p.seed
      const e = E.outExpo(clamp(env.lt / 0.5)) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return
      const cx = (box.x0 + box.x1) / 2
      const cy = (box.y0 + box.y1) / 2
      const R0 = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.55 + H * 0.05
      for (let k = 0; k < (p.n || 2); k++) {
        const R = R0 * (1 + k * 0.28 + r(s, k, 1) * 0.1)
        const a0 = r(s, k, 2) * 360 + env.ltb * (k % 2 ? -14 : 10)
        env.arc(cx, cy, R, a0, a0 + 360 * e * (0.55 + 0.45 * r(s, k, 3)), sc.fg, 1.2, 0.7, false)
        const pa = (a0 + 40) * DEG
        const px = cx + Math.cos(pa) * R
        const py = cy + Math.sin(pa) * R
        env.circle(px, py, 4, sc.accent, null, 0, 1, false)
        env.draw({
          text: `X${Math.round(px)} Y${Math.round(py)}`,
          font: monoF(env),
          size: clamp(H * 0.015, 10, 18),
          align: 'left',
          x: px + 10,
          y: py - 12,
          color: sc.sub,
          alpha: e,
          ghost: false,
        })
      }
    },
  },

  /* 点环：绕文字旋转的一圈点，每第 6 个放大并换成强调色 */
  dots: {
    layer: 'front',
    draw(env, bb, _p) {
      const box = center(env, bb)
      const { H, sc } = env
      const e = inOut(env)
      if (e <= 0) return
      const cx = (box.x0 + box.x1) / 2
      const cy = (box.y0 + box.y1) / 2
      const R = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.62 + H * 0.04
      const m = 36
      for (let i = 0; i < m * e; i++) {
        const a = ((i / m) * 360 + env.ltb * 20) * DEG
        const big = i % 6 === 0
        env.circle(
          cx + Math.cos(a) * R,
          cy + Math.sin(a) * R,
          big ? 4 : 2.2,
          big ? sc.accent : sc.fg,
          null,
          0,
          0.85,
          false,
        )
      }
    },
  },

  /* 箭头：文字两侧指向正文的 V 形；big 时角落再补一支大箭头 */
  arrows: {
    layer: 'front',
    draw(env, bb, p) {
      const box = center(env, bb)
      const { W, H, sc } = env
      const e = E.outExpo(clamp(env.lt / 0.4)) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return
      const cy = (box.y0 + box.y1) / 2
      const s = clamp(H * 0.03, 14, 40)
      const gap = s * 0.9
      for (const side of [-1, 1]) {
        const xEdge = side < 0 ? box.x0 - s * 1.2 : box.x1 + s * 1.2
        for (let i = 0; i < 3; i++) {
          const on = (env.step + i) % 3 !== 0
          const x = xEdge + side * (i * gap + (1 - e) * W * 0.2)
          const d = -side // V 形朝文字开口
          env.line(
            [
              [x - d * s * 0.35, cy - s * 0.5],
              [x + d * s * 0.35, cy],
              [x - d * s * 0.35, cy + s * 0.5],
            ],
            i === 0 ? sc.accent : sc.fg,
            Math.max(2, s * 0.14),
            on ? 1 : 0.3,
            false,
          )
        }
      }
      if (p.big) {
        const x = p.right ? W * 0.9 : W * 0.1
        const y = H * (p.low ? 0.82 : 0.2)
        const L = H * 0.1 * e
        const dx = p.right ? -1 : 1
        const dy = p.low ? -1 : 1
        env.line(
          [
            [x, y],
            [x + dx * L, y + dy * L],
          ],
          sc.fg,
          Math.max(3, H * 0.008),
          1,
          true,
        )
        env.line(
          [
            [x + dx * L * 0.45, y + dy * L],
            [x + dx * L, y + dy * L],
            [x + dx * L, y + dy * L * 0.55],
          ],
          sc.fg,
          Math.max(3, H * 0.008),
          1,
          true,
        )
      }
    },
  },

  /* 斜线：横穿画面的少量直切线，出场时被擦掉 */
  slash: {
    layer: 'front',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const s = p.seed
      for (let k = 0; k < (p.n || 1); k++) {
        const e = E.outExpo(clamp((env.lt - k * 0.06) / 0.35))
        if (e <= 0) continue
        const ang = rr(-70, -20, s, k, 1) * DEG
        const cx = rr(W * 0.3, W * 0.7, s, k, 2)
        const cy = rr(H * 0.3, H * 0.7, s, k, 3)
        const L = Math.hypot(W, H)
        const x0 = cx - (Math.cos(ang) * L) / 2
        const y0 = cy - (Math.sin(ang) * L) / 2
        const t0 = env.pOut > 0 ? E.inCubic(env.pOut) : 0
        env.line(
          [
            [x0 + Math.cos(ang) * L * t0, y0 + Math.sin(ang) * L * t0],
            [x0 + Math.cos(ang) * L * e, y0 + Math.sin(ang) * L * e],
          ],
          k ? sc.accent : sc.fg,
          k ? 2 : 1.4,
          0.9,
          true,
        )
      }
    },
  },

  /* 火花：三/四角小星芒，逐个弹出来 */
  sparks: {
    layer: 'front',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const s = p.seed
      for (let k = 0; k < (p.n || 6); k++) {
        const q = E.outBack(clamp((env.lt - r(s, k, 1) * 0.4) / 0.2), 2) * (1 - E.inCubic(env.pOut))
        if (q <= 0) continue
        const x = rr(W * 0.05, W * 0.95, s, k, 2)
        const y = rr(H * 0.08, H * 0.92, s, k, 3)
        const rad = rr(H * 0.015, H * 0.04, s, k, 4) * q
        const rot = env.ltb * rs(s, k, 5) * 3 + r(s, k, 6) * 3
        const arms = r(s, k, 7) < 0.5 ? 3 : 4
        for (let a = 0; a < arms; a++) {
          const an = rot + (a * Math.PI) / arms
          env.line(
            [
              [x - Math.cos(an) * rad, y - Math.sin(an) * rad],
              [x + Math.cos(an) * rad, y + Math.sin(an) * rad],
            ],
            k % 3 === 0 ? sc.accent : sc.fg,
            Math.max(1.5, rad * 0.14),
            1,
            true,
          )
        }
      }
    },
  },

  /* 引出线：从文字角点折出去的两条标注线（本行注释 / 行号·时间码） */
  leaders: {
    layer: 'front',
    draw(env, bb, p) {
      const cut = env.cut
      if (!cut) return
      const box = center(env, bb)
      const { W, H, sc } = env
      const s = p.seed
      const e = E.outExpo(clamp((env.lt - 0.1) / 0.45)) * (1 - E.inCubic(env.pOut))
      if (e <= 0) return
      // 没有罗马音引擎，第一条标注退回本行自己的注释/原文
      const labels = [
        cut.note || cut.lineText,
        'No.' + String((cut.line | 0) + 1).padStart(2, '0') + ' / ' + fmtTime(cut.start),
        cut.note || '─',
      ]
      const fs = clamp(H * 0.018, 11, 20)
      const anchors: Pt[] = [
        [box.x1, box.y0],
        [box.x0, box.y1],
        [box.x1, box.y1],
      ]
      for (let k = 0; k < 2; k++) {
        const [ax, ay] = anchors[k]
        const tx = clamp(ax + (k === 1 ? -1 : 1) * W * rr(0.06, 0.14, s, k, 1), W * 0.06, W * 0.94)
        const ty = clamp(ay + (k === 0 ? -1 : 1) * H * rr(0.08, 0.16, s, k, 2), H * 0.08, H * 0.92)
        env.polyPartial(
          [
            [ax, ay],
            [tx, ty],
            [tx + (k === 1 ? -1 : 1) * W * 0.05, ty],
          ],
          e,
          sc.sub,
          1.2,
          1,
          false,
        )
        env.circle(ax, ay, 3.5, sc.accent, null, 0, e, false)
        env.draw({
          text: labels[k],
          font: k === 0 ? env.st.fonts.body[0] : monoF(env),
          size: fs,
          align: k === 1 ? 'right' : 'left',
          x: tx + (k === 1 ? -1 : 1) * W * 0.055,
          y: ty - fs * 0.9,
          track: 0.06,
          color: sc.fg,
          alpha: e,
          ghost: false,
        })
      }
    },
  },

  /* 波形：随响度包络起伏的锯齿线 */
  waveform: {
    layer: 'front',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const e = inOut(env)
      if (e <= 0) return
      const y = H * (p.low ? 0.86 : 0.14)
      const n = 120
      const pts: Pt[] = []
      const en = env.energy != null ? env.energy : 0.5
      for (let i = 0; i <= n; i++) {
        const u = i / n
        const x = lerp(W * 0.18, W * 0.82, u)
        const fade = Math.sin(u * Math.PI)
        const amp =
          H * 0.035 * fade * (0.35 + en) * (0.5 + 0.5 * noise1(u * 18 + env.t * 9, p.seed))
        pts.push([x, y + (i % 2 ? amp : -amp)])
      }
      env.polyPartial(pts, e, sc.fg, 1.4, 0.9, false)
    },
  },

  /* 条码：随机宽度的竖条 + 一串编号 */
  barcode: {
    layer: 'front',
    draw(env, _bb, p) {
      const { W, H, sc } = env
      const s = p.seed
      const e = inOut(env)
      if (e <= 0) return
      const x0 = p.right ? W * 0.84 : W * 0.06
      const y0 = p.low ? H * 0.84 : H * 0.07
      const h = H * 0.05
      let x = x0
      for (let i = 0; i < 34; i++) {
        const w = 1 + Math.floor(r(s, i, 1) * 3.2)
        if (r(s, i, 2) < 0.62) env.rect(x, y0, w * e, h, sc.fg, 0.9, false)
        x += w + 1.5
      }
      env.draw({
        text: String(hash(s, 5) % 1e9).padStart(9, '0'),
        font: monoF(env),
        size: clamp(H * 0.014, 9, 16),
        align: 'left',
        x: x0,
        y: y0 + h + 12,
        color: sc.fg,
        alpha: e * 0.9,
        ghost: false,
        track: 0.2,
      })
    },
  },
}

export const DECOR_ORDER = [
  'brackets',
  'rings',
  'dots',
  'arrows',
  'slash',
  'sparks',
  'leaders',
  'waveform',
  'barcode',
  'grid',
  'stripes',
  'blobs',
  'bars',
  'shapes',
  'counter',
]

/**
 * HUD 叠层：四角框线 + 曲名/歌手 + REC 闪烁 + 时间码 + 歌词进度。
 *
 * 注意：'REC' / 'LYRIC' / 'UNTITLED' 这类字面量是画进视频画面里的装饰文字
 * （录像风格的一部分），不是网站界面文案，所以不接 i18n。
 */
export function drawHUD(env: Env, plan: Plan): void {
  const { W, H, sc } = env
  const m = Math.round(H * 0.045)
  const L = H * 0.035
  const c = sc.sub
  const fs = clamp(H * 0.016, 10, 18)
  const mono = monoF(env)
  const lw = 1.4
  env.line(
    [
      [m, m + L],
      [m, m],
      [m + L, m],
    ],
    c,
    lw,
    0.9,
    false,
  )
  env.line(
    [
      [W - m - L, m],
      [W - m, m],
      [W - m, m + L],
    ],
    c,
    lw,
    0.9,
    false,
  )
  env.line(
    [
      [m, H - m - L],
      [m, H - m],
      [m + L, H - m],
    ],
    c,
    lw,
    0.9,
    false,
  )
  env.line(
    [
      [W - m - L, H - m],
      [W - m, H - m],
      [W - m, H - m - L],
    ],
    c,
    lw,
    0.9,
    false,
  )
  const title = (plan.title || 'UNTITLED') + (plan.artist ? ' / ' + plan.artist : '')
  env.draw({
    text: title,
    font: env.st.fonts.body[0],
    size: fs,
    align: 'left',
    x: m + L * 0.6,
    y: m + L * 0.9,
    color: c,
    track: 0.12,
    ghost: false,
  })
  const rec = env.step % 4 < 2
  if (rec) env.circle(W - m - L * 2.6, m + L * 0.9, fs * 0.32, sc.accent, null, 0, 1, false)
  env.draw({
    text: 'REC',
    font: mono,
    size: fs,
    align: 'left',
    x: W - m - L * 2.2,
    y: m + L * 0.9,
    color: c,
    ghost: false,
    track: 0.1,
  })
  env.draw({
    text: fmtTime(env.t, plan.fps),
    font: mono,
    size: fs,
    align: 'left',
    x: m + L * 0.6,
    y: H - m - L * 0.9,
    color: c,
    ghost: false,
    track: 0.1,
  })
  const li = env.cut ? (env.cut.line | 0) + 1 : 0
  env.draw({
    text: `LYRIC ${String(li).padStart(2, '0')}/${String(plan.lines.length).padStart(2, '0')}`,
    font: mono,
    size: fs,
    align: 'right',
    x: W - m - L * 0.6,
    y: H - m - L * 0.9,
    color: c,
    ghost: false,
    track: 0.1,
  })
  const u = plan.duration > 0 ? clamp(env.t / plan.duration) : 0
  env.line(
    [
      [W * 0.3, H - m - L * 0.9],
      [W * 0.7, H - m - L * 0.9],
    ],
    c,
    1,
    0.35,
    false,
  )
  env.line(
    [
      [W * 0.3, H - m - L * 0.9],
      [lerp(W * 0.3, W * 0.7, u), H - m - L * 0.9],
    ],
    sc.accent,
    2,
    0.9,
    false,
  )
}
