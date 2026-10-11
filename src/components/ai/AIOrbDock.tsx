import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { clamp } from '@/components/fluid-orb/orb-physics'
import { FluidOrb } from '@/components/fluid-orb/FluidOrb'
import { ORB_CANVAS_PAD } from '@/components/fluid-orb/orb-shader'
import { createMoodCycler, tapMood } from '@/components/fluid-orb/orb-mood'
import type { OrbEyeMood } from '@/components/fluid-orb/orb-eye-states'
import { aiOrbConfig } from '@/config/ai-orb'
import { useIsMobile } from '@/composable/use-breakpoint'
import { cn } from '@/lib/utils'

type Spot = { x: number; y: number }

/** 按下与抬起之间移动超过这个距离，就当作拖拽而不是点击 */
const TAP_SLOP_PX = 6

/**
 * 把球盒左上角夹进视口。只保证球体本身可见——外扩给 halo 的那圈允许在贴边时出血，
 * 把它也算进去会让球在边缘留下一条拖不到的死区。
 */
function clampToViewport(spot: Spot, size: number): Spot {
  return {
    x: clamp(spot.x, 0, Math.max(0, window.innerWidth - size)),
    y: clamp(spot.y, 0, Math.max(0, window.innerHeight - size)),
  }
}

/**
 * AI 悬浮入口。
 *
 * 只由 `aiOrbConfig.enabled` 这一个代码级 kill switch 决定挂不挂。刻意**不**再叠
 * `toolbox.ai` 的用户总开关：那颗开关守的是「内容要不要发往你配置的服务商」（§12），
 * 而这颗球今天不发任何请求，把它一起关掉只会让装饰效果连带消失，起不到告知作用。
 * 等球真的接上 AI 动作，把那道门加回来。
 *
 * 可以用指针拖到页面任意位置。没拖过时走 CSS 的「右侧垂直居中」，拖过之后才改用
 * 显式坐标——这样首帧不读 window，服务端预渲染与 hydration 的 DOM 也保持一致。
 *
 * 点击换表情：按下→抬起之间没位移过才算「点」（拖拽不算），每点一次轮换到下一个情绪；
 * 短时间内连着点会累积烦躁，够次数就翻成 angry 并锁一阵，期间再点只续期不换表情。
 * 规则在 `orb-mood.ts` 里，是纯函数，可测。
 *
 * 不做 `button` 语义也不给 aria-label：换表情是个玩法，不是能抵达的操作，
 * 读屏软件不该被告知这里有个按钮。
 */
export function AIOrbDock() {
  const mobile = useIsMobile()
  const [spot, setSpot] = useState<Spot | null>(null)
  const [mood, setMood] = useState<OrbEyeMood>(aiOrbConfig.orb.mood ?? 'idle')
  const grab = useRef<{ dx: number; dy: number } | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const cycler = useRef(createMoodCycler())

  const { side } = aiOrbConfig.dock
  const size = mobile ? aiOrbConfig.dock.mobileSize : aiOrbConfig.dock.size
  // 画布比球体外扩一圈给 halo 用，贴边放时这部分会被视口裁掉，所以让位量按实际溢出算
  const bleed = (size * (ORB_CANVAS_PAD - 1)) / 2

  // 窗口缩小或换断点时把已经拖出去的球夹回视口，否则可能再也够不着
  useEffect(() => {
    const keepInside = () =>
      setSpot((current) => (current === null ? current : clampToViewport(current, size)))
    window.addEventListener('resize', keepInside)
    return () => window.removeEventListener('resize', keepInside)
  }, [size])

  if (!aiOrbConfig.enabled) {
    return null
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    grab.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    press.current = { x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const offset = grab.current
    if (offset === null) {
      return
    }
    const press0 = press.current
    if (
      press0 !== null &&
      Math.hypot(event.clientX - press0.x, event.clientY - press0.y) > TAP_SLOP_PX
    ) {
      press0.moved = true
    }
    setSpot(clampToViewport({ x: event.clientX - offset.dx, y: event.clientY - offset.dy }, size))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (grab.current === null) {
      return
    }
    grab.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // 没位移过才算「点」，拖一下不该顺手换表情
    const press0 = press.current
    press.current = null
    if (press0 !== null && !press0.moved) {
      const cycled = tapMood(cycler.current, event.timeStamp)
      cycler.current = cycled.next
      setMood(cycled.mood)
    }
  }

  const docked = spot === null

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-30',
        // 没拖过时挂整条竖带，且它不吃指针：否则右侧一长条会挡住页面内容的点击
        docked && 'inset-y-0 right-0 flex items-center',
        docked && side === 'left' && 'right-auto left-0',
      )}
      style={
        docked
          ? side === 'right'
            ? { paddingInlineEnd: bleed }
            : { paddingInlineStart: bleed }
          : { left: spot.x, top: spot.y }
      }
    >
      <div
        className="pointer-events-auto cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <FluidOrb size={size} {...aiOrbConfig.orb} mood={mood} />
      </div>
    </div>
  )
}
