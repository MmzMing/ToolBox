import { motion } from 'motion/react'
import SectionTitle from './SectionTitle'
import SectionWrapper from '../../shared/SectionWrapper'
import type { GlobalSettings } from '../../../types'
import { normalizeRichTextContent } from '../../../rich-text'

interface SkillSectionProps {
  skill?: string
  globalSettings?: GlobalSettings
  showTitle?: boolean
}

const SkillSection = ({ skill, globalSettings, showTitle = true }: SkillSectionProps) => {
  return (
    <SectionWrapper
      sectionId="skills"
      style={{ marginTop: `${globalSettings?.sectionSpacing || 24}px` }}
    >
      <SectionTitle type="skills" globalSettings={globalSettings} showTitle={showTitle} />
      <motion.div style={{ marginTop: `${globalSettings?.paragraphSpacing || 16}px` }}>
        <motion.div
          className="prose prose-sm prose-p:my-1 prose-strong:font-bold prose-ul:my-1 prose-li:my-0.5 max-w-none rounded-xl border border-slate-100/50 bg-slate-50/50 p-4 text-slate-600 transition-colors marker:text-slate-400 hover:border-slate-200/60 [&>ul]:pl-4"
          layout="position"
          style={{
            fontSize: `${globalSettings?.baseFontSize || 13}px`,
            lineHeight: globalSettings?.lineHeight || 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(skill) }}
        />
      </motion.div>
    </SectionWrapper>
  )
}

export default SkillSection
