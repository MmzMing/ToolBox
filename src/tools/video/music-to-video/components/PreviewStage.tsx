/**
 * 预览舞台：画布 + 走带 + 彩色分镜时间轴 + 当前镜头信息条。
 *
 * 画布刻意不做任何"测量父容器再设 CSS 尺寸"的事：应用外壳的列高是内容驱动的，
 * 那样量会形成正反馈把画面撑出屏幕。这里把缓冲区固定成预览分辨率，
 * 再用 object-contain 塞进容器，宽高比与留白都交给 CSS，天然响应式。
 *
 * 时间读数、播放头与镜头信息走 ref/局部 state，避免每帧 setState 拖垮设置面板。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Slider } from '@/components/ui/slider'
import { Renderer } from '../engine/renderer'
import { LAYOUT_ORDER } from '../engine/registry'
import type { AudioInfo, Cut, Plan } from '../engine/types'
import { clamp, fmtTime } from '../engine/util'
import { TipButton } from './TipButton'

/** 预览缓冲区的最大宽度：再高只是浪费，逐帧渲染会掉速 */
const PREVIEW_MAX_W = 1440

/** 构图 → 色相，让时间轴上相邻镜头一眼分得开（140 个构图，查表而不是每次 indexOf） */
const LAYOUT_HUES = new Map<string, number>(
  LAYOUT_ORDER.map((key, i) => [key, (i * 37 + 30) % 360]),
)

function layoutHue(key: string): number {
  return LAYOUT_HUES.get(key) ?? 0
}

type PreviewStageProps = {
  plan: Plan
  audio: AudioInfo | null
  playing: boolean
  loop: boolean
  onTogglePlay: () => void
  onToggleLoop: () => void
  onSeek: (t: number) => void
  onShuffle: () => void
  onOmakase: () => void
  /** 读取当前时刻（有音频时由 WebAudio 时钟给出） */
  getTime: () => number
  /** 字体加载完成后自增，用于强制重画一帧 */
  fontEpoch: number
  /** 非 0 时按这个帧率走带，预览看到的就是导出的节奏 */
  exportFps: number
  /** 预览监听音量 0-1 */
  volume: number
  onVolume: (v: number) => void
  /** 当前镜头属于第几行歌词（-1 表示片头/间奏），供行列表高亮 */
  onCurrentLine: (line: number) => void
}

function cutAtTime(plan: Plan, t: number): Cut | null {
  let found: Cut | null = null
  for (const c of plan.cuts) {
    if (c.start <= t) found = c
    else break
  }
  return found && t < found.end ? found : null
}

export function PreviewStage({
  plan,
  audio,
  playing,
  loop,
  onTogglePlay,
  onToggleLoop,
  onSeek,
  onShuffle,
  onOmakase,
  getTime,
  fontEpoch,
  exportFps,
  volume,
  onVolume,
  onCurrentLine,
}: PreviewStageProps) {
  const { t } = useTranslation('tools-video', { keyPrefix: 'music-to-video' })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRef = useRef<HTMLCanvasElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const scrubRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const frameRef = useRef(0)
  const draggingRef = useRef(false)
  const slowRef = useRef(false)
  /** 静音前最后一次音量，取消静音时回到它 */
  const lastVolumeRef = useRef(volume > 0 ? volume : 1)
  const [cutIndex, setCutIndex] = useState(-1)

  const drawTimeline = useCallback(
    (time: number) => {
      const cv = timelineRef.current
      if (!cv) return
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const w = cv.width
      const h = cv.height
      const dpr = w / Math.max(1, cv.clientWidth)
      const d = Math.max(0.001, plan.duration)
      const X = (sec: number) => (sec / d) * w
      ctx.clearRect(0, 0, w, h)
      const fg = getComputedStyle(cv).color
      if (audio?.peaks.length) {
        const peaks = audio.peaks
        ctx.fillStyle = fg
        ctx.globalAlpha = 0.22
        for (let i = 0; i < w; i += 2) {
          const sec = (i / w) * d
          if (sec > audio.duration) break
          const v =
            peaks[Math.min(peaks.length - 1, Math.floor((sec / audio.duration) * peaks.length))]
          const hh = v * h * 0.7
          ctx.fillRect(i, h * 0.55 - hh / 2, 1.5, hh)
        }
      }
      ctx.globalAlpha = 0.45
      ctx.fillStyle = fg
      for (const b of plan.beats) {
        if (b > d) break
        ctx.fillRect(Math.round(X(b)), h - 6 * dpr, 1, 6 * dpr)
      }
      const top = h * 0.3
      const bottom = h - 8 * dpr
      const mono = `${Math.round(10 * dpr)}px ui-monospace, monospace`
      for (const cut of plan.cuts) {
        const x0 = X(cut.start)
        const x1 = X(cut.end)
        const hue = layoutHue(cut.layout)
        ctx.globalAlpha = 1
        ctx.fillStyle = `hsl(${hue} 70% 58% / 0.26)`
        ctx.fillRect(x0, top, Math.max(1, x1 - x0 - 1), bottom - top)
        ctx.fillStyle = `hsl(${hue} 80% 62%)`
        ctx.fillRect(x0, top, Math.max(1, 2 * dpr), bottom - top)
        if (x1 - x0 > 40 * dpr) {
          ctx.fillStyle = fg
          ctx.globalAlpha = 0.85
          ctx.font = mono
          ctx.save()
          ctx.beginPath()
          ctx.rect(x0, top, x1 - x0 - 3, bottom - top)
          ctx.clip()
          ctx.fillText(t(`parts.layout.${cut.layout}`), x0 + 5 * dpr, top + 13 * dpr)
          ctx.restore()
        }
      }
      ctx.globalAlpha = 0.7
      ctx.fillStyle = fg
      ctx.font = mono
      // 行号只在有位置时画，否则几十行的歌会变成一坨压字
      let lastLabel = -Infinity
      for (const ln of plan.lines) {
        const lx = X(ln.start)
        ctx.fillRect(lx, 0, 1, top)
        if (lx - lastLabel < 20 * dpr) continue
        lastLabel = lx
        ctx.fillText(String(ln.index + 1).padStart(2, '0'), lx + 3 * dpr, 12 * dpr)
      }
      ctx.globalAlpha = 1
      ctx.fillRect(X(time) - dpr, 0, 2 * dpr, h)
    },
    [audio, plan, t],
  )

  const drawFrame = useCallback(
    (time: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const renderer = rendererRef.current
      if (!renderer) return
      const shown = exportFps > 0 ? Math.floor(time * exportFps + 1e-6) / exportFps : time
      const started = performance.now()
      renderer.frame(ctx, plan, shown, {
        scale: canvas.width / plan.W,
        fast: playing && slowRef.current,
      })
      const ms = performance.now() - started
      // 掉帧时自动降级（关掉辉光/颗粒等滤镜），保证走带不卡
      slowRef.current = playing ? (ms > 30 ? true : ms < 14 ? false : slowRef.current) : false
      if (clockRef.current) clockRef.current.textContent = fmtTime(shown)
      // 擦除条的可访问性数值直接写 DOM：它每帧都变，走 state 会拖垮整棵树
      scrubRef.current?.setAttribute('aria-valuenow', time.toFixed(2))
      const here = cutAtTime(plan, shown)
      setCutIndex((prev) => (prev === (here?.index ?? -1) ? prev : (here?.index ?? -1)))
      onCurrentLine(here?.line ?? -1)
      drawTimeline(shown)
    },
    [drawTimeline, exportFps, onCurrentLine, plan, playing],
  )

  // 缓冲区尺寸跟随容器宽度（CSS 尺寸交给 object-contain，不参与测量，避免回环）
  useEffect(() => {
    if (!rendererRef.current) rendererRef.current = new Renderer()
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = plan.W / plan.H
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssW = canvas.parentElement?.clientWidth ?? PREVIEW_MAX_W
    const pw = Math.round(Math.min(PREVIEW_MAX_W, Math.max(320, cssW) * dpr))
    const ph = Math.round(pw / ratio)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    drawFrame(getTime())
  }, [drawFrame, fontEpoch, getTime, plan.H, plan.W])

  useEffect(() => {
    const cv = timelineRef.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.max(10, Math.round((cv.clientWidth || 300) * dpr))
    const h = Math.max(10, Math.round((cv.clientHeight || 40) * dpr))
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    drawTimeline(getTime())
  }, [drawTimeline, getTime, plan])

  // 常驻 rAF：播放时推进时刻，暂停时只在时刻变化（拖动、点行、换镜头）或分镜改变时重画
  useEffect(() => {
    let lastDrawn = -1
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick)
      const total = plan.duration
      let time = getTime()
      if (playing) {
        if (time >= total - 0.001) {
          if (loop) {
            onSeek(0)
            time = 0
          } else {
            onTogglePlay()
            time = total - 0.001
          }
        }
      }
      // 按导出帧率走带时，同一帧内重复画没有意义，用帧号当去重键
      const key = exportFps > 0 ? Math.floor(time * exportFps + 1e-6) : time
      if (key === lastDrawn) return
      lastDrawn = key
      drawFrame(time)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [drawFrame, exportFps, getTime, loop, onSeek, onTogglePlay, plan.duration, playing])

  const seekFromPointer = (clientX: number) => {
    const cv = timelineRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    onSeek(clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * plan.duration)
  }

  const jumpCut = (dir: 1 | -1) => {
    const at = getTime()
    const target =
      dir > 0
        ? plan.cuts.find((c) => c.start > at + 0.01)
        : [...plan.cuts].reverse().find((c) => c.start < at - 0.05)
    if (!target) return
    onSeek(target.start + Math.min(target.dur * 0.5, target.inDur + 0.05))
  }

  const cut = cutIndex >= 0 ? plan.cuts[cutIndex] : null
  const chip = (group: string, key: string) => (
    <span className="border-primary/30 bg-primary/5 rounded border px-1.5 py-0.5 text-[11px]">
      <b className="text-muted-foreground mr-1 font-normal">{t(`groups.${group}`)}</b>
      {t(`parts.${group}.${key}`, key)}
    </span>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-black">
        <canvas ref={canvasRef} className="absolute inset-0 size-full object-contain" />
      </div>

      <div
        ref={scrubRef}
        role="slider"
        aria-label={t('fields.scrub')}
        aria-valuemin={0}
        aria-valuemax={Math.round(plan.duration * 100)}
        aria-valuenow={0}
        tabIndex={0}
        className="border-background/60 text-foreground/70 focus-visible:ring-ring h-12 w-full shrink-0 cursor-pointer touch-none rounded-md border outline-none focus-visible:ring-2"
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromPointer(e.clientX)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) seekFromPointer(e.clientX)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(getTime() + 1 / plan.fps)
          if (e.key === 'ArrowLeft') onSeek(getTime() - 1 / plan.fps)
        }}
      >
        <canvas ref={timelineRef} className="pointer-events-none size-full" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <TipButton
          size="sm"
          variant="secondary"
          onClick={onTogglePlay}
          tip={playing ? t('actions.pause') : t('actions.play')}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </TipButton>
        <TipButton
          size="sm"
          variant={loop ? 'default' : 'outline'}
          onClick={onToggleLoop}
          aria-pressed={loop}
          tip={t('actions.loop')}
        >
          <Repeat className="size-4" />
        </TipButton>
        <TipButton
          size="sm"
          variant="ghost"
          onClick={() => jumpCut(-1)}
          tip={t('actions.prevCut')}
          side="top"
        >
          <SkipBack className="size-4" />
        </TipButton>
        <TipButton
          size="sm"
          variant="ghost"
          onClick={() => jumpCut(1)}
          tip={t('actions.nextCut')}
          side="top"
        >
          <SkipForward className="size-4" />
        </TipButton>
        {/* Radix 把 role=slider 放在 thumb 上，aria-label 给 Root 到不了它，所以整组用 group 命名 */}
        <div role="group" aria-label={t('actions.volume')} className="flex shrink-0 items-center">
          <TipButton
            size="sm"
            variant="ghost"
            onClick={() => onVolume(volume > 0 ? 0 : lastVolumeRef.current)}
            tip={volume > 0 ? t('actions.mute') : t('actions.unmute')}
          >
            {volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </TipButton>
          <Slider
            value={[Math.round(volume * 100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => {
              const next = (v[0] ?? 0) / 100
              if (next > 0) lastVolumeRef.current = next
              onVolume(next)
            }}
            className="ml-1 w-20"
          />
        </div>
        <span ref={clockRef} className="text-muted-foreground font-mono text-xs tabular-nums">
          {fmtTime(0)}
        </span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          / {fmtTime(plan.duration)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <TipButton
            size="sm"
            variant="outline"
            onClick={onShuffle}
            aria-label={t('actions.shuffle')}
            tip={t('actions.shuffleTip')}
          >
            <Shuffle className="size-4" />
            {t('actions.shuffle')}
          </TipButton>
          <TipButton
            size="sm"
            onClick={onOmakase}
            aria-label={t('actions.omakase')}
            tip={t('actions.omakaseTip')}
          >
            <Wand2 className="size-4" />
            {t('actions.omakase')}
          </TipButton>
        </div>
      </div>

      <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-1.5">
        {cut ? (
          <>
            <span className="text-muted-foreground font-mono text-[11px]">
              #{String((cut.index ?? 0) + 1).padStart(2, '0')}
            </span>
            {chip('layout', cut.layout)}
            {chip('enter', cut.enter)}
            {chip('hold', cut.hold)}
            {chip('exit', cut.exit)}
            {cut.decor.length > 0 ? (
              <span className="border-border rounded border px-1.5 py-0.5 text-[11px]">
                <b className="text-muted-foreground mr-1 font-normal">{t('groups.decor')}</b>
                {cut.decor.map((d) => t(`parts.decor.${d.id}`, d.id)).join('·')}
              </span>
            ) : null}
            {cut.treat !== 'none' ? chip('treat', cut.treat) : null}
            {cut.bg !== 'none' ? chip('bg', cut.bg) : null}
            {cut.cam !== 'push' ? chip('cam', cut.cam) : null}
            {cut.trans ? chip('trans', cut.trans) : null}
          </>
        ) : (
          <span className="text-muted-foreground text-[11px]">{t('state.noCutHere')}</span>
        )}
      </div>
    </div>
  )
}
