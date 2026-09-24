/**
 * 播放时钟。
 *
 * 有音频时用 WebAudio 的 BufferSource 直接播已解码的 AudioBuffer，
 * 画面时刻取 audioContext.currentTime，天然与声音对齐（不用 <audio> 元素，
 * 免得再解码一次并和 analyzeAudio 的结果对不上）。
 * 没有音频时退化成内部时钟，所以"曲なし"也能预览动画——这是原项目的行为。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AudioInfo } from './engine/types'
import { clamp } from './engine/util'

const VOLUME_KEY = 'toolbox.music-to-video.volume'

/** 音量记在本地：每次开页都拉满太吵；读不到或读坏了都回到 1 */
function readVolume(): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(VOLUME_KEY) ?? '')
    return Number.isFinite(raw) ? clamp(raw, 0, 1) : 1
  } catch {
    return 1
  }
}

export type Playback = {
  playing: boolean
  loop: boolean
  setLoop: (on: boolean) => void
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  /** 当前画面时刻（供 rAF 读取，不触发重渲染） */
  now: () => number
  duration: () => number
  /** 预览监听音量 0-1，只作用于预览播放，导出走音频轨本身 */
  volume: number
  setVolume: (v: number) => void
}

export function usePlayback(audio: AudioInfo | null, duration: number): Playback {
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [volume, setVolume] = useState(readVolume)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const volumeRef = useRef(volume)
  const startAtRef = useRef(0)
  const clockRef = useRef(0)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const loopRef = useRef(true)
  const durationRef = useRef(duration)

  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  useEffect(() => {
    loopRef.current = loop
  }, [loop])

  useEffect(() => {
    volumeRef.current = volume
    if (gainRef.current) gainRef.current.gain.value = volume
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      /* 隐私模式存不了，音量照样能调，只是下次要重设 */
    }
  }, [volume])

  const stopSource = useCallback(() => {
    const src = srcRef.current
    srcRef.current = null
    if (!src) return
    src.onended = null
    try {
      src.stop()
    } catch {
      /* 已经停了 */
    }
    src.disconnect()
  }, [])

  /**
   * 当前时刻。播放中必须从时钟现算：
   * 有音频取 AudioContext 时间（与声音严格对齐），没音频取 performance.now 差值；
   * 只有暂停时才读缓存的 timeRef，否则画面会停在原地。
   */
  const now = useCallback(() => {
    if (!playingRef.current) return timeRef.current
    if (srcRef.current && ctxRef.current) return ctxRef.current.currentTime - startAtRef.current
    return (performance.now() - clockRef.current) / 1000
  }, [])

  const pause = useCallback(() => {
    timeRef.current = now()
    playingRef.current = false
    stopSource()
    setPlaying(false)
  }, [now, stopSource])

  const play = useCallback(() => {
    const from = clamp(timeRef.current, 0, Math.max(0, durationRef.current - 0.001))
    if (audio?.buffer) {
      if (!ctxRef.current) ctxRef.current = new AudioContext()
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      stopSource()
      // GainNode 挂在 source 与 destination 之间，调音量不用重新起播
      if (!gainRef.current) {
        gainRef.current = ctx.createGain()
        gainRef.current.connect(ctx.destination)
      }
      gainRef.current.gain.value = volumeRef.current
      const src = ctx.createBufferSource()
      src.buffer = audio.buffer
      src.connect(gainRef.current)
      src.start(0, from)
      srcRef.current = src
      startAtRef.current = ctx.currentTime - from
    } else {
      clockRef.current = performance.now() - from * 1000
    }
    playingRef.current = true
    setPlaying(true)
  }, [audio, stopSource])

  const seek = useCallback(
    (t: number) => {
      const to = clamp(t, 0, Math.max(0, durationRef.current - 0.001))
      timeRef.current = to
      if (srcRef.current && ctxRef.current) {
        play()
      } else {
        clockRef.current = performance.now() - to * 1000
      }
    },
    [play],
  )

  useEffect(() => stopSource, [stopSource])

  return {
    playing,
    loop,
    setLoop,
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    seek,
    now,
    duration: () => durationRef.current,
    volume,
    setVolume: (v: number) => setVolume(clamp(v, 0, 1)),
  }
}
