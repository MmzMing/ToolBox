import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import type { GlobalSettings, CustomItem } from '../../../types'
import { normalizeRichTextContent } from '../../../rich-text'
import { formatDisplayDate as formatDateString } from '../../../resume.service'

interface CustomSectionProps {
  sectionId: string
  title: string
  items: CustomItem[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const CustomSection = ({
  sectionId,
  title,
  items,
  globalSettings,
  showTitle = true,
}: CustomSectionProps) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleItems = items?.filter((item) => item.visible && (item.title || item.description))
  const centerSubtitle = globalSettings?.centerSubtitle
  const themeColor = globalSettings?.themeColor || '#E31C24'

  return (
    <SectionWrapper
      sectionId={sectionId}
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle
        title={title}
        type="custom"
        globalSettings={globalSettings}
        showTitle={showTitle}
      />
      <AnimatePresence mode="popLayout">
        <div
          className="flex flex-col gap-6"
          style={{ marginTop: `${globalSettings?.paragraphSpacing || 16}px` }}
        >
          {visibleItems.map((item) => (
            <motion.div key={item.id} layout="position" className="group">
              {/* 不对称网格对齐头部 */}
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4
                    className="font-extrabold tracking-tight text-slate-800"
                    style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                  >
                    {item.title}
                  </h4>
                  {centerSubtitle && (
                    <span
                      className="border-l border-slate-300 pl-3 text-[14px] font-medium text-slate-500"
                      style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 1}px` }}
                    >
                      {item.subtitle}
                    </span>
                  )}
                </div>
                <div className="ml-auto shrink-0 self-center rounded border border-slate-100/80 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-400">
                  {formatDateString(item.dateRange, locale)}
                </div>
              </div>

              {/* 非居中模式下的副标题展示 */}
              {!centerSubtitle && item.subtitle && (
                <div
                  className="mt-1 font-semibold tracking-wider text-slate-500 uppercase"
                  style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 2}px` }}
                >
                  {item.subtitle}
                </div>
              )}

              {/* 自定义描述：移除 text-justify 修复列表小点拉伸 bug */}
              {item.description && (
                <motion.div layout="position" className="relative mt-2.5 pl-4">
                  <div
                    className="absolute top-1 bottom-1 left-0 w-[1.5px] opacity-20 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: themeColor }}
                  />
                  <div
                    className="prose prose-sm prose-p:my-1 max-w-none text-slate-600 marker:text-slate-400 [&>ul]:mt-1 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                    dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(item.description) }}
                    style={{
                      fontSize: `${globalSettings?.baseFontSize || 13}px`,
                      lineHeight: globalSettings?.lineHeight || 1.6,
                    }}
                  />
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </SectionWrapper>
  )
}

export default CustomSection
