import { ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useIsMobile } from '@/composable/use-breakpoint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { DEFAULT_FONT_FAMILY } from '../constants'
import { measureLineBottoms } from '../page-break'
import { a4ContentHeight, pageBreakOffsets, snapBreakOffsets } from '../resume.service'
import { useResumeStore } from '../store'
import { getTemplateForResume } from '../templates/registry'
import { TemplateSurface } from '../templates/TemplateSurface'
import { useAutoOnePage } from '../use-auto-one-page'

const MEASURE_THROTTLE_MS = 100
/** 缩放百分比：默认值就是原来的响应式大小——手机 58%，平板与 PC 90% */
const DEFAULT_PERCENT = { mobile: 58, wide: 90 } as const
const PERCENT_RANGE = { min: 40, max: 200, step: 10 } as const
/** 纸张测量前的兜底：A4 在 96dpi 下的自然尺寸 */
const A4_FALLBACK_SIZE = { width: 794, height: 1122.5 } as const

function sameNumbers(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * A4 纸张预览。
 *
 * `#resume-preview` 是导出与打印抓取的目标节点，因此它必须始终挂载——
 * 折叠预览栏时用 CSS 隐藏而不是卸载。
 */
export function PreviewPanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const setActiveSection = useResumeStore((state) => state.setActiveSection)
  const isMobile = useIsMobile()
  const contentRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [lineBottoms, setLineBottoms] = useState<number[]>([])
  const [percent, setPercent] = useState<number>(
    isMobile ? DEFAULT_PERCENT.mobile : DEFAULT_PERCENT.wide,
  )
  const [paperSize, setPaperSize] = useState<{ width: number; height: number }>(A4_FALLBACK_SIZE)

  // 换断点时回到该端的默认缩放；用渲染期比对 prev 完成，
  // 放进 effect 里 setState 会多推一轮渲染（React 官方的 adjusting-state 写法）
  const defaultPercent = isMobile ? DEFAULT_PERCENT.mobile : DEFAULT_PERCENT.wide
  const [lastDefaultPercent, setLastDefaultPercent] = useState(defaultPercent)
  if (lastDefaultPercent !== defaultPercent) {
    setLastDefaultPercent(defaultPercent)
    setPercent(defaultPercent)
  }

  // 纸张量的是布局尺寸（不受自身 transform 影响），缩放后的占位盒据此推算
  useEffect(() => {
    const node = paperRef.current
    if (!node) {
      return
    }
    const measure = () => {
      setPaperSize({ width: node.offsetWidth, height: node.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // MutationObserver 会在一次输入里连发多次，按时间片合并成一次测量
  const measure = () => {
    const node = contentRef.current
    if (!node) {
      return
    }

    const height = node.clientHeight
    if (height > 0) {
      setContentHeight((previous) => (height === previous ? previous : height))
    }

    // 参考线要落在真正的断页处：导出只会切在空白行上，
    // 所以这里量出每条文本行的底边，屏上看到的就是实际切刀位置
    const bottoms = measureLineBottoms(node)
    setLineBottoms((previous) => (sameNumbers(previous, bottoms) ? previous : bottoms))
  }

  useEffect(() => {
    const node = contentRef.current
    if (!node) {
      return
    }

    let lastRun = 0
    let frame = 0
    const schedule = () => {
      const now = Date.now()
      if (now - lastRun < MEASURE_THROTTLE_MS) {
        return
      }
      lastRun = now
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    const mutations = new MutationObserver(schedule)
    mutations.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    const resizes = new ResizeObserver(schedule)
    resizes.observe(node)
    measure()

    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      resizes.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!resume) {
      return
    }
    // 富文本与图片落地后行高会变，补测一次
    const timer = setTimeout(measure, 300)
    return () => clearTimeout(timer)
  }, [resume])

  const template = useMemo(() => getTemplateForResume(resume?.templateId), [resume?.templateId])

  const pagePadding = resume?.globalSettings.pagePadding ?? 0
  const { scaleFactor, isScaled, cannotFit } = useAutoOnePage({
    contentHeight,
    pagePadding,
    enabled: resume?.globalSettings.autoOnePage ?? false,
  })

  useEffect(() => {
    if (cannotFit) {
      toast.warning(t('resume.preview.autoOnePageCannotFit'), { duration: 4000 })
    }
  }, [cannotFit, t])

  const pageBreakLines = useMemo(() => {
    if (!resume || contentHeight <= 0 || !resume.globalSettings.pageBreakLinesVisible) {
      return []
    }
    // 已经缩到能放进一页就不必再画线
    if (isScaled && !cannotFit) {
      return []
    }

    const scale = isScaled ? scaleFactor : 1
    const perPage = a4ContentHeight(pagePadding) / scale

    return snapBreakOffsets(
      pageBreakOffsets(pagePadding, contentHeight, scale),
      lineBottoms,
      perPage * 0.66,
    )
  }, [contentHeight, lineBottoms, pagePadding, isScaled, cannotFit, scaleFactor, resume])

  if (!resume) {
    return null
  }

  const fontFamily = resume.globalSettings.fontFamily || DEFAULT_FONT_FAMILY
  const scale = percent / 100

  const stepPercent = (delta: number) =>
    setPercent((current) =>
      Math.min(PERCENT_RANGE.max, Math.max(PERCENT_RANGE.min, current + delta)),
    )

  return (
    <div className="group relative h-full w-full">
      <div
        className="bg-muted/40 h-full w-full overflow-auto"
        data-preview-scroll-container="true"
        style={{ fontFamily }}
      >
        <div className="from-background/40 flex min-h-full justify-center bg-linear-to-br to-transparent p-4">
          {/* 占位盒的布局尺寸＝缩放后的视觉尺寸：flex 的 my-auto 才能把纸真正居中，
              滚动范围也随缩放变化；纸张本体在原尺寸上 scale，保证内部排版不被改写 */}
          <div
            className="my-auto"
            style={{ width: paperSize.width * scale, height: paperSize.height * scale }}
          >
            <div
              ref={paperRef}
              className="relative min-h-[297mm] w-[210mm] min-w-[210mm] bg-white shadow-lg"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              <div
                ref={contentRef}
                id="resume-preview"
                className="resume-paper relative"
                style={{
                  padding: `${pagePadding}px`,
                  // 显式钉住纸色：不写就会从 body 继承语义令牌色，暗色主题下纸张变黑，
                  // 且 oklch 计算值会让光栅化解析失败
                  color: template.colorScheme.text,
                  background: template.colorScheme.background,
                  ...(isScaled
                    ? {
                        transform: `scale(${scaleFactor})`,
                        transformOrigin: 'top left',
                        width: `${100 / scaleFactor}%`,
                      }
                    : {}),
                }}
                onClickCapture={(event) => {
                  const section = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                    '[data-resume-section-id]',
                  )
                  const sectionId = section?.dataset.resumeSectionId
                  if (sectionId && sectionId !== resume.activeSection) {
                    setActiveSection(sectionId)
                  }
                }}
              >
                <TemplateSurface data={resume} template={template} />
                {pageBreakLines.map((top) => (
                  <div
                    key={top}
                    className="page-break-line pointer-events-none absolute right-0 left-0"
                    style={{ top: `${top}px` }}
                  >
                    <div className="absolute w-full border-t-2 border-dashed border-red-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 预览缩放：压在区域右上角，悬停（或键盘聚焦）才显形；触屏没有 hover，小屏常驻 */}
      <div className="bg-background/90 pointer-events-none absolute top-3 right-3 flex items-center gap-0.5 rounded-full border p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 max-md:pointer-events-auto max-md:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={percent <= PERCENT_RANGE.min}
          aria-label={t('resume.preview.zoomOut')}
          title={t('resume.preview.zoomOut')}
          onClick={() => stepPercent(-PERCENT_RANGE.step)}
        >
          <ZoomOut className="size-4" />
        </Button>
        <div className="flex items-center">
          <Input
            key={percent}
            type="number"
            inputMode="numeric"
            min={PERCENT_RANGE.min}
            max={PERCENT_RANGE.max}
            step={PERCENT_RANGE.step}
            defaultValue={percent}
            aria-label={t('resume.preview.zoomInput')}
            title={t('resume.preview.zoomInput')}
            className="no-spinner h-6 w-11 border-0 bg-transparent px-0 text-center text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
            onBlur={(event) => {
              const raw = event.currentTarget.value
              const value = Number(raw)
              if (raw === '' || !Number.isFinite(value)) {
                setPercent(percent)
                return
              }
              setPercent(
                Math.min(PERCENT_RANGE.max, Math.max(PERCENT_RANGE.min, Math.round(value))),
              )
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.value = String(percent)
              }
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.currentTarget.blur()
              }
            }}
          />
          <span className="text-muted-foreground pr-1 text-xs">%</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={percent >= PERCENT_RANGE.max}
          aria-label={t('resume.preview.zoomIn')}
          title={t('resume.preview.zoomIn')}
          onClick={() => stepPercent(PERCENT_RANGE.step)}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  )
}
