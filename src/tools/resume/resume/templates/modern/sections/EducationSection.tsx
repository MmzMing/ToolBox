import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import type { Education, GlobalSettings } from '../../../types'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import { hasMeaningfulRichTextContent, normalizeRichTextContent } from '../../../rich-text'
import { cn } from '@/lib/utils'
import { formatDisplayDateRange as formatDateRange } from '../../../resume.service'

interface EducationSectionProps {
  education?: Education[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
  variant?: 'default' | 'sidebar'
}

const EducationSection = ({
  education,
  globalSettings,
  showTitle = true,
  variant = 'default',
}: EducationSectionProps) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleEducation = education?.filter((edu) => edu.visible)
  const centerSubtitle = globalSettings?.centerSubtitle
  const flexLayout = globalSettings?.flexibleHeaderLayout

  const isSidebar = variant === 'sidebar'

  return (
    <SectionWrapper
      sectionId="education"
      style={{ marginTop: isSidebar ? 0 : `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle
        type="education"
        globalSettings={globalSettings}
        showTitle={showTitle}
        variant={variant}
      />
      <AnimatePresence mode="popLayout">
        {visibleEducation?.map((edu) => (
          <motion.div
            key={edu.id}
            layout="position"
            style={{ marginTop: isSidebar ? '12px' : `${globalSettings?.paragraphSpacing}px` }}
          >
            <div
              className={cn(
                'flex items-center justify-between gap-4',
                isSidebar && 'flex-col items-start gap-1',
              )}
            >
              <div
                className={cn('truncate font-bold', !flexLayout && !isSidebar && 'flex-1')}
                style={{
                  fontSize: `${isSidebar ? (globalSettings?.baseFontSize || 14) + 2 : globalSettings?.subheaderSize || 16}px`,
                  color: isSidebar ? '#fff' : 'inherit',
                }}
              >
                {edu.school}
              </div>
              {centerSubtitle && !isSidebar && (
                <motion.div
                  layout="position"
                  className={cn('text-paper-muted truncate', flexLayout ? 'ml-[16px]' : 'flex-1')}
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                  {edu.gpa && ` · GPA ${edu.gpa}`}
                </motion.div>
              )}
              <span
                className={cn(
                  'text-paper-muted shrink-0 whitespace-nowrap',
                  !flexLayout && !isSidebar && 'text-right',
                  isSidebar && 'opacity-80',
                )}
                suppressHydrationWarning
                style={{
                  fontSize: isSidebar ? '12px' : `${globalSettings?.subheaderSize || 16}px`,
                  color: isSidebar ? '#fff' : 'inherit',
                }}
              >
                {formatDateRange(edu.startDate, edu.endDate, locale)}
              </span>
            </div>
            {(!centerSubtitle || isSidebar) && (
              <div
                className={cn('text-paper-muted mt-0.5', isSidebar ? 'text-xs opacity-90' : 'mt-1')}
                style={{
                  fontSize: isSidebar ? '12px' : `${globalSettings?.subheaderSize || 16}px`,
                  color: isSidebar ? '#fff' : 'inherit',
                }}
              >
                {[edu.major, edu.degree].filter(Boolean).join(' · ')}
                {edu.gpa && ` · GPA ${edu.gpa}`}
              </div>
            )}
            {hasMeaningfulRichTextContent(edu.description) && (
              <motion.div
                layout="position"
                className={cn('text-paper-ink mt-1', isSidebar && 'opacity-80')}
                style={{
                  fontSize: `${isSidebar ? (globalSettings?.baseFontSize || 14) - 2 : globalSettings?.baseFontSize || 14}px`,
                  lineHeight: globalSettings?.lineHeight || 1.6,
                  color: isSidebar ? '#fff' : 'inherit',
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
