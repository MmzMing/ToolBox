import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Transition } from 'motion/react'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'

import { buildTree, clamp01, COLOR_MS, HOLD, selfPaced, smoothstep, WAIT_CAP } from './grid'
import { drawScene, readAverages, type Scene } from './paint'

export type GridRevealProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** 图片地址：留空则只演灰格等待态，图落地后由调用方换进来 */
  src?: string | null
  alt?: string
  /** 0-1 的真实进度；不传则按 estimatedDuration 自估 */
  progress?: number
  /** 宽高比（宽/高），同时决定格子树的劈向 */
  aspect?: number
  /** 左下角状态文字，图片揭示完自动消失 */
  caption?: string
  /** 自估模式下的预期耗时（毫秒） */
  estimatedDuration?: number
  onRevealComplete?: () => void
  onError?: () => void
}

/** waiting 灰格劈裂等图；tinted 图落地、格子染均色；revealed 真图浮出，动画收尾停帧 */
type Stage = 'waiting' | 'tinted' | 'revealed'

/** 字幕条的进出与 layout 补间共用这一条对称曲线，两处不同步就会一个快一个慢 */
const CAPTION: Transition = { duration: 0.28, ease: [0.4, 0, 0.2, 1] }

/** 扫光一次循环的时长，以及它回到起点前的停顿 */
const SHIMMER_CYCLE: Transition = {
  duration: 1.6,
  repeat: Infinity,
  repeatDelay: 0.5,
  ease: [0.45, 0, 0.55, 1],
}

/** 字幕条的文字扫光；减弱动效时退回纯色。亮端直接用遮罩上的前景色令牌 */
const SHIMMER = {
  backgroundImage: `linear-gradient(
    90deg,
    color-mix(in oklch, var(--overlay-foreground) 50%, transparent) 40%,
    var(--overlay-foreground) 50%,
    color-mix(in oklch, var(--overlay-foreground) 50%, transparent) 60%
  )`,
  backgroundSize: '250% 100%',
} as const

/**
 * 分裂揭示：一块灰格不断劈成越来越小的格子，图片落地时格子染上它的均色，
 * 最后真图从底下浮出来。用来替骨架屏当"正在生成"的 loading 态——
 * 等待有反馈，出图有过程，而不是内容凭空蹦出来。
 *
 * 调用方只管给 `src`/`caption`/`progress`，动画全在一张 canvas 里画，
 * 不产生 DOM 节点，所以画布上几百个节点同时挂也不吃亏。
 */
export function GridReveal({
  src,
  alt = '',
  progress,
  aspect = 1,
  caption,
  estimatedDuration = 6000,
  onRevealComplete,
  onError,
  className,
  style,
  ...props
}: GridRevealProps) {
  const reduced = usePrefersReducedMotion()
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /**
   * 这一张图演到哪一拍，连同它属于哪张图一起记：换 src 时不必在 effect 里补一次 setState
   * 清零，key 对不上就派生成 waiting（与 dock 记 pathname 同一套写法，少一轮渲染）。
   */
  const [reveal, setReveal] = useState<{ key: string | null; stage: Stage }>(() => ({
    key: src ?? null,
    stage: 'waiting',
  }))
  const onCurrentKey = reveal.key === (src ?? null)
  const loaded = onCurrentKey && reveal.stage !== 'waiting'
  const revealed = onCurrentKey && reveal.stage === 'revealed'

  /** 调用方每次渲染都换新的回调与进度，所以只喂给循环、不进依赖数组，否则整棵格子树随渲染重建 */
  const latest = useRef({ progress, estimatedDuration, onRevealComplete, onError })
  useEffect(() => {
    latest.current = { progress, estimatedDuration, onRevealComplete, onError }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!canvas || !frame) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const { root, branches } = buildTree(ratio)

    const scene: Scene = {
      ctx,
      root,
      width: 0,
      height: 0,
      scale: 1,
      dark: false,
      clock: 0,
      split: 0,
      fade: 0,
      hasColors: false,
      image: null,
    }

    let loadedAt = -1
    let cancelled = false

    const render = (split: number, now: number) => {
      scene.dark = document.documentElement.classList.contains('dark')
      scene.split = split
      scene.fade = loadedAt < 0 ? 0 : smoothstep(0, COLOR_MS, now - loadedAt)
      drawScene(scene)
    }

    const repaint = () => {
      if (!reduced) {
        return render(scene.split, performance.now())
      }
      // 减弱动效没有循环，直接落到稳定帧
      const settled = loadedAt < 0 ? performance.now() : loadedAt + COLOR_MS
      render(scene.image ? 1 : WAIT_CAP, settled)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = frame.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      scene.scale = dpr
      if (w === scene.width && h === scene.height) {
        return
      }
      scene.width = w
      scene.height = h
      canvas.width = w
      canvas.height = h
      // 改尺寸会清空 canvas，所以必须重画
      repaint()
    }

    resize()
    // jsdom 与老浏览器没有这两个观察者，缺了就让组件降级而不是抛错
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(frame)

    const load = (url: string, withCors: boolean) => {
      const el = new Image()
      if (withCors) {
        el.crossOrigin = 'anonymous'
      }
      el.decoding = 'async'
      el.onload = () => {
        if (cancelled) {
          return
        }
        if (!el.naturalWidth || !el.naturalHeight) {
          latest.current.onError?.()
          return
        }
        scene.image = el
        loadedAt = performance.now()
        scene.hasColors = readAverages(el, root, branches, scene.split)
        setReveal({ key: src ?? null, stage: 'tinted' })
        if (reduced) {
          repaint()
        }
      }
      // 没有 CORS 头的站点会直接拒请求，所以退回普通加载再试一次
      el.onerror = () => {
        if (cancelled) {
          return
        }
        if (withCors) {
          load(url, false)
        } else {
          latest.current.onError?.()
        }
      }
      el.src = url
    }

    if (src) {
      // blob:/data: 本来同源，加 crossorigin 只是多余，个别浏览器还会因此拒载
      load(src, !/^(blob|data):/i.test(src))
    }

    if (reduced) {
      repaint()
      return () => {
        cancelled = true
        observer?.disconnect()
      }
    }

    let frameId = 0
    let last = 0
    let elapsed = 0
    let eased = 0
    let split = 0
    let fired = false
    let stopped = false
    let visible = true

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick)
      if (!last) {
        last = now
      }
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      elapsed += dt
      scene.clock = elapsed

      const ready = scene.image !== null
      const paced = latest.current.progress === undefined
      let target: number

      // 真正收尾的是图片到达，不是那个数字
      if (ready) {
        target = 1
      } else if (paced) {
        target = selfPaced(elapsed * 1000, latest.current.estimatedDuration)
      } else {
        target = Math.min(clamp01(latest.current.progress as number), HOLD)
      }

      eased += (target - eased) * (1 - Math.exp(-dt * 5.5))
      const wanted = Math.min(eased, ready ? 1 : WAIT_CAP)
      split += (wanted - split) * (1 - Math.exp(-dt * 4))
      render(split, now)

      if (!fired && ready && eased > 0.995 && now - loadedAt > COLOR_MS) {
        fired = true
        setReveal({ key: src ?? null, stage: 'revealed' })
        latest.current.onRevealComplete?.()
      }

      // 此后画面不再变化，没理由继续烧帧
      if (fired && split > 0.9995) {
        render(1, now)
        stopped = true
        cancelAnimationFrame(frameId)
      }
    }

    const start = () => {
      if (stopped) {
        return
      }
      last = 0
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(tick)
    }

    // 没人看着的时候不必动画
    const visibility =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              if (entry.isIntersecting === visible) {
                return
              }
              visible = entry.isIntersecting
              if (visible) {
                start()
              } else {
                cancelAnimationFrame(frameId)
              }
            },
            { rootMargin: '150px' },
          )
        : null
    visibility?.observe(frame)

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
      observer?.disconnect()
      visibility?.disconnect()
    }
  }, [reduced, src, ratio])

  useEffect(() => {
    if (reduced && loaded) {
      latest.current.onRevealComplete?.()
    }
  }, [reduced, loaded])

  const finished = reduced ? loaded : revealed

  return (
    <div
      ref={frameRef}
      data-slot="grid-reveal"
      className={cn('bg-muted relative w-full overflow-hidden rounded-xl', className)}
      style={{ aspectRatio: ratio, ...style }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      />

      {caption ? (
        <motion.div
          layout
          className="bg-overlay/45 pointer-events-none absolute bottom-3 left-3 flex h-6 items-center overflow-hidden px-2.5 backdrop-blur-md"
          style={{ borderRadius: 9999 }}
          animate={{ opacity: finished ? 0 : 1 }}
          transition={{ opacity: CAPTION, layout: CAPTION }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={caption}
              layout="position"
              className={cn(
                'block text-[11px] leading-6 font-medium whitespace-nowrap',
                reduced ? 'text-overlay-foreground/75' : 'bg-clip-text text-transparent',
              )}
              style={reduced ? undefined : SHIMMER}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                ...(reduced || finished ? {} : { backgroundPosition: ['105% 0%', '-5% 0%'] }),
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduced ? 0 : CAPTION.duration,
                ease: CAPTION.ease,
                backgroundPosition: SHIMMER_CYCLE,
              }}
            >
              {caption}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      ) : null}
    </div>
  )
}
