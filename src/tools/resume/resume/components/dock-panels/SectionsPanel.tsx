import { useTranslation } from 'react-i18next'

import { useResumeStore } from '../../store'
import { AddSectionButton } from '../AddSectionButton'
import { LayoutSetting } from '../layout/LayoutSetting'
import { PanelShell } from './PanelShell'

/** 章节浮层：排序 / 显隐 / 删除 / 添加。点条目切章节并收起浮层，其余操作不收起 */
export function SectionsPanel({ onSectionSelect }: { onSectionSelect: () => void }) {
  const { t } = useTranslation('tools-resume')
  const resume = useResumeStore((state) => state.activeResume)

  if (!resume) {
    return null
  }

  return (
    <PanelShell title={t('resume.sidePanel.layout.title')}>
      <LayoutSetting
        menuSections={resume.menuSections}
        activeSection={resume.activeSection}
        onSectionSelect={onSectionSelect}
      />
      <AddSectionButton />
    </PanelShell>
  )
}
