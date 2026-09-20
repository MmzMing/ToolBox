import { useTranslation } from 'react-i18next'
import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Experience, GlobalSettings } from '../../../types'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import { normalizeRichTextContent } from '../../../rich-text'
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
  const showTimeline = visibleExperiences && visibleExperiences.length > 2

  return (
    <SectionWrapper
      sectionId="experience"
      className="w-full"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 32}px` }}
    >
      <SectionTitle type="experience" globalSettings={globalSettings} showTitle={showTitle} />
      <AnimatePresence mode="popLayout">
        {visibleExperiences?.map((exp) => (
          <motion.div
            key={exp.id}
            layout="position"
            className={cn(
              'relative pb-6 last:border-0 last:pb-0',
              showTimeline ? 'border-l-[1.5px] border-[#e5e7eb] pl-5' : '',
            )}
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            {/* Timeline Dot */}
            {showTimeline && (
              <div className="absolute top-2.5 left-[-2.25px] h-1.5 w-1.5 rounded-full bg-black" />
            )}

            {/* Title: Company as Priority */}
            <motion.h4
              layout="position"
              className="font-bold text-black"
              style={{ fontSize: `${globalSettings?.subheaderSize || 18}px`, lineHeight: '1.2' }}
            >
              {exp.company}
            </motion.h4>

            {/* Position & Date */}
            <motion.div
              layout="position"
              className="mt-2 tracking-[0.1em] text-gray-500 uppercase"
              style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
            >
              {exp.position ? (
                <span className="font-semibold text-black">{exp.position}</span>
              ) : null}
              {exp.position && ' • '}
              {formatDateString(exp.date, locale)}
            </motion.div>

            {/* Details */}
            {exp.details && (
              <motion.div
                layout="position"
                className="prose prose-sm prose-p:my-1 mt-2 max-w-none text-gray-800 marker:text-black [&>ul]:mt-2 [&>ul]:mb-0 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(exp.details) }}
                style={{
                  fontSize: `${globalSettings?.baseFontSize || 13}px`,
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
