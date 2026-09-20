import { motion } from 'motion/react'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import type { GlobalSettings } from '../../../types'
import { normalizeRichTextContent } from '../../../rich-text'

interface SelfEvaluationSectionProps {
  content?: string
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const SelfEvaluationSection = ({
  content,
  globalSettings,
  showTitle = true,
}: SelfEvaluationSectionProps) => {
  return (
    <SectionWrapper
      sectionId="selfEvaluation"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="selfEvaluation" globalSettings={globalSettings} showTitle={showTitle} />
      <motion.div style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}>
        <motion.div
          className="text-paper-ink"
          layout="position"
          style={{
            fontSize: `${globalSettings?.baseFontSize || 14}px`,
            lineHeight: globalSettings?.lineHeight || 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(content) }}
        />
      </motion.div>
    </SectionWrapper>
  )
}

export default SelfEvaluationSection
