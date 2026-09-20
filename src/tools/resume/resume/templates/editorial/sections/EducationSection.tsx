import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Education, GlobalSettings } from '../../../types'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import { normalizeRichTextContent } from '../../../rich-text'
import { formatDisplayDateRange as formatDateRange } from '../../../resume.service'

interface EducationSectionProps {
  education?: Education[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const EducationSection: React.FC<EducationSectionProps> = ({
  education,
  globalSettings,
  showTitle = true,
}) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleEducation = education?.filter((edu) => edu.visible)
  const showTimeline = visibleEducation && visibleEducation.length > 2

  return (
    <SectionWrapper
      sectionId="education"
      className="w-full"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 32}px` }}
    >
      <SectionTitle type="education" globalSettings={globalSettings} showTitle={showTitle} />
      <AnimatePresence mode="popLayout">
        {visibleEducation?.map((edu) => (
          <motion.div
            key={edu.id}
            layout="position"
            className={cn(
              'relative pb-6 last:border-0 last:pb-0',
              showTimeline ? 'border-l-[1.5px] border-[#e5e7eb] pl-5' : '',
            )}
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            {showTimeline && (
              <div className="absolute top-2.5 left-[-2.25px] h-1.5 w-1.5 rounded-full bg-black" />
            )}

            <motion.h4
              layout="position"
              className="font-bold text-black"
              style={{ fontSize: `${globalSettings?.subheaderSize || 18}px`, lineHeight: '1.2' }}
            >
              {edu.school}
            </motion.h4>

            <motion.div
              layout="position"
              className="mt-2 tracking-[0.1em] text-gray-500 uppercase"
              style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
            >
              {[edu.degree, edu.major].filter(Boolean).join(' in ')}
              {edu.degree || edu.major ? ' • ' : ''}
              {formatDateRange(edu.startDate, edu.endDate, locale)}
              {edu.gpa && ` • GPA: ${edu.gpa}`}
            </motion.div>

            {edu.description && (
              <motion.div
                layout="position"
                className="prose prose-sm prose-p:my-1 mt-2 max-w-none text-gray-800 marker:text-black [&>ul]:mt-0 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                style={{
                  fontSize: `${globalSettings?.baseFontSize || 13}px`,
                  lineHeight: globalSettings?.lineHeight || 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(edu.description) }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </SectionWrapper>
  )
}

export default EducationSection
