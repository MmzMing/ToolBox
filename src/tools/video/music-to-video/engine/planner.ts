/**
 * 规划器：歌词 + 音频 → 一份确定性的分镜表（Plan）。
 *
 * 三段工作：
 *  1) parseLyrics：解析歌词文本（LRC 时间戳、`/` 手工分词、`*重音*`、`!` 强调、`|` 注释）。
 *  2) computeTiming：没有时间戳时按字数估算每行时长，有 BPM 时向整拍取整。
 *  3) plan：把每行切成若干"词组→镜头"，为每个镜头加权抽取构图/入场/出场/保持/装饰/
 *     文字加工/背景/镜头运动/转场，并埋下后期事件。
 *
 * 所有随机数都由 seed 派生（hash + mulberry32），同一份输入永远得到同一支视频。
 */
import type {
  AudioFeatures,
  Cut,
  DecorParam,
  LyricLine,
  Params,
  ParsedLyrics,
  PickHistory,
  Plan,
  PlanEvent,
  PlanLine,
  Project,
  Rng,
  StylePack,
} from './types'
import { chunkText } from './text-layout'
import { glyphCount, joinChunks } from './script'
import { clamp, hash, lerp, rng } from './util'
import { resolveStyle } from './styles'
import {
  BG,
  CAMERA,
  DECOR,
  ENTER,
  EXIT,
  FXE,
  GROUP_KEYS,
  HOLD,
  LAYOUTS,
  TREAT,
  TRANS,
  allEnabled,
  orderOf,
  randomOk,
} from './registry'

/** 首次进入工具时的示例歌词（原创，避免版权） */
export const SAMPLE_LYRICS = `把还没说完的话/留在风里
凌晨三点的城市/只有一盏灯还醒着
*我们*都以为明天/还很远
那些没寄出的信/全都成了歌!`

/** 镜头密度两端的目标时长：density=0 时每镜 1.3s（疏），=1 时每镜 0.5s（密） */
const CUT_LENGTH = { sparse: 1.3, dense: 0.5 }
/** 节拍吸附的最大偏移（秒） */
const SNAP_WINDOW = 0.13

export function defaultProject(): Project {
  return {
    version: 1,
    title: '',
    artist: '',
    lyrics: SAMPLE_LYRICS,
    style: 'noir',
    mood: null,
    extra: true,
    traditional: true,
    seed: 20260923,
    aspect: '16:9',
    res: 1080,
    fps: 60,
    fx: {
      motion: 0.7,
      glitch: 0.55,
      chroma: 0.7,
      decor: 0.5,
      density: 0.55,
      texture: 0.6,
      flash: true,
      onTwos: true,
      koma: 12,
      hud: 'auto',
      bgSwitch: 0.35,
    },
    enabled: allEnabled(),
    timing: { bpm: 0, offset: 0.4, snap: true, tail: 0.9, lineTimes: {}, lineScale: 1 },
    overrides: {},
    colors: { enabled: false },
    fonts: {},
    includeAudio: true,
  }
}

/** 动画步进长度：koma 为每秒绘制几张"画格"，0 表示逐输出帧 */
export function komaOf(fx: Project['fx']): number {
  return fx.koma
}
export function stepDur(fx: Project['fx'], fps: number): number {
  const k = komaOf(fx)
  return k > 0 ? 1 / k : 1 / (fps || 24)
}

/* ---------------- 歌词解析 ---------------- */

const META_RE = /^\[(ti|ar|al|by|offset):(.*)\]$/i
const LRC_RE = /^\[(\d+):(\d+(?:[.:]\d+)?)\]/
const IMPACT_RE = /[!！]$/

/** 解析歌词文本为行数组 + 元数据 */
export function parseLyrics(raw: string): ParsedLyrics {
  const lines: LyricLine[] = []
  const meta: Record<string, string> = {}
  let pendingGap = false
  for (const srcLine of String(raw || '')
    .replace(/\r/g, '')
    .split('\n')) {
    const trimmed = srcLine.trim()
    if (!trimmed) {
      if (lines.length) pendingGap = true
      continue
    }
    if (trimmed.startsWith('#')) continue
    const mm = META_RE.exec(trimmed)
    if (mm) {
      meta[mm[1].toLowerCase()] = mm[2].trim()
      continue
    }
    let s = trimmed
    const times: number[] = []
    let m: RegExpExecArray | null
    while ((m = LRC_RE.exec(s))) {
      times.push(Number(m[1]) * 60 + Number.parseFloat(m[2].replace(':', '.')))
      s = s.slice(m[0].length)
    }
    s = s.trim()
    let note: string | null = null
    const bar = s.indexOf('|')
    if (bar >= 0) {
      note = s.slice(bar + 1).trim() || null
      s = s.slice(0, bar).trim()
    }
    let impact = false
    if (IMPACT_RE.test(s) && s.length > 1) {
      impact = true
      s = s.slice(0, -1).trim()
    }
    const emph: string[] = []
    s = s.replace(/\*([^*]+)\*/g, (_, w: string) => {
      emph.push(w)
      return w
    })
    let manual: string[] | null = null
    if (s.includes('/')) {
      manual = s
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean)
      s = joinChunks(manual)
    }
    if (!s) continue
    const base: Omit<LyricLine, 'lrc'> = {
      text: s,
      note,
      impact,
      emph,
      manual,
      gapBefore: pendingGap,
    }
    pendingGap = false
    if (times.length) times.forEach((t) => lines.push({ ...base, lrc: t }))
    else lines.push({ ...base, lrc: null })
  }
  if (lines.some((l) => l.lrc != null)) {
    lines.sort((a, b) => (a.lrc ?? Number.MAX_SAFE_INTEGER) - (b.lrc ?? Number.MAX_SAFE_INTEGER))
  }
  return { lines, meta }
}

/* ---------------- 时间轴 ---------------- */

export type Timing = { starts: number[]; ends: number[]; duration: number }

/** 一行字的估算时长：随字数线性增长，有 BPM 时取整拍 */
function estimateHold(text: string, beat: number, scale: number, min: number): number {
  const n = [...text].length
  let d = clamp(0.8 + n * 0.17, min, 5.2) * scale
  if (beat) d = Math.max(2, Math.round(d / beat)) * beat
  return d
}

export function computeTiming(
  project: Project,
  parsed: ParsedLyrics,
  audio: AudioFeatures | null,
): Timing {
  const T = project.timing
  const { lines } = parsed
  const beat = T.bpm > 0 ? 60 / T.bpm : 0
  const starts: number[] = []
  const allLrc = lines.length > 0 && lines.every((l) => l.lrc != null)
  lines.forEach((l, i) => {
    const manual = T.lineTimes[i]
    let s: number
    if (allLrc) s = l.lrc ?? 0
    else if (manual != null && Number.isFinite(manual)) s = manual
    else if (i > 0) {
      const d = estimateHold(lines[i - 1].text, beat, T.lineScale || 1, 1.3)
      s = starts[i - 1] + d + (l.gapBefore ? (beat ? beat * 2 : 0.8) : 0)
    } else s = T.offset
    starts.push(s)
  })
  const ends = starts.map((s, i) => {
    if (i < starts.length - 1) return Math.max(s + 0.35, starts[i + 1])
    return s + estimateHold(lines[i].text, beat, T.lineScale || 1, 1.5)
  })
  let duration = (ends.length ? ends[ends.length - 1] : 3) + T.tail
  if (audio?.duration)
    duration = Math.max(audio.duration, ends.length ? ends[ends.length - 1] + 0.2 : 1)
  return { starts, ends, duration }
}

/* ---------------- 部件挑选 ---------------- */

const weightOf = <T extends { w?: number }>(
  bias: Record<string, number> | undefined,
  key: string,
  def: T | undefined,
): number => (bias && bias[key] != null ? bias[key] : (def?.w ?? 1))

/** 近重复惩罚：最近 6 次里出现过就降权（越近罚得越狠） */
function novelty(history: PickHistory[], key: keyof PickHistory, val: string): number {
  let w = 1
  for (let i = history.length - 1, d = 0; i >= 0 && d < 6; i--, d++) {
    if (history[i][key] === val) w *= d < 2 ? 0.2 : 0.6
  }
  return w
}

type Enabled = Partial<Record<string, Record<string, boolean>>>

const on = (en: Enabled, group: string, key: string): boolean => en[group]?.[key] !== false

/** 竖屏时各构图的适配权重（横排长句在 9:16 上会太小） */
const PORTRAIT_W: Record<string, number> = {
  vcols: 1.9,
  condensed: 1.3,
  huge: 1.3,
  center: 1.2,
  stack: 1.1,
  mixed: 0.7,
  marquee: 0.6,
  wave: 0.6,
  diag: 0.8,
  type: 0.8,
  gloss: 0.5,
}

/** 各构图偏爱的入场（"打字"配长句、"聚拢"配图形化构图） */
const LAYOUT_ENTER: Record<string, Record<string, number>> = {
  type: { type: 4, scramble: 1.5 },
  ring: { pop: 2, spin: 2, cut: 1, assemble: 0.4, slice: 0.2, wipe: 0.2 },
  labels: { cut: 3, pop: 1 },
  wave: { pop: 1.5, drop: 1.5, blur: 1, slice: 0.3 },
  tile: { assemble: 1.3, slice: 1.4, zoom: 1.4 },
  huge: { zoom: 1.5, wipe: 1.5, slice: 1.4, stretch: 1.3, type: 0.2 },
  mixed: { pop: 1.6, drop: 1.6, spin: 1.3 },
  scatter: { pop: 1.5, spin: 1.5, drop: 1.2, assemble: 1.3 },
  vcols: { assemble: 1.8, type: 1.2 },
  pill: { wipe: 1.8, type: 1.2 },
}

const HOLD_W: Record<string, number> = {
  still: 1,
  jitter: 1.2,
  drift: 1,
  breathe: 0.7,
  wave: 0.4,
  glitchtick: 0.9,
}

function pickLayout(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  n: number,
  dur: number,
  history: PickHistory[],
  emph: boolean,
  recap: boolean,
  portrait: boolean,
): string {
  const cands: [string, number][] = []
  for (const k of orderOf('layout')) {
    const L = LAYOUTS[k]
    if (!on(en, 'layout', k) || !L.fits(n)) continue
    let w = weightOf(st.bias.layout, k, L) * novelty(history, 'layout', k)
    if (portrait) w *= L.portrait ?? PORTRAIT_W[k] ?? 1
    if (emph && L.emph) w *= L.emph
    if (emph && ['huge', 'center', 'tile', 'marquee', 'condensed'].includes(k)) w *= 2
    if (recap && ['center', 'stack', 'marquee', 'tile', 'mixed', 'type', 'gloss'].includes(k))
      w *= 1.8
    if (dur < 0.5 && ['wave', 'ring', 'labels', 'gloss', 'type', 'tile'].includes(k)) w *= 0.3
    if (dur < 0.5 && ['center', 'huge', 'condensed', 'vcols'].includes(k)) w *= 1.4
    cands.push([k, w])
  }
  if (!cands.length) return 'center'
  return rngIn.wpick(cands)
}

function pickEnter(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  layout: string,
  dur: number,
  history: PickHistory[],
  emph: boolean,
  n: number,
): string {
  const cands: [string, number][] = []
  for (const k of orderOf('enter')) {
    if (!on(en, 'enter', k)) continue
    const D = ENTER[k]
    if (!D) continue
    const LD = LAYOUTS[layout]
    let w =
      weightOf(st.bias.enter, k, D) *
      novelty(history, 'enter', k) *
      ((LAYOUT_ENTER[layout] ?? LD?.enterBias)?.[k] ?? 1)
    if (D.minDur && dur < D.minDur) w *= 0.15
    if (D.maxChars && n > D.maxChars) w *= 0.2
    if (k === 'cut') w *= 0.5
    if (dur < 0.45 && ['type', 'assemble', 'drop', 'spin', 'pop', 'flicker'].includes(k)) w *= 0.25
    if (dur < 0.45 && ['cut', 'slice', 'zoom', 'stretch'].includes(k)) w *= 1.8
    if (k === 'type' && n > 18) w *= 0.3
    if (emph && ['zoom', 'assemble', 'slice'].includes(k)) w *= 1.8
    cands.push([k, w])
  }
  return cands.length ? rngIn.wpick(cands) : 'cut'
}

function pickExit(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  layout: string,
  dur: number,
  lastOfLine: boolean,
  history: PickHistory[],
): string {
  const cands: [string, number][] = []
  for (const k of orderOf('exit')) {
    if (!on(en, 'exit', k)) continue
    const D = EXIT[k]
    if (!D) continue
    let w = weightOf(st.bias.exit, k, D) * novelty(history, 'exit', k)
    if (D.minDur && dur < D.minDur) w *= 0.15
    if (k === 'cut') w *= dur < 0.6 ? 4 : lastOfLine ? 1.2 : 2.2
    if (dur < 0.6 && k !== 'cut') w *= 0.4
    if (['labels', 'ring', 'tile'].includes(layout) && ['explode', 'fall', 'drift'].includes(k))
      w *= 0.3
    cands.push([k, w])
  }
  return cands.length ? rngIn.wpick(cands) : 'cut'
}

function pickHold(rngIn: Rng, en: Enabled, fx: Project['fx'], history: PickHistory[]): string {
  const cands: [string, number][] = orderOf('hold')
    .filter((k) => on(en, 'hold', k) && HOLD[k])
    .map((k) => {
      const D = HOLD[k]
      let w = HOLD_W[k] ?? D?.w ?? 0.8
      if (k === 'jitter' || D?.tags?.includes('glitch')) w *= 0.4 + fx.motion
      if (k === 'glitchtick') w *= fx.glitch
      return [k, w * novelty(history, 'hold', k)]
    })
  return cands.length ? rngIn.wpick(cands) : 'still'
}

function decorParams(rngIn: Rng, k: string): DecorParam {
  return {
    id: k,
    seed: rngIn.int(1, 1e9),
    n: rngIn.int(1, 3) + (k === 'shapes' ? 3 : 0) + (k === 'sparks' ? 4 : 0),
    right: rngIn.chance(0.5),
    low: rngIn.chance(0.5),
    accent: rngIn.chance(0.4),
    corner: rngIn.chance(0.5),
    big: rngIn.chance(0.4),
    mode: rngIn.pick(['count', 'index'] as const),
    from: rngIn.int(0, 20),
    to: rngIn.int(30, 999),
    v: rngIn.int(0, 5),
    r: rngIn(),
  }
}

function pickDecor(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  layout: string,
  history: PickHistory[] = [],
): DecorParam[] {
  const count = Math.round(fx.decor * 2.8 * rngIn.range(0.45, 1.15))
  const recent = new Set(history.slice(-2).flatMap((h) => h.decor || []))
  const LD = LAYOUTS[layout]
  const list: [string, number][] = orderOf('decor')
    .filter(
      (k) =>
        on(en, 'decor', k) &&
        !!DECOR[k] &&
        !(LD?.busy && DECOR[k].layer === 'back' && !DECOR[k].subtle),
    )
    .map((k) => {
      const D = DECOR[k]
      const base = D?.w != null ? D.w * 0.5 : 0.35
      // 风格包的 decor 权重是"替换默认值"，不是"在默认值上再乘一层"
      return [k, (st.decor?.[k] ?? base) * (recent.has(k) ? 0.35 : 1)] as [string, number]
    })
  const out: DecorParam[] = []
  const pool = [...list]
  for (let i = 0; i < count && pool.length; i++) {
    const k = rngIn.wpick(pool)
    pool.splice(
      pool.findIndex((c) => c[0] === k),
      1,
    )
    out.push(decorParams(rngIn, k))
  }
  return out
}

function pickTreat(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  layout: string,
  emph: boolean,
  history: PickHistory[],
): string {
  const LD = LAYOUTS[layout]
  if (LD?.treat === false) return 'none'
  if (!rngIn.chance(0.18 + 0.42 * fx.decor + (emph ? 0.15 : 0))) return 'none'
  const cands: [string, number][] = orderOf('treat')
    .filter(
      (k) =>
        k !== 'none' && on(en, 'treat', k) && !!TREAT[k] && (LD?.treat !== 'safe' || TREAT[k].safe),
    )
    .map((k) => [k, weightOf(st.bias.treat, k, TREAT[k]) * novelty(history, 'treat', k)])
  return cands.length ? rngIn.wpick(cands) : 'none'
}

function pickBg(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  bgHist: string[],
): string {
  if (!rngIn.chance(0.2 + 0.35 * fx.decor + 0.2 * fx.bgSwitch)) return 'none'
  const last = bgHist.slice(-3)
  const cands: [string, number][] = orderOf('bg')
    .filter((k) => k !== 'none' && on(en, 'bg', k) && !!BG[k])
    .map((k) => [k, weightOf(st.bias.bg, k, BG[k]) * (last.includes(k) ? 0.25 : 1)])
  return cands.length ? rngIn.wpick(cands) : 'none'
}

function pickCam(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  layout: string,
  emph: boolean,
  history: PickHistory[],
): string {
  const LD = LAYOUTS[layout]
  const cands: [string, number][] = orderOf('cam')
    .filter((k) => on(en, 'cam', k) && !!CAMERA[k])
    .map((k) => {
      const D = CAMERA[k]
      let w = weightOf(st.bias.cam, k, D) * novelty(history, 'cam', k)
      if (D?.strong) w *= 0.25 + 0.9 * fx.motion + (emph ? 0.6 : 0)
      if (LD?.cam === false && k !== 'push') w *= 0.05
      return [k, w]
    })
  return cands.length ? rngIn.wpick(cands) : 'push'
}

function pickTrans(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  emph: boolean,
  history: PickHistory[],
): string | null {
  if (!orderOf('trans').length) return null
  if (!rngIn.chance(0.1 + 0.22 * fx.motion + (emph ? 0.08 : 0))) return null
  const cands: [string, number][] = orderOf('trans')
    .filter((k) => on(en, 'trans', k) && !!TRANS[k])
    .map((k) => [k, weightOf(st.bias.trans, k, TRANS[k]) * novelty(history, 'trans', k)])
  return cands.length ? rngIn.wpick(cands) : null
}

/** 额外的后期事件（非内置那批）；当前部件库全为内置，返回 null */
function pickFx(
  rngIn: Rng,
  st: StylePack,
  en: Enabled,
  fx: Project['fx'],
  emph: boolean,
  fxHist: string[],
  kind: 'edge' | 'mid',
): string | null {
  const g = fx.glitch
  const p =
    kind === 'edge' ? 0.12 + 0.38 * g + 0.12 * fx.motion + (emph ? 0.15 : 0) : 0.05 + 0.2 * g
  if (!rngIn.chance(p)) return null
  const last = fxHist.slice(-3)
  const cands: [string, number][] = orderOf('fx')
    .filter((k) => {
      const D = FXE[k]
      return !!D && !D.builtin && on(en, 'fx', k) && (kind === 'edge' ? D.edge !== false : D.mid)
    })
    .map((k) => {
      const D = FXE[k]
      let w = weightOf(st.bias.fx, k, D) * (last.includes(k) ? 0.2 : 1)
      if (D?.glitchy) w *= 0.3 + g * 1.4
      return [k, w]
    })
  return cands.length ? rngIn.wpick(cands) : null
}

/* ---------------- 输出尺寸 ---------------- */

export function designSize(aspect: Project['aspect']): [number, number] {
  switch (aspect) {
    case '9:16':
      return [1080, 1920]
    case '1:1':
      return [1440, 1440]
    case '4:5':
      return [1440, 1800]
    case '21:9':
      return [2520, 1080]
    case '4:3':
      return [1440, 1080]
    case '3:4':
      return [1080, 1440]
    default:
      return [1920, 1080]
  }
}

/** 输出像素：短边对齐目标分辨率，宽高取偶数（编码器要求） */
export function outputSize(aspect: Project['aspect'], res: number): [number, number] {
  const [W, H] = designSize(aspect)
  const k = (res || 1080) / Math.min(W, H)
  return [Math.round((W * k) / 2) * 2, Math.round((H * k) / 2) * 2]
}

/* ---------------- 组装 ---------------- */

type CutInit = Required<
  Pick<
    Cut,
    'text' | 'lineText' | 'line' | 'start' | 'end' | 'layout' | 'enter' | 'exit' | 'params' | 'seed'
  >
> &
  Partial<Cut>

function makeCut(init: CutInit): Cut {
  const base: Partial<Cut> = {
    note: null,
    hold: 'still',
    inDur: 0.3,
    outDur: 0.25,
    stagger: 0.04,
    decor: [],
    scheme: 0,
    emph: false,
    recap: false,
    words: [],
    treat: 'none',
    treatP: {},
    bg: 'none',
    bgP: {},
    cam: 'push',
    camP: {},
    trans: null,
    transP: {},
    transDur: 0,
  }
  const cut: Cut = { ...(base as Cut), ...init, dur: init.end - init.start }
  return cut
}

/** 把词块分成 k 组，尽量让每组字数均衡 */
function partition(chunks: string[], k: number): string[][] {
  const lens = chunks.map((c) => [...c].length + 1)
  const total = lens.reduce((a, b) => a + b, 0)
  const target = total / k
  const groups: string[][] = []
  let cur: string[] = []
  let acc = 0
  let remainingGroups = k
  chunks.forEach((c, i) => {
    const remainingChunks = chunks.length - i
    if (
      cur.length &&
      (acc + lens[i] / 2 > target || remainingChunks < remainingGroups) &&
      groups.length < k - 1
    ) {
      groups.push(cur)
      cur = []
      acc = 0
      remainingGroups -= 1
    }
    cur.push(c)
    acc += lens[i]
  })
  if (cur.length) groups.push(cur)
  return groups
}

function snapToBeat(beats: number[], t: number, enabled: boolean): number {
  if (!beats.length || !enabled) return t
  let lo = 0
  let hi = beats.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (beats[mid] < t) lo = mid + 1
    else hi = mid
  }
  let best = t
  let bd = SNAP_WINDOW
  for (const k of [lo - 1, lo]) {
    if (k >= 0 && k < beats.length && Math.abs(beats[k] - t) < bd) {
      bd = Math.abs(beats[k] - t)
      best = beats[k]
    }
  }
  return best
}

/** 部件自带的参数掷骰（没有 plan 就是空参数） */
function planParams(
  def: { plan?: (rng: Rng, st: StylePack) => Params } | undefined,
  rngIn: Rng,
  st: StylePack,
): Params {
  return def?.plan ? def.plan(rngIn, st) : {}
}

/** 歌词 + 音频 → 分镜表 */
export function plan(project: Project, audio: AudioFeatures | null): Plan {
  const st = resolveStyle(project)
  const fx = { ...defaultProject().fx, ...project.fx }
  const parsed = parseLyrics(project.lyrics)
  const title = project.title || parsed.meta.ti || ''
  const artist = project.artist || parsed.meta.ar || ''
  const tm = computeTiming(project, parsed, audio)
  const [W, H] = designSize(project.aspect)
  const enabled = project.enabled || {}
  const en: Enabled = {}
  for (const g of GROUP_KEYS) {
    const map: Record<string, boolean> = {}
    const src = enabled[g] || {}
    for (const k of orderOf(g)) map[k] = src[k] !== false && randomOk(project, g, k)
    en[g] = map
  }
  const out: Plan = {
    version: 1,
    title,
    artist,
    W,
    H,
    fps: project.fps || 24,
    duration: tm.duration,
    styleKey: project.style,
    style: st,
    fx,
    seed: project.seed,
    lines: [] as PlanLine[],
    cuts: [] as Cut[],
    events: [] as PlanEvent[],
    beats: audio?.beats ? audio.beats.slice() : [],
    hud: fx.hud === 'on' ? true : fx.hud === 'off' ? false : !!st.hud,
    energy: null,
    energyRate: 0,
  }
  const beats = out.beats
  const history: PickHistory[] = []
  const bgHistory: string[] = []
  const fxHistory: string[] = []
  let schemeIdx = 0
  const nSchemes = st.schemes.length
  const addEvent = (t: number, type: string, amp: number, dur: number) =>
    out.events.push({ t, type, amp, dur })

  const firstStart = tm.starts.length ? tm.starts[0] : 0
  if (title && firstStart >= 1.1) {
    const seed = hash(project.seed, 999)
    const rngIn = rng(seed)
    const dur = Math.max(0.5, firstStart - 0.04 - 0.1)
    out.cuts.push(
      makeCut({
        text: title,
        note: artist,
        lineText: title,
        line: -1,
        start: 0.1,
        end: firstStart - 0.04,
        layout: 'title',
        enter: rngIn.pick(['blur', 'type', 'wipe', 'assemble']),
        exit: rngIn.pick(['blur', 'drift', 'wipe']),
        hold: 'still',
        params: LAYOUTS.title.plan(rngIn, { text: title, n: glyphCount(title), W, H, dur }, st),
        decor: [],
        scheme: 0,
        seed: hash(project.seed, 999, 1),
      }),
    )
  }

  parsed.lines.forEach((ln, li) => {
    const s = tm.starts[li]
    const e = tm.ends[li]
    const ov = project.overrides[li] || {}
    const lineSeed =
      ov.lock && ov.lockedSeed != null ? ov.lockedSeed : hash(project.seed, li + 1, ov.seed ?? 0)
    const rngIn = rng(lineSeed)
    const n = glyphCount(ln.text)
    const visEnd = Math.min(e, s + Math.max(3.6, n * 0.5 + 1.2))
    const D = visEnd - s
    const planLine: PlanLine = {
      index: li,
      text: ln.text,
      start: s,
      end: e,
      visEnd,
      note: ln.note,
      impact: ln.impact,
      emph: ln.emph,
      chunks: null,
      seed: lineSeed,
    }
    const chunks = ln.manual || chunkText(ln.text)
    planLine.chunks = chunks
    out.lines.push(planLine)

    const L = lerp(CUT_LENGTH.sparse, CUT_LENGTH.dense, fx.density)
    let nC = Math.round(D / L)
    const maxC = chunks.length + (chunks.length >= 2 && D > 2 ? 1 : 0)
    nC = clamp(nC, 1, Math.max(1, maxC))
    if (ov.single) nC = 1
    const nG = Math.min(nC, chunks.length)
    const groups = nG <= 1 ? [ln.text] : partition(chunks, nG).map((g) => joinChunks(g))
    const recap = nC > groups.length && groups.length >= 2
    type Unit = { text: string; w: number; recap?: boolean }
    const units: Unit[] = groups.map((g) => ({ text: g, w: [...g].length + 1.6 }))
    if (recap) {
      units.push({
        text: ln.text,
        w: (units.reduce((a, u) => a + u.w, 0) / units.length) * 1.25,
        recap: true,
      })
    }
    const total = units.reduce((a, u) => a + u.w, 0)
    let acc = s
    const bounds = [s]
    units.forEach((u, k) => {
      acc += (D * u.w) / total
      bounds.push(k === units.length - 1 ? visEnd : acc)
    })
    for (let k = 1; k < bounds.length - 1; k++) {
      const snapped = snapToBeat(beats, bounds[k], project.timing.snap)
      bounds[k] = clamp(snapped, bounds[k - 1] + 0.22, bounds[k + 1] - 0.22)
    }
    if (nSchemes > 1 && li > 0 && rngIn.chance(fx.bgSwitch * (ln.impact ? 1.8 : 1))) {
      schemeIdx = (schemeIdx + 1 + rngIn.int(0, nSchemes - 2)) % nSchemes
    }
    let lineBg = ov.bg && BG[ov.bg] ? ov.bg : pickBg(rngIn, st, en, fx, bgHistory)
    bgHistory.push(lineBg)
    let lineBgP = planParams(BG[lineBg], rngIn, st)

    units.forEach((u, k) => {
      const cs = bounds[k]
      const ce = bounds[k + 1]
      const dur = ce - cs
      const txt = u.text
      const nn = glyphCount(txt)
      const emph = (ln.impact && (k === 0 || u.recap)) || ln.emph.some((w) => txt.includes(w))
      const layout =
        ov.layout && LAYOUTS[ov.layout]
          ? ov.layout
          : pickLayout(rngIn, st, en, nn, dur, history, emph, !!u.recap, H > W)
      let enter =
        ov.enter && ENTER[ov.enter]
          ? ov.enter
          : pickEnter(rngIn, st, en, layout, dur, history, emph, nn)
      const exit =
        ov.exit && EXIT[ov.exit]
          ? ov.exit
          : pickExit(rngIn, st, en, layout, dur, k === units.length - 1, history)
      const hold = ov.hold && HOLD[ov.hold] ? ov.hold : pickHold(rngIn, en, fx, history)
      let inDur = clamp(dur * 0.36, 0.12, 0.6)
      if (enter === 'type') inDur = clamp(nn * 0.055 + 0.1, 0.15, dur * 0.65)
      if (enter === 'assemble') inDur = clamp(dur * 0.45, 0.22, 0.75)
      const enterDef = ENTER[enter]
      if (enterDef?.inDur) inDur = enterDef.inDur(dur, nn)
      if (enter === 'cut') inDur = 0.12
      let outDur = exit === 'cut' ? 0 : clamp(dur * 0.3, 0.14, 0.55)
      if (['explode', 'fall', 'drift'].includes(exit)) outDur = clamp(dur * 0.38, 0.25, 0.7)
      const exitDef = EXIT[exit]
      if (exitDef?.outDur) outDur = exitDef.outDur(dur, nn)
      if (inDur + outDur > dur * 0.92) {
        const f = (dur * 0.92) / (inDur + outDur)
        inDur *= f
        outDur *= f
      }
      let sch = schemeIdx
      if (nSchemes > 1 && k > 0 && rngIn.chance(0.12 * fx.bgSwitch))
        sch = (schemeIdx + 1) % nSchemes
      const LD = LAYOUTS[layout]
      const params = LD.plan(rngIn, { text: txt, n: nn, W, H, dur }, st)
      const decor = Array.isArray(ov.decor)
        ? ov.decor.filter((id) => !!DECOR[id]).map((id) => decorParams(rngIn, id))
        : pickDecor(rngIn, st, en, fx, layout, history)
      const treat =
        ov.treat && TREAT[ov.treat] ? ov.treat : pickTreat(rngIn, st, en, fx, layout, emph, history)
      const treatP = planParams(TREAT[treat], rngIn, st)
      if (!ov.bg && k > 0 && rngIn.chance(0.18 * fx.bgSwitch + 0.04)) {
        lineBg = pickBg(rngIn, st, en, fx, bgHistory)
        lineBgP = planParams(BG[lineBg], rngIn, st)
      }
      const bg = LD.busy && !(BG[lineBg]?.subtle ?? false) ? 'none' : lineBg
      const cam =
        ov.cam && CAMERA[ov.cam] ? ov.cam : pickCam(rngIn, st, en, fx, layout, emph, history)
      const camP = planParams(CAMERA[cam], rngIn, st)
      const prevCut = out.cuts[out.cuts.length - 1]
      let trans: string | null = null
      let transP = {}
      let transDur = 0
      const canTrans =
        prevCut && Math.abs(prevCut.end - cs) < 0.06 && prevCut.layout !== 'interlude' && dur > 0.5
      if (canTrans) {
        trans = ov.trans && TRANS[ov.trans] ? ov.trans : pickTrans(rngIn, st, en, fx, emph, history)
        if (trans) {
          const TD = TRANS[trans]
          transDur = clamp(TD.dur || 0.35, 0.12, Math.min(0.6, dur * 0.45))
          transP = TD.plan ? TD.plan(rngIn, st) : {}
          enter = 'cut'
          inDur = 0.12
          prevCut.exit = 'cut'
          prevCut.outDur = 0
        }
      }
      out.cuts.push(
        makeCut({
          text: txt,
          lineText: ln.text,
          note: ln.note,
          line: li,
          start: cs,
          end: ce,
          layout,
          enter,
          exit,
          hold,
          inDur,
          outDur,
          params,
          decor,
          scheme: sch,
          seed: hash(lineSeed, k, 17),
          emph,
          recap: !!u.recap,
          words: chunkText(txt),
          stagger: rngIn.range(0.025, 0.06),
          treat,
          treatP,
          bg,
          bgP: bg === lineBg ? lineBgP : {},
          cam,
          camP,
          trans,
          transP,
          transDur,
        }),
      )
      history.push({ layout, enter, exit, hold, treat, cam, trans, decor: decor.map((d) => d.id) })

      const g = fx.glitch * (st.glitchBoost || 1)
      const F = 1 / 24
      // 内置特效同样受部件开关约束；关掉时连掷骰一起跳过，否则后续抽样会整体错位
      const fxOn = (key: string) => on(en, 'fx', key)
      if (fxOn('chroma'))
        addEvent(cs, 'chroma', 1.4 + rngIn.range(0, 2) * fx.chroma + (emph ? 2.5 : 0), 0.25)
      if (fxOn('slice') && rngIn.chance(g * 0.5 + (emph ? 0.3 : 0)))
        addEvent(
          cs,
          'slice',
          0.6 + rngIn.range(0, 0.8) * g + (emph ? 0.5 : 0),
          rngIn.pick([2, 3, 4]) * F,
        )
      if (fxOn('block') && rngIn.chance(g * 0.22))
        addEvent(cs + rngIn.range(0, 0.05), 'block', 0.5 + g, rngIn.pick([2, 4]) * F)
      if (fxOn('shake') && (emph || rngIn.chance(fx.motion * 0.18)))
        addEvent(cs, 'shake', (emph ? 1 : 0.5) * fx.motion, 0.3)
      if (fxOn('flash') && fx.flash && ln.impact && k === 0) addEvent(cs, 'flash', 1, 3 * F)
      if (fxOn('invert') && rngIn.chance(0.035 * g)) addEvent(cs, 'invert', 1, 2 * F)
      if (fxOn('zoom') && ((emph && rngIn.chance(0.6)) || rngIn.chance(0.06 * fx.motion)))
        addEvent(cs, 'zoom', 0.7 + 0.5 * fx.motion, 0.22)
      if (fxOn('mosaic') && rngIn.chance(0.04 * g)) addEvent(cs, 'mosaic', 1, 3 * F)
      if (fxOn('slice') && dur > 0.8 && rngIn.chance(g * 0.4))
        addEvent(cs + rngIn.range(0.35, 0.8) * dur, 'slice', 0.4 + g * 0.4, 2 * F)
      // 全片第一个镜头不追加特效：多掷这一次会让后面每一镜的抽样整体偏移
      if (out.cuts.length > 1 || k > 0 || li > 0) {
        const extraFx = pickFx(rngIn, st, en, fx, emph, fxHistory, 'edge')
        if (extraFx) {
          const D2 = FXE[extraFx]
          addEvent(
            cs - (D2.pre || 0) * F,
            extraFx,
            (D2.amp || 1) * (0.7 + 0.5 * g + (emph ? 0.3 : 0)),
            (D2.dur || 4) * F,
          )
          fxHistory.push(extraFx)
        }
      }
      if (dur > 1.1) {
        const mid = pickFx(rngIn, st, en, fx, emph, fxHistory, 'mid')
        if (mid) {
          const D2 = FXE[mid]
          addEvent(
            cs + rngIn.range(0.4, 0.75) * dur,
            mid,
            (D2.amp || 1) * (0.5 + 0.4 * g),
            (D2.dur || 3) * F,
          )
        }
      }
    })

    const nextStart = li < parsed.lines.length - 1 ? tm.starts[li + 1] : null
    if (nextStart != null && nextStart - visEnd > 1.3) {
      const r2 = rng(hash(lineSeed, 404))
      out.cuts.push(
        makeCut({
          text: title || '',
          lineText: '',
          line: li,
          start: visEnd,
          end: nextStart,
          layout: 'interlude',
          note: null,
          enter: 'blur',
          exit: 'blur',
          hold: 'still',
          inDur: 0.3,
          outDur: 0.3,
          params: LAYOUTS.interlude.plan(
            r2,
            { text: title || '', n: glyphCount(title || ''), W, H, dur: nextStart - visEnd },
            st,
          ),
          decor: pickDecor(r2, st, en, { ...fx, decor: 1 }, 'interlude'),
          scheme: schemeIdx,
          seed: hash(lineSeed, 405),
        }),
      )
    }
  })

  out.cuts.sort((a, b) => a.start - b.start)
  out.cuts.forEach((c, i) => {
    c.index = i
  })
  out.events.sort((a, b) => a.t - b.t)
  out.energy = audio?.energy ?? null
  out.energyRate = audio?.energyRate ?? 0
  return out
}
