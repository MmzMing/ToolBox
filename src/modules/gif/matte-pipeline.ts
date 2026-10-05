/**
 * 抠图流程编排：把 matte.ts 的原始算子串成一条可参数化的流水线，
 * 并保证同一条流水线既能整序列跑（导出）也能单帧跑（拖动滑块时的即时预览）。
 *
 * 时域背景板是「全序列一次性」的产物，所以它缓存在 MatteSource 里，
 * 单帧预览复用同一块背景板，才不会每改一次阈值就闪烁一次。
 */

import {
  applyStroke,
  applyMatte,
  colorKeyMatte,
  combineMatte,
  decontaminate,
  despill,
  differenceMatte,
  estimateBackgroundModel,
  feather,
  guidedFilter,
  morphology,
  MIN_TEMPORAL_FRAMES,
  shiftEdge,
  temporalSmoothMatte,
  type BackgroundModel,
  type ColorSeed,
  type Matte,
  type MatteOutput,
  type Stroke,
} from './matte'
import type { RgbaFrame, RgbaImage } from './types'

/** 手绘画笔：frameIndex 为 null 时作用到整条序列（关键帧画一次、其余帧跟随） */
export type MatteStroke = { frameIndex: number | null; stroke: Stroke }

export type MatteParams = {
  /** auto = 只信时域差值，key = 只信取色，both = 两者取交集侧 */
  mode: 'auto' | 'key' | 'both'
  difference: { threshold: number; softness: number }
  key: { tolerance: number; softness: number; connected: boolean }
  combine: 'min' | 'max'
  open: number
  close: number
  guided: boolean
  guidedRadius: number
  guidedEpsilon: number
  edge: number
  feather: number
  /** 跨帧中值的单边半径，0 = 关闭时序平滑 */
  temporal: number
  despillStrength: number
  decontaminateEdges: boolean
}

export const DEFAULT_MATTE_PARAMS: MatteParams = {
  mode: 'auto',
  difference: { threshold: 24, softness: 96 },
  key: { tolerance: 14, softness: 24, connected: true },
  combine: 'min',
  open: 1,
  close: 1,
  guided: true,
  guidedRadius: 3,
  guidedEpsilon: 0.02,
  edge: 0,
  feather: 1,
  temporal: 1,
  despillStrength: 0,
  decontaminateEdges: false,
}

export type MatteSource = {
  frames: RgbaFrame[]
  /** 帧数不足时为 null：此时只能走取色，差值 matting 没有中值可用 */
  model: BackgroundModel | null
}

export function canUseTemporalModel(frameCount: number): boolean {
  return frameCount >= MIN_TEMPORAL_FRAMES
}

/** 源帧会被 transfer 进 worker，这里一次性算好背景板，之后每帧只复用 */
export function prepareSource(frames: readonly RgbaFrame[]): MatteSource {
  if (frames.length === 0) throw new Error('matte source needs at least one frame')
  return {
    frames: [...frames],
    model: canUseTemporalModel(frames.length) ? estimateBackgroundModel(frames) : null,
  }
}

export function matteForFrame(
  frame: RgbaImage,
  source: MatteSource,
  seeds: readonly ColorSeed[],
  params: MatteParams,
): Matte {
  const auto =
    params.mode !== 'key' && source.model
      ? differenceMatte(frame, source.model, params.difference)
      : null
  const keyed = seeds.length > 0 ? colorKeyMatte(frame, seeds, params.key) : null

  if (!auto && !keyed) {
    // 既没有可用的时域模型也还没取色：什么都不删，等用户给信号
    return {
      width: frame.width,
      height: frame.height,
      alpha: new Uint8ClampedArray(frame.width * frame.height).fill(255),
    }
  }

  let matte = auto && keyed ? combineMatte(auto, keyed, params.combine) : ((auto ?? keyed) as Matte)
  matte = morphology(matte, { open: params.open, close: params.close })
  if (params.guided) {
    matte = guidedFilter(matte, frame, {
      radius: params.guidedRadius,
      epsilon: params.guidedEpsilon,
    })
  }
  // 先收边再羽化：反过来会把刚收回来的边缘又糊出去
  matte = shiftEdge(matte, params.edge)
  return feather(matte, params.feather)
}

export function matteSequence(
  source: MatteSource,
  seeds: readonly ColorSeed[],
  params: MatteParams,
  strokes: readonly MatteStroke[] = [],
  onProgress?: (done: number, total: number) => void,
): Matte[] {
  const perFrame = source.frames.map((frame, index) => {
    const matte = matteForFrame(frame, source, seeds, params)
    onProgress?.(index + 1, source.frames.length)
    return matte
  })

  const smoothed =
    params.temporal > 0 && canUseTemporalModel(perFrame.length)
      ? temporalSmoothMatte(perFrame, params.temporal)
      : perFrame

  // 画笔在时序平滑之后：用户明确画下的意图不该被中值滤波抹掉
  return strokes.reduce<Matte[]>((mattes, entry) => {
    if (entry.frameIndex === null) {
      return mattes.map((matte, index) => {
        onProgress?.(index, mattes.length)
        return applyStroke(matte, entry.stroke)
      })
    }
    if (entry.frameIndex < 0 || entry.frameIndex >= mattes.length) {
      throw new Error(`stroke frameIndex ${entry.frameIndex} is out of range`)
    }
    return mattes.map((matte, index) =>
      index === entry.frameIndex ? applyStroke(matte, entry.stroke) : matte,
    )
  }, smoothed)
}

/** 先修颜色（去溢色 / 去污染），再把 alpha 落到输出模式上 */
function renderOne(
  source: MatteSource,
  index: number,
  matte: Matte,
  params: MatteParams,
  output: MatteOutput,
): RgbaFrame {
  const frame = source.frames[index]
  let image: RgbaImage = frame
  if (params.despillStrength > 0) image = despill(image, { strength: params.despillStrength })
  if (params.decontaminateEdges && source.model) {
    image = decontaminate(image, matte, source.model.background)
  }
  return applyMatte([{ ...image, delayCs: frame.delayCs }], [matte], output)[0]
}

export function renderSequence(
  source: MatteSource,
  mattes: readonly Matte[],
  params: MatteParams,
  output: MatteOutput,
): RgbaFrame[] {
  if (source.frames.length !== mattes.length) {
    throw new Error(`got ${mattes.length} mattes for ${source.frames.length} frames`)
  }
  return mattes.map((matte, index) => renderOne(source, index, matte, params, output))
}

/**
 * 单帧预览。时序平滑在这里不生效——拖滑块时要的是毫秒级反馈，
 * 而跨帧中值必须等整条序列都算完。导出走 renderSequence，那里才有平滑。
 */
export function renderPreview(
  source: MatteSource,
  frameIndex: number,
  seeds: readonly ColorSeed[],
  params: MatteParams,
  strokes: readonly MatteStroke[] = [],
  output: MatteOutput,
): RgbaFrame {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= source.frames.length) {
    throw new Error(`preview frameIndex ${frameIndex} is out of range`)
  }
  let matte = matteForFrame(source.frames[frameIndex], source, seeds, params)
  for (const entry of strokes) {
    if (entry.frameIndex === null || entry.frameIndex === frameIndex) {
      matte = applyStroke(matte, entry.stroke)
    }
  }
  return renderOne(source, frameIndex, matte, params, output)
}
