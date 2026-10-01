/**
 * 恐怖集合的三套配色（移植自 JIZURA 的 11p_horror3.js 尾部 S 表）。
 *
 * 三套都带 `set: 'horror'`：只有「恐怖演出」开关打开、且一键随机抽到 horror 情绪时
 * 才会被选中，平时只看得到、选不到（与JIZURA一致）。
 * 注册顺序紧跟核心 12 套之后（JIZURA里 horror 包在 11p_styles.js 之前加载）。
 *
 * fonts 沿用核心 12 套的中文字体映射：mincho* → serif*、gothic_* → sans_*、
 * shippori → serif_bold、brush → mashan、klee → xiaowei、dot → pixel。
 */
import type { Bias, StylePack } from '../types'

/**
 * 三套共用的部件倾向底座（JIZURA的 LAY / ENT / EXI）。
 * JIZURA的 LAY 里写了 `pop: 0.3`，但构图表里从来没有 pop 这件（pop 是登场件），
 * 属于历史死键（与 style-packs 里剔除的 decor.hud 同理），移植时一并剔除，不影响抽样。
 */
const LAY: Bias = {
  hrFlashlight: 1.6,
  hrDoorGap: 1.3,
  hrWallScrawl: 1.2,
  hrCctv: 1.2,
  hrOuija: 0.9,
  hrMissing: 1,
  hrWrongOne: 1.5,
  hrRisingDark: 1.3,
  hrRedacted: 1,
  hrStaticTv: 1,
  hrSpiritPhoto: 1,
  hrWrongShadow: 1.3,
  center: 1.1,
  vcols: 1.2,
}
const ENT: Bias = {
  hrBlinkCreep: 1.3,
  hrJumpScare: 0.9,
  hrUneasy: 1.6,
  hrVhold: 1.1,
  hrMirrorSnap: 1,
  hrManifest: 1.6,
  hrClawReveal: 1,
  blur: 1.2,
  flicker: 1.2,
  pop: 0.2,
  bounceBig: 0.1,
  bubbles: 0.1,
}
const EXI: Bias = {
  hrPulledDown: 1.4,
  hrLookBack: 1.3,
  hrTurnAway: 1.2,
  hrShiver: 1.2,
  hrSwallow: 1.3,
  hrFlickerDie: 1.3,
  hrDrain: 1.2,
  blur: 1.1,
  popOut: 0.1,
  balloonOff: 0.1,
}

export const horrorStyles: Record<string, StylePack> = {
  // 褪色的绿灰 + 锈红 + 明朝体的残响
  hrRuin: {
    moods: ['horror'],
    set: 'horror',
    schemes: [
      {
        bg: '#161B18',
        fg: '#D3DACF',
        sub: '#7D887E',
        accent: '#B0473A',
        accent2: '#6E8B6B',
        ink: '#D3DACF',
        dim: '#1F2621',
        ghostA: '#5E7A62',
        ghostB: '#8A3A30',
      },
      {
        bg: '#8C958A',
        fg: '#141814',
        sub: '#2E362F',
        accent: '#6A1A14',
        accent2: '#E4E8DF',
        ink: '#141814',
        dim: '#848D82',
        ghostA: '#3F4D41',
        ghostB: '#6A1A14',
      },
      {
        bg: '#0C0F0D',
        fg: '#A9B8A6',
        sub: '#5D6B5E',
        accent: '#C24A3A',
        accent2: '#A9B8A6',
        ink: '#A9B8A6',
        dim: '#161B17',
        ghostA: '#2F4A36',
        ghostB: '#5E1E18',
      },
    ],
    fonts: {
      display: ['serif_black', 'serif_bold'],
      serif: ['serif', 'serif_light'],
      body: ['serif_light'],
      mono: ['mono'],
    },
    texture: { grain: 1, paper: 0.15, scan: 0.1 },
    ghost: 0.55,
    bias: {
      layout: LAY,
      enter: ENT,
      exit: EXI,
      treat: {
        hrEroded: 1.6,
        hrInkBleed: 1.2,
        hrDoubleExp: 1.2,
        hrRedact: 0.6,
        rainbow: 0.1,
        sticker: 0.1,
      },
      // JIZURA这里还写了 `candy: 0.1`，但背景图表里没有 candy 这件（candy 是风格名），同为历史死键
      bg: { hrFailingLamp: 1.6, hrCorridor: 1.4, hrMold: 1.4, hrDeadTrees: 1.2, polka: 0.1 },
      cam: { hrNervous: 1.4, hrDutchSnap: 1.1, handheld: 1.2, bounce: 0.1, jelly: 0.1 },
      fx: {
        hrPassingShadow: 1.2,
        hrSubliminal: 1,
        hrSignalLoss: 0.8,
        dustScratches: 1.2,
        starGlint: 0.1,
      },
    },
    decor: {
      hrDustBeam: 1.6,
      hrCracks: 1.2,
      hrSigil: 0.8,
      hrScratches: 1,
      hrWatchEye: 0.6,
      hrDrips: 0.8,
      confetti: 0.05,
      heartsStars: 0.05,
    },
    hud: false,
    glow: 0.4,
  },
  // 死黑的画面 + 监控录像的白与红 + 砂岚噪点
  hrNightRec: {
    moods: ['horror'],
    set: 'horror',
    schemes: [
      {
        bg: '#050505',
        fg: '#EDEDED',
        sub: '#8A8A8A',
        accent: '#E3261E',
        accent2: '#FFFFFF',
        ink: '#EDEDED',
        dim: '#121212',
        ghostA: '#6E6E6E',
        ghostB: '#E3261E',
      },
      {
        bg: '#0B0E0B',
        fg: '#D8F0D8',
        sub: '#6F866F',
        accent: '#FF3A2A',
        accent2: '#D8F0D8',
        ink: '#D8F0D8',
        dim: '#141A14',
        ghostA: '#3E6B3E',
        ghostB: '#FF3A2A',
      },
      {
        bg: '#DADADA',
        fg: '#0A0A0A',
        sub: '#4A4A4A',
        accent: '#C8140E',
        accent2: '#0A0A0A',
        ink: '#0A0A0A',
        dim: '#CCCCCC',
        ghostA: '#8A8A8A',
        ghostB: '#C8140E',
      },
    ],
    fonts: {
      display: ['sans_bold', 'sans_black'],
      serif: ['serif'],
      body: ['sans_med'],
      mono: ['mono', 'pixel'],
    },
    texture: { grain: 1.2, paper: 0, scan: 0.7 },
    ghost: 0.8,
    bias: {
      layout: { ...LAY, hrCctv: 2.2, hrStaticTv: 1.6, hrRedacted: 1.3, type: 1.2 },
      enter: { ...ENT, hrVhold: 1.8, glitchIn: 1 },
      exit: { ...EXI, hrFlickerDie: 1.8, glitch: 1 },
      treat: { hrDoubleExp: 1.4, hrRedact: 1.2, glitchSplit: 1, rainbow: 0.1 },
      bg: { hrFailingLamp: 1.4, hrCorridor: 1.6, vhsBand: 1.4, noiseField: 1, polka: 0.1 },
      cam: { hrNervous: 1.8, hrDutchSnap: 1, handheld: 1.2, jelly: 0.1 },
      fx: {
        hrSignalLoss: 1.6,
        hrSubliminal: 1.3,
        hrPassingShadow: 1,
        tvStatic: 1.4,
        trackingNoise: 1.2,
        vhsRoll: 1.2,
        starGlint: 0.1,
      },
    },
    decor: {
      hrStaticPatch: 1.6,
      hrWatchEye: 1,
      hrCracks: 0.8,
      hrScratches: 0.8,
      timecodeBar: 1,
      confetti: 0.05,
    },
    hud: true,
    glow: 0.5,
    glitchBoost: 1.2,
  },
  // 泛黄的信笺 + 褪色的墨 + 暗红的批注
  hrCurse: {
    moods: ['horror'],
    set: 'horror',
    schemes: [
      {
        bg: '#D8CBA4',
        fg: '#2A2017',
        sub: '#6B5B45',
        accent: '#7E1410',
        accent2: '#3F3326',
        ink: '#2A2017',
        dim: '#CDBF97',
        ghostA: '#9A2A20',
        ghostB: '#8A7A5E',
        paper: true,
      },
      {
        bg: '#1C140E',
        fg: '#E3D5B0',
        sub: '#9A8866',
        accent: '#B8261C',
        accent2: '#E3D5B0',
        ink: '#E3D5B0',
        dim: '#271D15',
        ghostA: '#6E1510',
        ghostB: '#5A4A34',
        paper: true,
      },
      {
        bg: '#C4B28A',
        fg: '#3A0D0A',
        sub: '#6E4A3A',
        accent: '#1E1812',
        accent2: '#7E1410',
        ink: '#3A0D0A',
        dim: '#B9A67D',
        ghostA: '#7E1410',
        ghostB: '#6E5E44',
        paper: true,
      },
    ],
    fonts: {
      display: ['xiaowei', 'mashan', 'serif_black'],
      serif: ['xiaowei', 'serif'],
      body: ['xiaowei', 'serif'],
      mono: ['mono'],
    },
    texture: { grain: 0.7, paper: 1, scan: 0 },
    ghost: 0.4,
    bias: {
      layout: {
        ...LAY,
        hrWallScrawl: 2,
        hrMissing: 1.6,
        hrSpiritPhoto: 1.5,
        hrOuija: 1.3,
        hrCctv: 0.5,
        letterPaper: 1.2,
      },
      enter: { ...ENT, hrClawReveal: 1.4, inkBleed: 1.4 },
      exit: { ...EXI, hrDrain: 1.8, burn: 1 },
      treat: { hrInkBleed: 1.8, hrEroded: 1.3, hrRedact: 0.8, sticker: 0.1, chrome: 0.1 },
      bg: { hrMold: 1.8, hrFailingLamp: 1, tornPaper: 1, polka: 0.1 },
      cam: { hrNervous: 1, hrDutchSnap: 1.2, driftDiag: 1 },
      fx: {
        hrSubliminal: 1.2,
        hrPassingShadow: 1,
        filmBurn: 1,
        dustScratches: 1.4,
        starGlint: 0.1,
      },
    },
    decor: {
      hrDrips: 1.6,
      hrScratches: 1.2,
      hrSigil: 1.2,
      hrCracks: 0.8,
      crossOut: 1,
      scribbleCircle: 0.8,
      confetti: 0.05,
    },
    hud: false,
    glow: 0.3,
  },
}

/** 注册顺序 = JIZURA 11p_horror3.js 里 S 对象的键序，插在核心 12 套与追加 12 套之间 */
export const HORROR_STYLE_ORDER: string[] = ['hrRuin', 'hrNightRec', 'hrCurse']
