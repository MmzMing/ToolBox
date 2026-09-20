import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DEFAULT_FONT_FAMILY } from '../constants'
import { measureLineBottoms } from '../page-break'
import { a4ContentHeight, pageBreakOffsets, snapBreakOffsets } from '../resume.service'
import { useResumeStore } from '../store'
import { getTemplateForResume } from '../templates/registry'
import { TemplateSurface } from '../templates/TemplateSurface'
import { useAutoOnePage } from '../use-auto-one-page'

const MEASURE_THROTTLE_MS = 100

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
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [lineBottoms, setLineBottoms] = useState<number[]>([])

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

  return (
    <div
      className="bg-muted/40 relative h-full w-full overflow-auto"
      data-preview-scroll-container="true"
      style={{ fontFamily }}
    >
      <div className="from-background/40 flex min-h-full origin-top scale-[58%] justify-center bg-linear-to-br to-transparent p-4 md:origin-top-left md:scale-90">
        <div className="relative mx-auto min-h-[297mm] w-[210mm] min-w-[210mm] bg-white shadow-lg">
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
  )
}
