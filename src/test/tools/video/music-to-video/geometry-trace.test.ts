// @vitest-environment jsdom
/**
 * 几何轨迹对账（可选门）：把旧 JIZURA 的源码在同一台"录账画布"上跑一遍，
 * 与本仓库的实现对逐条绘制指令。只比对"指令名 + 数值参数"，不比文字与颜色，
 * 因此中文适配（换字体、换假名池为汉字、换日文装饰串）不会造成误报，
 * 而真正的几何偏差（坐标、半径、旋转、缩放算错或漏搬）会暴露出来。
 *
 * 需要参考项目在本地：D:/my-tools/tools-music/JIZURA。取不到时整份跳过，
 * 不影响没有检出新项目的机器与 CI。
 */
import fs from 'node:fs'
import vm from 'node:vm'

import { afterAll, describe, expect, it } from 'vitest'

import { LAYOUTS } from '@/tools/video/music-to-video/engine/registry'
import { STYLES as OUR_STYLES } from '@/tools/video/music-to-video/engine/styles'

const REF = 'D:/my-tools/tools-music/JIZURA/src'
const HAS_REF = fs.existsSync(REF)

/** 一次运行里收集到的绘制指令 */
let trace: string[] = []

const NUM_OPS = [
  'moveTo',
  'lineTo',
  'arc',
  'arcTo',
  'rect',
  'fillRect',
  'strokeRect',
  'clearRect',
  'translate',
  'scale',
  'rotate',
  'quadraticCurveTo',
  'bezierCurveTo',
  'ellipse',
  'setTransform',
  'transform',
  'createLinearGradient',
  'createRadialGradient',
]
const VOID_OPS = [
  'beginPath',
  'closePath',
  'fill',
  'stroke',
  'clip',
  'save',
  'restore',
  'setLineDash',
  'putImageData',
]

const n = (v: unknown): string =>
  typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(1) : 'X') : 'N'

/** 造一块只记账的画布；prefix 用来标记是哪一侧画的 */
function recCanvas(prefix: string) {
  const cv: Record<string, unknown> = {
    width: 300,
    height: 150,
    style: {},
    getContext: () => ctx,
  }
  const ctx: Record<string, unknown> = {
    canvas: cv,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '100px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    filter: 'none',
    shadowBlur: 0,
    shadowColor: '#000',
    imageSmoothingEnabled: true,
    measureText: (text: string) => ({
      width:
        [...String(text ?? '')].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.55), 0) *
        100,
      actualBoundingBoxAscent: 78,
      actualBoundingBoxDescent: 22,
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
      width: w,
      height: h,
    }),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
      width: w,
      height: h,
    }),
    createPattern: () => ({ setTransform: () => undefined }),
    getTransform: () => {
      const m = {
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
        translate: () => m,
        scale: () => m,
        rotate: () => m,
        multiply: () => m,
        multiplySelf: () => m,
        inverse: () => m,
      }
      return m
    },
    drawImage: (...args: unknown[]) => {
      trace.push(
        `${prefix}.drawImage(${args
          .filter((a) => typeof a === 'number')
          .map(n)
          .join(',')})`,
      )
    },
    fillText: (text: string, ...rest: unknown[]) => {
      trace.push(`${prefix}.fillText(${rest.map(n).join(',')}|${[...String(text)].length})`)
    },
    strokeText: (text: string, ...rest: unknown[]) => {
      trace.push(`${prefix}.strokeText(${rest.map(n).join(',')}|${[...String(text)].length})`)
    },
  }
  for (const op of NUM_OPS) {
    ctx[op] = (...args: unknown[]) => {
      trace.push(
        `${prefix}.${op}(${args
          .filter((a) => typeof a === 'number')
          .map(n)
          .join(',')})`,
      )
      if (op.startsWith('create')) return { addColorStop: () => undefined }
      return undefined
    }
  }
  for (const op of VOID_OPS) {
    ctx[op] = () => {
      trace.push(`${prefix}.${op}()`)
    }
  }
  return cv
}

const elementStub = () => ({
  style: {},
  appendChild: () => undefined,
  setAttribute: () => undefined,
  textContent: '',
  innerHTML: '',
  dataset: {},
  classList: { add: () => undefined, remove: () => undefined },
  addEventListener: () => undefined,
})

/** 在沙箱里把旧引擎的源码跑起来，拿到 J */
function loadReference() {
  const files = fs
    .readdirSync(REF)
    .filter((f) => f.endsWith('.js') && !f.startsWith('12_ui') && !f.startsWith('11_export'))
    .sort()
  const sandbox: Record<string, unknown> = {
    console: { ...console, log: () => undefined, warn: () => undefined, error: () => undefined },
    Intl,
    performance: { now: () => 0 },
    document: {
      createElement: (tag: string) => (tag === 'canvas' ? recCanvas('old') : elementStub()),
      head: { appendChild: () => undefined },
      fonts: { add: () => undefined, load: () => Promise.resolve(), check: () => true },
      addEventListener: () => undefined,
    },
    location: { href: 'file:///index.html' },
    setTimeout,
    clearTimeout,
    navigator: { language: 'ja', userAgent: 'node' },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined },
    Blob: class {},
    fetch: () => Promise.reject(new Error('no network')),
    Math,
    Date,
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  const context = vm.createContext(sandbox)
  for (const f of files) {
    try {
      vm.runInContext(fs.readFileSync(`${REF}/${f}`, 'utf8'), context, { filename: f })
    } catch {
      /* 个别文件依赖 DOM，跑不起来也不影响注册表已经建好的部分 */
    }
  }
  return sandbox.J as Reference
}

type Reference = {
  STYLES: Record<string, unknown>
  order: (group: string) => string[]
  registry: (group: string) => Record<string, OldLayoutDef>
  rng: (seed: number) => unknown
  h: (a: number, b: number) => number
}

type OldLayoutDef = {
  plan: (rng: unknown, cut: unknown, st: unknown) => Record<string, unknown>
  render: (env: unknown) => unknown
}

// 本仓库一侧的构图内部会 document.createElement('canvas')，把这些画布也接到录账上下文上
const realGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  return (
    recCanvas('new') as { getContext: () => unknown }
  ).getContext() as CanvasRenderingContext2D
} as unknown as typeof realGetContext
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext
})

const W = 1280
const H = 720
const TEXT = '风把夜色吹薄一句'
const SEED = 12345
// 取退场之前的三个时刻：完全透明（alpha 0）时本仓库的原语会直接跳过绘制，
// 旧项目照样调用一遍，两边像素一致但指令数会差，所以只在可见区间比对。
const TIMES = [0.2, 1.2, 2.8]

const scheme = {
  bg: '#0a0a0a',
  fg: '#ffffff',
  sub: '#999999',
  accent: '#ff8800',
  accent2: '#00ffcc',
  ink: '#ffffff',
  dim: '#222222',
  ghostA: '#ff8800',
  ghostB: '#00ffcc',
}

function buildEnv(side: 'old' | 'new', cut: Record<string, unknown>, t: number, style: unknown) {
  const cv = recCanvas(side)
  const ctx = (cv as { getContext: () => unknown }).getContext() as Record<string, unknown>
  const start = Number(cut.start)
  const dur = Number(cut.dur)
  const inDur = Number(cut.inDur)
  const outDur = Number(cut.outDur)
  const fx = {
    motion: 0.7,
    chroma: 0.6,
    glitch: 0.5,
    decor: 0.5,
    density: 0.5,
    texture: 0.5,
    bgSwitch: 0.5,
    flash: true,
    koma: 0,
  }
  const env: Record<string, unknown> = {
    ctx,
    W,
    H,
    sc: scheme,
    st: style,
    fx,
    fps: 24,
    cut,
    plan: { cuts: [cut], lines: [], beats: [], duration: dur, style, fx },
    pass: 'main',
    passColor: scheme.fg,
    t,
    lt: t - start,
    ltb: t - start,
    step: Math.floor((t - start) * 24),
    scale: 1,
    allowFilter: false,
    energy: 0.5,
    beat: { since: 0.1, len: 0.5, index: 2 },
    // pIn / pOut 是进场与退场的进度（0 = 未开始，1 = 已完成），与 renderer.makeEnv 同式
    pIn: Math.max(0, Math.min(1, (t - start) / Math.max(0.001, inDur))),
    pOut: Math.max(0, Math.min(1, (t - (start + dur - outDur)) / Math.max(0.001, outDur))),
  }
  const box = (it: Record<string, unknown>) => ({ x: it.x, y: it.y, w: 100, h: 100, rot: 0 })
  env.draw = (it: Record<string, unknown>) => {
    trace.push(
      `${side}.draw(${[it.x, it.y, it.size, it.rot ?? 0, it.alpha ?? 1].map(n).join(',')})`,
    )
    return box(it)
  }
  env.rect = (x: number, y: number, w: number, h: number) =>
    trace.push(`${side}.rect(${[x, y, w, h].map(n).join(',')})`)
  env.line = (a: unknown, b: unknown, c: unknown, d: unknown) =>
    trace.push(`${side}.line(${[a, b, c, d].map(n).join(',')})`)
  env.circle = (x: number, y: number, r: number) =>
    trace.push(`${side}.circle(${[x, y, r].map(n).join(',')})`)
  env.arc = (...a: unknown[]) => trace.push(`${side}.arc(${a.map(n).join(',')})`)
  env.rrect = (...a: unknown[]) => trace.push(`${side}.rrect(${a.map(n).join(',')})`)
  env.poly = (pts: [number, number][]) =>
    trace.push(
      `old.poly(${(pts ?? []).map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(';')})`,
    )
  env.polyPartial = () => trace.push(`${side}.polyPartial()`)
  env.blob = (...a: unknown[]) => trace.push(`${side}.blob(${a.map(n).join(',')})`)
  return env
}

const cutFor = (params: Record<string, unknown>) => ({
  text: TEXT,
  lineText: TEXT,
  note: null,
  n: [...TEXT].length,
  line: 0,
  start: 0,
  end: 4,
  dur: 4,
  inDur: 0.6,
  outDur: 0.5,
  index: 0,
  mi: 0,
  emph: false,
  words: [],
  scheme: 0,
  seed: SEED,
  params,
})

/**
 * 只严格比对图形指令。
 *
 * 文字排版是这次移植唯一刻意改掉的东西（中文分词与断行规则和日文不同），
 * 所以 env.draw / fillText 的行数与纵向推进允许有差异，单独要求行数相差 2 条以内；
 * rect / line / arc / poly 这类图形指令必须逐条同序、同数值。
 */
const isTextOp = (op: string): boolean => /\.draw\(|\.fillText\(|\.strokeText\(/.test(op)
const numsOf = (s: string): number[] => (s.match(/-?\d+\.\d|-?\d+(?=,|\))/g) ?? []).map(Number)

function compare(a: string[], b: string[]): string | null {
  const shapesA = a.filter((o) => !isTextOp(o))
  const shapesB = b.filter((o) => !isTextOp(o))
  if (shapesA.length !== shapesB.length) {
    const firstDiff = shapesA.findIndex((o, i) => o !== shapesB[i])
    return `图形指令数 ${shapesA.length} → ${shapesB.length}；旧：${histogram(a)}；新：${histogram(b)}；第 ${firstDiff} 条起不同：${shapesA[firstDiff]} ↔ ${shapesB[firstDiff]}`
  }
  for (let i = 0; i < shapesA.length; i++) {
    const [sa, sb] = [shapesA[i], shapesB[i]]
    if (sa.replace(/^(old|new)\./, '') !== sb.replace(/^(old|new)\./, '')) {
      const na = numsOf(sa)
      const nb = numsOf(sb)
      if (na.length !== nb.length) return `第 ${i} 条数值个数不同：${sa} ↔ ${sb}`
      for (let k = 0; k < na.length; k++) {
        if (Math.abs(na[k] - nb[k]) > 1)
          return `第 ${i} 条第 ${k} 个数值 ${na[k]} ↔ ${nb[k]}：${sa} ↔ ${sb}`
      }
    }
  }
  const textDelta = Math.abs(a.length - shapesA.length - (b.length - shapesB.length))
  if (textDelta > 2) return `文字绘制相差 ${textDelta} 条，超出中文换行的允许范围`
  return null
}

/** 差异定位用：按指令名统计条数 */
function histogram(ops: string[]): string {
  const counts = new Map<string, number>()
  for (const o of ops.filter((x) => !isTextOp(x))) {
    const name = o.replace(/^(old|new)\./, '').split('(')[0]
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([k, v]) => `${k}×${v}`).join(' ')
}

describe.skipIf(!HAS_REF)('构图几何轨迹与 JIZURA 源码逐条对账', () => {
  const J = loadReference()
  const oldStyle = J.STYLES.noir
  const newStyle = OUR_STYLES.noir

  it('旧引擎在沙箱里可用（至少注册了 100 个构图）', () => {
    expect(J.order('layout').length).toBeGreaterThan(100)
  })

  /**
   * 这几件的图形宽度直接来自测量文字得到的版心（药丸底板、报纸栏宽、路线图站距、校对批注），
   * 而测量依赖真实字体度量：测试里的量字桩对中日文一视同仁，浏览器里却必然不同，
   * 所以只对它们放宽到 "图形种类齐、条数相差 15% 以内"，其余 136 件仍要求逐条一致。
   */
  const TEXT_METRIC = new Set(['pill', 'proofread', 'newspaper', 'routeMap'])

  it.each(J.order('layout'))('layout.%s 画出来的指令序列一致', (key) => {
    const oldDef = J.registry('layout')[key]
    const newDef = LAYOUTS[key]
    expect(oldDef, '旧项目里没有这一件').toBeTruthy()
    expect(newDef, '本仓库缺这一件').toBeTruthy()

    // 随机源直接用旧引擎那颗（rng 与 hash 本身有单测保证两边一致），
    // 这样轨迹差异就只可能来自几何，而不是抽样顺序。
    const oldParams = oldDef.plan(
      J.rng(J.h(SEED, 31)),
      { text: TEXT, n: [...TEXT].length, W, H, dur: 4 },
      oldStyle,
    )
    const newParams = newDef.plan(
      J.rng(J.h(SEED, 31)) as never,
      { text: TEXT, n: [...TEXT].length, W, H, dur: 4 },
      newStyle,
    )
    expect(Object.keys(newParams).sort()).toEqual(Object.keys(oldParams).sort())

    const mismatches: string[] = []
    for (const t of TIMES) {
      trace = []
      try {
        oldDef.render(buildEnv('old', cutFor(oldParams), t, oldStyle))
      } catch (e) {
        mismatches.push(`旧侧 @${t} 抛错 ${(e as Error).message}`)
      }
      const oldTrace = trace.slice()

      trace = []
      try {
        newDef.render(buildEnv('new', cutFor(newParams), t, newStyle) as never)
      } catch (e) {
        mismatches.push(`新侧 @${t} 抛错 ${(e as Error).message}`)
      }
      const newTrace = trace.slice()

      if (oldTrace.length === 0 && newTrace.length === 0) continue
      if (TEXT_METRIC.has(key)) {
        const so = oldTrace.filter((o) => !isTextOp(o)).length
        const sn = newTrace.filter((o) => !isTextOp(o)).length
        if (Math.abs(so - sn) > so * 0.15 + 1)
          mismatches.push(`@${t} 图形指令数 ${so} → ${sn}（放宽后仍超差）`)
        continue
      }
      const diff = compare(oldTrace, newTrace)
      if (diff) mismatches.push(`@${t} ${diff}`)
    }
    expect(mismatches, `\n${mismatches.join('\n')}`).toEqual([])
  })
})
