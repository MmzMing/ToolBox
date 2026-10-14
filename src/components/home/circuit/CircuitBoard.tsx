import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { useBreakpoint } from '@/composable/use-breakpoint'
import { usePrefersReducedMotion } from '@/composable/use-prefers-reduced-motion'
import { tools } from '@/tools'
import { CATEGORY_PARAM, resolveCategoryParam } from '@/tools/categories'
import type { CategoryKey } from '@/tools/categories'

import { CategoryChip } from './CategoryChip'
import { ChipDetailOverlay, type ChipFlight } from './ChipDetailOverlay'
import { CircuitTraces } from './CircuitTraces'
import { CoreChip } from './CoreChip'
import { assignRoutes, flowFor, introOf, layoutOf } from './circuit-layout'

function toRect(rect: DOMRect): ChipFlight['origin'] {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * 首页首屏下半张的那块电路板：中央一颗主芯片坐在心口，
 * 九个分类芯片沿心形轮廓排开，平滑曲线把它们连到主芯片上并持续跑着电子。
 *
 * 版图按断点整张换（手机竖长的心 / 平板偏方 / PC 宽扁），
 * 心形由参数方程算出、每档各自调横纵半径，
 * 所以三种屏幕看到的是同一条轮廓的三种比例，不是同一张图缩放。
 * 芯片尺寸与字号一律走 cqw，跟着版图等比缩放。
 *
 * 入场时序见 introOf：核心先弹，分类芯片顺时针逐颗跟上，最后走线从核心画出去。
 */
export function CircuitBoard() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const breakpoint = useBreakpoint()
  const reduced = usePrefersReducedMotion()
  const layout = layoutOf(breakpoint)
  const intro = useMemo(() => introOf(layout), [layout])
  // assignRoutes 逐条对着 layout.slots 算，序号与 slots 一一对应，所以第 index 颗直接取第 index 条
  const routes = useMemo(() => assignRoutes(layout), [layout])
  const coreRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef(new Map<CategoryKey, HTMLButtonElement | null>())
  const [flight, setFlight] = useState<ChipFlight | null>(null)
  // 正被 hover / 键盘聚焦的分类：让对应那条走线的光束留在前景
  const [focus, setFocus] = useState<CategoryKey | null>(null)
  // 收起后要把焦点还给哪颗芯片：放 ref 而不是 state，onFinished 才能保持恒定引用
  const focusTarget = useRef<CategoryKey | null>(null)

  const handleActivate = (category: CategoryKey, element: HTMLElement) => {
    const core = coreRef.current
    if (core === null || flight !== null) {
      return
    }
    focusTarget.current = category
    setFlight({
      category,
      origin: toRect(element.getBoundingClientRect()),
      core: toRect(core.getBoundingClientRect()),
    })
  }

  const handleFinished = useCallback(() => {
    setFlight(null)
    const category = focusTarget.current
    focusTarget.current = null
    if (category !== null) {
      chipRefs.current.get(category)?.focus({ preventScroll: true })
    }
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  const queryCategory = useMemo(
    () => resolveCategoryParam(searchParams.get(CATEGORY_PARAM)),
    [searchParams],
  )
  // 记下挂载时刻：冷开分享链接时要等芯片入场完成，从页脚点进来则已经隔了很久，直接开。
  // 这个 effect 声明在下面的消费方之前，所以首帧就能读到已写入的时间戳。
  const mountedAt = useRef(0)
  useEffect(() => {
    mountedAt.current = performance.now()
  }, [])

  const openFromCategory = useCallback((category: CategoryKey) => {
    const core = coreRef.current
    if (core === null) {
      return
    }
    const coreRect = toRect(core.getBoundingClientRect())
    const chipRect = chipRefs.current.get(category)?.getBoundingClientRect()
    // 芯片不在视口里（页脚就在电路板下方）就让它从核心起飞，免得飞的那一拍什么都看不见
    const origin =
      chipRect !== undefined && chipRect.top >= 0 && chipRect.bottom <= window.innerHeight
        ? toRect(chipRect)
        : coreRect
    focusTarget.current = category
    setFlight((current) => current ?? { category, origin, core: coreRect })
  }, [])

  useEffect(() => {
    if (queryCategory === null) {
      return
    }
    const target = queryCategory
    const settleAt = reduced ? 0 : (intro.chip[target] + 0.35) * 1000
    const delay = Math.max(0, settleAt - (performance.now() - mountedAt.current))
    const timer = window.setTimeout(() => {
      openFromCategory(target)
      // 用完就抹掉：否则关掉浮层后再按后退，浮层会被这个参数重新弹开
      setSearchParams(
        (params) => {
          params.delete(CATEGORY_PARAM)
          return params
        },
        { replace: true },
      )
    }, delay)
    return () => window.clearTimeout(timer)
  }, [intro, openFromCategory, queryCategory, reduced, setSearchParams])

  return (
    <section data-tour="circuit" className="mt-6 md:mt-8" aria-label={t('circuit.ariaLabel')}>
      <div className="@container w-full">
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
        >
          <CircuitTraces layout={layout} focus={focus} />
          <CoreChip
            layout={layout}
            introDelay={intro.core}
            name={tCommon('siteName')}
            countCaption={t('circuit.coreCount', { total: tools.length })}
            charging={flight !== null}
            coreRef={coreRef}
          />
          {layout.slots.map((slot, index) => (
            <CategoryChip
              key={slot.category}
              layout={layout}
              slot={slot}
              label={tCategory(slot.category)}
              introDelay={intro.chip[slot.category]}
              driftDelay={index * 0.7}
              flow={flowFor(index)}
              entry={routes[index].entry}
              hollow={flight?.category === slot.category}
              dimmed={focus !== null && focus !== slot.category}
              onHover={setFocus}
              onActivate={handleActivate}
              chipRef={(element) => {
                chipRefs.current.set(slot.category, element)
              }}
            />
          ))}
        </div>
      </div>
      <p
        className="circuit-fade-in text-muted-foreground mt-4 text-center text-xs md:text-sm"
        style={{ '--circuit-in-delay': `${intro.flow}s` } as CSSProperties}
      >
        {t('circuit.hint')}
      </p>

      {flight !== null && <ChipDetailOverlay flight={flight} onFinished={handleFinished} />}
    </section>
  )
}
