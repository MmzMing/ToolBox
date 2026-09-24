/**
 * 音乐转视频的对外服务层：把引擎的纯逻辑集中成稳定 API，并负责
 * 持久化数据（localStorage 可能被手改或来自旧版本）的校验兜底。
 *
 * UI 只 import 这里，不直接深入 engine/，方便后续继续扩部件库而不扩散耦合。
 */
import type { AudioFeatures, Plan, Project } from './engine/types'
import { defaultProject, plan as buildPlanCore } from './engine/planner'

export { analyzeAudio, beatGrid, decodeAudioFile } from './engine/audio'
export {
  defaultProject,
  designSize,
  outputSize,
  parseLyrics,
  plan,
  computeTiming,
} from './engine/planner'
export { chunkText, splitLines } from './engine/text-layout'
export { omakase } from './engine/omakase'
export { STYLES, STYLE_ORDER, resolveStyle } from './engine/styles'
export { MOODS, MOOD_ORDER } from './engine/moods'
export { FONTS, addUserFont, ensureFonts, fontsOfPlan, loadUserFont } from './engine/fonts'
export { clearFontCaches } from './engine/glyphs'
export { Renderer } from './engine/renderer'
export { planForAE } from './engine/ae-export'
export { GROUP_KEYS, isSpecial, orderOf } from './engine/registry'
export { randomPalette } from './engine/util'
export {
  downloadBlob,
  EXPORT_ERRORS,
  exportMp4,
  exportPngZip,
  pickVideoCodec,
  safeFileName,
  type Quality,
} from './engine/export'
export type { AudioFeatures, AudioInfo, Plan, Project } from './engine/types'

/** 导出任务进度（text 已本地化，由 UI 组装） */
export type ExportJob = { kind: 'mp4' | 'png' | 'pnga'; progress: number; text: string } | null

/** 一次构建分镜：把音频特征带进 plan */
export function buildPlan(project: Project, audio: AudioFeatures | null): Plan {
  return buildPlanCore(project, audio)
}

const ASPECTS = ['16:9', '9:16', '1:1', '4:5', '21:9', '4:3', '3:4'] as const
const RESOLUTIONS = [720, 1080, 1440, 2160] as const
const FRAMES = [24, 30, 60] as const
const HUD_MODES = ['auto', 'on', 'off'] as const

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/** 0..1 之外一律回退默认值：滑块值来自 localStorage，脏值会毁掉整条渲染链 */
function ratio(value: unknown, fallback: number): number {
  return num(value, fallback, 0, 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验并补齐持久化的 project。
 *
 * 任何字段缺失或类型不对都回退默认值；歌词只保留长度合理的安全文本，
 * 未知样式/字体 key 交给引擎的 resolveStyle 兜底（它会回落到 noir）。
 */
export function normalizeProject(raw: unknown): Project {
  const base = defaultProject()
  if (!isRecord(raw)) return base
  const fx = isRecord(raw.fx) ? raw.fx : {}
  const timing = isRecord(raw.timing) ? raw.timing : {}
  const colors = isRecord(raw.colors) ? raw.colors : {}
  const enabled = isRecord(raw.enabled) ? raw.enabled : base.enabled
  const overrides: Project['overrides'] = {}
  if (isRecord(raw.overrides)) {
    for (const [k, v] of Object.entries(raw.overrides)) {
      const index = Number(k)
      if (!Number.isInteger(index) || index < 0 || !isRecord(v)) continue
      overrides[index] = {
        ...(v as Project['overrides'][number]),
        lock: v.lock === true,
      }
    }
  }
  const lineTimes: Record<number, number> = {}
  if (isRecord(timing.lineTimes)) {
    for (const [k, v] of Object.entries(timing.lineTimes)) {
      const index = Number(k)
      const at = Number(v)
      if (Number.isInteger(index) && index >= 0 && Number.isFinite(at)) lineTimes[index] = at
    }
  }
  return {
    version: base.version,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
    artist: typeof raw.artist === 'string' ? raw.artist.slice(0, 120) : '',
    lyrics: typeof raw.lyrics === 'string' ? raw.lyrics.slice(0, 20000) : base.lyrics,
    style: typeof raw.style === 'string' ? raw.style : base.style,
    mood: typeof raw.mood === 'string' ? raw.mood : null,
    extra: raw.extra !== false,
    traditional: raw.traditional !== false,
    seed: Math.trunc(num(raw.seed, base.seed, 0, 1e9)),
    aspect: oneOf(raw.aspect, ASPECTS, base.aspect),
    res: RESOLUTIONS.includes(raw.res as (typeof RESOLUTIONS)[number])
      ? (raw.res as number)
      : base.res,
    fps: FRAMES.includes(raw.fps as (typeof FRAMES)[number]) ? (raw.fps as number) : base.fps,
    fx: {
      motion: ratio(fx.motion, base.fx.motion),
      glitch: ratio(fx.glitch, base.fx.glitch),
      chroma: ratio(fx.chroma, base.fx.chroma),
      decor: ratio(fx.decor, base.fx.decor),
      density: ratio(fx.density, base.fx.density),
      texture: ratio(fx.texture, base.fx.texture),
      bgSwitch: ratio(fx.bgSwitch, base.fx.bgSwitch),
      flash: fx.flash !== false,
      onTwos: fx.onTwos !== false,
      koma: Math.trunc(num(fx.koma, base.fx.koma, 0, 60)),
      hud: oneOf(fx.hud, HUD_MODES, base.fx.hud),
    },
    enabled: isRecord(enabled) ? (enabled as Project['enabled']) : base.enabled,
    timing: {
      bpm: num(timing.bpm, base.timing.bpm, 0, 300),
      offset: num(timing.offset, base.timing.offset, -5, 30),
      snap: timing.snap !== false,
      tail: num(timing.tail, base.timing.tail, 0, 30),
      lineTimes,
      lineScale: num(timing.lineScale, base.timing.lineScale, 0.2, 5),
    },
    overrides,
    colors: {
      enabled: colors.enabled === true,
      accentOn: colors.accentOn === true,
      bg: typeof colors.bg === 'string' ? colors.bg : undefined,
      fg: typeof colors.fg === 'string' ? colors.fg : undefined,
      sub: typeof colors.sub === 'string' ? colors.sub : undefined,
      accent: typeof colors.accent === 'string' ? colors.accent : undefined,
      ghostA: typeof colors.ghostA === 'string' ? colors.ghostA : undefined,
      ghostB: typeof colors.ghostB === 'string' ? colors.ghostB : undefined,
    },
    fonts: isRecord(raw.fonts) ? (raw.fonts as Project['fonts']) : {},
    includeAudio: raw.includeAudio !== false,
  }
}

/** 预览/导出共用的画面文字（喂给字体预热） */
export function planText(plan: Plan): string {
  const parts = [plan.title, plan.artist]
  for (const c of plan.cuts) parts.push(c.text, c.lineText, c.note ?? '')
  return parts.join('\n')
}

/** 是否有可用的视频编码器（决定导出按钮是否可用） */
export function canExport(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/** 工程文件里写死的类型标记，用来把我们的 .json 和别人的 .json 区分开 */
const PROJECT_KIND = 'toolbox.music-to-video'

/** 导出成工程文件（.json）文本：只含可序列化设置，音频与字体二进制不入库 */
export function serializeProject(project: Project): string {
  return JSON.stringify({ kind: PROJECT_KIND, version: project.version, project }, null, 2)
}

/**
 * 读取工程文件。认不出的内容返回 null（由界面提示），
 * 认得出但字段坏了的交给 normalizeProject 逐项兜底。
 */
export function parseProject(text: string): Project | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw)) return null
  const body = isRecord(raw.project) ? raw.project : null
  if (raw.kind === PROJECT_KIND) return body ? normalizeProject(body) : null
  // 没有类型标记时，至少要长得像一份工程设置才认
  if (body || ['lyrics', 'style', 'seed', 'title'].some((k) => k in raw)) {
    return normalizeProject(body ?? raw)
  }
  return null
}
