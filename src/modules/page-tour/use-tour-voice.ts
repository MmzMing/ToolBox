import { useCallback, useEffect, useRef, useState } from 'react'

import { soundUrl, type VoiceCue } from './tour-voice'

/** 人声整体音量：游戏音库录得偏响，直接 1.0 会盖过系统提示音 */
const VOICE_GAIN = 0.7
/** 逐条在 0.94~1.06 之间微调速率，让同一句里每条的音色不至于完全一样 */
const RATE_SPREAD = 0.12

/** 打字机的露字锚点：这条音效开口的时刻 → 正文该露到第几个字符 */
type Mark = { at: number; reveal: number }

type Cache = Map<string, AudioBuffer | null>

/**
 * 把一串音效按时间轴拼成一句话播出去，并顺带报出"现在该露到第几个字"。
 *
 * 没有先把 wav 拼成一个大 AudioBuffer，而是每条一个 BufferSource、按算好的时刻排程：
 * 效果同样是"拼接"，但能逐条调速率、能中途 stop，也不用为了拼接口径重采样。
 *
 * 露字读的是 `AudioContext.currentTime` 而不是 setTimeout：排程本来就落在这条时钟上，
 * 另起一条墙钟计时迟早会和声音错开，而"打字机跟着语音"要的就是这两个严格同步。
 *
 * AudioContext 只在第一次真正要出声时才建——浏览器要求先有用户手势，
 * 导览本来就是点击触发的，所以这里天然满足。
 */
export function useTourVoice(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const cacheRef = useRef<Cache>(new Map())
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  /** 每次 speak 递增；异步解码回来后拿它比对，过期的一律不播 */
  const generation = useRef(0)
  const frame = useRef(0)
  /** null = 没在念，正文整句显示；数字 = 正在跟着语音逐字露出 */
  const [revealed, setRevealed] = useState<number | null>(null)

  const stop = useCallback(() => {
    generation.current += 1
    if (frame.current !== 0) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    for (const source of sourcesRef.current) {
      try {
        source.stop()
      } catch {
        // 已经播完的会抛 InvalidStateError，忽略即可
      }
      source.disconnect()
    }
    sourcesRef.current = []
    setRevealed(null)
  }, [])

  const speak = useCallback(
    async (cues: VoiceCue[], rate = 1) => {
      stop()
      if (!enabled || cues.length === 0) {
        return
      }
      // 解码要等一两个网络往返，先把正文清空，否则整句会闪一下再退回开头
      setRevealed(0)

      const ctx = (ctxRef.current ??= new AudioContext())
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => undefined)
      }
      const token = generation.current
      const cache = cacheRef.current

      const buffers = await Promise.all(
        cues.map(async (cue) => {
          const hit = cache.get(cue.clip)
          if (hit !== undefined) {
            return hit
          }
          try {
            const res = await fetch(soundUrl(cue.clip))
            if (!res.ok) {
              cache.set(cue.clip, null)
              return null
            }
            const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
            cache.set(cue.clip, buffer)
            return buffer
          } catch {
            cache.set(cue.clip, null)
            return null
          }
        }),
      )
      // 解码期间用户已经切步或关掉了导览，这一句就作废
      if (token !== generation.current) {
        return
      }

      let at = ctx.currentTime + 0.02
      const marks: Mark[] = []
      for (let i = 0; i < cues.length; i += 1) {
        // 提速是整体缩：停顿和音片都按同一个倍率走，否则念快了节奏反而被拉散
        at += cues[i].pauseBefore / rate
        // 取音失败的那条不排程，但露字锚点照留，否则正文会在那儿跳一下
        marks.push({ at, reveal: cues[i].reveal })
        const buffer = buffers[i]
        if (buffer === null) {
          continue
        }
        const source = ctx.createBufferSource()
        const gain = ctx.createGain()
        gain.gain.value = VOICE_GAIN
        source.buffer = buffer
        source.playbackRate.value = rate * (1 - RATE_SPREAD / 2 + cues[i].seed * RATE_SPREAD)
        source.connect(gain).connect(ctx.destination)
        source.start(at)
        sourcesRef.current.push(source)
        // 自然尾音：按实际速率折算时长，下一条才不会被压在同一瞬间
        at += buffer.duration / source.playbackRate.value
      }
      const end = at

      const step = () => {
        const now = ctx.currentTime
        let shown = 0
        for (const mark of marks) {
          if (now < mark.at) {
            break
          }
          shown = mark.reveal
        }
        setRevealed((prev) => (prev === shown ? prev : shown))
        if (now >= end) {
          frame.current = 0
          setRevealed(null)
          return
        }
        frame.current = requestAnimationFrame(step)
      }
      step()
    },
    [enabled, stop],
  )

  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      stop()
      const ctx = ctxRef.current
      ctxRef.current = null
      void ctx?.close().catch(() => undefined)
      cache.clear()
    }
  }, [stop])

  return { speak, stop, revealed }
}
