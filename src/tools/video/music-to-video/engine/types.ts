/**
 * 音乐转视频引擎的共享类型。
 *
 * 引擎是纯 Canvas2D 渲染管线（无 React 依赖），按 JIZURA 的架构分层：
 * util / script / fonts / text 提供绘制基元，anim / layouts / decor / styles
 * 是可注册的"表现部件库"，planner 决定每个 cut 用哪些部件，renderer 逐帧合成。
 */

/** mulberry32 随机流；除调用本体外还带常用派生方法 */
export type Rng = (() => number) & {
  range: (lo: number, hi: number) => number
  int: (lo: number, hi: number) => number
  pick: <T>(arr: readonly T[]) => T
  chance: (p: number) => boolean
  /** 加权取值：[值, 权重] 列表 */
  wpick: <T>(list: readonly (readonly [T, number])[]) => T
}

export type AspectKey = '16:9' | '9:16' | '1:1' | '4:5' | '21:9' | '4:3' | '3:4'

/**
 * 带独立开关的部件集合（JIZURA 的 J.SETS）。
 * 归属由 sets.ts 在合并注册表时按包名写入，定义里不手写；
 * 关掉一个集合只是把它排除出"随机挑选"，逐行手工指定永远可用。
 */
export type PartSet = 'horror' | 'typo' | 'kinetic'

/** 表现部件分组（顺序 = 注册表顺序 = UI 列表顺序） */
export type GroupKey =
  'layout' | 'enter' | 'hold' | 'exit' | 'decor' | 'treat' | 'bg' | 'cam' | 'fx' | 'trans'

export type FontRole = 'display' | 'serif' | 'body' | 'mono'

/** 部件在随机选取时的权重偏好：`{ 部件 key: 倍率 }` */
export type Bias = Record<string, number>

/** 一套配色方案（cuts 会在多套之间切换） */
export type Scheme = {
  bg: string
  fg: string
  sub: string
  accent: string
  accent2: string
  ink: string
  dim: string
  ghostA: string
  ghostB: string
  paper?: boolean
  swap?: boolean
  grad?: readonly [string, string]
}

export type StylePack = {
  /** 首版之后追加的风格（受"包含追加部件"开关约束） */
  extra?: boolean
  /** 传统纹样主题的风格 */
  traditional?: boolean
  /** 隶属于某个部件集合（horror 的配色只在该集合开关打开、且情绪为 horror 时参与） */
  set?: PartSet
  schemes: Scheme[]
  fonts: Record<FontRole, string[]>
  texture: { grain: number; paper: number; scan: number }
  /** 色散（chromatic aberration）强度倍率 */
  ghost: number
  bias: Partial<Record<GroupKey, Bias>>
  decor?: Bias
  hud: boolean
  glow?: number
  glitchBoost?: number
  useGrad?: boolean
  moods?: string[]
}

/** 字体目录条目 */
export type FontDef = {
  label: string
  family: string
  weight: number
  kind: 'sans' | 'serif' | 'display' | 'brush' | 'round' | 'mono' | 'pixel' | 'hand'
  fallback: string
  /** Google Fonts css2 的 family 参数，如 `Noto+Sans+SC:wght@400;900` */
  gf?: string
}

/** 全局表现强度 */
export type FxSettings = {
  motion: number
  glitch: number
  chroma: number
  decor: number
  density: number
  texture: number
  bgSwitch: number
  flash: boolean
  onTwos: boolean
  /** 每秒绘制多少"帧格"（12 = 拍二，0 = 逐输出帧） */
  koma: number
  hud: 'auto' | 'on' | 'off'
}

export type TimingSettings = {
  /** 0 = 使用音频分析出的 BPM */
  bpm: number
  offset: number
  snap: boolean
  tail: number
  lineTimes: Record<number, number>
  lineScale: number
}

/** 单行歌词的手工指定（覆盖 planner 的随机挑选） */
export type LineOverride = {
  layout?: string
  enter?: string
  exit?: string
  hold?: string
  decor?: string[]
  treat?: string
  bg?: string
  cam?: string
  trans?: string
  lock?: boolean
  lockedSeed?: number
  seed?: number
  single?: boolean
}

export type ColorOverrides = {
  enabled: boolean
  accentOn?: boolean
  bg?: string
  fg?: string
  sub?: string
  accent?: string
  ghostA?: string
  ghostB?: string
}

export type Project = {
  version: number
  title: string
  artist: string
  lyrics: string
  style: string
  mood: string | null
  /** 随机挑选是否可以使用追加部件包 */
  extra: boolean
  /** 随机挑选是否可以使用传统纹样部件 */
  traditional: boolean
  /** 文字PV系部件（typo）是否参与随机；默认开 */
  typo: boolean
  /** キネティック部件（kinetic）是否参与随机；默认开 */
  kinetic: boolean
  /** 恐怖演出（horror）是否参与随机，并决定一键随机会不会抽到 horror 情绪；默认关 */
  horror: boolean
  seed: number
  aspect: AspectKey
  res: number
  fps: number
  fx: FxSettings
  enabled: Partial<Record<GroupKey, Record<string, boolean>>>
  timing: TimingSettings
  overrides: Record<number, LineOverride>
  colors: ColorOverrides
  fonts: Partial<Record<FontRole, string>>
  includeAudio: boolean
}

/** 解析后的一行歌词 */
export type LyricLine = {
  text: string
  /** `|` 之后的注释 */
  note: string | null
  /** 以 `!` 结尾 = 强调 */
  impact: boolean
  /** `*词*` 包裹的重音词 */
  emph: string[]
  /** `/` 手工分词 */
  manual: string[] | null
  gapBefore: boolean
  /** LRC 时间戳（秒），无时间戳为 null */
  lrc: number | null
}

export type ParsedLyrics = {
  lines: LyricLine[]
  meta: Record<string, string>
}

/** 装饰元素实例参数 */
export type DecorParam = {
  id: string
  seed: number
  n: number
  right: boolean
  low: boolean
  accent: boolean
  corner: boolean
  big: boolean
  mode: 'count' | 'index'
  from: number
  to: number
  v: number
  r: number
}

/** params 的值域：所有部件参数都能塞进这一个类型 */
export type ParamValue = string | number | boolean | readonly (string | number)[] | null
export type Params = Record<string, ParamValue>

/** 一个镜头（cut）= 一小段文字在屏幕上的一次呈现 */
export type Cut = {
  text: string
  lineText: string
  note: string | null
  line: number
  start: number
  end: number
  dur: number
  layout: string
  enter: string
  exit: string
  hold: string
  inDur: number
  outDur: number
  params: Params
  decor: DecorParam[]
  scheme: number
  seed: number
  words: string[]
  stagger: number
  emph: boolean
  recap: boolean
  treat: string
  treatP: Params
  bg: string
  bgP: Params
  cam: string
  camP: Params
  trans: string | null
  transP: Params
  transDur: number
  index?: number
  mi?: number
}

export type PlanLine = {
  index: number
  text: string
  start: number
  end: number
  visEnd: number
  note: string | null
  impact: boolean
  emph: string[]
  chunks: string[] | null
  seed: number
}

/** 时间点上的后期事件（色散、抖动、切片…） */
export type PlanEvent = {
  t: number
  type: string
  amp: number
  dur: number
}

export type Plan = {
  version: number
  title: string
  artist: string
  W: number
  H: number
  fps: number
  duration: number
  styleKey: string
  style: StylePack
  fx: FxSettings
  seed: number
  lines: PlanLine[]
  cuts: Cut[]
  events: PlanEvent[]
  beats: number[]
  hud: boolean
  energy: Float32Array | null
  energyRate: number
}

/** 节拍上下文 */
export type BeatInfo = { since: number; len: number; index: number }

/** 文字绘制结果：设计空间包围盒 + 逐字框 */
export type GlyphBox = { x: number; y: number; w: number; h: number }
export type BBox = {
  x0: number
  y0: number
  x1: number
  y1: number
  boxes: GlyphBox[]
  cx: number
  cy: number
}

/** 字形碎片（连通常量）在 em 空间中的描述 */
export type GlyphPiece = {
  id: number
  /** 白色碎片精灵图 */
  cv: HTMLCanvasElement
  res: number
  cx: number
  cy: number
  w: number
  h: number
  area: number
  frags: Fragment[] | null
  /** 爆散碎片：绘制时先裁剪到这个多边形（坐标为围绕碎片中心的 em） */
  clip?: readonly (readonly [number, number])[]
  clipOx?: number
  clipOy?: number
}
export type Fragment = { poly: readonly (readonly [number, number])[]; cx: number; cy: number }
export type Glyph = { ch: string; res: number; pieces: GlyphPiece[]; frags: GlyphPiece[] | null }

/** 单个字形的逐字变换（返回 null 表示隐藏） */
export type CharT = {
  dx?: number
  dy?: number
  rot?: number
  s?: number
  sx?: number
  sy?: number
  a?: number
  hide?: boolean
  ch?: string
  color?: string
  skew?: number
  blur?: number
  outline?: boolean
  clipX?: readonly [number, number]
  clipY?: readonly [number, number]
}
export type CharFn = (i: number, g: LaidGlyph, n: number) => CharT | null
/** 碎片变换；PID = 静止 */
export type PieceT = {
  dx: number
  dy: number
  rot: number
  s: number
  st: number
  sdir: number
  a: number
}
export type PieceFn = (
  charIndex: number,
  pieceIndex: number,
  piece: GlyphPiece,
  ox: number,
  oy: number,
  g: LaidGlyph,
) => PieceT | null
export const PIECE_IDLE: PieceT = { dx: 0, dy: 0, rot: 0, s: 1, st: 1, sdir: 0, a: 1 }

export type LaidGlyph = {
  ch: string
  i: number
  li: number
  ci: number
  n: number
  x: number
  y: number
  w: number
  h: number
  r90: boolean
  vx: number
  vy: number
}
/** layoutText 的返回值：字形数组 + 整体尺寸 */
export type LaidText = LaidGlyph[] & { W: number; H: number; N: number }

/** 一个可绘制的文本项 */
export type TextItem = {
  text: string
  font: string
  size: number
  x: number
  y: number
  rot?: number
  skew?: number
  blend?: GlobalCompositeOperation
  sx?: number
  sy?: number
  track?: number
  lead?: number
  align?: 'left' | 'center' | 'right'
  vertical?: boolean
  color?: string
  alpha?: number
  blur?: number
  fill?: boolean
  fillAlpha?: number
  stroke?: number
  strokeColor?: string
  strokeDash?: number[]
  /** 描边虚线进度（0..1），用于"笔画描绘"类入场 */
  dash?: number | null
  strokeUnder?: boolean
  shadow?: { color?: string; blur?: number; dx?: number; dy?: number }
  extrude?: { n: number; dx: number; dy: number; color?: string; a?: number; fade?: boolean }
  gradient?: readonly string[] | readonly (readonly [number, string])[]
  pattern?: 'dots' | 'stripes' | 'hatch' | 'grid' | 'lines'
  patternColor?: string
  patternBg?: string
  charFn?: CharFn | null
  pieceFn?: PieceFn | null
  charFns?: CharFn[]
  pieceFns?: PieceFn[]
  pieceMode?: boolean
  shatter?: boolean
  delay?: number
  seed?: number
  mi?: number
  noHold?: boolean
  ghost?: boolean
  ghostAlpha?: number
  clip?: readonly [number, number]
  clipY?: readonly [number, number]
  clipFn?: (ctx: CanvasRenderingContext2D, env: Env, it: TextItem) => void
  bands?: (readonly [number, number, number])[] | null
  vbands?: (readonly [number, number, number])[] | null
  streak?: { n: number; dx: number; dy?: number; a: number } | null
  echo?: {
    n: number
    dx?: number
    dy?: number
    rot?: number
    scale?: number
    a?: number
    decay?: number
    color?: string
    outline?: boolean
  } | null
  wipeBar?: { x: number; h: number } | null
  cursorAt?: number
  pre?: (env: Env, it: TextItem) => void
  post?: (env: Env, it: TextItem, bb: BBox | null) => void
  plain?: boolean
  _lay?: LaidText
  _m?: { w: number; h: number; lay: LaidText }
}

/** 画布图元可接受的颜色值：色值字符串、渐变或图案 */
export type Paint = string | CanvasGradient | CanvasPattern

/** 逐帧传递的绘制环境 */
export type Env = {
  ctx: CanvasRenderingContext2D
  W: number
  H: number
  sc: Scheme
  st: StylePack
  fx: FxSettings
  fps: number
  cut: Cut | null
  plan: Plan
  pass: 'main' | 'A' | 'B'
  passColor: string | null
  t: number
  lt: number
  ltb: number
  step: number
  scale: number
  allowFilter: boolean
  energy: number | null
  beat: BeatInfo | null
  pIn: number
  pOut: number
  inLayer?: boolean
  bgOnly?: boolean
  draw: (it: TextItem) => BBox | null
  rect: (x: number, y: number, w: number, h: number, c: Paint, a?: number, g?: boolean) => void
  line: (
    pts: readonly (readonly [number, number])[],
    c: Paint,
    lw?: number,
    a?: number,
    g?: boolean,
  ) => void
  polyPartial: (
    pts: readonly (readonly [number, number])[],
    e: number,
    c: Paint,
    lw?: number,
    a?: number,
    g?: boolean,
  ) => void
  circle: (
    cx: number,
    cy: number,
    r: number,
    fill: Paint | null,
    stroke: Paint | null,
    lw?: number,
    a?: number,
    g?: boolean,
  ) => void
  arc: (
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    c: Paint,
    lw?: number,
    a?: number,
    g?: boolean,
  ) => void
  rrect: (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: Paint | null,
    a?: number,
    g?: boolean,
    stroke?: Paint | null,
    lw?: number,
  ) => void
  poly: (pts: readonly (readonly [number, number])[], c: Paint, a?: number, g?: boolean) => void
  blob: (pts: readonly (readonly [number, number])[], c: Paint, a?: number, g?: boolean) => void
}

/** 动效上下文：整个 cut 的时长与出入场时长 */
export type AnimCtx = { dur: number; inDur: number; outDur: number }

/**
 * 部件的集合归属：由 sets.ts 在合并注册表时写入，定义里不手写。
 * extra = 首版之后追加的部件；traditional = 围绕传统器物/纹样（灯笼、印章、青海波…）的部件。
 */
export type PartFlags = {
  pack?: string
  extra?: boolean
  traditional?: boolean
  /** 部件所属集合（由 sets.ts 按包名写入） */
  set?: PartSet
  /** JIZURA给 After Effects 面板的等价表现名（只影响 AE 导出，不参与渲染） */
  ae?: string
}

/** 入场 / 保持 / 出场配方 */
export type AnimDef = PartFlags & {
  w?: number
  tags?: string[]
  pieces?: boolean
  shatter?: boolean
  cursor?: boolean
  bar?: boolean
  minDur?: number
  maxChars?: number
  special?: boolean
  inDur?: (dur: number, n: number) => number
  outDur?: (dur: number, n: number) => number
  apply: (env: Env, it: TextItem, p: number, ctx: AnimCtx) => void
}

/** 构图（layout） */
export type LayoutDef = PartFlags & {
  fits: (n: number) => boolean
  plan: (
    rng: Rng,
    cut: { text: string; n: number; W: number; H: number; dur: number },
    st: StylePack,
  ) => Params
  render: (env: Env) => BBox | null
  w?: number
  tags?: string[]
  special?: boolean
  portrait?: number
  emph?: number
  enterBias?: Bias
  busy?: boolean
  cam?: boolean
  treat?: false | 'safe'
}

/** 装饰元素 */
export type DecorDef = PartFlags & {
  layer: 'back' | 'front'
  w?: number
  tags?: string[]
  subtle?: boolean
  draw: (env: Env, bb: BBox | null, p: DecorParam) => void
}

/** 文字加工（描边、立体、荧光笔…） */
export type TreatDef = PartFlags & {
  w?: number
  tags?: string[]
  safe?: boolean
  apply: (env: Env, it: TextItem, p: Params) => void
  plan?: (rng: Rng, st: StylePack) => Params
}

/** 整屏背景图形 */
export type BgDef = PartFlags & {
  w?: number
  tags?: string[]
  subtle?: boolean
  draw: (env: Env, p: Params) => void
  plan?: (rng: Rng, st: StylePack) => Params
}

/** 镜头运动 */
export type CamDef = PartFlags & {
  w?: number
  tags?: string[]
  strong?: boolean
  get: (env: Env, p: Params) => CamState
  plan?: (rng: Rng, st: StylePack) => Params
}
export type CamState = {
  x?: number
  y?: number
  s?: number
  sx?: number
  sy?: number
  rot?: number
  skx?: number
  blur?: number
}

/** 后期特效事件 */
export type FxDef = PartFlags & {
  w?: number
  tags?: string[]
  builtin?: boolean
  scratch?: boolean
  edge?: boolean
  mid?: boolean
  glitchy?: boolean
  amp?: number
  dur?: number
  pre?: number
  draw?: (ctx: CanvasRenderingContext2D, ev: PlanEvent, k: number, info: FxInfo) => void
}
export type FxInfo = {
  cw: number
  ch: number
  S: HTMLCanvasElement | null
  sc: Scheme
  st: StylePack
  step: number
  t: number
  scale: number
  renderer: RendererLike
  allowFilter: boolean
  opt: FrameOptions
  tmp: (w: number, h: number) => HTMLCanvasElement
  tmp2?: (w: number, h: number) => HTMLCanvasElement
}

/** 转场（把上一镜与当前镜合成） */
export type TransDef = PartFlags & {
  w?: number
  tags?: string[]
  dur?: number
  plan?: (rng: Rng, st: StylePack) => Params
  draw: (
    ctx: CanvasRenderingContext2D,
    a: HTMLCanvasElement,
    b: HTMLCanvasElement,
    p: number,
    info: TransInfo,
  ) => void
}
export type TransInfo = {
  cw: number
  ch: number
  sc: Scheme
  scPrev: Scheme
  st: StylePack
  P: Params
  step: number
  t: number
  scale: number
  allowFilter: boolean
  seed: number
  tmp: (w: number, h: number) => HTMLCanvasElement
}

export type RendererLike = {
  ensure: (c: HTMLCanvasElement, w: number, h: number) => HTMLCanvasElement
  paper: (W: number, H: number) => HTMLCanvasElement
}

export type FrameOptions = {
  scale?: number
  transparent?: boolean
  fast?: boolean
  noGhost?: boolean
  noTrans?: boolean
  noHud?: boolean
  noPost?: boolean
}

/** 音频分析结果 */
export type AudioInfo = {
  name: string
  duration: number
  sampleRate: number
  buffer: AudioBuffer
  bpm: number
  beats: number[]
  energy: Float32Array
  energyRate: number
  peaks: Float32Array
}

/** 规划只需要这几个音频特征（手工 BPM 时可以在没有音频文件的情况下造出来） */
export type AudioFeatures = {
  duration: number
  beats: number[]
  energy: Float32Array | null
  energyRate: number
}

/** 分类选择器的历史条目（novelty decay 用） */
export type PickHistory = {
  layout: string
  enter: string
  exit: string
  hold: string
  treat: string
  cam: string
  trans: string | null
  decor: string[]
}

/** 一个部件包：按分组导出若干定义，注册表按 PACK_ORDER 的顺序合并 */
export type PackParts = {
  layout?: Record<string, LayoutDef>
  enter?: Record<string, AnimDef>
  hold?: Record<string, AnimDef>
  exit?: Record<string, AnimDef>
  decor?: Record<string, DecorDef>
  treat?: Record<string, TreatDef>
  bg?: Record<string, BgDef>
  cam?: Record<string, CamDef>
  fx?: Record<string, FxDef>
  trans?: Record<string, TransDef>
}
