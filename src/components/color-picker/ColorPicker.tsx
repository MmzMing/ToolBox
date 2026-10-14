import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  AnimatePresence,
  Reorder,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react'
import type { Transition } from 'motion/react'
import { Check, Pipette, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { motionTokens, springOf } from '@/lib/motion-tokens'
import { cn } from '@/lib/utils'
import {
  COLOR_FORMATS,
  contrastRatio,
  formatColor,
  hsvToRgb,
  parseColor,
  toCssRgb,
  toHex,
  wcagLevel,
} from '@/utils/color'
import type { ColorFormat, Hsva, Rgba } from '@/utils/color'

/** 收藏色板里的一条。id 是拖拽排序的稳定 key，颜色本身允许重复 */
export type ColorSwatch = { id: string; color: string }

export type ColorPickerProps = {
  /** 受控值：hex / rgb() / hsl() / oklch() 都收 */
  value?: string
  /** 非受控时的初值 */
  defaultValue?: string
  /** 回写十六进制：不透明 6 位，`showAlpha` 开着且半透明时 8 位 */
  onValueChange?: (hex: string) => void
  /** 这个颜色将要落在的底色，只影响对比度读数；省略时读 `--background` 令牌 */
  background?: string
  /** 触发器上显示的名字，同时是可访问名 */
  label?: string
  /** 窄栏放不下名字与十六进制时只留色块 */
  compact?: boolean
  /** 站点存不下 alpha（GIF 底色、JPG 填充色那类）时关掉透明度滑条 */
  showAlpha?: boolean
  swatches?: ColorSwatch[]
  defaultSwatches?: ColorSwatch[]
  onSwatchesChange?: (swatches: ColorSwatch[]) => void
  /** 收藏上限，超出淘汰最早那条 */
  maxSwatches?: number
  defaultFormat?: ColorFormat
  disabled?: boolean
  className?: string
}

const { blur, duration, ease } = motionTokens
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const round2 = (value: number) => Math.round(value * 100) / 100

/** 游标追指针：短弹簧带一点回弹，点选时软软落位，拖动时只慢半拍 */
const THUMB = springOf(0.26, 0.22)
/** 手指按住时游标必须钉在指针上：零回弹的硬弹簧，否则看得见拖尾抖动 */
const DRAG = springOf(duration.quick, 0)
const OPEN = motionTokens.spring.morph
const CLOSE = springOf(0.3, 0)
const INSTANT: Transition = { duration: 0 }
/** 手输非法时的抖动，与 morph 覆盖层的收尾时长都是"看一眼就懂"的量级 */
const SHAKE = { duration: 0.32, ease: [...ease.standard] } as const
const MORPH_LIFETIME = 620

const PANEL_WIDTH = 300
/** 触发器与面板共用一个圆角基数，展开过程从 10px 长到 14px */
const CLOSED_RADIUS = 10
const OPEN_RADIUS = 14
const FORMAT_LABEL: Record<ColorFormat, string> = {
  hex: 'Hex',
  rgb: 'RGB',
  hsl: 'HSL',
  oklch: 'OKLCH',
}

type Anchor = 'tl' | 'tr' | 'bl' | 'br'
type EyeDropper = { open: () => Promise<{ sRGBHex: string }> }

const subscribeRootClass = (notify: () => void) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** 主题令牌本身就是 `oklch()` 串，parseColor 认得，所以底色能直接从 CSS 变量里读 */
function useRootToken(name: string, active: boolean) {
  return useSyncExternalStore(
    subscribeRootClass,
    () => (active ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : ''),
    () => '',
  )
}

/** 把目标值弹簧过去，减弱动效时直接跳。改目标会接住当前速度，不会瞬移 */
function useFollow(target: number, reduced: boolean, dragging = false) {
  const value = useMotionValue(target)
  useEffect(() => {
    if (reduced) {
      value.jump(target)
      return
    }
    const controls = animate(value, target, dragging ? DRAG : THUMB)
    return () => controls.stop()
  }, [dragging, reduced, target, value])
  return value
}

/** 记录指针在元素盒子里的位置，按 0–1 分数回报 */
function usePad(onMove: (x: number, y: number) => void, onActive: (active: boolean) => void) {
  const pointer = useRef<number | null>(null)
  const read = (event: ReactPointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    onMove(
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    )
  }
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || pointer.current !== null) return
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      onActive(true)
      read(event)
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerId === pointer.current) read(event)
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerId !== pointer.current) return
      pointer.current = null
      onActive(false)
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      if (event.pointerId !== pointer.current) return
      pointer.current = null
      onActive(false)
    },
  }
}

/** 方向键走 1 档，Shift 与 PageUp / PageDown 走 10 档，Home / End 到端点 */
function stepFor(event: ReactKeyboardEvent, axis: 'x' | 'y' | 'both'): [number, number] | null {
  const big = event.shiftKey || event.key.startsWith('Page')
  const size = big ? 10 : 1
  const map: Record<string, [number, number]> = {
    ArrowRight: [size, 0],
    ArrowLeft: [-size, 0],
    ArrowUp: axis === 'both' ? [0, size] : [size, 0],
    ArrowDown: axis === 'both' ? [0, -size] : [-size, 0],
    PageUp: [10, 0],
    PageDown: [-10, 0],
  }
  return map[event.key] ?? null
}

type SliderProps = {
  label: string
  valueText: string
  value: number
  max: number
  unit: number
  onChange: (value: number) => void
  onActive: (active: boolean) => void
  active: boolean
  reduced: boolean
  fill: string
  className?: string
  style?: CSSProperties
}

function Slider({
  label,
  valueText,
  value,
  max,
  unit,
  onChange,
  onActive,
  active,
  reduced,
  fill,
  className,
  style,
}: SliderProps) {
  const x = useFollow(value / max, reduced, active)
  const left = useTransform(x, (v) => `${v * 100}%`)
  const pad = usePad((fx) => onChange(fx * max), onActive)
  return (
    <div className={cn('relative h-4 touch-none rounded-full', className)} style={style} {...pad}>
      <motion.div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        aria-valuetext={valueText}
        data-active={active || undefined}
        className={cn(
          'border-background ring-overlay/30 absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm ring-1 transition-transform',
          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
          active && 'scale-110',
        )}
        style={{ left, background: fill }}
        onKeyDown={(event) => {
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            onChange(event.key === 'Home' ? 0 : max)
            return
          }
          const step = stepFor(event, 'x')
          if (!step) return
          event.preventDefault()
          onChange(clamp(value + step[0] * unit, 0, max))
        }}
      />
    </div>
  )
}

/** 色块：内圈是真实颜色，外圈一圈描边让纯白与纯黑也分得出来 */
function Chip({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn(
        'ring-border inline-block size-4 shrink-0 rounded-full ring-1 ring-inset',
        className,
      )}
    >
      <span className="size-full rounded-full" style={{ background: color }} />
    </span>
  )
}

/** 逐字错峰落位的文本替换。调用方换 `key` 才会重放，同位置复用组件不会重跑 initial */
function MorphText({ text }: { text: string }) {
  const reduced = usePrefersReducedMotion()
  return (
    <span className="inline-flex">
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          initial={
            reduced ? { opacity: 0 } : { opacity: 0, y: '0.4em', filter: `blur(${blur.subtle}px)` }
          }
          animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
          transition={
            reduced
              ? INSTANT
              : { duration: duration.base, ease: [...ease.enter], delay: index * 0.02 }
          }
        >
          {char}
        </motion.span>
      ))}
    </span>
  )
}

let swatchSeed = 0
const newSwatchId = () => `swatch-${Date.now().toString(36)}-${swatchSeed++}`

/**
 * 一颗色块长成全尺寸取色面板。
 *
 * 面板不浮在触发器旁边，而是**盖在触发器原位**由 clip-path 从色块的盒子长开：
 * 两者共用同一个锚角，所以展开是同一块东西在变形，而不是两个元素接力。
 * 锚角按剩余空间在四角里挑，窄栏与页面底部都不该被视口裁掉。
 *
 * 支持 hex / rgb / hsl / oklch 手输与四格式互切、吸管（浏览器支持时才出现）、
 * 收藏色板（拖拽排序、Alt + 方向键移动、Delete 删除）、以及相对底色的对比度读数。
 * 全程键盘可达，Escape 关闭并把焦点还给触发器。
 */
export function ColorPicker({
  value,
  defaultValue = '#2F6BFF',
  onValueChange,
  background,
  label,
  compact = false,
  showAlpha = true,
  swatches: swatchesProp,
  defaultSwatches,
  onSwatchesChange,
  maxSwatches = 7,
  defaultFormat = 'hex',
  disabled = false,
  className,
}: ColorPickerProps) {
  const { t } = useTranslation('common')
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const reduced = usePrefersReducedMotion()
  const name = label ?? t('colorPicker.defaultLabel')
  const canPick = useSyncExternalStore(
    () => () => {},
    () => 'EyeDropper' in window,
    () => false,
  )

  const [hsva, setHsva] = useState<Hsva>(
    () => parseColor(value ?? defaultValue) ?? { h: 222, s: 0.8, v: 1, a: 1 },
  )
  const [synced, setSynced] = useState(value)
  if (value !== undefined && value !== synced) {
    setSynced(value)
    if (value.toUpperCase() !== toHex(hsva)) {
      const next = parseColor(value, hsva.h)
      if (next) setHsva(showAlpha ? next : { ...next, a: 1 })
    }
  }
  const [ownSwatches, setOwnSwatches] = useState<ColorSwatch[]>(defaultSwatches ?? [])
  const swatches = swatchesProp ?? ownSwatches
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [kind, setKind] = useState<ColorFormat>(defaultFormat)
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [active, setActive] = useState<'area' | 'hue' | 'alpha' | null>(null)
  const [focusSwatch, setFocusSwatch] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Anchor>('tl')
  const [morph, setMorph] = useState<{ id: number; from: string; to: string; phase: 0 | 1 } | null>(
    null,
  )

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const areaThumb = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const swatchRefs = useRef(new Map<string, HTMLButtonElement>())
  const dragged = useRef(false)
  const fieldX = useMotionValue(0)
  /** 关闭动画跑完时再读一次：中途又被点开就不该把面板卸载 */
  const openNow = useRef(false)

  const hex = toHex(hsva)
  const rgb = hsvToRgb(hsva)
  const css = toCssRgb(rgb)
  const opaque = toCssRgb({ ...rgb, a: 1 })
  const pure = `hsl(${hsva.h} 100% 50%)`
  const tokenBackground = useRootToken('--background', background === undefined && shown)
  const bgHsv = parseColor(background ?? tokenBackground ?? '')
  const bgRgb: Rgba = bgHsv ? hsvToRgb(bgHsv) : { r: 1, g: 1, b: 1, a: 1 }
  const ratio = contrastRatio(rgb, bgRgb)
  const text = formatColor(hsva, kind)

  function commit(next: Hsva) {
    const settled = showAlpha ? next : { ...next, a: 1 }
    setHsva(settled)
    const nextHex = toHex(settled)
    if (nextHex !== hex) onValueChange?.(nextHex)
  }
  function setSwatches(next: ColorSwatch[]) {
    if (!swatchesProp) setOwnSwatches(next)
    onSwatchesChange?.(next)
  }

  /* 展开：一个 progress 把色块的盒子推成面板的盒子，内容在前缘之后淡入 */
  const progress = useMotionValue(0)
  const fade = useMotionValue(0)
  const size = {
    W: useMotionValue(PANEL_WIDTH),
    H: useMotionValue(360),
    w: useMotionValue(160),
    h: useMotionValue(32),
  }
  const clipPath = useTransform(() => {
    const q = clamp(progress.get())
    const dx = `${round2((size.W.get() - size.w.get()) * (1 - q))}px`
    const dy = `${round2((size.H.get() - size.h.get()) * (1 - q))}px`
    const zero = '0px'
    const sides: [string, string, string, string] =
      anchor === 'tl'
        ? [zero, dx, dy, zero]
        : anchor === 'tr'
          ? [zero, zero, dy, dx]
          : anchor === 'bl'
            ? [dy, dx, zero, zero]
            : [dy, zero, zero, dx]
    const radius = round2(CLOSED_RADIUS + (OPEN_RADIUS - CLOSED_RADIUS) * q)
    return `inset(${sides.join(' ')} round ${radius}px)`
  })
  const contentOpacity = useTransform(progress, [0.35, 0.9], [0, 1])
  const contentY = useTransform(progress, [0, 1], [-10, 0])

  useLayoutEffect(() => {
    if (!shown) return
    const panel = panelRef.current
    const trigger = triggerRef.current
    if (!panel || !trigger) return
    const measure = () => {
      size.W.set(panel.offsetWidth)
      size.H.set(panel.offsetHeight)
      size.w.set(trigger.offsetWidth)
      size.h.set(trigger.offsetHeight)
      // 锚角挑剩余空间最大的那个角：面板从触发器原位长开，越出视口就会被裁掉
      const box = trigger.getBoundingClientRect()
      const flipUp = box.top > window.innerHeight - box.bottom
      const flipLeft = box.right < window.innerWidth - box.left
      setAnchor(flipUp ? (flipLeft ? 'br' : 'bl') : flipLeft ? 'tr' : 'tl')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [shown, size.H, size.W, size.h, size.w])

  useEffect(() => {
    if (!shown) return
    if (reduced) {
      progress.jump(open ? 1 : progress.get())
      const controls = animate(fade, open ? 1 : 0, {
        duration: duration.base,
        ease: [...ease.standard],
      })
      void controls.then(() => {
        if (!openNow.current) {
          progress.jump(0)
          setShown(false)
        }
      })
      return () => controls.stop()
    }
    fade.jump(1)
    const controls = animate(progress, open ? 1 : 0, open ? OPEN : CLOSE)
    void controls.then(() => {
      if (!openNow.current) setShown(false)
    })
    return () => controls.stop()
  }, [fade, open, progress, reduced, shown])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => areaThumb.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [open])

  function show() {
    openNow.current = true
    setShown(true)
    setOpen(true)
  }
  function hide(returnFocus = true) {
    openNow.current = false
    setOpen(false)
    setDraft(null)
    setInvalid(false)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  const dismiss = useEffectEvent((event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Escape') return
      hide(Boolean(rootRef.current?.contains(document.activeElement)))
      return
    }
    if (!rootRef.current?.contains(event.target as Node)) hide(false)
  })
  useEffect(() => {
    if (!open) return
    const listener = (event: Event) => dismiss(event)
    document.addEventListener('pointerdown', listener, true)
    document.addEventListener('keydown', listener)
    return () => {
      document.removeEventListener('pointerdown', listener, true)
      document.removeEventListener('keydown', listener)
    }
  }, [open])

  /* 饱和度 / 明度二维区 */
  const areaX = useFollow(hsva.s, reduced, active === 'area')
  const areaY = useFollow(1 - hsva.v, reduced, active === 'area')
  const areaLeft = useTransform(areaX, (v) => `${v * 100}%`)
  const areaTop = useTransform(areaY, (v) => `${v * 100}%`)
  const areaPad = usePad(
    (x, y) => commit({ ...hsva, s: x, v: 1 - y }),
    (on) => setActive(on ? 'area' : null),
  )

  /* 格式 morph：新串先以旧串挂载，再逐字换成新串，期间盖住实时输入框 */
  useEffect(() => {
    if (!morph || morph.phase === 1) return
    const frame = requestAnimationFrame(() =>
      setMorph((current) =>
        current && current.id === morph.id ? { ...current, phase: 1 } : current,
      ),
    )
    return () => cancelAnimationFrame(frame)
  }, [morph])
  useEffect(() => {
    if (!morph || morph.phase === 0) return
    const timer = window.setTimeout(
      () => setMorph((current) => (current?.id === morph.id ? null : current)),
      MORPH_LIFETIME,
    )
    return () => window.clearTimeout(timer)
  }, [morph])

  function cycleFormat() {
    const next = COLOR_FORMATS[(COLOR_FORMATS.indexOf(kind) + 1) % COLOR_FORMATS.length]
    setKind(next)
    setDraft(null)
    setInvalid(false)
    if (!reduced) setMorph({ id: Date.now(), from: text, to: formatColor(hsva, next), phase: 0 })
  }

  function submitDraft() {
    if (draft === null) return true
    const next = parseColor(draft, hsva.h)
    if (!next) {
      setInvalid(true)
      if (!reduced) animate(fieldX, [0, -5, 4, -2, 0], SHAKE)
      return false
    }
    commit(next)
    setDraft(null)
    setInvalid(false)
    return true
  }

  function pickFromScreen() {
    if (!canPick) return
    const Ctor = (window as unknown as { EyeDropper: new () => EyeDropper }).EyeDropper
    new Ctor()
      .open()
      .then((result) => {
        const next = parseColor(result.sRGBHex, hsva.h)
        if (next) commit({ ...next, a: hsva.a })
      })
      .catch(() => {
        /* 用户在吸管里按了 Esc，不是错误 */
      })
  }

  function saveSwatch() {
    const entry = { id: newSwatchId(), color: hex }
    setSwatches([entry, ...swatches].slice(0, maxSwatches))
    setFocusSwatch(entry.id)
  }

  function onSwatchKey(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const item = swatches[index]
    if (!item) return
    const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const next = swatches.filter((entry) => entry.id !== item.id)
      setSwatches(next)
      const neighbor = next[Math.min(index, next.length - 1)]
      setFocusSwatch(neighbor?.id ?? null)
      requestAnimationFrame(() =>
        neighbor
          ? swatchRefs.current.get(neighbor.id)?.focus({ preventScroll: true })
          : inputRef.current?.focus({ preventScroll: true }),
      )
      return
    }
    if (!move && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (move && event.altKey) {
      const to = index + move
      if (to < 0 || to >= swatches.length) return
      const next = [...swatches]
      next.splice(index, 1)
      next.splice(to, 0, item)
      setSwatches(next)
      requestAnimationFrame(() => swatchRefs.current.get(item.id)?.focus({ preventScroll: true }))
      return
    }
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? swatches.length - 1
          : (index + move + swatches.length) % swatches.length
    const landed = swatches[target]
    if (!landed) return
    setFocusSwatch(landed.id)
    swatchRefs.current.get(landed.id)?.focus({ preventScroll: true })
  }

  const ratioValue = useFollow(ratio, reduced)
  const ratioText = useTransform(ratioValue, (v) => v.toFixed(2))
  const grade = wcagLevel(ratio)
  const gradeLabel = t(`colorPicker.level.${grade}`)
  const hidden = reduced
    ? { opacity: 0 }
    : { opacity: 0, y: '0.3em', filter: `blur(${blur.subtle}px)` }
  const swatchTab = swatches.some((entry) => entry.id === focusSwatch)
    ? focusSwatch
    : swatches[0]?.id

  return (
    <div ref={rootRef} className={cn('relative inline-flex min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${uid}-panel` : undefined}
        className={cn(
          'border-input bg-background hover:border-primary/60 flex h-8 min-w-0 items-center gap-2 rounded-[10px] border px-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-50',
          compact ? 'w-full justify-center px-1.5' : 'w-full',
        )}
        onClick={() => (open ? hide() : show())}
      >
        <Chip color={css} />
        {compact ? (
          <span className="sr-only">{`${name} ${hex}`}</span>
        ) : (
          <>
            <span className="truncate">{name}</span>
            <span className="text-muted-foreground ml-auto shrink-0 font-mono tabular-nums">
              {hex}
            </span>
          </>
        )}
      </button>

      {shown && (
        <div
          className={cn(
            'absolute z-50',
            anchor === 'tl' && 'top-0 left-0',
            anchor === 'tr' && 'top-0 right-0',
            anchor === 'bl' && 'bottom-0 left-0',
            anchor === 'br' && 'right-0 bottom-0',
          )}
          data-open={open || undefined}
        >
          <motion.div
            ref={panelRef}
            id={`${uid}-panel`}
            role="dialog"
            aria-label={`${name} · ${t('colorPicker.dialogSuffix')}`}
            inert={!open}
            className="bg-popover text-popover-foreground border-border w-[300px] rounded-[14px] border p-3 shadow-lg"
            style={{ clipPath, opacity: fade }}
          >
            <div className="mb-2 flex items-center gap-2 text-xs">
              <Chip color={css} />
              <span className="truncate">{name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">{hex}</span>
              <motion.span
                className="ml-auto flex shrink-0 items-center gap-1"
                style={{ opacity: contentOpacity }}
              >
                {canPick && (
                  <button
                    type="button"
                    aria-label={t('colorPicker.pickFromScreen')}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1 transition-colors"
                    onClick={pickFromScreen}
                  >
                    <Pipette size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t('colorPicker.done')}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1 transition-colors"
                  onClick={() => hide()}
                >
                  <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </motion.span>
            </div>

            <motion.div
              className="flex flex-col gap-2"
              style={{ opacity: contentOpacity, y: contentY }}
            >
              <div
                className={cn(
                  'relative h-[140px] touch-none rounded-lg',
                  active === 'area' && 'ring-primary/40 ring-2',
                )}
                style={{
                  /* 这两条渐变是色彩空间本身（黑→透明、白→纯色），不是主题 chrome，故不取令牌 */
                  backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`,
                }}
                {...areaPad}
              >
                <motion.div
                  ref={areaThumb}
                  role="slider"
                  tabIndex={0}
                  aria-roledescription={t('colorPicker.areaRoledescription')}
                  aria-label={t('colorPicker.saturationBrightness')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(hsva.s * 100)}
                  aria-valuetext={t('colorPicker.saturationBrightnessValue', {
                    s: Math.round(hsva.s * 100),
                    v: Math.round(hsva.v * 100),
                  })}
                  className="border-overlay-foreground ring-overlay/30 focus-visible:border-primary absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow ring-1 focus-visible:outline-none"
                  style={{ left: areaLeft, top: areaTop }}
                  onKeyDown={(event) => {
                    const step = stepFor(event, 'both')
                    if (!step) return
                    event.preventDefault()
                    commit({
                      ...hsva,
                      s: clamp(hsva.s + step[0] / 100),
                      v: clamp(hsva.v + step[1] / 100),
                    })
                  }}
                />
              </div>

              <Slider
                label={t('colorPicker.hue')}
                valueText={`${Math.round(hsva.h)}°`}
                value={hsva.h}
                max={360}
                unit={1}
                reduced={reduced}
                fill={pure}
                active={active === 'hue'}
                onActive={(on) => setActive(on ? 'hue' : null)}
                onChange={(h) => commit({ ...hsva, h: clamp(h, 0, 359.9) })}
                style={{
                  backgroundImage: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
                    .map((h) => `hsl(${h} 100% 50%)`)
                    .join(', ')})`,
                }}
              />
              {showAlpha && (
                <Slider
                  label={t('colorPicker.opacity')}
                  valueText={`${Math.round(hsva.a * 100)}%`}
                  value={hsva.a * 100}
                  max={100}
                  unit={1}
                  reduced={reduced}
                  fill={css}
                  active={active === 'alpha'}
                  onActive={(on) => setActive(on ? 'alpha' : null)}
                  onChange={(a) => commit({ ...hsva, a: clamp(a / 100) })}
                  className="checkerboard overflow-hidden"
                  style={{ backgroundImage: `linear-gradient(to right, transparent, ${opaque})` }}
                />
              )}

              <motion.div
                data-invalid={invalid || undefined}
                className={cn(
                  'border-input focus-within:border-primary flex h-8 items-stretch overflow-hidden rounded-lg border',
                  invalid && 'border-destructive',
                )}
                style={{ x: fieldX }}
              >
                <button
                  type="button"
                  className="bg-muted hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 border-r px-2 text-[11px] font-medium transition-colors"
                  onClick={cycleFormat}
                  aria-label={t('colorPicker.formatAria', { format: FORMAT_LABEL[kind] })}
                >
                  <MorphText key={kind} text={FORMAT_LABEL[kind]} />
                </button>
                <span className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    className="text-foreground placeholder:text-muted-foreground/70 size-full min-w-0 bg-transparent px-2 font-mono text-xs outline-none"
                    value={draft ?? text}
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={t('colorPicker.valueAria', {
                      label: name,
                      format: FORMAT_LABEL[kind],
                    })}
                    aria-invalid={invalid || undefined}
                    aria-describedby={`${uid}-error`}
                    onChange={(event) => {
                      setDraft(event.target.value)
                      setInvalid(false)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        if (submitDraft()) event.currentTarget.select()
                      }
                      if (event.key === 'Escape' && draft !== null) {
                        event.stopPropagation()
                        event.nativeEvent.stopImmediatePropagation()
                        setDraft(null)
                        setInvalid(false)
                      }
                    }}
                    onBlur={() => {
                      if (!submitDraft()) {
                        setDraft(null)
                        setInvalid(false)
                      }
                    }}
                  />
                  {morph && (
                    <span
                      aria-hidden="true"
                      className="bg-popover text-foreground pointer-events-none absolute inset-0 flex items-center px-2 font-mono text-xs"
                    >
                      <MorphText
                        key={morph.phase}
                        text={morph.phase === 0 ? morph.from : morph.to}
                      />
                    </span>
                  )}
                </span>
              </motion.div>
              <p
                id={`${uid}-error`}
                aria-live="polite"
                className="text-destructive h-4 text-[11px] leading-4"
              >
                {invalid ? t('colorPicker.invalid') : '\u00a0'}
              </p>

              <div className="bg-muted/50 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]">
                <span
                  aria-hidden="true"
                  className="text-base leading-none font-semibold"
                  style={{ color: css, background: toCssRgb(bgRgb) }}
                >
                  Aa
                </span>
                <span className="text-foreground shrink-0 font-mono tabular-nums">
                  <motion.span>{ratioText}</motion.span>:1
                </span>
                <span className="text-muted-foreground min-w-0 truncate">
                  {t('colorPicker.against')}
                </span>
                <span className="ml-auto shrink-0">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={grade}
                      initial={hidden}
                      animate={{ opacity: 1, y: '0em', filter: 'blur(0px)' }}
                      exit={{ ...hidden, transition: INSTANT }}
                      transition={
                        reduced ? INSTANT : { duration: duration.base, ease: [...ease.enter] }
                      }
                      className={cn(
                        'rounded-full px-1.5 py-0.5 font-medium',
                        grade === 'fail'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {gradeLabel}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="sr-only">
                  {t('colorPicker.contrastAria', { ratio: ratio.toFixed(2), level: gradeLabel })}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="border-input text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors"
                  onClick={saveSwatch}
                  aria-label={t('colorPicker.saveSwatch', { color: hex })}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <Reorder.Group
                  as="div"
                  axis="x"
                  values={swatches}
                  onReorder={setSwatches}
                  role="listbox"
                  aria-label={t('colorPicker.savedColors')}
                  aria-orientation="horizontal"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
                >
                  <AnimatePresence initial={false}>
                    {swatches.map((entry, index) => (
                      <Reorder.Item
                        key={entry.id}
                        value={entry}
                        as="div"
                        dragElastic={0.12}
                        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.4, transition: { duration: duration.quick } }
                        }
                        transition={reduced ? INSTANT : motionTokens.spring.snappy}
                        whileDrag={reduced ? undefined : { scale: 1.15, zIndex: 2 }}
                        onDragStart={() => {
                          dragged.current = true
                        }}
                        onDragEnd={() =>
                          requestAnimationFrame(() => {
                            dragged.current = false
                          })
                        }
                        className="relative"
                      >
                        <button
                          ref={(node) => {
                            if (node) swatchRefs.current.set(entry.id, node)
                            else swatchRefs.current.delete(entry.id)
                          }}
                          type="button"
                          role="option"
                          aria-selected={entry.color.toUpperCase() === hex}
                          aria-label={t('colorPicker.swatchAria', { color: entry.color })}
                          tabIndex={entry.id === swatchTab ? 0 : -1}
                          data-current={entry.color.toUpperCase() === hex || undefined}
                          className={cn(
                            'block size-6 rounded-md',
                            entry.color.toUpperCase() === hex
                              ? 'ring-primary ring-2'
                              : 'ring-border ring-1 hover:scale-110 hover:transition-transform',
                          )}
                          onFocus={() => setFocusSwatch(entry.id)}
                          onKeyDown={(event) => onSwatchKey(event, index)}
                          onClick={() => {
                            if (dragged.current) return
                            const next = parseColor(entry.color, hsva.h)
                            if (next) commit(next)
                          }}
                        >
                          <span
                            className="block size-full rounded-[5px]"
                            style={{ background: entry.color }}
                          />
                        </button>
                      </Reorder.Item>
                    ))}
                  </AnimatePresence>
                </Reorder.Group>
                {swatches.length === 0 && (
                  <span className="text-muted-foreground/70 text-[11px]">
                    {t('colorPicker.noSwatches')}
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
