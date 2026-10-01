/**
 * 核心部件：JIZURA 首版注册表里"包之外"的那几件。
 *
 * 这里刻意保持最小：文字加工 / 背景图形 / 转场 / 其余镜头运动都由
 * engine/packs/ 下的表达式包按JIZURA的真名提供（looks、bgcamB、treattrans…），
 * 自己另起一套 key 会让风格偏置和情绪白名单全部对不上。
 */
import type { BgDef, CamDef, Env, FxDef, TreatDef, TransDef } from './types'

/** 无加工：planner 的兜底值，必须存在 */
export const TREAT: Record<string, TreatDef> = {
  none: {
    apply() {
      /* 不做加工 */
    },
  },
}

/** 纯色背景：planner 的兜底值，必须存在 */
export const BG: Record<string, BgDef> = {
  none: {
    draw() {
      /* 只铺底色 */
    },
  },
}

const cutProgress = (env: Env): number =>
  Math.min(1, Math.max(0, env.lt / Math.max(0.3, env.cut ? env.cut.dur : 1)))

export const CAMERA: Record<string, CamDef> = {
  push: {
    w: 5,
    tags: ['calm', 'editorial', 'emotional', 'graphic', 'pop', 'glitch'],
    get: (env) => ({ s: 1 + 0.03 * (env.fx.motion ?? 0.7) * cutProgress(env) }),
  },
}

/** 八个内置后期事件：绘制分支在 renderer.post 里，这里只登记权重与情绪标签 */
export const FXE: Record<string, FxDef> = {
  chroma: { builtin: true, tags: ['glitch', 'emotional', 'pop', 'graphic'] },
  shake: { builtin: true, tags: ['pop', 'glitch', 'emotional'] },
  slice: { builtin: true, tags: ['glitch'] },
  block: { builtin: true, tags: ['glitch'] },
  invert: { builtin: true, tags: ['glitch', 'graphic'] },
  flash: { builtin: true, tags: ['pop', 'emotional', 'glitch'] },
  zoom: { builtin: true, tags: ['pop', 'emotional'] },
  mosaic: { builtin: true, tags: ['glitch'] },
}

/** 转场全部来自 treattrans 包 */
export const TRANS: Record<string, TransDef> = {}
