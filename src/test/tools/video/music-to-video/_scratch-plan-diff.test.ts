// @vitest-environment jsdom
/** 临时诊断脚本（用完即删）：旧 J.plan 与新 plan 在同一输入下逐镜对账 */
import fs from 'node:fs'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import { plan as newPlan } from '@/tools/video/music-to-video/engine/planner'
import { GROUP_KEYS, orderOf } from '@/tools/video/music-to-video/engine/registry'

const REF = 'D:/my-tools/tools-music/JIZURA/src'

function loadReference() {
  const files = fs
    .readdirSync(REF)
    .filter((f) => f.endsWith('.js') && !f.startsWith('12_ui') && !f.startsWith('11_export'))
    .sort()
  const canvasStub = () => {
    const cv: Record<string, unknown> = { width: 4, height: 4, style: {}, getContext: () => ctx }
    const ctx: Record<string, unknown> = {
      canvas: cv,
      measureText: () => ({ width: 10 }),
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      createPattern: () => ({}),
    }
    for (const k of [
      'fillRect',
      'clearRect',
      'putImageData',
      'beginPath',
      'moveTo',
      'lineTo',
      'stroke',
      'fill',
      'arc',
      'save',
      'restore',
      'drawImage',
      'quadraticCurveTo',
    ])
      ctx[k] = () => undefined
    return cv
  }
  const sandbox: Record<string, unknown> = {
    console: { ...console, log: () => undefined, warn: () => undefined, error: () => undefined },
    Intl,
    performance: { now: () => 0 },
    document: {
      createElement: (tag: string) => (tag === 'canvas' ? canvasStub() : { style: {} }),
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
      /* ignore */
    }
  }
  return sandbox.J as never
}

type J = {
  plan: (project: unknown, audio: unknown) => Plan
  defaultProject: () => Record<string, unknown>
  GROUP_KEYS: string[]
  order: (g: string) => string[]
  lerp: (a: number, b: number, t: number) => number
}
type Cut = Record<string, unknown>
type Plan = { cuts: Cut[]; events: Cut[]; lines: unknown[]; duration: number }

const LYRICS_ZH = `把还没说完的话/留在风里
凌晨三点的城市/只有一盏灯还醒着
*我们*都以为明天/还很远
那些没寄出的信/全都成了歌!`

type Opts = { title?: string; offset?: number; density?: number; offFx?: string }

describe('plan 对账', () => {
  const J = loadReference() as unknown as J

  const run = (lyrics: string, seed: number, o: Opts = {}) => {
    const density = o.density ?? 0.55
    const offset = o.offset ?? 0.4
    const off = (g: string, k: string) => !(o.offFx && g === 'fx' && k === o.offFx)
    const oldBase = J.defaultProject()
    const oldPlan = J.plan(
      {
        ...oldBase,
        lyrics,
        seed,
        title: o.title ?? '',
        artist: '',
        fx: { ...(oldBase.fx as object), density },
        enabled: Object.fromEntries(
          J.GROUP_KEYS.map((g) => [g, Object.fromEntries(J.order(g).map((k) => [k, off(g, k)]))]),
        ),
        timing: { bpm: 0, offset, snap: true, tail: 0.9, lineTimes: {}, lineScale: 1 },
      },
      null,
    )
    const newProject = {
      version: 1,
      title: o.title ?? '',
      artist: '',
      lyrics,
      style: 'noir',
      mood: null,
      extra: false,
      traditional: true,
      seed,
      aspect: '16:9',
      res: 1080,
      fps: 24,
      fx: {
        motion: 0.7,
        glitch: 0.55,
        chroma: 0.7,
        decor: 0.5,
        density,
        texture: 0.6,
        flash: true,
        onTwos: true,
        koma: 12,
        hud: 'auto',
        bgSwitch: 0.35,
      },
      enabled: Object.fromEntries(
        GROUP_KEYS.map((g) => [g, Object.fromEntries(orderOf(g).map((k) => [k, off(g, k)]))]),
      ),
      timing: { bpm: 0, offset, snap: true, tail: 0.9, lineTimes: {}, lineScale: 1 },
      overrides: {},
      colors: { enabled: false },
      fonts: {},
      includeAudio: true,
    }
    return { oldPlan, newPlan: newPlan(newProject as never, null) as unknown as Plan }
  }

  const FIELDS = ['layout', 'cam', 'enter', 'exit', 'hold', 'treat', 'bg', 'trans'] as const

  const score = (a: Plan, b: Plan) => {
    const n = Math.min(a.cuts.length, b.cuts.length)
    const out: Record<string, number> = { n }
    for (const f of FIELDS) {
      let hit = 0
      for (let i = 0; i < n; i++) if (a.cuts[i][f] === b.cuts[i][f]) hit++
      out[f] = hit
    }
    let textHit = 0
    let decorHit = 0
    for (let i = 0; i < n; i++) {
      if (a.cuts[i].text === b.cuts[i].text) textHit++
      const da = ((a.cuts[i].decor as Cut[]) ?? []).map((d) => d.id).join(',')
      const db = ((b.cuts[i].decor as Cut[]) ?? []).map((d) => d.id).join(',')
      if (da === db) decorHit++
    }
    out.text = textHit
    out.decor = decorHit
    return out
  }

  const line = (s: number, o: Opts = {}) => {
    const { oldPlan, newPlan: np } = run(LYRICS_ZH, s, o)
    const sc = score(oldPlan, np)
    return (
      `seed=${String(s).padEnd(9)} n=${String(sc.n).padStart(2)} ` +
      FIELDS.map((f) => `${f}=${sc[f]}`).join(' ') +
      ` decor=${sc.decor} text=${sc.text}`
    )
  }

  it('A. 密度滑杆：每镜时长 L 与镜头数', () => {
    const rows: string[] = []
    for (const d of [0, 0.25, 0.55, 0.8, 1]) {
      const { oldPlan, newPlan: np } = run(LYRICS_ZH, 20260922, { density: d })
      rows.push(
        `density=${d.toFixed(2)}  旧L=${J.lerp(1.3, 0.5, d).toFixed(3)} 新L=${(0.5 + 0.8 * d).toFixed(3)}  旧cuts=${oldPlan.cuts.length} 新cuts=${np.cuts.length}`,
      )
    }
    console.log('\n=== A. 密度 ===\n' + rows.join('\n'))
    expect(rows).toHaveLength(5)
  })

  it('B. 无标题卡：逐镜命中率', () => {
    const rows = [20260922, 7, 99, 1234, 555].map((s) => line(s))
    console.log('\n=== B. 无标题卡（旧侧第一镜不掷 pickFx）===\n' + rows.join('\n'))
    expect(rows).toHaveLength(5)
  })

  it('C. 有标题卡：逐镜命中率', () => {
    const rows = [20260922, 7, 99, 1234, 555].map((s) => line(s, { title: '测试标题', offset: 2 }))
    console.log('\n=== C. 有标题卡（旧侧第一镜也掷 pickFx）===\n' + rows.join('\n'))
    expect(rows).toHaveLength(5)
  })

  it('D. 关掉某个内置 FX', () => {
    const rows = ['slice', 'block', 'invert', 'zoom', 'mosaic', 'shake'].map((off) => {
      const { oldPlan, newPlan: np } = run(LYRICS_ZH, 7, { offFx: off })
      const cnt = (p: Plan, t: string) => p.events.filter((e) => e.type === t).length
      const sc = score(oldPlan, np)
      return `禁用 ${off.padEnd(7)} 旧events=${String(oldPlan.events.length).padStart(3)}(${off}=${cnt(oldPlan, off)}) 新events=${String(np.events.length).padStart(3)}(${off}=${cnt(np, off)}) layout=${sc.layout}/${sc.n}`
    })
    console.log('\n=== D. FX 开关 ===\n' + rows.join('\n'))
    expect(rows).toHaveLength(6)
  })

  it('E. 事件类型分布', () => {
    const { oldPlan, newPlan: np } = run(LYRICS_ZH, 7)
    const hist = (p: Plan) => {
      const m = new Map<string, number>()
      for (const e of p.events) m.set(String(e.type), (m.get(String(e.type)) ?? 0) + 1)
      return [...m.entries()]
        .sort()
        .map(([k, v]) => `${k}×${v}`)
        .join(' ')
    }
    console.log(`\n=== E. 事件分布 ===\n旧: ${hist(oldPlan)}\n新: ${hist(np)}`)
    expect(true).toBe(true)
  })
})
