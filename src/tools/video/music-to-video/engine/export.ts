/**
 * 导出：WebCodecs 逐帧编码 MP4（mp4-muxer 封装），以及 PNG 序列打包。
 *
 * 没有用 MediaRecorder：那条路只能实时录制，画质随浏览器心情浮动，也拿不到
 * 精确的第 N 帧。这里逐帧渲染 → VideoFrame → 编码器，所以导出结果与预览
 * 逐帧一致，且随时可以取消。浏览器不支持 WebCodecs 时抛错由 UI 提示换浏览器。
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import JSZip from 'jszip'
import type { AudioInfo, Plan, Project } from './types'
import { outputSize } from './planner'
import { Renderer } from './renderer'
import { glyphs } from './glyphs'

export type Quality = 'standard' | 'high' | 'max'
export type ExportProgress = (ratio: number, label?: string) => void

/** 抛出的错误 message 即 i18n key 后缀，UI 负责翻译 */
export const EXPORT_ERRORS = {
  noVideoEncoder: 'noVideoEncoder',
  noCodec: 'noCodec',
  cancelled: 'cancelled',
} as const

type CodecCandidate = { codec: string; mux: 'avc' | 'hevc' | 'vp9' | 'av1'; label: string }

const VIDEO_CANDIDATES: readonly CodecCandidate[] = [
  { codec: 'avc1.640033', mux: 'avc', label: 'H.264 High' },
  { codec: 'avc1.4d0033', mux: 'avc', label: 'H.264 Main' },
  { codec: 'avc1.42003e', mux: 'avc', label: 'H.264 Baseline' },
  { codec: 'hev1.1.6.L93.B0', mux: 'hevc', label: 'H.265' },
  { codec: 'vp09.00.51.08', mux: 'vp9', label: 'VP9' },
  { codec: 'av01.0.12M.08', mux: 'av1', label: 'AV1' },
]

/** 逐个试探编码器可用性，返回第一个支持的配置 */
export async function pickVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<(CodecCandidate & { cfg: VideoEncoderConfig }) | null> {
  if (typeof VideoEncoder === 'undefined') return null
  for (const c of VIDEO_CANDIDATES) {
    const cfg: VideoEncoderConfig = { codec: c.codec, width, height, bitrate, framerate: fps }
    if (c.mux === 'avc') cfg.avc = { format: 'avc' }
    try {
      const support = await VideoEncoder.isConfigSupported(cfg)
      if (support.supported) return { ...c, cfg }
    } catch {
      /* 该编码格式不被支持，试下一个 */
    }
  }
  return null
}

type AudioCodec = { codec: string; mux: 'aac' | 'opus'; sampleRate: number }

const AUDIO_CANDIDATES: readonly AudioCodec[] = [
  { codec: 'mp4a.40.2', mux: 'aac', sampleRate: 48000 },
  { codec: 'opus', mux: 'opus', sampleRate: 48000 },
]

export async function pickAudioCodec(channels: number): Promise<AudioCodec | null> {
  if (typeof AudioEncoder === 'undefined') return null
  for (const c of AUDIO_CANDIDATES) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: c.codec,
        sampleRate: c.sampleRate,
        numberOfChannels: channels,
        bitrate: 192000,
      })
      if (support.supported) return c
    } catch {
      /* 换下一种音频编码 */
    }
  }
  return null
}

/** 用离线上下文把 AudioBuffer 重采样到编码采样率 */
export async function resample(
  buffer: AudioBuffer,
  sampleRate: number,
  duration: number,
): Promise<AudioBuffer> {
  const channels = Math.min(2, buffer.numberOfChannels)
  const length = Math.ceil(duration * sampleRate)
  const oc = new OfflineAudioContext(channels, length, sampleRate)
  const src = oc.createBufferSource()
  src.buffer = buffer
  src.connect(oc.destination)
  src.start(0)
  return oc.startRendering()
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type Mp4Result = {
  blob: Blob
  codec: string
  audioCodec: string | null
  width: number
  height: number
  frames: number
}

/** 逐帧渲染并编码成 MP4 */
export async function exportMp4(opts: {
  plan: Plan
  project: Project
  audio: AudioInfo | null
  quality?: Quality
  onProgress?: ExportProgress
  signal?: AbortSignal
}): Promise<Mp4Result> {
  const { plan, project, audio, quality = 'high', onProgress, signal } = opts
  const [w, h] = outputSize(project.aspect, project.res)
  const fps = plan.fps
  const bitrate = Math.round(
    w * h * fps * (quality === 'max' ? 0.42 : quality === 'high' ? 0.28 : 0.16),
  )
  const vc = await pickVideoCodec(w, h, fps, bitrate)
  if (!vc) throw new Error(EXPORT_ERRORS.noVideoEncoder)
  const audioChannels = audio ? Math.min(2, audio.buffer.numberOfChannels) : 1
  const ac =
    audio && audio.buffer && project.includeAudio ? await pickAudioCodec(audioChannels) : null
  if (!ac && project.includeAudio && audio) throw new Error(EXPORT_ERRORS.noCodec)

  const target = new ArrayBufferTarget()
  const muxOpts = {
    target,
    video: { codec: vc.mux, width: w, height: h, frameRate: fps },
    fastStart: 'in-memory' as const,
    firstTimestampBehavior: 'offset' as const,
    ...(ac && audio
      ? { audio: { codec: ac.mux, numberOfChannels: audioChannels, sampleRate: ac.sampleRate } }
      : {}),
  }
  const muxer = new Muxer(muxOpts)
  let encodeError: Error | null = null
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  venc.configure({ ...vc.cfg, latencyMode: 'quality' })

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const R = new Renderer()
  const total = Math.max(1, Math.round(plan.duration * fps))
  const scale = w / plan.W
  const prevMaxRes = glyphs.maxRes
  glyphs.maxRes = h >= 1000 ? 768 : 512
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        venc.close()
        throw new Error(EXPORT_ERRORS.cancelled)
      }
      if (encodeError) throw encodeError
      R.frame(ctx, plan, i / fps, { scale })
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      })
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      // 背压：编码队列过长就等一等，否则内存会被帧堆爆
      while (venc.encodeQueueSize > 4) await sleep(2)
      if (i % 3 === 0) {
        onProgress?.(i / total)
        await sleep(0)
      }
    }
  } finally {
    glyphs.maxRes = prevMaxRes
  }
  await venc.flush()
  venc.close()
  if (encodeError) throw encodeError

  if (ac && audio) {
    onProgress?.(0.99)
    const rendered = await resample(audio.buffer, ac.sampleRate, plan.duration)
    const channels = rendered.numberOfChannels
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encodeError = e
      },
    })
    aenc.configure({
      codec: ac.codec,
      sampleRate: ac.sampleRate,
      numberOfChannels: channels,
      bitrate: 192000,
    })
    const block = 4800
    for (let off = 0; off < rendered.length; off += block) {
      if (signal?.aborted) {
        aenc.close()
        throw new Error(EXPORT_ERRORS.cancelled)
      }
      const n = Math.min(block, rendered.length - off)
      const data = new Float32Array(n * channels)
      for (let c = 0; c < channels; c++)
        data.set(rendered.getChannelData(c).subarray(off, off + n), c * n)
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: ac.sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((off * 1e6) / ac.sampleRate),
        data,
      })
      aenc.encode(ad)
      ad.close()
      if (aenc.encodeQueueSize > 16) await sleep(1)
    }
    await aenc.flush()
    aenc.close()
    if (encodeError) throw encodeError
  }
  muxer.finalize()
  onProgress?.(1)
  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    codec: vc.label,
    audioCodec: ac ? ac.mux : null,
    width: w,
    height: h,
    frames: total,
  }
}

/** 导出 PNG 序列（压缩成 zip，交给后期或再编码） */
export async function exportPngZip(opts: {
  plan: Plan
  project: Project
  transparent?: boolean
  every?: number
  onProgress?: ExportProgress
  signal?: AbortSignal
}): Promise<Blob> {
  const { plan, project, transparent, every = 1, onProgress, signal } = opts
  const [w, h] = outputSize(project.aspect, project.res)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const R = new Renderer()
  const fps = plan.fps
  const total = Math.max(1, Math.round(plan.duration * fps))
  const scale = w / plan.W
  const zip = new JSZip()
  const prevMaxRes = glyphs.maxRes
  glyphs.maxRes = h >= 1000 ? 768 : 512
  try {
    for (let i = 0; i < total; i += every) {
      if (signal?.aborted) throw new Error(EXPORT_ERRORS.cancelled)
      R.frame(ctx, plan, i / fps, { scale, transparent })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob) zip.file(`frame_${String(i).padStart(5, '0')}.png`, blob)
      if (i % 2 === 0) onProgress?.(i / total)
      if (i % 12 === 0) await sleep(0)
    }
  } finally {
    glyphs.maxRes = prevMaxRes
  }
  onProgress?.(1)
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/** 文件名净化：只保留安全字符，避免路径穿越与非法文件名 */
export function safeFileName(name: string, fallback = 'music-to-video'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}
