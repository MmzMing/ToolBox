/**
 * 风格包：配色方案组 + 字体角色 + 质感 + 部件倾向。
 *
 * 移植自 JIZURA 的 12 套核心样式。每套 = 若干可互相切换的配色方案（cuts 在方案间跳色）、
 * 四个字体角色的候选池、颗粒/纸纹/扫描线强度、色散倍率，以及给 planner 的权重偏置。
 * bias / decor 的 key 必须是已移植的部件 key（layout / enter / exit / decor 注册表）；
 * JIZURA 里 decor 的 `hud` 权重指向一个并不存在的装饰部件，已随核心部件表一起剔除
 * （HUD 倾向由顶层 `hud` 布尔表达）。
 *
 * 名称与说明性文案一律走 i18n，这里只放渲染需要的数据。
 */
import { FONTS } from './fonts'
import { HORROR_STYLE_ORDER, horrorStyles } from './packs/styles-horror'
import { EXTRA_STYLE_ORDER, extraStyles } from './packs/style-packs'
import { markStyle } from './sets'
import type { ColorOverrides, Project, Scheme, StylePack } from './types'
import { fitContrast, mix } from './util'

export const STYLES: Record<string, StylePack> = {
  // 黑底白字，青/琥珀色错位残影：冷峻电影感
  noir: {
    schemes: [
      {
        bg: '#060607',
        fg: '#F5EEEA',
        sub: '#BDB6B2',
        accent: '#F5A50C',
        accent2: '#16F4D4',
        ink: '#F5EEEA',
        dim: '#2A2A2E',
        ghostA: '#F5A50C',
        ghostB: '#16F4D4',
      },
      {
        bg: '#F2EDE8',
        fg: '#0B0B0C',
        sub: '#4A4644',
        accent: '#E0600C',
        accent2: '#0FAE98',
        ink: '#0B0B0C',
        dim: '#D9D2CC',
        ghostA: '#F5A50C',
        ghostB: '#16C4B4',
        swap: true,
      },
    ],
    fonts: {
      display: ['sans_black', 'qingke'],
      serif: ['serif_light', 'serif'],
      body: ['sans_med'],
      mono: ['mono'],
    },
    texture: { grain: 0.9, paper: 0, scan: 0 },
    ghost: 1.0,
    bias: {
      layout: { vcols: 2, condensed: 2, marquee: 1.6, tile: 1.4, center: 1.2 },
      enter: { assemble: 2.2, slice: 1.8, stretch: 1.4 },
      exit: { explode: 1.8, fall: 1.2, drift: 1.4 },
    },
    decor: { rings: 0.8, slash: 0.6 },
    hud: false,
  },
  // 深红底 + 白黑二段组 + 扫描线：数据破损的警示感
  crimson: {
    schemes: [
      {
        bg: '#C8103F',
        fg: '#FFFFFF',
        sub: '#FFD9E2',
        accent: '#140509',
        accent2: '#39F2C8',
        ink: '#140509',
        dim: '#B00D37',
        ghostA: '#FFFFFF',
        ghostB: '#39F2C8',
      },
      {
        bg: '#FF6F98',
        fg: '#FFFFFF',
        sub: '#FFE3EB',
        accent: '#1A0710',
        accent2: '#39F2C8',
        ink: '#1A0710',
        dim: '#F25C87',
        ghostA: '#FFFFFF',
        ghostB: '#1A0710',
      },
      {
        bg: '#150509',
        fg: '#FF3D6E',
        sub: '#FF9DB6',
        accent: '#FFFFFF',
        accent2: '#39F2C8',
        ink: '#FF3D6E',
        dim: '#2A0B14',
        ghostA: '#FF3D6E',
        ghostB: '#39F2C8',
      },
    ],
    fonts: { display: ['sans_black'], serif: ['serif'], body: ['sans_med'], mono: ['mono'] },
    texture: { grain: 0.6, paper: 0, scan: 0.4 },
    ghost: 0.8,
    bias: {
      layout: { huge: 2, marquee: 1.6, scatter: 1.5, stack: 1.3, type: 1.3 },
      enter: { scramble: 1.6, slice: 1.6, type: 1.3 },
      exit: { glitch: 2, slice: 1.6 },
    },
    decor: { arrows: 0.8, rings: 0.8 },
    hud: true,
    glitchBoost: 1.4,
  },
  // 警示黄底 + 红蓝点缀 + 计器 UI：环形与箭头主导
  caution: {
    schemes: [
      {
        bg: '#F4D21F',
        fg: '#141414',
        sub: '#3A3510',
        accent: '#E0231C',
        accent2: '#1F3FD8',
        ink: '#141414',
        dim: '#E6C413',
        ghostA: '#E0231C',
        ghostB: '#1F3FD8',
      },
      {
        bg: '#E0231C',
        fg: '#F4D21F',
        sub: '#FFE9A0',
        accent: '#141414',
        accent2: '#FFFFFF',
        ink: '#141414',
        dim: '#C81E17',
        ghostA: '#141414',
        ghostB: '#F4D21F',
      },
      {
        bg: '#18181A',
        fg: '#F4D21F',
        sub: '#DDD6B0',
        accent: '#E0231C',
        accent2: '#FFFFFF',
        ink: '#F4D21F',
        dim: '#26262A',
        ghostA: '#E0231C',
        ghostB: '#1F3FD8',
      },
    ],
    fonts: {
      display: ['serif_black', 'sans_black'],
      serif: ['serif_black', 'serif_bold'],
      body: ['sans_bold'],
      mono: ['mono'],
    },
    texture: { grain: 0.5, paper: 0.25, scan: 0 },
    ghost: 0.55,
    bias: {
      layout: { ring: 2.2, mixed: 2, circle: 1.4, gloss: 1.2 },
      enter: { pop: 1.6, spin: 1.5, wipe: 1.2 },
      exit: { scatter: 1.5, shrink: 1.2 },
    },
    decor: { rings: 1, arrows: 1, counter: 0.8, barcode: 0.8 },
    hud: true,
  },
  // 品红×白 + 粗圆体 + 引线计数：明快的流行感
  magenta: {
    schemes: [
      {
        bg: '#FF0A8C',
        fg: '#FFFFFF',
        sub: '#FFD2EA',
        accent: '#FFFFFF',
        accent2: '#2B2BD9',
        ink: '#FFFFFF',
        dim: '#F0077F',
        ghostA: '#FF8CC8',
        ghostB: '#2B2BD9',
      },
      {
        bg: '#FFFFFF',
        fg: '#FF0A8C',
        sub: '#FF6DB6',
        accent: '#2B2BD9',
        accent2: '#FF0A8C',
        ink: '#FF0A8C',
        dim: '#FFE4F2',
        ghostA: '#2B2BD9',
        ghostB: '#FF8CC8',
      },
      {
        bg: '#2B2BD9',
        fg: '#FFFFFF',
        sub: '#C9C9FF',
        accent: '#FF0A8C',
        accent2: '#FFFFFF',
        ink: '#FFFFFF',
        dim: '#2424C4',
        ghostA: '#FF0A8C',
        ghostB: '#FFFFFF',
      },
    ],
    fonts: {
      display: ['kuaile', 'qingke', 'sans_black'],
      serif: ['serif_bold'],
      body: ['kuaile', 'sans_bold'],
      mono: ['mono'],
    },
    texture: { grain: 0.3, paper: 0, scan: 0 },
    ghost: 0.35,
    bias: {
      layout: { wave: 2.2, gloss: 1.6, huge: 1.6, pill: 1.4, scatter: 1.2 },
      enter: { pop: 2, drop: 1.6, spin: 1.3, blur: 1.2 },
      exit: { scatter: 1.6, shrink: 1.4, blur: 1.2 },
    },
    decor: { leaders: 1, counter: 1, sparks: 0.8, shapes: 0.6 },
    hud: false,
  },
  // 纸张质感 + 靛蓝与洋红 + 明朝体残影：印刷物的温度
  paper: {
    schemes: [
      {
        bg: '#ECE9E3',
        fg: '#1B2350',
        sub: '#4D5270',
        accent: '#C2185B',
        accent2: '#111111',
        ink: '#111111',
        dim: '#DAD6CE',
        ghostA: '#C2185B',
        ghostB: '#1B2350',
        paper: true,
      },
      {
        bg: '#151515',
        fg: '#F0EDE7',
        sub: '#B8B4AC',
        accent: '#C2185B',
        accent2: '#1B2350',
        ink: '#F0EDE7',
        dim: '#232323',
        ghostA: '#C2185B',
        ghostB: '#3A4690',
        paper: true,
      },
      {
        bg: '#C2185B',
        fg: '#FFFFFF',
        sub: '#F6C6D8',
        accent: '#1B2350',
        accent2: '#111111',
        ink: '#1B2350',
        dim: '#B5154F',
        ghostA: '#1B2350',
        ghostB: '#FFFFFF',
        paper: true,
      },
      {
        bg: '#1B2350',
        fg: '#F0EDE7',
        sub: '#AEB2CC',
        accent: '#C2185B',
        accent2: '#FFFFFF',
        ink: '#F0EDE7',
        dim: '#1F2858',
        ghostA: '#C2185B',
        ghostB: '#FFFFFF',
        paper: true,
      },
    ],
    fonts: {
      display: ['serif_black', 'xiaowei'],
      serif: ['serif_black', 'serif_bold'],
      body: ['serif'],
      mono: ['mono'],
    },
    texture: { grain: 0.7, paper: 1, scan: 0 },
    ghost: 0.5,
    bias: {
      layout: { stack: 2.2, mixed: 1.8, huge: 1.6, vcols: 1.4, circle: 1.2 },
      enter: { wipe: 1.6, stretch: 1.4, blur: 1.2, slice: 1.2 },
      exit: { drift: 1.6, wipe: 1.4 },
    },
    decor: { bars: 1, blobs: 0.8, shapes: 0.6, waveform: 0.4 },
    hud: false,
  },
  // 炭黑底 + 细线框 + 橙的点缀与日食环：安静的高反差
  hud: {
    schemes: [
      {
        bg: '#131315',
        fg: '#EFEDEA',
        sub: '#8E8B88',
        accent: '#F25A2B',
        accent2: '#FFFFFF',
        ink: '#EFEDEA',
        dim: '#1E1E21',
        ghostA: '#F25A2B',
        ghostB: '#7FD7FF',
      },
      {
        bg: '#0B0B0C',
        fg: '#FFFFFF',
        sub: '#9A9796',
        accent: '#F25A2B',
        accent2: '#FFFFFF',
        ink: '#F25A2B',
        dim: '#18181A',
        ghostA: '#F25A2B',
        ghostB: '#FFFFFF',
      },
    ],
    fonts: {
      display: ['sans_black'],
      serif: ['serif_bold', 'serif_light'],
      body: ['sans_med'],
      mono: ['mono'],
    },
    texture: { grain: 1, paper: 0, scan: 0.2 },
    ghost: 0.6,
    bias: {
      layout: { circle: 2, ring: 1.6, vcols: 1.4, center: 1.2, gloss: 1 },
      enter: { blur: 1.6, type: 1.4, assemble: 1.3 },
      exit: { blur: 1.4, drift: 1.4, explode: 1.2 },
    },
    decor: { rings: 1, arrows: 1, grid: 0.8, slash: 0.6 },
    hud: true,
    glow: 1.4,
  },
  // 黑×青绿×荧光莱姆 + 标签贴纸 + 狭缝扫描：终端机感
  mint: {
    schemes: [
      {
        bg: '#0A0E0D',
        fg: '#E6FFF5',
        sub: '#7FB9A8',
        accent: '#9CFF3A',
        accent2: '#2E8C74',
        ink: '#E6FFF5',
        dim: '#142420',
        ghostA: '#FF3B6B',
        ghostB: '#2EE6C8',
      },
      {
        bg: '#3FAE93',
        fg: '#0A0E0D',
        sub: '#123A31',
        accent: '#FFFFFF',
        accent2: '#9CFF3A',
        ink: '#0A0E0D',
        dim: '#39A087',
        ghostA: '#FFFFFF',
        ghostB: '#0A0E0D',
      },
      {
        bg: '#F2F2EE',
        fg: '#0A0E0D',
        sub: '#40504B',
        accent: '#2E8C74',
        accent2: '#9CFF3A',
        ink: '#0A0E0D',
        dim: '#E2E4DE',
        ghostA: '#2E8C74',
        ghostB: '#9CFF3A',
      },
    ],
    fonts: {
      display: ['sans_black', 'qingke'],
      serif: ['serif'],
      body: ['sans_med'],
      mono: ['mono', 'pixel'],
    },
    texture: { grain: 0.8, paper: 0, scan: 0.6 },
    ghost: 0.9,
    bias: {
      layout: { labels: 2.4, tile: 1.6, marquee: 1.4, type: 1.4, diag: 1.2 },
      enter: { scramble: 1.8, type: 1.6, flicker: 1.4 },
      exit: { glitch: 1.6, slice: 1.4 },
    },
    decor: { grid: 0.8, barcode: 0.8, sparks: 0.5 },
    hud: true,
  },
  // 墨色底 + 明朝体 + 辞书注释与引线：克制的编辑排版
  specimen: {
    schemes: [
      {
        bg: '#1B1A1C',
        fg: '#F2F0EC',
        sub: '#A19E99',
        accent: '#F2F0EC',
        accent2: '#C8B98C',
        ink: '#F2F0EC',
        dim: '#2A292C',
        ghostA: '#6E6A66',
        ghostB: '#C8B98C',
      },
      {
        bg: '#F2F0EC',
        fg: '#1B1A1C',
        sub: '#5E5B57',
        accent: '#1B1A1C',
        accent2: '#8A7A4E',
        ink: '#1B1A1C',
        dim: '#E3E0DA',
        ghostA: '#B9B4AD',
        ghostB: '#8A7A4E',
      },
    ],
    fonts: {
      display: ['serif_black', 'xiaowei'],
      serif: ['serif', 'serif_light'],
      body: ['serif'],
      mono: ['mono'],
    },
    texture: { grain: 0.6, paper: 0.3, scan: 0 },
    ghost: 0.25,
    bias: {
      layout: { gloss: 2.6, vcols: 1.8, mixed: 1.4, center: 1.2, tile: 1 },
      enter: { type: 1.8, blur: 1.6, wipe: 1.2 },
      exit: { blur: 1.6, drift: 1.2, wipe: 1.2 },
    },
    decor: { leaders: 1, slash: 0.8, rings: 0.4 },
    hud: false,
  },
  // 橄榄×黄 + 箭头与标识 + 网点：交通导视感
  transit: {
    schemes: [
      {
        bg: '#5B582B',
        fg: '#FFFFFF',
        sub: '#E6E2BC',
        accent: '#E8C21A',
        accent2: '#1A1A1A',
        ink: '#E8C21A',
        dim: '#67633A',
        ghostA: '#E8C21A',
        ghostB: '#1A1A1A',
      },
      {
        bg: '#1A1A1A',
        fg: '#FFFFFF',
        sub: '#B8B5A0',
        accent: '#E8C21A',
        accent2: '#FFFFFF',
        ink: '#E8C21A',
        dim: '#242424',
        ghostA: '#E8C21A',
        ghostB: '#7C7A55',
      },
      {
        bg: '#9C9A94',
        fg: '#FFFFFF',
        sub: '#F0EEE6',
        accent: '#E8C21A',
        accent2: '#1A1A1A',
        ink: '#1A1A1A',
        dim: '#A6A49E',
        ghostA: '#E8C21A',
        ghostB: '#1A1A1A',
      },
    ],
    fonts: { display: ['sans_black'], serif: ['serif_bold'], body: ['sans_bold'], mono: ['mono'] },
    texture: { grain: 0.8, paper: 0.2, scan: 0 },
    ghost: 0.5,
    bias: {
      layout: { mixed: 2, scatter: 1.6, diag: 1.4, huge: 1.2 },
      enter: { spin: 1.6, drop: 1.4, pop: 1.2, stretch: 1.2 },
      exit: { scatter: 1.4, stretch: 1.4 },
    },
    decor: { arrows: 1.4, shapes: 1, counter: 0.8, rings: 0.6 },
    hud: false,
  },
  // 亮蓝×白×黑 + 几何拼贴与斜带：构成主义海报
  blueprint: {
    schemes: [
      {
        bg: '#1B1BE8',
        fg: '#FFFFFF',
        sub: '#C7C7FF',
        accent: '#000000',
        accent2: '#FFFFFF',
        ink: '#000000',
        dim: '#2323F0',
        ghostA: '#000000',
        ghostB: '#8C8CFF',
      },
      {
        bg: '#000000',
        fg: '#FFFFFF',
        sub: '#9A9AFF',
        accent: '#1B1BE8',
        accent2: '#FFFFFF',
        ink: '#1B1BE8',
        dim: '#0A0A30',
        ghostA: '#1B1BE8',
        ghostB: '#FFFFFF',
      },
      {
        bg: '#FFFFFF',
        fg: '#1B1BE8',
        sub: '#5A5AF0',
        accent: '#000000',
        accent2: '#1B1BE8',
        ink: '#1B1BE8',
        dim: '#EDEDFF',
        ghostA: '#000000',
        ghostB: '#8C8CFF',
      },
    ],
    fonts: {
      display: ['qingke', 'sans_black'],
      serif: ['serif_bold'],
      body: ['sans_bold'],
      mono: ['mono', 'pixel'],
    },
    texture: { grain: 0.4, paper: 0, scan: 0 },
    ghost: 0.6,
    bias: {
      layout: { diag: 2.2, labels: 1.4, huge: 1.4, condensed: 1.2 },
      enter: { wipe: 1.6, slice: 1.6, stretch: 1.3 },
      exit: { wipe: 1.6, slice: 1.4, glitch: 1.2 },
    },
    decor: { shapes: 1.4, stripes: 1, slash: 1, grid: 0.6 },
    hud: false,
  },
  // 亮灰底 + 红色渐变 + 胶囊块：干净的商业感
  rouge: {
    schemes: [
      {
        bg: '#E4E2E0',
        fg: '#141414',
        sub: '#6B6866',
        accent: '#D40F1C',
        accent2: '#141414',
        ink: '#141414',
        dim: '#D8D6D4',
        ghostA: '#D40F1C',
        ghostB: '#6B6866',
        grad: ['#E3141F', '#4A0005'],
      },
      {
        bg: '#140405',
        fg: '#FFFFFF',
        sub: '#C98A8E',
        accent: '#E3141F',
        accent2: '#FFFFFF',
        ink: '#E3141F',
        dim: '#220A0C',
        ghostA: '#E3141F',
        ghostB: '#FFFFFF',
        grad: ['#FF4A52', '#6A0008'],
      },
    ],
    fonts: {
      display: ['sans_black', 'qingke'],
      serif: ['serif_black'],
      body: ['sans_med'],
      mono: ['mono'],
    },
    texture: { grain: 0.4, paper: 0, scan: 0 },
    ghost: 0.4,
    bias: {
      layout: { huge: 2.2, pill: 2, mixed: 1.4, labels: 1.2, center: 1.2 },
      enter: { zoom: 1.6, wipe: 1.4, pop: 1.2 },
      exit: { shrink: 1.6, wipe: 1.2 },
    },
    decor: { leaders: 0.8, stripes: 0.6 },
    hud: true,
    useGrad: true,
  },
  // 灰色空间 + 白明朝 + 强 RGB 分离 + 坐标圆：冷调实验感
  mono: {
    schemes: [
      {
        bg: '#3B3D41',
        fg: '#FFFFFF',
        sub: '#B9BBBF',
        accent: '#FFFFFF',
        accent2: '#FFE34D',
        ink: '#1A1B1D',
        dim: '#45474C',
        ghostA: '#FF2A2A',
        ghostB: '#2AA8FF',
      },
      {
        bg: '#141517',
        fg: '#FFFFFF',
        sub: '#9EA0A4',
        accent: '#FFE34D',
        accent2: '#FFFFFF',
        ink: '#FFFFFF',
        dim: '#1E1F22',
        ghostA: '#FF2A2A',
        ghostB: '#2AFF7A',
      },
    ],
    fonts: {
      display: ['serif_black', 'serif_bold'],
      serif: ['serif_bold'],
      body: ['serif'],
      mono: ['mono'],
    },
    texture: { grain: 0.9, paper: 0, scan: 0.3 },
    ghost: 1.3,
    bias: {
      layout: { circle: 1.8, ring: 1.6, pill: 1.4, tile: 1.4, vcols: 1.3 },
      enter: { assemble: 1.4, blur: 1.4, zoom: 1.3 },
      exit: { explode: 1.4, glitch: 1.4, blur: 1.2 },
    },
    decor: { rings: 1.4, dots: 1 },
    hud: false,
  },
}

const CORE_STYLE_ORDER: string[] = [
  'noir',
  'crimson',
  'caution',
  'magenta',
  'paper',
  'hud',
  'mint',
  'specimen',
  'transit',
  'blueprint',
  'rouge',
  'mono',
]

// 追加风格包按 JIZURA 的注册顺序接在后面，并同样打上集合标记
Object.entries(horrorStyles).forEach(([key, style]) => markStyle(style, key))
Object.entries(extraStyles).forEach(([key, style]) => markStyle(style, key))
CORE_STYLE_ORDER.forEach((key) => markStyle(STYLES[key], key))
export const STYLE_ORDER: string[] = [
  ...CORE_STYLE_ORDER,
  ...HORROR_STYLE_ORDER,
  ...EXTRA_STYLE_ORDER,
]
Object.assign(STYLES, horrorStyles, extraStyles)

/** 只挑用户真填过的底色三元组 */
function pickDefined(ov: ColorOverrides, keys: readonly ('bg' | 'fg' | 'sub')[]): Partial<Scheme> {
  const out: Partial<Scheme> = {}
  for (const k of keys) {
    const v = ov[k]
    if (v) out[k] = v
  }
  return out
}

/**
 * 风格包 + 用户的颜色/字体覆盖 → 生效样式（planner 每个 plan 调一次）。
 *
 * 底色只替换第一套方案；主色与色散色要作用到每一套，并按各自背景重新提亮以保证可读。
 */
export function resolveStyle(project: Project): StylePack {
  const base = STYLES[project.style] ?? STYLES.noir
  const st: StylePack = structuredClone(base)
  const ov = project.colors ?? {}
  if (ov.enabled) st.schemes[0] = { ...st.schemes[0], ...pickDefined(ov, ['bg', 'fg', 'sub']) }
  if (ov.accentOn) {
    st.schemes = st.schemes.map((s) => {
      const o: Scheme = { ...s }
      if (ov.accent) {
        o.accent = fitContrast(ov.accent, s.bg, 2.4)
        if (s.ink === s.accent) o.ink = o.accent
      }
      if (ov.ghostA) o.ghostA = fitContrast(ov.ghostA, s.bg, 1.35)
      if (ov.ghostB) o.ghostB = fitContrast(ov.ghostB, s.bg, 1.35)
      if (ov.accent && s.grad) {
        o.grad = [fitContrast(ov.accent, s.bg, 2.4), mix(ov.accent, '#000000', 0.7)]
      }
      return o
    })
  }
  const fo = project.fonts ?? {}
  for (const role of ['display', 'serif', 'body'] as const) {
    const key = fo[role]
    if (key && FONTS[key]) st.fonts[role] = [key]
  }
  return st
}
