import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useResumeStore } from '../store'
import { SectionHeader } from './SectionHeader'
import { BasicPanel } from './basic/BasicPanel'
import { CertificatesPanel } from './certificates/CertificatesPanel'
import { ExperiencePanel } from './experience/ExperiencePanel'
import {
  CustomSectionPanel,
  EducationPanel,
  ProjectPanel,
  RichContentPanel,
} from './panels/sections'

/** 中栏：按当前选中章节渲染对应表单 */
export function EditPanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)

  if (!resume) {
    return null
  }

  const { activeSection } = resume
  const section = resume.menuSections.find((item) => item.id === activeSection)
  const body = (() => {
    switch (activeSection) {
      case 'skills':
        return <RichContentPanel field="skillContent" placeholderKey="resume.skills.placeholder" />
      case 'selfEvaluation':
        return (
          <RichContentPanel
            field="selfEvaluationContent"
            placeholderKey="resume.selfEvaluation.placeholder"
          />
        )
      case 'experience':
        return <ExperiencePanel />
      case 'education':
        return <EducationPanel />
      case 'projects':
        return <ProjectPanel />
      case 'basic':
        return <BasicPanel />
      case 'certificates':
        return <CertificatesPanel />
      default:
        return activeSection.startsWith('custom') ? (
          <CustomSectionPanel sectionId={activeSection} />
        ) : (
          <p className="text-muted-foreground text-sm">{t('resume.editor.unknownSection')}</p>
        )
    }
  })()

  return (
    <div className="h-full overflow-y-auto p-4">
      <Card className="gap-0">
        <CardHeader className="border-b pt-4">
          <SectionHeader
            sectionId={activeSection}
            title={section?.title ?? ''}
            locked={activeSection === 'basic'}
          />
        </CardHeader>
        <CardContent className="p-4">{body}</CardContent>
      </Card>
    </div>
  )
}
