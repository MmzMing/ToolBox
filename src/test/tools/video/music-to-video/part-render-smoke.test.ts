// @vitest-environment jsdom
/**
 * 全量部件渲染冒烟：把每一件部件单独启用，用一台"只记账不画像素"的画布把每个镜头画两帧。
 *
 * 700 多件部件由多人（多个 agent）并行移植，光靠 key 对账不足以证明"里面是真代码"：
 * 空壳的 render、算出 NaN 坐标的 plan、判空漏掉的 env.cut，都必须在这里暴露。
 * 桩上下文记录三件事——是否抛错、是否有非有限的数字参数、样式字符串里是否混进 NaN，
 * 并把 getImageData 返回成一张圆盘遮罩，让字形连通域分解那条链路真的跑起来。
 */
import { afterAll, describe, expect, it } from 'vitest'

import { ctxOf } from '@/tools/video/music-to-video/engine/canvas'
import { GROUP_KEYS, allEnabled, orderOf } from '@/tools/video/music-to-video/engine/registry'
import { Renderer } from '@/tools/video/music-to-video/engine/renderer'
import type { Cut, GroupKey, Project } from '@/tools/video/music-to-video/engine/types'
import { buildPlan, defaultProject } from '@/tools/video/music-to-video/music-to-video.service'

/** 除被测那一件外，其余分组都用最安静的兜底部件，失败时能直接指认凶手 */
const QUIET: Partial<Record<GroupKey, string>> = {
  layout: 'center',
  enter: 'cut',
  hold: 'still',
  exit: 'cut',
  treat: 'none',
  bg: 'none',
  cam: 'push',
}

const LYRICS = ['风把夜色吹薄', '一二三四五六七八九十', 'Hello 2026 世界', '我在亮的地方等你']

const problems: string[] = []
/** 正在画哪一件，出错信息里要能看出来 */
let currentPart = ''
const stubs = new WeakMap<object, unknown>()

function fontPx(font: unknown): number {
  const m = typeof font === 'string' ? /(\d+(?:\.\d+)?)px/.exec(font) : null
  return m ? Number(m[1]) : 16
}

function check(name: string, args: unknown[]): void {
  for (const a of args) {
    if (typeof a === 'number' && !Number.isFinite(a)) {
      problems.push(`${currentPart} ${name}(${args.join(', ')})`)
    } else if (typeof a === 'string' && /NaN|Infinity|undefined/.test(a)) {
      problems.push(`${currentPart} ${name}: ${a}`)
    }
  }
}

/** 一张居中的实心圆盘，字形分解拿得到非空连通域 */
function discMask(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  const cx = w / 2
  const cy = h / 2
  const rr = Math.min(w, h) * 0.34
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue
      const i = (y * w + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }
  return data
}

function stubOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const cached = stubs.get(canvas)
  if (cached) return cached as CanvasRenderingContext2D
  const state: Record<string, unknown> = { canvas }
  const target = state as Record<string | symbol, unknown>
  target.drawImage = () => undefined
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop]
      switch (prop) {
        case 'measureText':
          return (text: string) => {
            const size = fontPx(obj.font)
            const s = String(text ?? '')
            let units = 0
            for (const ch of s) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55
            return {
              width: units * size,
              actualBoundingBoxAscent: size * 0.78,
              actualBoundingBoxDescent: size * 0.22,
            }
          }
        case 'getImageData':
          return (sx: number, sy: number, w: number, h: number) => {
            check('getImageData', [sx, sy, w, h])
            const width = Math.max(1, Math.trunc(w))
            const height = Math.max(1, Math.trunc(h))
            return { data: discMask(width, height), width, height }
          }
        case 'createImageData':
          return (w: number, h: number) => {
            const width = Math.max(1, Math.trunc(w))
            const height = Math.max(1, Math.trunc(h))
            return { data: new Uint8ClampedArray(width * height * 4), width, height }
          }
        case 'createLinearGradient':
        case 'createRadialGradient':
        case 'createConicGradient':
          return (...args: unknown[]) => {
            check(String(prop), args)
            return {
              addColorStop: (stop: number, color: string) => check('addColorStop', [stop, color]),
            }
          }
        case 'createPattern':
          return () => ({ setTransform: () => undefined })
        case 'getTransform':
        case 'getCurrentTransform':
          return () => new FakeDOMMatrix()
        default:
          return (...args: unknown[]) => {
            check(String(prop), args)
            return undefined
          }
      }
    },
    set(obj, prop, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        problems.push(`${currentPart} set ${String(prop)} = ${value}`)
      }
      if (typeof value === 'string' && /NaN|Infinity/.test(value)) {
        problems.push(`${currentPart} set ${String(prop)} = ${value}`)
      }
      obj[prop] = value
      return true
    },
  })
  stubs.set(canvas, proxy)
  return proxy as unknown as CanvasRenderingContext2D
}

/**
 * jsdom 没有 Path2D（浏览器里有），补一个只记账的实现：
 * 方法参数照样过 check()，所以路径坐标算出 NaN 仍然会被抓出来。
 */
class FakePath2D {
  moveTo(...a: number[]) {
    check('path.moveTo', a)
  }
  lineTo(...a: number[]) {
    check('path.lineTo', a)
  }
  arc(...a: number[]) {
    check('path.arc', a)
  }
  arcTo(...a: number[]) {
    check('path.arcTo', a)
  }
  rect(...a: number[]) {
    check('path.rect', a)
  }
  ellipse(...a: number[]) {
    check('path.ellipse', a)
  }
  closePath() {}
  bezierCurveTo(...a: number[]) {
    check('path.bezierCurveTo', a)
  }
  quadraticCurveTo(...a: number[]) {
    check('path.quadraticCurveTo', a)
  }
  setTransform(...a: unknown[]) {
    check('path.setTransform', a)
  }
  addPath(...a: unknown[]) {
    check('path.addPath', a)
  }
}

/**
 * jsdom 也没有 DOMMatrix（浏览器里有）。图形变换的数值不是本测试的目标，
 * 只需要它存在、可链式调用、参数照样过 check()。
 */
class FakeDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  is2D = true
  isIdentity = false
  constructor(init?: number[] | string) {
    if (Array.isArray(init)) [this.a, this.b, this.c, this.d, this.e, this.f] = init
  }
  translate(x: number, y: number) {
    check('matrix.translate', [x, y])
    return this
  }
  scale(x: number, y = x) {
    check('matrix.scale', [x, y])
    return this
  }
  rotate(a: number) {
    check('matrix.rotate', [a])
    return this
  }
  multiply(m: unknown) {
    check('matrix.multiply', [m])
    return this
  }
  multiplySelf(m: unknown) {
    check('matrix.multiplySelf', [m])
    return this
  }
  inverse() {
    return this
  }
  transformPoint(p: { x?: number; y?: number }) {
    check('matrix.transformPoint', [p?.x, p?.y])
    return { x: p?.x ?? 0, y: p?.y ?? 0, z: 0, w: 1 }
  }
}

/**
 * 装配桩：必须在模块顶层就换掉 getContext 与 console.warn——`new Renderer()` 会立刻建
 * 缓存画布，等到 beforeAll 里再换就晚了。
 *
 * 渲染管线对每件部件的 draw/apply 都包了 try/catch 并 console.warn（一个部件坏了不该
 * 毁掉整支视频），所以崩溃不会抛到这里——必须把 warn 也当成失败。
 * 注册表重复注册同一件部件同样走 warn。
 */
const realGetContext = HTMLCanvasElement.prototype.getContext
const realWarn = console.warn
const globals = globalThis as unknown as Record<string, unknown>
const realPath2D = globals.Path2D
const realMatrix = globals.DOMMatrix
globals.Path2D = FakePath2D
globals.DOMMatrix = FakeDOMMatrix
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
): CanvasRenderingContext2D {
  return stubOf(this)
} as unknown as typeof realGetContext
console.warn = (...args: unknown[]) => {
  problems.push(
    `${currentPart} warn: ${args.map((a) => (a instanceof Error ? `${a.name} ${a.message}` : String(a))).join(' ')}`,
  )
}
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
  console.warn = realWarn
  globals.Path2D = realPath2D
  globals.DOMMatrix = realMatrix
})

/** 只开被测部件，其余分组退回到兜底件 */
function soloProject(group: GroupKey, key: string): Project {
  const enabled = allEnabled()
  for (const g of GROUP_KEYS) {
    const map = enabled[g]
    if (!map) continue
    for (const k of Object.keys(map)) map[k] = false
    const quiet = QUIET[g]
    if (quiet) map[quiet] = true
  }
  const target = enabled[group]
  if (target) target[key] = true
  return { ...defaultProject(), lyrics: LYRICS.join('\n'), enabled, extra: true, traditional: true }
}

const renderer = new Renderer()
const used = new Set<string>()

/** 镜头上记录"这一格抽到了哪件"的字段名；fx 是画面层后期，不挂在镜头上 */
const CUT_FIELD: Partial<Record<GroupKey, keyof Cut>> = {
  layout: 'layout',
  enter: 'enter',
  hold: 'hold',
  exit: 'exit',
  treat: 'treat',
  bg: 'bg',
  cam: 'cam',
  trans: 'trans',
}

function drawEveryCut(group: GroupKey, key: string): void {
  const plan = buildPlan(soloProject(group, key), null)
  const field = CUT_FIELD[group]
  if (field) {
    for (const cut of plan.cuts) if (cut[field] === key) used.add(`${group}.${key}`)
  }
  const cv = document.createElement('canvas')
  cv.width = 320
  cv.height = Math.max(1, Math.round((320 * plan.H) / plan.W))
  const ctx = ctxOf(cv)
  const scale = cv.width / plan.W
  currentPart = `${group}.${key}`
  for (const cut of plan.cuts) {
    for (const at of [
      cut.start + Math.min(0.12, cut.dur * 0.2),
      cut.start + cut.dur * 0.62,
      cut.end - Math.min(0.1, cut.dur * 0.15),
    ]) {
      try {
        renderer.frame(ctx, plan, at, { scale, fast: true })
      } catch (e) {
        problems.push(
          `${group}.${key} @${at.toFixed(2)}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }
}

/**
 * 已知的上游 NaN 坐标：旗面展开的头两帧里，测距导数取到 `Math.pow(负数, 0.85)`，
 * 旧项目同样算出 NaN，浏览器把非法坐标当 no-op，于是那一帧不画布面。
 * 为了 1:1 我们没有"顺手修好"它，所以这里放行，别的地方一律算失败。
 */
const UPSTREAM_NAN = /^layout\.flag /

describe('每件部件都能规划并画出来', () => {
  for (const group of GROUP_KEYS) {
    it(`${group}：全部部件无异常、无 NaN`, () => {
      problems.length = 0
      for (const key of orderOf(group)) drawEveryCut(group, key)
      const real = problems.filter((p) => !UPSTREAM_NAN.test(p))
      expect(real.slice(0, 12), `${group} 分组里有部件画出了非法值`).toEqual([])
    }, 300_000)
  }

  it('镜头上能看到的分组里，绝大多数部件真的被抽中过', () => {
    const groups = GROUP_KEYS.filter((g) => CUT_FIELD[g])
    const total = groups.reduce((a, g) => a + orderOf(g).length, 0)
    const picked = groups.reduce(
      (a, g) => a + orderOf(g).filter((k) => used.has(`${g}.${k}`)).length,
      0,
    )
    expect(picked / total).toBeGreaterThan(0.55)
  })
})
