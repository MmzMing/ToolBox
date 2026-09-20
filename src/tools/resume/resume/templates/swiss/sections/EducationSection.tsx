import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import type { Education, GlobalSettings } from '../../../types'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import { hasMeaningfulRichTextContent, normalizeRichTextContent } from '../../../rich-text'
import { formatDisplayDateRange as formatDateRange } from '../../../resume.service'

interface EducationSectionProps {
  education?: Education[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const EducationSection = ({
  education,
  globalSettings,
  showTitle = true,
}: EducationSectionProps) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleEducation = education?.filter((edu) => edu.visible)
  const centerSubtitle = globalSettings?.centerSubtitle
  const themeColor = globalSettings?.themeColor || '#E31C24'

  return (
    <SectionWrapper
      sectionId="education"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="education" globalSettings={globalSettings} showTitle={showTitle} />
      <AnimatePresence mode="popLayout">
        <div
          className="flex flex-col gap-6"
          style={{ marginTop: `${globalSettings?.paragraphSpacing || 16}px` }}
        >
          {visibleEducation?.map((edu) => (
            <motion.div key={edu.id} layout="position" className="group">
              {/* 不对称网格对齐头部 */}
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4
                    className="font-extrabold tracking-tight text-slate-800"
                    style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                  >
                    {edu.school}
                  </h4>
                  {centerSubtitle && (
                    <span
                      className="border-l border-slate-300 pl-3 text-[14px] font-medium text-slate-500"
                      style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 1}px` }}
                    >
                      {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                      {edu.gpa && ` · GPA ${edu.gpa}`}
                    </span>
                  )}
                </div>
                <div
                  className="ml-auto shrink-0 self-center rounded border border-slate-100/80 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-400"
                  suppressHydrationWarning
                >
                  {formatDateRange(edu.startDate, edu.endDate, locale)}
                </div>
              </div>

              {/* 非居中模式下的专业学历展示 */}
              {!centerSubtitle && (
                <div
                  className="mt-1 font-semibold tracking-wider text-slate-500 uppercase"
                  style={{ fontSize: `${(globalSettings?.subheaderSize || 16) - 2}px` }}
                >
                  {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                  {edu.gpa && ` · GPA ${edu.gpa}`}
                </div>
              )}

              {/* 教育描述 */}
              {hasMeaningfulRichTextContent(edu.description) && (
                <motion.div layout="position" className="relative mt-2.5 pl-4">
                  <div
                    className="absolute top-1 bottom-1 left-0 w-[1.5px] opacity-20 transition-opacity group-hover:opacity-100"
                    style={{ backgroundColor: themeColor }}
                  />
                  <div
                    className="prose prose-sm prose-p:my-1 max-w-none text-slate-600 marker:text-slate-400 [&>ul]:mt-1 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                    dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(edu.description) }}
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

export default EducationSection
