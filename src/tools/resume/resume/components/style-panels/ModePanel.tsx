import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import { useResumeStore } from '../../store'

/** 显示模式浮层：三个影响纸张排版的开关 */
export function ModePanel() {
  const { t } = useTranslation('tools-resume')
  const stored = useResumeStore((state) => state.activeResume?.globalSettings)
  const settings = stored ?? {}
  const updateGlobalSettings = useResumeStore((state) => state.updateGlobalSettings)

  return (
    <div className="flex flex-col gap-3">
      {(['useIconMode', 'centerSubtitle', 'flexibleHeaderLayout'] as const).map((key) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-sm">{t(`resume.sidePanel.mode.${key}.title`)}</Label>
            <p className="text-muted-foreground text-xs">
              {t(`resume.sidePanel.mode.${key}.hint`)}
            </p>
          </div>
          <Switch
            checked={Boolean(settings[key])}
            onCheckedChange={(checked) => updateGlobalSettings({ [key]: checked })}
          />
        </div>
      ))}
    </div>
  )
}
