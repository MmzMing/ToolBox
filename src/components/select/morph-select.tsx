import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import type { Variants } from 'motion/react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'
import { motionTokens, springOf } from '@/lib/motion-tokens'

export type MorphSelectOption = {
  value: string
  label: string
  /** 标签前的小标记，列表与触发器里都显示（厂商 mark、色块、自绘图标） */
  icon?: ReactNode
  /** 尾部短补充信息，如偏移量或计数 */
  meta?: string
  /** 搜索时额外命中本项的词 */
  keywords?: string
  disabled?: boolean
}

/** 带标题的一段选项 */
export type MorphSelectGroup = {
  label: string
  options: MorphSelectOption[]
}

export type MorphSelectItem = MorphSelectOption | MorphSelectGroup

export type MorphSelectProps = {
  /** 可见标签，同时是触发器与列表的可访问名 */
  label: string
  /** 标签只留给读屏：外层已经有 `<Label>` 时用 */
  hideLabel?: boolean
  /** 挂到触发器 button 上，让外层 `<Label htmlFor>` 能点热本控件 */
  triggerId?: string
  items: readonly MorphSelectItem[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string, option: MorphSelectOption) => void
  placeholder?: string
  /** 展开时把触发器换成搜索框；`auto` 在超过 8 项时开启 */
  searchable?: boolean | 'auto'
  /** 展开面的宽度下限（px）。默认 0：面板自己撑到最宽那一项，但仍不越出最近的可裁切祖先 */
  panelWidth?: number
  /** 列表滚动前的高度上限（px），可用空间不足时还会再收紧 */
  maxListHeight?: number
  /** 展开时保持不动的那条边 */
  align?: 'start' | 'end'
  /** 行高与字号档位：xs 给表格行里的超紧凑选择器用 */
  size?: 'xs' | 'sm' | 'default'
  disabled?: boolean
  className?: string
}

type Section = { key: string; label?: string; options: MorphSelectOption[] }
type Change = {
  key: number
  value: string | null
  dir: number
  fly: { x: number; y: number } | null
}
type Placement = 'below' | 'above'

type Bezier = [number, number, number, number]
/** 曲线与模糊量取自全站动效令牌：同一层级的浮层共用一套节奏，改一处就能整体对齐 */
const ENTER = [...motionTokens.ease.enter] as Bezier
const STANDARD = [...motionTokens.ease.standard] as Bezier
const { blur, duration } = motionTokens
/** 选项比面板成形晚半拍出现，免得它们在还没张开的面里挤成一团 */
const REVEAL_DELAY = 0.04

/** 时长换算成 stiffness/damping：中途改目标也接得住当前速度，比 duration 曲线稳 */
const GROW = springOf(duration.slow, 0.12)
const SHRINK = springOf(0.34, 0)
const GLIDE = springOf(0.28, 0.08)
const WIDTH = springOf(0.42, 0.16)
/** 变窄不许回弹：哪怕只短半个像素，标签就会被截成省略号、箭头被顶歪 */
const NARROW = springOf(0.42, 0)
/** 飞出的标签比面板收拢略快，闭合的那条边追不上它 */
const FLY = springOf(0.3, 0.06)

const GAP = 8
const MIN_LIST = 72
const TYPEAHEAD_RESET = 600
const PAGE = 8

const LID_SIZE = { default: 'h-8', sm: 'h-7', xs: 'h-6' } as const
const VALUE_TEXT = { default: 'text-sm', sm: 'text-xs', xs: 'text-[11px]' } as const
/** 一行的骨架：幽灵与 lid 共用同一套内边距与高度，宽度才对得齐 */
const SHELL = 'flex items-center gap-1.5 px-2.5 select-none'

const isGroup = (item: MorphSelectItem): item is MorphSelectGroup => 'options' in item

/** 分组之间的散项各自成一段，列表保持调用方给定的顺序 */
function normalize(items: readonly MorphSelectItem[]): Section[] {
  const out: Section[] = []
  items.forEach((item, index) => {
    if (isGroup(item)) {
      out.push({ key: `group-${index}`, label: item.label, options: item.options })
      return
    }
    const last = out[out.length - 1]
    if (last && !last.label) last.options.push(item)
    else out.push({ key: `loose-${index}`, options: [item] })
  })
  return out
}

function matches(option: MorphSelectOption, needle: string) {
  return `${option.label} ${option.meta ?? ''} ${option.keywords ?? ''}`
    .toLowerCase()
    .includes(needle)
}

/* 选中的标签像列表里的值一样滚动：靠后的从下方升起，靠前的从上方落下 */
const valueVariants: Variants = {
  enter: (change: Change) =>
    change.fly
      ? { opacity: 1, x: change.fly.x, y: change.fly.y, filter: 'blur(0px)' }
      : { opacity: 0, x: 0, y: `${change.dir * 0.5}em`, filter: `blur(${blur.soft}px)` },
  rest: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: (change: Change) => ({
    opacity: 0,
    x: 0,
    y: change.fly ? '-0.3em' : `${change.dir * -0.45}em`,
    filter: `blur(${blur.subtle}px)`,
    transition: { duration: duration.quick, ease: STANDARD },
  }),
}
const valueFade: Variants = {
  enter: { opacity: 0 },
  rest: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, transition: { duration: duration.quick } },
}

/** offsetWidth 会四舍五入，差半个像素就够把标签截断，所以一律向上取整 */
function triggerWidth(node: HTMLElement) {
  const exact = node.getBoundingClientRect().width
  const rounded = node.offsetWidth
  // 祖先被 scale 时 rect 一并被缩放，退回布局宽度再加一像素余量
  return Math.abs(exact - rounded) <= 0.5 ? Math.ceil(exact - 0.01) : rounded + 1
}

/**
 * 最近的可裁切祖先的可视矩形，与视口取交集。
 * `<main>` 是 overflow-y-auto（横向随之变成 auto）、Card 又带 overflow-hidden，
 * 而展开面贴在文档流里，只能按这个框决定往哪边长、能长多高、最宽多宽。
 */
function clipRect(from: HTMLElement) {
  let top = 0
  let bottom = window.innerHeight
  let left = 0
  let right = window.innerWidth
  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.body) {
    const style = getComputedStyle(el)
    if (/hidden|auto|scroll|clip/.test(`${style.overflowX} ${style.overflowY}`)) {
      const rect = el.getBoundingClientRect()
      top = Math.max(top, rect.top)
      bottom = Math.min(bottom, rect.bottom)
      left = Math.max(left, rect.left)
      right = Math.min(right, rect.right)
    }
    el = el.parentElement
  }
  return { top, bottom, left, right }
}

/**
 * 全局下拉：触发器本身就是列表。展开时把触发器这块面撑成选项面板，高亮在选项之间滑行，
 * 选中项的标签从列表里提出来落回触发器，面板同时弹到新宽度。
 * 支持分组、type-ahead、长列表搜索与完整 listbox 键盘模型。
 * 展开面在文档流内定位：空间不够会向上长，宽度不会越出最近的裁切容器。
 * 主要面向表单字段与工具条里的属性选择器；用户主要是自由输入的场合用 combobox。
 */
export function MorphSelect({
  label,
  hideLabel = false,
  triggerId,
  items,
  value,
  defaultValue = null,
  onValueChange,
  placeholder,
  searchable = 'auto',
  panelWidth = 0,
  maxListHeight = 296,
  align = 'start',
  size = 'default',
  disabled = false,
  className,
}: MorphSelectProps) {
  const { t } = useTranslation('common')
  const reduced = usePrefersReducedMotion()
  const uid = useId()
  const labelId = `${uid}-label`
  const listId = `${uid}-list`
  const optionId = (index: number) => `${uid}-option-${index}`

  const rootRef = useRef<HTMLDivElement>(null)
  const shapeRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const slotRef = useRef<HTMLSpanElement>(null)
  const optionRefs = useRef(new Map<string, HTMLElement>())

  const sections = useMemo(() => normalize(items), [items])
  const all = useMemo(() => sections.flatMap((section) => section.options), [sections])
  const indexOf = useMemo(() => new Map(all.map((option, index) => [option.value, index])), [all])
  const canSearch = searchable === 'auto' ? all.length > 8 : searchable

  const [inner, setInner] = useState<string | null>(defaultValue)
  const selected = value !== undefined ? value : inner
  const selectedOption =
    selected === null ? undefined : all.find((option) => option.value === selected)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [change, setChange] = useState<Change>({ key: 0, value: null, dir: 1, fly: null })
  const [placement, setPlacement] = useState<Placement>('below')
  const [listMax, setListMax] = useState(maxListHeight)

  const needle = query.trim().toLowerCase()
  const visibleSections = useMemo(
    () =>
      needle
        ? sections
            .map((section) => ({
              ...section,
              options: section.options.filter((option) => matches(option, needle)),
            }))
            .filter((section) => section.options.length)
        : sections,
    [needle, sections],
  )
  const enabled = useMemo(
    () =>
      visibleSections.flatMap((section) => section.options).filter((option) => !option.disabled),
    [visibleSections],
  )
  const current =
    active !== null && enabled.some((option) => option.value === active)
      ? active
      : (enabled[0]?.value ?? null)
  const resultCount = visibleSections.reduce((sum, section) => sum + section.options.length, 0)

  /* 一块面，宽高在触发器与列表之间弹；锚哪条边由 placement 决定 */
  const shapeW = useMotionValue<number | string>('100%')
  const shapeH = useMotionValue<number | string>('100%')
  const sizes = useRef({ trigger: 0, lid: 0, listW: 0, listH: 0, box: 0 })
  const live = useRef({ open: false, reduced: false, measured: false })
  useLayoutEffect(() => {
    live.current.reduced = reduced
  }, [reduced])

  /** 只读尺寸不动形状：开合那一帧要先把两面的新尺寸拿到手 */
  const measure = useCallback(() => {
    const node = measureRef.current
    const face = faceRef.current
    const list = listRef.current
    if (!node || !face || !list) return
    const previous = sizes.current
    sizes.current = {
      trigger: triggerWidth(node),
      lid: node.offsetHeight,
      // 内容的自然宽度只在收起时取。展开中形状还在弹簧路上，
      // 拿它当宽度目标会越弹越宽（自我放大）
      listW: live.current.open ? previous.listW : list.offsetWidth,
      listH: face.offsetHeight,
      box: rootRef.current?.parentElement?.clientWidth ?? 0,
    }
  }, [])

  const place = useCallback(
    (animated: boolean) => {
      const { trigger, lid, listW, listH } = sizes.current
      if (!trigger || !lid) return
      const shape = shapeRef.current
      let width = Math.max(trigger, listW, panelWidth)
      if (live.current.open && shape) {
        // 展开面不许越出最近的可裁切祖先，否则会在 <main> 里撑出横向滚动条
        const box = clipRect(shape)
        const rect = shape.getBoundingClientRect()
        const room = (align === 'start' ? box.right - rect.left : rect.right - box.left) - GAP
        width = Math.max(trigger, Math.min(width, trigger + Math.max(0, room)))
      }
      const next = live.current.open ? { w: width, h: lid + listH } : { w: trigger, h: lid }
      if (!animated || live.current.reduced || !live.current.measured) {
        shapeW.jump(next.w)
        shapeH.jump(next.h)
        live.current.measured = true
        return
      }
      const lastW = typeof shapeW.get() === 'number' ? (shapeW.get() as number) : next.w
      const lastH = typeof shapeH.get() === 'number' ? (shapeH.get() as number) : next.h
      const transition = next.w * next.h >= lastW * lastH ? GROW : SHRINK
      animate(shapeW, next.w, next.w < lastW ? NARROW : WIDTH)
      animate(shapeH, next.h, transition)
    },
    [align, panelWidth, shapeH, shapeW],
  )

  const sync = useCallback(
    (animated: boolean) => {
      const previous = { ...sizes.current }
      measure()
      const next = sizes.current
      const changed =
        next.trigger !== previous.trigger ||
        next.lid !== previous.lid ||
        (live.current.open && (next.listH !== previous.listH || next.listW !== previous.listW))
      // 容器被拖动改宽（ResizablePanel）时形状必须瞬时贴合，弹簧会让它和字段错开半格；
      // 只有容器没动、是标签自己变长了，才交给宽度弹簧
      if (changed || !live.current.measured) place(animated && previous.box === next.box)
    },
    [measure, place],
  )

  useLayoutEffect(() => {
    sync(false)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => sync(true))
    if (measureRef.current) observer.observe(measureRef.current)
    if (faceRef.current) observer.observe(faceRef.current)
    // 选项文字变长时列表内容宽度会变，而列表面本身是 min-w-full（跟着形状走），
    // 只观察它测不到，所以连内容层一起观察
    if (listRef.current) observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [sync])

  useLayoutEffect(() => {
    if (live.current.open === open) return
    live.current.open = open
    // 选中项会在同一次 commit 里既改标签又关面板，所以两面都要重读再动形状
    measure()
    place(true)
  }, [measure, open, place])

  /* 高亮在自己的弹簧上滑到目标行，没有活动项时淡出 */
  const hy = useMotionValue(0)
  const hh = useMotionValue(0)
  const ho = useMotionValue(0)
  const scrollIntent = useRef(false)
  useLayoutEffect(() => {
    const node = open && current !== null ? optionRefs.current.get(current) : undefined
    if (!node) {
      animate(ho, 0, { duration: reduced || !open ? 0 : duration.quick, ease: STANDARD })
      return
    }
    const top = node.offsetTop
    const height = node.offsetHeight
    if (ho.get() < 0.05 || reduced) {
      hy.jump(top)
      hh.jump(height)
    } else {
      animate(hy, top, GLIDE)
      animate(hh, height, GLIDE)
    }
    animate(ho, 1, { duration: reduced ? 0 : duration.quick, ease: ENTER })
    const scroller = scrollRef.current
    if (scroller && scrollIntent.current) {
      scrollIntent.current = false
      if (top < scroller.scrollTop + 6) scroller.scrollTop = top - 6
      else if (top + height > scroller.scrollTop + scroller.clientHeight - 6)
        scroller.scrollTop = top + height - scroller.clientHeight + 6
    }
  }, [current, hh, ho, hy, open, reduced, visibleSections])

  /* 焦点落在 lid 上：可搜索时是搜索框，否则是留着活动项的触发器 */
  const pendingFocus = useRef<'trigger' | 'input' | null>(null)
  useLayoutEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (target === 'input') inputRef.current?.focus({ preventScroll: true })
    if (target === 'trigger') triggerRef.current?.focus({ preventScroll: true })
  }, [open])

  const typeahead = useRef({ buffer: '', at: 0 })
  /** 空格在 keydown 上就完成展开与选中，button 在 keyup 补发的那次 click 不能把它撤销 */
  const suppressClick = useRef(false)
  const [announcement, setAnnouncement] = useState('')

  /**
   * 展开前定锚。列表常驻 DOM（收起时被 overflow 裁掉），所以内容高度可量——
   * 取未被上限压过的 scrollHeight，才不会读到上一次收紧后的值。
   * 下面放不下就改成向上长；两头都放不下时挑宽裕的一头，并把上限收到可用高度，
   * 让列表自己出滚动条，而不是把展开面顶出容器。
   */
  const aim = () => {
    const shape = shapeRef.current
    const scroller = scrollRef.current
    if (!shape || !scroller) return
    // 收起态下先量一次：宽度的参考值必须来自形状还是触发器大小时的那一帧
    measure()
    const rect = shape.getBoundingClientRect()
    const box = clipRect(shape)
    const natural = Math.min(scroller.scrollHeight, maxListHeight)
    const below = box.bottom - rect.bottom - GAP
    const above = rect.top - box.top - GAP
    const next: Placement = below >= natural || below >= above ? 'below' : 'above'
    setPlacement(next)
    setListMax(Math.max(MIN_LIST, Math.min(maxListHeight, next === 'below' ? below : above)))
  }

  const openList = (focus?: string | null, seed = '') => {
    if (disabled || open) return
    aim()
    setQuery(seed)
    setActive(focus !== undefined ? focus : selected)
    scrollIntent.current = true
    pendingFocus.current = canSearch ? 'input' : 'trigger'
    setAnnouncement('')
    setOpen(true)
  }

  const close = useCallback((restoreFocus: boolean) => {
    typeahead.current.buffer = ''
    if (restoreFocus) pendingFocus.current = 'trigger'
    setOpen(false)
  }, [])

  const commit = (option: MorphSelectOption | undefined, source?: HTMLElement | null) => {
    if (!option || option.disabled) return
    if (option.value !== selected) {
      let fly: Change['fly'] = null
      const slot = slotRef.current
      const part = source?.querySelector<HTMLElement>("[data-part='value']")
      if (!reduced && part && slot) {
        const from = part.getBoundingClientRect()
        const to = slot.getBoundingClientRect()
        fly = { x: from.left - to.left, y: from.top + from.height / 2 - (to.top + to.height / 2) }
      }
      const from = selected === null ? -1 : (indexOf.get(selected) ?? -1)
      const to = indexOf.get(option.value) ?? 0
      setChange((last) => ({
        key: last.key + 1,
        value: option.value,
        dir: from < 0 ? 1 : Math.sign(to - from) || 1,
        fly,
      }))
      if (value === undefined) setInner(option.value)
      onValueChange?.(option.value, option)
    }
    close(true)
  }

  const typeTo = (char: string) => {
    const now = performance.now()
    const state = typeahead.current
    state.buffer = now - state.at > TYPEAHEAD_RESET ? char : state.buffer + char
    state.at = now
    const buffer = state.buffer.toLowerCase()
    const repeated = buffer.split('').every((letter) => letter === buffer[0])
    const search = repeated ? buffer.charAt(0) : buffer
    const pool = all.filter((option) => !option.disabled)
    const from = open ? current : selected
    const at = pool.findIndex((option) => option.value === from)
    const offset = repeated || buffer.length === 1 ? 1 : 0
    const ordered = [...pool.slice(at + offset), ...pool.slice(0, at + offset)]
    return ordered.find((option) => option.label.toLowerCase().startsWith(search))
  }

  const move = (to: string | null | undefined) => {
    if (to === undefined || to === null) return
    scrollIntent.current = true
    setActive(to)
  }

  const onKey = (event: ReactKeyboardEvent<HTMLElement>, fromInput: boolean) => {
    const { key } = event
    if (key === ' ' && !fromInput) suppressClick.current = true
    const printable = key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
    const typing =
      performance.now() - typeahead.current.at < TYPEAHEAD_RESET &&
      typeahead.current.buffer.length > 0

    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || (key === ' ' && !typing)) {
        event.preventDefault()
        openList()
        return
      }
      if (key === 'Home' || key === 'End') {
        event.preventDefault()
        const pool = all.filter((option) => !option.disabled)
        openList((key === 'Home' ? pool[0] : pool[pool.length - 1])?.value ?? null)
        return
      }
      if (printable) {
        event.preventDefault()
        if (canSearch) openList(undefined, key)
        else {
          const hit = typeTo(key)
          openList(hit?.value ?? selected)
        }
      }
      return
    }

    const at = enabled.findIndex((option) => option.value === current)
    const caretKeys = fromInput && query.length > 0
    switch (key) {
      case 'ArrowDown':
        event.preventDefault()
        move(enabled[Math.min(enabled.length - 1, at + 1)]?.value)
        return
      case 'ArrowUp':
        event.preventDefault()
        if (event.altKey) {
          commit(enabled[at], optionRefs.current.get(current ?? ''))
          return
        }
        move(enabled[Math.max(0, at - 1)]?.value)
        return
      case 'PageDown':
        event.preventDefault()
        move(enabled[Math.min(enabled.length - 1, at + PAGE)]?.value)
        return
      case 'PageUp':
        event.preventDefault()
        move(enabled[Math.max(0, at - PAGE)]?.value)
        return
      case 'Home':
        if (caretKeys) return
        event.preventDefault()
        move(enabled[0]?.value)
        return
      case 'End':
        if (caretKeys) return
        event.preventDefault()
        move(enabled[enabled.length - 1]?.value)
        return
      case 'Enter':
        event.preventDefault()
        commit(enabled[at], optionRefs.current.get(current ?? ''))
        return
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close(true)
        return
      case 'Tab':
        close(false)
        return
    }
    if (fromInput) return
    if (key === ' ' && !typing) {
      event.preventDefault()
      commit(enabled[at], optionRefs.current.get(current ?? ''))
      return
    }
    if (printable) {
      event.preventDefault()
      move(typeTo(key)?.value)
    }
  }

  // 外沿按下或焦点离开控件，列表就折回触发器
  useEffect(() => {
    if (!open) return
    const down = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [close, open])

  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null
    if (open && next && !event.currentTarget.contains(next)) close(false)
  }

  const onQuery = (next: string) => {
    setQuery(next)
    setActive(null)
    scrollIntent.current = true
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    const text = next.trim().toLowerCase()
    const count = text ? all.filter((option) => matches(option, text)).length : all.length
    setAnnouncement(
      text ? (count ? t('select.optionCount', { total: count }) : t('select.noResults')) : '',
    )
  }

  const renderValue = (option: MorphSelectOption | undefined) => (
    <span className="flex min-w-0 items-center gap-1.5">
      {option?.icon && (
        <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
          {option.icon}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 truncate',
          !option && 'text-muted-foreground',
          size === 'sm' && 'text-xs',
        )}
      >
        {option ? option.label : (placeholder ?? t('select.placeholder'))}
      </span>
    </span>
  )

  const showSearch = open && canSearch
  const layerKey = selected ?? '__empty'
  const changeForLayer: Change = change.value === selected ? change : { ...change, fly: null }
  const rootStyle = {
    '--ms-list-max': `${listMax}px`,
    // 圆角用的是 CSS 过渡，曲线仍要从同一套令牌取，免得组件里出现第二条缓动曲线
    '--ms-ease': `cubic-bezier(${ENTER.join(',')})`,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-flex min-w-0 flex-col', className)}
      style={rootStyle}
      data-open={open || undefined}
      onBlur={onBlur}
    >
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-muted-foreground mb-1.5 text-xs'}>
        {label}
      </span>

      <div className="relative flex min-w-0">
        {/* 闭合态的尺寸来源：装着当前标签与箭头的隐形幽灵，宽度弹簧在任何东西动之前就有目标 */}
        <span
          ref={measureRef}
          aria-hidden="true"
          className={cn(
            SHELL,
            LID_SIZE[size],
            'border-input invisible w-full rounded-lg border',
            disabled && 'cursor-not-allowed',
          )}
        >
          {renderValue(selectedOption)}
          <ChevronDown size={16} strokeWidth={1.75} className="ml-auto shrink-0" />
        </span>

        {/* 展开面：闭合时是输入框的皮，展开时换成浮层的皮。border 两态都在（展开只把它改透明），
            否则 1px 的增减会让面在开合瞬间跳一下 */}
        <motion.div
          ref={shapeRef}
          className={cn(
            'has-[:focus-visible]:ring-ring/50 absolute flex min-w-0 flex-col overflow-hidden border transition-[background-color,border-color,box-shadow,border-radius] duration-300 ease-[var(--ms-ease)] has-[:focus-visible]:ring-2',
            // 只在展开时抬层级：闭合的面若也压高，会罩住后面字段的触发器
            open ? 'z-50' : 'z-30',
            placement === 'below' ? 'top-0 justify-start' : 'bottom-0 justify-end',
            align === 'start' ? 'left-0' : 'right-0',
            open
              ? 'bg-popover text-popover-foreground ring-foreground/10 rounded-2xl border-transparent shadow-md ring-1'
              : 'border-input dark:bg-input/30 rounded-lg bg-transparent',
          )}
          style={{ width: shapeW, height: shapeH }}
        >
          <div className={cn(SHELL, LID_SIZE[size], 'relative min-w-0 shrink-0 rounded-lg')}>
            <button
              ref={triggerRef}
              id={triggerId}
              type="button"
              className={cn(
                'flex min-w-0 flex-1 items-center gap-1.5 rounded-none border-0 bg-transparent p-0 text-left outline-none select-none',
                disabled && 'cursor-not-allowed opacity-50',
              )}
              role="combobox"
              aria-labelledby={labelId}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={
                open && !canSearch && current !== null
                  ? optionId(indexOf.get(current) ?? 0)
                  : undefined
              }
              disabled={disabled}
              inert={showSearch || undefined}
              tabIndex={showSearch ? -1 : 0}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                if (open) close(true)
                else openList()
              }}
              onKeyDown={(event) => onKey(event, false)}
              onKeyUp={(event) => {
                if (event.key === ' ') window.setTimeout(() => void (suppressClick.current = false))
              }}
            >
              <span
                ref={slotRef}
                className={cn('flex min-w-0 flex-1 items-center', showSearch && 'invisible')}
              >
                <AnimatePresence initial={false} custom={changeForLayer}>
                  <motion.span
                    key={layerKey}
                    className="flex min-w-0 items-center"
                    custom={changeForLayer}
                    variants={reduced ? valueFade : valueVariants}
                    initial="enter"
                    animate="rest"
                    exit="exit"
                    transition={
                      reduced
                        ? { duration: duration.quick }
                        : changeForLayer.fly
                          ? { x: FLY, y: FLY, opacity: { duration: 0 } }
                          : {
                              y: GLIDE,
                              opacity: { duration: duration.base, ease: ENTER },
                              filter: { duration: duration.base, ease: ENTER },
                            }
                    }
                  >
                    {renderValue(selectedOption)}
                  </motion.span>
                </AnimatePresence>
              </span>
              {/* 箭头必须在按钮内：放在外面它只是行容器的装饰，点上去什么也不会发生 */}
              <motion.span
                className="text-muted-foreground flex shrink-0"
                aria-hidden="true"
                initial={false}
                animate={{ rotate: open ? 180 : 0 }}
                transition={reduced ? { duration: 0 } : GLIDE}
              >
                <ChevronDown size={16} strokeWidth={1.75} />
              </motion.span>
            </button>

            {canSearch && (
              <motion.div
                className="absolute inset-y-0 right-11 left-0 flex items-center gap-1.5 pl-2.5"
                inert={!showSearch || undefined}
                onPointerDown={(event) => {
                  // 点在搜索框两侧的空档等于点箭头：折回触发器
                  if (event.target === event.currentTarget) close(true)
                }}
                initial={false}
                animate={
                  showSearch
                    ? { opacity: 1, filter: 'blur(0px)' }
                    : { opacity: 0, filter: reduced ? 'blur(0px)' : `blur(${blur.subtle}px)` }
                }
                transition={
                  showSearch
                    ? { duration: duration.base, ease: ENTER, delay: reduced ? 0 : REVEAL_DELAY }
                    : { duration: duration.quick, ease: STANDARD }
                }
              >
                <Search
                  className="text-muted-foreground pointer-events-none size-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  className={cn(
                    'placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none',
                    VALUE_TEXT[size],
                  )}
                  type="text"
                  role="combobox"
                  aria-label={t('select.searchAria', { label })}
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    open && current !== null ? optionId(indexOf.get(current) ?? 0) : undefined
                  }
                  placeholder={selectedOption?.label ?? t('select.searchPlaceholder')}
                  value={query}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => onQuery(event.target.value)}
                  onKeyDown={(event) => onKey(event, true)}
                />
                <AnimatePresence initial={false}>
                  {query && (
                    <motion.button
                      key="clear"
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center"
                      aria-label={t('select.clearSearch')}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onQuery('')
                        inputRef.current?.focus()
                      }}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6, transition: { duration: duration.quick } }}
                      transition={reduced ? { duration: 0 } : GLIDE}
                    >
                      <X size={14} strokeWidth={1.75} aria-hidden="true" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>

          {/* shrink-0 让列表高度只跟随内容：形状在弹的过程中裁它，而不是把它压扁 */}
          <motion.div
            ref={faceRef}
            className={cn('min-w-full shrink-0', placement === 'above' && 'order-first')}
            inert={!open || undefined}
            aria-hidden={!open || undefined}
            initial={false}
            animate={
              open
                ? { opacity: 1, filter: 'blur(0px)' }
                : { opacity: 0, filter: reduced ? 'blur(0px)' : `blur(${blur.subtle}px)` }
            }
            transition={
              open
                ? {
                    opacity: {
                      duration: duration.base,
                      ease: ENTER,
                      delay: reduced ? 0 : REVEAL_DELAY,
                    },
                    filter: { duration: duration.base, ease: ENTER, delay: REVEAL_DELAY },
                  }
                : { duration: duration.quick, ease: STANDARD }
            }
          >
            <div
              ref={scrollRef}
              className="inset-scrollbar overflow-x-hidden overflow-y-auto p-1"
              style={{ maxHeight: 'var(--ms-list-max)' }}
            >
              <div
                ref={listRef}
                id={listId}
                className="relative flex w-max min-w-full flex-col gap-0.5"
                role="listbox"
                aria-labelledby={labelId}
              >
                <motion.span
                  className="bg-accent absolute inset-x-0 rounded-md"
                  style={{ y: hy, height: hh, opacity: ho }}
                  aria-hidden="true"
                />
                {visibleSections.map((section) => {
                  const rows = section.options.map((option) => {
                    const index = indexOf.get(option.value) ?? 0
                    const isSelected = option.value === selected
                    const isActive = option.value === current
                    return (
                      <div
                        key={option.value}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        data-active={isActive || undefined}
                        className={cn(
                          'relative flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm',
                          VALUE_TEXT[size],
                          isActive && 'text-accent-foreground',
                          option.disabled && 'pointer-events-none opacity-50',
                        )}
                        ref={(node) => {
                          if (node) optionRefs.current.set(option.value, node)
                          else optionRefs.current.delete(option.value)
                        }}
                        onPointerMove={(event) => {
                          if (
                            event.pointerType === 'mouse' &&
                            !option.disabled &&
                            option.value !== current
                          )
                            setActive(option.value)
                        }}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={(event) => commit(option, event.currentTarget)}
                      >
                        <span
                          className="flex min-w-0 flex-1 items-center gap-1.5"
                          data-part="value"
                        >
                          {option.icon && (
                            <span
                              className="flex size-5 shrink-0 items-center justify-center"
                              aria-hidden="true"
                            >
                              {option.icon}
                            </span>
                          )}
                          <span className="min-w-0 truncate">{option.label}</span>
                        </span>
                        {option.meta && (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {option.meta}
                          </span>
                        )}
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {isSelected && <Check size={16} strokeWidth={1.75} />}
                        </span>
                      </div>
                    )
                  })
                  return section.label ? (
                    <div
                      key={section.key}
                      role="group"
                      aria-labelledby={`${uid}-${section.key}`}
                      className="flex flex-col"
                    >
                      <div
                        id={`${uid}-${section.key}`}
                        className="text-muted-foreground px-1.5 pt-1.5 pb-1 text-xs"
                        role="presentation"
                      >
                        {section.label}
                      </div>
                      {rows}
                    </div>
                  ) : (
                    <div key={section.key} role="presentation" className="flex flex-col">
                      {rows}
                    </div>
                  )
                })}
                {resultCount === 0 && (
                  <p className="text-muted-foreground px-1.5 py-2 text-xs">
                    {t('select.noMatch', { query: query.trim() })}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
