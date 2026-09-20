import { useTranslation } from 'react-i18next'

import { PAGE_PADDING_RANGE, PARAGRAPH_SPACING_RANGE, SECTION_SPACING_RANGE } from '../../constants'
import { useResumeStore } from '../../store'
import { NumberField } from '../NumberField'
import { PanelShell } from './PanelShell'

/** 间距浮层：页边距、章节间距、段间距 */
export function SpacingPanel() {
  const { t } = useTranslation('tools-resume')
  const settings = useResumeStore((state) => state.activeResume?.globalSettings ?? {})
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)

  return (
    <PanelShell title={t('resume.sidePanel.spacing.title')}>
      <NumberField
        label={t('resume.sidePanel.spacing.pagePadding.title')}
        value={settings.pagePadding ?? 0}
        min={PAGE_PADDING_RANGE.min}
        max={PAGE_PADDING_RANGE.max}
        step={PAGE_PADDING_RANGE.step}
        onValueChange={(value) => updateGlobalSettings({ pagePadding: value })}
      />
      <NumberField
        label={t('resume.sidePanel.spacing.sectionSpacing.title')}
        value={settings.sectionSpacing ?? 0}
        min={SECTION_SPACING_RANGE.min}
        max={SECTION_SPACING_RANGE.max}
        step={SECTION_SPACING_RANGE.step}
        onValueChange={(value) => updateGlobalSettings({ sectionSpacing: value })}
      />
      <NumberField
        label={t('resume.sidePanel.spacing.paragraphSpacing.title')}
        value={settings.paragraphSpacing ?? 0}
        min={PARAGRAPH_SPACING_RANGE.min}
        max={PARAGRAPH_SPACING_RANGE.max}
        step={PARAGRAPH_SPACING_RANGE.step}
        onValueChange={(value) => updateGlobalSettings({ paragraphSpacing: value })}
      />
    </PanelShell>
  )
}
