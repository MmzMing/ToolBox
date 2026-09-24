/**
 * 音频分析：解码 → 单声道 → 能量/高通通量 → 起音 → BPM 自相关 → 节拍网格。
 *
 * 这里刻意不用 FFT：整条管线只需要两个标量——逐帧响度 energy(0..1) 与
 * 节拍上下文 beat{since,len,index}。歌词视频要的是"什么时候踩点"，
 * 不是频谱，所以 50Hz 的标量包络既够用又便宜，也让逐帧导出保持确定性。
 *
 * 除 decodeAudio 之外的函数都是纯函数（只吃 Float32Array），便于单测。
 */
import type { AudioInfo } from './types'

/** 特征帧率（每秒分析帧数） */
export const ENERGY_RATE = 50
/** 高通系数：只保留快速变化部分，用来检测起音 */
const HP_COEFF = 0.92
/** 起音对比的局部窗口（帧） */
const ONSET_WINDOW = 4
/** BPM 搜索区间 */
const BPM_MIN = 70
const BPM_MAX = 180
/** 节拍先验：以对数正态偏向 125 BPM */
const PRIOR_BPM = 125
const PRIOR_SIGMA = 0.7
/** 波形预览柱数 */
const PEAK_BINS = 1600

/** 解码音频文件为 AudioBuffer（用完即关，不占 AudioContext 名额） */
export async function decodeAudioFile(file: File | Blob): Promise<AudioBuffer> {
  const buf = await file.arrayBuffer()
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(buf.slice(0))
  } finally {
    await ctx.close().catch(() => {
      /* 关闭失败不影响已解码数据 */
    })
  }
}

/** 多声道混成单声道 */
export function toMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length
  const channels = buffer.numberOfChannels
  const mono = new Float32Array(len)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels
  }
  return mono
}

/** 逐帧 RMS 能量与高通后 RMS 通量 */
export function energyFlux(
  mono: Float32Array,
  sampleRate: number,
  rate = ENERGY_RATE,
): { energy: Float32Array; flux: Float32Array } {
  const hop = Math.round(sampleRate / rate)
  const n = Math.floor(mono.length / hop)
  const energy = new Float32Array(n)
  const flux = new Float32Array(n)
  let prevHp = 0
  let prevX = 0
  for (let f = 0; f < n; f++) {
    let e = 0
    let eh = 0
    const end = Math.min(mono.length, (f + 1) * hop)
    for (let i = f * hop; i < end; i++) {
      const x = mono[i]
      e += x * x
      const hp = HP_COEFF * (prevHp + x - prevX)
      prevHp = hp
      prevX = x
      eh += hp * hp
    }
    energy[f] = Math.sqrt(e / hop)
    flux[f] = Math.sqrt(eh / hop)
  }
  return { energy, flux }
}

/** 起音强度：高通能量的对数相对前几帧均值的正增量 */
export function onsetStrength(flux: Float32Array): Float32Array {
  const n = flux.length
  const onset = new Float32Array(n)
  for (let f = 1; f < n; f++) {
    const cur = Math.log(1e-4 + flux[f])
    let sum = 0
    let k = 0
    for (let j = Math.max(0, f - ONSET_WINDOW); j < f; j++) {
      sum += Math.log(1e-4 + flux[j])
      k += 1
    }
    onset[f] = Math.max(0, cur - sum / Math.max(1, k))
  }
  return onset
}

/** 自相关求周期（带 125 BPM 对数正态先验 + 三点抛物线插值） */
export function estimatePeriod(
  onset: Float32Array,
  rate = ENERGY_RATE,
): { period: number; bpm: number } {
  const n = onset.length
  const minLag = Math.round((rate * 60) / BPM_MAX)
  const maxLag = Math.round((rate * 60) / BPM_MIN)
  let best = 0
  let bestLag = Math.round(rate * 0.5)
  const scores: number[] = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let f = lag; f < n; f++) s += onset[f] * onset[f - lag]
    const bpm = (60 * rate) / lag
    const w = Math.exp(-0.5 * (Math.log2(bpm / PRIOR_BPM) / PRIOR_SIGMA) ** 2)
    s *= w
    scores[lag] = s
    if (s > best) {
      best = s
      bestLag = lag
    }
  }
  let lagF = bestLag
  const a = scores[bestLag - 1]
  const b = scores[bestLag]
  const c = scores[bestLag + 1]
  if (a !== undefined && b !== undefined && c !== undefined) {
    const d = a - 2 * b + c
    if (d !== 0) lagF = bestLag + (0.5 * (a - c)) / d
  }
  const period = lagF / rate
  return { period, bpm: 60 / period }
}

/** 在周期内搜相位：让网格尽量压在起音上（半帧步进） */
export function beatPhase(
  onset: Float32Array,
  lagF: number,
  rate = ENERGY_RATE,
): { phase: number; period: number } {
  const n = onset.length
  let bestPh = 0
  let bestScore = -1
  for (let ph = 0; ph < lagF; ph += 0.5) {
    let s = 0
    for (let t = ph; t < n; t += lagF) s += onset[Math.round(t)] || 0
    if (s > bestScore) {
      bestScore = s
      bestPh = ph
    }
  }
  return { phase: bestPh / rate, period: lagF / rate }
}

/** 由相位与周期铺出整曲节拍点 */
export function buildBeats(phase: number, period: number, duration: number): number[] {
  const beats: number[] = []
  if (!(period > 0)) return beats
  for (let t = phase; t < duration; t += period) beats.push(Number(t.toFixed(4)))
  return beats
}

/** 能量归一化到 0..1（按 95 分位） */
export function normalizeEnergy(energy: Float32Array): Float32Array {
  const sorted = Array.from(energy).sort((x, y) => x - y)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1
  const out = new Float32Array(energy.length)
  for (let f = 0; f < energy.length; f++) out[f] = Math.min(1, energy[f] / p95)
  return out
}

/** 波形预览柱（时间轴用，每 4 点抽样取峰值） */
export function waveformPeaks(mono: Float32Array, bins = PEAK_BINS): Float32Array {
  const peaks = new Float32Array(bins)
  const per = Math.max(1, Math.floor(mono.length / bins))
  for (let b = 0; b < bins; b++) {
    let m = 0
    const end = Math.min(mono.length, (b + 1) * per)
    for (let i = b * per; i < end; i += 4) {
      const v = Math.abs(mono[i])
      if (v > m) m = v
    }
    peaks[b] = m
  }
  return peaks
}

/** 完整分析一个音频文件 */
export async function analyzeAudio(file: File): Promise<AudioInfo> {
  const buffer = await decodeAudioFile(file)
  const sr = buffer.sampleRate
  const mono = toMono(buffer)
  const { energy, flux } = energyFlux(mono, sr)
  const onset = onsetStrength(flux)
  const { period, bpm } = estimatePeriod(onset)
  const { phase } = beatPhase(onset, period * ENERGY_RATE)
  return {
    name: file.name,
    duration: buffer.duration,
    sampleRate: sr,
    buffer,
    bpm: Math.round(bpm * 10) / 10,
    beats: buildBeats(phase, period, buffer.duration),
    energy: normalizeEnergy(energy),
    energyRate: ENERGY_RATE,
    peaks: waveformPeaks(mono),
  }
}

/** 用手工 BPM + 首拍偏移重建节拍网格 */
export function beatGrid(bpm: number, offset: number, duration: number): number[] {
  const out: number[] = []
  if (!(bpm > 0)) return out
  const p = 60 / bpm
  for (let t = offset; t < duration + 0.01; t += p) if (t >= 0) out.push(Number(t.toFixed(4)))
  return out
}
