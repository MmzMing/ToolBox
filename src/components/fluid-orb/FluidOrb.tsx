import { motion } from 'motion/react'
import { useContext, useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { orbDefaults } from './orb-defaults'
import {
  FALLBACK_COLORS,
  parseHexColor,
  resolveRimColors,
  toCssColor,
  type LinearRGB,
} from './orb-colors'
import { createOrbRenderer } from './orb-gl'
import {
  approach,
  applyTap,
  clamp,
  createSquishState,
  orbStateTargets,
  resolveLevel,
  stepSquish,
  type SquishState,
} from './orb-physics'
import { ORB_CANVAS_PAD, RIM_CYCLE_SECONDS } from './orb-shader'
import { OrbEyes } from './OrbEyes'
import type { FluidOrbHandle, FluidOrbProps } from './types'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { ThemeContext } from '@/modules/theme/theme-context'
import { cn } from '@/lib/utils'

/** 进 uniform 前夹一遍：NaN 会让整颗球算成黑块，越界值会烧穿带宽 */
function safe(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(value, min, max) : min
}

/**
 * 流体悬浮球。
 *
 * 逐帧量（相位、弹簧、电平、倾角）全部存在 ref 里，props 只负责写目标值——
 * 这是它能挂在页面上跑 60fps 而不触发 React 重渲染的原因，也是 `getVolume`
 * 每帧读一次实时电平却不引起渲染的原因。
 */
export function FluidOrb({
  ref,
  size = orbDefaults.size,
  colors,
  state = orbDefaults.state,
  volume,
  getVolume,
  autoVolume = orbDefaults.autoVolume,
  reactivity = orbDefaults.reactivity,
  animationSpeed = orbDefaults.animationSpeed,
  colorSpeed = orbDefaults.colorSpeed,
  glowIntensity = orbDefaults.glowIntensity,
  noiseScale = orbDefaults.noiseScale,
  refraction = orbDefaults.refraction,
  shellWidth = orbDefaults.shellWidth,
  innerScale = orbDefaults.innerScale,
  coreIntensity = orbDefaults.coreIntensity,
  rimWidth = orbDefaults.rimWidth,
  rimIntensity = orbDefaults.rimIntensity,
  glints = orbDefaults.glints,
  halo = orbDefaults.halo,
  wobble = orbDefaults.wobble,
  hoverTilt = orbDefaults.hoverTilt,
  interactive = orbDefaults.interactive,
  blend = orbDefaults.blend,
  intro = orbDefaults.intro,
  paused = orbDefaults.paused,
  resolution = orbDefaults.resolution,
  eyes = orbDefaults.eyes,
  mood = orbDefaults.mood,
  eyeHoldMs = orbDefaults.eyeHoldMs,
  eyeBlinkMs = orbDefaults.eyeBlinkMs,
  className,
  style,
}: FluidOrbProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const themeCtx = useContext(ThemeContext)
  const reduced = usePrefersReducedMotion()
  const still = paused || reduced
  /** 拿不到 WebGL2 或编译失败时置位，改画一颗 CSS 静态球 */
  const [noGl, setNoGl] = useState(false)

  const palette = useMemo(() => resolveRimColors(colors), [colors])
  const ink =
    blend === 'ink' || (blend === 'auto' && (themeCtx?.resolvedTheme ?? 'dark') === 'light')

  const paramsRef = useRef({
    state,
    volume,
    getVolume,
    autoVolume,
    reactivity,
    animationSpeed,
    colorSpeed,
    glowIntensity,
    noiseScale,
    refraction,
    shellWidth,
    innerScale,
    coreIntensity,
    rimWidth,
    rimIntensity,
    glints,
    halo,
    wobble,
    hoverTilt,
    resolution,
  })
  const paletteRef = useRef(palette)
  const inkRef = useRef(ink)
  const pointerRef = useRef({ tx: 0, ty: 0 })
  const squishRef = useRef<SquishState>(createSquishState())
  const renderOnceRef = useRef<(() => void) | null>(null)
  const tapRef = useRef<((angle: number, strength: number) => void) | null>(null)

  useImperativeHandle(ref, (): FluidOrbHandle => ({
    tap: (angle = -90, strength = 0.65) => tapRef.current?.(angle, strength),
  }))

  // 声明在 setup effect 之前：挂载时先把最新值灌进 ref，再建上下文。
  // 之后每次渲染只走这里；静止模式没有 rAF 循环替我们读新值，所以顺手补画一帧。
  useEffect(() => {
    paramsRef.current = {
      state,
      volume,
      getVolume,
      autoVolume,
      reactivity,
      animationSpeed,
      colorSpeed,
      glowIntensity,
      noiseScale,
      refraction,
      shellWidth,
      innerScale,
      coreIntensity,
      rimWidth,
      rimIntensity,
      glints,
      halo,
      wobble,
      hoverTilt,
      resolution,
    }
    paletteRef.current = palette
    inkRef.current = ink
    if (still) {
      renderOnceRef.current?.()
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const renderer = createOrbRenderer(canvas)
    if (renderer === null) {
      setNoGl(true)
      return
    }

    const start = performance.now()
    const clock = { last: start }
    const smooth = {
      motion: 0,
      colorPhase: 0,
      level: 0,
      tiltX: 0,
      tiltY: 0,
      rim: 1,
      halo: 1,
      colorMul: 1,
      corePulse: 0,
      swell: 0,
    }
    let onScreen = true
    let frame = 0

    const render = (now: number, dt: number) => {
      const p = paramsRef.current
      renderer.resize(p.resolution)
      // dt<=0 是静止补画：没有过渡余地，目标值一步到位，否则停帧会卡在过渡中途
      const follow = (current: number, target: number, rate: number) =>
        dt > 0 ? approach(current, target, rate, dt) : target

      const targets = orbStateTargets(p.state)
      smooth.rim = follow(smooth.rim, targets.rim, 5)
      smooth.halo = follow(smooth.halo, targets.halo, 5)
      smooth.colorMul = follow(smooth.colorMul, targets.colorSpeed, 2.5)
      smooth.corePulse = follow(smooth.corePulse, targets.corePulse, 4)
      smooth.swell = follow(smooth.swell, targets.swell, 6)

      const speed = safe(p.animationSpeed, 0, 4)
      smooth.motion += dt * speed
      smooth.colorPhase +=
        (dt * speed * safe(p.colorSpeed, 0, 6) * smooth.colorMul) / RIM_CYCLE_SECONDS

      const level = resolveLevel({
        volume: p.volume,
        sampled: p.getVolume?.(),
        autoVolume: p.autoVolume,
        state: p.state,
        time: (now - start) / 1000,
      })
      smooth.level = follow(smooth.level, level, 14)

      smooth.tiltX = follow(smooth.tiltX, pointerRef.current.tx, 7)
      smooth.tiltY = follow(smooth.tiltY, pointerRef.current.ty, 7)

      if (dt > 0) {
        squishRef.current = stepSquish(squishRef.current, dt)
      }
      const squish = squishRef.current

      renderer.uniformColors(paletteRef.current.rgb, paletteRef.current.count)
      renderer.uniform1f('uSpan', ORB_CANVAS_PAD)
      renderer.uniform1f('uInk', inkRef.current ? 1 : 0)
      renderer.uniform1f('uMotion', smooth.motion)
      renderer.uniform1f('uColorPhase', smooth.colorPhase)
      renderer.uniform1f('uClock', (now - start) / 1000)
      renderer.uniform1f('uGlow', safe(p.glowIntensity, 0, 3))
      renderer.uniform1f('uNoiseScale', safe(p.noiseScale, 0.2, 12))
      renderer.uniform1f('uRefraction', safe(p.refraction, 0, 2.5))
      renderer.uniform1f('uShell', safe(p.shellWidth, 0.1, 3))
      renderer.uniform1f('uInnerScale', safe(p.innerScale, 0.1, 4))
      renderer.uniform1f('uCoreIntensity', safe(p.coreIntensity, 0, 4))
      renderer.uniform1f('uRimWidth', safe(p.rimWidth, 0.1, 6))
      renderer.uniform1f('uRimIntensity', safe(p.rimIntensity, 0, 4))
      renderer.uniform1f('uGlints', safe(p.glints, 0, 4))
      renderer.uniform1f('uHalo', safe(p.halo, 0, 4))
      renderer.uniform1f('uWobble', safe(p.wobble, 0, 2))
      renderer.uniform2f('uTilt', smooth.tiltX, smooth.tiltY)
      renderer.uniform1f('uHoverTilt', safe(p.hoverTilt, 0, 2))
      renderer.uniform1f('uLevel', smooth.level)
      renderer.uniform1f('uReactivity', safe(p.reactivity, 0, 3))
      renderer.uniform1f('uRimBoost', smooth.rim)
      renderer.uniform1f('uHaloBoost', smooth.halo)
      renderer.uniform1f('uCorePulse', smooth.corePulse)
      renderer.uniform1f('uSwell', smooth.swell)
      renderer.uniform3f('uSquish', squish.amount, squish.mode2, squish.mode3)
      renderer.uniform1f('uSquishAngle', squish.angle)

      renderer.clear()
      renderer.draw()
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - clock.last) / 1000)
      clock.last = now
      render(now, dt)
      frame = requestAnimationFrame(loop)
    }

    const startLoop = () => {
      if (frame === 0 && !still && onScreen && !document.hidden) {
        clock.last = performance.now()
        frame = requestAnimationFrame(loop)
      }
    }
    const stopLoop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }

    renderOnceRef.current = () => render(performance.now(), 0)
    tapRef.current = (angle, strength) => {
      squishRef.current = applyTap(squishRef.current, angle, strength)
      if (still) {
        renderOnceRef.current?.()
      }
    }

    if (still) {
      render(performance.now(), 0)
    } else {
      startLoop()
    }

    // 滚出视口与切到后台都停 rAF：悬浮球常驻页面，不该在没人看的时候继续烧电
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true
      if (onScreen) {
        startLoop()
      } else {
        stopLoop()
      }
    })
    observer.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        stopLoop()
      } else {
        startLoop()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const resizer = new ResizeObserver(() => {
      if (still) {
        render(performance.now(), 0)
      }
    })
    if (rootRef.current !== null) {
      resizer.observe(rootRef.current)
    }

    return () => {
      stopLoop()
      observer.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      renderOnceRef.current = null
      tapRef.current = null
      renderer.dispose()
    }
  }, [still])

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current.tx = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1)
    pointerRef.current.ty = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1)
    if (still) {
      renderOnceRef.current?.()
    }
  }

  const handlePointerLeave = () => {
    pointerRef.current.tx = 0
    pointerRef.current.ty = 0
    if (still) {
      renderOnceRef.current?.()
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    // 屏幕 y 轴向下，atan2 出来即「顺时针为正」，与着色器里翻过的 p.y 同一套方向
    tapRef.current?.((Math.atan2(dy, dx) * 180) / Math.PI, 0.7)
  }

  const canvasSide = size * ORB_CANVAS_PAD
  const fallbackColor =
    (colors ?? []).map(parseHexColor).find((c): c is LinearRGB => c !== null) ??
    parseHexColor(FALLBACK_COLORS[0]) ??
    ([0.9, 0.2, 0.5] as LinearRGB)

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size, ...style }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
    >
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={intro && !reduced ? { opacity: 0, scale: 0.86 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', duration: 0.72, bounce: 0.34 }}
      >
        {noGl ? (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: canvasSide,
              height: canvasSide,
              background: `radial-gradient(circle, transparent 30%, ${toCssColor(fallbackColor, 0.5)} 35%, transparent 48%)`,
            }}
          />
        ) : (
          // 必须用 translate 居中：inset-0 + m-auto 在画布比盒子宽时属于超约束，
          // CSS 会把 auto 边距算成 0 并退化成左对齐，整颗球会往右偏半格
          <canvas
            ref={canvasRef}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: canvasSide, height: canvasSide }}
          />
        )}
        {eyes ? (
          // 眼睛铺在球体本身（size 见方）上，不跟着 canvas 外扩的那圈光晕走。
          // text-foreground 让 currentColor 在暗底取近白、亮底取近黑。
          <OrbEyes
            size={size}
            mood={mood}
            eyeHoldMs={eyeHoldMs}
            eyeBlinkMs={eyeBlinkMs}
            still={still}
            anchorRef={rootRef}
            className="text-foreground"
          />
        ) : null}
      </motion.div>
    </div>
  )
}

export type { FluidOrbHandle, FluidOrbProps, OrbBlend, OrbState } from './types'
export type { OrbEyeMood } from './orb-eye-states'
