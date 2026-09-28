import { useTranslation } from 'react-i18next'

import { Field } from '../Field'
import { ItemPanel } from '../ItemPanel'
import { useResumeStore } from '../../store'
import {
  createDefaultCustomItem,
  createDefaultEducation,
  createDefaultProject,
  joinDateRange,
  splitDateRange,
} from '../../resume.service'
import type { CustomItem, Education, Project } from '../../types'

const useActiveResume = () => useResumeStore((state) => state.activeResume)

/** 教育经历：学校 / 专业 / 学位 / 起止 / GPA / 描述 */
export function EducationPanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useActiveResume()
  const updateEducationBatch = useResumeStore((state) => state.updateEducationBatch)
  if (!resume) {
    return null
  }

  return (
    <ItemPanel<Education>
      items={resume.education}
      onItemsChange={updateEducationBatch}
      addLabel={t('resume.education.add')}
      emptyLabel={t('resume.education.empty')}
      onCreate={createDefaultEducation}
      summary={(item) => [item.school, item.major].filter(Boolean).join(' · ')}
      editor={(item, patch) => (
        <div className="flex flex-col gap-3">
          <Field
            label={t('resume.education.school')}
            value={item.school}
            onChange={(v) => patch({ school: v })}
          />
          <Field
            label={t('resume.education.major')}
            value={item.major}
            onChange={(v) => patch({ major: v })}
          />
          <Field
            label={t('resume.education.degree')}
            value={item.degree}
            onChange={(v) => patch({ degree: v })}
          />
          <Field
            type="date-range"
            showPresentSwitch
            label={t('resume.education.date')}
            value={joinDateRange(item.startDate, item.endDate)}
            onChange={(value) => {
              const { start, end } = splitDateRange(value)
              patch({ startDate: start, endDate: end })
            }}
          />
          <Field label="GPA" value={item.gpa ?? ''} onChange={(v) => patch({ gpa: v })} />
          <Field
            type="editor"
            label={t('resume.education.description')}
            value={item.description ?? ''}
            onChange={(v) => patch({ description: v })}
          />
        </div>
      )}
    />
  )
}

/** 项目经历：名称 / 角色 / 起止 / 描述 / 链接 */
export function ProjectPanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useActiveResume()
  const updateProjectsBatch = useResumeStore((state) => state.updateProjectsBatch)
  if (!resume) {
    return null
  }

  return (
    <ItemPanel<Project>
      items={resume.projects}
      onItemsChange={updateProjectsBatch}
      addLabel={t('resume.projects.add')}
      emptyLabel={t('resume.projects.empty')}
      onCreate={createDefaultProject}
      summary={(item) => [item.name, item.role].filter(Boolean).join(' · ')}
      editor={(item, patch) => (
        <div className="flex flex-col gap-3">
          <Field
            label={t('resume.projects.name')}
            value={item.name}
            onChange={(v) => patch({ name: v })}
          />
          <Field
            label={t('resume.projects.role')}
            value={item.role}
            onChange={(v) => patch({ role: v })}
          />
          <Field
            type="date-range"
            showPresentSwitch
            label={t('resume.projects.date')}
            value={item.date}
            onChange={(v) => patch({ date: v })}
          />
          <Field
            type="editor"
            label={t('resume.projects.description')}
            value={item.description}
            onChange={(v) => patch({ description: v })}
          />
          <Field
            label={t('resume.projects.link')}
            placeholder="https://"
            value={item.link ?? ''}
            onChange={(v) => patch({ link: v })}
          />
          <Field
            label={t('resume.projects.linkLabel')}
            value={item.linkLabel ?? ''}
            onChange={(v) => patch({ linkLabel: v })}
          />
        </div>
      )}
    />
  )
}

/** 单个富文本章节：专业技能与自我评价共用，只差存储字段 */
export function RichContentPanel({
  field,
  placeholderKey,
}: {
  field: 'skillContent' | 'selfEvaluationContent'
  placeholderKey: string
}) {
  const { t } = useTranslation('tools-resume')
  const resume = useActiveResume()
  const updateSkillContent = useResumeStore((state) => state.updateSkillContent)
  const updateSelfEvaluationContent = useResumeStore((state) => state.updateSelfEvaluationContent)
  if (!resume) {
    return null
  }

  const onChange = field === 'skillContent' ? updateSkillContent : updateSelfEvaluationContent

  return (
    <Field
      type="editor"
      placeholder={t(placeholderKey)}
      value={resume[field]}
      onChange={onChange}
    />
  )
}

/** 自定义章节：标题 / 副标题 / 时间 / 描述 */
export function CustomSectionPanel({ sectionId }: { sectionId: string }) {
  const { t } = useTranslation('tools-resume')
  const resume = useActiveResume()
  const updateCustomData = useResumeStore((state) => state.updateCustomData)
  if (!resume) {
    return null
  }

  return (
    <ItemPanel<CustomItem>
      items={resume.customData[sectionId] ?? []}
      onItemsChange={(items) => updateCustomData(sectionId, items)}
      addLabel={t('resume.custom.add')}
      emptyLabel={t('resume.custom.empty')}
      onCreate={() => createDefaultCustomItem('')}
      summary={(item) => [item.title, item.subtitle].filter(Boolean).join(' · ')}
      editor={(item, patch) => (
        <div className="flex flex-col gap-3">
          <Field
            label={t('resume.custom.title')}
            value={item.title}
            onChange={(v) => patch({ title: v })}
          />
          <Field
            label={t('resume.custom.subtitle')}
            value={item.subtitle}
            onChange={(v) => patch({ subtitle: v })}
          />
          <Field
            type="date-range"
            showPresentSwitch
            label={t('resume.custom.date')}
            value={item.dateRange}
            onChange={(v) => patch({ dateRange: v })}
          />
          <Field
            type="editor"
            label={t('resume.custom.description')}
            value={item.description}
            onChange={(v) => patch({ description: v })}
          />
        </div>
      )}
    />
  )
}
