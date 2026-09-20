import { v4 as uuidv4 } from 'uuid'
import { useTranslation } from 'react-i18next'

import { Field } from '../Field'
import { ItemPanel } from '../ItemPanel'
import { useResumeStore } from '../../store'
import type { Experience } from '../../types'

/** 工作经历：公司 / 职位 / 起止时间 / 描述（富文本） */
export function ExperiencePanel() {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)
  const updateExperienceBatch = useResumeStore((state) => state.updateExperienceBatch)

  if (!resume) {
    return null
  }

  return (
    <ItemPanel<Experience>
      items={resume.experience}
      onItemsChange={updateExperienceBatch}
      addLabel={t('resume.experience.add')}
      emptyLabel={t('resume.experience.empty')}
      onCreate={() => ({
        id: uuidv4(),
        company: '',
        position: '',
        date: '',
        details: '',
        visible: true,
      })}
      summary={(item) => [item.position, item.company].filter(Boolean).join(' · ')}
      editor={(item, patch) => (
        <div className="flex flex-col gap-3">
          <Field
            label={t('resume.experience.company')}
            value={item.company}
            onChange={(value) => patch({ company: value })}
          />
          <Field
            label={t('resume.experience.position')}
            value={item.position}
            onChange={(value) => patch({ position: value })}
          />
          <Field
            type="date-range"
            showPresentSwitch
            label={t('resume.experience.date')}
            value={item.date}
            onChange={(value) => patch({ date: value })}
          />
          <Field
            type="editor"
            label={t('resume.experience.details')}
            placeholder={t('resume.experience.detailsPlaceholder')}
            value={item.details}
            onChange={(value) => patch({ details: value })}
          />
        </div>
      )}
    />
  )
}
