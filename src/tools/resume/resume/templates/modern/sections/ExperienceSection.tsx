import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { Experience, GlobalSettings } from '../../../types'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import { normalizeRichTextContent } from '../../../rich-text'
import { cn } from '@/lib/utils'
import { formatDisplayDate as formatDateString } from '../../../resume.service'

interface ExperienceSectionProps {
  experiences?: Experience[]
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const ExperienceSection: React.FC<ExperienceSectionProps> = ({
  experiences,
  globalSettings,
  showTitle = true,
}) => {
  const { i18n } = useTranslation('tools-resume')
  const locale = i18n.language
  const visibleExperiences = experiences?.filter((exp) => exp.visible)
  const centerSubtitle = globalSettings?.centerSubtitle
  const flexLayout = globalSettings?.flexibleHeaderLayout

  return (
    <SectionWrapper
      sectionId="experience"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="experience" globalSettings={globalSettings} showTitle={showTitle} />
      <AnimatePresence mode="popLayout">
        {visibleExperiences?.map((exp) => (
          <motion.div
            key={exp.id}
            layout="position"
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            <motion.div className="flex items-center justify-between gap-4">
              <div
                className={cn('truncate font-bold', flexLayout ? '' : 'flex-1')}
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {exp.company}
              </div>
              {centerSubtitle && (
                <motion.div
                  className={cn('text-paper-muted truncate', flexLayout ? 'ml-[16px]' : 'flex-1')}
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {exp.position}
                </motion.div>
              )}
              <div
                className={cn(
                  'text-paper-muted shrink-0 whitespace-nowrap',
                  flexLayout ? 'ml-auto' : 'text-right',
                )}
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {formatDateString(exp.date, locale)}
              </div>
            </motion.div>
            {exp.position && !centerSubtitle && (
              <motion.div
                className="text-paper-muted"
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {exp.position}
              </motion.div>
            )}
            {exp.details && (
              <motion.div
                className="text-paper-ink mt-1"
                dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(exp.details) }}
                style={{
                  fontSize: `${globalSettings?.baseFontSize || 14}px`,
                  lineHeight: globalSettings?.lineHeight || 1.6,
                }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </SectionWrapper>
  )
}

export default ExperienceSection
