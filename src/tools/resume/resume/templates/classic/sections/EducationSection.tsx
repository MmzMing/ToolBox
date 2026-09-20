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
  const flexLayout = globalSettings?.flexibleHeaderLayout

  return (
    <SectionWrapper
      sectionId="education"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="education" globalSettings={globalSettings} showTitle={showTitle} />
      <AnimatePresence mode="popLayout">
        {visibleEducation?.map((edu) => (
          <motion.div
            key={edu.id}
            layout="position"
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            <motion.div layout="position" className="flex items-center gap-2">
              <div
                className={`font-bold ${flexLayout ? '' : 'flex-[1.5]'}`}
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {edu.school}
              </div>
              {centerSubtitle && (
                <motion.div
                  layout="position"
                  className={`text-paper-muted ${flexLayout ? 'ml-[16px]' : 'flex-1'}`}
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                  {edu.gpa && ` · GPA ${edu.gpa}`}
                </motion.div>
              )}
              <span
                className={`text-paper-muted shrink-0 ${flexLayout ? 'ml-auto' : 'flex-1 text-right'}`}
                suppressHydrationWarning
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {formatDateRange(edu.startDate, edu.endDate, locale)}
              </span>
            </motion.div>
            {!centerSubtitle && (
              <motion.div
                layout="position"
                className="text-paper-muted mt-1"
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                {edu.gpa && ` · GPA ${edu.gpa}`}
              </motion.div>
            )}
            {hasMeaningfulRichTextContent(edu.description) && (
              <motion.div
                layout="position"
                className="text-paper-ink mt-1"
                style={{
                  fontSize: `${globalSettings?.baseFontSize || 14}px`,
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
