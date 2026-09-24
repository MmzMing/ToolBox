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
}

export function usePlayback(audio: AudioInfo | null, duration: number): Playback {
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
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
      const src = ctx.createBufferSource()
      src.buffer = audio.buffer
      src.connect(ctx.destination)
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
  }
}
