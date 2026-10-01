import type { GifsicleOptions } from './optimize'
import type { GifWriterOptions } from './encode'
import type { DecodePhase } from './decode'
import type { GifDescriptor, RgbaFrame } from './types'

/** 跨线程传的单帧：RGBA 用 transferable，不做结构化克隆拷贝 */
export type FramePayload = RgbaFrame

export type GifRequest =
  | { id: number; type: 'inspect'; bytes: ArrayBuffer }
  | { id: number; type: 'optimize'; bytes: ArrayBuffer; options: GifsicleOptions }
  | { id: number; type: 'encode'; frames: FramePayload[]; options: GifWriterOptions }
  | { id: number; type: 'decode'; bytes: ArrayBuffer }

export type GifResponse =
  | { id: number; ok: true; type: 'inspect'; descriptor: GifDescriptor }
  | { id: number; ok: true; type: 'optimize'; blob: Blob }
  | { id: number; ok: true; type: 'encode'; blob: Blob }
  | { id: number; ok: true; type: 'decode'; descriptor: GifDescriptor; frames: RgbaFrame[] }
  | { id: number; ok: false; message: string }

/**
 * 进度不是终态：同一条请求会先收到若干 progress，最后才收到 GifResponse。
 * 只在阶段边界上报（帧合成是一整段同步工作，中间没有可信的百分比可发）。
 */
export type GifProgress = { id: number; type: 'progress'; phase: DecodePhase; total: number }
