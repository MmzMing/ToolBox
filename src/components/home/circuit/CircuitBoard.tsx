import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBreakpoint } from '@/composable/use-breakpoint'
import { tools } from '@/tools'
import type { CategoryKey } from '@/tools/categories'

import { CategoryChip } from './CategoryChip'
import { ChipDetailOverlay, type ChipFlight } from './ChipDetailOverlay'
import { CircuitTraces } from './CircuitTraces'
import { CoreChip } from './CoreChip'
import { flowFor, layoutOf } from './circuit-layout'

function toRect(rect: DOMRect): ChipFlight['origin'] {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/**
 * 首页首屏下半张的那块电路板：中央一颗主芯片，九个分类芯片沿不规则轨道散落，
 * 走线把它们连到主芯片上并持续跑着电子。
 *
 * 版图按断点整张换（手机竖版 / 平板偏方 / PC 宽扁），坐标是各档独立手排的，
 * 所以三种屏幕看到的是三种排布，不是同一张图缩放。
 * 芯片尺寸与字号一律走 cqw，跟着版图等比缩放。
 */
export function CircuitBoard() {
  const { t } = useTranslation('home')
  const { t: tCommon } = useTranslation('common')
  const { t: tCategory } = useTranslation('categories')
  const breakpoint = useBreakpoint()
  const layout = layoutOf(breakpoint)
  const coreRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef(new Map<CategoryKey, HTMLButtonElement | null>())
  const [flight, setFlight] = useState<ChipFlight | null>(null)
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

  return (
    <section className="mt-12 md:mt-16" aria-label={t('circuit.ariaLabel')}>
      <div className="@container w-full">
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
        >
          <CircuitTraces layout={layout} />
          <CoreChip
            layout={layout}
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
              driftDelay={index * 0.7}
              flow={flowFor(index)}
              hollow={flight?.category === slot.category}
              onActivate={handleActivate}
              chipRef={(element) => {
                chipRefs.current.set(slot.category, element)
              }}
            />
          ))}
        </div>
      </div>
      <p className="text-muted-foreground mt-4 text-center text-xs md:text-sm">
        {t('circuit.hint')}
      </p>

      {flight !== null && <ChipDetailOverlay flight={flight} onFinished={handleFinished} />}
    </section>
  )
}
