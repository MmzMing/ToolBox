import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

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

/** 字幕条的文字扫光；减弱动效时退回纯色 */
const SHIMMER = {
  backgroundImage:
    'linear-gradient(90deg, rgba(255,255,255,0.5) 40%, rgba(255,255,255,0.98) 50%, rgba(255,255,255,0.5) 60%)',
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
  const reduce = useReducedMotion()
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const progressRef = useRef(progress)
  const durationRef = useRef(estimatedDuration)
  const doneRef = useRef(onRevealComplete)
  const errorRef = useRef(onError)

  useEffect(() => {
    progressRef.current = progress
    durationRef.current = estimatedDuration
    doneRef.current = onRevealComplete
    errorRef.current = onError
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

    // 换源就从头再来：上一张的完成态不能留给这一张
    setLoaded(false)
    setRevealed(false)

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
      if (!reduce) {
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
          errorRef.current?.()
          return
        }
        scene.image = el
        loadedAt = performance.now()
        scene.hasColors = readAverages(el, root, branches, scene.split)
        setLoaded(true)
        if (reduce) {
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
          errorRef.current?.()
        }
      }
      el.src = url
    }

    if (src) {
      // blob:/data: 本来同源，加 crossorigin 只是多余，个别浏览器还会因此拒载
      load(src, !/^(blob|data):/i.test(src))
    }

    if (reduce) {
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
      const paced = progressRef.current === undefined
      let target: number

      // 真正收尾的是图片到达，不是那个数字
      if (ready) {
        target = 1
      } else if (paced) {
        target = selfPaced(elapsed * 1000, durationRef.current)
      } else {
        target = Math.min(clamp01(progressRef.current as number), HOLD)
      }

      eased += (target - eased) * (1 - Math.exp(-dt * 5.5))
      const wanted = Math.min(eased, ready ? 1 : WAIT_CAP)
      split += (wanted - split) * (1 - Math.exp(-dt * 4))
      render(split, now)

      if (!fired && ready && eased > 0.995 && now - loadedAt > COLOR_MS) {
        fired = true
        setRevealed(true)
        doneRef.current?.()
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
  }, [reduce, src, ratio])

  useEffect(() => {
    if (reduce && loaded) {
      doneRef.current?.()
    }
  }, [reduce, loaded])

  const finished = reduce ? loaded : revealed

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
          className="pointer-events-none absolute bottom-3 left-3 flex h-6 items-center overflow-hidden bg-black/45 px-2.5 backdrop-blur-md"
          style={{ borderRadius: 9999 }}
          animate={{ opacity: finished ? 0 : 1 }}
          transition={{
            opacity: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
            layout: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={caption}
              layout="position"
              className={cn(
                'block text-[11px] leading-6 font-medium whitespace-nowrap',
                reduce ? 'text-white/75' : 'bg-clip-text text-transparent',
              )}
              style={reduce ? undefined : SHIMMER}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                ...(reduce || finished ? {} : { backgroundPosition: ['105% 0%', '-5% 0%'] }),
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: reduce ? 0 : 0.28,
                ease: [0.4, 0, 0.2, 1],
                backgroundPosition: {
                  duration: 1.6,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                  ease: [0.45, 0, 0.55, 1],
                },
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
