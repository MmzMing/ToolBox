import type { GifsicleOptions } from './optimize'
import type { GifWriterOptions } from './encode'
import type { DecodePhase } from './decode'
import type { ColorSeed, MatteOutput } from './matte'
import type { MatteParams, MatteStroke } from './matte-pipeline'
import type { GifDescriptor, RgbaFrame } from './types'

/** 跨线程传的单帧：RGBA 用 transferable，不做结构化克隆拷贝 */
export type FramePayload = RgbaFrame

/** 可序列化的抠图入参：与 matte-pipeline 的 MatteParams 同构 */
export type { MatteParams, MatteStroke }

export type GifRequest =
  | { id: number; type: 'inspect'; bytes: ArrayBuffer }
  | { id: number; type: 'optimize'; bytes: ArrayBuffer; options: GifsicleOptions }
  | { id: number; type: 'encode'; frames: FramePayload[]; options: GifWriterOptions }
  | { id: number; type: 'decode'; bytes: ArrayBuffer }
  /** 源帧 transfer 进 worker 常驻：抠图是交互式反复计算，不能每次都重传一遍像素 */
  | { id: number; type: 'matteLoad'; token: number; frames: FramePayload[] }
  | {
      id: number
      type: 'mattePreview'
      token: number
      frameIndex: number
      seeds: ColorSeed[]
      params: MatteParams
      strokes: MatteStroke[]
      output: MatteOutput
    }
  | {
      id: number
      type: 'matteRender'
      token: number
      seeds: ColorSeed[]
      params: MatteParams
      strokes: MatteStroke[]
      output: MatteOutput
    }
  | {
      id: number
      type: 'matteExport'
      token: number
      seeds: ColorSeed[]
      params: MatteParams
      strokes: MatteStroke[]
      output: MatteOutput
      encode: GifWriterOptions
    }
  | { id: number; type: 'matteUnload'; token: number }
  /** 源帧常驻在 worker 里，取色器要的颜色只能反过来问 worker 要 */
  | { id: number; type: 'matteSample'; token: number; frameIndex: number; x: number; y: number }

export type GifResponse =
  | { id: number; ok: true; type: 'inspect'; descriptor: GifDescriptor }
  | { id: number; ok: true; type: 'optimize'; blob: Blob }
  | { id: number; ok: true; type: 'encode'; blob: Blob }
  | { id: number; ok: true; type: 'decode'; descriptor: GifDescriptor; frames: RgbaFrame[] }
  | { id: number; ok: true; type: 'matteLoad'; token: number; hasTemporalModel: boolean }
  | { id: number; ok: true; type: 'mattePreview'; frame: RgbaFrame }
  | { id: number; ok: true; type: 'matteRender'; frames: RgbaFrame[] }
  | { id: number; ok: true; type: 'matteExport'; blob: Blob }
  | { id: number; ok: true; type: 'matteUnload'; token: number }
  | { id: number; ok: true; type: 'matteSample'; color: [number, number, number] }
  | { id: number; ok: false; message: string }

/**
 * 进度不是终态：同一条请求会先收到若干 progress，最后才收到 GifResponse。
 * 只在阶段边界上报（帧合成是一整段同步工作，中间没有可信的百分比可发）。
 * matte 是逐帧推进的，所以额外带一个 done 计数。
 */
export type GifProgress = {
  id: number
  type: 'progress'
  phase: DecodePhase | 'model' | 'matte' | 'render'
  total: number
  done?: number
}
