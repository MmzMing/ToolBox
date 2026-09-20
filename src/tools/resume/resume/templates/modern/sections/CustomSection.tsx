import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import type { GlobalSettings, CustomItem } from '../../../types'
import { normalizeRichTextContent } from '../../../rich-text'
import { cn } from '@/lib/utils'
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
  const flexLayout = globalSettings?.flexibleHeaderLayout

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
        {visibleItems.map((item) => (
          <motion.div
            key={item.id}
            layout="position"
            style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}
          >
            <motion.div layout="position" className="flex items-center justify-between gap-4">
              <div className={cn('flex items-center gap-2 truncate', flexLayout ? '' : 'flex-1')}>
                <h4
                  className="truncate font-bold"
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {item.title}
                </h4>
              </div>
              {centerSubtitle && (
                <motion.div
                  layout="position"
                  className={cn('text-paper-muted truncate', flexLayout ? 'ml-[16px]' : 'flex-1')}
                  style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
                >
                  {item.subtitle}
                </motion.div>
              )}
              <span
                className={cn(
                  'text-paper-muted shrink-0 whitespace-nowrap',
                  flexLayout ? 'ml-auto' : 'text-right',
                )}
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {formatDateString(item.dateRange, locale)}
              </span>
            </motion.div>
            {!centerSubtitle && item.subtitle && (
              <motion.div
                layout="position"
                className="text-paper-muted mt-1"
                style={{ fontSize: `${globalSettings?.subheaderSize || 16}px` }}
              >
                {item.subtitle}
              </motion.div>
            )}
            {item.description && (
              <motion.div
                layout="position"
                className="text-paper-ink mt-1"
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
