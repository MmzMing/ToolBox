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
      className="w-full"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 32}px` }}
    >
      <SectionTitle type="selfEvaluation" globalSettings={globalSettings} showTitle={showTitle} />
      <motion.div style={{ marginTop: `${globalSettings?.paragraphSpacing}px` }}>
        <motion.div
          className="prose prose-sm prose-p:my-1 max-w-none text-gray-800 marker:text-black [&>ul]:mt-0 [&>ul]:pl-4 [&>ul>li]:my-0.5"
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
