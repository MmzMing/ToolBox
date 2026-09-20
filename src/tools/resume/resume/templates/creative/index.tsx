import React from 'react'
import type { ResumeData } from '../../types'
import type { ResumeTemplate } from '../../types'
import BaseInfo from './sections/BaseInfo'
import ExperienceSection from './sections/ExperienceSection'
import EducationSection from './sections/EducationSection'
import ProjectSection from './sections/ProjectSection'
import SkillSection from './sections/SkillSection'
import SelfEvaluationSection from './sections/SelfEvaluationSection'
import CustomSection from './sections/CustomSection'
import SectionTitle from './sections/SectionTitle'
import SectionWrapper from '../shared/SectionWrapper'
import CertificatesSection from '../shared/CertificatesSection'

interface CreativeTemplateProps {
  data: ResumeData
  template: ResumeTemplate
}

const CreativeTemplate: React.FC<CreativeTemplateProps> = ({ data, template }) => {
  const { colorScheme } = template
  const enabledSections = data.menuSections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)

  const basicSection = enabledSections.find((s) => s.id === 'basic')
  const otherSections = enabledSections.filter((s) => s.id !== 'basic')

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'experience':
        return (
          <ExperienceSection experiences={data.experience} globalSettings={data.globalSettings} />
        )
      case 'education':
        return <EducationSection education={data.education} globalSettings={data.globalSettings} />
      case 'skills':
        return <SkillSection skill={data.skillContent} globalSettings={data.globalSettings} />
      case 'projects':
        return <ProjectSection projects={data.projects} globalSettings={data.globalSettings} />
      case 'certificates':
        return (
          <SectionWrapper
            sectionId="certificates"
            style={{ marginTop: `${data.globalSettings?.sectionSpacing || 24}px` }}
          >
            <SectionTitle type="certificates" globalSettings={data.globalSettings} />
            <CertificatesSection certificates={data.certificates} />
          </SectionWrapper>
        )

      case 'selfEvaluation':
        return (
          <SelfEvaluationSection
            content={data.selfEvaluationContent}
            globalSettings={data.globalSettings}
          />
        )
      default:
        if (sectionId in data.customData) {
          const title = data.menuSections.find((s) => s.id === sectionId)?.title || sectionId
          return (
            <CustomSection
              title={title}
              sectionId={sectionId}
              items={data.customData[sectionId]}
              globalSettings={data.globalSettings}
            />
          )
        }
        return null
    }
  }

  return (
    <div
      className="flex min-h-full w-full flex-col"
      style={{ backgroundColor: colorScheme.background, color: colorScheme.text }}
    >
      {/* Top colored header block */}
      {basicSection && (
        <div
          className="relative w-full rounded-b-3xl px-4 py-8 pr-0"
          style={{ backgroundColor: data.globalSettings.themeColor, color: '#ffffff' }}
        >
          <div className="relative z-10 w-full">
            <BaseInfo basic={data.basic} globalSettings={data.globalSettings} template={template} />
          </div>
        </div>
      )}
      {/* Content sections */}
      <div className="w-max-4xl mx-auto w-full">
        {otherSections.map((section) => (
          <div key={section.id}>{renderSection(section.id)}</div>
        ))}
      </div>
    </div>
  )
}

export default CreativeTemplate
