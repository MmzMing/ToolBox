import { describe, expect, it } from 'vitest'

import {
  beatGrid,
  beatPhase,
  buildBeats,
  energyFlux,
  estimatePeriod,
  normalizeEnergy,
  onsetStrength,
  waveformPeaks,
} from '@/tools/video/music-to-video/engine/audio'

const SAMPLE_RATE = 8000

/** 造一段每 interval 秒一记强起音的测试信号（等效于节拍器） */
function clickTrack(seconds: number, interval: number, burst = 60): Float32Array {
  const out = new Float32Array(SAMPLE_RATE * seconds)
  for (let start = 0; start + burst < out.length; start += Math.round(interval * SAMPLE_RATE)) {
    for (let i = 0; i < burst; i++) out[start + i] = (i % 2 ? 1 : -1) * 0.8 * (1 - i / burst)
  }
  return out
}

describe('energyFlux', () => {
  it('按 50Hz 出帧，能量与非零起音都算得出来', () => {
    const mono = clickTrack(4, 0.5)
    const { energy, flux } = energyFlux(mono, SAMPLE_RATE)
    expect(energy.length).toBe(Math.floor(mono.length / 160))
    expect(flux.length).toBe(energy.length)
    expect(Math.max(...energy)).toBeGreaterThan(0)
  })

  it('静音的能量与起音都是 0', () => {
    const { energy, flux } = energyFlux(new Float32Array(1600), SAMPLE_RATE)
    expect(Math.max(...energy)).toBe(0)
    expect(Math.max(...flux)).toBe(0)
  })
})

describe('onsetStrength', () => {
  it('只在信号变化处给出正值', () => {
    const onset = onsetStrength(energyFlux(clickTrack(4, 0.5), SAMPLE_RATE).flux)
    const peaks = Array.from(onset)
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v > 0)
    expect(peaks.length).toBeGreaterThan(0)
    // 120 BPM = 每 25 帧一次起音，主峰间距应接近 25
    const first = peaks[0].i
    const last = peaks[peaks.length - 1].i
    expect((last - first) / (peaks.length - 1)).toBeGreaterThan(2)
  })

  it('恒定输入没有起音', () => {
    const flat = new Float32Array(200).fill(0.2)
    const onset = onsetStrength(energyFlux(flat, SAMPLE_RATE).flux)
    expect(Math.max(...onset)).toBeLessThan(1e-6)
  })
})

describe('estimatePeriod / beatPhase', () => {
  it('从 120 BPM 的节拍器里估出 120 BPM', () => {
    const { flux } = energyFlux(clickTrack(12, 0.5), SAMPLE_RATE)
    const { bpm, period } = estimatePeriod(onsetStrength(flux))
    expect(Math.abs(bpm - 120)).toBeLessThan(6)
    expect(period).toBeGreaterThan(0.4)
    expect(period).toBeLessThan(0.6)
  })

  it('90 与 150 BPM 都能落进合理区间', () => {
    for (const [interval, expected] of [
      [60 / 90, 90],
      [60 / 150, 150],
    ] as const) {
      const { flux } = energyFlux(clickTrack(12, interval), SAMPLE_RATE)
      const { bpm } = estimatePeriod(onsetStrength(flux))
      expect(Math.abs(bpm - expected)).toBeLessThan(10)
    }
  })

  it('相位对准真实起音位置', () => {
    const { flux } = energyFlux(clickTrack(12, 0.5), SAMPLE_RATE)
    const onset = onsetStrength(flux)
    const { period } = estimatePeriod(onset)
    const { phase } = beatPhase(onset, period * 50)
    expect(phase).toBeGreaterThanOrEqual(0)
    expect(phase).toBeLessThan(period)
  })

  it('纯噪声不会给出荒谬的周期', () => {
    const noise = new Float32Array(SAMPLE_RATE * 6)
    for (let i = 0; i < noise.length; i++) noise[i] = Math.sin(i * 0.37) * 0.2
    const { bpm } = estimatePeriod(onsetStrength(energyFlux(noise, SAMPLE_RATE).flux))
    expect(bpm).toBeGreaterThan(60)
    expect(bpm).toBeLessThan(200)
  })
})

describe('buildBeats / beatGrid', () => {
  it('网格铺满整曲且单调递增', () => {
    const beats = buildBeats(0.2, 0.5, 3)
    expect(beats[0]).toBe(0.2)
    expect(beats).toEqual([0.2, 0.7, 1.2, 1.7, 2.2, 2.7])
  })

  it('周期为 0 时不产生任何拍点', () => {
    expect(buildBeats(0, 0, 5)).toEqual([])
  })

  it('手工 BPM 重建网格，非法 BPM 返回空', () => {
    expect(beatGrid(120, 0, 2)).toEqual([0, 0.5, 1, 1.5, 2])
    expect(beatGrid(0, 0, 2)).toEqual([])
    expect(beatGrid(-5, 0, 2)).toEqual([])
  })
})

describe('normalizeEnergy / waveformPeaks', () => {
  it('归一化后最大值接近 1 且不超过 1', () => {
    // 起音足够宽，让 95 分位落在有声音的帧里
    const { energy } = energyFlux(clickTrack(6, 0.5, 600), SAMPLE_RATE)
    const norm = normalizeEnergy(energy)
    expect(Math.max(...norm)).toBeLessThanOrEqual(1)
    expect(Math.max(...norm)).toBeGreaterThan(0.9)
  })

  it('空能量数组不会除零', () => {
    expect(Array.from(normalizeEnergy(new Float32Array(0)))).toEqual([])
  })

  it('波形柱数与峰值符合输入长度', () => {
    const peaks = waveformPeaks(clickTrack(4, 0.5), 200)
    expect(peaks.length).toBe(200)
    expect(Math.max(...peaks)).toBeGreaterThan(0.5)
  })

  it('极短音频也只出一根柱', () => {
    expect(waveformPeaks(new Float32Array(10), 200).length).toBe(200)
  })
})
