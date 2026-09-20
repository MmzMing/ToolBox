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

  return (
    <SectionWrapper
      sectionId={sectionId}
      className="w-full"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 32}px` }}
    >
      <SectionTitle
        title={title}
        type="custom"
        globalSettings={globalSettings}
        showTitle={showTitle}
      />
      <AnimatePresence mode="popLayout">
        {visibleItems.map((item) => (
          <motion.div
            key={item.id}
            layout="position"
            className="relative pb-6 last:pb-0"
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            <motion.div layout="position" className="flex items-center gap-2">
              <div className="flex-[1.5]">
                <h4
                  className="font-bold text-black"
                  style={{ fontSize: `${globalSettings?.subheaderSize || 18}px` }}
                >
                  {item.title}
                </h4>
              </div>
              {item.subtitle && (
                <motion.div
                  layout="position"
                  className="flex-1 text-gray-500"
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {item.subtitle}
                </motion.div>
              )}
              <span
                className="flex-1 shrink-0 text-right text-gray-500"
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {formatDateString(item.dateRange, locale)}
              </span>
            </motion.div>
            {item.description && (
              <motion.div
                layout="position"
                className="prose prose-sm prose-p:my-1 mt-2 max-w-none text-gray-800 marker:text-black [&>ul]:mt-0 [&>ul]:pl-4 [&>ul>li]:my-0.5"
                style={{
                  fontSize: `${globalSettings?.baseFontSize || 14}px`,
                  lineHeight: globalSettings?.lineHeight || 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(item.description) }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </SectionWrapper>
  )
}

export default CustomSection
